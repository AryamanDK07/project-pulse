# ProjectPulse
**Academic Project Governance, Originality and Milestone Risk Monitor** — DBMS Experiential Learning, Level 3.

Next.js 15 (App Router + Route Handlers) · PostgreSQL 16 + **pgvector** · **MongoDB** · Tailwind CSS

Students submit proposals, plan tasks and submit versioned deliverables. Faculty guides approve work and track
risk. Reviewers score submissions with a rubric. Coordinators manage teams and allocations. A sentence-transformer
model flags proposals that are *conceptually* similar to existing ones, for a faculty decision.

📄 **Full project report:** [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) (ER diagram, schema, justification,
queries, architecture, screenshots, test results).

---

## Run it on your computer

You need three things installed once:
- [**Node.js 20 or newer**](https://nodejs.org) (the LTS version is fine)
- [**Docker Desktop**](https://www.docker.com/products/docker-desktop/) (runs PostgreSQL and MongoDB for you)
- [**Git**](https://git-scm.com/downloads)

### First time (about 5 minutes)
```bash
git clone https://github.com/AryamanDK07/project-pulse project-pulse
cd project-pulse
npm install
docker compose up -d          # starts PostgreSQL+pgvector (port 5433) and MongoDB (port 27017)
```
Create your settings file by copying the template:
- macOS / Linux: `cp .env.local.example .env.local`
- Windows (PowerShell): `Copy-Item .env.local.example .env.local`

Open `.env.local` and set `AUTH_SECRET` to any long random string. Everything else already matches Docker.

```bash
npm run setup                 # builds both databases + demo data + embeddings
npm run dev                   # open http://localhost:3000
```
`npm run setup` downloads the embedding model (~90 MB) the first time, so give it a minute.

### Every time after that
```bash
docker compose up -d          # if Docker was closed
npm run dev
```
To wipe everything back to the demo data: `npm run setup`.

### Demo accounts (password: `password123`)
| Role | Email | Try this |
|---|---|---|
| Student | `alice@pulse.edu` (Team Alpha) | task board, resolve feedback, record a commit, rate a teammate |
| Student | `erin@pulse.edu` (Team Gamma) | a proposal waiting for review |
| Faculty guide | `guide1@pulse.edu` | risk alerts, approve milestones, plan milestones, reports |
| Faculty guide | `guide2@pulse.edu` | review proposal #3 and its 77 % similarity flag |
| Reviewer | `reviewer@pulse.edu` | rubric-score the submitted SRS |
| Coordinator | `coordinator@pulse.edu` | all projects, teams, guide/reviewer allocation |
| Admin | `admin@pulse.edu` | everything above + create user accounts |

<details>
<summary><b>Without Docker</b> (install the databases yourself)</summary>

1. Install PostgreSQL 15+ and the **pgvector** extension, then run `CREATE DATABASE project_pulse;`.
2. Install MongoDB 6+ (Community Server).
3. In `.env.local`, change `DATABASE_URL` to your own user, password and port (usually 5432).
4. Run `npm run setup`, then `npm run dev`.
</details>

---

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode on http://localhost:3000 |
| `npm run setup` | **Reset everything:** PostgreSQL schema + seed → embeddings → MongoDB validators, indexes, documents |
| `npm run db:migrate` | Apply new SQL migrations only (tracked in `schema_migrations`) |
| `npm run db:reset` | Drop and rebuild the PostgreSQL schema with seed data |
| `npm run db:embed` / `db:reembed` | Embed projects without a vector / rebuild all vectors (after changing model) |
| `npm run mongo:init` | Create MongoDB validators and indexes; seed demo SRS documents |
| `npm run test:db` | 42 database tests (constraints, triggers, transactions, views, indexes) → `docs/test-results-db.md` |
| `npm run test:api` | 63 end-to-end API tests (needs `npm run dev` running) → `docs/test-results-api.md` |
| `npm run docs:dictionary` | Regenerate `docs/data-dictionary.md` from the live schema |
| `npm run build && npm start` | Production build |

Run the tests on fresh data: `npm run setup && npm run test:db`, then start the app and run `npm run test:api`.

## Environment variables (`.env.local`)
| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `MONGODB_URI` | MongoDB connection string |
| `AUTH_SECRET` | Signs the login cookie (JWT). Keep it secret |
| `EMBEDDING_PROVIDER` | `minilm` (default, local), `openai`, or `hash` (offline fallback) |
| `OPENAI_API_KEY` | Only for `EMBEDDING_PROVIDER=openai` |
| `SIMILARITY_THRESHOLD` | Similarity at which proposals are flagged (default 0.6) |

No credentials are in the source code. `.env.local` is git-ignored.

## Why three data stores
| Store | Holds | DBMS concepts shown |
|---|---|---|
| **PostgreSQL** | Users/roles, teams, projects, milestones, tasks, reviews, feedback, evidence, risk, audit | PK/FK/CHECK/UNIQUE, partial + composite + GIN indexes, transactions with row locks, JOIN / GROUP BY / HAVING / subqueries / window functions / LATERAL, 5 views, PL/pgSQL functions + procedure, 18 triggers, full-text search |
| **pgvector** | 384-d proposal embeddings (all-MiniLM-L6-v2) | HNSW index, cosine distance `<=>`, filtered k-NN function |
| **MongoDB** | SRS documents → versions → sections → requirements, plus a section change log | Nested documents, `$jsonSchema` validation, unique/compound/text indexes, aggregation pipelines |

## Project layout
```
db/postgres/schema.sql                    001 CREATE — 20 tables, constraints, indexes
db/postgres/pgvector.sql                  002 CREATE — vector table, HNSW index, k-NN function
db/postgres/advanced.sql                  003 CREATE — functions, procedure, triggers, dashboard view
db/postgres/004_governance_extensions.sql 004 ALTER + DROP — schema evolution, new tables/views/triggers
db/seed/seed.sql                          demo data
scripts/                                  migrate, embed, mongo-init, db-tests, api-tests, data dictionary
src/app/api/                              Route Handlers (auth, users, teams, proposals, milestones, tasks,
                                          feedback, reviews, contributions, risk-dashboard, reports)
src/app/{student,faculty,reviewer,admin,about}/   role pages
src/components/                           dashboards, TaskBoard, ProposalForm, Contributions, Reports, TeamAdmin
src/lib/                                  db (pool + transactions), auth (JWT), scope (RBAC), embeddings, srs (Mongo)
docs/                                     report, data dictionary, queries, diagrams, screenshots, test results
```

## Demo script (for the evaluation)
1. **Problem and design:** open the report, then the ER diagram, relational schema and database justification.
2. **DDL:** show `004_governance_extensions.sql` (ALTER/DROP) and `npm run db:migrate` output.
3. **Student (erin):** a proposal is pending. **guide2:** see the 77 % similarity flag with the matched text; record "acceptable" → approve.
4. **guide1, Milestones & Tasks:** add a milestone. A date before the project start is rejected by a trigger.
5. **alice:** create a task, assign Bob, log hours, delete a wrong task. The audit row is written by a trigger.
6. **Submission:** submit a deliverable. Show the PostgreSQL rows and the MongoDB document (versions → sections).
7. **reviewer:** rubric score. **guide1:** approve or request changes. **Student:** resolve the feedback. **Guide:** verify it.
8. **Reports tab:** HAVING thresholds, NOT EXISTS anti-join, views, MongoDB aggregation, risk events.
9. **Tests:** run `npm run test:db` and `npm run test:api` live.
10. **Git history:** each member's commits (`git log --author="<name>"`).

## Working as a team
Each member should commit their own work from their own GitHub account, so the history shows individual
contributions:
```bash
git config user.name  "Your Name"
git config user.email "you@example.com"     # the email on your GitHub account
git pull                                     # get your teammate's latest work
# ...make changes...
git add -A
git commit -m "Describe what you changed"
git push
```
