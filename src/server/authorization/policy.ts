import type { RoleKey } from '@/contracts/domain';

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
}

export interface ResourcePolicyContext {
  readonly ownerUserId?: string;
  readonly employeeId?: string;
  readonly divisionId?: string;
  readonly projectId?: string;
  readonly teamId?: string;
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
  hr_manager: new Set(['organization.manage','attendance.read','request.override','evaluation.manage','time.period.verify','report.hr.read']),
  finance_manager: new Set(['time.verified.read','report.finance.read','report.export']),
  management: new Set(['dashboard.read','report.read']),
};

export function hasPermission(actor: ActorPolicyContext, permission: string): boolean {
  return actor.permissions.has(permission) || actor.roles.some((role) => roleDefaults[role].has('*') || roleDefaults[role].has(permission));
}

export function authorize(actor: ActorPolicyContext, action: string, resource: ResourcePolicyContext, entryPoint: EntryPoint): boolean {
  void entryPoint; // The explicit argument prevents callers at any boundary from bypassing this API.
  if (resource.effective === false) return false;
  if (resource.workflowState && resource.allowedWorkflowStates && !resource.allowedWorkflowStates.includes(resource.workflowState)) return false;
  if (resource.sensitivity && !hasPermission(actor, sensitivePermission[resource.sensitivity])) return false;
  if (isMutation(action) && actor.roles.includes('management')) return false;
  if (!hasPermission(actor, action)) return false;
  if (resource.ownerUserId === actor.userId || (resource.employeeId && resource.employeeId === actor.employeeId)) return true;
  if (actor.roles.includes('employee') && (resource.employeeId || resource.ownerUserId)) return false;
  if (resource.employeeId && !actor.employeeIds.has(resource.employeeId)) return false;
  if (resource.divisionId && !actor.divisionIds.has(resource.divisionId)) return false;
  if (resource.projectId && !actor.projectIds.has(resource.projectId)) return false;
  if (resource.teamId && !actor.teamIds.has(resource.teamId)) return false;
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
