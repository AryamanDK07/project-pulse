// Usage: npm run db:embed            (embed projects that have no vector yet)
//        npm run db:reembed          (delete ALL vectors and rebuild — use after changing EMBEDDING_PROVIDER)
// Generates embeddings for every project lacking one and queues similarity reviews
// for proposals that match another project in the SAME COURSE above SIMILARITY_THRESHOLD.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { defaultThreshold, embedText, embeddingProvider, proposalText, toPgVector } from '../src/lib/embeddings';

const threshold = defaultThreshold();
const rebuild = process.argv.includes('--all');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  console.log(`Embedding provider: ${embeddingProvider()} · review threshold: ${threshold}`);
  if (rebuild) {
    await client.query('DELETE FROM project_embeddings');
    await client.query(`DELETE FROM similarity_reviews WHERE decision = 'pending'`);
    console.log('Removed existing vectors and pending similarity reviews');
  }
  const models = await client.query('SELECT DISTINCT model FROM project_embeddings');
  const expected = { minilm: 'all-MiniLM-L6-v2', openai: 'text-embedding-3-small@384', hash: 'local-hash-384' }[embeddingProvider()];
  if (models.rows.some((r) => r.model !== expected))
    console.warn(`WARNING: database holds vectors from another model (${models.rows.map((r) => r.model).join(', ')}). Run: npm run db:reembed`);
  const { rows } = await client.query(
    `SELECT p.project_id, p.title, p.abstract, p.problem_statement, p.objectives, p.scope
       FROM projects p LEFT JOIN project_embeddings e ON e.project_id = p.project_id
      WHERE e.project_id IS NULL`);
  for (const p of rows) {
    const text = proposalText(p);
    const { vector, model } = await embedText(text);
    await client.query(
      `INSERT INTO project_embeddings(project_id, embedding, model, content_hash, source_text)
       VALUES ($1,$2::vector,$3,$4,$5)`,
      [p.project_id, toPgVector(vector), model, createHash('sha256').update(text).digest('hex'), text]);
    console.log('embedded project', p.project_id, `(${model})`);
  }
  const proposals = await client.query(`SELECT project_id, course_id FROM projects WHERE status = 'proposed'`);
  for (const { project_id, course_id } of proposals.rows) {
    const sim = await client.query(
      `SELECT * FROM fn_similar_projects((SELECT embedding FROM project_embeddings WHERE project_id=$1), 5, $1, $2, $3)`,
      [project_id, threshold, course_id]);
    for (const m of sim.rows) {
      await client.query(
        `INSERT INTO similarity_reviews(project_id, matched_project_id, similarity_score) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`, [project_id, m.project_id, m.similarity]);
      console.log(`proposal ${project_id} ~ project ${m.project_id}: ${m.similarity}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => client.end());
