import { z } from 'zod';
import { handler, HttpError, json, parseBody } from '@/lib/http';
import { pool } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { assertProjectAccess, isCoordinator, primaryRole, projectScopeSql } from '@/lib/scope';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* GET /api/risk-dashboard
 *   Filters: q, department (code), level, status (default active | 'all'),
 *            minRisk (default 50), minOverdue (default 1)  — HAVING keeps projects that are
 *            delayed (>= minOverdue overdue milestones) OR risky (>= minRisk). Use 0/0 for "all".
 *   ?projectId=ID&detail=1 returns per-student contribution scores + live risk factors. */
export const GET = handler(async (req) => {
  const session = await requireSession(['faculty', 'coordinator', 'admin']);
  const sp = new URL(req.url).searchParams;

  if (sp.get('detail') && sp.get('projectId')) {
    const projectId = Number(sp.get('projectId'));
    await assertProjectAccess(pool, session, projectId);
    const [contrib, risk] = await Promise.all([
      pool.query('SELECT * FROM fn_student_contribution_scores($1)', [projectId]),
      pool.query('SELECT * FROM fn_calculate_project_risk($1)', [projectId]),
    ]);
    return json({ contributions: contrib.rows, riskNow: risk.rows[0] });
  }

  const params: unknown[] = [session.userId];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const where: string[] = [projectScopeSql(session, 'p', 1)];

  const status = sp.get('status') ?? 'active';
  if (status === 'active') where.push(`p.status IN ('approved','in_progress')`);
  else if (status !== 'all') where.push(`p.status = ${p(status)}`);
  if (sp.get('q')) { const like = p('%' + sp.get('q') + '%'); where.push(`(p.title ILIKE ${like} OR t.name ILIKE ${like})`); }
  if (sp.get('department')) where.push(`d.code = ${p(sp.get('department'))}`);
  const level = sp.get('level');
  if (level) where.push(`COALESCE(ra.risk_level, 'unassessed') = ${p(level)}`);
  const minOverdue = p(Number(sp.get('minOverdue') ?? 1));
  const minRisk = p(Number(sp.get('minRisk') ?? 50));

  // JOINs + GROUP BY + HAVING. COUNT(DISTINCT …) FILTER guards against fan-out from joining
  // milestones and feedback_items in the same query.
  const projects = await pool.query(
    `SELECT p.project_id, p.title, p.status, t.name AS team_name, c.code AS course_code,
            d.code AS department_code, g.full_name AS guide_name,
            COUNT(DISTINCT m.milestone_id)                                   AS total_milestones,
            COUNT(DISTINCT m.milestone_id) FILTER (WHERE m.status = 'approved') AS approved_milestones,
            COUNT(DISTINCT m.milestone_id) FILTER (
              WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')) AS overdue_milestones,
            COUNT(DISTINCT f.feedback_id) FILTER (WHERE f.status IN ('open','in_progress'))   AS open_feedback,
            MIN(m.due_date) FILTER (WHERE m.status <> 'approved')            AS next_due,
            ROUND(100.0 * COUNT(DISTINCT m.milestone_id) FILTER (WHERE m.status = 'approved')
                  / NULLIF(COUNT(DISTINCT m.milestone_id), 0), 1)            AS progress_pct,
            COALESCE(ra.risk_score, 0)                                       AS risk_score,
            COALESCE(ra.risk_level, 'unassessed')                            AS risk_level
       FROM projects p
       JOIN teams t        ON t.team_id = p.team_id
       JOIN courses c      ON c.course_id = p.course_id
       JOIN departments d  ON d.department_id = c.department_id
       LEFT JOIN guide_allocations ga ON ga.project_id = p.project_id AND ga.is_active AND ga.allocation_role = 'guide'
       LEFT JOIN users g   ON g.user_id = ga.guide_id
       LEFT JOIN milestones m      ON m.project_id = p.project_id
       LEFT JOIN feedback_items f  ON f.project_id = p.project_id
       LEFT JOIN LATERAL (
         SELECT r.risk_score, r.risk_level FROM risk_assessments r
          WHERE r.project_id = p.project_id ORDER BY r.assessed_at DESC, r.risk_id DESC LIMIT 1) ra ON TRUE
      WHERE ${where.join(' AND ')}
      GROUP BY p.project_id, t.name, c.code, d.code, g.full_name, ra.risk_score, ra.risk_level
     HAVING COUNT(DISTINCT m.milestone_id) FILTER (
              WHERE m.due_date < CURRENT_DATE AND m.status IN ('pending','changes_requested')) >= ${minOverdue}
         OR COALESCE(ra.risk_score, 0) >= ${minRisk}
      ORDER BY COALESCE(ra.risk_score, 0) DESC, overdue_milestones DESC, p.project_id`, params);

  // Roll-ups from the dashboard view (scoped to the faculty member's own projects).
  const role = primaryRole(session);
  const scopeArgs = [role, session.userId];
  const [byLevel, byDepartment] = await Promise.all([
    pool.query(
      `SELECT risk_level, COUNT(*)::int AS projects FROM v_project_dashboard
        WHERE status IN ('approved','in_progress') AND ($1 <> 'faculty' OR guide_id = $2)
        GROUP BY risk_level ORDER BY MIN(risk_score) DESC`, scopeArgs),
    pool.query(
      `SELECT department_code, COUNT(*)::int AS projects, SUM(overdue_milestones)::int AS overdue_milestones,
              ROUND(AVG(progress_pct), 1) AS avg_progress
         FROM v_project_dashboard WHERE ($1 <> 'faculty' OR guide_id = $2)
        GROUP BY department_code HAVING COUNT(*) > 0 ORDER BY department_code`, scopeArgs),
  ]);
  return json({ projects: projects.rows, byLevel: byLevel.rows, byDepartment: byDepartment.rows });
});

/* POST /api/risk-dashboard — recompute & store risk snapshots via sp_refresh_risk_assessments */
const RefreshBody = z.object({ projectId: z.number().int().positive().optional() });
export const POST = handler(async (req) => {
  const session = await requireSession(['faculty', 'coordinator', 'admin']);
  const { projectId } = await parseBody(req, RefreshBody);
  if (projectId) await assertProjectAccess(pool, session, projectId);
  else if (!isCoordinator(session)) throw new HttpError(403, 'Only coordinators can refresh every project');
  await pool.query('CALL sp_refresh_risk_assessments($1::bigint)', [projectId ?? null]);
  return json({ refreshed: projectId ?? 'all' });
});
