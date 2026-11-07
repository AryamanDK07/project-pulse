import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVIDENCE = ['proposal', 'srs', 'design', 'source_code', 'report', 'presentation', 'other'] as const;

/* POST /api/milestones/manage — faculty guide plans a dated milestone for a project.
 * sequence_no is the next number for the project; date rules are enforced by
 * the trg_milestones_validate_dates trigger (inside the project window). */
const CreateBody = z.object({
  projectId: z.number().int().positive(),
  title: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  weight: z.number().positive().max(100),
  requiredEvidenceType: z.enum(EVIDENCE).optional(),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['faculty', 'coordinator', 'admin']);
  const b = await parseBody(req, CreateBody);
  return json(await withTransaction(session.userId, async (c) => {
    await assertProjectAccess(c, session, b.projectId);
    const p = await c.query('SELECT status FROM projects WHERE project_id = $1 FOR UPDATE', [b.projectId]);
    if (!['approved', 'in_progress'].includes(p.rows[0].status))
      throw new HttpError(409, 'Milestones can only be planned for approved or in-progress projects');
    // Total weight of a project's milestones may not exceed 100.
    const w = await c.query('SELECT COALESCE(SUM(weight), 0) AS used FROM milestones WHERE project_id = $1', [b.projectId]);
    if (Number(w.rows[0].used) + b.weight > 100)
      throw new HttpError(400, `Milestone weights would total ${Number(w.rows[0].used) + b.weight}% (max 100%)`);
    const r = await c.query(
      `INSERT INTO milestones (project_id, title, description, sequence_no, due_date, weight, required_evidence_type)
       SELECT $1, $2, $3, COALESCE(MAX(sequence_no), 0) + 1, $4, $5, $6 FROM milestones WHERE project_id = $1
       RETURNING *`,
      [b.projectId, b.title, b.description ?? null, b.dueDate, b.weight, b.requiredEvidenceType ?? null]);
    return { milestone: r.rows[0] };
  }), 201);
});
