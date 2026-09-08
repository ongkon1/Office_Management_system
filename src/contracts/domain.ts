/**
 * FE-0014 - Frontend domain types.
 *
 * These mirror the core entities in `project_requirement.md` section 7.1
 * without committing to a MySQL schema. Rules encoded here deliberately:
 *
 * - Durations are integer **minutes** (`REQ-TIME-012`, never floating hours).
 * - Money is a fixed-precision decimal **string** plus a currency code
 *   (`REQ-DATA-005`), never a JavaScript number.
 * - Instants are ISO 8601 with offset; work dates are plain `YYYY-MM-DD`
 *   (`REQ-TIME-028`).
 * - Fields a viewer may not be authorized to see are typed `Redactable<T>` so a
 *   restricted value is representable rather than silently absent
 *   (`REQ-NFR-SEC-004`, `REQ-RPT-007`).
 */

import type { IsoDate, IsoDateTime } from './query';

export type { IsoDate, IsoDateTime };

/** Integer minutes. `420` is 7 hours. */
export type DurationMinutes = number;

/** Fixed-precision decimal as a string, e.g. `"125000.00"`. */
export type DecimalString = string;

/** ISO 4217 code, e.g. `"BDT"`. */
export type CurrencyCode = string;

export interface Money {
  readonly amount: DecimalString;
  readonly currency: CurrencyCode;
}

/**
 * A value the viewer may not be authorized to see.
 *
 * The restricted variant preserves the fact that the field exists, so the UI
 * renders a labelled restricted marker instead of a blank or a misleading zero.
 */
export type Redactable<T> =
  | { readonly visible: true; readonly value: T }
  | { readonly visible: false; readonly reason: 'permission_required' };

/** Every business record carries provenance (`REQ-DATA-008`). */
export interface AuditableRecord {
  readonly createdAt: IsoDateTime;
  readonly createdBy: ActorRef;
  readonly updatedAt: IsoDateTime;
  readonly updatedBy: ActorRef;
}

export interface ActorRef {
  readonly userId: string;
  readonly displayName: string;
}

/* ------------------------------------------------------------------------- */
/* Access                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * The roles a user may hold (`FE-1002`).
 *
 * `finance_manager` was retired when HR absorbed the Finance Manager's work.
 * It is deliberately **not** here: the type is what can be assigned, and a
 * retired role must be unassignable. It remains a legal *stored* value —
 * see `RetiredRoleKey` — because review rows and audit events already carry it
 * and deleting it would make that history unreadable.
 */
export type RoleKey =
  | 'super_admin'
  | 'team_lead'
  | 'employee'
  | 'hr_manager'
  | 'management';

/**
 * A role that existed once and appears in stored records, but can no longer be
 * assigned to anyone.
 *
 * Kept separate from `RoleKey` so the compiler enforces the distinction: a
 * function that assigns a role cannot accept one of these, and a function that
 * renders recorded history must handle them.
 */
export type RetiredRoleKey = 'finance_manager';

/** Every role value that may appear in a stored record, current or retired. */
export type StoredRoleKey = RoleKey | RetiredRoleKey;

export const RETIRED_ROLE_LABEL: Readonly<Record<RetiredRoleKey, string>> = {
  finance_manager: 'Finance Manager (retired)',
};

export function isRetiredRole(role: StoredRoleKey): role is RetiredRoleKey {
  return role === 'finance_manager';
}

export interface Role {
  readonly key: RoleKey;
  readonly label: string;
  readonly description: string;
}

/**
 * Permission keys are `{domain}.{resource}.{action}`.
 *
 * Sensitive permissions are granted separately from the role
 * (`REQ-RBAC-017`, `REQ-NFR-SEC-004`).
 */
export type PermissionKey = string;

export const SENSITIVE_PERMISSIONS = {
  financialDetail: 'finance.cost.view',
  breakOverride: 'time.break.override',
  governmentProjects: 'organization.government.view',
  evaluationPrivate: 'evaluation.private.view',
  auditLog: 'control.audit.view',
  periodVerification: 'time.period.verify',
  periodAmendment: 'time.period.amend',
  hrOverride: 'hr.request.override',
  exportProtected: 'reporting.export.protected',
} as const;

export interface User extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string | null;
  readonly email: string;
  readonly displayName: string;
  readonly roles: readonly RoleKey[];
  readonly permissions: readonly PermissionKey[];
  readonly status: 'active' | 'inactive' | 'locked';
  readonly twoFactorEnabled: boolean;
  readonly lastLoginAt: IsoDateTime | null;
}

/** The authenticated viewer, as every screen and guard consumes it. */
export interface SessionUser {
  readonly userId: string;
  readonly employeeId: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
  readonly roles: readonly RoleKey[];
  readonly primaryRole: RoleKey;
  readonly permissions: readonly PermissionKey[];
  /** Divisions the viewer may act within, effective today. */
  readonly scopedDivisionIds: readonly string[];
  /** Employees the viewer may review, effective today. Empty for Employees. */
  readonly scopedEmployeeIds: readonly string[];
  readonly timezone: string;
  readonly locale: string;
  readonly sessionExpiresAt: IsoDateTime;
}

export interface LoginHistoryEntry {
  readonly id: string;
  readonly userId: string;
  readonly occurredAt: IsoDateTime;
  readonly outcome: 'success' | 'failed' | 'locked_out';
  readonly ipAddress: string;
  readonly userAgent: string;
}

/* ------------------------------------------------------------------------- */
/* Organization                                                              */
/* ------------------------------------------------------------------------- */

export interface Division extends AuditableRecord {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly description: string | null;
  readonly teamLeadEmployeeId: string | null;
  readonly isActive: boolean;
  /** Government-project data is denied by default (`REQ-NFR-SEC-004`). */
  readonly isRestricted: boolean;
}

export type EmploymentType =
  | 'full_time'
  | 'part_time'
  | 'contract'
  | 'intern'
  | 'consultant';

export type WorkMode =
  | 'office'
  | 'wfh'
  | 'hybrid'
  | 'field_work'
  | 'official_travel'
  | 'training'
  | 'client_location';

export interface Employee extends AuditableRecord {
  readonly id: string;
  readonly employeeCode: string;
  readonly fullName: string;
  readonly photoUrl: string | null;
  readonly designation: string;
  readonly department: string | null;
  readonly employmentType: EmploymentType;
  readonly joiningDate: IsoDate;
  readonly status: 'active' | 'inactive';
  readonly email: string;
  readonly phone: string | null;
  readonly officeLocation: string | null;
  readonly primaryDivisionId: string | null;
  readonly teamLeadEmployeeId: string | null;
  readonly skills: readonly string[];
  readonly normalWorkMode: WorkMode;
  readonly standardDailyActiveMinutes: DurationMinutes;
  readonly standardWeeklyActiveMinutes: DurationMinutes;
  readonly workPolicyId: string;
}

export interface EmployeeDivisionAssignment extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string;
  readonly divisionId: string;
  readonly isPrimary: boolean;
  readonly roleInDivision: string | null;
  readonly teamLeadEmployeeId: string | null;
  /** Whole percent, 0-100 (`REQ-ORG-006`). */
  readonly allocationPercent: number;
  readonly expectedWeeklyMinutes: DurationMinutes;
  readonly startDate: IsoDate;
  /** Required for temporary assignments (`REQ-ORG-009`). */
  readonly endDate: IsoDate | null;
  readonly isTemporary: boolean;
  readonly isActive: boolean;
}

export interface WorkPolicy extends AuditableRecord {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
  /** Standard policy: 420 minutes. */
  readonly requiredActiveMinutes: DurationMinutes;
  /** Standard policy: 60 minutes. */
  readonly recognizedBreakMinutes: DurationMinutes;
  /** Standard policy: 480 minutes. */
  readonly requiredTotalMinutes: DurationMinutes;
  /** Above this total, an overtime reason is required (480). */
  readonly overtimeThresholdMinutes: DurationMinutes;
  /** Above this total, a critical explanation is required (720). */
  readonly criticalThresholdMinutes: DurationMinutes;
  /** ISO weekday numbers, 1 = Monday. */
  readonly workingWeekdays: readonly number[];
  readonly businessTimezone: string;
}

export type HolidayScope = 'company' | 'division' | 'weekly';

export interface Holiday extends AuditableRecord {
  readonly id: string;
  readonly name: string;
  readonly scope: HolidayScope;
  readonly divisionId: string | null;
  readonly date: IsoDate | null;
  /** Set when `scope` is `weekly`; ISO weekday, 1 = Monday. */
  readonly weekday: number | null;
  readonly isActive: boolean;
}

/* ------------------------------------------------------------------------- */
/* Work                                                                      */
/* ------------------------------------------------------------------------- */

export type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'closed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface Project extends AuditableRecord {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  /** Exactly one division (`REQ-WORK-001`). */
  readonly divisionId: string;
  readonly managerEmployeeId: string;
  /**
   * The client or stakeholder the project is delivered for (`REQ-WORK-001`).
   *
   * A single free-text name on the project, not a separate entity: the
   * requirement stores one label per project and there is no Client record to
   * point at. Time therefore reaches a client only through its project, which
   * is what `clientContributions` on a day row regroups.
   */
  readonly client: string | null;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly priority: Priority;
  readonly description: string | null;
  readonly estimatedMinutes: DurationMinutes;
  readonly budget: Redactable<Money> | null;
  readonly completionPercent: number;
  readonly status: ProjectStatus;
  readonly isActive: boolean;
  /** Whether new time may be recorded (`REQ-WORK-008`). */
  readonly acceptsTimeEntries: boolean;
  readonly notes: string | null;
}

export interface ProjectMember {
  readonly id: string;
  readonly projectId: string;
  readonly employeeId: string;
  readonly roleInProject: string | null;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly isActive: boolean;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

/**
 * Whether a task needs a Team Lead's endorsement before work counts against it.
 *
 * A task a Team Lead creates is `not_required`: they are the reviewer, so there
 * is nobody above them to ask. A task an employee raises for themselves starts
 * `pending_review`.
 *
 * This is deliberately *not* the shared approval chain in `./approval.ts`. That
 * chain models a request travelling to a Team Lead and then to three parallel
 * reviewers; a task is endorsed by one person and then becomes ordinary work.
 * Forcing it into the chain would add a special case to every transition
 * function for the benefit of one workflow.
 */
export type TaskReviewState = 'not_required' | 'pending_review' | 'approved' | 'rejected';

/** A task may only receive time once its origin has been endorsed. */
export function taskAcceptsTime(reviewState: TaskReviewState): boolean {
  return reviewState === 'not_required' || reviewState === 'approved';
}

export interface Task extends AuditableRecord {
  readonly id: string;
  readonly title: string;
  readonly divisionId: string;
  readonly projectId: string;
  readonly assigneeEmployeeId: string;
  readonly supportingMemberIds: readonly string[];
  readonly creatorEmployeeId: string;
  readonly priority: Priority;
  readonly startDate: IsoDate | null;
  readonly dueDate: IsoDate | null;
  readonly completedDate: IsoDate | null;
  readonly estimatedMinutes: DurationMinutes;
  readonly description: string | null;
  readonly status: TaskStatus;
  /**
   * Set when an employee raises the task for themselves. Until it is approved
   * the task exists but accepts no time — see `taskAcceptsTime`.
   */
  readonly reviewState: TaskReviewState;
  readonly reviewerEmployeeId: string | null;
  readonly reviewedAt: IsoDateTime | null;
  /** The Team Lead's note; required when rejecting. */
  readonly reviewNote: string | null;
}

export interface TaskChecklistItem {
  readonly id: string;
  readonly taskId: string;
  readonly label: string;
  readonly isDone: boolean;
  readonly order: number;
}

export interface Attachment {
  readonly id: string;
  readonly ownerType:
    | 'employee'
    | 'time_entry'
    | 'project'
    | 'task'
    | 'wfh_request'
    | 'leave_request'
    | 'remark'
    | 'evaluation'
    | 'document'
    | 'message';
  readonly ownerId: string;
  readonly fileName: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly uploadedAt: IsoDateTime;
  readonly uploadedBy: ActorRef;
  readonly downloadUrl: Redactable<string>;
}

/* ------------------------------------------------------------------------- */
/* Time                                                                      */
/* ------------------------------------------------------------------------- */

export type WorkLocation =
  | 'office'
  | 'wfh'
  | 'hybrid'
  | 'field_work'
  | 'client_office'
  | 'official_travel'
  | 'training_venue';

export type EntryMethod = 'manual_clock' | 'manual_duration' | 'timer' | 'copied' | 'imported';

export type TimeEntryState = 'draft' | 'saved' | 'locked';

export interface TimeEntry extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string;
  /** Employee's local calendar work date (`REQ-TIME-028`). */
  readonly workDate: IsoDate;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly entryMethod: EntryMethod;
  readonly workLocation: WorkLocation;
  /** Present for clock-based entries (`REQ-TIME-005`). */
  readonly startTime: IsoDateTime | null;
  readonly endTime: IsoDateTime | null;
  /** Always present; derived from the clock range when applicable. */
  readonly activeMinutes: DurationMinutes;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly supportingLink: string | null;
  readonly attachmentIds: readonly string[];
  readonly state: TimeEntryState;
  /** Set when this entry crosses midnight and was split by policy. */
  readonly crossMidnightGroupId: string | null;
  /** Policy version applied when this entry was calculated. */
  readonly policyVersion: number;
}

export interface TimerSession {
  readonly id: string;
  readonly employeeId: string;
  readonly startedAt: IsoDateTime;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly workLocation: WorkLocation;
  readonly isRunning: boolean;
  /** Set once stopped; links to the draft entry created for review. */
  readonly draftTimeEntryId: string | null;
}

export interface DailyBreak {
  readonly employeeId: string;
  readonly workDate: IsoDate;
  readonly recognizedMinutes: DurationMinutes;
  readonly isOverridden: boolean;
  /** Required whenever `isOverridden` is true (`REQ-TIME-013`). */
  readonly overrideReason: string | null;
  readonly overriddenBy: ActorRef | null;
}

export type DayStatus = 'missing' | 'under_time' | 'complete' | 'overtime' | 'critical';

/** Non-working days are classified separately from the five statuses. */
export type DayExemption = 'holiday' | 'full_day_leave' | 'weekly_off' | 'not_employed';

export interface DivisionContribution {
  readonly divisionId: string;
  readonly activeMinutes: DurationMinutes;
}

export interface ProjectContribution {
  readonly projectId: string;
  readonly activeMinutes: DurationMinutes;
}

/**
 * The authoritative per-day calculation (`REQ-DATA-004`).
 *
 * Dashboards, timesheets, reports, exports, and evaluations all read this same
 * shape so their totals cannot diverge (`REQ-DASH-009`, `REQ-NFR-OPS-003`).
 */
export interface DailySummary {
  readonly employeeId: string;
  readonly workDate: IsoDate;
  readonly activeMinutes: DurationMinutes;
  readonly breakMinutes: DurationMinutes;
  readonly totalMinutes: DurationMinutes;
  readonly requiredActiveMinutes: DurationMinutes;
  readonly requiredTotalMinutes: DurationMinutes;
  readonly remainingActiveMinutes: DurationMinutes;
  readonly status: DayStatus;
  readonly exemption: DayExemption | null;
  readonly isRequiredWorkingDay: boolean;
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
  readonly divisionContributions: readonly DivisionContribution[];
  readonly projectContributions: readonly ProjectContribution[];
  readonly entryIds: readonly string[];
  readonly attendance: AttendanceState;
  readonly isLocked: boolean;
  readonly policyVersion: number;
  readonly timezone: string;
}

export type PeriodStatus = 'open' | 'pending_verification' | 'verified' | 'amended';

export interface TimesheetPeriod extends AuditableRecord {
  readonly id: string;
  readonly label: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly status: PeriodStatus;
  readonly verifiedAt: IsoDateTime | null;
  readonly verifiedBy: ActorRef | null;
  readonly policyVersion: number;
  readonly includedEmployeeCount: number;
  readonly openExceptionCount: number;
}

export interface PeriodAmendment {
  readonly id: string;
  readonly periodId: string;
  readonly employeeId: string;
  readonly recordType: 'time_entry' | 'daily_break' | 'daily_summary';
  readonly recordId: string;
  readonly reason: string;
  readonly amendedAt: IsoDateTime;
  readonly amendedBy: ActorRef;
  readonly before: Readonly<Record<string, unknown>>;
  readonly after: Readonly<Record<string, unknown>>;
}

/* ------------------------------------------------------------------------- */
/* Remarks                                                                   */
/* ------------------------------------------------------------------------- */

export type RemarkState = 'open' | 'responded' | 'corrected' | 'resolved';

/** One general remark type only (`REQ-RMK-001`). */
export interface GeneralRemark extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string;
  readonly authorEmployeeId: string;
  readonly message: string;
  readonly relatedRecord:
    | { readonly type: 'timesheet'; readonly workDate: IsoDate }
    | { readonly type: 'task'; readonly taskId: string }
    | { readonly type: 'none' };
  readonly isCorrectionRequest: boolean;
  readonly requestedChanges: string | null;
  readonly state: RemarkState;
  readonly responses: readonly RemarkResponse[];
}

export interface RemarkResponse {
  readonly id: string;
  readonly remarkId: string;
  readonly authorEmployeeId: string;
  readonly message: string;
  readonly createdAt: IsoDateTime;
}

/* ------------------------------------------------------------------------- */
/* HR                                                                        */
/* ------------------------------------------------------------------------- */

export type RequestWorkflowState =
  | 'draft'
  | 'pending'
  | 'information_requested'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type DayPortion = 'full_day' | 'half_day';

export interface WfhRequest extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string;
  readonly requestDate: IsoDate;
  readonly wfhDate: IsoDate;
  readonly portion: DayPortion;
  readonly reason: string;
  readonly plannedTasks: string;
  readonly divisionId: string;
  readonly contactAvailability: string;
  readonly attachmentIds: readonly string[];
  readonly state: RequestWorkflowState;
  readonly decision: RequestDecision | null;
}

export interface RequestDecision {
  readonly decidedAt: IsoDateTime;
  readonly decidedBy: ActorRef;
  readonly outcome: 'approved' | 'rejected' | 'information_requested';
  readonly comment: string | null;
  /** Set when HR overrode a Team Lead decision (`REQ-WFH-004`, `REQ-ATT-006`). */
  readonly override: {
    readonly reason: string;
    readonly previousOutcome: 'approved' | 'rejected';
  } | null;
}

export type LeaveTypeKey = 'annual' | 'sick' | 'casual' | 'unpaid';

export interface LeaveType {
  readonly key: LeaveTypeKey;
  readonly label: string;
  readonly isPaid: boolean;
  readonly allowsHalfDay: boolean;
  readonly annualEntitlementDays: number | null;
}

export interface LeaveBalance {
  readonly employeeId: string;
  readonly leaveType: LeaveTypeKey;
  readonly year: number;
  readonly entitledDays: number;
  readonly consumedDays: number;
  readonly reservedDays: number;
  readonly remainingDays: number;
}

export interface LeaveRequest extends AuditableRecord {
  readonly id: string;
  readonly employeeId: string;
  readonly leaveType: LeaveTypeKey;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly portion: DayPortion;
  readonly totalDays: number;
  readonly reason: string;
  readonly attachmentIds: readonly string[];
  readonly state: RequestWorkflowState;
  readonly decision: RequestDecision | null;
}

export type AttendanceState =
  | 'office'
  | 'wfh'
  | 'official_travel'
  | 'field_duty'
  | 'training_duty'
  | 'approved_leave'
  | 'half_day_leave'
  | 'absent'
  | 'holiday'
  | 'weekly_off'
  | 'missing_timesheet';

export interface AttendanceDay {
  readonly employeeId: string;
  readonly date: IsoDate;
  readonly state: AttendanceState;
  readonly workLocation: WorkLocation | null;
  readonly activeMinutes: DurationMinutes;
  readonly requiredActiveMinutes: DurationMinutes;
  readonly leaveRequestId: string | null;
  readonly wfhRequestId: string | null;
  readonly holidayId: string | null;
}

/* ------------------------------------------------------------------------- */
/* Evaluation                                                                */
/* ------------------------------------------------------------------------- */

export type EvaluationPeriodType =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'annual'
  | 'project_based'
  | 'probation';

export type EvaluationState =
  | 'not_started'
  | 'self_evaluation'
  | 'reviewer_scoring'
  | 'hr_review'
  | 'published';

export interface EvaluationPeriod extends AuditableRecord {
  readonly id: string;
  readonly name: string;
  readonly type: EvaluationPeriodType;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly dueDate: IsoDate;
  readonly weightingVersion: number;
  readonly isOpen: boolean;
}

export type EvaluationAreaKey =
  | 'task_completion'
  | 'work_quality'
  | 'timeliness'
  | 'teamwork_communication'
  | 'responsibility'
  | 'learning_initiative';

/** Default weighting 30/25/15/10/10/10 (`REQ-EVAL-006`), versioned. */
export interface EvaluationWeighting {
  readonly version: number;
  readonly effectiveFrom: IsoDate;
  readonly weights: Readonly<Record<EvaluationAreaKey, number>>;
}

export interface EvaluationScore {
  readonly area: EvaluationAreaKey;
  /** 1-5. */
  readonly score: number;
  readonly comment: string | null;
}

/** Facts derived from authoritative data, never hand-entered (`REQ-EVAL-003`). */
export interface EvaluationFacts {
  readonly requiredActiveMinutes: DurationMinutes;
  readonly actualActiveMinutes: DurationMinutes;
  readonly breakMinutes: DurationMinutes;
  readonly overtimeMinutes: DurationMinutes;
  readonly missingDayCount: number;
  readonly tasksCompleted: number;
  readonly tasksOverdue: number;
  readonly taskCompletionRate: number;
  readonly estimateVariancePercent: number;
  readonly divisionContributions: readonly DivisionContribution[];
  readonly projectContributions: readonly ProjectContribution[];
  readonly wfhDayCount: number;
  readonly leaveDayCount: number;
  readonly remarkCount: number;
}

export interface Evaluation extends AuditableRecord {
  readonly id: string;
  readonly periodId: string;
  readonly employeeId: string;
  readonly reviewerEmployeeId: string;
  readonly state: EvaluationState;
  readonly facts: EvaluationFacts;
  readonly selfEvaluation: SelfEvaluation | null;
  readonly reviewerScores: readonly EvaluationScore[];
  readonly reviewerSummary: string | null;
  readonly weightingVersion: number;
  /** Weighted result, 1-5, present once scoring is complete. */
  readonly weightedScore: number | null;
  readonly publishedAt: IsoDateTime | null;
  readonly publishedBy: ActorRef | null;
}

export interface SelfEvaluation {
  readonly achievements: string;
  readonly completedProjects: string;
  readonly challenges: string;
  readonly skills: string;
  readonly trainingNeeds: string;
  readonly goals: string;
  readonly supportRequired: string;
  readonly submittedAt: IsoDateTime | null;
}

/* ------------------------------------------------------------------------- */
/* Workload                                                                  */
/* ------------------------------------------------------------------------- */

export interface WorkloadWeek {
  readonly employeeId: string;
  readonly weekStartDate: IsoDate;
  /** Default 2100 minutes (35 active hours), leave- and holiday-adjusted. */
  readonly capacityMinutes: DurationMinutes;
  readonly plannedMinutes: DurationMinutes;
  readonly actualActiveMinutes: DurationMinutes;
  readonly remainingMinutes: DurationMinutes;
  readonly utilizationPercent: number;
  readonly warning: 'overallocated' | 'underallocated' | null;
  readonly allocations: readonly WorkloadAllocation[];
}

export interface WorkloadAllocation {
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly plannedMinutes: DurationMinutes;
  readonly actualMinutes: DurationMinutes;
}

/* ------------------------------------------------------------------------- */
/* Finance                                                                   */
/* ------------------------------------------------------------------------- */

export interface CostRate {
  readonly id: string;
  readonly scope: 'employee' | 'project';
  readonly scopeId: string;
  readonly hourlyRate: Redactable<Money>;
  readonly effectiveFrom: IsoDate;
  readonly effectiveTo: IsoDate | null;
}

export interface PayrollPeriod {
  readonly id: string;
  readonly label: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly timesheetPeriodId: string;
  readonly isVerified: boolean;
}

export interface LabourCostLine {
  readonly employeeId: string;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly activeMinutes: DurationMinutes;
  readonly overtimeMinutes: DurationMinutes;
  readonly billableMinutes: DurationMinutes;
  readonly nonBillableMinutes: DurationMinutes;
  readonly cost: Redactable<Money>;
}

/* ------------------------------------------------------------------------- */
/* Reporting and exports                                                     */
/* ------------------------------------------------------------------------- */

export type ExportFormat = 'excel' | 'csv' | 'pdf' | 'print';

export type ExportState =
  | 'queued'
  | 'processing'
  | 'ready'
  | 'expired'
  | 'failed'
  | 'cancelled';

export interface ExportJob {
  readonly id: string;
  readonly reportKey: string;
  readonly format: ExportFormat;
  readonly requestedAt: IsoDateTime;
  readonly requestedBy: ActorRef;
  readonly filterSummary: string;
  readonly state: ExportState;
  readonly readyAt: IsoDateTime | null;
  readonly expiresAt: IsoDateTime | null;
  readonly failureMessage: string | null;
  readonly downloadUrl: Redactable<string> | null;
}

/** Provenance shown on every report and export (`REQ-RPT-009`). */
export interface ReportMetadata {
  readonly reportKey: string;
  readonly title: string;
  readonly periodLabel: string;
  readonly filterSummary: readonly { readonly label: string; readonly value: string }[];
  readonly timezone: string;
  readonly generatedAt: IsoDateTime;
  readonly policyVersion: number;
  readonly includesUnverifiedData: boolean;
}

/* ------------------------------------------------------------------------- */
/* Notifications, documents, audit                                           */
/* ------------------------------------------------------------------------- */

export type NotificationType =
  | 'missing_time'
  | 'under_time'
  | 'overtime'
  | 'critical_time'
  | 'task_assigned'
  | 'deadline_approaching'
  | 'task_overdue'
  | 'remark_added'
  | 'correction_requested'
  | 'wfh_decision'
  | 'leave_decision'
  | 'request_submitted'
  | 'workload_warning'
  | 'evaluation_due'
  | 'evaluation_published'
  | 'period_verified'
  | 'export_ready';

export interface Notification {
  readonly id: string;
  readonly recipientUserId: string;
  readonly type: NotificationType;
  readonly title: string;
  /** Must never contain restricted content (`REQ-NOT-004`). */
  readonly body: string;
  readonly relatedRecord: { readonly type: string; readonly id: string } | null;
  readonly href: string | null;
  readonly isRead: boolean;
  readonly createdAt: IsoDateTime;
}

export interface Document extends AuditableRecord {
  readonly id: string;
  readonly title: string;
  readonly ownerEmployeeId: string;
  readonly scope: 'company' | 'division' | 'project';
  readonly divisionId: string | null;
  readonly projectId: string | null;
  readonly version: string;
  readonly description: string | null;
  readonly isRestricted: boolean;
  readonly attachmentId: string | null;
  readonly isActive: boolean;
}

export interface AuditEvent {
  readonly id: string;
  readonly occurredAt: IsoDateTime;
  readonly actor: ActorRef;
  readonly action: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly scopeDivisionId: string | null;
  readonly reason: string | null;
  readonly correlationId: string;
  readonly before: Redactable<Readonly<Record<string, unknown>>> | null;
  readonly after: Redactable<Readonly<Record<string, unknown>>> | null;
}
