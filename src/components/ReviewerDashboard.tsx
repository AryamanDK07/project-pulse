'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import type { MilestoneRow } from '@/lib/types';
import { Badge, Btn, DbTag, Empty, fmtDate, inputCls, Notice, Panel } from './ui';
import Reports from './Reports';

const CRITERIA = [
  ['problem_understanding', 'Problem understanding'],
  ['database_design', 'Database design'],
  ['implementation', 'Implementation'],
  ['documentation', 'Documentation'],
  ['presentation', 'Presentation'],
] as const;

interface Review { review_id: number; decision: string; score: string | null; rubric: Record<string, number> | null;
                   comments: string | null; reviewed_at: string; reviewer_name: string }

function RubricForm({ m, onDone }: { m: MilestoneRow; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [comments, setComments] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const history = useFetch<{ reviews: Review[] }>(`/api/reviews?milestoneId=${m.milestone_id}`);
  const total = CRITERIA.reduce((a, [k]) => a + Number(scores[k] || 0), 0);
  const complete = CRITERIA.every(([k]) => scores[k] !== undefined && scores[k] !== '');

  async function submit() {
    setErr(null);
    try {
      await api('/api/reviews', { method: 'POST', json: {
        milestoneId: m.milestone_id, comments,
        rubric: Object.fromEntries(CRITERIA.map(([k]) => [k, Number(scores[k])])) } });
      setScores({}); setComments(''); history.reload(); onDone();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-ink">{m.project_title} — <span className="text-pulse-dark">{m.title}</span></p>
          <p className="text-xs text-ink-faint mt-0.5">Submitted {fmtDate(m.submitted_at)} · due {fmtDate(m.due_date)}
            {m.latest_file_name ? ` · v${m.latest_version_no} ${m.latest_file_name}` : ''}</p>
        </div>
        <Badge value={m.status} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-5">
        {CRITERIA.map(([k, label]) => (
          <label key={k} className="text-xs font-semibold text-ink-soft">{label}
            <input className={`${inputCls} mt-1`} type="number" min={0} max={10} placeholder="0–10" value={scores[k] ?? ''}
                   onChange={(e) => setScores({ ...scores, [k]: e.target.value })} />
          </label>
        ))}
      </div>
      <textarea className={`${inputCls} mt-2`} rows={2} placeholder="Review comments for the guide and team…" value={comments}
                onChange={(e) => setComments(e.target.value)} />
      <div className="mt-2 flex items-center gap-3">
        <Btn onClick={submit} disabled={!complete || comments.length < 3}>Save rubric review</Btn>
        <span className="text-xs text-ink-faint">Score: <b className="text-ink">{total * 2}</b> / 100</span>
      </div>
      <div className="mt-2"><Notice error={err} /></div>
      {!!history.data?.reviews.length && (
        <ul className="mt-3 space-y-1.5 rounded-lg border border-paper-rule bg-paper p-3 text-xs">
          {history.data.reviews.map((r) => (
            <li key={r.review_id}><Badge value={r.decision} /> <b>{r.reviewer_name}</b> · {fmtDate(r.reviewed_at)}
              {r.score ? ` · ${r.score}/100` : ''}{r.comments ? ` — ${r.comments}` : ''}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function ReviewerDashboard() {
  const [tab, setTab] = useState<'queue' | 'reports'>('queue');
  const { data, error, reload } = useFetch<{ milestones: MilestoneRow[] }>('/api/milestones?needsReview=true');
  return (
    <div className="space-y-6">
      <nav className="flex gap-2 rounded-xl border border-paper-rule bg-paper-raised p-1.5 shadow-card" aria-label="Reviewer navigation">
        {(['queue', 'reports'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
                  className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${tab === t ? 'bg-pulse text-white' : 'text-ink-soft hover:bg-paper'}`}>
            {t === 'queue' ? 'Submissions to review' : 'Reports'}
          </button>
        ))}
      </nav>
      {tab === 'queue' ? (
        <Panel title="Submissions allocated to you" subtitle="Rubric stored as JSONB in reviews.rubric · moves milestone to under_review" db="sql"
               action={<DbTag type="mongo" label="Versions in MongoDB" />}>
          <Notice error={error} />
          {data && !data.milestones.length && <Empty>Nothing is waiting for your review.</Empty>}
          <ul className="divide-y divide-paper-rule">
            {data?.milestones.map((m) => <RubricForm key={m.milestone_id} m={m} onDone={reload} />)}
          </ul>
        </Panel>
      ) : <Reports />}
    </div>
  );
}
