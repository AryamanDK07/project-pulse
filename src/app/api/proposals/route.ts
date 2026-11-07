import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool, withTransaction } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { defaultThreshold, embedText, proposalText, toPgVector } from '@/lib/embeddings';
import { assertProjectAccess, isCoordinator, isGuide, isStaff, projectScopeSql } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/proposals
 *   ?q=text         semantic search over all proposals (staff only, pgvector)
 *   ?text=words     keyword full-text search (staff only, tsvector + GIN, ranked)
 *   ?projectId=ID   projects most similar to an existing one (same course)
 *   ?status=…       filter the list
 *   (none)          list proposals visible to the user (+ similarity reviews) */
export const GET = handler(async (req) => {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Number(sp.get('limit')) || 10, 50);
  const minSim = Number(sp.get('minSimilarity') ?? 0);
  const q = sp.get('q')?.trim();
  const text = sp.get('text')?.trim();
  const projectId = Number(sp.get('projectId'));

  if (q || text || projectId) {
    // Students must not browse other teams' ideas, so search is staff-only.
    if (!isStaff(session)) throw new HttpError(403, 'Similarity search is limited to faculty and coordinators');
    if (text) {
      const { rows } = await pool.query(
        `SELECT p.project_id, p.title, p.status,
                ROUND(ts_rank(p.search_tsv, websearch_to_tsquery('english', $1))::numeric, 4) AS rank,
                ts_headline('english', p.abstract, websearch_to_tsquery('english', $1),
                            'StartSel=**,StopSel=**,MaxWords=30,MinWords=10') AS snippet
           FROM projects p
          WHERE p.search_tsv @@ websearch_to_tsquery('english', $1)
          ORDER BY rank DESC LIMIT $2`, [text, limit]);
      return json({ mode: 'fulltext', results: rows });
    }
    if (q) {
      const { vector } = await embedText(q);
      const { rows } = await pool.query(
        'SELECT * FROM fn_similar_projects($1::vector, $2, NULL, $3)', [toPgVector(vector), limit, minSim]);
      return json({ mode: 'semantic', results: rows });
    }
    await assertProjectAccess(pool, session, projectId);
    // Cosine-distance k-NN using the stored embedding of the source project, same course only.
    const { rows } = await pool.query(
      `SELECT * FROM fn_similar_projects(
         (SELECT embedding FROM project_embeddings WHERE project_id = $1), $2, $1, $3,
         (SELECT course_id FROM projects WHERE project_id = $1))`,
      [projectId, limit, minSim]);
    return json({ mode: 'neighbours', results: rows });
  }

  const status = sp.get('status');
  const { rows } = await pool.query(
    `SELECT p.project_id, p.team_id, p.title, p.abstract, p.problem_statement, p.objectives, p.scope,
            p.domain, p.technologies, p.repository_url, p.status, p.created_at,
            t.name AS team_name, c.code AS course_code, g.full_name AS guide_name, rv.full_name AS reviewer_name,
            COALESCE(sr.reviews, '[]'::jsonb) AS similarity_reviews,
            (SELECT f.body FROM feedback_items f WHERE f.project_id = p.project_id AND f.milestone_id IS NULL
              ORDER BY f.created_at DESC LIMIT 1) AS latest_guide_note
       FROM projects p
       JOIN teams t   ON t.team_id = p.team_id
       JOIN courses c ON c.course_id = p.course_id
       LEFT JOIN guide_allocations ga ON ga.project_id = p.project_id AND ga.is_active AND ga.allocation_role = 'guide'
       LEFT JOIN users g ON g.user_id = ga.guide_id
       LEFT JOIN guide_allocations gr ON gr.project_id = p.project_id AND gr.is_active AND gr.allocation_role = 'reviewer'
       LEFT JOIN users rv ON rv.user_id = gr.guide_id
       LEFT JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
                  'similarity_id', s.similarity_id, 'matched_project_id', s.matched_project_id,
                  'matched_title', mp.title, 'matched_text', left(coalesce(e.source_text, mp.abstract), 300),
                  'similarity_score', s.similarity_score, 'decision', s.decision)
                ORDER BY s.similarity_score DESC) AS reviews
           FROM similarity_reviews s
           JOIN projects mp ON mp.project_id = s.matched_project_id
           LEFT JOIN project_embeddings e ON e.project_id = mp.project_id
          WHERE s.project_id = p.project_id) sr ON TRUE
      WHERE ${projectScopeSql(session, 'p', 1)} AND ($2::text IS NULL OR p.status = $2)
      ORDER BY p.created_at DESC LIMIT $3`,
    [session.userId, status, limit]);
  return json({ proposals: rows });
});

/* Shared proposal fields */
const Fields = {
  title: z.string().trim().min(5).max(200),
  abstract: z.string().trim().min(30).max(5000),
  problemStatement: z.string().trim().min(20).max(3000),
  objectives: z.array(z.string().trim().min(3).max(300)).min(1).max(10),
  scope: z.string().trim().min(10).max(3000),
  domain: z.string().trim().min(2).max(100),
  technologies: z.array(z.string().trim().min(1).max(50)).min(1).max(15),
  repositoryUrl: z.string().trim().url().optional().or(z.literal('').transform(() => undefined)),
};

/** Stores the embedding and queues same-course matches above the threshold for faculty review. */
async function embedAndScan(c: PoolClient, projectId: number, courseId: number, text: string,
                            vector: number[], model: string) {
  const vec = toPgVector(vector);
  await c.query(
    `INSERT INTO project_embeddings (project_id, embedding, model, content_hash, source_text)
     VALUES ($1, $2::vector, $3, $4, $5)
     ON CONFLICT (project_id) DO UPDATE SET embedding = EXCLUDED.embedding, model = EXCLUDED.model,
       content_hash = EXCLUDED.content_hash, source_text = EXCLUDED.source_text, created_at = now()`,
    [projectId, vec, model, createHash('sha256').update(text).digest('hex'), text]);
  const threshold = defaultThreshold();
  const sim = await c.query('SELECT * FROM fn_similar_projects($1::vector, 5, $2, 0, $3)', [vec, projectId, courseId]);
  const flagged = sim.rows.filter((r) => Number(r.similarity) >= threshold);
  for (const m of flagged) {
    await c.query(
      `INSERT INTO similarity_reviews (project_id, matched_project_id, similarity_score)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, matched_project_id)
       DO UPDATE SET similarity_score = EXCLUDED.similarity_score, decision = 'pending',
                     reviewer_id = NULL, reviewed_at = NULL`,
      [projectId, m.project_id, m.similarity]);
  }
  return { similar: sim.rows, flaggedForReview: flagged.length, threshold };
}

/* POST /api/proposals — student creates a proposal + embedding + similarity scan (one transaction) */
const CreateBody = z.object({ teamId: z.number().int().positive(), ...Fields });

export const POST = handler(async (req) => {
  const session = await requireSession(['student']);
  const b = await parseBody(req, CreateBody);
  const text = proposalText({ title: b.title, abstract: b.abstract, problem_statement: b.problemStatement,
                              objectives: b.objectives, scope: b.scope });
  const { vector, model } = await embedText(text);          // model call kept OUTSIDE the transaction

  const result = await withTransaction(session.userId, async (c) => {
    const team = await c.query(
      `SELECT t.course_id FROM teams t JOIN team_members tm ON tm.team_id = t.team_id
        WHERE t.team_id = $1 AND tm.user_id = $2`, [b.teamId, session.userId]);
    if (!team.rowCount) throw new HttpError(403, 'You are not a member of this team');
    const courseId = Number(team.rows[0].course_id);

    const proj = await c.query(
      `INSERT INTO projects (team_id, course_id, title, abstract, problem_statement, objectives, scope,
                             domain, technologies, repository_url, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'proposed',$11) RETURNING project_id, title, status`,
      [b.teamId, courseId, b.title, b.abstract, b.problemStatement, b.objectives, b.scope, b.domain,
       b.technologies, b.repositoryUrl ?? null, session.userId]);
    const projectId = Number(proj.rows[0].project_id);
    await c.query(
      `INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
       VALUES ('projects', $1, 'PROPOSAL_SUBMITTED', $2::jsonb, $3)`,
      [String(projectId), JSON.stringify({ title: b.title }), session.userId]);
    const scan = await embedAndScan(c, projectId, courseId, text, vector, model);
    return { project: proj.rows[0], ...scan };
  });
  return json(result, 201);
});

/* PUT /api/proposals
 *   action=review   faculty guide: approved | rejected | revision_requested (+ similarity decisions)
 *   action=revise   student: edit a proposal that is proposed / revision_requested -> back to proposed
 *   action=allocate coordinator: set the active guide or reviewer for a project */
const PutBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('review'),
    projectId: z.number().int().positive(),
    decision: z.enum(['approved', 'rejected', 'revision_requested']),
    notes: z.string().max(2000).optional(),
    similarityDecisions: z.array(z.object({
      similarityId: z.number().int().positive(),
      decision: z.enum(['acceptable', 'plagiarism_suspected', 'duplicate']),
      notes: z.string().max(1000).optional(),
    })).default([]),
  }),
  z.object({ action: z.literal('revise'), projectId: z.number().int().positive(), ...Fields }),
  z.object({
    action: z.literal('allocate'),
    projectId: z.number().int().positive(),
    guideId: z.number().int().positive(),
    role: z.enum(['guide', 'reviewer']).default('guide'),
  }),
]);

export const PUT = handler(async (req) => {
  const session = await requireSession();
  const body = await parseBody(req, PutBody);

  if (body.action === 'allocate') {
    if (!isCoordinator(session)) throw new HttpError(403, 'Only coordinators can allocate guides and reviewers');
    return json(await withTransaction(session.userId, async (c) => {
      const needed = body.role === 'guide' ? 'faculty' : 'reviewer';
      const ok = await c.query(
        `SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1 AND r.role_name = ANY($2)`,
        [body.guideId, body.role === 'guide' ? ['faculty'] : ['reviewer', 'faculty']]);
      if (!ok.rowCount) throw new HttpError(400, `Selected user is not a ${needed}`);
      await c.query(
        'UPDATE guide_allocations SET is_active = FALSE WHERE project_id = $1 AND allocation_role = $2 AND is_active',
        [body.projectId, body.role]);
      const r = await c.query(
        `INSERT INTO guide_allocations (project_id, guide_id, allocation_role) VALUES ($1, $2, $3) RETURNING *`,
        [body.projectId, body.guideId, body.role]);
      await c.query(
        `INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
         VALUES ('guide_allocations', $1, 'ALLOCATE', $2::jsonb, $3)`,
        [String(r.rows[0].allocation_id), JSON.stringify({ projectId: body.projectId, userId: body.guideId, role: body.role }),
         session.userId]);
      return { allocation: r.rows[0] };
    }));
  }

  if (body.action === 'revise') {
    if (isStaff(session)) throw new HttpError(403, 'Only the student team can revise its proposal');
    const text = proposalText({ title: body.title, abstract: body.abstract, problem_statement: body.problemStatement,
                                objectives: body.objectives, scope: body.scope });
    const { vector, model } = await embedText(text);
    return json(await withTransaction(session.userId, async (c) => {
      await assertProjectAccess(c, session, body.projectId);
      const cur = await c.query('SELECT status, course_id FROM projects WHERE project_id = $1 FOR UPDATE', [body.projectId]);
      if (!['proposed', 'revision_requested'].includes(cur.rows[0].status))
        throw new HttpError(409, `A ${cur.rows[0].status} proposal can no longer be edited`);
      const upd = await c.query(
        `UPDATE projects SET title=$2, abstract=$3, problem_statement=$4, objectives=$5, scope=$6, domain=$7,
                technologies=$8, repository_url=$9, status='proposed'
          WHERE project_id = $1 RETURNING project_id, title, status`,
        [body.projectId, body.title, body.abstract, body.problemStatement, body.objectives, body.scope,
         body.domain, body.technologies, body.repositoryUrl ?? null]);
      const scan = await embedAndScan(c, body.projectId, Number(cur.rows[0].course_id), text, vector, model);
      return { project: upd.rows[0], ...scan };
    }));
  }

  // action === 'review'
  if (!isGuide(session)) throw new HttpError(403, 'Only faculty guides can decide proposals');
  if (body.decision !== 'approved' && !(body.notes && body.notes.trim().length >= 3))
    throw new HttpError(400, 'Notes are required when rejecting or requesting a revision');
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
      `UPDATE projects SET status = $2,
              start_date = CASE WHEN $2 = 'approved' THEN COALESCE(start_date, CURRENT_DATE) ELSE start_date END
        WHERE project_id = $1 RETURNING project_id, status`,
      [body.projectId, body.decision]);
    if (body.decision !== 'approved') {      // the team gets a tracked action item explaining why
      const prefix = body.decision === 'rejected' ? 'Proposal rejected' : 'Revision requested';
      await c.query(
        `INSERT INTO feedback_items (project_id, author_id, body, severity) VALUES ($1, $2, $3, 'high')`,
        [body.projectId, session.userId, `${prefix}: ${body.notes}`]);
    }
    return { project: upd.rows[0] };
  }));
});
