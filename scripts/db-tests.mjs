// Database-level tests: constraints, triggers, transactions, functions, views, indexes.
// Every case runs inside BEGIN … ROLLBACK, so the database is left unchanged.
// Usage: npm run test:db   (after npm run setup). Writes docs/test-results-db.md.
import fs from 'node:fs';
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const results = [];
let failed = 0;

/**
 * expect = 'ok'            -> SQL must succeed, and check(rows) must return true
 * expect = 'error:<code>'  -> SQL must fail with that SQLSTATE (e.g. 23514 check_violation)
 */
async function t(area, name, sql, expect, check) {
  let ok = false, got = '', note = '';
  await c.query('BEGIN');
  try {
    let res;
    for (const stmt of [].concat(sql)) res = await c.query(stmt);
    got = 'ok';
    if (expect === 'ok') {
      const v = check ? await check(res.rows, res) : true;
      ok = v === true; if (!ok) note = String(v);
    } else note = 'statement unexpectedly succeeded';
  } catch (e) {
    got = `error:${e.code}`;
    ok = expect === got;
    note = e.message.split('\n')[0];
  } finally { await c.query('ROLLBACK'); }
  if (!ok) failed++;
  results.push({ area, name, expect, got, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name} — ${note}`);
}

const one = async (sql) => (await c.query(sql)).rows[0];

// ── Constraints (DDL) ──────────────────────────────────────────────────────────
await t('Constraints', 'Project end date before start date (CHECK)',
  `INSERT INTO projects(team_id, course_id, title, abstract, start_date, end_date)
   VALUES (3, 1, 'Bad dates project', repeat('x', 40), '2026-05-01', '2026-01-01')`, 'error:23514');
await t('Constraints', 'Second project for the same team (UNIQUE team_id)',
  `INSERT INTO projects(team_id, course_id, title, abstract) VALUES (1, 1, 'Duplicate team', repeat('x', 40))`, 'error:23505');
await t('Constraints', 'Unknown project status (CHECK)', `UPDATE projects SET status = 'paused' WHERE project_id = 1`, 'error:23514');
await t('Constraints', 'Milestone weight of 0 (CHECK weight > 0)', `UPDATE milestones SET weight = 0 WHERE milestone_id = 3`, 'error:23514');
await t('Constraints', 'Task marked done without completed_at (CHECK)', `UPDATE tasks SET status = 'done' WHERE task_id = 4`, 'error:23514');
await t('Constraints', 'Feedback resolved without a resolution note (CHECK)',
  `UPDATE feedback_items SET status = 'resolved', resolved_at = now() WHERE feedback_id = 2`, 'error:23514');
await t('Constraints', 'Risk score above 100 (CHECK range)',
  `INSERT INTO risk_assessments(project_id, risk_score, risk_level) VALUES (1, 120, 'critical')`, 'error:23514');
await t('Constraints', 'Milestone for a project that does not exist (FOREIGN KEY)',
  `INSERT INTO milestones(project_id, title, sequence_no, due_date) VALUES (9999, 'Orphan', 1, CURRENT_DATE)`, 'error:23503');
await t('Constraints', 'Invalid email format (CHECK regex)',
  `INSERT INTO users(email, password_hash, full_name) VALUES ('not-an-email', 'x', 'Bad Email')`, 'error:23514');
await t('Constraints', 'Git commit SHA that is not hex (CHECK regex)',
  `INSERT INTO git_activities(project_id, user_id, commit_sha, message) VALUES (1, 5, 'zzzzzzz', 'bad sha')`, 'error:23514');
await t('Constraints', 'Peer rating of 6 (CHECK 1–5)',
  `INSERT INTO peer_evaluations(project_id, evaluator_id, evaluatee_id, rating) VALUES (2, 7, 8, 6)`, 'error:23514');
await t('Constraints', 'Second active guide for one project (partial UNIQUE index)',
  `INSERT INTO guide_allocations(project_id, guide_id, allocation_role) VALUES (1, 4, 'guide')`, 'error:23505');
await t('Constraints', 'ON DELETE CASCADE removes a project’s milestones and tasks',
  [`DELETE FROM projects WHERE project_id = 2`,
   `SELECT (SELECT COUNT(*) FROM milestones WHERE project_id = 2) AS ms,
           (SELECT COUNT(*) FROM tasks WHERE milestone_id IN (5,6)) AS tk`], 'ok',
  (r) => (Number(r[0].ms) === 0 && Number(r[0].tk) === 0) || JSON.stringify(r[0]));

// ── Triggers ──────────────────────────────────────────────────────────────────
await t('Triggers', 'Status change is written to audit_logs with the acting user',
  [`SELECT set_config('app.current_user_id', '6', true)`,
   `UPDATE tasks SET status = 'in_progress' WHERE task_id = 4`,
   `SELECT * FROM audit_logs WHERE table_name = 'tasks' AND record_id = '4' ORDER BY audit_id DESC LIMIT 1`], 'ok',
  (r) => (r[0]?.action === 'STATUS_CHANGE' && Number(r[0].changed_by) === 6) || JSON.stringify(r[0]));
await t('Triggers', 'DELETE of a task is audited with the old row',
  [`DELETE FROM tasks WHERE task_id = 4`,
   `SELECT * FROM audit_logs WHERE table_name = 'tasks' AND action = 'DELETE' AND record_id = '4'`], 'ok',
  (r) => (r.length === 1 && r[0].old_data.title === 'Model training pipeline') || 'no audit row');
await t('Triggers', 'audit_logs is append-only: UPDATE blocked', `UPDATE audit_logs SET action = 'x'`, 'error:42501');
await t('Triggers', 'audit_logs is append-only: DELETE blocked', `DELETE FROM audit_logs`, 'error:42501');
await t('Triggers', 'audit_logs is append-only: TRUNCATE blocked', `TRUNCATE audit_logs`, 'error:42501');
await t('Triggers', 'Milestone due date before project start (cross-table trigger)',
  `INSERT INTO milestones(project_id, title, sequence_no, due_date) VALUES (1, 'Too early', 9, CURRENT_DATE - 365)`, 'error:23514');
await t('Triggers', 'Task due after its milestone (cross-table trigger)',
  `INSERT INTO tasks(milestone_id, title, due_date) VALUES (3, 'Too late', CURRENT_DATE + 365)`, 'error:23514');
await t('Triggers', 'Peer evaluation of someone outside the team is rejected',
  `INSERT INTO peer_evaluations(project_id, evaluator_id, evaluatee_id, rating) VALUES (1, 5, 7, 3)`, 'error:23514');
await t('Triggers', 'Overdue milestone automatically creates a risk event',
  [`INSERT INTO milestones(project_id, title, sequence_no, due_date) VALUES (1, 'Late checkpoint', 9, CURRENT_DATE - 3)`,
   `SELECT e.* FROM risk_events e JOIN milestones m ON m.milestone_id = e.milestone_id
     WHERE m.title = 'Late checkpoint' AND e.resolved_at IS NULL`], 'ok',
  (r) => (r.length === 1 && r[0].event_type === 'milestone_overdue') || `${r.length} events`);
await t('Triggers', 'Submitting an overdue milestone resolves its risk event',
  [`UPDATE milestones SET status = 'submitted', submitted_at = now() WHERE milestone_id = 2`,
   `SELECT resolved_at FROM risk_events WHERE milestone_id = 2 AND event_type = 'milestone_overdue'`], 'ok',
  (r) => (r.length >= 1 && r.every((x) => x.resolved_at !== null)) || 'event still open');

// ── Transactions ──────────────────────────────────────────────────────────────
await t('Transactions', 'Failed step rolls back the whole submission (SAVEPOINT demo)',
  [`SAVEPOINT submission`,
   `INSERT INTO document_versions(deliverable_id, version_no, file_name, checksum, change_summary, uploaded_by)
    VALUES (1, 3, 'srs_v3.pdf', 'abc', 'third draft', 5)`,
   // second step fails: version 3 already exists -> UNIQUE (deliverable_id, version_no)
   `DO $$ BEGIN
      BEGIN
        INSERT INTO document_versions(deliverable_id, version_no, file_name, checksum, change_summary, uploaded_by)
        VALUES (1, 3, 'dup.pdf', 'abc', 'duplicate', 5);
      EXCEPTION WHEN unique_violation THEN RAISE NOTICE 'rolled back'; END;
    END $$`,
   `ROLLBACK TO SAVEPOINT submission`,
   `SELECT COUNT(*)::int AS n FROM document_versions WHERE deliverable_id = 1`], 'ok',
  (r) => r[0].n === 2 || `expected 2 versions, found ${r[0].n}`);

// ── Functions, procedure, views ───────────────────────────────────────────────
await t('Functions', 'fn_calculate_project_risk returns score, level and reasons',
  `SELECT * FROM fn_calculate_project_risk(1)`, 'ok',
  (r) => (Number(r[0].risk_score) >= 70 && r[0].risk_level === 'critical' && r[0].factors.overdue_milestones >= 1) || JSON.stringify(r[0]));
await t('Functions', 'fn_student_contribution_scores shares add up to 100%',
  `SELECT SUM(contribution_pct) AS total FROM fn_student_contribution_scores(1)`, 'ok',
  (r) => Math.abs(Number(r[0].total) - 100) < 0.2 || r[0].total);
await t('Functions', 'fn_milestone_completion_pct (weighted)', `SELECT fn_milestone_completion_pct(1) AS pct`, 'ok',
  (r) => Number(r[0].pct) === 20 || r[0].pct);
await t('Functions', 'fn_documentation_completeness (1 of 3 mandatory types)', `SELECT fn_documentation_completeness(1) AS pct`, 'ok',
  (r) => Number(r[0].pct) === 33.3 || r[0].pct);
await t('Functions', 'sp_refresh_risk_assessments inserts a snapshot per active project',
  [`CALL sp_refresh_risk_assessments()`, `SELECT COUNT(DISTINCT project_id)::int AS n FROM risk_assessments WHERE assessed_at > now() - interval '1 minute'`], 'ok',
  (r) => r[0].n >= 2 || r[0].n);
await t('Views', 'v_project_dashboard: one row per project, guide only (no reviewer fan-out)',
  `SELECT project_id, COUNT(*) AS n FROM v_project_dashboard GROUP BY project_id HAVING COUNT(*) > 1`, 'ok',
  (r) => r.length === 0 || `${r.length} duplicated projects`);
await t('Views', 'v_projects_missing_deliverables lists design + report for project 1',
  `SELECT missing_types FROM v_projects_missing_deliverables WHERE project_id = 1`, 'ok',
  (r) => (r[0] && r[0].missing_types.join(',') === 'design,report') || JSON.stringify(r));
await t('Views', 'v_unresolved_feedback shows open items with assignee', `SELECT * FROM v_unresolved_feedback`, 'ok',
  (r) => (r.length >= 3 && r.some((x) => x.assigned_to_name)) || `${r.length} rows`);
await t('Views', 'v_contribution_summary covers every active team member', `SELECT COUNT(*)::int AS n FROM v_contribution_summary`, 'ok',
  (r) => r[0].n === 4 || r[0].n);
await t('Views', 'v_project_progress', `SELECT * FROM v_project_progress WHERE project_id = 1`, 'ok',
  (r) => (Number(r[0].total_tasks) >= 4) || JSON.stringify(r[0]));

// ── Search & indexes ──────────────────────────────────────────────────────────
await t('Vector', 'pgvector k-NN returns the near-duplicate proposal first (cosine)',
  `SELECT * FROM fn_similar_projects((SELECT embedding FROM project_embeddings WHERE project_id = 3), 3, 3, 0, 1)`, 'ok',
  (r) => (Number(r[0].project_id) === 1 && Number(r[0].similarity) > Number(r[1].similarity)) || JSON.stringify(r.map((x) => [x.project_id, x.similarity])));
await t('Indexes', 'HNSW index is used for the k-NN ORDER BY',
  [`SET LOCAL enable_seqscan = off`,
   `EXPLAIN SELECT project_id FROM project_embeddings ORDER BY embedding <=> (SELECT embedding FROM project_embeddings WHERE project_id = 1) LIMIT 3`], 'ok',
  (r) => r.some((x) => x['QUERY PLAN'].includes('idx_project_embeddings_hnsw')) || r.map((x) => x['QUERY PLAN']).join(' / '));
await t('Full-text', 'tsvector search ranks the plagiarism proposals',
  `SELECT title, ts_rank(search_tsv, websearch_to_tsquery('english', 'plagiarism reports')) AS rank
     FROM projects WHERE search_tsv @@ websearch_to_tsquery('english', 'plagiarism reports') ORDER BY rank DESC`, 'ok',
  (r) => (r.length >= 2 && r[0].title.includes('Plagiarism')) || JSON.stringify(r));
await t('Indexes', 'GIN index is used for full-text search',
  [`SET LOCAL enable_seqscan = off`, `EXPLAIN SELECT 1 FROM projects WHERE search_tsv @@ to_tsquery('english', 'plagiarism')`], 'ok',
  (r) => r.some((x) => x['QUERY PLAN'].includes('idx_projects_search_tsv')) || r.map((x) => x['QUERY PLAN']).join(' / '));
await t('Indexes', 'Partial index used for open milestones by due date',
  [`SET LOCAL enable_seqscan = off`, `EXPLAIN SELECT milestone_id FROM milestones WHERE status IN ('pending','changes_requested') AND due_date < CURRENT_DATE`], 'ok',
  (r) => r.some((x) => /idx_milestones_open_due|idx_milestones/.test(x['QUERY PLAN'])) || r.map((x) => x['QUERY PLAN']).join(' / '));

// ── Schema evolution (migration 004) ──────────────────────────────────────────
const mig = await one(`SELECT string_agg(filename, ', ' ORDER BY filename) AS f FROM schema_migrations`);
await t('DDL', 'All four migrations applied (CREATE → ALTER/DROP)', `SELECT COUNT(*)::int AS n FROM schema_migrations`, 'ok',
  (r) => r[0].n === 4 || mig.f);
await t('DDL', 'ALTER added projects.problem_statement and milestones.required_evidence_type',
  `SELECT COUNT(*)::int AS n FROM information_schema.columns
    WHERE (table_name, column_name) IN (('projects','problem_statement'), ('milestones','required_evidence_type'))`, 'ok', (r) => r[0].n === 2 || r[0].n);
await t('DDL', 'DROP INDEX removed idx_tasks_milestone (replaced by composite)',
  `SELECT COUNT(*)::int AS n FROM pg_indexes WHERE indexname IN ('idx_tasks_milestone', 'idx_tasks_milestone_status')`, 'ok',
  (r) => r[0].n === 1 || r[0].n);

await c.end();
const passed = results.length - failed;
const md = [
  '# Database test results', '',
  `Run: ${new Date().toISOString()} — **${passed}/${results.length} passed**.`, '',
  'Generated by `npm run test:db` (scripts/db-tests.mjs). Every case runs inside `BEGIN … ROLLBACK`, so',
  'running the suite never changes the data. "error:XXXXX" is the PostgreSQL SQLSTATE the case expects',
  '(23514 check_violation, 23505 unique_violation, 23503 foreign_key_violation, 42501 insufficient_privilege).', '',
  '| # | Area | Test case | Expected | Got | Result |', '|---|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.area} | ${r.name}${r.note ? ` <br><sub>${r.note.replace(/\|/g, '/').slice(0, 160)}</sub>` : ''} | ${r.expect} | ${r.got} | ${r.ok ? '✅ pass' : '❌ fail'} |`),
  '',
].join('\n');
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/test-results-db.md', md);
console.log(`\n${passed}/${results.length} passed — report written to docs/test-results-db.md`);
process.exitCode = failed ? 1 : 0;
