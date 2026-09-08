/**
 * Mock administration service (Phase 7).
 *
 * Administration is where a wrong click is least recoverable, so two things
 * happen here rather than in a component.
 *
 * **Deactivation blockers are computed before the control is offered.** A
 * division with active assignments, live projects or open tasks reports why it
 * cannot be deactivated; the screen disables the switch and shows the reasons
 * (`REQ-ORG-004`). Failing after the click would be a worse experience and a
 * worse audit trail.
 *
 * **Audit values are redacted while the event stays visible.** An entry about a
 * restricted record still shows who did what and when; only the before/after
 * values are withheld. Hiding the event itself would make the log an unreliable
 * account of what happened, which is the one thing an audit log cannot be.
 */

import type {
  Division,
  PermissionKey,
  Redactable,
  RoleKey,
} from '@/contracts/domain';
import { RETIRED_ROLE_LABEL, SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  AdminService,
  AuditEventView,
  AuditLogView,
  DivisionAdminView,
  DivisionFormInput,
  IntegrationPlaceholderView,
  NotificationSettingView,
  PermissionGrantView,
  RoleAdminView,
  UserAdminView,
  WorkPolicySettingsView,
} from '@/contracts/admin';
import { success } from '@/contracts/results';
import { formatDate, formatTimestamp } from '@/lib/format';
import { PROJECTS, STANDARD_POLICY } from '@/fixtures';
import { EMPLOYEES } from '@/fixtures/hr';
import { AUDIT_EVENTS } from '@/fixtures/workspace';
import { DEMO_ACCOUNTS, DIVISIONS, findAccountByUserId } from './accounts';
import { mockStore } from './store';

const LATENCY_MS = 160;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

function notFound(message: string) {
  return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message };
}

function denied(message: string, guidance: string) {
  return { status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message, guidance };
}

function invalid(field: string, message: string, guidance: string) {
  return {
    status: 'validation_failure' as const,
    code: 'VALIDATION_FAILED' as const,
    message,
    focusField: field,
    fieldErrors: [{ field, code: 'REQUIRED' as const, message, guidance }],
  };
}

function viewerOf(userId: string) {
  return findAccountByUserId(userId);
}

function isAdministrator(userId: string): boolean {
  return viewerOf(userId)?.primaryRole === 'super_admin';
}

function hasPermission(userId: string, permission: string): boolean {
  return viewerOf(userId)?.permissions.includes(permission) ?? false;
}

const ADMIN_DENIAL = {
  message: 'Administration is limited to Super Administrators.',
  guidance: 'Return to your dashboard for the views available to your role.',
};

function employeeRef(employeeId: string) {
  const employee = EMPLOYEES.find((item) => item.id === employeeId);
  return {
    id: employeeId,
    fullName: employee?.fullName ?? employeeId,
    employeeCode: employee?.employeeCode ?? employeeId,
    avatarUrl: null,
    designation: employee?.designation ?? null,
  };
}

function divisionRef(divisionId: string) {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division
    ? {
        id: division.id,
        name: division.name,
        code: division.code,
        isRestricted: division.isRestricted,
      }
    : { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

/* -------------------------------------------------------------------------- */
/* Divisions                                                                  */
/* -------------------------------------------------------------------------- */

interface DivisionRecord {
  id: string;
  name: string;
  code: string;
  description: string | null;
  teamLeadEmployeeId: string | null;
  isActive: boolean;
  isRestricted: boolean;
}

function seedDivisions(): DivisionRecord[] {
  return Object.values(DIVISIONS).map((division) => ({
    id: division.id,
    name: division.name,
    code: division.code,
    description: null,
    teamLeadEmployeeId:
      division.id === 'gov' || division.id === 'wcf' ? 'emp-2002' : 'emp-2001',
    isActive: true,
    isRestricted: division.isRestricted,
  }));
}

let divisions: DivisionRecord[] = seedDivisions();

function divisionAdminView(record: DivisionRecord): DivisionAdminView {
  const assignments = mockStore
    .assignments()
    .filter((item) => item.divisionId === record.id && item.isActive);
  const projects = PROJECTS.filter(
    (project) => project.divisionId === record.id && project.isActive,
  );
  const openTasks = mockStore
    .tasks()
    .filter((task) => task.divisionId === record.id && task.status !== 'completed');

  // Computed before the control is offered, never discovered after it fails.
  const blockers: string[] = [];
  if (assignments.length > 0) {
    blockers.push(
      `${assignments.length} active assignment(s) still reference this division. End them before deactivating.`,
    );
  }
  if (projects.length > 0) {
    blockers.push(
      `${projects.length} active project(s) belong to this division. Close them first.`,
    );
  }
  if (openTasks.length > 0) {
    blockers.push(`${openTasks.length} open task(s) belong to this division.`);
  }

  return {
    id: record.id,
    name: record.name,
    code: record.code,
    description: record.description,
    teamLead: record.teamLeadEmployeeId ? employeeRef(record.teamLeadEmployeeId) : null,
    isActive: record.isActive,
    isRestricted: record.isRestricted,
    activeAssignmentCount: assignments.length,
    activeProjectCount: projects.length,
    openTaskCount: openTasks.length,
    deactivationBlockers: record.isActive ? blockers : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Roles and permissions                                                      */
/* -------------------------------------------------------------------------- */

const ROLE_LABEL: Readonly<Record<RoleKey, string>> = {
  employee: 'Employee',
  team_lead: 'Team Lead',
  hr_manager: 'HR Manager',
  management: 'Management',
  super_admin: 'Super Administrator',
};

const ROLE_DESCRIPTION: Readonly<Record<RoleKey, string>> = {
  employee: 'Records their own time and work; sees only their own data.',
  team_lead: 'Reviews assigned employees, requests corrections, manages projects and tasks.',
  hr_manager: 'Company-wide employee, attendance, request and payroll-period administration.',
  management: 'Read-only company, division and project summaries.',
  super_admin: 'Full administration, including roles, policies and the audit log.',
};

const ROLE_SCOPE: Readonly<Record<RoleKey, string>> = {
  employee: 'Own records only',
  team_lead: 'Assigned employees and their divisions',
  hr_manager: 'All divisions',
  management: 'All divisions, read-only',
  super_admin: 'Unrestricted',
};

interface PermissionSpec {
  readonly key: PermissionKey;
  readonly label: string;
  readonly description: string;
  readonly consequence: string;
}

const PERMISSION_SPECS: readonly PermissionSpec[] = [
  {
    key: SENSITIVE_PERMISSIONS.financialDetail,
    label: 'View financial detail',
    description: 'Cost rates, labour cost, payroll totals and budget variance.',
    consequence:
      'The holder can read every employee hourly rate and the labour cost of every project and division.',
  },
  {
    key: SENSITIVE_PERMISSIONS.governmentProjects,
    label: 'View government projects',
    description: 'Records belonging to the Government Projects division.',
    consequence:
      'The holder can read time, tasks, documents and audit values for a division that is otherwise denied by default.',
  },
  {
    key: SENSITIVE_PERMISSIONS.evaluationPrivate,
    label: 'View private evaluation content',
    description: 'Self-evaluation text and unpublished reviewer commentary.',
    consequence:
      'The holder can read what an employee wrote about themselves before it is published.',
  },
  {
    key: SENSITIVE_PERMISSIONS.periodVerification,
    label: 'Verify payroll periods',
    description: 'Lock a period so its time records become read-only.',
    consequence:
      'The holder can lock a payroll period for everyone. Locked records then need an amendment to change.',
  },
  {
    key: SENSITIVE_PERMISSIONS.periodAmendment,
    label: 'Amend verified periods',
    description: 'Change a record inside a locked period, with a recorded reason.',
    consequence:
      'The holder can change figures that payroll may already have used. Every amendment is audited.',
  },
  {
    key: SENSITIVE_PERMISSIONS.hrOverride,
    label: 'Override request decisions',
    description: 'Replace a Team Lead decision on a WFH or leave request.',
    consequence:
      'The holder can reverse another manager’s decision. The override and its reason stay visible on the request.',
  },
  {
    key: SENSITIVE_PERMISSIONS.breakOverride,
    label: 'Override the recognized break',
    description: 'Change the daily break value for an employee-day.',
    consequence:
      'The holder can change a value that feeds the daily total and therefore the classification.',
  },
  {
    key: SENSITIVE_PERMISSIONS.exportProtected,
    label: 'Export protected fields',
    description: 'Include cost, rate and salary columns in an export file.',
    consequence:
      'The holder can take protected data out of the system in a file that leaves its access controls behind.',
  },
  {
    key: SENSITIVE_PERMISSIONS.auditLog,
    label: 'View the audit log',
    description: 'Actor, action, resource and before/after values.',
    consequence:
      'The holder can see the full record of who changed what, across every module.',
  },
];

/** Role → granted sensitive permissions. Mutable so the screen can demonstrate. */
function seedRolePermissions(): Record<RoleKey, PermissionKey[]> {
  return {
    employee: [],
    team_lead: [],
    hr_manager: [
      SENSITIVE_PERMISSIONS.periodVerification,
      SENSITIVE_PERMISSIONS.periodAmendment,
      SENSITIVE_PERMISSIONS.hrOverride,
      SENSITIVE_PERMISSIONS.breakOverride,
    ],
    /*
     * HR deliberately does *not* list the financial permissions here, even
     * though it absorbed the Finance Manager's screens (`FE-1005`).
     *
     * `REQ-RBAC-017` exposes cost, rate and salary data "only through
     * separately granted financial permissions". Adding them to the role
     * default would hand every HR account salary visibility as a side effect
     * of a role merge, which is exactly the failure this phase exists to
     * avoid. They are granted per user.
     */
    management: [],
    super_admin: Object.values(SENSITIVE_PERMISSIONS),
  };
}

let rolePermissions: Record<RoleKey, PermissionKey[]> = seedRolePermissions();

/** The retired role, shown as history and never offered for assignment. */
function retiredRoleView(): RoleAdminView {
  return {
    key: 'finance_manager',
    label: RETIRED_ROLE_LABEL.finance_manager,
    description:
      'Retired when HR absorbed this work. Existing records that name it still read correctly, but it can no longer be assigned.',
    // Zero by construction: no account may hold a retired role.
    userCount: 0,
    scopeSummary: 'Not assignable',
    permissions: [],
    isRetired: true,
  };
}

function roleView(role: RoleKey): RoleAdminView {
  const granted = rolePermissions[role];
  return {
    key: role,
    label: ROLE_LABEL[role],
    description: ROLE_DESCRIPTION[role],
    userCount: DEMO_ACCOUNTS.filter((account) => account.roles.includes(role)).length,
    scopeSummary: ROLE_SCOPE[role],
    isRetired: false,
    permissions: PERMISSION_SPECS.map<PermissionGrantView>((spec) => ({
      key: spec.key,
      label: spec.label,
      description: spec.description,
      consequence: spec.consequence,
      isSensitive: true,
      granted: granted.includes(spec.key),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Notification settings                                                      */
/* -------------------------------------------------------------------------- */

interface NotificationSettingRecord {
  key: string;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  isMandatory: boolean;
}

function seedNotificationSettings(): NotificationSettingRecord[] {
  return [
    {
      key: 'missing_time',
      label: 'Missing timesheet',
      description: 'A required working day with no recorded time and no exemption.',
      inApp: true,
      email: true,
      isMandatory: false,
    },
    {
      key: 'critical_time',
      label: 'Critical time recorded',
      description: 'A day above twelve hours. Team Lead and HR are both notified.',
      inApp: true,
      email: true,
      // Cannot be switched off: the escalation is a policy requirement.
      isMandatory: true,
    },
    {
      key: 'correction_requested',
      label: 'Correction requested',
      description: 'A Team Lead has asked an employee to correct a record.',
      inApp: true,
      email: true,
      isMandatory: false,
    },
    {
      key: 'request_submitted',
      label: 'Request submitted',
      description: 'A WFH or leave request needs a decision.',
      inApp: true,
      email: false,
      isMandatory: false,
    },
    {
      key: 'deadline_approaching',
      label: 'Deadline approaching',
      description: 'A task is due within the reminder window.',
      inApp: true,
      email: false,
      isMandatory: false,
    },
    {
      key: 'period_verified',
      label: 'Payroll period verified',
      description: 'A period has been locked for payroll.',
      inApp: true,
      email: true,
      isMandatory: true,
    },
    {
      key: 'evaluation_published',
      label: 'Evaluation published',
      description: 'An employee can now see their evaluation result.',
      inApp: true,
      email: true,
      isMandatory: false,
    },
    {
      key: 'export_ready',
      label: 'Export ready',
      description: 'A requested export has finished processing.',
      inApp: true,
      email: false,
      isMandatory: false,
    },
  ];
}

let notificationSettings: NotificationSettingRecord[] = seedNotificationSettings();

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

function auditView(
  fixture: (typeof AUDIT_EVENTS)[number],
  userId: string,
): AuditEventView {
  const mayReadValues =
    !fixture.valuePermission || hasPermission(userId, fixture.valuePermission);

  const wrap = (
    values: Readonly<Record<string, string>> | null,
  ): Redactable<Readonly<Record<string, string>>> | null => {
    if (values === null) return null;
    return mayReadValues
      ? { visible: true, value: values }
      : { visible: false, reason: 'permission_required' };
  };

  return {
    id: fixture.id,
    occurredAt: fixture.occurredAt,
    occurredAtLabel: formatTimestamp(fixture.occurredAt),
    actorLabel: fixture.actorName,
    action: fixture.action,
    actionLabel: fixture.actionLabel,
    resourceType: fixture.resourceType,
    resourceLabel: fixture.resourceLabel,
    scopeLabel: fixture.scopeDivisionId ? divisionRef(fixture.scopeDivisionId).name : null,
    reason: fixture.reason,
    correlationId: fixture.correlationId,
    before: wrap(fixture.before),
    after: wrap(fixture.after),
  };
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

const INTEGRATIONS: readonly IntegrationPlaceholderView[] = [
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Google Calendar and Microsoft 365 calendars.',
    plannedBehaviour:
      'Would publish approved leave, WFH days and holidays to each employee’s work calendar.',
    deliveryPhaseLabel: 'Product Phase 3',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0740',
  },
  {
    key: 'email',
    label: 'Email delivery',
    description: 'Transactional email for notifications and reminders.',
    plannedBehaviour:
      'Would deliver the notification types marked for email in notification settings.',
    deliveryPhaseLabel: 'Backend Phase 4',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0012, BE-0741',
  },
  {
    key: 'storage',
    label: 'File storage',
    description: 'Object storage for attachments, documents and export files.',
    plannedBehaviour:
      'Would hold uploaded attachments and generated export files with signed, expiring links.',
    deliveryPhaseLabel: 'Backend Phase 4',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0011, BE-0742',
  },
  {
    key: 'conferencing',
    label: 'Conferencing',
    description: 'Meeting links for reviews and stand-ups.',
    plannedBehaviour: 'Would attach a meeting link to an evaluation or review event.',
    deliveryPhaseLabel: 'Product Phase 3',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0743',
  },
  {
    key: 'biometric',
    label: 'Biometric attendance',
    description: 'On-site attendance devices.',
    plannedBehaviour:
      'Would import device punches as a proposed time entry for the employee to confirm — never as a recorded entry on their behalf.',
    deliveryPhaseLabel: 'Product Phase 3',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0744',
  },
  {
    key: 'payroll',
    label: 'Payroll',
    description: 'Payroll processing systems.',
    plannedBehaviour:
      'Would deliver verified payroll-period hours and cost to the payroll system. Only verified periods would be eligible.',
    deliveryPhaseLabel: 'Product Phase 3',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0745',
  },
  {
    key: 'accounting',
    label: 'Accounting',
    description: 'Ledger and cost-centre systems.',
    plannedBehaviour: 'Would post division and project labour cost to the ledger.',
    deliveryPhaseLabel: 'Product Phase 3',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0746',
  },
  {
    key: 'sso',
    label: 'Single sign-on',
    description: 'SAML or OIDC identity providers.',
    plannedBehaviour:
      'Would replace password sign-in with the organization identity provider, keeping the same role and permission model.',
    deliveryPhaseLabel: 'Backend Phase 1',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0008, BE-0747',
  },
  {
    key: 'api',
    label: 'Public API',
    description: 'Read access for approved internal systems.',
    plannedBehaviour:
      'Would expose the same authorization model as the application, scoped per API client.',
    deliveryPhaseLabel: 'Backend Phase 5',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0748',
  },
  {
    key: 'webhooks',
    label: 'Webhooks',
    description: 'Outbound events for period verification and request decisions.',
    plannedBehaviour:
      'Would send signed events on verification, amendment and request decisions.',
    deliveryPhaseLabel: 'Backend Phase 5',
    state: 'not_configured',
    stateLabel: 'Not configured',
    backendTaskIds: 'BE-0749',
  },
];

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const mockAdminService: AdminService = {
  async listDivisions(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    return success(divisions.map(divisionAdminView));
  },

  async saveDivision(userId, input: DivisionFormInput, id) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    if (!input.name.trim()) {
      return invalid('name', 'Enter a division name.', 'Employees see this name throughout.');
    }
    if (!input.code.trim()) {
      return invalid('code', 'Enter a division code.', 'Use a short uppercase code, such as PIA.');
    }
    const duplicate = divisions.find(
      (division) =>
        division.id !== id && division.code.toLowerCase() === input.code.trim().toLowerCase(),
    );
    if (duplicate) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `Code ${input.code.trim().toUpperCase()} is already used by ${duplicate.name}.`,
        guidance: 'Choose a different code.',
      };
    }

    const existing = id ? divisions.find((division) => division.id === id) : undefined;
    const record: DivisionRecord = {
      id: existing?.id ?? `div-${Date.now()}`,
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description.trim() || null,
      teamLeadEmployeeId: input.teamLeadEmployeeId || null,
      isActive: existing?.isActive ?? true,
      isRestricted: input.isRestricted,
    };
    divisions = existing
      ? divisions.map((division) => (division.id === record.id ? record : division))
      : [...divisions, record];
    return success(divisions.map(divisionAdminView));
  },

  async setDivisionActive(userId, id, isActive) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    const record = divisions.find((division) => division.id === id);
    if (!record) return notFound('Division not found.');

    if (!isActive) {
      const blockers = divisionAdminView(record).deactivationBlockers;
      if (blockers.length > 0) {
        return {
          status: 'conflict' as const,
          code: 'CONFLICT' as const,
          message: `${record.name} still has active references.`,
          guidance: blockers.join(' '),
        };
      }
    }

    divisions = divisions.map((division) =>
      division.id === id ? { ...division, isActive } : division,
    );
    return success(divisions.map(divisionAdminView));
  },

  async listUsers(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);

    return success(
      DEMO_ACCOUNTS.map<UserAdminView>((account) => ({
        userId: account.userId,
        employee: employeeRef(account.employeeId),
        email: account.email,
        roles: account.roles,
        roleLabels: account.roles.map((role) => ROLE_LABEL[role]),
        primaryRole: account.primaryRole,
        status: account.status,
        statusLabel:
          account.status === 'active'
            ? 'Active'
            : account.status === 'locked'
              ? 'Locked'
              : 'Inactive',
        twoFactorEnabled: account.twoFactorEnabled,
        lastLoginLabel: account.lastLoginAt ? formatTimestamp(account.lastLoginAt) : null,
        scopeSummary:
          account.scopedEmployeeIds.length > 0
            ? `${account.scopedEmployeeIds.length} assigned employee(s) across ${account.scopedDivisionIds.length} division(s)`
            : `${account.scopedDivisionIds.length} division(s)`,
        divisions: account.scopedDivisionIds.map(divisionRef),
        sensitivePermissions: account.permissions.map(
          (permission) =>
            PERMISSION_SPECS.find((spec) => spec.key === permission)?.label ?? permission,
        ),
      })),
    );
  },

  async listRoles(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    return success([
      ...(Object.keys(ROLE_LABEL) as RoleKey[]).map(roleView),
      retiredRoleView(),
    ]);
  },

  async setRolePermission(userId, role, permission, granted) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    if (role === 'super_admin' && !granted) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'A Super Administrator cannot have a permission removed here.',
        guidance:
          'Removing an administrator’s own access could leave the system with nobody able to restore it. Change the account’s role instead.',
      };
    }

    const current = rolePermissions[role];
    rolePermissions = {
      ...rolePermissions,
      [role]: granted
        ? [...new Set([...current, permission])]
        : current.filter((item) => item !== permission),
    };
    return success((Object.keys(ROLE_LABEL) as RoleKey[]).map(roleView));
  },

  async getWorkPolicySettings(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);

    return success<WorkPolicySettingsView>({
      policyName: STANDARD_POLICY.name,
      version: STANDARD_POLICY.version,
      effectiveFromLabel: formatDate(STANDARD_POLICY.effectiveFrom),
      requiredActiveMinutes: STANDARD_POLICY.requiredActiveMinutes,
      recognizedBreakMinutes: STANDARD_POLICY.recognizedBreakMinutes,
      requiredTotalMinutes: STANDARD_POLICY.requiredTotalMinutes,
      overtimeThresholdMinutes: STANDARD_POLICY.overtimeThresholdMinutes,
      criticalThresholdMinutes: STANDARD_POLICY.criticalThresholdMinutes,
      workingWeekdays: STANDARD_POLICY.workingWeekdays,
      businessTimezone: STANDARD_POLICY.businessTimezone,
      versioningNote:
        'Changing a policy creates a new version with its own effective date. Existing records keep the version they were calculated under, so verified history stays reproducible.',
      isEditable: false,
      readOnlyReason:
        'Policy editing is a backend capability (BE-0303). This screen shows the values every calculation currently applies.',
    });
  },

  async listNotificationSettings(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    return success(notificationSettings.map<NotificationSettingView>((setting) => ({ ...setting })));
  },

  async setNotificationSetting(userId, key, channel, enabled) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    const setting = notificationSettings.find((item) => item.key === key);
    if (!setting) return notFound('Notification setting not found.');
    if (setting.isMandatory && !enabled) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `${setting.label} cannot be switched off.`,
        guidance:
          'This notification is required by the work policy. Critical-time escalation and period verification must always reach their recipients.',
      };
    }
    notificationSettings = notificationSettings.map((item) =>
      item.key === key ? { ...item, [channel]: enabled } : item,
    );
    return success(notificationSettings.map((item) => ({ ...item })));
  },

  async getAuditLog(userId, filters) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    if (!hasPermission(userId, SENSITIVE_PERMISSIONS.auditLog)) {
      return denied(
        'The audit log needs the audit-view permission.',
        'Ask another administrator to grant control.audit.view.',
      );
    }

    const events = AUDIT_EVENTS.filter((event) => {
      if (filters?.actors?.length && !filters.actors.includes(event.actorUserId)) return false;
      if (filters?.actions?.length && !filters.actions.includes(event.action)) return false;
      if (filters?.resourceTypes?.length && !filters.resourceTypes.includes(event.resourceType)) {
        return false;
      }
      const date = event.occurredAt.slice(0, 10);
      if (filters?.from && date < filters.from) return false;
      if (filters?.to && date > filters.to) return false;
      return true;
    })
      .map((event) => auditView(event, userId))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

    return success<AuditLogView>({
      events,
      totalCount: events.length,
      actorOptions: [
        ...new Map(
          AUDIT_EVENTS.map((event) => [event.actorUserId, event.actorName]),
        ).entries(),
      ].map(([value, label]) => ({ value, label })),
      actionOptions: [
        ...new Map(AUDIT_EVENTS.map((event) => [event.action, event.actionLabel])).entries(),
      ].map(([value, label]) => ({ value, label })),
      resourceOptions: [
        ...new Set(AUDIT_EVENTS.map((event) => event.resourceType)),
      ].map((value) => ({ value, label: value.replace(/_/g, ' ') })),
      restrictedCount: events.filter(
        (event) => event.before?.visible === false || event.after?.visible === false,
      ).length,
    });
  },

  async listIntegrations(userId) {
    await delay();
    if (!isAdministrator(userId)) return denied(ADMIN_DENIAL.message, ADMIN_DENIAL.guidance);
    return success(INTEGRATIONS);
  },
};

/** Test seam: restores the Phase 7 administration state. */
export function resetAdminState(): void {
  divisions = seedDivisions();
  rolePermissions = seedRolePermissions();
  notificationSettings = seedNotificationSettings();
}

export type { Division };
