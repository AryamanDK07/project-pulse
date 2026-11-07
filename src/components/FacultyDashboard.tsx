'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import { EVIDENCE_TYPES, type FeedbackRow, type Member, type MilestoneRow, type ProposalRow, type RiskRow, type SessionUser } from '@/lib/types';
import { Badge, Btn, DbTag, Empty, fmtDate, Icon, inputCls, Notice, Panel, ProgressBar } from './ui';
import Reports from './Reports';
import TaskBoard from './TaskBoard';

/* ─── Types ───────────────────────────────────────────────────────── */
import { ContributionTable } from './Contributions';
import type { ContributionRow as Contribution } from '@/lib/types';

interface RiskData {
  projects: RiskRow[];
  byLevel: { risk_level: string; projects: number }[];
}

/* ─── Tab 1: Risk Alerts (PL/pgSQL fn_calculate_project_risk) ─────── */
function RiskAlerts() {
  const { data, error, reload } = useFetch<RiskData>('/api/risk-dashboard');
  const [detail, setDetail] = useState<{ id: number; rows: Contribution[]; factors: Record<string, unknown> } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setErr(null);
    setRefreshing(true);
    try {
      await api('/api/risk-dashboard', { method: 'POST', json: {} });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  async function open(id: number) {
    setErr(null);
    try {
      const d = await api<{ contributions: Contribution[]; riskNow: { factors: Record<string, unknown> } }>(
        `/api/risk-dashboard?projectId=${id}&detail=1`
      );
      setDetail({ id, rows: d.contributions, factors: d.riskNow.factors });
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Panel
      title="Projects Needing Attention (Risk Monitor)"
      subtitle="Evaluated using PostgreSQL stored procedure sp_refresh_risk_assessments() & fn_calculate_project_risk()"
      db="sql"
      action={
        <Btn variant="ghost" onClick={refresh} disabled={refreshing}>
          <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Calculating…' : 'Recalculate Risk'}
        </Btn>
      }
    >
      <Notice error={error ?? err} />
      {data && !data.projects.length && (
        <Empty>All active projects are on track with acceptable risk scores. Great progress!</Empty>
      )}

      {!!data?.projects.length && (
        <div className="overflow-x-auto rounded-lg border border-paper-rule">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
              <tr>
                <th className="py-3 px-4">Project & Team</th>
                <th className="px-3">Overdue</th>
                <th className="px-3">Open Feedback</th>
                <th className="px-3">Milestone Progress</th>
                <th className="px-3">Risk Assessment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule bg-paper-raised">
              {data.projects.map((p) => (
                <tr key={p.project_id} className="hover:bg-paper-hover/60 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-semibold text-ink">{p.title}</p>
                    <p className="text-xs text-ink-faint mt-0.5">
                      <span className="font-medium text-ink-soft">{p.team_name}</span> · Next due: {fmtDate(p.next_due)}
                    </p>
                  </td>
                  <td className="px-3 tabular-nums font-medium">
                    {Number(p.overdue_milestones) > 0 ? (
                      <span className="text-danger font-semibold">{p.overdue_milestones} overdue</span>
                    ) : (
                      <span className="text-ink-faint">0</span>
                    )}
                  </td>
                  <td className="px-3 tabular-nums font-medium">
                    {Number(p.open_feedback) > 0 ? (
                      <span className="text-warning font-semibold">{p.open_feedback} open</span>
                    ) : (
                      <span className="text-ink-faint">0</span>
                    )}
                  </td>
                  <td className="px-3">
                    <ProgressBar pct={Number(p.progress_pct ?? 0)} />
                  </td>
                  <td className="px-3">
                    <div className="flex items-center gap-1.5">
                      <Badge value={p.risk_level} />
                      <span className="text-xs font-mono font-semibold text-ink-soft">({p.risk_score} pts)</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Btn variant="ghost" onClick={() => open(p.project_id)}>
                      <Icon name="user" className="w-3.5 h-3.5" />
                      Contributions
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Drill-down modal / detail box */}
      {detail && (
        <div className="mt-5 animate-slide-up rounded-xl border border-paper-rule bg-paper p-5 shadow-card">
          <div className="flex items-center justify-between border-b border-paper-rule pb-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-ink">Individual Student Contributions (Project #{detail.id})</h3>
                <DbTag type="sql" label="SQL Window Functions" />
              </div>
              <p className="text-xs text-ink-faint mt-0.5">Computed by fn_student_contribution_scores() via SQL Window OVER() clause</p>
            </div>
            <button
              onClick={() => setDetail(null)}
              className="text-xs text-ink-faint hover:text-ink px-2 py-1 rounded border border-paper-rule"
            >
              Close
            </button>
          </div>

          <ContributionTable rows={detail.rows} />

          <div className="mt-4 rounded-lg bg-paper-raised p-3 border border-paper-rule">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-1">
              Active Risk Factors Breakdown (JSONB)
            </p>
            <pre className="text-xs font-mono text-ink-soft overflow-x-auto p-2 bg-paper rounded border border-paper-rule">
              {JSON.stringify(detail.factors, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </Panel>
  );
}

/* ─── Tab 2: Proposals + Vector Similarity (pgvector) ─────────────── */
function ProposalCard({ p, onDone }: { p: ProposalRow; onDone: () => void }) {
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [neighbours, setNeighbours] = useState<{ project_id: number; title: string; similarity: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function findSimilar() {
    setError(null);
    setSearching(true);
    try {
      const data = await api<{ results: { project_id: number; title: string; similarity: string }[] }>(
        `/api/proposals?projectId=${p.project_id}&limit=5`
      );
      setNeighbours(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function decide(decision: 'approved' | 'rejected' | 'revision_requested') {
    setError(null);
    try {
      await api('/api/proposals', {
        method: 'PUT',
        json: {
          action: 'review',
          projectId: p.project_id,
          decision,
          notes: notes || undefined,
          similarityDecisions: Object.entries(decisions).map(([id, d]) => ({
            similarityId: Number(id),
            decision: d,
          })),
        },
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <li className="py-5 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{p.title}</h3>
            <Badge value={p.status} />
          </div>
          <p className="text-xs text-ink-faint mt-1">
            Team: <span className="font-semibold text-ink-soft">{p.team_name}</span> · Course: {p.course_code} · Guide:{' '}
            {p.guide_name ?? 'Unassigned'}
          </p>
        </div>
        <DbTag type="vector" label="pgvector Embeddings" />
      </div>

      <div className="mt-3 space-y-2 text-sm text-ink-soft leading-relaxed bg-paper/50 p-3 rounded-lg border border-paper-rule">
        <p>{p.abstract}</p>
        {p.problem_statement && <p><span className="font-semibold text-ink">Problem: </span>{p.problem_statement}</p>}
        {p.objectives?.length > 0 && <ul className="ml-5 list-disc">{p.objectives.map((o) => <li key={o}>{o}</li>)}</ul>}
        {p.scope && <p><span className="font-semibold text-ink">Scope: </span>{p.scope}</p>}
        <p className="text-xs text-ink-faint">{p.domain ?? '—'} · {p.technologies?.join(', ')}
          {p.repository_url && <> · <a className="text-pulse underline" href={p.repository_url}>repository</a></>}</p>
      </div>

      {/* Similarity warnings */}
      {!!p.similarity_reviews.length && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
            <Icon name="alert" className="w-4 h-4 text-amber-600" />
            Originality Flag: Similar Projects Detected (Cosine Distance &lt;=&gt;)
          </div>
          <p className="text-xs text-amber-700 mt-0.5">
            pgvector calculated high semantic similarity against previously submitted abstracts:
          </p>
          <div className="mt-2 space-y-2">
            {p.similarity_reviews.map((s) => (
              <div
                key={s.similarity_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-2.5 border border-amber-200 text-sm shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-mono font-bold text-amber-800">
                      {(Number(s.similarity_score) * 100).toFixed(1)}% match
                    </span>
                    <span className="truncate text-ink font-medium">{s.matched_title}</span>
                  </div>
                  {s.matched_text && <p className="mt-1 text-xs text-ink-faint line-clamp-2">“{s.matched_text}”</p>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    className="rounded-lg border border-paper-rule bg-paper-raised px-2.5 py-1 text-xs font-medium text-ink focus:ring-1 focus:ring-pulse"
                    aria-label="Similarity decision"
                    value={decisions[s.similarity_id] ?? (s.decision === 'pending' ? '' : s.decision)}
                    onChange={(e) => setDecisions((d) => ({ ...d, [s.similarity_id]: e.target.value }))}
                  >
                    <option value="" disabled>Select decision…</option>
                    <option value="acceptable">Acceptable (Unique scope)</option>
                    <option value="plagiarism_suspected">Plagiarism suspected</option>
                    <option value="duplicate">Duplicate topic</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* On-demand K-NN similar neighbours */}
      {neighbours && (
        <div className="mt-3 rounded-lg border border-paper-rule bg-paper p-3 text-sm">
          <p className="text-xs font-semibold text-ink-soft mb-2">Nearest 5 Abstract Neighbours (HNSW Index):</p>
          <ul className="space-y-1.5">
            {neighbours.map((n) => (
              <li key={n.project_id} className="flex items-center gap-2 text-xs">
                <span className="font-mono font-bold text-pulse">{(Number(n.similarity) * 100).toFixed(1)}%</span>
                <span className="text-ink">{n.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3">
        <textarea
          className={inputCls}
          rows={2}
          placeholder="Feedback for the team (required when rejecting or requesting a revision)…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Btn variant="ghost" onClick={findSimilar} disabled={searching}>
          <Icon name="search" className="w-3.5 h-3.5" />
          {searching ? 'Querying vector index…' : 'Scan Vector Index'}
        </Btn>
        <Btn onClick={() => decide('approved')}>
          <Icon name="check" className="w-3.5 h-3.5" />
          Approve Proposal
        </Btn>
        <Btn variant="ghost" onClick={() => decide('revision_requested')}>
          Request Revision
        </Btn>
        <Btn variant="danger" onClick={() => decide('rejected')}>
          Reject Proposal
        </Btn>
      </div>

      <div className="mt-2"><Notice error={error} /></div>
    </li>
  );
}

function Proposals() {
  const { data, error, reload } = useFetch<{ proposals: ProposalRow[] }>('/api/proposals?status=proposed');
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'q' | 'text'>('q');
  const [found, setFound] = useState<{ project_id: number; title: string; similarity?: string; rank?: string; snippet?: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function search() {
    setErr(null);
    setSearching(true);
    try {
      const res = await api<{ results: { project_id: number; title: string; similarity?: string; rank?: string; snippet?: string }[] }>(
        `/api/proposals?${mode}=${encodeURIComponent(q)}`
      );
      setFound(res.results);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Search All Proposals"
        subtitle="Semantic: all-MiniLM-L6-v2 embedding + pgvector cosine distance · Keyword: PostgreSQL full-text search (tsvector + GIN)"
        db="vector"
      >
        <div className="flex gap-2">
          <select className={`${inputCls} w-40`} aria-label="Search mode" value={mode} onChange={(e) => setMode(e.target.value as 'q' | 'text')}>
            <option value="q">Semantic</option>
            <option value="text">Keyword</option>
          </select>
          <input
            className={inputCls}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type an idea, keyword, or problem statement to find similar existing projects…"
          />
          <Btn onClick={search} disabled={q.length < 3 || searching}>
            <Icon name="search" className="w-4 h-4" />
            {searching ? 'Embedding…' : 'Search Ideas'}
          </Btn>
        </div>
        <div className="mt-2"><Notice error={err} /></div>

        {found && (
          <div className="mt-4 rounded-xl border border-paper-rule bg-paper p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint mb-2">
              Semantic Search Results ({found.length} matches)
            </p>
            {found.length === 0 ? (
              <p className="text-xs text-ink-faint">No sufficiently similar proposals found in vector index.</p>
            ) : (
              <ul className="space-y-2">
                {found.map((f) => (
                  <li key={f.project_id} className="rounded-lg bg-white p-2.5 border border-paper-rule text-sm shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{f.title}</span>
                      <span className="rounded bg-purple-50 border border-purple-200 px-2 py-0.5 font-mono text-xs font-bold text-purple-700">
                        {f.similarity !== undefined ? `${(Number(f.similarity) * 100).toFixed(1)}% match` : `rank ${f.rank}`}
                      </span>
                    </div>
                    {f.snippet && <p className="mt-1 text-xs text-ink-faint">{f.snippet.replace(/\*\*/g, '')}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Panel>

      <Panel
        title="Proposals Awaiting Review"
        subtitle="Review student submissions, inspect vector similarity warnings, and assign approval status"
        db="hybrid"
      >
        <Notice error={error} />
        {data && !data.proposals.length && <Empty>No pending proposals are awaiting your review.</Empty>}
        <ul className="divide-y divide-paper-rule">
          {data?.proposals.map((p) => (
            <ProposalCard key={p.project_id} p={p} onDone={reload} />
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ─── Tab 3: Milestone Review (PostgreSQL ACID Transaction) ────────── */
function ReviewRow({ m, onDone }: { m: MilestoneRow; onDone: () => void }) {
  const [score, setScore] = useState('');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approved' | 'changes_requested') {
    setError(null);
    setBusy(true);
    try {
      await api('/api/milestones', {
        method: 'PUT',
        json: {
          milestoneId: m.milestone_id,
          decision,
          score: score ? Number(score) : undefined,
          comments: comments || undefined,
        },
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="py-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">
            {m.project_title} — <span className="text-pulse-dark">{m.title}</span>
          </p>
          <p className="text-xs text-ink-faint mt-0.5">
            Submitted: {fmtDate(m.submitted_at)} · Due: {fmtDate(m.due_date)} · Weight: {m.weight}% ·{' '}
            {m.latest_file_name ? (
              <span className="font-mono text-ink-soft">v{m.latest_version_no} ({m.latest_file_name})</span>
            ) : (
              'No file attached'
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge value={m.status} />
          <DbTag type="mongo" label="MongoDB SRS Version" />
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
        <input
          className={inputCls}
          type="number"
          min={0}
          max={100}
          placeholder="Score (0-100)"
          value={score}
          onChange={(e) => setScore(e.target.value)}
        />
        <input
          className={inputCls}
          placeholder="Review comments (required if requesting changes)…"
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Btn onClick={() => decide('approved')} disabled={busy}>
          <Icon name="check" className="w-3.5 h-3.5" />
          Approve Milestone
        </Btn>
        <Btn variant="ghost" onClick={() => decide('changes_requested')} disabled={busy}>
          Request Changes
        </Btn>
      </div>
      <div className="mt-2"><Notice error={error} /></div>
    </li>
  );
}

function MilestoneReview() {
  const { data, error, reload } = useFetch<{ milestones: MilestoneRow[] }>('/api/milestones?needsReview=true');
  return (
    <Panel
      title="Submitted Deliverables & SRS Reviews"
      subtitle="Evaluates versioned artefacts using atomic transactions and cross-database MongoDB version pointers"
      db="hybrid"
    >
      <Notice error={error} />
      {data && !data.milestones.length && <Empty>No student milestone deliverables currently awaiting review.</Empty>}
      <ul className="divide-y divide-paper-rule">
        {data?.milestones.map((m) => (
          <ReviewRow key={m.milestone_id} m={m} onDone={reload} />
        ))}
      </ul>
    </Panel>
  );
}

/* ─── Tab 4: Feedback Workflow (State Machine + Audit Trigger) ────── */
function Feedback() {
  const { data, error, reload } = useFetch<{
    feedback: FeedbackRow[];
    projects: { project_id: number; title: string; members: Member[] }[];
  }>('/api/feedback');
  const ms = useFetch<{ milestones: MilestoneRow[] }>('/api/milestones');
  const [projectId, setProjectId] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const members = data?.projects.find((p) => String(p.project_id) === projectId)?.members ?? [];
  const projectMs = (ms.data?.milestones ?? []).filter((m) => String(m.project_id) === projectId);
  const [body, setBody] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    try {
      await api('/api/feedback', {
        method: 'POST',
        json: { projectId: Number(projectId), body, severity,
                milestoneId: milestoneId ? Number(milestoneId) : undefined,
                assignedTo: assignedTo ? Number(assignedTo) : undefined },
      });
      setBody(''); setAssignedTo(''); setMilestoneId('');
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function act(feedbackId: number, action: 'verify' | 'reopen' | 'wont_fix') {
    setErr(null);
    try {
      await api('/api/feedback', {
        method: 'PUT',
        json: {
          feedbackId,
          action,
          resolutionNote: action === 'wont_fix' ? 'Closed by guide as not applicable' : undefined,
        },
      });
      reload();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <Panel
        title="Issue New Feedback / Action Item"
        subtitle="Creates tracked feedback items audited by trg_feedback_status_audit trigger"
        db="sql"
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Target Project</label>
            <select
              className={inputCls}
              value={projectId}
              onChange={(e) => { setProjectId(e.target.value); setMilestoneId(''); setAssignedTo(''); }}
              aria-label="Project"
            >
              <option value="">Select project to review…</option>
              {data?.projects.map((p) => (
                <option key={p.project_id} value={p.project_id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Severity Level</label>
            <select
              className={inputCls}
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              aria-label="Severity"
            >
              {['low', 'medium', 'high', 'critical'].map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Milestone (optional)</label>
            <select className={inputCls} value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} aria-label="Milestone">
              <option value="">Whole project</option>
              {projectMs.map((m) => <option key={m.milestone_id} value={m.milestone_id}>{m.sequence_no}. {m.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Assign to student</label>
            <select className={inputCls} value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} aria-label="Assign to">
              <option value="">Whole team</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
          </div>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-semibold text-ink-soft mb-1">Feedback Description</label>
          <textarea
            className={inputCls}
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Specify what needs correction, improvement, or verification…"
          />
        </div>

        <div className="mt-3">
          <Btn onClick={create} disabled={!projectId || body.length < 3}>
            Send Feedback Item
          </Btn>
        </div>
        <div className="mt-2"><Notice error={err ?? error} /></div>
      </Panel>

      <Panel
        title="Feedback Item Status & Resolution Verification"
        subtitle="Tracks resolution lifecycles: open → in_progress → resolved → verified"
        db="sql"
      >
        {data && !data.feedback.length && <Empty>No feedback items logged yet.</Empty>}
        <ul className="divide-y divide-paper-rule">
          {data?.feedback.map((f) => (
            <li key={f.feedback_id} className="py-4 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge value={f.severity} />
                  <Badge value={f.status} />
                  <span className="text-xs font-medium text-ink-soft">{f.project_title}{f.milestone_title ? ` · ${f.milestone_title}` : ''}</span>
                  {f.assigned_to_name && <span className="text-xs text-ink-faint">→ {f.assigned_to_name}</span>}
                </div>
                <span className="text-xs text-ink-faint">{fmtDate(f.created_at)}</span>
              </div>

              <p className="mt-2 text-sm text-ink leading-relaxed">{f.body}</p>

              {f.resolution_note && (
                <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 p-2.5">
                  <p className="text-xs font-semibold text-emerald-800">Student Resolution Note:</p>
                  <p className="text-xs text-emerald-900 mt-0.5">{f.resolution_note}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {f.status === 'resolved' && (
                  <>
                    <Btn onClick={() => act(f.feedback_id, 'verify')}>
                      <Icon name="check" className="w-3.5 h-3.5" />
                      Verify Resolution
                    </Btn>
                    <Btn variant="ghost" onClick={() => act(f.feedback_id, 'reopen')}>
                      Reopen Item
                    </Btn>
                  </>
                )}
                {['open', 'in_progress'].includes(f.status) && (
                  <Btn variant="ghost" onClick={() => act(f.feedback_id, 'wont_fix')}>
                    Mark Won't Fix
                  </Btn>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ─── Tab 5: Plan milestones & monitor tasks ─────────────────────── */
function PlanAndTasks() {
  const me = useFetch<{ user: SessionUser }>('/api/auth/me');
  const projects = useFetch<{ projects: { project_id: number; title: string; members: Member[] }[] }>('/api/feedback');
  const pr = useFetch<{ proposals: ProposalRow[] }>('/api/proposals?limit=50');
  const ms = useFetch<{ milestones: MilestoneRow[] }>('/api/milestones');
  const active = (pr.data?.proposals ?? []).filter((p) => ['approved', 'in_progress'].includes(p.status));
  const [pid, setPid] = useState('');
  const projectId = Number(pid || active[0]?.project_id || 0);
  const members = projects.data?.projects.find((p) => p.project_id === projectId)?.members ?? [];
  const list = (ms.data?.milestones ?? []).filter((m) => m.project_id === projectId);
  const used = list.reduce((a, m) => a + Number(m.weight), 0);
  const [f, setF] = useState({ title: '', dueDate: '', weight: '', evidence: '' });
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    try {
      await api('/api/milestones/manage', { method: 'POST', json: {
        projectId, title: f.title, dueDate: f.dueDate, weight: Number(f.weight),
        requiredEvidenceType: f.evidence || undefined } });
      setF({ title: '', dueDate: '', weight: '', evidence: '' }); ms.reload();
    } catch (e) { setErr((e as Error).message); }
  }

  if (pr.data && !active.length) return <Panel title="Plan milestones"><Empty>No approved projects are allocated to you yet.</Empty></Panel>;
  return (
    <div className="space-y-6">
      <Panel title="Plan milestones" subtitle="INSERT … SELECT MAX(sequence_no)+1 · trigger checks due date is inside the project window" db="sql"
             action={
               <select className={`${inputCls} w-72`} aria-label="Project" value={projectId || ''} onChange={(e) => setPid(e.target.value)}>
                 {active.map((p) => <option key={p.project_id} value={p.project_id}>{p.title}</option>)}
               </select>}>
        <ul className="mb-4 divide-y divide-paper-rule text-sm">
          {list.map((m) => (
            <li key={m.milestone_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><b>{m.sequence_no}.</b> {m.title} <span className="text-xs text-ink-faint">· due {fmtDate(m.due_date)} · {m.weight}%
                {m.required_evidence_type ? ` · needs ${m.required_evidence_type}` : ''}</span></span>
              <span className="flex gap-1">{m.is_overdue && <Badge value="overdue" tone="red" />}<Badge value={m.status} /></span>
            </li>
          ))}
        </ul>
        <p className="mb-2 text-xs text-ink-faint">Weight used: {used}% of 100%</p>
        <div className="grid gap-2 sm:grid-cols-5">
          <input className={`${inputCls} sm:col-span-2`} placeholder="Milestone title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          <input className={inputCls} type="date" aria-label="Due date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          <input className={inputCls} type="number" min={1} max={100} placeholder="Weight %" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} />
          <select className={inputCls} aria-label="Required evidence" value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })}>
            <option value="">Evidence type…</option>
            {EVIDENCE_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <div className="mt-2"><Btn onClick={create} disabled={!projectId || f.title.length < 3 || !f.dueDate || !f.weight}>Add milestone</Btn></div>
        <div className="mt-2"><Notice error={err} /></div>
      </Panel>
      {projectId > 0 && me.data && (
        <TaskBoard key={projectId} projectId={projectId} members={members} milestones={ms.data?.milestones ?? []} currentUserId={me.data.user.userId} />
      )}
    </div>
  );
}

/* ─── Faculty Dashboard Shell & Tab Switcher ──────────────────────── */
const TABS = [
  { id: 'risk', label: 'Risk Alerts & Health', icon: 'pulse', db: 'sql' as const },
  { id: 'proposals', label: 'Proposals & Originality', icon: 'search', db: 'vector' as const },
  { id: 'milestones', label: 'Milestone Review', icon: 'file', db: 'hybrid' as const },
  { id: 'feedback', label: 'Feedback Workflow', icon: 'alert', db: 'sql' as const },
  { id: 'plan', label: 'Milestones & Tasks', icon: 'check', db: 'sql' as const },
  { id: 'reports', label: 'Reports', icon: 'filter', db: 'hybrid' as const },
];

export default function FacultyDashboard() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('risk');

  return (
    <div className="space-y-6">
      {/* Tab Navigation Pill Bar */}
      <nav className="flex flex-wrap gap-2 rounded-xl border border-paper-rule bg-paper-raised p-1.5 shadow-card" aria-label="Faculty Navigation">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-all ${
                active
                  ? 'bg-pulse text-white shadow-sm'
                  : 'text-ink-soft hover:bg-paper hover:text-ink'
              }`}
            >
              <Icon name={t.icon} className="w-3.5 h-3.5" />
              <span>{t.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                active ? 'bg-white/20 text-white' : 'bg-paper-rule text-ink-faint'
              }`}>
                {t.db.toUpperCase()}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tab content */}
      <div className="animate-fade-in">
        {tab === 'risk' && <RiskAlerts />}
        {tab === 'proposals' && <Proposals />}
        {tab === 'milestones' && <MilestoneReview />}
        {tab === 'feedback' && <Feedback />}
        {tab === 'plan' && <PlanAndTasks />}
        {tab === 'reports' && <Reports />}
      </div>
    </div>
  );
}
