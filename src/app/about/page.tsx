'use client';
import { useState } from 'react';
import { Card, DbTag, Icon, Panel, Shell } from '@/components/ui';

export default function AboutPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'relational' | 'nosql' | 'vector' | 'advanced'>('overview');

  return (
    <Shell allow={['student', 'faculty', 'coordinator', 'admin']} title="DBMS Architecture & Implementation">
      <div className="space-y-6">
        {/* Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-ink via-slate-800 to-ink p-6 text-white shadow-card border border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <span className="rounded-full bg-pulse/20 text-pulse-light px-3 py-1 text-xs font-semibold uppercase tracking-wider border border-pulse/30">
                DBMS Experiential Learning — Level 3 Project
              </span>
              <h1 className="mt-2 text-2xl font-bold">Project Pulse Architecture & DB Justification</h1>
              <p className="mt-1 text-sm text-slate-300 max-w-2xl leading-relaxed">
                Academic Project Governance, Originality Verification & Milestone Risk Monitor engineered with a
                multi-paradigm database stack: PostgreSQL Relational + MongoDB Document + pgvector Cosine Embeddings.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <DbTag type="sql" label="PostgreSQL 15+ (ACID / RBAC)" />
              <DbTag type="mongo" label="MongoDB (SRS Document Tree)" />
              <DbTag type="vector" label="pgvector (384-D Cosine Sim)" />
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <nav className="flex flex-wrap gap-2 border-b border-paper-rule pb-2" aria-label="Documentation Sections">
          {[
            { id: 'overview', label: '1. Problem & Paradigm Justification' },
            { id: 'relational', label: '2. PostgreSQL Relational Schema' },
            { id: 'nosql', label: '3. MongoDB SRS Document Model' },
            { id: 'vector', label: '4. pgvector Originality Search' },
            { id: 'advanced', label: '5. Advanced DB Features (4+)' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-all ${
                activeTab === t.id
                  ? 'bg-pulse text-white shadow-sm'
                  : 'text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {/* Tab 1: Overview & Justification */}
        {activeTab === 'overview' && (
          <div className="space-y-6 animate-fade-in">
            <Panel title="Database Paradigms Selection & Justification" db="hybrid">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-900 uppercase">SQL Database</span>
                    <DbTag type="sql" label="PostgreSQL" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">PostgreSQL 15+ (Relational / ACID)</h3>
                  <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                    <strong>Why SQL:</strong> Enforces strong consistency, transaction atomicity, foreign-key integrity,
                    and rigorous Role-Based Access Control (RBAC). Critical for user authentication, financial/academic
                    milestones, grade scoring, and audit logging.
                  </p>
                  <ul className="mt-3 text-xs text-ink-soft space-y-1 list-disc list-inside">
                    <li>12 Relational Tables with Foreign Keys</li>
                    <li>Row-level locking via <code>FOR UPDATE</code></li>
                    <li>Status change audit trigger</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-emerald-900 uppercase">NoSQL Database</span>
                    <DbTag type="mongo" label="MongoDB" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">MongoDB (Document Paradigm)</h3>
                  <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                    <strong>Why NoSQL:</strong> Software Requirements Specifications (SRS) have arbitrary depth,
                    polymorphic section structures, and frequent iterative additions. MongoDB stores the full nested document
                    hierarchy with section-level diff logging.
                  </p>
                  <ul className="mt-3 text-xs text-ink-soft space-y-1 list-disc list-inside">
                    <li>Nested Collections (Document + Versions + Sections)</li>
                    <li>Append-only change log</li>
                    <li>Cross-DB foreign pointer in PostgreSQL</li>
                  </ul>
                </div>

                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-900 uppercase">Vector Database</span>
                    <DbTag type="vector" label="pgvector" />
                  </div>
                  <h3 className="text-sm font-semibold text-ink">PostgreSQL with pgvector</h3>
                  <p className="mt-2 text-xs text-ink-soft leading-relaxed">
                    <strong>Why Vector:</strong> Academic duplicate and plagiarism detection cannot rely on naive keyword
                    matching. Proposals are converted into 384-dimensional dense embeddings to calculate Cosine Similarity in
                    real time.
                  </p>
                  <ul className="mt-3 text-xs text-ink-soft space-y-1 list-disc list-inside">
                    <li>384-dimensional dense vectors</li>
                    <li>HNSW indexing with cosine distance</li>
                    <li>Automatic threshold flagging</li>
                  </ul>
                </div>
              </div>
            </Panel>

            <Panel title="System Architecture & Workflow" db="hybrid">
              <div className="rounded-xl bg-paper p-4 border border-paper-rule text-xs text-ink-soft font-mono leading-relaxed space-y-3">
                <p className="font-semibold text-ink font-sans text-sm">Cross-Database Transaction Lifecycle (Saga Pattern):</p>
                <div className="p-3 bg-white rounded-lg border border-paper-rule space-y-2">
                  <p>1. <span className="text-blue-700 font-bold">BEGIN TRANSACTION</span> in PostgreSQL with <code>app.current_user_id</code> session variable.</p>
                  <p>2. Lock milestone row using <code>SELECT ... FOR UPDATE</code> to serialize concurrent submissions.</p>
                  <p>3. Generate deliverable record and version ID in PostgreSQL.</p>
                  <p>4. Write polymorphic SRS document sections & change diff to <span className="text-emerald-700 font-bold">MongoDB</span>.</p>
                  <p>5. If MongoDB write succeeds, save <code>mongo_version_id</code> pointer to <code>document_versions</code>.</p>
                  <p>6. <span className="text-blue-700 font-bold">COMMIT</span> in PostgreSQL. (If commit fails, compensating action rolls back MongoDB).</p>
                  <p>7. Automated PostgreSQL Trigger fires to record change in <code>audit_logs</code> table.</p>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* Tab 2: Relational Schema */}
        {activeTab === 'relational' && (
          <div className="space-y-6 animate-fade-in">
            <Panel title="Relational Entities & Constraints (PostgreSQL)" db="sql">
              <div className="grid gap-4 md:grid-cols-2">
                {[
                  {
                    name: 'users & user_roles',
                    desc: 'M:N identity mapping with bcrypt hash (pgcrypto), role constraints (student, faculty, reviewer, coordinator, admin).',
                    keys: 'PK: user_id | FK: department_id, role_id',
                  },
                  {
                    name: 'courses & teams & team_members',
                    desc: 'Academic hierarchy with UNIQUE constraints on (course_id, name) and compound PK (team_id, user_id).',
                    keys: 'PK: team_id, user_id | FK: course_id, user_id',
                  },
                  {
                    name: 'projects & guide_allocations',
                    desc: 'Projects with title/abstract length CHECK constraints, lifecycle status ENUM, and partial unique index on active guide.',
                    keys: 'PK: project_id | Partial UNIQUE: guide_allocations(project_id) WHERE is_active',
                  },
                  {
                    name: 'milestones & deliverables & document_versions',
                    desc: 'Sequential milestone deadlines, weights (SUM=100), and document_versions storing checksum and mongo_version_id.',
                    keys: 'PK: milestone_id, deliverable_id, version_id | Cross-DB pointer to MongoDB',
                  },
                  {
                    name: 'tasks & task_assignments & contribution_evidence',
                    desc: 'Granular student work breakdown with hours logged, status checks, and weighted evidence points for individual scoring.',
                    keys: 'PK: task_id, (task_id, user_id), evidence_id',
                  },
                  {
                    name: 'feedback_items & audit_logs',
                    desc: 'Feedback item resolution workflow state machine (assignable to a student), plus an append-only audit log — UPDATE/DELETE on it are blocked by trigger.',
                    keys: 'PK: feedback_id, audit_id | Trigger-driven automated population',
                  },
                  {
                    name: 'git_activities & peer_evaluations',
                    desc: 'Commit references (hex SHA CHECK, UNIQUE per project) and 1–5 teammate ratings (evaluator ≠ evaluatee). A trigger rejects anyone outside the project team.',
                    keys: 'PK: activity_id, evaluation_id | UNIQUE(project_id, commit_sha), UNIQUE(project_id, evaluator_id, evaluatee_id)',
                  },
                  {
                    name: 'risk_events & course_required_documents',
                    desc: 'Overdue-milestone and risk-escalation events raised by triggers; mandatory document types per course drive the missing-deliverables report.',
                    keys: 'Partial UNIQUE(milestone_id, event_type) WHERE resolved_at IS NULL | PK (course_id, document_type)',
                  },
                ].map((entity) => (
                  <div key={entity.name} className="rounded-xl border border-paper-rule bg-paper p-4">
                    <h3 className="font-mono text-sm font-bold text-pulse-dark">{entity.name}</h3>
                    <p className="mt-1 text-xs text-ink-soft">{entity.desc}</p>
                    <p className="mt-2 text-[11px] font-mono text-ink-faint bg-white p-2 rounded border border-paper-rule">
                      {entity.keys}
                    </p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}

        {/* Tab 3: MongoDB SRS Document */}
        {activeTab === 'nosql' && (
          <div className="space-y-6 animate-fade-in">
            <Panel title="MongoDB NoSQL Model: Hierarchical SRS Documents" db="mongo">
              <div className="rounded-xl bg-paper p-4 border border-paper-rule">
                <p className="text-xs text-ink-soft mb-3 leading-relaxed">
                  Software Requirements Specifications (SRS) have evolving sections, non-uniform headings, and dynamic requirements lists.
                  MongoDB stores the nested hierarchy as JSON-like BSON documents:
                </p>
                <pre className="text-xs font-mono text-ink-soft overflow-x-auto p-3 bg-white rounded-lg border border-paper-rule">
{`// Collection: srs_documents
{
  "projectId": 101,
  "deliverableId": 402,
  "title": "System Architecture & SRS v2",
  "currentVersion": 2,
  "versions": [
    {
      "_id": ObjectId("671e..."),
      "versionNo": 2,
      "pgVersionId": 89,           // Foreign Pointer to PostgreSQL document_versions.version_id
      "changeSummary": "Added authentication and security requirements",
      "checksum": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "sections": [
        {
          "sectionId": "S1",
          "heading": "User Authentication & RBAC",
          "order": 1,
          "content": "Specifies JWT session handling and pgcrypto bcrypt password validation.",
          "requirements": [
            { "reqId": "REQ-01", "type": "functional", "priority": "must" }
          ]
        }
      ]
    }
  ]
}`}
                </pre>
              </div>
            </Panel>
          </div>
        )}

        {/* Tab 4: pgvector Vector Database */}
        {activeTab === 'vector' && (
          <div className="space-y-6 animate-fade-in">
            <Panel title="pgvector Semantic Similarity & Plagiarism Detection" db="vector">
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                    <p className="text-xs font-bold text-purple-900 uppercase">Vector Dimension</p>
                    <p className="mt-1 text-xl font-bold text-ink">384 Dimensions</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Sentence-transformer <code>all-MiniLM-L6-v2</code> (mean pooling, normalised) run locally — no API key. Optional: OpenAI <code>text-embedding-3-small</code> at 384 dims.
                    </p>
                  </div>
                  <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4">
                    <p className="text-xs font-bold text-purple-900 uppercase">Distance Metric & Index</p>
                    <p className="mt-1 text-xl font-bold text-ink">Cosine Distance (&lt;=&gt;) & HNSW</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Indexed via Hierarchical Navigable Small World (HNSW) graph for sub-millisecond nearest neighbor search.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-paper p-4 border border-paper-rule">
                  <p className="text-xs font-semibold text-ink mb-2">Vector SQL Query (fn_similar_projects):</p>
                  <pre className="text-xs font-mono text-ink-soft overflow-x-auto p-3 bg-white rounded-lg border border-paper-rule">
{`SELECT p.project_id,
       p.title,
       p.status,
       ROUND((1 - (e.embedding <=> $1::vector))::numeric, 4) AS similarity
FROM project_embeddings e
JOIN projects p ON p.project_id = e.project_id
WHERE (p_exclude IS NULL OR e.project_id <> p_exclude)
ORDER BY e.embedding <=> $1::vector
LIMIT 5;`}
                  </pre>
                </div>
              </div>
            </Panel>
          </div>
        )}

        {/* Tab 5: Advanced DB Concepts Demonstrated */}
        {activeTab === 'advanced' && (
          <div className="space-y-6 animate-fade-in">
            <Panel title="Advanced Database Concepts Demonstrated (Requirement: Min 4)" db="hybrid">
              <div className="space-y-3">
                {[
                  {
                    title: '1. Multi-Step ACID Transactions with Saga Compensation',
                    type: 'sql' as const,
                    desc: 'Submission and review APIs use PostgreSQL transactions (BEGIN / COMMIT / ROLLBACK) with row-level locking (SELECT ... FOR UPDATE). If PostgreSQL fails after MongoDB was written, a compensating saga removes the orphaned document version.',
                  },
                  {
                    title: '2. Complex SQL Analytical Views with LATERAL Subqueries',
                    type: 'sql' as const,
                    desc: 'v_project_dashboard aggregates projects with milestones, tasks, and feedback without join fan-out by using LATERAL subqueries and independent aggregations.',
                  },
                  {
                    title: '3. Stored Procedures & Stored Functions (PL/pgSQL)',
                    type: 'sql' as const,
                    desc: 'fn_calculate_project_risk() computes multi-factor weighted health scores. sp_refresh_risk_assessments() batch updates snapshots. fn_student_contribution_scores() calculates individual member contribution shares using SQL Window OVER() functions.',
                  },
                  {
                    title: '4. Database Triggers for Automated Status Change Auditing',
                    type: 'sql' as const,
                    desc: 'trg_projects_status_audit, trg_milestones_status_audit, trg_feedback_status_audit automatically log all status transitions to audit_logs with actor ID set via transaction context setting app.current_user_id.',
                  },
                  {
                    title: '5. Specialized Indexing (HNSW, GIN Trigram, B-Tree Partial)',
                    type: 'vector' as const,
                    desc: 'HNSW vector cosine indexing for semantic similarity; GIN pg_trgm for fuzzy title search; GIN tsvector for full-text search; partial unique index on guide_allocations(project_id, allocation_role) WHERE is_active.',
                  },
                  {
                    title: '5b. Full-text Search & NoSQL Aggregation',
                    type: 'hybrid' as const,
                    desc: 'projects.search_tsv is a generated, weighted tsvector queried with websearch_to_tsquery + ts_rank. MongoDB aggregation pipelines ($unwind, $group, $project, $sort) summarise document versions, types and section changes on the Reports tab.',
                  },
                  {
                    title: '6. Vector Similarity Search (pgvector Cosine Distance)',
                    type: 'vector' as const,
                    desc: 'High-dimensional similarity matching over proposal abstracts with automatic threshold flagging for duplicate/plagiarism warnings.',
                  },
                ].map((f) => (
                  <div key={f.title} className="rounded-xl border border-paper-rule bg-paper p-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-ink">{f.title}</h3>
                      <DbTag type={f.type} />
                    </div>
                    <p className="mt-1 text-xs text-ink-soft leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        )}
      </div>
    </Shell>
  );
}
