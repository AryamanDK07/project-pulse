'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import type { ContributionRow, GitRow, Member, PeerRow, TaskRow } from '@/lib/types';
import { Btn, DbTag, Empty, fmtDate, inputCls, Notice, Panel } from './ui';

interface Data { contributions: ContributionRow[]; git: GitRow[]; peerEvaluations: PeerRow[]; team: Member[] }

export function ContributionTable({ rows }: { rows: ContributionRow[] }) {
  if (!rows.length) return <Empty>No contribution evidence yet.</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-paper-rule">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
          <tr>
            <th className="py-2.5 px-3">Student</th><th className="px-2">Tasks done</th><th className="px-2">Hours</th>
            <th className="px-2">Commits</th><th className="px-2">Docs</th><th className="px-2">Feedback fixed</th>
            <th className="px-2">Evidence pts</th><th className="px-2">Peer rating</th><th className="px-3">Share</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-paper-rule bg-paper-raised">
          {rows.map((r) => (
            <tr key={r.user_id}>
              <td className="py-2.5 px-3 font-medium text-ink">{r.full_name}</td>
              <td className="px-2 tabular-nums">{r.tasks_completed}</td>
              <td className="px-2 tabular-nums">{Number(r.hours_logged)}</td>
              <td className="px-2 tabular-nums">{r.commits}</td>
              <td className="px-2 tabular-nums">{r.documents_uploaded}</td>
              <td className="px-2 tabular-nums">{r.feedback_resolved}</td>
              <td className="px-2 tabular-nums">{Number(r.evidence_points)}</td>
              <td className="px-2 tabular-nums">{r.avg_peer_rating ? `${Number(r.avg_peer_rating).toFixed(1)} / 5` : '—'}</td>
              <td className="px-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-16 rounded-full bg-paper-rule overflow-hidden">
                    <div className="h-2 rounded-full bg-pulse" style={{ width: `${Number(r.contribution_pct ?? 0)}%` }} />
                  </div>
                  <span className="text-xs font-semibold tabular-nums">{r.contribution_pct ?? 0}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Student view: own contribution record, record Git evidence, rate teammates. */
export default function Contributions({ projectId, me }: { projectId: number; me: number }) {
  const { data, error, reload } = useFetch<Data>(`/api/contributions?projectId=${projectId}`);
  const tasks = useFetch<{ tasks: TaskRow[] }>(`/api/tasks?projectId=${projectId}`).data?.tasks ?? [];
  const [git, setGit] = useState({ commitSha: '', message: '', commitUrl: '', taskId: '' });
  const [peer, setPeer] = useState<Record<number, { rating: string; comments: string }>>({});
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); reload(); } catch (e) { setErr((e as Error).message); }
  };
  const mates = (data?.team ?? []).filter((m) => m.user_id !== me);
  const given = (id: number) => data?.peerEvaluations.find((p) => p.evaluatee_id === id);

  return (
    <Panel title="My contribution record" subtitle="fn_student_contribution_scores() · git_activities · peer_evaluations" db="sql">
      <Notice error={error ?? err} />
      <ContributionTable rows={data?.contributions ?? []} />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Record a Git commit</h3><DbTag type="sql" label="CHECK: hex SHA" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inputCls} placeholder="Commit SHA (7–40 hex)" value={git.commitSha}
                   onChange={(e) => setGit({ ...git, commitSha: e.target.value })} />
            <select className={inputCls} aria-label="Linked task" value={git.taskId} onChange={(e) => setGit({ ...git, taskId: e.target.value })}>
              <option value="">Link to task (optional)</option>
              {tasks.map((t) => <option key={t.task_id} value={t.task_id}>{t.title}</option>)}
            </select>
            <input className={`${inputCls} sm:col-span-2`} placeholder="Commit message" value={git.message}
                   onChange={(e) => setGit({ ...git, message: e.target.value })} />
            <input className={`${inputCls} sm:col-span-2`} placeholder="Commit URL (optional)" value={git.commitUrl}
                   onChange={(e) => setGit({ ...git, commitUrl: e.target.value })} />
          </div>
          <div className="mt-2">
            <Btn disabled={git.commitSha.length < 7 || git.message.length < 3}
                 onClick={() => run(async () => {
                   await api('/api/contributions', { method: 'POST', json: {
                     type: 'git', projectId, commitSha: git.commitSha, message: git.message,
                     commitUrl: git.commitUrl, taskId: git.taskId ? Number(git.taskId) : undefined } });
                   setGit({ commitSha: '', message: '', commitUrl: '', taskId: '' });
                 })}>Save commit</Btn>
          </div>
          <ul className="mt-3 divide-y divide-paper-rule text-sm">
            {data?.git.map((g) => (
              <li key={g.activity_id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <code className="rounded bg-paper px-1 text-xs">{g.commit_sha.slice(0, 7)}</code>{' '}
                  <span className="text-ink">{g.message}</span>
                  <span className="block text-[11px] text-ink-faint">{fmtDate(g.committed_at)}{g.task_title ? ` · ${g.task_title}` : ''}</span>
                </span>
                <button className="text-xs text-danger hover:underline"
                        onClick={() => run(() => api(`/api/contributions?activityId=${g.activity_id}`, { method: 'DELETE' }))}>Delete</button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-semibold text-ink">Peer evaluation</h3><DbTag type="sql" label="Trigger: same team only" />
          </div>
          {!mates.length && <p className="text-xs text-ink-faint">No teammates to evaluate.</p>}
          <ul className="space-y-3">
            {mates.map((m) => {
              const cur = peer[m.user_id] ?? { rating: String(given(m.user_id)?.rating ?? ''), comments: given(m.user_id)?.comments ?? '' };
              return (
                <li key={m.user_id} className="rounded-lg border border-paper-rule bg-paper p-3">
                  <p className="text-sm font-medium text-ink">{m.full_name}
                    {given(m.user_id) && <span className="ml-2 text-xs text-ink-faint">(you rated {given(m.user_id)!.rating}/5)</span>}</p>
                  <div className="mt-2 flex gap-2">
                    <select className={`${inputCls} w-28`} aria-label={`Rating for ${m.full_name}`} value={cur.rating}
                            onChange={(e) => setPeer({ ...peer, [m.user_id]: { ...cur, rating: e.target.value } })}>
                      <option value="">Rating…</option>
                      {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                    </select>
                    <input className={inputCls} placeholder="Comment (optional)" value={cur.comments}
                           onChange={(e) => setPeer({ ...peer, [m.user_id]: { ...cur, comments: e.target.value } })} />
                    <Btn variant="ghost" disabled={!cur.rating}
                         onClick={() => run(() => api('/api/contributions', { method: 'POST', json: {
                           type: 'peer', projectId, evaluateeId: m.user_id, rating: Number(cur.rating),
                           comments: cur.comments || undefined } }))}>Save</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Panel>
  );
}
