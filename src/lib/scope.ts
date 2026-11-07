import type { Role, Session } from './auth';
import type { Db } from './db';
import { HttpError } from './http';

/** Highest-privilege role wins when a user holds several. */
export function primaryRole(s: Session): Role {
  for (const r of ['admin', 'coordinator', 'faculty', 'reviewer'] as Role[]) if (s.roles.includes(r)) return r;
  return 'student';
}
/** Any non-student role (faculty guide, reviewer, coordinator, admin). */
export const isStaff = (s: Session) => primaryRole(s) !== 'student';
/** Faculty guide or above — may approve proposals and milestones. */
export const isGuide = (s: Session) => ['admin', 'coordinator', 'faculty'].includes(primaryRole(s));
export const isCoordinator = (s: Session) => ['admin', 'coordinator'].includes(primaryRole(s));

/** Landing page for each role. */
export const homeFor = (role: Role) =>
  ({ student: '/student', faculty: '/faculty', reviewer: '/reviewer', coordinator: '/admin', admin: '/admin' })[role];

/**
 * SQL predicate limiting rows to projects the user may see:
 *   admin/coordinator -> all, faculty/reviewer -> projects allocated to them, student -> own team.
 * `alias` must be the alias of the `projects` table; `userParam` is the $n holding the user id
 * (it is always referenced so the parameter list stays valid).
 */
export function projectScopeSql(s: Session, alias: string, userParam: number): string {
  switch (primaryRole(s)) {
    case 'admin':
    case 'coordinator':
      return `($${userParam}::bigint IS NOT NULL)`;
    case 'faculty':
    case 'reviewer':
      return `EXISTS (SELECT 1 FROM guide_allocations ga_s WHERE ga_s.project_id = ${alias}.project_id
                       AND ga_s.guide_id = $${userParam} AND ga_s.is_active)`;
    default:
      return `EXISTS (SELECT 1 FROM team_members tm_s WHERE tm_s.team_id = ${alias}.team_id
                       AND tm_s.user_id = $${userParam})`;
  }
}

export async function assertProjectAccess(db: Db, s: Session, projectId: number): Promise<void> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM projects p WHERE p.project_id = $1 AND ${projectScopeSql(s, 'p', 2)}`,
    [projectId, s.userId]);
  if (!rowCount) throw new HttpError(403, 'You do not have access to this project');
}

/** Project id that owns a milestone, after checking access. */
export async function projectOfMilestone(db: Db, s: Session, milestoneId: number): Promise<number> {
  const r = await db.query('SELECT project_id FROM milestones WHERE milestone_id = $1', [milestoneId]);
  if (!r.rowCount) throw new HttpError(404, 'Milestone not found');
  const projectId = Number(r.rows[0].project_id);
  await assertProjectAccess(db, s, projectId);
  return projectId;
}

/** Project id that owns a task, after checking access. */
export async function projectOfTask(db: Db, s: Session, taskId: number): Promise<number> {
  const r = await db.query(
    'SELECT m.project_id FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id WHERE t.task_id = $1', [taskId]);
  if (!r.rowCount) throw new HttpError(404, 'Task not found');
  const projectId = Number(r.rows[0].project_id);
  await assertProjectAccess(db, s, projectId);
  return projectId;
}
