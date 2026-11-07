import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess, isGuide, isStaff, projectOfMilestone, projectOfTask } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/tasks?projectId=ID[&status=&assignee=me] — task board with assignees */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const projectId = Number(sp.get('projectId'));
  if (!projectId) throw new HttpError(400, 'projectId is required');
  await assertProjectAccess(pool, session, projectId);
  const { rows } = await pool.query(
    `SELECT t.task_id, t.milestone_id, m.title AS milestone_title, m.sequence_no, t.title, t.description,
            t.status, t.priority, t.due_date, t.estimated_hours, t.completed_at,
            (t.due_date < CURRENT_DATE AND t.status <> 'done') AS is_overdue,
            COALESCE(a.assignees, '[]'::jsonb) AS assignees,
            COALESCE(a.hours, 0) AS hours_logged,
            (SELECT COUNT(*) FROM git_activities g WHERE g.task_id = t.task_id)::int AS linked_commits
       FROM tasks t
       JOIN milestones m ON m.milestone_id = t.milestone_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object('user_id', u.user_id, 'full_name', u.full_name,
                                             'hours_logged', ta.hours_logged) ORDER BY u.full_name) AS assignees,
                SUM(ta.hours_logged) AS hours
           FROM task_assignments ta JOIN users u ON u.user_id = ta.user_id
          WHERE ta.task_id = t.task_id) a ON TRUE
      WHERE m.project_id = $1
        AND ($2::text IS NULL OR t.status = $2)
        AND (NOT $3::boolean OR EXISTS (SELECT 1 FROM task_assignments x WHERE x.task_id = t.task_id AND x.user_id = $4))
      ORDER BY m.sequence_no, CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
               t.due_date NULLS LAST, t.task_id`,
    [projectId, sp.get('status'), sp.get('assignee') === 'me', session.userId]);
  return json({ tasks: rows });
});

/** Students of the team and the project's guide may manage tasks; reviewers only read. */
function assertCanManage(session: Awaited<ReturnType<typeof requireSession>>) {
  if (isStaff(session) && !isGuide(session)) throw new HttpError(403, 'Reviewers cannot change tasks');
}

/* POST /api/tasks — create a task under a milestone and assign team members (one transaction) */
const CreateBody = z.object({
  milestoneId: z.number().int().positive(),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  estimatedHours: z.number().positive().max(500).optional(),
  assigneeIds: z.array(z.number().int().positive()).max(6).default([]),
});

export const POST = handler(async (req) => {
  const session = await requireSession();
  assertCanManage(session);
  const b = await parseBody(req, CreateBody);
  return json(await withTransaction(session.userId, async (c) => {
    const projectId = await projectOfMilestone(c, session, b.milestoneId);
    const ms = await c.query('SELECT status FROM milestones WHERE milestone_id = $1', [b.milestoneId]);
    if (ms.rows[0].status === 'approved') throw new HttpError(409, 'Cannot add tasks to an approved milestone');
    const t = await c.query(
      `INSERT INTO tasks (milestone_id, title, description, priority, due_date, estimated_hours, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.milestoneId, b.title, b.description ?? null, b.priority, b.dueDate ?? null, b.estimatedHours ?? null, session.userId]);
    for (const uid of new Set(b.assigneeIds)) {
      // INSERT … SELECT only inserts when the user really is on the team.
      const r = await c.query(
        `INSERT INTO task_assignments (task_id, user_id) SELECT $1, $2 WHERE fn_is_team_member($3, $2)`,
        [t.rows[0].task_id, uid, projectId]);
      if (!r.rowCount) throw new HttpError(400, `User ${uid} is not a member of this project's team`);
    }
    return { task: t.rows[0] };
  }), 201);
});

/* PUT /api/tasks — status change, assign a member, or log hours */
const PutBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), taskId: z.number().int().positive(),
             status: z.enum(['todo', 'in_progress', 'done', 'blocked']) }),
  z.object({ action: z.literal('assign'), taskId: z.number().int().positive(), userId: z.number().int().positive() }),
  z.object({ action: z.literal('log_hours'), taskId: z.number().int().positive(), hours: z.number().positive().max(24) }),
]);

export const PUT = handler(async (req) => {
  const session = await requireSession();
  assertCanManage(session);
  const b = await parseBody(req, PutBody);
  return json(await withTransaction(session.userId, async (c) => {
    const projectId = await projectOfTask(c, session, b.taskId);
    if (b.action === 'status') {
      // completed_at is required by a CHECK when status = 'done', and cleared otherwise.
      const r = await c.query(
        `UPDATE tasks SET status = $2,
                completed_at = CASE WHEN $2 = 'done' THEN COALESCE(completed_at, now()) ELSE NULL END
          WHERE task_id = $1 RETURNING task_id, status, completed_at`, [b.taskId, b.status]);
      return { task: r.rows[0] };
    }
    if (b.action === 'assign') {
      const r = await c.query(
        `INSERT INTO task_assignments (task_id, user_id) SELECT $1, $2 WHERE fn_is_team_member($3, $2)
         ON CONFLICT (task_id, user_id) DO NOTHING RETURNING task_id`, [b.taskId, b.userId, projectId]);
      if (!r.rowCount) {
        const exists = await c.query('SELECT 1 FROM task_assignments WHERE task_id = $1 AND user_id = $2', [b.taskId, b.userId]);
        if (!exists.rowCount) throw new HttpError(400, 'That user is not a member of this team');
      }
      return { assigned: b.userId };
    }
    // log_hours: only for yourself, only on a task you are assigned to
    const r = await c.query(
      `UPDATE task_assignments SET hours_logged = hours_logged + $3 WHERE task_id = $1 AND user_id = $2
       RETURNING hours_logged`, [b.taskId, session.userId, b.hours]);
    if (!r.rowCount) throw new HttpError(403, 'You can only log hours on tasks assigned to you');
    return { hoursLogged: r.rows[0].hours_logged };
  }));
});

/* DELETE /api/tasks?taskId=ID            — delete an incorrect task (not allowed once done)
 * DELETE /api/tasks?taskId=ID&userId=ID  — remove one assignment
 * Both are recorded in audit_logs by the trg_*_delete_audit triggers. */
export const DELETE = handler(async (req) => {
  const session = await requireSession();
  assertCanManage(session);
  const sp = new URL(req.url).searchParams;
  const taskId = Number(sp.get('taskId'));
  const userId = sp.get('userId') ? Number(sp.get('userId')) : null;
  if (!taskId) throw new HttpError(400, 'taskId is required');
  return json(await withTransaction(session.userId, async (c) => {
    await projectOfTask(c, session, taskId);
    if (userId) {
      const r = await c.query('DELETE FROM task_assignments WHERE task_id = $1 AND user_id = $2 RETURNING user_id', [taskId, userId]);
      if (!r.rowCount) throw new HttpError(404, 'Assignment not found');
      return { removedAssignment: { taskId, userId } };
    }
    const cur = await c.query('SELECT status FROM tasks WHERE task_id = $1 FOR UPDATE', [taskId]);
    if (cur.rows[0].status === 'done') throw new HttpError(409, 'Completed tasks are contribution evidence and cannot be deleted');
    await c.query('DELETE FROM tasks WHERE task_id = $1', [taskId]);  // assignments cascade
    return { deletedTask: taskId };
  }));
});
