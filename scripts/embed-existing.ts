// Usage: npm run db:embed
// Generates embeddings for every project lacking one and queues similarity reviews
// for proposals that match another project above SIMILARITY_THRESHOLD.
import { createHash } from 'node:crypto';
import pg from 'pg';
import { embedText, toPgVector } from '../src/lib/embeddings';

const threshold = Number(process.env.SIMILARITY_THRESHOLD ?? (process.env.OPENAI_API_KEY ? 0.75 : 0.3));
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const { rows } = await client.query(
    `SELECT p.project_id, p.title, p.abstract FROM projects p
      LEFT JOIN project_embeddings e ON e.project_id = p.project_id WHERE e.project_id IS NULL`);
  for (const p of rows) {
    const text = `${p.title}. ${p.abstract}`;
    const { vector, model } = await embedText(text);
    await client.query(
      `INSERT INTO project_embeddings(project_id, embedding, model, content_hash) VALUES ($1,$2::vector,$3,$4)`,
      [p.project_id, toPgVector(vector), model, createHash('sha256').update(text).digest('hex')]);
    console.log('embedded project', p.project_id);
  }
  const proposals = await client.query(`SELECT project_id FROM projects WHERE status = 'proposed'`);
  for (const { project_id } of proposals.rows) {
    const sim = await client.query(
      `SELECT * FROM fn_similar_projects((SELECT embedding FROM project_embeddings WHERE project_id=$1), 5, $1, $2)`,
      [project_id, threshold]);
    for (const m of sim.rows) {
      await client.query(
        `INSERT INTO similarity_reviews(project_id, matched_project_id, similarity_score) VALUES ($1,$2,$3)
         ON CONFLICT DO NOTHING`, [project_id, m.project_id, m.similarity]);
      console.log(`proposal ${project_id} ~ project ${m.project_id}: ${m.similarity}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => client.end());
