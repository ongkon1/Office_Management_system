/**
 * Phase 7 — Super Administrator contracts.
 *
 * Administration is where a wrong click is least recoverable, so three shapes
 * here exist specifically to slow one down.
 *
 * `DivisionAdminView.deactivationBlockers` lists what would break *before* the
 * action is offered, rather than failing afterwards (`REQ-ORG-004`).
 *
 * `PermissionGrantView.isSensitive` marks grants that widen what protected data
 * a person can read; the UI must state the consequence, not just the name
 * (`REQ-RBAC-017`).
 *
 * `AuditEventView.before` / `after` are `Redactable`, because an audit entry
 * about a restricted record must be visible as an *event* without disclosing
 * the values it changed (`REQ-NFR-SEC-004`).
 */

import type {
  IsoDate,
  IsoDateTime,
  PermissionKey,
  Redactable,
  RoleKey,
  StoredRoleKey,
} from './domain';
import type { Result } from './results';
import type { DivisionRef, EmployeeRef } from './view-models';

/* ------------------------------------------------------------------------- */
/* Divisions (`FE-0730`)                                                     */
/* ------------------------------------------------------------------------- */

export interface DivisionAdminView {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly teamLead: EmployeeRef | null;
  readonly isActive: boolean;
  readonly isRestricted: boolean;
  readonly activeAssignmentCount: number;
  readonly activeProjectCount: number;
  readonly openTaskCount: number;
  /**
   * Reasons this division cannot be deactivated right now. Empty means it can.
   * Shown before the control is offered, never after it fails.
   */
  readonly deactivationBlockers: readonly string[];
}

export interface DivisionFormInput {
  readonly name: string;
  readonly code: string;
  readonly description: string;
  readonly teamLeadEmployeeId: string;
  readonly isRestricted: boolean;
}

/* ------------------------------------------------------------------------- */
/* Users, roles and permissions (`FE-0731`)                                  */
/* ------------------------------------------------------------------------- */

export interface UserAdminView {
  readonly userId: string;
  readonly employee: EmployeeRef;
  readonly email: string;
  readonly roles: readonly RoleKey[];
  readonly roleLabels: readonly string[];
  readonly primaryRole: RoleKey;
  readonly status: 'active' | 'inactive' | 'locked';
  readonly statusLabel: string;
  readonly twoFactorEnabled: boolean;
  readonly lastLoginLabel: string | null;
  readonly scopeSummary: string;
  readonly divisions: readonly DivisionRef[];
  readonly sensitivePermissions: readonly string[];
}

export interface PermissionGrantView {
  readonly key: PermissionKey;
  readonly label: string;
  readonly description: string;
  /** What this grant lets the holder read or do that they otherwise could not. */
  readonly consequence: string;
  readonly isSensitive: boolean;
  readonly granted: boolean;
}

export interface RoleAdminView {
  readonly key: StoredRoleKey;
  readonly label: string;
  readonly description: string;
  readonly userCount: number;
  readonly scopeSummary: string;
  readonly permissions: readonly PermissionGrantView[];
  /**
   * True for a role that existed once and can no longer be assigned
   * (`FE-1010`). Listed rather than hidden: an administrator looking for the
   * Finance Manager needs to be told it was retired, not left to wonder
   * whether the screen is broken.
   */
  readonly isRetired: boolean;
}

/* ------------------------------------------------------------------------- */
/* Settings (`FE-0732`)                                                      */
/* ------------------------------------------------------------------------- */

export interface WorkPolicySettingsView {
  readonly policyName: string;
  readonly version: number;
  readonly effectiveFromLabel: string;
  readonly requiredActiveMinutes: number;
  readonly recognizedBreakMinutes: number;
  readonly requiredTotalMinutes: number;
  readonly overtimeThresholdMinutes: number;
  readonly criticalThresholdMinutes: number;
  readonly workingWeekdays: readonly number[];
  readonly businessTimezone: string;
  /**
   * Changing a policy creates a new version rather than editing the old one, so
   * verified history stays reproducible (`REQ-TIME-028`).
   */
  readonly versioningNote: string;
  readonly isEditable: boolean;
  readonly readOnlyReason: string | null;
}

export interface NotificationSettingView {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly inApp: boolean;
  readonly email: boolean;
  /** Some notifications are mandatory, e.g. critical-time escalation. */
  readonly isMandatory: boolean;
}

/* ------------------------------------------------------------------------- */
/* Audit log (`FE-0733`)                                                     */
/* ------------------------------------------------------------------------- */

export interface AuditEventView {
  readonly id: string;
  readonly occurredAt: IsoDateTime;
  readonly occurredAtLabel: string;
  readonly actorLabel: string;
  readonly action: string;
  readonly actionLabel: string;
  readonly resourceType: string;
  readonly resourceLabel: string;
  readonly scopeLabel: string | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly before: Redactable<Readonly<Record<string, string>>> | null;
  readonly after: Redactable<Readonly<Record<string, string>>> | null;
}

export interface AuditLogView {
  readonly events: readonly AuditEventView[];
  readonly totalCount: number;
  readonly actorOptions: readonly { readonly value: string; readonly label: string }[];
  readonly actionOptions: readonly { readonly value: string; readonly label: string }[];
  readonly resourceOptions: readonly { readonly value: string; readonly label: string }[];
  readonly restrictedCount: number;
}

export interface AuditFilters {
  readonly actors: readonly string[];
  readonly actions: readonly string[];
  readonly resourceTypes: readonly string[];
  readonly from: IsoDate | null;
  readonly to: IsoDate | null;
}

/* ------------------------------------------------------------------------- */
/* Integrations (`FE-0734`)                                                  */
/* ------------------------------------------------------------------------- */

export type IntegrationCategory =
  | 'calendar'
  | 'email'
  | 'storage'
  | 'conferencing'
  | 'biometric'
  | 'payroll'
  | 'accounting'
  | 'sso'
  | 'api'
  | 'webhooks';

export interface IntegrationPlaceholderView {
  readonly key: IntegrationCategory;
  readonly label: string;
  readonly description: string;
  /** What the integration would do once built. Never phrased as active. */
  readonly plannedBehaviour: string;
  readonly deliveryPhaseLabel: string;
  /**
   * Always `not_configured` in this milestone. The type has no `connected`
   * variant on purpose: a placeholder must not be able to claim a live
   * connection, even by mistake.
   */
  readonly state: 'not_configured';
  readonly stateLabel: string;
  readonly backendTaskIds: string;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export interface AdminService {
  listDivisions(userId: string): Promise<Result<readonly DivisionAdminView[]>>;
  saveDivision(
    userId: string,
    input: DivisionFormInput,
    id?: string,
  ): Promise<Result<readonly DivisionAdminView[]>>;
  setDivisionActive(
    userId: string,
    id: string,
    isActive: boolean,
  ): Promise<Result<readonly DivisionAdminView[]>>;

  listUsers(userId: string): Promise<Result<readonly UserAdminView[]>>;
  listRoles(userId: string): Promise<Result<readonly RoleAdminView[]>>;
  setRolePermission(
    userId: string,
    role: RoleKey,
    permission: PermissionKey,
    granted: boolean,
  ): Promise<Result<readonly RoleAdminView[]>>;

  getWorkPolicySettings(userId: string): Promise<Result<WorkPolicySettingsView>>;
  listNotificationSettings(userId: string): Promise<Result<readonly NotificationSettingView[]>>;
  setNotificationSetting(
    userId: string,
    key: string,
    channel: 'inApp' | 'email',
    enabled: boolean,
  ): Promise<Result<readonly NotificationSettingView[]>>;

  getAuditLog(userId: string, filters?: Partial<AuditFilters>): Promise<Result<AuditLogView>>;

  listIntegrations(userId: string): Promise<Result<readonly IntegrationPlaceholderView[]>>;
}
