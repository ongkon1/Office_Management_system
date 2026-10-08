import type { DepartmentLeadScope, RoleKey } from '@/contracts/domain';

export type SensitiveField = 'government' | 'salary' | 'cost_rate' | 'labour_cost' | 'evaluation' | 'export' | 'document' | 'attachment' | 'audit';
export type EntryPoint = 'server_component' | 'server_action' | 'route_handler' | 'job' | 'search' | 'report' | 'export';

export interface ActorPolicyContext {
  readonly userId: string;
  readonly employeeId: string | null;
  readonly roles: readonly RoleKey[];
  readonly permissions: ReadonlySet<string>;
  readonly divisionIds: ReadonlySet<string>;
  readonly employeeIds: ReadonlySet<string>;
  readonly projectIds: ReadonlySet<string>;
  readonly teamIds: ReadonlySet<string>;
  /**
   * Departments this actor leads, effective on the date the context was loaded
   * (`OH-BE-0207`). Optional so every existing caller keeps compiling; absent
   * and empty mean the same thing — no department leadership.
   */
  readonly departmentLeadScopes?: readonly DepartmentLeadScope[];
  /** Departments whose records this actor may reach, derived from the above. */
  readonly departmentIds?: ReadonlySet<string>;
}

export interface ResourcePolicyContext {
  readonly ownerUserId?: string;
  readonly employeeId?: string;
  readonly divisionId?: string;
  readonly projectId?: string;
  readonly teamId?: string;
  readonly departmentId?: string;
  readonly effective?: boolean;
  readonly workflowState?: string;
  readonly allowedWorkflowStates?: readonly string[];
  readonly sensitivity?: SensitiveField;
}

const sensitivePermission: Record<SensitiveField, string> = {
  government: 'organization.government.view', salary: 'finance.salary.view', cost_rate: 'finance.cost.view',
  labour_cost: 'finance.cost.view', evaluation: 'evaluation.private.view', export: 'reporting.export.protected',
  document: 'document.protected.view', attachment: 'file.protected.view', audit: 'control.audit.view',
};

const roleDefaults: Record<RoleKey, ReadonlySet<string>> = {
  super_admin: new Set(['*']),
  team_lead: new Set(['organization.read','project.manage','task.manage','time.team.read','request.decide','evaluation.manage','report.read']),
  employee: new Set(['organization.self.read','project.assigned.read','task.assigned.read','time.self.manage','request.self.manage','evaluation.self.read']),
  // HR absorbed the Finance Manager's actions (`FE-1004`). Note what is *not*
  // here: `finance.cost.view` and `finance.salary.view` stay per-user grants,
  // so the merge widened who reaches finance screens and nobody's cost access.
  hr_manager: new Set(['organization.manage','attendance.read','request.override','evaluation.manage','time.period.verify','report.hr.read','time.verified.read','report.finance.read','report.export']),
  management: new Set(['dashboard.read','report.read']),
};

/**
 * `OH-BE-0207`, `OH-BE-0208`. An effective department appointment grants the
 * Team Lead capability set and nothing else: no role is written, no division is
 * widened, and `authorize` still requires the record to be inside the actor's
 * department-derived scope. One employee may hold several appointments at once;
 * holding any of them is what enables the capability, and losing the last one
 * removes it with no revocation step, because the scopes are loaded per request
 * from effective-dated rows (`OH-BE-0209`).
 */
function leadsAnyDepartment(actor: ActorPolicyContext): boolean {
  return (actor.departmentLeadScopes?.length ?? 0) > 0;
}

export function hasPermission(actor: ActorPolicyContext, permission: string): boolean {
  if (actor.permissions.has(permission)) return true;
  if (actor.roles.some((role) => roleDefaults[role]?.has('*') || roleDefaults[role]?.has(permission))) return true;
  return leadsAnyDepartment(actor) && (roleDefaults.team_lead.has(permission) ?? false);
}

export function authorize(actor: ActorPolicyContext, action: string, resource: ResourcePolicyContext, entryPoint: EntryPoint): boolean {
  void entryPoint; // The explicit argument prevents callers at any boundary from bypassing this API.
  if (resource.effective === false) return false;
  if (resource.workflowState && resource.allowedWorkflowStates && !resource.allowedWorkflowStates.includes(resource.workflowState)) return false;
  if (resource.sensitivity && !hasPermission(actor, sensitivePermission[resource.sensitivity])) return false;
  if (isMutation(action) && actor.roles.includes('management')) return false;
  if (!hasPermission(actor, action)) return false;
  if (resource.ownerUserId === actor.userId || (resource.employeeId && resource.employeeId === actor.employeeId)) return true;
  /*
   * The employee self-only rule, with the one exception the approved
   * organization model creates: a record belonging to a department this actor
   * has an effective appointment for. Without this an appointment granted the
   * Team Lead capability and then nothing to use it on, because a lead whose
   * stored role is Employee was refused every record about somebody else. The
   * department check below re-asserts the boundary.
   */
  const leadReachesDepartment = Boolean(resource.departmentId) && (actor.departmentIds?.has(resource.departmentId!) ?? false);
  if (actor.roles.includes('employee') && !leadReachesDepartment && (resource.employeeId || resource.ownerUserId)) return false;
  if (resource.employeeId && !actor.employeeIds.has(resource.employeeId)) return false;
  if (resource.divisionId && !actor.divisionIds.has(resource.divisionId)) return false;
  if (resource.projectId && !actor.projectIds.has(resource.projectId)) return false;
  if (resource.teamId && !actor.teamIds.has(resource.teamId)) return false;
  // A department-scoped record is reachable only through an effective
  // appointment, so a lead's capability cannot reach another department.
  if (resource.departmentId && !(actor.departmentIds?.has(resource.departmentId) ?? false)) return false;
  return true;
}

function isMutation(action: string): boolean { return /(?:^|\.)(?:write|manage|create|update|delete|decide|override|verify|export)$/.test(action); }

export function indistinguishableNotFound(resource = 'record') {
  return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: `${resource} was not found.`, resource };
}

export function mapAuthorizedFields<T extends Record<string, unknown>>(row: T, actor: ActorPolicyContext, fields: Partial<Record<keyof T, SensitiveField>>): Partial<T> {
  return Object.fromEntries(Object.entries(row).filter(([key]) => {
    const sensitivity = fields[key as keyof T];
    return !sensitivity || hasPermission(actor, sensitivePermission[sensitivity]);
  })) as Partial<T>;
}
