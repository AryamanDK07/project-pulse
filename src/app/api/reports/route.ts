import { handler, json } from '@/lib/http';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { projectScopeSql } from '@/lib/scope';
import { documentStats } from '@/lib/srs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/reports[?minOverdueTasks=1&imbalance=30]
 * The "important queries" of the project, scoped to the projects the user can see.
 * Each block names the SQL concept it demonstrates. */
export const GET = handler(async (req) => {
  const session = await requireSession(['faculty', 'reviewer', 'coordinator', 'admin']);
  const sp = new URL(req.url).searchParams;
  const minOverdueTasks = Math.max(1, Number(sp.get('minOverdueTasks') ?? 1));
  const imbalance = Math.max(0, Number(sp.get('imbalance') ?? 30));
  const scope = projectScopeSql(session, 'p', 1);
  const u = [session.userId];

  const [overdueTeams, unresolvedMilestones, lateUnapproved, missingDocs, imbalanceRows,
         progress, openFeedback, riskEvents, visible] = await Promise.all([
    // JOIN + GROUP BY + HAVING + date arithmetic: teams over a threshold of overdue tasks
    pool.query(
      `SELECT t.team_id, t.name AS team_name, p.project_id, p.title,
              COUNT(k.task_id) AS overdue_tasks,
              MAX(CURRENT_DATE - k.due_date) AS worst_days_late
         FROM teams t
         JOIN projects p   ON p.team_id = t.team_id
         JOIN milestones m ON m.project_id = p.project_id
         JOIN tasks k      ON k.milestone_id = m.milestone_id
        WHERE ${scope} AND k.status <> 'done' AND k.due_date < CURRENT_DATE
        GROUP BY t.team_id, p.project_id
       HAVING COUNT(k.task_id) >= $2
        ORDER BY overdue_tasks DESC, worst_days_late DESC`, [...u, minOverdueTasks]),
    // EXISTS subquery: milestones that still have unresolved feedback
    pool.query(
      `SELECT m.milestone_id, m.title, m.status, m.due_date, p.project_id, p.title AS project_title,
              (SELECT COUNT(*) FROM feedback_items f WHERE f.milestone_id = m.milestone_id
                 AND f.status IN ('open','in_progress')) AS open_items
         FROM milestones m JOIN projects p ON p.project_id = m.project_id
        WHERE ${scope}
          AND EXISTS (SELECT 1 FROM feedback_items f WHERE f.milestone_id = m.milestone_id
                        AND f.status IN ('open','in_progress'))
        ORDER BY open_items DESC, m.due_date`, u),
    // Unapproved milestones past their due date (ORDER BY lateness)
    pool.query(
      `SELECT m.milestone_id, m.title, m.status, m.due_date, (CURRENT_DATE - m.due_date) AS days_late,
              p.project_id, p.title AS project_title
         FROM milestones m JOIN projects p ON p.project_id = m.project_id
        WHERE ${scope} AND m.status <> 'approved' AND m.due_date < CURRENT_DATE
        ORDER BY days_late DESC`, u),
    // Anti-join view (NOT EXISTS + GROUP BY/HAVING): mandatory document types not yet submitted
    pool.query(
      `SELECT v.* FROM v_projects_missing_deliverables v JOIN projects p ON p.project_id = v.project_id
        WHERE ${scope} ORDER BY v.missing_count DESC`, u),
    // Conditional aggregation over the contribution view: spread between top and bottom member
    pool.query(
      `SELECT v.project_id, v.project_title, v.team_name,
              COUNT(*) AS members,
              MAX(v.contribution_pct) AS top_share, MIN(v.contribution_pct) AS bottom_share,
              MAX(v.contribution_pct) - MIN(v.contribution_pct) AS spread,
              jsonb_agg(jsonb_build_object('name', v.full_name, 'pct', v.contribution_pct,
                        'peer', v.avg_peer_rating) ORDER BY v.contribution_pct DESC) AS breakdown
         FROM v_contribution_summary v JOIN projects p ON p.project_id = v.project_id
        WHERE ${scope}
        GROUP BY v.project_id, v.project_title, v.team_name
       HAVING COUNT(*) > 1 AND MAX(v.contribution_pct) - MIN(v.contribution_pct) >= $2
        ORDER BY spread DESC`, [...u, imbalance]),
    pool.query(
      `SELECT v.* FROM v_project_progress v JOIN projects p ON p.project_id = v.project_id
        WHERE ${scope} AND p.status IN ('approved','in_progress','completed') ORDER BY v.project_id`, u),
    pool.query(
      `SELECT v.* FROM v_unresolved_feedback v JOIN projects p ON p.project_id = v.project_id
        WHERE ${scope} ORDER BY CASE v.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 v.age_days DESC`, u),
    pool.query(
      `SELECT e.event_id, e.project_id, p.title AS project_title, e.event_type, e.details, e.created_at
         FROM risk_events e JOIN projects p ON p.project_id = e.project_id
        WHERE ${scope} AND e.resolved_at IS NULL ORDER BY e.created_at DESC LIMIT 50`, u),
    pool.query(`SELECT p.project_id FROM projects p WHERE ${scope}`, u),
  ]);

  // MongoDB aggregation pipelines (document versions, change history, type distribution)
  let documents: Awaited<ReturnType<typeof documentStats>> | null = null;
  let documentsError: string | null = null;
  try { documents = await documentStats(visible.rows.map((r) => Number(r.project_id))); }
  catch (e) { documentsError = `MongoDB unavailable: ${(e as Error).message}`; }

  return json({
    overdueTeams: overdueTeams.rows, unresolvedMilestones: unresolvedMilestones.rows,
    lateUnapproved: lateUnapproved.rows, missingDocs: missingDocs.rows, imbalance: imbalanceRows.rows,
    progress: progress.rows, openFeedback: openFeedback.rows, riskEvents: riskEvents.rows,
    documents, documentsError,
  });
});
