// Usage: node --env-file=.env.local scripts/migrate.mjs [--reset] [--seed]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');
const FILES = [
  'postgres/schema.sql',                    // 001 CREATE: tables, constraints, indexes
  'postgres/pgvector.sql',                  // 002 CREATE: vector table, HNSW index, k-NN function
  'postgres/advanced.sql',                  // 003 CREATE: functions, procedure, triggers, view
  'postgres/004_governance_extensions.sql', // 004 ALTER + DROP: schema evolution
];
const args = new Set(process.argv.slice(2));

if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (.env.local)'); process.exit(1); }
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

async function run(sql, label) {
  await client.query('BEGIN');
  try { await client.query(sql); await client.query('COMMIT'); console.log('✔', label); }
  catch (e) { await client.query('ROLLBACK'); throw e; }
}

try {
  await client.connect();
  if (args.has('--reset')) {
    console.log('Resetting public schema…');
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  for (const f of FILES) {
    const done = await client.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [f]);
    if (done.rowCount) { console.log('•', f, '(already applied)'); continue; }
    await run(read(f), f);
    await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [f]);
  }
  if (args.has('--seed')) await run(read('seed/seed.sql'), 'seed/seed.sql');
  console.log('Done. Next: npm run db:embed (generates proposal embeddings)');
} catch (e) {
  console.error('Migration failed:', e.message); process.exitCode = 1;
} finally { await client.end(); }
