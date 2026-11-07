import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess, isStaff } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/contributions?projectId=ID
 *   staff   -> every member's contribution indicator, Git evidence and peer evaluations
 *   student -> own contribution record, own Git evidence, team list, the evaluations they gave */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const projectId = Number(new URL(req.url).searchParams.get('projectId'));
  if (!projectId) throw new HttpError(400, 'projectId is required');
  await assertProjectAccess(pool, session, projectId);
  const staff = isStaff(session);
  const [scores, git, peer, team] = await Promise.all([
    pool.query('SELECT * FROM fn_student_contribution_scores($1)', [projectId]),
    pool.query(
      `SELECT g.activity_id, g.user_id, u.full_name, g.task_id, t.title AS task_title, g.commit_sha, g.commit_url,
              g.message, g.committed_at
         FROM git_activities g JOIN users u ON u.user_id = g.user_id LEFT JOIN tasks t ON t.task_id = g.task_id
        WHERE g.project_id = $1 AND ($2 OR g.user_id = $3)
        ORDER BY g.committed_at DESC`, [projectId, staff, session.userId]),
    pool.query(
      `SELECT pe.evaluation_id, pe.evaluator_id, e1.full_name AS evaluator_name, pe.evaluatee_id,
              e2.full_name AS evaluatee_name, pe.rating, pe.comments, pe.created_at
         FROM peer_evaluations pe
         JOIN users e1 ON e1.user_id = pe.evaluator_id JOIN users e2 ON e2.user_id = pe.evaluatee_id
        WHERE pe.project_id = $1 AND ($2 OR pe.evaluator_id = $3)
        ORDER BY pe.created_at DESC`, [projectId, staff, session.userId]),
    pool.query(
      `SELECT u.user_id, u.full_name, tm.member_role, tm.responsibility
         FROM projects p JOIN team_members tm ON tm.team_id = p.team_id JOIN users u ON u.user_id = tm.user_id
        WHERE p.project_id = $1 ORDER BY u.full_name`, [projectId]),
  ]);
  return json({
    contributions: staff ? scores.rows : scores.rows.filter((r) => Number(r.user_id) === session.userId),
    git: git.rows, peerEvaluations: peer.rows, team: team.rows,
  });
});

/* POST /api/contributions — student records evidence
 *   type=git   a commit reference (validated by CHECKs + membership trigger)
 *   type=peer  rating of a teammate (insert, or update the existing one) */
const Body = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('git'),
    projectId: z.number().int().positive(),
    commitSha: z.string().trim().toLowerCase().regex(/^[0-9a-f]{7,40}$/, 'Commit SHA must be 7–40 hex characters'),
    message: z.string().trim().min(3).max(500),
    commitUrl: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
    taskId: z.number().int().positive().optional(),
    committedAt: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({
    type: z.literal('peer'),
    projectId: z.number().int().positive(),
    evaluateeId: z.number().int().positive(),
    rating: z.number().int().min(1).max(5),
    comments: z.string().trim().max(1000).optional(),
  }),
]);

export const POST = handler(async (req) => {
  const session = await requireSession(['student']);
  const b = await parseBody(req, Body);
  return json(await withTransaction(session.userId, async (c) => {
    await assertProjectAccess(c, session, b.projectId);
    if (b.type === 'git') {
      if (b.taskId) {
        const ok = await c.query(
          'SELECT 1 FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id WHERE t.task_id = $1 AND m.project_id = $2',
          [b.taskId, b.projectId]);
        if (!ok.rowCount) throw new HttpError(400, 'Task does not belong to this project');
      }
      const r = await c.query(
        `INSERT INTO git_activities (project_id, user_id, task_id, commit_sha, commit_url, message, committed_at)
         VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamptz, now())) RETURNING *`,
        [b.projectId, session.userId, b.taskId ?? null, b.commitSha, b.commitUrl ?? null, b.message, b.committedAt ?? null]);
      return { git: r.rows[0] };
    }
    const r = await c.query(
      `INSERT INTO peer_evaluations (project_id, evaluator_id, evaluatee_id, rating, comments)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (project_id, evaluator_id, evaluatee_id)
       DO UPDATE SET rating = EXCLUDED.rating, comments = EXCLUDED.comments, created_at = now()
       RETURNING *`,
      [b.projectId, session.userId, b.evaluateeId, b.rating, b.comments ?? null]);
    return { peer: r.rows[0] };
  }), 201);
});

/* DELETE /api/contributions?activityId=ID — a student removes a Git record they entered by mistake */
export const DELETE = handler(async (req) => {
  const session = await requireSession(['student']);
  const activityId = Number(new URL(req.url).searchParams.get('activityId'));
  if (!activityId) throw new HttpError(400, 'activityId is required');
  return json(await withTransaction(session.userId, async (c) => {
    const r = await c.query('DELETE FROM git_activities WHERE activity_id = $1 AND user_id = $2 RETURNING activity_id',
      [activityId, session.userId]);
    if (!r.rowCount) throw new HttpError(404, 'Git record not found (you can only delete your own)');
    return { deleted: activityId };
  }));
});
