'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import type { Member, MilestoneRow, TaskRow } from '@/lib/types';
import { Badge, Btn, Empty, fmtDate, inputCls, Notice, Panel } from './ui';

const STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
const LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', blocked: 'Blocked', done: 'Done' };

/** Task board for one project: create, assign, move between columns, log hours, delete. */
export default function TaskBoard({ projectId, members, milestones, currentUserId, readOnly = false }: {
  projectId: number; members: Member[]; milestones: MilestoneRow[]; currentUserId: number; readOnly?: boolean;
}) {
  const { data, error, reload } = useFetch<{ tasks: TaskRow[] }>(`/api/tasks?projectId=${projectId}`);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const openMs = milestones.filter((m) => m.project_id === projectId && m.status !== 'approved');
  const [form, setForm] = useState({ milestoneId: '', title: '', dueDate: '', priority: 'medium', hours: '', assignee: '' });

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); reload(); } catch (e) { setErr((e as Error).message); }
  };

  const create = () => run(async () => {
    await api('/api/tasks', { method: 'POST', json: {
      milestoneId: Number(form.milestoneId), title: form.title, priority: form.priority,
      dueDate: form.dueDate || undefined, estimatedHours: form.hours ? Number(form.hours) : undefined,
      assigneeIds: form.assignee ? [Number(form.assignee)] : [],
    } });
    setForm({ milestoneId: form.milestoneId, title: '', dueDate: '', priority: 'medium', hours: '', assignee: '' });
    setAdding(false);
  });

  const tasks = data?.tasks ?? [];
  return (
    <Panel
      title="Task board"
      subtitle="tasks + task_assignments (M:N) · deletes are written to audit_logs by trigger"
      db="sql"
      action={!readOnly && openMs.length > 0 && (
        <Btn variant="ghost" onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : '+ New task'}</Btn>
      )}
    >
      <Notice error={error ?? err} />
      {adding && (
        <div className="mb-4 grid gap-2 rounded-xl border border-pulse/20 bg-pulse-tint/40 p-3 sm:grid-cols-6">
          <select className={`${inputCls} sm:col-span-2`} aria-label="Milestone" value={form.milestoneId}
                  onChange={(e) => setForm({ ...form, milestoneId: e.target.value })}>
            <option value="">Milestone…</option>
            {openMs.map((m) => <option key={m.milestone_id} value={m.milestone_id}>{m.sequence_no}. {m.title} (due {fmtDate(m.due_date)})</option>)}
          </select>
          <input className={`${inputCls} sm:col-span-4`} placeholder="Task title" value={form.title}
                 onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} type="date" aria-label="Due date" value={form.dueDate}
                 onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          <select className={inputCls} aria-label="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {['low', 'medium', 'high'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className={inputCls} type="number" min={1} placeholder="Est. hrs" value={form.hours}
                 onChange={(e) => setForm({ ...form, hours: e.target.value })} />
          <select className={`${inputCls} sm:col-span-2`} aria-label="Assignee" value={form.assignee}
                  onChange={(e) => setForm({ ...form, assignee: e.target.value })}>
            <option value="">Assign to…</option>
            {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
          </select>
          <div className="sm:col-span-6">
            <Btn onClick={create} disabled={!form.milestoneId || form.title.length < 3}>Create task</Btn>
          </div>
        </div>
      )}
      {data && !tasks.length && <Empty>No tasks yet.</Empty>}
      {tasks.length > 0 && (
        <div className="grid gap-3 md:grid-cols-4">
          {STATUSES.map((s) => (
            <div key={s} className="rounded-xl border border-paper-rule bg-paper p-2.5">
              <p className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">
                {LABEL[s]} <span>{tasks.filter((t) => t.status === s).length}</span>
              </p>
              <ul className="space-y-2">
                {tasks.filter((t) => t.status === s).map((t) => (
                  <TaskCard key={t.task_id} t={t} members={members} me={currentUserId} readOnly={readOnly} run={run} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function TaskCard({ t, members, me, readOnly, run }: {
  t: TaskRow; members: Member[]; me: number; readOnly: boolean; run: (fn: () => Promise<unknown>) => void;
}) {
  const [hours, setHours] = useState('');
  const mine = t.assignees.some((a) => a.user_id === me);
  const unassigned = members.filter((m) => !t.assignees.some((a) => a.user_id === m.user_id));
  return (
    <li className="rounded-lg border border-paper-rule bg-paper-raised p-2.5 text-sm shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-ink leading-snug">{t.title}</p>
        <Badge value={t.priority} tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'slate'} />
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        M{t.sequence_no} · {t.due_date ? <span className={t.is_overdue ? 'font-semibold text-danger' : ''}>due {fmtDate(t.due_date)}</span> : 'no due date'}
        {' · '}{Number(t.hours_logged)}h logged{t.linked_commits ? ` · ${t.linked_commits} commit(s)` : ''}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {t.assignees.map((a) => (
          <span key={a.user_id} className="inline-flex items-center gap-1 rounded bg-paper px-1.5 py-0.5 text-[11px] text-ink-soft border border-paper-rule">
            {a.full_name}
            {!readOnly && t.status !== 'done' && (
              <button aria-label={`Unassign ${a.full_name}`} className="text-ink-faint hover:text-danger"
                      onClick={() => run(() => api(`/api/tasks?taskId=${t.task_id}&userId=${a.user_id}`, { method: 'DELETE' }))}>×</button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <div className="mt-2 space-y-1.5">
          <select className="w-full rounded border border-paper-rule bg-paper px-1.5 py-1 text-xs" aria-label="Move task" value={t.status}
                  onChange={(e) => run(() => api('/api/tasks', { method: 'PUT', json: { action: 'status', taskId: t.task_id, status: e.target.value } }))}>
            {STATUSES.map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </select>
          {unassigned.length > 0 && t.status !== 'done' && (
            <select className="w-full rounded border border-paper-rule bg-paper px-1.5 py-1 text-xs" aria-label="Add assignee" value=""
                    onChange={(e) => run(() => api('/api/tasks', { method: 'PUT', json: { action: 'assign', taskId: t.task_id, userId: Number(e.target.value) } }))}>
              <option value="">+ assign…</option>
              {unassigned.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
            </select>
          )}
          {mine && (
            <div className="flex gap-1">
              <input className="w-16 rounded border border-paper-rule bg-paper px-1.5 py-1 text-xs" type="number" min={0.5} step={0.5}
                     placeholder="hrs" value={hours} onChange={(e) => setHours(e.target.value)} aria-label="Hours to log" />
              <button className="rounded border border-paper-rule px-2 text-xs text-ink-soft hover:bg-paper" disabled={!hours}
                      onClick={() => { run(() => api('/api/tasks', { method: 'PUT', json: { action: 'log_hours', taskId: t.task_id, hours: Number(hours) } })); setHours(''); }}>
                Log
              </button>
            </div>
          )}
          {t.status !== 'done' && (
            <button className="text-[11px] font-medium text-danger hover:underline"
                    onClick={() => run(() => api(`/api/tasks?taskId=${t.task_id}`, { method: 'DELETE' }))}>Delete task</button>
          )}
        </div>
      )}
    </li>
  );
}
