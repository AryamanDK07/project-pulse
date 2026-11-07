'use client';
import { useState } from 'react';
import { api, useDebounced, useFetch } from '@/lib/client';
import type { RiskRow } from '@/lib/types';
import { Badge, Btn, DbTag, Empty, fmtDate, Icon, inputCls, Notice, Panel, ProgressBar, Stat } from './ui';

interface Data {
  projects: RiskRow[];
  byLevel: { risk_level: string; projects: number }[];
  byDepartment: {
    department_code: string;
    projects: number;
    overdue_milestones: number;
    avg_progress: string | null;
  }[];
}

export default function AdminOverview() {
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('');
  const [level, setLevel] = useState('');
  const [status, setStatus] = useState('active');
  const [err, setErr] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const dq = useDebounced(q);
  // minRisk=0 & minOverdue=0 turns the HAVING clause into "show everything".
  const params = new URLSearchParams({ minRisk: '0', minOverdue: '0', status });
  if (dq) params.set('q', dq);
  if (dept) params.set('department', dept);
  if (level) params.set('level', level);

  const { data, error, loading, reload } = useFetch<Data>(`/api/risk-dashboard?${params}`);

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

  const count = (l: string) => data?.byLevel.find((x) => x.risk_level === l)?.projects ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          label="Critical Risk"
          value={count('critical')}
          tone="red"
          icon={<Icon name="alert" className="w-5 h-5 text-red-500" />}
          db="sql"
        />
        <Stat
          label="High Risk"
          value={count('high')}
          tone="amber"
          icon={<Icon name="alert" className="w-5 h-5 text-amber-500" />}
          db="sql"
        />
        <Stat
          label="Medium Risk"
          value={count('medium')}
          icon={<Icon name="pulse" className="w-5 h-5 text-sky-500" />}
          db="sql"
        />
        <Stat
          label="Low Risk / Healthy"
          value={count('low')}
          icon={<Icon name="check" className="w-5 h-5 text-emerald-500" />}
          db="sql"
        />
      </div>

      {/* Main Table with Filters */}
      <Panel
        title="Departmental Project Governance & Risk Ledger"
        subtitle="Aggregated via PostgreSQL View v_project_dashboard with LATERAL subqueries and GROUP BY / HAVING filters"
        db="sql"
        action={
          <Btn variant="ghost" onClick={refresh} disabled={refreshing}>
            <Icon name="refresh" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Recalculating…' : 'Recalculate All Projects'}
          </Btn>
        }
      >
        {/* Filter Toolbar */}
        <div className="mb-4 grid gap-3 sm:grid-cols-4 rounded-xl bg-paper p-3 border border-paper-rule">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Search Keyword</label>
            <div className="relative">
              <input
                className={`${inputCls} pl-8`}
                placeholder="Title or team name…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search"
              />
              <span className="absolute left-2.5 top-2.5 text-ink-faint">
                <Icon name="search" className="w-3.5 h-3.5" />
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Academic Department</label>
            <select
              className={inputCls}
              value={dept}
              onChange={(e) => setDept(e.target.value)}
              aria-label="Department"
            >
              <option value="">All Departments</option>
              {data?.byDepartment.map((d) => (
                <option key={d.department_code} value={d.department_code}>
                  {d.department_code}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Risk Severity</label>
            <select
              className={inputCls}
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              aria-label="Risk level"
            >
              <option value="">Any Risk Level</option>
              {['critical', 'high', 'medium', 'low', 'unassessed'].map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Project Status</label>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Status"
            >
              <option value="active">Active Projects</option>
              <option value="all">All Lifecycle States</option>
              {['proposed', 'revision_requested', 'approved', 'in_progress', 'completed', 'rejected'].map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Notice error={error ?? err} />

        {loading && !data && (
          <div className="py-12 text-center text-sm text-ink-faint flex flex-col items-center">
            <svg className="animate-spin h-6 w-6 text-pulse mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            Loading project risk records from PostgreSQL…
          </div>
        )}

        {data && !data.projects.length && (
          <Empty>No projects match your current search and filter criteria.</Empty>
        )}

        {!!data?.projects.length && (
          <div className="overflow-x-auto rounded-lg border border-paper-rule">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
                <tr>
                  <th className="py-3 px-4">Project & Team</th>
                  <th className="px-3">Dept</th>
                  <th className="px-3">Assigned Guide</th>
                  <th className="px-3">Status</th>
                  <th className="px-3">Milestone Progress</th>
                  <th className="px-3">Overdue</th>
                  <th className="px-3">Open Feedback</th>
                  <th className="py-3 px-4">Calculated Risk</th>
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
                    <td className="px-3">
                      <span className="rounded bg-paper px-2 py-0.5 text-xs font-mono font-semibold text-ink-soft border border-paper-rule">
                        {p.department_code}
                      </span>
                    </td>
                    <td className="px-3 text-ink-soft font-medium">{p.guide_name ?? '—'}</td>
                    <td className="px-3">
                      <Badge value={p.status} />
                    </td>
                    <td className="px-3">
                      <ProgressBar pct={Number(p.progress_pct ?? 0)} />
                    </td>
                    <td className="px-3 tabular-nums font-semibold">
                      {Number(p.overdue_milestones) > 0 ? (
                        <span className="text-danger">{p.overdue_milestones}</span>
                      ) : (
                        <span className="text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="px-3 tabular-nums font-semibold">
                      {Number(p.open_feedback) > 0 ? (
                        <span className="text-warning">{p.open_feedback}</span>
                      ) : (
                        <span className="text-ink-faint">0</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge value={p.risk_level} />
                        <span className="text-xs font-mono font-bold text-ink-soft">
                          {p.risk_score}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Department Breakdown Panel */}
      <Panel
        title="Departmental Health & Milestone Completion Metrics"
        subtitle="SQL Aggregations via GROUP BY department_code HAVING COUNT(*) > 0"
        db="sql"
      >
        <div className="overflow-x-auto rounded-lg border border-paper-rule">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
              <tr>
                <th className="py-3 px-4">Department Code</th>
                <th className="px-3">Active Projects</th>
                <th className="px-3">Overdue Milestones</th>
                <th className="px-3">Average Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paper-rule bg-paper-raised">
              {data?.byDepartment.map((d) => (
                <tr key={d.department_code} className="hover:bg-paper-hover/60 transition-colors">
                  <td className="py-3 px-4 font-semibold text-ink flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-pulse" />
                    {d.department_code}
                  </td>
                  <td className="px-3 tabular-nums font-medium text-ink-soft">{d.projects} projects</td>
                  <td className="px-3 tabular-nums font-semibold">
                    {d.overdue_milestones > 0 ? (
                      <span className="text-danger">{d.overdue_milestones} overdue</span>
                    ) : (
                      <span className="text-success font-medium">0 overdue</span>
                    )}
                  </td>
                  <td className="px-3">
                    <ProgressBar pct={Number(d.avg_progress ?? 0)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
