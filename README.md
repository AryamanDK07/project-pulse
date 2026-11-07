# Project Pulse
**Academic Project Governance, Originality and Milestone Risk Monitor** — DBMS Level 3 project.

Next.js (App Router + Route Handlers) · PostgreSQL 15+ with **pgvector** · MongoDB (Mongoose) · Tailwind CSS.

## Why three data stores

| Store | Holds | DBMS concepts shown |
|---|---|---|
| **PostgreSQL** | Users/RBAC, teams, projects, milestones, tasks, reviews, feedback, risk, audit | PK/FK/CHECK, partial unique + partial indexes, M:N tables, transactions with row locks (`FOR UPDATE`), JOIN / GROUP BY / HAVING, window functions, `LATERAL`, views, PL/pgSQL functions + procedure, triggers |
| **pgvector** | 384-d proposal embeddings (`project_embeddings`) | HNSW index, cosine distance `<=>`, k-NN function `fn_similar_projects` |
| **MongoDB** | SRS documents → versions → sections → requirements, plus an append-only change log | Nested documents, `$jsonSchema` validation, text + unique indexes, `$push`/upsert |

PostgreSQL stores *pointers* to Mongo (`document_versions.mongo_version_id`, `deliverables.deliverable_id`); Mongo stores the pointer back (`pgVersionId`).
Cross-database consistency on submission: Mongo is written **inside** the PostgreSQL transaction (a Mongo failure rolls PG back) and a compensating delete runs if the PG `COMMIT` itself fails (saga pattern).

## Setup

### 1. Prerequisites
Node.js **20.6+**, PostgreSQL 15+ **with the `vector` extension**, MongoDB 6+.
Quickest way (Docker):
```bash
docker run --name pulse-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d pgvector/pgvector:pg16
docker run --name pulse-mongo -p 27017:27017 -d mongo:7
docker exec pulse-pg psql -U postgres -c "CREATE DATABASE project_pulse"
```
(Supabase works too: enable the `vector` extension and use the **Session pooler** connection string.)

### 2. Install & configure
```bash
npm install
cp .env.local.example .env.local     # then edit values
```

### 3. Initialise the databases
```bash
npm run db:migrate    # schema.sql -> pgvector.sql -> advanced.sql   (tracked in schema_migrations)
npm run db:seed       # demo users, projects, milestones, feedback  (password for all: password123)
npm run db:embed      # creates embeddings + queues similarity reviews for pending proposals
mongosh "mongodb://localhost:27017/project_pulse" db/mongo/init.js   # validators + indexes
```
`npm run db:reset` drops the `public` schema and rebuilds it with seed data.

### 4. Run
```bash
npm run dev           # http://localhost:3000
```

### Demo accounts (password `password123`)
| Role | Email | Try |
|---|---|---|
| Student | alice@pulse.edu (Team Alpha), carol@pulse.edu (Team Beta) | submit a deliverable, resolve feedback |
| Faculty | guide1@pulse.edu | risk alerts, approve milestones, raise feedback |
| Faculty | guide2@pulse.edu | review proposal #3 and its 36% similarity flag |
| Coordinator / Admin | coordinator@pulse.edu, admin@pulse.edu | all-projects table, filters, recalculate risk |

## Project layout
```
db/postgres/schema.sql      20 tables, constraints, indexes
db/postgres/pgvector.sql    project_embeddings, HNSW index, fn_similar_projects()
db/postgres/advanced.sql    fn_calculate_project_risk, sp_refresh_risk_assessments,
                            fn_student_contribution_scores, audit triggers, v_project_dashboard
db/seed/seed.sql            demo data
db/mongo/init.js            collection validators + indexes
src/models/srs.ts           Mongoose schemas (SRS versions/sections/requirements, change log)
src/lib/                    db (pool + transactions), auth (JWT cookie), scope (RBAC), embeddings, srs (Mongo saga)
src/app/api/                auth, proposals, milestones, feedback, risk-dashboard
src/app/{student,faculty,admin}/  role dashboards   ·   src/components/  UI
scripts/migrate.mjs, embed-existing.ts
```

## API summary
| Endpoint | Purpose |
|---|---|
| `POST /api/proposals` | Create proposal → embed → store vector → queue similar projects (one transaction) |
| `GET /api/proposals` | List (role-scoped); `?q=` semantic search; `?projectId=` nearest neighbours |
| `PUT /api/proposals` | Faculty approve/reject (blocked while similarity reviews are pending or flagged); coordinator `allocate` guide |
| `GET/POST/PUT /api/milestones` | List · student submits deliverable version (atomic PG + Mongo) · faculty approves / requests changes |
| `GET/POST/PUT /api/feedback` | List · faculty raises · workflow `start → resolve → verify / reopen / wont_fix` |
| `GET /api/risk-dashboard` | JOIN + GROUP BY + HAVING of delayed/high-risk projects; `?projectId=&detail=1` contributions |
| `POST /api/risk-dashboard` | Runs `sp_refresh_risk_assessments` |

Every status change on projects, milestones, tasks and feedback is written to `audit_logs` by trigger, including the acting user (`app.current_user_id` is set per transaction).

## Notes
* **Embeddings:** with no `OPENAI_API_KEY` an offline hashing embedder is used (matches shared wording, not meaning). Set the key for semantic embeddings and use `SIMILARITY_THRESHOLD≈0.75`. Don't mix providers in one database — re-run embeddings if you switch.
* **Risk score (0–100):** overdue milestones (≤40) + overdue/blocked tasks (≤25) + open high/critical feedback (≤20) + days without a submission (≤15). Levels: ≥25 medium, ≥50 high, ≥70 critical.
* **Security:** passwords are bcrypt-hashed (`pgcrypto`); sessions are signed HttpOnly JWT cookies; every query is parameterised; project data is scoped per role (student = own team, faculty = allocated projects, coordinator/admin = all). Change `AUTH_SECRET` before deploying.
* File upload is modelled as metadata (`file_name`, `file_url`, checksum); plug in S3/Supabase Storage if you need binary storage.
