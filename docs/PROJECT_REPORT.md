# ProjectPulse — Academic Project Governance, Originality and Milestone Risk Monitor

**DBMS Experiential Learning — Level 3 Project** · Team of two

| | |
|---|---|
| Team members | **Member 1:** Tarun Gowda P (PES1UG24AM303) · **Member 2:** Aryaman D K (PES1UG24AM344) |
| Domain | Education Technology / Academic Project Management |
| Stack | Next.js 15 (App Router + Route Handlers) · PostgreSQL 16 · pgvector · MongoDB 7/8 · Git/GitHub |
| Repository | https://github.com/AryamanDK07/project-pulse |

**Contents:**
1. [Problem statement](#1-problem-statement)
2. [Objectives](#2-objectives)
3. [Scope](#3-scope)
4. [Functional requirements](#4-functional-requirements)
5. [Roles](#5-roles-and-authorisation)
6. [ER diagram](#6-er-diagram)
7. [Relational schema](#7-relational-schema)
8. [Database choice and justification](#8-database-choice-and-justification)
9. [Data dictionary](#9-data-dictionary)
10. [Implementation: SQL, NoSQL, vector](#10-implementation)
11. [Important queries](#11-important-queries)
12. [Advanced features](#12-advanced-database-features)
13. [Architecture](#13-system-architecture)
14. [Screenshots](#14-application-screenshots)
15. [Testing](#15-testing-results)
16. [Individual contribution](#16-individual-contribution)
17. [Conclusion and future work](#17-conclusion-and-future-enhancements)
18. [Requirement checklist](#18-requirement-traceability)

---

## 1. Problem statement
Educational institutions often discover delayed milestones, unequal team contribution, incomplete documentation,
unresolved faculty feedback, and substantially overlapping project proposals only near final evaluation.
ProjectPulse is a Next.js academic project-governance platform. It uses PostgreSQL, MongoDB and pgvector to
manage proposals, teams, milestones, tasks, document evidence, feedback, contribution indicators,
delivery-risk alerts and semantic similarity screening. It supports timely faculty intervention and fair,
transparent monitoring, while leaving evaluation and originality decisions to people.

**Why it matters.** Faculty supervise many teams at once and need one dashboard to spot delayed projects early.
A final report alone cannot show who did what, how documents evolved, or whether feedback was acted on.
Institutions also need to catch overlapping ideas *before* teams spend a semester building the same system.

## 2. Objectives
1. A structured workflow from proposal → approval → milestones → submissions → review → completion.
2. Tracking of teams, guides, reviewers, milestones, tasks, deadlines, deliverables, document versions, reviews and feedback.
3. An evidence-based contribution record for each team member.
4. Explainable delivery-risk levels: overdue work, unverified evidence, unresolved feedback, inactivity and contribution imbalance.
5. Role-based dashboards for Students, Faculty Guides, Reviewers and Coordinators/Admins.
6. Semantic similarity search that flags conceptually similar proposals for faculty review.
7. Practical use of SQL, NoSQL, vector-database and advanced DBMS features in a working web app.

## 3. Scope
**Included:**
- proposal submission, revision and approval
- role-based access
- user, team and guide/reviewer allocation
- milestone and task tracking with planned and actual completion
- deliverable submission with version history (PostgreSQL metadata + MongoDB content)
- feedback workflow with assignment and verification
- reviewer rubric scoring
- contribution evidence: tasks, hours, Git commits, documents, verified feedback, peer evaluation
- risk scoring and risk events
- reports and dashboards
- semantic and keyword search

**Out of scope (future work):**
- automated plagiarism verdicts or final grading
- mandatory GitHub OAuth sync (commits are recorded manually)
- OCR of scanned documents
- binary file storage (files are registered by name, URL and checksum)
- e-mail or WhatsApp notifications
- predictive ML models

## 4. Functional requirements
| Module | Requirement | Implemented in |
|---|---|---|
| Authentication & roles | Log in; enforce role-based access for Student, Faculty Guide, Reviewer, Coordinator, Admin | `api/auth/*`, `lib/auth.ts`, `lib/scope.ts` |
| User management | Admin creates accounts (bcrypt in PostgreSQL), activates/deactivates them | `api/users` |
| Project proposal | Students submit title, abstract, problem statement, objectives, scope, domain, technologies, repository link | `api/proposals` POST, `ProposalForm.tsx` |
| Approval workflow | Faculty approve, reject or request revision with comments. Status changes and similarity decisions go to an append-only audit log | `api/proposals` PUT |
| Team management | Coordinator creates teams, adds/removes members, records responsibilities, allocates guide and reviewer | `api/teams`, `TeamAdmin.tsx` |
| Milestones & tasks | Guide plans dated, weighted milestones with a required evidence type. Team creates tasks, assigns members, moves status, logs hours. Planned date = `due_date`, actual = `completed_at` | `api/milestones/manage`, `api/tasks`, `TaskBoard.tsx` |
| Deliverables | Submit a version (file name/URL, checksum, change summary, SRS sections). Metadata goes to PostgreSQL, content and section history to MongoDB | `api/milestones` POST |
| Review & feedback | Reviewer scores a rubric. Guide approves or requests changes. Feedback can be assigned to one student, who resolves it; the guide then verifies | `api/reviews`, `api/milestones` PUT, `api/feedback` |
| Contribution tracking | Indicator from verified tasks, hours, evidence, commits, documents, verified feedback; peer ratings shown alongside | `fn_student_contribution_scores`, `api/contributions` |
| Risk monitoring | Low / medium / high / critical risk, with the reasons stored as JSON; events for overdue milestones and escalations | `fn_calculate_project_risk`, `risk_events` |
| Similarity review | Semantic search over proposal embeddings. Each match is shown with its text; faculty record the decision | `fn_similar_projects`, `similarity_reviews` |
| Reports | Delayed teams, unapproved milestones, unresolved feedback, missing deliverables, contribution imbalance, high-risk projects, document statistics | `api/reports`, `Reports.tsx` |

## 5. Roles and authorisation
| Role | Can do | Scope |
|---|---|---|
| Student | Submit/revise own proposal, manage team tasks, submit deliverables, resolve assigned feedback, record commits, rate teammates, view **own** contribution | Own team only |
| Faculty guide | Approve/reject/revise proposals, decide similarity reviews, plan milestones, approve milestones, raise and verify feedback, view contributions, risk and reports | Projects allocated as guide |
| Reviewer | Score rubric reviews of submissions, raise feedback, view reports | Projects allocated as reviewer |
| Coordinator | Everything a guide can, for all projects; create teams, allocate guides/reviewers, recalculate all risk | All projects |
| Admin | Coordinator rights + create and deactivate user accounts | All |

Every API route calls `requireSession(roles)`. Every project-level query is filtered by `projectScopeSql()`,
so a student who guesses another team's project id gets **403** (see the “Auth” API tests).

## 6. ER diagram
![ER diagram](diagrams/er-diagram.png)

Source: [`diagrams/er-diagram.mmd`](diagrams/er-diagram.mmd) (Mermaid; open it on GitHub or at mermaid.live to zoom).

Key relationships:
- One team has many members; a student belongs to at most one team per course.
- One team owns exactly one project (`UNIQUE(team_id)`); one project has many milestones.
- One milestone has many tasks, at most one deliverable, and many reviews and feedback items.
- Tasks and students are many-to-many through `task_assignments`.
- One deliverable has many document versions; each version points to a MongoDB version (`mongo_version_id`).
- One project has many risk assessments, risk events and similarity reviews over time.
- One project has one active guide and one active reviewer (partial unique index).
- All important actions write `audit_logs` rows.

## 7. Relational schema
Underlined = primary key, `→` = foreign key.

```
departments(_department_id_, name UQ, code UQ)
users(_user_id_, email UQ, password_hash, full_name, department_id→departments, enrollment_no UQ, is_active, created_at)
roles(_role_id_, role_name UQ ∈ {student, faculty, reviewer, coordinator, admin})
user_roles(_user_id→users, role_id→roles_)
courses(_course_id_, department_id→departments, code UQ, title, semester, academic_year)
course_required_documents(_course_id→courses, document_type_)
teams(_team_id_, course_id→courses, name, created_at, UQ(course_id, name))
team_members(_team_id→teams, user_id→users_, member_role, responsibility, joined_at)
projects(_project_id_, team_id→teams UQ, course_id→courses, title, abstract, problem_statement, objectives[],
         scope, domain, technologies[], repository_url, status, start_date, end_date, created_by→users,
         created_at, updated_at, search_tsv GENERATED)
guide_allocations(_allocation_id_, project_id→projects, guide_id→users, allocation_role ∈ {guide, reviewer}, is_active)
milestones(_milestone_id_, project_id→projects, title, description, sequence_no, due_date, status, weight,
           required_evidence_type, submitted_at, approved_at, UQ(project_id, sequence_no))
tasks(_task_id_, milestone_id→milestones, title, description, status, priority, due_date, estimated_hours,
      completed_at, created_by→users)
task_assignments(_task_id→tasks, user_id→users_, assigned_at, hours_logged)
deliverables(_deliverable_id_, milestone_id→milestones UQ, submitted_by→users, title, document_type, current_version_no)
document_versions(_version_id_, deliverable_id→deliverables, version_no, file_name, file_url, checksum,
                  mongo_version_id, change_summary, uploaded_by→users, uploaded_at, UQ(deliverable_id, version_no))
reviews(_review_id_, milestone_id→milestones, reviewer_id→users, decision, score, rubric, comments, reviewed_at)
feedback_items(_feedback_id_, review_id→reviews, milestone_id→milestones, project_id→projects, author_id→users,
               assigned_to→users, body, severity, status, resolution_note, resolved_by→users, resolved_at, created_at)
contribution_evidence(_evidence_id_, project_id→projects, user_id→users, task_id→tasks, evidence_type, description,
                      evidence_url, weight, recorded_at)
git_activities(_activity_id_, project_id→projects, user_id→users, task_id→tasks, commit_sha, commit_url, message,
               committed_at, recorded_at, UQ(project_id, commit_sha))
peer_evaluations(_evaluation_id_, project_id→projects, evaluator_id→users, evaluatee_id→users, rating, comments,
                 created_at, UQ(project_id, evaluator_id, evaluatee_id))
risk_assessments(_risk_id_, project_id→projects, risk_score, risk_level, factors, assessed_at)
risk_events(_event_id_, project_id→projects, milestone_id→milestones, event_type, details, created_at, resolved_at)
similarity_reviews(_similarity_id_, project_id→projects, matched_project_id→projects, similarity_score, reviewer_id→users,
                   decision, notes, created_at, reviewed_at, UQ(project_id, matched_project_id))
project_embeddings(_project_id→projects_, embedding vector(384), model, content_hash, source_text, created_at)
audit_logs(_audit_id_, table_name, record_id, action, old_data, new_data, changed_by, changed_at)
```
The schema is in 3NF: every non-key attribute depends on the whole key, and nothing but the key. Derived values
(progress %, contribution %, risk) are *computed* by functions and views, never stored twice. The one deliberate
exception is `risk_assessments`, which is a time-series snapshot kept for history.

**Referential actions.**
- Child rows of a project `CASCADE`.
- Users referenced as authors or uploaders are `RESTRICT`, so history is never orphaned.
- Optional links (`task_id`, `resolved_by`, `assigned_to`) use `SET NULL`.
- `audit_logs` has no foreign key on purpose, so logs outlive deleted rows.

## 8. Database choice and justification
| Data | Store | Why this store |
|---|---|---|
| Users, roles, teams, projects, milestones, tasks, assignments, reviews, feedback, evidence, risk, audit | **PostgreSQL** | Highly related, transactional workflow data. It needs PK/FK integrity, CHECK rules for states and dates, multi-row atomic updates (submission, review), joins and aggregates for dashboards, plus triggers and views |
| SRS / report content: versions → sections → requirements, plus section change history | **MongoDB** | Nested, variable-shape documents. An SRS has different sections from a design doc, and sections hold lists of requirements. Each version is one document append, and history is read as a whole tree. Relational tables would need 3–4 join tables and still couldn't absorb new section types without migrations |
| 384-dimension embeddings of proposal text | **pgvector** (in PostgreSQL) | Similarity is about *meaning*, which keywords can't capture. Keeping vectors next to projects means one transaction can insert the project, its vector and the similarity reviews, and the k-NN query can filter by course and status in the same SQL |

The stores are linked by ids. `document_versions.mongo_version_id` points to a MongoDB version, and that version stores `pgVersionId` back.
Submission writes MongoDB *inside* the PostgreSQL transaction. A Mongo failure rolls PostgreSQL back. A
PostgreSQL commit failure triggers a compensating Mongo delete (saga pattern).

## 9. Data dictionary
Full column-level dictionary, generated from the live catalog: **[data-dictionary.md](data-dictionary.md)**
(25 tables, 5 views, 17 functions/procedures, 18 triggers).

MongoDB collections:

| Collection | Fields | Indexes / validation |
|---|---|---|
| `srs_documents` | `projectId`, `milestoneId`, `deliverableId` (unique), `documentType`, `title`, `tags[]`, `currentVersion`, `versions[{ _id, versionNo, pgVersionId, createdBy, createdAt, changeSummary, checksum, sections[{ sectionId, heading, order, content, requirements[{ reqId, type, text, priority }] }] }]` | `$jsonSchema` validator; unique `deliverableId`; `{projectId, milestoneId}`; `documentType`; `tags`; `versions.createdAt`; **text** index on section heading + content |
| `srs_change_log` | `projectId`, `deliverableId`, `fromVersion`, `toVersion`, `sectionId`, `changeType` (added/modified/removed), `before`, `after`, `changedBy`, `changedAt` | `$jsonSchema`; `{deliverableId, toVersion}`; `{projectId, changedAt}` |

Example document:
```json
{ "projectId": 1, "milestoneId": 1, "deliverableId": 1, "documentType": "srs", "title": "SRS",
  "tags": ["Python", "FastAPI", "PostgreSQL"], "currentVersion": 2,
  "versions": [{ "versionNo": 1, "pgVersionId": 1, "createdBy": 5, "changeSummary": "Initial SRS",
                 "sections": [{ "sectionId": "S1", "heading": "Introduction", "order": 1, "content": "…", "requirements": [] }] }] }
```

## 10. Implementation
### 10.1 SQL — DDL lifecycle (`db/postgres/`, applied in order by `npm run db:migrate`, tracked in `schema_migrations`)
| File | DDL shown |
|---|---|
| `schema.sql` | **CREATE** EXTENSION / TABLE / INDEX: 20 tables, PK, FK with ON DELETE rules, NOT NULL, UNIQUE, CHECK (status sets, ranges, regex, cross-column date and state rules), B-tree, partial and GIN-trigram indexes |
| `pgvector.sql` | **CREATE** vector table, HNSW index, k-NN function |
| `advanced.sql` | **CREATE** functions, procedure, triggers, dashboard **VIEW** |
| `004_governance_extensions.sql` | **ALTER TABLE** ADD COLUMN / ADD CONSTRAINT / DROP CONSTRAINT (new role, proposal fields, revision status, evidence types, rubric, assignee, generated tsvector) · **DROP INDEX** (single-column index replaced by a composite one; old guide-uniqueness index replaced by a per-role one) · **DROP VIEW** + recreate · **DROP FUNCTION** where signatures changed · 5 new tables, 4 views, new triggers |

### 10.2 Database-level validation and integrity
- **Dates:**
  - CHECK `end_date >= start_date`
  - trigger: milestone due date inside the project window
  - trigger: task due date ≤ its milestone's due date
- **Workflow states:**
  - CHECK lists for every status column
  - `approved ⇒ approved_at IS NOT NULL`
  - `done ⇒ completed_at IS NOT NULL`
  - `resolved/verified ⇒ resolution_note`
- **Ranges and formats:**
  - weight in (0, 100]
  - scores 0–100, rubric 0–10, peer rating 1–5
  - hex commit SHA
  - URL and e-mail regex
  - `hours_logged ≥ 0`
- **Uniqueness:**
  - one project per team
  - one active guide and one active reviewer per project (partial index)
  - unique version numbers and sequence numbers
  - one rating per evaluator → evaluatee pair
- **Membership:** a trigger rejects peer evaluations, Git records and feedback assignments for anyone outside the project team.
- **Immutability:** `audit_logs` rejects UPDATE, DELETE and TRUNCATE (statement-level trigger).

### 10.3 NoSQL
See section 9. Writes go through `src/lib/srs.ts`. `appendSrsVersion()` upserts the document, `$push`es the
new version, diffs sections against the previous version and inserts change-log events. `npm run mongo:init`
creates the validators and indexes and seeds documents for the demo deliverables.

### 10.4 Vector database and semantic search
| Question | Answer |
|---|---|
| What is embedded? | Title + abstract + problem statement + objectives + scope of each proposal (`proposalText()`), stored with `source_text` so faculty can see what matched |
| Model | `sentence-transformers/all-MiniLM-L6-v2` (384-d, mean pooling, L2-normalised), run locally through `@huggingface/transformers` (ONNX). No API key is needed. Optional: OpenAI `text-embedding-3-small` at 384 dims (`EMBEDDING_PROVIDER=openai`) |
| Storage | `project_embeddings(project_id PK/FK, embedding vector(384), model, content_hash, source_text)` with an **HNSW** index using `vector_cosine_ops` |
| Metric | Cosine distance `<=>`; similarity = 1 − distance |
| Retrieval | Embed the new proposal → `fn_similar_projects()` returns the top-5 nearest proposals **in the same course**, excluding itself and rejected projects. Matches ≥ 0.60 become `similarity_reviews` rows (`pending`). Approval is blocked until faculty decide each one |
| Ethics | Similarity is a review signal only. The platform never declares plagiarism; a faculty member records `acceptable`, `plagiarism_suspected` or `duplicate`, and the decision is audited |

Measured on the demo data:
- "AI-Based Plagiarism Detection" vs "Automated Originality Checker" = **0.77** (flagged), even though they share few words.
- Unrelated projects score about **0.26**.
- A new face-recognition attendance proposal vs the existing one = **0.86** (flagged).

## 11. Important queries
See **[queries.md](queries.md)** for the SQL of each query:
- JOIN / GROUP BY / HAVING
- conditional aggregation, window function
- EXISTS, NOT EXISTS anti-join, LATERAL
- pgvector k-NN, full-text ranking
- MongoDB pipelines
- the submission transaction

## 12. Advanced database features
| Feature | Where | Evidence |
|---|---|---|
| **Transactions** | `withTransaction()` in every write route; `SELECT … FOR UPDATE` row locks; cross-DB saga on submission | API “Submission” tests; DB test “Failed step rolls back…” |
| **Views** | `v_project_dashboard`, `v_project_progress`, `v_contribution_summary`, `v_unresolved_feedback`, `v_projects_missing_deliverables` | Reports tab |
| **Stored functions / procedure** | `fn_calculate_project_risk`, `fn_student_contribution_scores`, `fn_milestone_completion_pct`, `fn_documentation_completeness`, `fn_similar_projects`, `fn_flag_overdue_milestones`, `sp_refresh_risk_assessments` | DB “Functions” tests |
| **Triggers** | Status audit (4 tables), delete audit (4 tables), similarity-decision audit, append-only audit log, overdue-milestone and risk-escalation events, team-membership validation, due-date validation, `updated_at` | DB “Triggers” tests |
| **Indexing** | B-tree, composite, partial (`WHERE is_active`, `WHERE status IN …`), GIN trigram, GIN tsvector, **HNSW** vector; MongoDB unique, compound and text indexes | DB “Indexes” tests show the planner using them |
| **Full-text search** | Generated weighted `tsvector` + `websearch_to_tsquery` + `ts_rank` + `ts_headline`; MongoDB `$text` on SRS sections | Faculty search ("Keyword" mode) |
| **NoSQL aggregation** | `$match → $unwind → $group → $project → $sort` pipelines in `documentStats()` | Reports tab, "Document versions & change history" |
| **Vector similarity search** | pgvector cosine k-NN with metadata filters | Proposal review, semantic search |

**Risk model** (`fn_calculate_project_risk`, total capped at 100):

| Component | Max points | Rule |
|---|---|---|
| Overdue milestones | 40 | 15 per milestone + 0.5 per average day late |
| Overdue / blocked tasks | 25 | 25 × overdue ratio + 3 per blocked task |
| Open high/critical feedback | 20 | 10 per item |
| Days without a submission | 15 | 0.75 per day beyond 14 |
| Contribution imbalance | 10 | share spread above 30 points ÷ 3 |
| Completed tasks with no evidence or commit | 10 | 2 per task |

Levels: ≥ 25 medium, ≥ 50 high, ≥ 70 critical. Every component is stored in `risk_assessments.factors`, so the score is explainable.

## 13. System architecture
![Architecture](diagrams/architecture.png)

- **Browser:** React client components call `/api/*` with `fetch`. No database credentials reach the browser.
- **Route Handlers:**
  - validate input with Zod
  - check the session (signed HttpOnly JWT cookie) and role/project scope
  - run parameterised SQL inside transactions, setting `app.current_user_id` so triggers record *who* acted
- **Configuration:** `DATABASE_URL`, `MONGODB_URI`, `AUTH_SECRET`, `EMBEDDING_PROVIDER` and `SIMILARITY_THRESHOLD` live in `.env.local`, which is git-ignored. `.env.local.example` documents them.

## 14. Application screenshots
| Screen | |
|---|---|
| Login with demo accounts | ![](screenshots/01-login.png) |
| Student dashboard (milestones, feedback) | ![](screenshots/02-student-dashboard.png) |
| Student: proposal, task board, contribution record, Git and peer evaluation | ![](screenshots/03-student-tasks-contributions.png) |
| Student with a proposal awaiting review | ![](screenshots/04-student-proposal-pending.png) |
| Faculty: risk monitor | ![](screenshots/05-faculty-risk.png) |
| Faculty: contribution drill-down + risk factors | ![](screenshots/06-faculty-contributions.png) |
| Faculty: milestone review | ![](screenshots/07-faculty-milestone-review.png) |
| Faculty: feedback workflow | ![](screenshots/08-faculty-feedback.png) |
| Faculty: milestone planning + task board | ![](screenshots/09-faculty-plan-tasks.png) |
| Reports (SQL + MongoDB aggregation) | ![](screenshots/10-reports.png) |
| Proposal review with similarity flag and matched text | ![](screenshots/11-faculty-proposal-similarity.png) |
| Semantic search | ![](screenshots/12-semantic-search.png) |
| Reviewer rubric scoring | ![](screenshots/13-reviewer.png) |
| Coordinator risk overview with filters | ![](screenshots/14-admin-overview.png) |
| User accounts, teams, guide/reviewer allocation | ![](screenshots/15-admin-teams-users.png) |
| In-app architecture page | ![](screenshots/16-about-architecture.png) |

## 15. Testing results
Two automated suites, both re-runnable:

| Suite | Command | Result | Report |
|---|---|---|---|
| Database (constraints, triggers, transactions, functions, views, indexes, DDL) | `npm run test:db` | **42 / 42 pass** | [test-results-db.md](test-results-db.md) |
| End-to-end API (auth, workflow, validation, DB + Mongo + vector) | `npm run test:api` | **63 / 63 pass** | [test-results-api.md](test-results-api.md) |

Test cases promised in the proposal, and where they are covered:

| Proposal test case | Covered by |
|---|---|
| Invalid dates | DB “Project end date before start date”, both cross-table date triggers; API "Due date before the project start", "Task due after its milestone" |
| Unauthorised access | API “Auth” tests, "Students cannot open reports", "Student cannot verify their own fix" |
| Duplicate team / project records | DB “Second project for the same team”, “Second active guide”; API "Same team name…", "A team can only own one project", "A student cannot join two teams" |
| Overdue milestone flags | DB “Overdue milestone automatically creates a risk event”, “Submitting … resolves its risk event”; Reports → Open risk events |
| Rollback on failed submission | DB "Failed step rolls back…"; API "Re-submitting … is refused and rolled back" |
| Similarity-review workflow | API "pgvector flags…", "Approval is blocked while a similarity review is pending", "Guide records the similarity decision and approves" |

## 16. Individual contribution
| Member | Primary ownership | Cross-contribution |
|---|---|---|
| Member 1 — Tarun Gowda P (PES1UG24AM303) | ER diagram, relational schema, DDL and migrations, constraints, indexes, views, triggers, stored functions, SQL queries, DB tests, seed data | API routes, integration testing, documentation |
| Member 2 — Aryaman D K (PES1UG24AM344) | Next.js interface, authentication/authorisation, MongoDB document model, pgvector semantic search, dashboards, API tests | PostgreSQL schema work, DML/API integration, documentation |

The commit history on GitHub (`git log --author`) shows each member's work. See the README section "Working as a team".

## 17. Conclusion and future enhancements
ProjectPulse turns scattered project evidence into data that can be queried. Each store is used for the data it
fits:
- **PostgreSQL** enforces workflow rules *in the database*: constraints, triggers, transactions.
- **MongoDB** holds evolving document content and its section history.
- **pgvector** catches overlapping ideas by meaning, not wording.

Faculty get early, explainable warnings, with contribution and risk scores that show their inputs. Every
originality decision stays with a person and is audited.

Future enhancements:
- GitHub OAuth/webhook sync for commits
- file upload to object storage (S3/Supabase) with OCR and text extraction
- chunk-level embeddings of SRS sections, to compare documents as well as proposals
- e-mail or WhatsApp alerts from `risk_events`
- `pg_cron` to run `sp_refresh_risk_assessments` nightly
- predictive delay models trained on the risk history
- row-level security policies as a second layer under the API checks

## 18. Requirement traceability
Against the course brief (*DBMS Experiential Learning – Level 3 Project Requirements*):

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | Unique title, real-world problem, not simple CRUD | ✅ | §1, §12 (risk model, similarity screening, triggers) — confirm title uniqueness with the instructor |
| 2 | 2-member team, defined responsibilities, both work on DB + app | ✅ | §16, Git history |
| 3 | SQL + NoSQL + Vector DB | ✅ | PostgreSQL, MongoDB, pgvector (§8) |
| 4 | ER diagram → relational schema; entities, attributes, PK, FK, relationships, constraints; NoSQL/vector model | ✅ | §6, §7, §9, §10.4 |
| 5 | DDL: CREATE, ALTER, DROP, PK/FK, constraints, indexes, views | ✅ | §10.1 (`004_governance_extensions.sql` for ALTER/DROP) |
| 6 | DML: INSERT, UPDATE, DELETE, SELECT; JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | ✅ | [queries.md](queries.md); DELETE in `api/tasks`, `api/teams`, `api/contributions` |
| 7 | ≥ 4 advanced concepts | ✅ | All 8 listed concepts (§12) |
| 8 | Vector search explained (data, model, storage, metric, retrieval) | ✅ | §10.4 |
| 9 | Functional Next.js UI with forms, tables, search, filters, dashboards | ✅ | §14 |
| 10 | Backend/API layer; no hard-coded credentials; env vars | ✅ | §13; `.env.local.example` |
| 11 | Authentication + ≥ 2 roles | ✅ | 5 roles (§5) |
| 12 | DB-level validation and integrity | ✅ | §10.2, DB tests |
| 13 | Security: no plain-text passwords or credentials | ✅ | bcrypt via pgcrypto; secrets in env; parameterised SQL; HttpOnly cookie |
| 14 | Documentation (all listed items) | ✅ | This report + linked files |
| 15 | Git/GitHub, individual commits, README with setup | ✅ | Repository + README |
| 16 | Demonstration items | ✅ | See README "Demo script" |
| 17 | Original design | ✅ | Original schema and features (§1, §12) |
| 18 | Beyond CRUD; justified database choices | ✅ | §8, §12 |
