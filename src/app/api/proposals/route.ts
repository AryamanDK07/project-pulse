import { createHash } from 'node:crypto';
import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { embedText, toPgVector } from '@/lib/embeddings';
import { assertProjectAccess, isCoordinator, isStaff, projectScopeSql } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const THRESHOLD = Number(process.env.SIMILARITY_THRESHOLD ?? (process.env.OPENAI_API_KEY ? 0.75 : 0.3));

/* GET /api/proposals
 *   ?q=text         semantic search over all proposals (staff only)
 *   ?projectId=ID   projects most similar to an existing one
 *   (none)          list proposals visible to the user (+ similarity reviews) */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit')) || 10, 50);
  const minSim = Number(sp.get('minSimilarity') ?? 0);
  const q = sp.get('q')?.trim();
  const projectId = Number(sp.get('projectId'));

  if (q || projectId) {
    // Students must not browse other teams' ideas, so similarity search is staff-only.
    if (!isStaff(session)) throw new HttpError(403, 'Similarity search is limited to faculty and coordinators');
    if (q) {
      const { vector } = await embedText(q);
      const { rows } = await pool.query(
        'SELECT * FROM fn_similar_projects($1::vector, $2, NULL, $3)', [toPgVector(vector), limit, minSim]);
      return json({ mode: 'semantic', results: rows });
    }
    await assertProjectAccess(pool, session, projectId);
    // Cosine-distance k-NN using the stored embedding of the source project.
    const { rows } = await pool.query(
      `SELECT * FROM fn_similar_projects(
         (SELECT embedding FROM project_embeddings WHERE project_id = $1), $2, $1, $3)`,
      [projectId, limit, minSim]);
    return json({ mode: 'neighbours', results: rows });
  }

  const status = sp.get('status');
  const { rows } = await pool.query(
    `SELECT p.project_id, p.title, p.abstract, p.status, p.created_at,
            t.name AS team_name, c.code AS course_code, g.full_name AS guide_name,
            COALESCE(sr.reviews, '[]'::jsonb) AS similarity_reviews
       FROM projects p
       JOIN teams t   ON t.team_id = p.team_id
       JOIN courses c ON c.course_id = p.course_id
       LEFT JOIN guide_allocations ga ON ga.project_id = p.project_id AND ga.is_active
       LEFT JOIN users g ON g.user_id = ga.guide_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'similarity_id', s.similarity_id, 'matched_project_id', s.matched_project_id,
                  'matched_title', mp.title, 'similarity_score', s.similarity_score, 'decision', s.decision)
                ORDER BY s.similarity_score DESC) AS reviews
           FROM similarity_reviews s JOIN projects mp ON mp.project_id = s.matched_project_id
          WHERE s.project_id = p.project_id) sr ON TRUE
      WHERE ${projectScopeSql(session, 'p', 1)} AND ($2::text IS NULL OR p.status = $2)
      ORDER BY p.created_at DESC LIMIT $3`,
    [session.userId, status, limit]);
  return json({ proposals: rows });
});

/* POST /api/proposals — create proposal + embedding + similarity scan (one transaction) */
const CreateBody = z.object({
  teamId: z.number().int().positive(),
  title: z.string().trim().min(5).max(200),
  abstract: z.string().trim().min(30).max(5000),
});

export const POST = handler(async (req) => {
  const session = await requireSession(['student']);
  const body = await parseBody(req, CreateBody);
  const text = `${body.title}. ${body.abstract}`;
  const { vector, model } = await embedText(text);          // network call kept OUTSIDE the transaction
  const vec = toPgVector(vector);

  const result = await withTransaction(session.userId, async (c) => {
    const team = await c.query(
      `SELECT t.course_id FROM teams t JOIN team_members tm ON tm.team_id = t.team_id
        WHERE t.team_id = $1 AND tm.user_id = $2`, [body.teamId, session.userId]);
    if (!team.rowCount) throw new HttpError(403, 'You are not a member of this team');

    const proj = await c.query(
      `INSERT INTO projects (team_id, course_id, title, abstract, status, created_by)
       VALUES ($1, $2, $3, $4, 'proposed', $5) RETURNING *`,
      [body.teamId, team.rows[0].course_id, body.title, body.abstract, session.userId]);
    const projectId = Number(proj.rows[0].project_id);

    await c.query(
      `INSERT INTO project_embeddings (project_id, embedding, model, content_hash) VALUES ($1, $2::vector, $3, $4)`,
      [projectId, vec, model, createHash('sha256').update(text).digest('hex')]);

    // Originality scan: nearest neighbours by cosine distance, excluding itself.
    const sim = await c.query('SELECT * FROM fn_similar_projects($1::vector, 5, $2, 0)', [vec, projectId]);
    const flagged = sim.rows.filter((r) => Number(r.similarity) >= THRESHOLD);
    for (const m of flagged) {
      await c.query(
        `INSERT INTO similarity_reviews (project_id, matched_project_id, similarity_score)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [projectId, m.project_id, m.similarity]);
    }
    return { project: proj.rows[0], similar: sim.rows, flaggedForReview: flagged.length, threshold: THRESHOLD };
  });
  return json(result, 201);
});

/* PUT /api/proposals — review a proposal, or (coordinator) allocate a guide */
const PutBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('review'),
    projectId: z.number().int().positive(),
    decision: z.enum(['approved', 'rejected']),
    notes: z.string().max(2000).optional(),
    similarityDecisions: z.array(z.object({
      similarityId: z.number().int().positive(),
      decision: z.enum(['acceptable', 'plagiarism_suspected', 'duplicate']),
      notes: z.string().max(1000).optional(),
    })).default([]),
  }),
  z.object({ action: z.literal('allocate'), projectId: z.number().int().positive(), guideId: z.number().int().positive() }),
]);

export const PUT = handler(async (req) => {
  const session = await requireSession(['faculty', 'coordinator', 'admin']);
  const body = await parseBody(req, PutBody);

  if (body.action === 'allocate') {
    if (!isCoordinator(session)) throw new HttpError(403, 'Only coordinators can allocate guides');
    return json(await withTransaction(session.userId, async (c) => {
      const ok = await c.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1 AND r.role_name = 'faculty'`, [body.guideId]);
      if (!ok.rowCount) throw new HttpError(400, 'Selected user is not faculty');
      await c.query('UPDATE guide_allocations SET is_active = FALSE WHERE project_id = $1 AND is_active', [body.projectId]);
      const r = await c.query('INSERT INTO guide_allocations (project_id, guide_id) VALUES ($1, $2) RETURNING *',
        [body.projectId, body.guideId]);
      return { allocation: r.rows[0] };
    }));
  }

  return json(await withTransaction(session.userId, async (c) => {
    await assertProjectAccess(c, session, body.projectId);
    const cur = await c.query('SELECT status FROM projects WHERE project_id = $1 FOR UPDATE', [body.projectId]);
    if (cur.rows[0]?.status !== 'proposed') throw new HttpError(409, 'Only proposals awaiting review can be decided');

    for (const d of body.similarityDecisions) {
      await c.query(
        `UPDATE similarity_reviews SET decision = $1, notes = $2, reviewer_id = $3, reviewed_at = now()
          WHERE similarity_id = $4 AND project_id = $5`,
        [d.decision, d.notes ?? null, session.userId, d.similarityId, body.projectId]);
    }
    if (body.decision === 'approved') {
      const chk = await c.query(
        `SELECT COUNT(*) FILTER (WHERE decision = 'pending') AS pending,
                COUNT(*) FILTER (WHERE decision IN ('duplicate','plagiarism_suspected')) AS blocked
           FROM similarity_reviews WHERE project_id = $1`, [body.projectId]);
      if (Number(chk.rows[0].pending) > 0) throw new HttpError(409, 'Resolve all pending similarity reviews before approving');
      if (Number(chk.rows[0].blocked) > 0) throw new HttpError(409, 'Proposal is flagged as duplicate/plagiarised and cannot be approved');
    }
    const upd = await c.query(
      `UPDATE projects SET status = $2, start_date = COALESCE(start_date, CURRENT_DATE)
        WHERE project_id = $1 RETURNING project_id, status`,
      [body.projectId, body.decision]);
    if (body.decision === 'rejected' && body.notes) {
      await c.query(
        `INSERT INTO feedback_items (project_id, author_id, body, severity) VALUES ($1, $2, $3, 'high')`,
        [body.projectId, session.userId, `Proposal rejected: ${body.notes}`]);
    }
    return { project: upd.rows[0] };
  }));
});
