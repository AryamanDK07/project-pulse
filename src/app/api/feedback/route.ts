import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess, isStaff, projectScopeSql } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/feedback[?projectId=&status=&milestoneId=] — also returns the user's projects */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const scope = projectScopeSql(session, 'p', 1);
  const [fb, projects] = await Promise.all([
    pool.query(
      `SELECT f.feedback_id, f.project_id, p.title AS project_title, f.milestone_id, m.title AS milestone_title,
              f.body, f.severity, f.status, f.resolution_note, f.created_at, f.resolved_at,
              a.full_name AS author_name, f.assigned_to, s.full_name AS assigned_to_name
         FROM feedback_items f
         JOIN projects p ON p.project_id = f.project_id
         JOIN users a ON a.user_id = f.author_id
         LEFT JOIN users s ON s.user_id = f.assigned_to
         LEFT JOIN milestones m ON m.milestone_id = f.milestone_id
        WHERE ${scope}
          AND ($2::bigint IS NULL OR f.project_id = $2)
          AND ($3::text IS NULL OR f.status = $3)
          AND ($4::bigint IS NULL OR f.milestone_id = $4)
        ORDER BY CASE f.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'resolved' THEN 2 ELSE 3 END,
                 f.created_at DESC`,
      [session.userId, sp.get('projectId') ? Number(sp.get('projectId')) : null, sp.get('status'),
       sp.get('milestoneId') ? Number(sp.get('milestoneId')) : null]),
    pool.query(
      `SELECT p.project_id, p.title,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('user_id', u.user_id, 'full_name', u.full_name) ORDER BY u.full_name)
                          FROM team_members tm JOIN users u ON u.user_id = tm.user_id WHERE tm.team_id = p.team_id), '[]') AS members
         FROM projects p WHERE ${scope} ORDER BY p.project_id`, [session.userId]),
  ]);
  return json({ feedback: fb.rows, projects: projects.rows });
});

/* POST /api/feedback — faculty guide or reviewer raises a feedback item, optionally assigned to a student */
const CreateBody = z.object({
  projectId: z.number().int().positive(),
  milestoneId: z.number().int().positive().optional(),
  body: z.string().trim().min(3).max(4000),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  assignedTo: z.number().int().positive().optional(),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['faculty', 'reviewer', 'coordinator', 'admin']);
  const b = await parseBody(req, CreateBody);
  return json(await withTransaction(session.userId, async (c) => {
    await assertProjectAccess(c, session, b.projectId);
    if (b.milestoneId) {
      const ok = await c.query('SELECT 1 FROM milestones WHERE milestone_id = $1 AND project_id = $2', [b.milestoneId, b.projectId]);
      if (!ok.rowCount) throw new HttpError(400, 'Milestone does not belong to this project');
    }
    const r = await c.query(
      `INSERT INTO feedback_items (project_id, milestone_id, author_id, body, severity, assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.projectId, b.milestoneId ?? null, session.userId, b.body, b.severity, b.assignedTo ?? null]);
    return { feedback: r.rows[0] };
  }), 201);
});

/* PUT /api/feedback — resolution workflow
 *   student: start (open -> in_progress), resolve (open|in_progress -> resolved, note required)
 *   staff:   verify (resolved -> verified), reopen (resolved|verified -> open),
 *            wont_fix (open|in_progress -> wont_fix, note required)                          */
const TRANSITIONS = {
  start:    { by: 'student', from: ['open'],                     to: 'in_progress', note: false },
  resolve:  { by: 'student', from: ['open', 'in_progress'],      to: 'resolved',    note: true  },
  verify:   { by: 'staff',   from: ['resolved'],                 to: 'verified',    note: false },
  reopen:   { by: 'staff',   from: ['resolved', 'verified'],     to: 'open',        note: false },
  wont_fix: { by: 'staff',   from: ['open', 'in_progress'],      to: 'wont_fix',    note: true  },
} as const;

const UpdateBody = z.object({
  feedbackId: z.number().int().positive(),
  action: z.enum(['start', 'resolve', 'verify', 'reopen', 'wont_fix']),
  resolutionNote: z.string().trim().max(4000).optional(),
});

export const PUT = handler(async (req) => {
  const session = await requireSession();
  const b = await parseBody(req, UpdateBody);
  const t = TRANSITIONS[b.action];
  if ((t.by === 'staff') !== isStaff(session)) throw new HttpError(403, `Only ${t.by === 'staff' ? 'faculty/coordinators' : 'students'} can ${b.action}`);
  if (t.note && !b.resolutionNote) throw new HttpError(400, 'A resolution note is required');

  return json(await withTransaction(session.userId, async (c) => {
    const cur = await c.query('SELECT project_id, status FROM feedback_items WHERE feedback_id = $1 FOR UPDATE', [b.feedbackId]);
    if (!cur.rowCount) throw new HttpError(404, 'Feedback item not found');
    await assertProjectAccess(c, session, Number(cur.rows[0].project_id));
    if (!(t.from as readonly string[]).includes(cur.rows[0].status))
      throw new HttpError(409, `Cannot ${b.action} an item that is ${cur.rows[0].status}`);

    const r = await c.query(
      `UPDATE feedback_items SET status = $2,
              resolution_note = CASE WHEN $2 = 'open' THEN NULL ELSE COALESCE($3, resolution_note) END,
              resolved_by = CASE WHEN $2 IN ('resolved','wont_fix') THEN $4 WHEN $2 = 'open' THEN NULL ELSE resolved_by END,
              resolved_at = CASE WHEN $2 IN ('resolved','wont_fix') THEN now() WHEN $2 = 'open' THEN NULL ELSE resolved_at END
        WHERE feedback_id = $1 RETURNING *`,
      [b.feedbackId, t.to, b.resolutionNote ?? null, session.userId]);
    return { feedback: r.rows[0] };
  }));
});
