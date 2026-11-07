'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import type { FeedbackRow, MilestoneRow, ProposalRow, SessionUser, TeamRow } from '@/lib/types';
import { Badge, Btn, Empty, fmtDate, inputCls, Notice, Panel, Stat } from './ui';
import ProposalForm from './ProposalForm';
import TaskBoard from './TaskBoard';
import Contributions from './Contributions';

/* ─── Icons ───────────────────────────────────────────────────────── */
const IconCalendar = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const IconCheck = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
);
const IconAlert = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
);
const IconMsg = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
);
const IconUpload = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
);
const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);

function SubmitForm({ milestone, onDone }: { milestone: MilestoneRow; onDone: () => void }) {
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [summary, setSummary] = useState('');
  const [sections, setSections] = useState([{ heading: '', content: '' }]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setSec = (i: number, k: 'heading' | 'content', v: string) =>
    setSections((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function submit() {
    setBusy(true); setError(null);
    try {
      await api('/api/milestones', { method: 'POST', json: {
        milestoneId: milestone.milestone_id, title: `${milestone.title} deliverable`, fileName,
        fileUrl: fileUrl || undefined, changeSummary: summary,
        sections: sections.filter((s) => s.heading.trim()),
      } });
      onDone();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="mt-4 animate-slide-up space-y-4 rounded-xl border border-pulse/20 bg-pulse-tint/50 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-pulse-dark">
        <IconUpload /> Submit deliverable for: {milestone.title}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">File name</label>
          <input className={inputCls} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="srs_v3.pdf" />
        </div>
        <div>
          <label className="block text-xs font-medium text-ink-soft mb-1">File link (optional)</label>
          <input className={inputCls} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-ink-soft mb-1">What changed in this version?</label>
        <textarea className={inputCls} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Describe changes made…" />
      </div>
      <fieldset className="space-y-3">
        <legend className="text-xs font-semibold text-ink-soft uppercase tracking-wider">
          SRS Sections
          <span className="ml-2 text-ink-faint font-normal normal-case tracking-normal">(stored in MongoDB with change history)</span>
        </legend>
        {sections.map((s, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[200px_1fr] animate-fade-in">
            <input className={inputCls} placeholder="Heading" value={s.heading} onChange={(e) => setSec(i, 'heading', e.target.value)} />
            <textarea className={inputCls} rows={2} placeholder="Content" value={s.content} onChange={(e) => setSec(i, 'content', e.target.value)} />
          </div>))}
        <Btn variant="ghost" onClick={() => setSections((s) => [...s, { heading: '', content: '' }])}>
          <IconPlus /> Add section
        </Btn>
      </fieldset>
      <Notice error={error} />
      <div className="flex gap-2">
        <Btn onClick={submit} disabled={busy || !fileName || summary.length < 5}>
          {busy ? (
            <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Submitting…</>
          ) : (<><IconUpload /> Submit deliverable</>)}
        </Btn>
      </div>
    </div>
  );
}

function FeedbackItem({ f, onChange }: { f: FeedbackRow; onChange: () => void }) {
  const [resolving, setResolving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const act = async (action: 'start' | 'resolve') => {
    setError(null);
    try { await api('/api/feedback', { method: 'PUT', json: { feedbackId: f.feedback_id, action, resolutionNote: note || undefined } }); setResolving(false); onChange(); }
    catch (e) { setError((e as Error).message); }
  };
  return (
    <li className="group py-4 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <Badge value={f.severity} /><Badge value={f.status} />
        <span className="text-xs text-ink-faint">
          {f.project_title}{f.milestone_title ? ` · ${f.milestone_title}` : ''} · from <span className="font-medium text-ink-soft">{f.author_name}</span>
          {f.assigned_to_name ? <> · assigned to <span className="font-medium text-ink-soft">{f.assigned_to_name}</span></> : null}
        </span>
      </div>
      <p className="mt-2 text-sm text-ink leading-relaxed">{f.body}</p>
      {f.resolution_note && (
        <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <p className="text-xs font-medium text-emerald-700 mb-0.5">Your resolution</p>
          <p className="text-sm text-emerald-800">{f.resolution_note}</p>
        </div>
      )}
      {['open', 'in_progress'].includes(f.status) && (
        <div className="mt-3 flex gap-2">
          {f.status === 'open' && <Btn variant="ghost" onClick={() => act('start')}>Start work</Btn>}
          <Btn variant="ghost" onClick={() => setResolving((r) => !r)}>
            {resolving ? 'Cancel' : 'Mark resolved'}
          </Btn>
        </div>)}
      {resolving && (
        <div className="mt-3 animate-slide-up space-y-2 rounded-lg border border-paper-rule bg-paper p-3">
          <textarea className={inputCls} rows={2} placeholder="Describe how you addressed this feedback…" value={note} onChange={(e) => setNote(e.target.value)} />
          <Btn onClick={() => act('resolve')} disabled={note.length < 3}>Send for verification</Btn>
        </div>)}
      <div className="mt-2"><Notice error={error} /></div>
    </li>
  );
}

/* ─── Proposal panel: create, follow status, revise when asked ───── */
function ProposalPanel({ team, proposal, onChange }: { team: TeamRow; proposal: ProposalRow | null; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  if (!proposal) return (
    <Panel title={`Submit your project proposal — ${team.name}`} subtitle="Saved in PostgreSQL; embedded with all-MiniLM-L6-v2 into pgvector for an originality check" db="hybrid">
      <ProposalForm teamId={team.team_id} onDone={onChange} />
    </Panel>
  );
  const editable = ['proposed', 'revision_requested'].includes(proposal.status);
  return (
    <Panel title="Your project proposal" subtitle={`${team.name} · ${team.course_code} · guide: ${proposal.guide_name ?? 'not yet allocated'}`}
           action={<Badge value={proposal.status} />}>
      {proposal.status === 'revision_requested' && proposal.latest_guide_note && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Your guide asked for changes</p><p className="mt-0.5">{proposal.latest_guide_note}</p>
        </div>
      )}
      {proposal.status === 'rejected' && proposal.latest_guide_note && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{proposal.latest_guide_note}</div>
      )}
      {editing ? (
        <ProposalForm teamId={team.team_id} existing={proposal} onDone={() => { setEditing(false); onChange(); }} />
      ) : (
        <div className="space-y-2 text-sm">
          <p className="text-base font-semibold text-ink">{proposal.title}</p>
          <p className="text-ink-soft">{proposal.abstract}</p>
          {proposal.problem_statement && <p><span className="font-semibold text-ink">Problem: </span>{proposal.problem_statement}</p>}
          {proposal.objectives.length > 0 && (
            <ul className="ml-5 list-disc text-ink-soft">{proposal.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
          )}
          <p className="text-xs text-ink-faint">{proposal.domain} · {proposal.technologies.join(', ')}
            {proposal.repository_url && <> · <a className="text-pulse underline" href={proposal.repository_url}>repository</a></>}</p>
          {editable && <div className="pt-2"><Btn variant="ghost" onClick={() => setEditing(true)}>Edit proposal</Btn></div>}
        </div>
      )}
    </Panel>
  );
}

export default function StudentDashboard() {
  const me = useFetch<{ user: SessionUser }>('/api/auth/me');
  const tm = useFetch<{ teams: TeamRow[] }>('/api/teams');
  const pr = useFetch<{ proposals: ProposalRow[] }>('/api/proposals');
  const ms = useFetch<{ milestones: MilestoneRow[] }>('/api/milestones');
  const fb = useFetch<{ feedback: FeedbackRow[] }>('/api/feedback');
  const [openId, setOpenId] = useState<number | null>(null);
  const milestones = ms.data?.milestones ?? [];
  const feedback = fb.data?.feedback ?? [];
  const reloadAll = () => { ms.reload(); fb.reload(); tm.reload(); pr.reload(); setOpenId(null); };
  const team = tm.data?.teams[0] ?? null;
  const proposal = pr.data?.proposals.find((p) => p.team_id === team?.team_id) ?? null;
  const active = proposal && ['approved', 'in_progress', 'completed'].includes(proposal.status);
  const userId = me.data?.user.userId ?? 0;

  const approved = milestones.filter((m) => m.status === 'approved').length;
  const overdue = milestones.filter((m) => m.is_overdue).length;
  const openFb = feedback.filter((f) => ['open', 'in_progress'].includes(f.status)).length;
  const progressPct = milestones.length ? Math.round((approved / milestones.length) * 100) : 0;

  if (tm.data && !team) return (
    <Panel title="No team yet"><Empty>You are not in a project team yet. Ask your course coordinator to add you to one.</Empty></Panel>
  );

  return (
    <>
      {team && pr.data && <ProposalPanel team={team} proposal={proposal} onChange={reloadAll} />}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Total Milestones" value={milestones.length} icon={<IconCalendar />} />
        <Stat label="Approved" value={`${approved} / ${milestones.length}`} icon={<IconCheck />} />
        <Stat label="Overdue" value={overdue} tone={overdue > 0 ? 'red' : undefined} icon={<IconAlert />} />
        <Stat label="Open Feedback" value={openFb} tone={openFb > 0 ? 'amber' : undefined} icon={<IconMsg />} />
      </div>

      {/* Progress overview */}
      {milestones.length > 0 && (
        <div className="animate-fade-in rounded-xl border border-paper-rule bg-paper-raised p-5 shadow-card">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink">Overall Progress</p>
            <span className="text-sm font-bold tabular-nums text-pulse">{progressPct}%</span>
          </div>
          <div className="h-3 w-full rounded-full bg-paper-rule overflow-hidden">
            <div className={`h-3 rounded-full transition-all duration-700 ease-out ${
              progressPct >= 80 ? 'bg-emerald-500' : progressPct >= 50 ? 'bg-pulse' : progressPct >= 25 ? 'bg-amber-500' : 'bg-red-500'
            }`} style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      )}

      {/* Milestones */}
      <Panel title="Milestones">
        <Notice error={ms.error} />
        {!ms.loading && !milestones.length && <Empty>No milestones yet. Your guide will add them once your proposal is approved.</Empty>}
        <ul className="divide-y divide-paper-rule">
          {milestones.map((m) => (
            <li key={m.milestone_id} className="py-4 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper text-xs font-bold text-ink-soft border border-paper-rule">
                      {m.sequence_no}
                    </span>
                    <p className="text-sm font-semibold text-ink truncate">{m.title}</p>
                  </div>
                  <div className="mt-1.5 ml-9 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
                    <span>{m.project_title}</span>
                    <span>·</span>
                    <span className={m.is_overdue ? 'text-danger font-medium' : ''}>Due {fmtDate(m.due_date)}</span>
                    <span>·</span>
                    <span>Weight {m.weight}%</span>
                    {m.latest_version_no ? (
                      <><span>·</span><span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[11px]">v{m.latest_version_no} {m.latest_file_name}</span></>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_overdue && <Badge value="overdue" tone="red" />}
                  <Badge value={m.status} />
                  {['pending', 'changes_requested'].includes(m.status) && (
                    <Btn variant="ghost" onClick={() => setOpenId(openId === m.milestone_id ? null : m.milestone_id)}>
                      <IconUpload /> Submit
                    </Btn>)}
                </div>
              </div>
              {openId === m.milestone_id && <SubmitForm milestone={m} onDone={reloadAll} />}
            </li>))}
        </ul>
      </Panel>

      {active && team && proposal && userId > 0 && (
        <TaskBoard projectId={proposal.project_id} members={team.members} milestones={milestones} currentUserId={userId} />
      )}

      {/* Feedback */}
      <Panel title="Feedback from your guide">
        <Notice error={fb.error} />
        {!fb.loading && !feedback.length && <Empty>No feedback yet.</Empty>}
        <ul className="divide-y divide-paper-rule">{feedback.map((f) => <FeedbackItem key={f.feedback_id} f={f} onChange={reloadAll} />)}</ul>
      </Panel>

      {active && proposal && userId > 0 && <Contributions projectId={proposal.project_id} me={userId} />}
    </>
  );
}
