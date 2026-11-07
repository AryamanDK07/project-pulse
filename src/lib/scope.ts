import type { Role, Session } from './auth';
import type { Db } from './db';
import { HttpError } from './http';

/** Highest-privilege role wins when a user holds several. */
export function primaryRole(s: Session): Role {
  for (const r of ['admin', 'coordinator', 'faculty'] as Role[]) if (s.roles.includes(r)) return r;
  return 'student';
}
export const isStaff = (s: Session) => primaryRole(s) !== 'student';
export const isCoordinator = (s: Session) => ['admin', 'coordinator'].includes(primaryRole(s));

/**
 * SQL predicate limiting rows to projects the user may see:
 *   admin/coordinator -> all, faculty -> allocated guide, student -> team member.
 * `alias` must be the alias of the `projects` table; `userParam` is the $n holding the user id
 * (it is always referenced so the parameter list stays valid).
 */
export function projectScopeSql(s: Session, alias: string, userParam: number): string {
  switch (primaryRole(s)) {
    case 'admin':
    case 'coordinator':
      return `($${userParam}::bigint IS NOT NULL)`;
    case 'faculty':
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
