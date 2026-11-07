'use client';
import { useState, type ReactNode } from 'react';
import { useFetch } from '@/lib/client';
import { Badge, DbTag, Empty, fmtDate, inputCls, Notice, Panel, ProgressBar } from './ui';

type Row = Record<string, unknown>;
interface Data {
  overdueTeams: Row[]; unresolvedMilestones: Row[]; lateUnapproved: Row[]; missingDocs: Row[];
  imbalance: Row[]; progress: Row[]; openFeedback: Row[]; riskEvents: Row[];
  documents: { perProject: Row[]; changes: Row[]; byType: Row[] } | null; documentsError: string | null;
}

function Table({ cols, rows, empty }: { cols: [string, (r: Row) => ReactNode][]; rows: Row[]; empty: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto rounded-lg border border-paper-rule">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wider text-ink-soft border-b border-paper-rule">
          <tr>{cols.map(([h]) => <th key={h} className="py-2.5 px-3">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-paper-rule bg-paper-raised">
          {rows.map((r, i) => <tr key={i}>{cols.map(([h, f]) => <td key={h} className="py-2.5 px-3 align-top">{f(r)}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

const s = (v: unknown) => String(v ?? '—');

/** Report dashboard: the project's "important queries" plus MongoDB aggregations. */
export default function Reports() {
  const [minOverdue, setMinOverdue] = useState('1');
  const [imbalance, setImbalance] = useState('30');
  const { data, error } = useFetch<Data>(`/api/reports?minOverdueTasks=${minOverdue || 1}&imbalance=${imbalance || 0}`);

  return (
    <div className="space-y-6">
      <Notice error={error} />
      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-paper-rule bg-paper-raised p-4 shadow-card">
        <label className="text-xs font-semibold text-ink-soft">HAVING: at least N overdue tasks
          <input className={`${inputCls} mt-1 w-28`} type="number" min={1} value={minOverdue} onChange={(e) => setMinOverdue(e.target.value)} />
        </label>
        <label className="text-xs font-semibold text-ink-soft">Contribution spread ≥ (percentage points)
          <input className={`${inputCls} mt-1 w-28`} type="number" min={0} max={100} value={imbalance} onChange={(e) => setImbalance(e.target.value)} />
        </label>
      </div>

      <Panel title="Project progress" subtitle="VIEW v_project_progress · fn_milestone_completion_pct() · fn_documentation_completeness()" db="sql">
        <Table rows={data?.progress ?? []} empty="No active projects."
          cols={[['Project', (r) => <span className="font-medium text-ink">{s(r.title)}</span>],
                 ['Milestones (weighted)', (r) => <ProgressBar pct={Number(r.milestone_completion_pct ?? 0)} />],
                 ['Tasks', (r) => <ProgressBar pct={Number(r.task_completion_pct ?? 0)} />],
                 ['Documentation', (r) => <ProgressBar pct={Number(r.documentation_pct ?? 0)} />]]} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Teams with overdue tasks" subtitle="JOIN · GROUP BY · HAVING COUNT(*) ≥ N · date arithmetic" db="sql">
          <Table rows={data?.overdueTeams ?? []} empty="No team is over the threshold."
            cols={[['Team', (r) => s(r.team_name)], ['Project', (r) => s(r.title)],
                   ['Overdue', (r) => <span className="font-semibold text-danger">{s(r.overdue_tasks)}</span>],
                   ['Worst', (r) => `${s(r.worst_days_late)} days late`]]} />
        </Panel>
        <Panel title="Late, unapproved milestones" subtitle="WHERE status <> 'approved' AND due_date < CURRENT_DATE · ORDER BY lateness" db="sql">
          <Table rows={data?.lateUnapproved ?? []} empty="Nothing is late."
            cols={[['Project', (r) => s(r.project_title)], ['Milestone', (r) => s(r.title)],
                   ['Status', (r) => <Badge value={s(r.status)} />], ['Late', (r) => `${s(r.days_late)} days`]]} />
        </Panel>
        <Panel title="Milestones with unresolved feedback" subtitle="EXISTS subquery + correlated COUNT" db="sql">
          <Table rows={data?.unresolvedMilestones ?? []} empty="All milestone feedback is resolved."
            cols={[['Project', (r) => s(r.project_title)], ['Milestone', (r) => s(r.title)],
                   ['Open items', (r) => <span className="font-semibold text-warning">{s(r.open_items)}</span>]]} />
        </Panel>
        <Panel title="Missing mandatory deliverables" subtitle="VIEW v_projects_missing_deliverables · NOT EXISTS anti-join · HAVING" db="sql">
          <Table rows={data?.missingDocs ?? []} empty="Every project has all mandatory documents."
            cols={[['Project', (r) => s(r.title)], ['Team', (r) => s(r.team_name)],
                   ['Missing', (r) => (r.missing_types as string[]).map((t) => <Badge key={t} value={t} tone="amber" />)]]} />
        </Panel>
      </div>

      <Panel title="Contribution imbalance" subtitle="VIEW v_contribution_summary · conditional aggregation · HAVING spread ≥ X" db="sql">
        <Table rows={data?.imbalance ?? []} empty="No team is above the imbalance threshold."
          cols={[['Project', (r) => s(r.project_title)], ['Team', (r) => s(r.team_name)],
                 ['Spread', (r) => <span className="font-semibold text-danger">{s(r.spread)} pts</span>],
                 ['Members', (r) => (r.breakdown as { name: string; pct: string; peer: string | null }[]).map((b) => (
                   <span key={b.name} className="mr-3 inline-block text-xs">{b.name}: <b>{b.pct}%</b>{b.peer ? ` (peer ${Number(b.peer).toFixed(1)})` : ''}</span>))]]} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Unresolved feedback" subtitle="VIEW v_unresolved_feedback" db="sql">
          <Table rows={data?.openFeedback ?? []} empty="No open feedback."
            cols={[['Severity', (r) => <Badge value={s(r.severity)} />], ['Project', (r) => s(r.project_title)],
                   ['Assigned to', (r) => s(r.assigned_to_name)], ['Age', (r) => `${s(r.age_days)} d`]]} />
        </Panel>
        <Panel title="Open risk events" subtitle="risk_events · written by trg_milestones_overdue_event & trg_risk_escalation_event" db="sql">
          <Table rows={data?.riskEvents ?? []} empty="No open risk events."
            cols={[['Event', (r) => <Badge value={s(r.event_type)} tone={r.event_type === 'risk_escalated' ? 'red' : 'amber'} />],
                   ['Project', (r) => s(r.project_title)],
                   ['Details', (r) => {
                     const d = r.details as Record<string, unknown>;
                     return r.event_type === 'milestone_overdue' ? `${s(d.title)} · ${s(d.days_late)} days late` : `${s(d.from)} → ${s(d.to)} (${s(d.score)})`;
                   }],
                   ['Raised', (r) => fmtDate(r.created_at as string)]]} />
        </Panel>
      </div>

      <Panel title="Document versions & change history" subtitle="MongoDB aggregation pipelines: $match → $unwind → $group → $project → $sort" db="mongo">
        <Notice error={data?.documentsError ?? null} />
        {data?.documents && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">Per project</p>
              <Table rows={data.documents.perProject} empty="No documents stored in MongoDB yet."
                cols={[['Project #', (r) => s(r.projectId)], ['Documents', (r) => s(r.documents)],
                       ['Versions', (r) => s(r.totalVersions)],
                       ['Types', (r) => (r.documentTypes as string[]).map((t) => <Badge key={t} value={t} tone="green" />)],
                       ['Last upload', (r) => fmtDate(r.latestUpload as string)]]} />
            </div>
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">By document type</p>
                <Table rows={data.documents.byType} empty="—"
                  cols={[['Type', (r) => s(r.documentType)], ['Docs', (r) => s(r.documents)], ['Versions', (r) => s(r.versions)]]} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">Section changes <DbTag type="mongo" label="srs_change_log" /></p>
                <Table rows={data.documents.changes} empty="No section changes yet."
                  cols={[['Project #', (r) => s(r.projectId)], ['Change', (r) => s(r.changeType)], ['Count', (r) => s(r.count)]]} />
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
