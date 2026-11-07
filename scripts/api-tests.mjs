// End-to-end API tests against a running app (npm run dev / npm start) on a freshly
// seeded database (npm run setup). Usage: npm run test:api
// Writes a Markdown report to docs/test-results-api.md.
import fs from 'node:fs';
import pg from 'pg';

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
const q1 = async (sql, p = []) => (await db.query(sql, p)).rows[0];

const results = [];
let failed = 0;
const today = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const days = (n) => iso(new Date(today.getTime() + n * 86400000));
const run = Date.now().toString(36);                // keeps reruns independent

/** A logged-in client with its own cookie jar. */
async function as(email, password = 'password123') {
  let cookie = '';
  const call = async (method, path, body) => {
    const res = await fetch(BASE + path, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie'); if (set) cookie = set.split(';')[0];
    let data = null; try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data };
  };
  if (email) {
    const r = await call('POST', '/api/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login failed for ${email}: ${r.status} ${JSON.stringify(r.data)}`);
  }
  return { get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), put: (p, b) => call('PUT', p, b), del: (p) => call('DELETE', p) };
}

/** Records one test case: expected HTTP status (+ optional extra assertion). */
async function t(area, name, promise, expectStatus, check) {
  let r, ok, note = '';
  try {
    r = await promise;
    ok = r.status === expectStatus;
    if (ok && check) { const c = await check(r); if (c !== true) { ok = false; note = String(c); } }
    if (!ok && !note) note = `got ${r.status}: ${JSON.stringify(r.data?.error ?? r.data).slice(0, 140)}`;
    if (ok) note = r.data?.error ? `“${r.data.error}”` : '';
  } catch (e) { ok = false; note = e.message; }
  if (!ok) failed++;
  results.push({ area, name, expect: expectStatus, got: r?.status ?? 'ERR', ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}${note ? ' — ' + note : ''}`);
  return r;
}

// ── Authentication & authorisation ────────────────────────────────────────────
const anon = await as(null);
await t('Auth', 'Wrong password is rejected', anon.post('/api/auth/login', { email: 'alice@pulse.edu', password: 'nope' }), 401);
await t('Auth', 'Anonymous request is rejected', anon.get('/api/milestones'), 401);
const alice = await as('alice@pulse.edu');
const admin = await as('admin@pulse.edu');
const coord = await as('coordinator@pulse.edu');
const guide1 = await as('guide1@pulse.edu');
const guide2 = await as('guide2@pulse.edu');
const reviewer = await as('reviewer@pulse.edu');
await t('Auth', 'Student cannot open the faculty risk dashboard', alice.get('/api/risk-dashboard'), 403);
await t('Auth', "Student cannot read another team's tasks (project 2)", alice.get('/api/tasks?projectId=2'), 403);
await t('Auth', "Student cannot browse other teams' ideas (similarity search)", alice.get('/api/proposals?q=attendance'), 403);
await t('Auth', 'Guide 2 cannot see project 1 (not allocated)', guide2.get('/api/tasks?projectId=1'), 403);
await t('Auth', 'Reviewer cannot approve a milestone', reviewer.put('/api/milestones', { milestoneId: 5, decision: 'approved' }), 403);
await t('Auth', 'Coordinator cannot create user accounts (admin only)',
  coord.post('/api/users', { email: `x${run}@pulse.edu`, fullName: 'X', password: 'password123', role: 'student', enrollmentNo: 'X1' }), 403);

// ── Users & teams ─────────────────────────────────────────────────────────────
await t('Users', 'Admin creates a student account (bcrypt in PostgreSQL)',
  admin.post('/api/users', { email: `frank.${run}@pulse.edu`, fullName: 'Frank Rao', password: 'password123', role: 'student', enrollmentNo: `F${run}` }), 201,
  async () => { const u = await q1(`SELECT password_hash FROM users WHERE email = $1`, [`frank.${run}@pulse.edu`]);
                return u.password_hash.startsWith('$2') || 'hash is not bcrypt'; });
await t('Users', 'Duplicate email is rejected (UNIQUE)',
  admin.post('/api/users', { email: `frank.${run}@pulse.edu`, fullName: 'Frank Again', password: 'password123', role: 'student', enrollmentNo: `G${run}` }), 409);
await t('Users', 'Short password is rejected (validation)',
  admin.post('/api/users', { email: `y${run}@pulse.edu`, fullName: 'Y', password: 'short', role: 'student', enrollmentNo: 'Y1' }), 400);
await admin.post('/api/users', { email: `grace.${run}@pulse.edu`, fullName: 'Grace Pai', password: 'password123', role: 'student', enrollmentNo: `G${run}` });
const frankId = Number((await q1('SELECT user_id FROM users WHERE email = $1', [`frank.${run}@pulse.edu`])).user_id);
const graceId = Number((await q1('SELECT user_id FROM users WHERE email = $1', [`grace.${run}@pulse.edu`])).user_id);

const teamRes = await t('Teams', 'Coordinator creates Team Delta with two members (one transaction)',
  coord.post('/api/teams', { courseId: 1, name: `Team Delta ${run}`, members: [
    { userId: frankId, memberRole: 'leader', responsibility: 'Backend + database' },
    { userId: graceId, memberRole: 'member', responsibility: 'Frontend + testing' }] }), 201);
const teamId = teamRes.data?.teamId;
await t('Teams', 'Same team name in the same course is rejected (UNIQUE)',
  coord.post('/api/teams', { courseId: 1, name: `Team Delta ${run}`, members: [{ userId: 5 }] }), 409);
await t('Teams', 'A student cannot join two teams in one course', coord.put('/api/teams', { teamId: 1, userId: frankId }), 409);
await t('Teams', 'Removing a member who has task work is refused', coord.del('/api/teams?teamId=1&userId=5'), 409);

// ── Proposal → similarity → revision → approval ───────────────────────────────
const frank = await as(`frank.${run}@pulse.edu`);
const grace = await as(`grace.${run}@pulse.edu`);
const proposal = {
  teamId, title: 'Classroom Attendance System with Face Recognition',
  abstract: 'An automatic attendance tool that identifies students in a classroom from a camera feed using a face recognition neural network and records who is present.',
  problemStatement: 'Manual roll call wastes lecture time and proxy attendance is common.',
  objectives: ['Recognise students from a camera', 'Record attendance automatically'],
  scope: 'One classroom pilot for enrolled students.', domain: 'Computer Vision',
  technologies: ['Python', 'OpenCV'], repositoryUrl: '',
};
await t('Proposals', 'Proposal with a too-short abstract is rejected (validation)', frank.post('/api/proposals', { ...proposal, abstract: 'too short' }), 400);
const created = await t('Proposals', 'Student submits a proposal; pgvector flags the similar attendance project', frank.post('/api/proposals', proposal), 201,
  (r) => r.data.flaggedForReview >= 1 || `flagged ${r.data.flaggedForReview}, top match ${JSON.stringify(r.data.similar?.[0])}`);
const projectId = Number(created?.data?.project?.project_id);
await t('Proposals', 'A team can only own one project (UNIQUE team_id)', frank.post('/api/proposals', { ...proposal, title: 'Second project idea' }), 409);
await t('Proposals', 'Coordinator allocates guide 1', coord.put('/api/proposals', { action: 'allocate', projectId, guideId: 3, role: 'guide' }), 200);
await t('Proposals', 'Coordinator allocates the reviewer', coord.put('/api/proposals', { action: 'allocate', projectId, guideId: 10, role: 'reviewer' }), 200);
await t('Proposals', 'Approval is blocked while a similarity review is pending', guide1.put('/api/proposals', { action: 'review', projectId, decision: 'approved' }), 409);
await t('Proposals', 'Request revision without notes is rejected', guide1.put('/api/proposals', { action: 'review', projectId, decision: 'revision_requested' }), 400);
await t('Proposals', 'Guide requests a revision', guide1.put('/api/proposals', { action: 'review', projectId, decision: 'revision_requested',
  notes: 'Explain how this differs from the Smart Campus Attendance project.' }), 200);
await t('Proposals', 'Student revises the proposal (re-embedded, back to proposed)', frank.put('/api/proposals', { action: 'revise', projectId, ...proposal,
  scope: 'Focus on lab sessions with liveness detection to stop photo spoofing; one lab pilot.' }), 200);
const sim = await q1(`SELECT similarity_id FROM similarity_reviews WHERE project_id = $1 ORDER BY similarity_score DESC LIMIT 1`, [projectId]);
await t('Proposals', 'Guide records the similarity decision and approves', guide1.put('/api/proposals', { action: 'review', projectId, decision: 'approved',
  similarityDecisions: [{ similarityId: Number(sim.similarity_id), decision: 'acceptable', notes: 'Different scope: lab + liveness detection' }] }), 200,
  async () => (await q1(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE table_name = 'similarity_reviews' AND action = 'SIMILARITY_DECISION'`)).n >= 1 || 'no audit row');
await t('Search', 'Keyword full-text search finds the attendance projects', guide1.get('/api/proposals?text=face%20recognition%20attendance'), 200,
  (r) => r.data.results.length >= 1 || 'no full-text results');
await t('Search', 'Semantic search ranks by cosine similarity', guide1.get('/api/proposals?q=detect%20copied%20student%20reports'), 200,
  (r) => r.data.results[0]?.title?.includes('Plagiarism') || `top was ${r.data.results[0]?.title}`);

// ── Milestones & tasks ────────────────────────────────────────────────────────
await t('Milestones', 'Due date before the project start is rejected (trigger)', guide1.post('/api/milestones/manage',
  { projectId, title: 'Too early', dueDate: days(-5), weight: 10 }), 400);
await t('Milestones', 'Weight above 100 is rejected', guide1.post('/api/milestones/manage', { projectId, title: 'Too heavy', dueDate: days(10), weight: 120 }), 400);
const ms = await t('Milestones', 'Guide plans milestone 1 (SRS, 40%)', guide1.post('/api/milestones/manage',
  { projectId, title: 'Requirements (SRS)', dueDate: days(14), weight: 40, requiredEvidenceType: 'srs' }), 201);
const milestoneId = Number(ms?.data?.milestone?.milestone_id);
await guide1.post('/api/milestones/manage', { projectId, title: 'Design document', dueDate: days(30), weight: 30, requiredEvidenceType: 'design' });
await t('Milestones', 'Total milestone weight cannot exceed 100%', guide1.post('/api/milestones/manage', { projectId, title: 'Extra', dueDate: days(40), weight: 40 }), 400);

await t('Tasks', 'Task due after its milestone is rejected (trigger)', frank.post('/api/tasks', { milestoneId, title: 'Late task', dueDate: days(20) }), 400);
await t('Tasks', 'Assigning a non-member is rejected', frank.post('/api/tasks', { milestoneId, title: 'Bad assign', assigneeIds: [5] }), 400);
const task = await t('Tasks', 'Student creates a task assigned to a teammate', frank.post('/api/tasks',
  { milestoneId, title: 'Draft SRS sections 1–3', dueDate: days(10), estimatedHours: 6, assigneeIds: [graceId] }), 201);
const taskId = Number(task?.data?.task?.task_id);
await t('Tasks', 'Assignee logs hours', grace.put('/api/tasks', { action: 'log_hours', taskId, hours: 3 }), 200);
await t('Tasks', 'Non-assignee cannot log hours', frank.put('/api/tasks', { action: 'log_hours', taskId, hours: 2 }), 403);
await t('Tasks', 'Task moved to done (completed_at set for the CHECK)', grace.put('/api/tasks', { action: 'status', taskId, status: 'done' }), 200);
await t('Tasks', 'A completed task cannot be deleted', frank.del(`/api/tasks?taskId=${taskId}`), 409);
const tmp = await frank.post('/api/tasks', { milestoneId, title: 'Duplicate task by mistake' });
await t('Tasks', 'An incorrect task is deleted (DELETE + audit trigger)', frank.del(`/api/tasks?taskId=${tmp.data.task.task_id}`), 200,
  async () => (await q1(`SELECT COUNT(*)::int AS n FROM audit_logs WHERE table_name = 'tasks' AND action = 'DELETE' AND record_id = $1`,
                       [String(tmp.data.task.task_id)])).n === 1 || 'no DELETE audit row');
const tmp2 = await frank.post('/api/tasks', { milestoneId, title: 'Pair review', assigneeIds: [frankId, graceId] });
await t('Tasks', 'One task assignment is removed (DELETE)', frank.del(`/api/tasks?taskId=${tmp2.data.task.task_id}&userId=${graceId}`), 200);

// ── Submission: PostgreSQL transaction + MongoDB document ─────────────────────
const submit = { milestoneId, title: 'SRS', fileName: 'srs_v1.pdf', changeSummary: 'First complete SRS draft',
  sections: [{ heading: 'Introduction', content: 'Purpose and scope.' }, { heading: 'Functional Requirements', content: 'FR1–FR12.' }] };
await t('Submission', 'Student submits a deliverable (PG transaction + MongoDB version)', frank.post('/api/milestones', submit), 201,
  async (r) => (await q1('SELECT mongo_version_id FROM document_versions WHERE deliverable_id = $1 AND version_no = 1', [r.data.deliverableId]))
                 ?.mongo_version_id === r.data.mongoVersionId || 'Mongo pointer missing');
const before = await q1('SELECT COUNT(*)::int AS n FROM document_versions');
await t('Submission', 'Re-submitting a submitted milestone is refused and rolled back', frank.post('/api/milestones', submit), 409,
  async () => (await q1('SELECT COUNT(*)::int AS n FROM document_versions')).n === before.n || 'a version row leaked');
await t('Review', 'Reviewer records a rubric review (milestone → under_review)', reviewer.post('/api/reviews', { milestoneId, comments: 'Clear FRs; add NFRs.',
  rubric: { problem_understanding: 8, database_design: 7, implementation: 6, documentation: 8, presentation: 7 } }), 201,
  async () => (await q1('SELECT status FROM milestones WHERE milestone_id = $1', [milestoneId])).status === 'under_review' || 'status not under_review');
await t('Review', 'Rubric score above 10 is rejected', reviewer.post('/api/reviews', { milestoneId, comments: 'x x x',
  rubric: { problem_understanding: 11, database_design: 7, implementation: 6, documentation: 8, presentation: 7 } }), 400);
await t('Review', 'Guide requests changes → feedback item opened', guide1.put('/api/milestones', { milestoneId, decision: 'changes_requested',
  comments: 'Add non-functional requirements.' }), 200);
await t('Submission', 'Version 2 after changes requested', frank.post('/api/milestones', { ...submit, fileName: 'srs_v2.pdf', changeSummary: 'Added NFRs',
  sections: [...submit.sections, { heading: 'Non-Functional Requirements', content: 'Performance, security.' }] }), 201,
  (r) => r.data.versionNo === 2 || `version ${r.data.versionNo}`);
await t('Review', 'Guide approves the milestone', guide1.put('/api/milestones', { milestoneId, decision: 'approved', score: 85 }), 200);

// ── Feedback workflow ─────────────────────────────────────────────────────────
await t('Feedback', 'Assigning feedback to a non-member is rejected (trigger)', guide1.post('/api/feedback',
  { projectId, body: 'Please add a test plan.', severity: 'high', assignedTo: 5 }), 400);
const fb = await t('Feedback', 'Guide raises feedback assigned to Grace', guide1.post('/api/feedback',
  { projectId, body: 'Please add a test plan.', severity: 'high', assignedTo: graceId }), 201);
const feedbackId = Number(fb?.data?.feedback?.feedback_id);
await t('Feedback', 'Resolving without a note is rejected', grace.put('/api/feedback', { feedbackId, action: 'resolve' }), 400);
await t('Feedback', 'Student resolves with a note', grace.put('/api/feedback', { feedbackId, action: 'resolve', resolutionNote: 'Added section 6: test plan.' }), 200);
await t('Feedback', 'Student cannot verify their own fix', grace.put('/api/feedback', { feedbackId, action: 'verify' }), 403);
await t('Feedback', 'Guide verifies the resolution', guide1.put('/api/feedback', { feedbackId, action: 'verify' }), 200);

// ── Contribution evidence ─────────────────────────────────────────────────────
await t('Contribution', 'Invalid commit SHA is rejected', frank.post('/api/contributions', { type: 'git', projectId, commitSha: 'xyz', message: 'init' }), 400);
await t('Contribution', 'Valid commit recorded and linked to a task', grace.post('/api/contributions',
  { type: 'git', projectId, commitSha: `ab12cd34${run}`.replace(/[^0-9a-f]/g, 'a').slice(0, 12), message: 'SRS markdown', taskId }), 201);
await t('Contribution', 'Self peer-evaluation is rejected (CHECK evaluator <> evaluatee)', frank.post('/api/contributions',
  { type: 'peer', projectId, evaluateeId: frankId, rating: 5 }), 400);
await t('Contribution', 'Peer evaluation of a teammate', frank.post('/api/contributions', { type: 'peer', projectId, evaluateeId: graceId, rating: 4, comments: 'Solid SRS work' }), 201);
await t('Contribution', 'Student sees only their own contribution row', grace.get(`/api/contributions?projectId=${projectId}`), 200,
  (r) => (r.data.contributions.length === 1 && Number(r.data.contributions[0].user_id) === graceId) || `rows: ${r.data.contributions.length}`);
await t('Contribution', 'Guide sees every member with a share %', guide1.get(`/api/contributions?projectId=${projectId}`), 200,
  (r) => r.data.contributions.length === 2 || `rows: ${r.data.contributions.length}`);

// ── Risk & reports ────────────────────────────────────────────────────────────
await t('Risk', 'Coordinator recalculates risk for all projects (stored procedure)', coord.post('/api/risk-dashboard', {}), 200);
await t('Risk', 'Delayed / high-risk projects (JOIN + GROUP BY + HAVING)', guide1.get('/api/risk-dashboard'), 200,
  (r) => r.data.projects.some((p) => Number(p.project_id) === 1) || 'project 1 should be listed');
await t('Reports', 'Reports include SQL reports and MongoDB aggregations', guide1.get('/api/reports'), 200,
  (r) => (r.data.documents?.perProject?.length >= 1 && Array.isArray(r.data.missingDocs) && Array.isArray(r.data.overdueTeams)) || 'missing sections');
await t('Reports', 'Students cannot open reports', alice.get('/api/reports'), 403);

// ── Report ────────────────────────────────────────────────────────────────────
await db.end();
const passed = results.length - failed;
const md = [
  '# API test results', '',
  `Run: ${new Date().toISOString()} against \`${BASE}\` — **${passed}/${results.length} passed**.`, '',
  'Generated by `npm run test:api` (scripts/api-tests.mjs). Each case calls the real Next.js route handlers,',
  'which talk to PostgreSQL, pgvector and MongoDB. Expected failures (4xx) are part of the test: they show',
  'that validation, authorisation and database constraints reject bad input.', '',
  '| # | Area | Test case | Expected | Got | Result |', '|---|---|---|---|---|---|',
  ...results.map((r, i) => `| ${i + 1} | ${r.area} | ${r.name}${r.note ? ` <br><sub>${r.note.replace(/\|/g, '/')}</sub>` : ''} | ${r.expect} | ${r.got} | ${r.ok ? '✅ pass' : '❌ fail'} |`),
  '',
].join('\n');
fs.mkdirSync('docs', { recursive: true });
fs.writeFileSync('docs/test-results-api.md', md);
console.log(`\n${passed}/${results.length} passed — report written to docs/test-results-api.md`);
process.exitCode = failed ? 1 : 0;
