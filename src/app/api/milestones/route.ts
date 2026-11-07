import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess, projectScopeSql } from '@/lib/scope';
import { appendSrsVersion, removeSrsVersion } from '@/lib/srs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/milestones[?projectId=&status=&needsReview=true]  (scoped by role) */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const { rows } = await pool.query(
    `SELECT m.milestone_id, m.project_id, p.title AS project_title, m.title, m.description, m.sequence_no,
            m.due_date, m.status, m.weight, m.submitted_at, m.required_evidence_type,
            (m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')) AS is_overdue,
            lv.version_no AS latest_version_no, lv.file_name AS latest_file_name,
            (SELECT COUNT(*) FROM feedback_items f WHERE f.milestone_id = m.milestone_id
                AND f.status IN ('open','in_progress'))::int AS open_feedback
       FROM milestones m
       JOIN projects p ON p.project_id = m.project_id
       LEFT JOIN LATERAL (
         SELECT dv.version_no, dv.file_name
           FROM deliverables d JOIN document_versions dv ON dv.deliverable_id = d.deliverable_id
          WHERE d.milestone_id = m.milestone_id ORDER BY dv.uploaded_at DESC LIMIT 1) lv ON TRUE
      WHERE ${projectScopeSql(session, 'p', 1)}
        AND ($2::bigint IS NULL OR m.project_id = $2)
        AND ($3::text IS NULL OR m.status = $3)
        AND (NOT $4::boolean OR m.status IN ('submitted','under_review'))
      ORDER BY p.project_id, m.sequence_no`,
    [session.userId, sp.get('projectId') ? Number(sp.get('projectId')) : null, sp.get('status'),
     sp.get('needsReview') === 'true']);
  return json({ milestones: rows });
});

/* POST /api/milestones — student submits a deliverable version.
 * PostgreSQL work is ONE transaction; MongoDB is written inside it and compensated
 * (saga) if the final COMMIT fails. */
const SubmitBody = z.object({
  milestoneId: z.number().int().positive(),
  title: z.string().trim().min(1).max(200).default('Milestone deliverable'),
  fileName: z.string().trim().min(1).max(255),
  fileUrl: z.string().url().optional(),
  changeSummary: z.string().trim().min(5).max(2000),
  sections: z.array(z.object({
    heading: z.string().trim().min(1).max(200),
    content: z.string().max(50000),
  })).max(50).default([]),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['student']);
  const b = await parseBody(req, SubmitBody);
  const checksum = createHash('sha256')
    .update(JSON.stringify({ f: b.fileName, s: b.changeSummary, sec: b.sections })).digest('hex');
  const saga = { undo: null as null | (() => Promise<void>) };

  try {
    const result = await withTransaction(session.userId, async (c) => {
      // 1. Lock the milestone row so concurrent submissions serialise.
      const ms = await c.query(
        `SELECT m.project_id, m.status, m.required_evidence_type, p.status AS project_status, p.technologies
           FROM milestones m JOIN projects p ON p.project_id = m.project_id
          WHERE m.milestone_id = $1 FOR UPDATE OF m`, [b.milestoneId]);
      if (!ms.rowCount) throw new HttpError(404, 'Milestone not found');
      const { project_id: projectId, status, project_status } = ms.rows[0];
      const documentType: string = ms.rows[0].required_evidence_type ?? 'other';
      await assertProjectAccess(c, session, Number(projectId));
      if (!['approved', 'in_progress'].includes(project_status)) throw new HttpError(409, 'Project is not active');
      if (!['pending', 'changes_requested'].includes(status))
        throw new HttpError(409, `Milestone is ${status}; it cannot accept a new submission`);

      // 2. Deliverable (one per milestone) + next version number.
      const del = await c.query(
        `INSERT INTO deliverables (milestone_id, submitted_by, title, document_type) VALUES ($1, $2, $3, $4)
         ON CONFLICT (milestone_id) DO UPDATE SET title = EXCLUDED.title
         RETURNING deliverable_id`, [b.milestoneId, session.userId, b.title, documentType]);
      const deliverableId = Number(del.rows[0].deliverable_id);
      const next = await c.query(
        'SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM document_versions WHERE deliverable_id = $1', [deliverableId]);
      const versionNo = Number(next.rows[0].n);
      const mongoVersionId = new mongoose.Types.ObjectId();

      // 3. Document version row (with pointer to the MongoDB version).
      const ver = await c.query(
        `INSERT INTO document_versions (deliverable_id, version_no, file_name, file_url, checksum,
                                        mongo_version_id, change_summary, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING version_id`,
        [deliverableId, versionNo, b.fileName, b.fileUrl ?? null, checksum, mongoVersionId.toHexString(),
         b.changeSummary, session.userId]);
      await c.query('UPDATE deliverables SET current_version_no = $2 WHERE deliverable_id = $1', [deliverableId, versionNo]);

      // 4. Rich SRS content + section change history in MongoDB (rolls back PG on failure).
      await appendSrsVersion({
        projectId: Number(projectId), milestoneId: b.milestoneId, documentType,
        tags: (ms.rows[0].technologies as string[] | null) ?? [], deliverableId, title: b.title, versionNo,
        pgVersionId: Number(ver.rows[0].version_id), userId: session.userId, summary: b.changeSummary,
        checksum, sections: b.sections, versionObjectId: mongoVersionId,
      });
      saga.undo = () => removeSrsVersion(deliverableId, mongoVersionId, versionNo);

      // 5. State transitions (status-change triggers write audit rows automatically).
      await c.query(`UPDATE milestones SET status = 'submitted', submitted_at = now() WHERE milestone_id = $1`, [b.milestoneId]);
      await c.query(`UPDATE projects SET status = 'in_progress' WHERE project_id = $1 AND status = 'approved'`, [projectId]);

      // 6. Explicit business-event audit record.
      await c.query(
        `INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
         VALUES ('document_versions', $1, 'SUBMIT_DELIVERABLE', $2::jsonb, $3)`,
        [String(ver.rows[0].version_id),
         JSON.stringify({ milestoneId: b.milestoneId, deliverableId, versionNo, checksum }), session.userId]);

      return { deliverableId, versionNo, milestoneStatus: 'submitted', mongoVersionId: mongoVersionId.toHexString() };
    });
    return json(result, 201);
  } catch (err) {
    if (saga.undo) await saga.undo().catch((e) => console.error('SRS compensation failed', e));
    throw err;
  }
});

/* PUT /api/milestones — faculty/coordinator reviews a submitted milestone */
const ReviewBody = z.object({
  milestoneId: z.number().int().positive(),
  decision: z.enum(['approved', 'changes_requested']),
  score: z.number().min(0).max(100).optional(),
  comments: z.string().trim().max(4000).optional(),
}).refine((v) => v.decision === 'approved' || (v.comments && v.comments.length >= 3),
  { message: 'Comments are required when requesting changes', path: ['comments'] });

export const PUT = handler(async (req) => {
  const session = await requireSession(['faculty', 'coordinator', 'admin']);
  const b = await parseBody(req, ReviewBody);

  return json(await withTransaction(session.userId, async (c) => {
    const ms = await c.query(
      `SELECT project_id, status FROM milestones WHERE milestone_id = $1 FOR UPDATE`, [b.milestoneId]);
    if (!ms.rowCount) throw new HttpError(404, 'Milestone not found');
    const projectId = Number(ms.rows[0].project_id);
    await assertProjectAccess(c, session, projectId);
    if (!['submitted', 'under_review'].includes(ms.rows[0].status))
      throw new HttpError(409, 'Only submitted milestones can be reviewed');

    const review = await c.query(
      `INSERT INTO reviews (milestone_id, reviewer_id, decision, score, comments)
       VALUES ($1,$2,$3,$4,$5) RETURNING review_id`,
      [b.milestoneId, session.userId, b.decision, b.score ?? null, b.comments ?? null]);

    await c.query(
      `UPDATE milestones SET status = $2, approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END
        WHERE milestone_id = $1`, [b.milestoneId, b.decision]);

    if (b.decision === 'changes_requested') {   // opens a feedback item the student must resolve
      await c.query(
        `INSERT INTO feedback_items (review_id, milestone_id, project_id, author_id, body, severity)
         VALUES ($1,$2,$3,$4,$5,'medium')`,
        [review.rows[0].review_id, b.milestoneId, projectId, session.userId, b.comments]);
    } else {                                     // complete the project when every milestone is approved
      await c.query(
        `UPDATE projects SET status = 'completed', end_date = CURRENT_DATE
          WHERE project_id = $1 AND NOT EXISTS (
            SELECT 1 FROM milestones WHERE project_id = $1 AND status <> 'approved')`, [projectId]);
    }
    await c.query('CALL sp_refresh_risk_assessments($1::bigint)', [projectId]);
    return { reviewId: review.rows[0].review_id, milestoneStatus: b.decision };
  }));
});
