import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { isStaff, projectOfMilestone } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/reviews?milestoneId=ID — every review (guide decisions + reviewer rubrics) of a milestone */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const milestoneId = Number(new URL(req.url).searchParams.get('milestoneId'));
  if (!milestoneId) throw new HttpError(400, 'milestoneId is required');
  await projectOfMilestone(pool, session, milestoneId);
  const { rows } = await pool.query(
    `SELECT r.review_id, r.decision, r.score, r.rubric, r.comments, r.reviewed_at, u.full_name AS reviewer_name
       FROM reviews r JOIN users u ON u.user_id = r.reviewer_id
      WHERE r.milestone_id = $1 ORDER BY r.reviewed_at DESC`, [milestoneId]);
  return json({ reviews: rows });
});

/* POST /api/reviews — reviewer records rubric results and comments for a submission.
 * Does not approve: it moves a 'submitted' milestone to 'under_review' and leaves the
 * approve / request-changes decision to the faculty guide. */
const RUBRIC_KEYS = ['problem_understanding', 'database_design', 'implementation', 'documentation', 'presentation'] as const;
const Body = z.object({
  milestoneId: z.number().int().positive(),
  rubric: z.object(Object.fromEntries(RUBRIC_KEYS.map((k) => [k, z.number().int().min(0).max(10)])) as
    Record<(typeof RUBRIC_KEYS)[number], z.ZodNumber>),
  comments: z.string().trim().min(3).max(4000),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['reviewer', 'faculty', 'coordinator', 'admin']);
  if (!isStaff(session)) throw new HttpError(403, 'Forbidden');
  const b = await parseBody(req, Body);
  // Score out of 100 = rubric total (5 criteria x 10) x 2
  const score = Object.values(b.rubric).reduce((s, v) => s + v, 0) * 2;
  return json(await withTransaction(session.userId, async (c) => {
    await projectOfMilestone(c, session, b.milestoneId);
    const ms = await c.query('SELECT status FROM milestones WHERE milestone_id = $1 FOR UPDATE', [b.milestoneId]);
    if (!['submitted', 'under_review', 'approved'].includes(ms.rows[0].status))
      throw new HttpError(409, 'Only submitted milestones can be reviewed');
    const r = await c.query(
      `INSERT INTO reviews (milestone_id, reviewer_id, decision, score, rubric, comments)
       VALUES ($1, $2, 'commented', $3, $4::jsonb, $5) RETURNING review_id, score`,
      [b.milestoneId, session.userId, score, JSON.stringify(b.rubric), b.comments]);
    await c.query(`UPDATE milestones SET status = 'under_review' WHERE milestone_id = $1 AND status = 'submitted'`,
      [b.milestoneId]);
    return { review: r.rows[0] };
  }), 201);
});
