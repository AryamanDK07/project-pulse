'use client';
import { useState } from 'react';
import { api } from '@/lib/client';
import type { ProposalRow } from '@/lib/types';
import { Btn, inputCls, Notice } from './ui';

interface Result { flaggedForReview: number; threshold: number; similar: { title: string; similarity: string }[] }

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const csv = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

/** Create a new proposal (teamId) or revise an existing one (existing). */
export default function ProposalForm({ teamId, existing, onDone }: {
  teamId: number; existing?: ProposalRow | null; onDone: () => void;
}) {
  const [f, setF] = useState({
    title: existing?.title ?? '',
    abstract: existing?.abstract ?? '',
    problemStatement: existing?.problem_statement ?? '',
    objectives: (existing?.objectives ?? []).join('\n'),
    scope: existing?.scope ?? '',
    domain: existing?.domain ?? '',
    technologies: (existing?.technologies ?? []).join(', '),
    repositoryUrl: existing?.repository_url ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit() {
    setBusy(true); setError(null);
    const payload = {
      title: f.title, abstract: f.abstract, problemStatement: f.problemStatement,
      objectives: lines(f.objectives), scope: f.scope, domain: f.domain,
      technologies: csv(f.technologies), repositoryUrl: f.repositoryUrl,
    };
    try {
      const r = existing
        ? await api<Result>('/api/proposals', { method: 'PUT', json: { action: 'revise', projectId: existing.project_id, ...payload } })
        : await api<Result>('/api/proposals', { method: 'POST', json: { teamId, ...payload } });
      setResult(r);
      setTimeout(onDone, 1800);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const ready = f.title.length >= 5 && f.abstract.length >= 30 && f.problemStatement.length >= 20 &&
    lines(f.objectives).length > 0 && f.scope.length >= 10 && f.domain.length >= 2 && csv(f.technologies).length > 0;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Project title</span>
          <input className={inputCls} value={f.title} onChange={set('title')} placeholder="At least 5 characters" />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Abstract <span className="font-normal text-ink-faint">({f.abstract.length}/30+ chars)</span></span>
          <textarea className={inputCls} rows={3} value={f.abstract} onChange={set('abstract')} />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Problem statement</span>
          <textarea className={inputCls} rows={2} value={f.problemStatement} onChange={set('problemStatement')} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Objectives <span className="font-normal text-ink-faint">(one per line)</span></span>
          <textarea className={inputCls} rows={3} value={f.objectives} onChange={set('objectives')} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Scope</span>
          <textarea className={inputCls} rows={3} value={f.scope} onChange={set('scope')} />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Domain</span>
          <input className={inputCls} value={f.domain} onChange={set('domain')} placeholder="e.g. Education Technology" />
        </label>
        <label className="block">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Technologies <span className="font-normal text-ink-faint">(comma separated)</span></span>
          <input className={inputCls} value={f.technologies} onChange={set('technologies')} placeholder="Next.js, PostgreSQL" />
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-ink-soft mb-1">Repository link (optional)</span>
          <input className={inputCls} value={f.repositoryUrl} onChange={set('repositoryUrl')} placeholder="https://github.com/…" />
        </label>
      </div>
      <Notice error={error} />
      {result && (
        <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Proposal saved and sent to your guide.{' '}
          {result.flaggedForReview > 0
            ? `${result.flaggedForReview} similar existing project(s) were flagged for faculty review — this is a review signal, not a verdict.`
            : 'No closely similar proposals were found.'}
        </div>
      )}
      <Btn onClick={submit} disabled={busy || !ready}>
        {busy ? 'Checking originality…' : existing ? 'Resubmit revised proposal' : 'Submit proposal'}
      </Btn>
    </div>
  );
}
