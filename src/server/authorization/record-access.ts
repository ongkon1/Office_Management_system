import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { hasPermission, type ActorPolicyContext } from './policy';
import { reachesEmployee } from '@/server/organization/department-authority';

/**
 * Record reach for the Phase 7 supporting services (`BE-0705`, `BE-0712`,
 * `BE-0715`, `BE-0720`).
 *
 * Notifications, attachments, documents, messages and search all ask the same
 * question — "may this actor open that record?" — and a second copy of the
 * answer is how one of them ends up showing a record the others hide. Every
 * check reads the **live** row, so a stale index, an old notification or a
 * cached link never decides visibility.
 *
 * Government records are refused before anything else is considered, and a
 * refusal is always `null`/`false`: callers turn it into the same not-found
 * result a nonexistent record produces.
 */
export type Executor = Pick<Pool | PoolConnection, 'execute'>;
type Row = RowDataPacket & Record<string, unknown>;

export const isOrganizationWide = (actor: ActorPolicyContext) =>
  actor.roles.includes('super_admin') || actor.roles.includes('hr_manager');

export const canSeeGovernment = (actor: ActorPolicyContext) => hasPermission(actor, 'organization.government.view');

async function first(db: Executor, sql: string, values: readonly (string | number | boolean | null)[]) {
  const [rows] = await db.execute<Row[]>(sql, values as (string | number | boolean | null)[]);
  return rows[0] ?? null;
}

export interface DivisionReach { readonly divisionId: string; readonly government: boolean }

export async function divisionReach(db: Executor, actor: ActorPolicyContext, divisionId: string): Promise<DivisionReach | null> {
  const row = await first(db, 'SELECT id,is_government FROM divisions WHERE id=? AND is_active=TRUE', [divisionId]);
  if (!row) return null;
  const government = Boolean(row.is_government);
  if (government && !canSeeGovernment(actor)) return null;
  return isOrganizationWide(actor) || actor.divisionIds.has(divisionId) ? { divisionId, government } : null;
}

export interface ProjectReach extends DivisionReach {
  readonly projectId: string;
  readonly managerEmployeeId: string | null;
  /** Manages the project or holds a division-wide role over it. */
  readonly canModerate: boolean;
}

export async function projectReach(db: Executor, actor: ActorPolicyContext, projectId: string, date: string): Promise<ProjectReach | null> {
  const row = await first(db, `SELECT p.id,p.division_id,p.manager_employee_id,d.is_government FROM projects p
    JOIN divisions d ON d.id=p.division_id WHERE p.id=?`, [projectId]);
  if (!row) return null;
  const government = Boolean(row.is_government);
  if (government && !canSeeGovernment(actor)) return null;
  const reach = {
    projectId, divisionId: String(row.division_id), government,
    managerEmployeeId: row.manager_employee_id ? String(row.manager_employee_id) : null,
  };
  const manages = actor.employeeId !== null && actor.employeeId === reach.managerEmployeeId;
  const divisionLead = actor.divisionIds.has(reach.divisionId) && (actor.roles.includes('team_lead') || actor.roles.includes('management'));
  if (isOrganizationWide(actor) || manages || divisionLead || actor.projectIds.has(projectId)) {
    return { ...reach, canModerate: isOrganizationWide(actor) || manages || (divisionLead && actor.roles.includes('team_lead')) };
  }
  if (!actor.employeeId) return null;
  const member = await first(db, `SELECT 1 hit FROM project_members WHERE project_id=? AND employee_id=? AND is_active=TRUE
      AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
    UNION ALL SELECT 1 FROM tasks t WHERE t.project_id=? AND t.is_active=TRUE
      AND (t.assignee_employee_id=? OR EXISTS(SELECT 1 FROM task_members m WHERE m.task_id=t.id AND m.employee_id=?)) LIMIT 1`,
  [projectId, actor.employeeId, date, date, projectId, actor.employeeId, actor.employeeId]);
  return member ? { ...reach, canModerate: false } : null;
}

export interface TaskReach extends DivisionReach {
  readonly taskId: string;
  readonly projectId: string;
  readonly assigneeEmployeeId: string;
}

export async function taskReach(db: Executor, actor: ActorPolicyContext, taskId: string): Promise<TaskReach | null> {
  const row = await first(db, `SELECT t.id,t.project_id,t.assignee_employee_id,p.division_id,p.manager_employee_id,d.is_government
    FROM tasks t JOIN projects p ON p.id=t.project_id JOIN divisions d ON d.id=p.division_id WHERE t.id=?`, [taskId]);
  if (!row) return null;
  const government = Boolean(row.is_government);
  if (government && !canSeeGovernment(actor)) return null;
  const reach: TaskReach = {
    taskId, projectId: String(row.project_id), divisionId: String(row.division_id), government,
    assigneeEmployeeId: String(row.assignee_employee_id),
  };
  if (isOrganizationWide(actor)) return reach;
  if (actor.employeeId && (actor.employeeId === reach.assigneeEmployeeId || actor.employeeId === row.manager_employee_id)) return reach;
  if (actor.employeeId) {
    const member = await first(db, 'SELECT 1 hit FROM task_members WHERE task_id=? AND employee_id=?', [taskId, actor.employeeId]);
    if (member) return reach;
  }
  if (hasPermission(actor, 'time.team.read') && reachesEmployee(actor, { employeeId: reach.assigneeEmployeeId, divisionId: reach.divisionId })) return reach;
  if (actor.roles.includes('management') && actor.divisionIds.has(reach.divisionId)) return reach;
  return null;
}

/**
 * An employee record — a profile, a timesheet day, a remark — is reachable by
 * the employee, by whoever leads them, and by HR and Super Administrators.
 * When the record touches a government division, that permission is required
 * as well, because naming the day would otherwise reveal the work.
 */
export async function employeeReach(db: Executor, actor: ActorPolicyContext, employeeId: string, options: { readonly date?: string } = {}): Promise<boolean> {
  const employee = await first(db, 'SELECT id FROM employees WHERE id=?', [employeeId]);
  if (!employee) return false;
  if (options.date && !canSeeGovernment(actor)) {
    const government = await first(db, `SELECT 1 hit FROM time_entries t JOIN divisions d ON d.id=t.division_id
      WHERE t.employee_id=? AND t.work_date=? AND t.is_active=TRUE AND t.status<>'draft' AND d.is_government=TRUE LIMIT 1`, [employeeId, options.date]);
    if (government) return false;
  }
  if (actor.employeeId === employeeId || isOrganizationWide(actor)) return true;
  return reachesEmployee(actor, { employeeId });
}
