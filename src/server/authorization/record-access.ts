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

/** Organisation-wide authority: Super Administrator and HR Manager. */
export const isWideRole = isOrganizationWide;

/** Management/View-Only with no other role: may read, never change. */
export const isReadOnly = (actor: ActorPolicyContext) =>
  actor.roles.includes('management') &&
  !actor.roles.some((role) => ['super_admin', 'hr_manager', 'team_lead'].includes(role));

/** A role that carries project management — a department appointment alone does not. */
export const canCreateProject = (actor: ActorPolicyContext) =>
  isOrganizationWide(actor) || actor.roles.includes('team_lead');

export interface ProjectFacts {
  readonly projectId: string;
  readonly divisionId: string;
  readonly managerEmployeeId: string | null;
  readonly government: boolean;
  /** An active, currently effective membership. */
  readonly isMember: boolean;
  /** Assignee or supporting member of an active task in the project. */
  readonly hasTask: boolean;
}

/**
 * The one project rule. View: Super Administrator and HR (all), Management
 * (all, read only), a Team Lead over projects in the divisions they are placed
 * in, the manager, active members and anyone with a task on it. Manage: Super
 * Administrator, HR, a Team Lead in the project's division and the manager. A
 * department appointment grants neither — it is authority over people, never
 * over a project. Government projects need `organization.government.view`.
 */
export function decideProjectReach(actor: ActorPolicyContext, facts: ProjectFacts): { readonly view: boolean; readonly manage: boolean } {
  if (facts.government && !canSeeGovernment(actor)) return { view: false, manage: false };
  const manages = isOrganizationWide(actor)
    || (actor.employeeId !== null && actor.employeeId === facts.managerEmployeeId)
    || (actor.roles.includes('team_lead') && actor.divisionIds.has(facts.divisionId));
  const view = manages || actor.roles.includes('management') || actor.projectIds.has(facts.projectId) || facts.isMember || facts.hasTask;
  return { view, manage: view && manages && !isReadOnly(actor) };
}

/** SQL fragments that load `ProjectFacts` for one employee; bind `[me, date, date, me, me]`. */
export const PROJECT_FACT_COLUMNS = `p.id,p.division_id,p.manager_employee_id,d.is_government,
  EXISTS(SELECT 1 FROM project_members pm WHERE pm.project_id=p.id AND pm.employee_id=? AND pm.is_active=TRUE
    AND pm.effective_from<=? AND (pm.effective_to IS NULL OR pm.effective_to>=?)) is_member,
  EXISTS(SELECT 1 FROM tasks t WHERE t.project_id=p.id AND t.is_active=TRUE
    AND (t.assignee_employee_id=? OR EXISTS(SELECT 1 FROM task_members tm WHERE tm.task_id=t.id AND tm.employee_id=?))) has_task`;

export const projectFactsFrom = (row: Record<string, unknown>): ProjectFacts => ({
  projectId: String(row.id),
  divisionId: String(row.division_id),
  managerEmployeeId: row.manager_employee_id ? String(row.manager_employee_id) : null,
  government: Boolean(row.is_government),
  isMember: Boolean(row.is_member),
  hasTask: Boolean(row.has_task),
});

export interface ProjectReach extends DivisionReach {
  readonly projectId: string;
  readonly managerEmployeeId: string | null;
  /** May edit the project, add its tasks, announce and pin in its channel. */
  readonly canModerate: boolean;
}

export async function projectReach(db: Executor, actor: ActorPolicyContext, projectId: string, date: string): Promise<ProjectReach | null> {
  const me = actor.employeeId ?? '';
  const row = await first(db, `SELECT ${PROJECT_FACT_COLUMNS} FROM projects p JOIN divisions d ON d.id=p.division_id WHERE p.id=?`,
    [me, date, date, me, me, projectId]);
  if (!row) return null;
  const facts = projectFactsFrom(row);
  const decision = decideProjectReach(actor, facts);
  if (!decision.view) return null;
  return {
    projectId, divisionId: facts.divisionId, government: facts.government,
    managerEmployeeId: facts.managerEmployeeId, canModerate: decision.manage,
  };
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

export interface DocumentReach {
  readonly documentId: string;
  readonly scope: 'company' | 'division' | 'project';
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly government: boolean;
  readonly isActive: boolean;
  /** Create versions, edit metadata, change access, deactivate. */
  readonly canManage: boolean;
}

/**
 * `REQ-DOC-003`, `REQ-DOC-004`. A company document is readable by every active
 * employee; a division document only inside that division (its private area);
 * a project document only by those who reach the project. Government
 * sensitivity — set on the document or inherited from its division — needs the
 * government permission, and without it the document does not exist for the
 * viewer. A deactivated document is visible only to the people who manage it.
 */
export async function documentReach(db: Executor, actor: ActorPolicyContext, documentId: string, date: string): Promise<DocumentReach | null> {
  const row = await first(db, `SELECT doc.id,doc.scope_type,doc.division_id,doc.project_id,doc.sensitivity,doc.is_active,
      COALESCE(d.is_government,pd.is_government,FALSE) scope_government
    FROM documents doc LEFT JOIN divisions d ON d.id=doc.division_id
    LEFT JOIN projects p ON p.id=doc.project_id LEFT JOIN divisions pd ON pd.id=p.division_id WHERE doc.id=?`, [documentId]);
  if (!row) return null;
  const scope = String(row.scope_type) as DocumentReach['scope'];
  const government = String(row.sensitivity) === 'government' || Boolean(row.scope_government);
  if (government && !canSeeGovernment(actor)) return null;
  const divisionId = row.division_id ? String(row.division_id) : null;
  const projectId = row.project_id ? String(row.project_id) : null;
  let read = false;
  let manage = false;
  if (scope === 'company') {
    read = actor.employeeId !== null || isOrganizationWide(actor);
    manage = isOrganizationWide(actor) || hasPermission(actor, 'document.manage');
  } else if (scope === 'division' && divisionId) {
    read = Boolean(await divisionReach(db, actor, divisionId));
    manage = read && (isOrganizationWide(actor) || hasPermission(actor, 'document.manage')
      || (actor.roles.includes('team_lead') && actor.divisionIds.has(divisionId)));
  } else if (scope === 'project' && projectId) {
    const project = await projectReach(db, actor, projectId, date);
    read = Boolean(project);
    manage = Boolean(project?.canModerate);
  }
  manage = manage && !isReadOnly(actor);
  const isActive = Boolean(row.is_active);
  if (!read || (!isActive && !manage)) return null;
  return { documentId, scope, divisionId, projectId, government, isActive, canManage: manage };
}

export type MessageScopeType = 'division' | 'project' | 'direct' | 'task_comment';

/**
 * `REQ-COM-003`. Who may read and post in a conversation, and who may announce
 * and pin there. Division and project channels follow division and project
 * reach; a direct conversation is its two participants and nobody else — not
 * HR, not a Super Administrator; task comments follow the task.
 */
export async function messageScopeReach(db: Executor, actor: ActorPolicyContext, scopeType: MessageScopeType, scopeId: string, date: string): Promise<{ readonly moderate: boolean } | null> {
  if (scopeType === 'direct') {
    const pair = await first(db, 'SELECT user_low,user_high FROM direct_conversations WHERE id=?', [scopeId]);
    return pair && (pair.user_low === actor.userId || pair.user_high === actor.userId) ? { moderate: true } : null;
  }
  if (scopeType === 'division') {
    const reach = await divisionReach(db, actor, scopeId);
    if (!reach) return null;
    return { moderate: !isReadOnly(actor) && (isOrganizationWide(actor) || (actor.roles.includes('team_lead') && actor.divisionIds.has(scopeId))) };
  }
  if (scopeType === 'project') {
    const reach = await projectReach(db, actor, scopeId, date);
    return reach ? { moderate: reach.canModerate } : null;
  }
  const task = await taskReach(db, actor, scopeId);
  if (!task) return null;
  const project = await projectReach(db, actor, task.projectId, date);
  return { moderate: Boolean(project?.canModerate) };
}

/**
 * An evaluation is the subject's own, their reviewer's, and otherwise readable
 * only with `evaluation.private.view` over someone the actor reaches.
 */
export async function evaluationReach(db: Executor, actor: ActorPolicyContext, evaluationId: string): Promise<boolean> {
  const row = await first(db, 'SELECT employee_id,reviewer_employee_id FROM evaluations WHERE id=?', [evaluationId]);
  if (!row) return false;
  if (actor.employeeId && (actor.employeeId === row.employee_id || actor.employeeId === row.reviewer_employee_id)) return true;
  return hasPermission(actor, 'evaluation.private.view') && await employeeReach(db, actor, String(row.employee_id));
}
