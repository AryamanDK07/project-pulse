import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isCoordinator } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEMBERS_JSON = `
  COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', u.user_id, 'full_name', u.full_name, 'email', u.email,
                    'member_role', tm.member_role, 'responsibility', tm.responsibility) ORDER BY tm.member_role, u.full_name)
              FROM team_members tm JOIN users u ON u.user_id = tm.user_id WHERE tm.team_id = t.team_id), '[]'::jsonb)`;

/* GET /api/teams
 *   student      -> own teams with members and the team's project (if any)
 *   coordinator  -> every team + lookup lists used by the admin forms */
export const GET = handler(async () => {
  const session = await requireSession();
  if (!isCoordinator(session)) {
    const { rows } = await pool.query(
      `SELECT t.team_id, t.name, c.course_id, c.code AS course_code, ${MEMBERS_JSON} AS members,
              p.project_id, p.title AS project_title, p.status AS project_status
         FROM teams t
         JOIN courses c ON c.course_id = t.course_id
         JOIN team_members me ON me.team_id = t.team_id AND me.user_id = $1
         LEFT JOIN projects p ON p.team_id = t.team_id
        ORDER BY t.team_id`, [session.userId]);
    return json({ teams: rows });
  }
  const [teams, courses, people, projects] = await Promise.all([
    pool.query(
      `SELECT t.team_id, t.name, c.course_id, c.code AS course_code, ${MEMBERS_JSON} AS members,
              p.project_id, p.title AS project_title, p.status AS project_status
         FROM teams t JOIN courses c ON c.course_id = t.course_id
         LEFT JOIN projects p ON p.team_id = t.team_id
        ORDER BY c.code, t.name`),
    pool.query('SELECT course_id, code, title, semester, academic_year FROM courses ORDER BY code'),
    pool.query(
      `SELECT u.user_id, u.full_name, u.email, u.enrollment_no, array_agg(r.role_name ORDER BY r.role_name) AS roles,
              (SELECT array_agg(tm.team_id) FROM team_members tm WHERE tm.user_id = u.user_id) AS team_ids
         FROM users u JOIN user_roles ur ON ur.user_id = u.user_id JOIN roles r ON r.role_id = ur.role_id
        WHERE u.is_active GROUP BY u.user_id ORDER BY u.full_name`),
    pool.query(
      `SELECT p.project_id, p.title, p.status, t.name AS team_name,
              (SELECT guide_id FROM guide_allocations WHERE project_id = p.project_id AND is_active AND allocation_role = 'guide') AS guide_id,
              (SELECT guide_id FROM guide_allocations WHERE project_id = p.project_id AND is_active AND allocation_role = 'reviewer') AS reviewer_id
         FROM projects p JOIN teams t ON t.team_id = p.team_id ORDER BY p.project_id`),
  ]);
  return json({ teams: teams.rows, courses: courses.rows, people: people.rows, projects: projects.rows });
});

/** A student may be in only one team per course (checked inside the transaction). */
async function assertFreeStudent(c: import('pg').PoolClient, userId: number, courseId: number) {
  const r = await c.query(
    `SELECT EXISTS (SELECT 1 FROM user_roles ur JOIN roles ro ON ro.role_id = ur.role_id
                     WHERE ur.user_id = $1 AND ro.role_name = 'student') AS is_student,
            EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.team_id = tm.team_id
                     WHERE tm.user_id = $1 AND t.course_id = $2) AS taken`, [userId, courseId]);
  if (!r.rows[0].is_student) throw new HttpError(400, `User ${userId} is not a student`);
  if (r.rows[0].taken) throw new HttpError(409, `User ${userId} is already in a team for this course`);
}

/* POST /api/teams — coordinator creates a team with its members (one transaction) */
const CreateBody = z.object({
  courseId: z.number().int().positive(),
  name: z.string().trim().min(2).max(80),
  members: z.array(z.object({
    userId: z.number().int().positive(),
    memberRole: z.enum(['leader', 'member']).default('member'),
    responsibility: z.string().trim().max(300).optional(),
  })).min(1).max(6),
}).refine((b) => b.members.filter((m) => m.memberRole === 'leader').length <= 1,
  { message: 'A team can have only one leader', path: ['members'] });

export const POST = handler(async (req) => {
  const session = await requireSession(['coordinator', 'admin']);
  const b = await parseBody(req, CreateBody);
  return json(await withTransaction(session.userId, async (c) => {
    const team = await c.query('INSERT INTO teams (course_id, name) VALUES ($1, $2) RETURNING team_id',
      [b.courseId, b.name]);
    const teamId = Number(team.rows[0].team_id);
    for (const m of b.members) {
      await assertFreeStudent(c, m.userId, b.courseId);
      await c.query(
        'INSERT INTO team_members (team_id, user_id, member_role, responsibility) VALUES ($1,$2,$3,$4)',
        [teamId, m.userId, m.memberRole, m.responsibility ?? null]);
    }
    return { teamId };
  }), 201);
});

/* PUT /api/teams — add a member, or update a member's responsibility */
const PutBody = z.object({
  teamId: z.number().int().positive(),
  userId: z.number().int().positive(),
  memberRole: z.enum(['leader', 'member']).default('member'),
  responsibility: z.string().trim().max(300).optional(),
});

export const PUT = handler(async (req) => {
  const session = await requireSession(['coordinator', 'admin']);
  const b = await parseBody(req, PutBody);
  return json(await withTransaction(session.userId, async (c) => {
    const t = await c.query('SELECT course_id FROM teams WHERE team_id = $1', [b.teamId]);
    if (!t.rowCount) throw new HttpError(404, 'Team not found');
    const existing = await c.query('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [b.teamId, b.userId]);
    if (existing.rowCount) {
      const r = await c.query(
        `UPDATE team_members SET member_role = $3, responsibility = $4 WHERE team_id = $1 AND user_id = $2 RETURNING *`,
        [b.teamId, b.userId, b.memberRole, b.responsibility ?? null]);
      return { member: r.rows[0], updated: true };
    }
    await assertFreeStudent(c, b.userId, Number(t.rows[0].course_id));
    const r = await c.query(
      'INSERT INTO team_members (team_id, user_id, member_role, responsibility) VALUES ($1,$2,$3,$4) RETURNING *',
      [b.teamId, b.userId, b.memberRole, b.responsibility ?? null]);
    return { member: r.rows[0], updated: false };
  }));
});

/* DELETE /api/teams?teamId=&userId= — remove a member (DELETE + audit trigger).
 * Refused if the student already has recorded work on the team's project. */
export const DELETE = handler(async (req) => {
  const session = await requireSession(['coordinator', 'admin']);
  const sp = new URL(req.url).searchParams;
  const teamId = Number(sp.get('teamId')); const userId = Number(sp.get('userId'));
  if (!teamId || !userId) throw new HttpError(400, 'teamId and userId are required');
  return json(await withTransaction(session.userId, async (c) => {
    const work = await c.query(
      `SELECT EXISTS (SELECT 1 FROM projects p JOIN milestones m ON m.project_id = p.project_id
                        JOIN tasks t ON t.milestone_id = m.milestone_id
                        JOIN task_assignments ta ON ta.task_id = t.task_id
                       WHERE p.team_id = $1 AND ta.user_id = $2) AS has_work`, [teamId, userId]);
    if (work.rows[0].has_work)
      throw new HttpError(409, 'This student has task assignments on the project; reassign them first');
    const r = await c.query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2 RETURNING user_id', [teamId, userId]);
    if (!r.rowCount) throw new HttpError(404, 'Member not found in this team');
    return { removed: userId };
  }));
});
