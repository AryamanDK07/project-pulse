'use client';
import { useState } from 'react';
import { api, useFetch } from '@/lib/client';
import type { SessionUser, TeamRow } from '@/lib/types';
import { Badge, Btn, Empty, inputCls, Notice, Panel } from './ui';

interface Person { user_id: number; full_name: string; email: string; enrollment_no: string | null; roles: string[]; team_ids: number[] | null }
interface Course { course_id: number; code: string; title: string }
interface Proj { project_id: number; title: string; status: string; team_name: string; guide_id: number | null; reviewer_id: number | null }
interface Data { teams: TeamRow[]; courses: Course[]; people: Person[]; projects: Proj[] }

interface Account { user_id: number; email: string; full_name: string; enrollment_no: string | null; is_active: boolean; roles: string[] }

/** Admin: create accounts (password hashed in PostgreSQL) and activate / deactivate them. */
function UserAdmin({ onChange }: { onChange: () => void }) {
  const me = useFetch<{ user: SessionUser }>('/api/auth/me');
  const { data, reload } = useFetch<{ users: Account[] }>('/api/users');
  const [f, setF] = useState({ fullName: '', email: '', password: '', role: 'student', enrollmentNo: '' });
  const [err, setErr] = useState<string | null>(null);
  const isAdmin = me.data?.user.roles.includes('admin');
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try { await fn(); reload(); onChange(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Panel title="User accounts" subtitle="Passwords are hashed inside PostgreSQL with bcrypt (pgcrypto crypt + gen_salt('bf'))" db="sql">
      {isAdmin && (
        <div className="mb-4 grid gap-2 sm:grid-cols-6">
          <input className={`${inputCls} sm:col-span-2`} placeholder="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} type="password" placeholder="Password (8+ chars)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          <select className={`${inputCls} sm:col-span-2`} aria-label="Role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {['student', 'faculty', 'reviewer', 'coordinator', 'admin'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {f.role === 'student' && (
            <input className={`${inputCls} sm:col-span-2`} placeholder="Enrollment no." value={f.enrollmentNo} onChange={(e) => setF({ ...f, enrollmentNo: e.target.value })} />
          )}
          <div className="sm:col-span-2">
            <Btn disabled={!f.fullName || !f.email || f.password.length < 8}
                 onClick={() => run(async () => {
                   await api('/api/users', { method: 'POST', json: { ...f, enrollmentNo: f.enrollmentNo || undefined } });
                   setF({ fullName: '', email: '', password: '', role: 'student', enrollmentNo: '' });
                 })}>Create account</Btn>
          </div>
        </div>
      )}
      <Notice error={err} />
      <div className="max-h-72 overflow-y-auto rounded-lg border border-paper-rule">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
            <tr><th className="py-2 px-3">Name</th><th className="px-3">Email</th><th className="px-3">Role</th><th className="px-3">Status</th></tr>
          </thead>
          <tbody className="divide-y divide-paper-rule bg-paper-raised">
            {data?.users.map((u) => (
              <tr key={u.user_id}>
                <td className="py-2 px-3 font-medium text-ink">{u.full_name}</td>
                <td className="px-3 text-ink-soft">{u.email}</td>
                <td className="px-3">{u.roles.map((r) => <Badge key={r} value={r} tone="purple" />)}</td>
                <td className="px-3">
                  {isAdmin && u.user_id !== me.data?.user.userId ? (
                    <button className={`text-xs font-medium ${u.is_active ? 'text-danger' : 'text-success'} hover:underline`}
                            onClick={() => run(() => api('/api/users', { method: 'PUT', json: { userId: u.user_id, isActive: !u.is_active } }))}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  ) : <Badge value={u.is_active ? 'active' : 'inactive'} tone={u.is_active ? 'green' : 'slate'} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/** Coordinator: create teams, manage membership, allocate guides and reviewers. */
export default function TeamAdmin() {
  const { data, error, reload } = useFetch<Data>('/api/teams');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [nt, setNt] = useState<{ courseId: string; name: string; members: string[]; leader: string }>({ courseId: '', name: '', members: [], leader: '' });
  const [add, setAdd] = useState<Record<number, { userId: string; responsibility: string }>>({});

  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setErr(null); setOk(null);
    try { await fn(); setOk(msg); reload(); } catch (e) { setErr((e as Error).message); }
  };
  const students = (data?.people ?? []).filter((p) => p.roles.includes('student'));
  const faculty = (data?.people ?? []).filter((p) => p.roles.includes('faculty'));
  const reviewers = (data?.people ?? []).filter((p) => p.roles.includes('reviewer') || p.roles.includes('faculty'));
  const free = students.filter((s) => !s.team_ids?.length);

  return (
    <div className="space-y-6">
      <Notice error={error ?? err} />
      {ok && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{ok}</div>}

      <UserAdmin onChange={reload} />

      <Panel title="Create a team" subtitle="teams + team_members in one transaction · one team per student per course" db="sql">
        <div className="grid gap-2 sm:grid-cols-3">
          <select className={inputCls} aria-label="Course" value={nt.courseId} onChange={(e) => setNt({ ...nt, courseId: e.target.value })}>
            <option value="">Course…</option>
            {data?.courses.map((c) => <option key={c.course_id} value={c.course_id}>{c.code} — {c.title}</option>)}
          </select>
          <input className={`${inputCls} sm:col-span-2`} placeholder="Team name" value={nt.name} onChange={(e) => setNt({ ...nt, name: e.target.value })} />
        </div>
        <p className="mt-3 mb-1 text-xs font-semibold text-ink-soft">Members (students not yet in a team)</p>
        {!free.length && <p className="text-xs text-ink-faint">Every student is already in a team.</p>}
        <div className="flex flex-wrap gap-2">
          {free.map((s) => {
            const on = nt.members.includes(String(s.user_id));
            return (
              <button key={s.user_id} type="button"
                      className={`rounded-lg border px-2.5 py-1 text-xs ${on ? 'border-pulse bg-pulse-tint text-pulse-dark' : 'border-paper-rule text-ink-soft'}`}
                      onClick={() => setNt({ ...nt, members: on ? nt.members.filter((x) => x !== String(s.user_id)) : [...nt.members, String(s.user_id)] })}>
                {s.full_name}
              </button>
            );
          })}
        </div>
        {nt.members.length > 0 && (
          <select className={`${inputCls} mt-2 w-60`} aria-label="Leader" value={nt.leader} onChange={(e) => setNt({ ...nt, leader: e.target.value })}>
            <option value="">Team leader…</option>
            {nt.members.map((id) => <option key={id} value={id}>{students.find((s) => String(s.user_id) === id)?.full_name}</option>)}
          </select>
        )}
        <div className="mt-3">
          <Btn disabled={!nt.courseId || nt.name.length < 2 || !nt.members.length}
               onClick={() => run(async () => {
                 await api('/api/teams', { method: 'POST', json: { courseId: Number(nt.courseId), name: nt.name,
                   members: nt.members.map((id) => ({ userId: Number(id), memberRole: id === nt.leader ? 'leader' : 'member' })) } });
                 setNt({ courseId: '', name: '', members: [], leader: '' });
               }, 'Team created')}>Create team</Btn>
        </div>
      </Panel>

      <Panel title="Teams and members" subtitle="Add (INSERT) or remove (DELETE, audited by trigger) team members" db="sql">
        {data && !data.teams.length && <Empty>No teams yet.</Empty>}
        <div className="grid gap-4 md:grid-cols-2">
          {data?.teams.map((t) => {
            const a = add[t.team_id] ?? { userId: '', responsibility: '' };
            return (
              <div key={t.team_id} className="rounded-xl border border-paper-rule bg-paper p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">{t.name} <span className="text-xs font-normal text-ink-faint">· {t.course_code}</span></p>
                  {t.project_status ? <Badge value={t.project_status} /> : <Badge value="no proposal" tone="slate" />}
                </div>
                {t.project_title && <p className="text-xs text-ink-faint mt-0.5">{t.project_title}</p>}
                <ul className="mt-2 divide-y divide-paper-rule text-sm">
                  {t.members.map((m) => (
                    <li key={m.user_id} className="flex items-center justify-between gap-2 py-1.5">
                      <span>{m.full_name} {m.member_role === 'leader' && <Badge value="leader" tone="purple" />}
                        {m.responsibility && <span className="block text-[11px] text-ink-faint">{m.responsibility}</span>}</span>
                      <button className="text-xs text-danger hover:underline"
                              onClick={() => run(() => api(`/api/teams?teamId=${t.team_id}&userId=${m.user_id}`, { method: 'DELETE' }), `${m.full_name} removed from ${t.name}`)}>
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <select className={inputCls} aria-label={`Add member to ${t.name}`} value={a.userId}
                          onChange={(e) => setAdd({ ...add, [t.team_id]: { ...a, userId: e.target.value } })}>
                    <option value="">Add student…</option>
                    {free.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
                  </select>
                  <input className={inputCls} placeholder="Responsibility" value={a.responsibility}
                         onChange={(e) => setAdd({ ...add, [t.team_id]: { ...a, responsibility: e.target.value } })} />
                  <Btn variant="ghost" disabled={!a.userId}
                       onClick={() => run(async () => {
                         await api('/api/teams', { method: 'PUT', json: { teamId: t.team_id, userId: Number(a.userId), responsibility: a.responsibility || undefined } });
                         setAdd({ ...add, [t.team_id]: { userId: '', responsibility: '' } });
                       }, 'Member added')}>Add</Btn>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="Guide & reviewer allocation" subtitle="guide_allocations · partial UNIQUE index: one active guide and one active reviewer per project" db="sql">
        <div className="overflow-x-auto rounded-lg border border-paper-rule">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
              <tr><th className="py-2.5 px-3">Project</th><th className="px-3">Status</th><th className="px-3">Faculty guide</th><th className="px-3">Reviewer</th></tr>
            </thead>
            <tbody className="divide-y divide-paper-rule bg-paper-raised">
              {data?.projects.map((p) => (
                <tr key={p.project_id}>
                  <td className="py-2.5 px-3"><p className="font-medium text-ink">{p.title}</p><p className="text-xs text-ink-faint">{p.team_name}</p></td>
                  <td className="px-3"><Badge value={p.status} /></td>
                  {(['guide', 'reviewer'] as const).map((role) => (
                    <td key={role} className="px-3">
                      <select className={inputCls} aria-label={`${role} for ${p.title}`}
                              value={(role === 'guide' ? p.guide_id : p.reviewer_id) ?? ''}
                              onChange={(e) => run(() => api('/api/proposals', { method: 'PUT', json: {
                                action: 'allocate', projectId: p.project_id, guideId: Number(e.target.value), role } }), `${role} allocated`)}>
                        <option value="" disabled>Not allocated</option>
                        {(role === 'guide' ? faculty : reviewers).map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
                      </select>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
