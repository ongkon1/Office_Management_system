/**
 * Phase 5 — HR view models and service contract.
 *
 * HR sees every division, so the interesting authorization boundary here is not
 * scope but *sensitivity*: period verification, HR override, break override and
 * private evaluation content are separately granted permissions
 * (`REQ-RBAC-017`). The service decides; a screen never does.
 *
 * Two shapes are deliberately explicit rather than inferred by the UI:
 * `HrPeriodWorkspaceView.canVerify` (which encodes the whole locking rule) and
 * `HrEvaluationDetailView.selfEvaluation`, which is `null` when the viewer is
 * not authorized *and* when it simply has not been submitted — the view model
 * separates those with `selfEvaluationState` so the screen cannot present an
 * unauthorized read as an empty one.
 */

import type {
  AttendanceState,
  DayPortion,
  EmploymentType,
  EvaluationAreaKey,
  EvaluationPeriodType,
  EvaluationState,
  IsoDate,
  LeaveTypeKey,
  PeriodStatus,
  RequestWorkflowState,
  WorkMode,
} from './domain';
import type { Result } from './results';
import type {
  DivisionRef,
  DurationView,
  EmployeeRef,
  HrDashboardView,
  PeriodTotalsView,
  RemarkSummaryView,
} from './view-models';

/* ------------------------------------------------------------------------- */
/* Dashboard                                                                 */
/* ------------------------------------------------------------------------- */

export interface HrAssignmentChangeView {
  readonly id: string;
  readonly employee: EmployeeRef;
  readonly division: DivisionRef;
  readonly changeLabel: string;
  readonly effectiveLabel: string;
  readonly isTemporary: boolean;
}

export interface HrDashboard extends HrDashboardView {
  readonly divisionCount: number;
  readonly recentAssignments: readonly HrAssignmentChangeView[];
}

/* ------------------------------------------------------------------------- */
/* Employee directory and detail                                             */
/* ------------------------------------------------------------------------- */

export interface HrEmployeeRowView {
  readonly employee: EmployeeRef;
  readonly status: 'active' | 'inactive';
  readonly statusLabel: string;
  readonly primaryDivision: DivisionRef | null;
  readonly divisionCodes: readonly string[];
  readonly teamLeadName: string | null;
  readonly employmentType: EmploymentType;
  readonly employmentTypeLabel: string;
  readonly workMode: WorkMode;
  readonly workModeLabel: string;
  readonly joiningDateLabel: string;
  /** Drives the "incomplete profile" filter and the HR dashboard tile. */
  readonly isProfileIncomplete: boolean;
  readonly missingFields: readonly string[];
  readonly href: string;
}

export interface HrEmployeeFilters {
  readonly status: readonly string[];
  readonly divisionIds: readonly string[];
  readonly teamLeadIds: readonly string[];
  readonly employmentTypes: readonly string[];
  readonly workModes: readonly string[];
  readonly incompleteOnly: boolean;
  readonly search: string;
}

export interface HrAssignmentView {
  readonly id: string;
  readonly employeeId: string;
  readonly division: DivisionRef;
  readonly isPrimary: boolean;
  readonly teamLead: EmployeeRef | null;
  readonly allocationPercent: number;
  readonly expectedWeekly: DurationView;
  readonly startDate: IsoDate;
  readonly startDateLabel: string;
  readonly endDate: IsoDate | null;
  readonly endDateLabel: string | null;
  readonly isTemporary: boolean;
  readonly isActive: boolean;
  /** Effective on the demo date — an expired temporary assignment is not. */
  readonly isEffectiveToday: boolean;
  readonly roleInDivision: string | null;
}

export interface HrEmployeeDetailView {
  readonly employee: EmployeeRef;
  readonly status: 'active' | 'inactive';
  readonly statusLabel: string;
  readonly email: string;
  readonly phone: string | null;
  readonly officeLocation: string | null;
  readonly department: string | null;
  readonly employmentType: EmploymentType;
  readonly employmentTypeLabel: string;
  readonly joiningDateLabel: string;
  readonly workMode: WorkMode;
  readonly workModeLabel: string;
  readonly skills: readonly string[];
  readonly standardDaily: DurationView;
  readonly standardWeekly: DurationView;
  readonly workPolicyLabel: string;
  readonly missingFields: readonly string[];

  readonly assignments: readonly HrAssignmentView[];
  readonly totalAllocationPercent: number;
  /** Present when concurrent active allocation exceeds 100% (`REQ-ORG-010`). */
  readonly allocationWarning: string | null;

  readonly projects: readonly {
    readonly id: string;
    readonly name: string;
    readonly code: string;
    readonly division: DivisionRef;
    readonly actual: DurationView;
  }[];
  readonly monthly: PeriodTotalsView;
  readonly attendance: readonly HrAttendanceDayView[];
  readonly wfh: readonly HrRequestRowView[];
  readonly leave: readonly HrRequestRowView[];
  readonly leaveBalances: readonly HrLeaveBalanceView[];
  readonly evaluations: readonly {
    readonly id: string;
    readonly periodLabel: string;
    readonly state: EvaluationState;
    readonly stateLabel: string;
    readonly weightedScore: number | null;
    readonly href: string;
  }[];
  readonly remarks: readonly RemarkSummaryView[];
  readonly documents: readonly {
    readonly id: string;
    readonly title: string;
    readonly categoryLabel: string;
    readonly uploadedAtLabel: string;
    readonly isRestricted: boolean;
  }[];
  readonly auditHistory: readonly HrAuditEntryView[];
}

export interface HrAuditEntryView {
  readonly id: string;
  readonly occurredAtLabel: string;
  readonly actorLabel: string;
  readonly action: string;
  readonly detail: string;
  readonly reason: string | null;
}

export interface EmployeeFormInput {
  readonly fullName: string;
  readonly employeeCode: string;
  readonly designation: string;
  readonly department: string;
  readonly employmentType: EmploymentType;
  readonly joiningDate: IsoDate;
  readonly email: string;
  readonly phone: string;
  readonly officeLocation: string;
  readonly primaryDivisionId: string;
  readonly teamLeadEmployeeId: string;
  readonly normalWorkMode: WorkMode;
  readonly standardDailyActiveMinutes: number;
  readonly standardWeeklyActiveMinutes: number;
  readonly skills: readonly string[];
  readonly status: 'active' | 'inactive';
}

export interface AssignmentFormInput {
  readonly employeeId: string;
  readonly divisionId: string;
  readonly isPrimary: boolean;
  readonly teamLeadEmployeeId: string;
  readonly allocationPercent: number;
  readonly expectedWeeklyMinutes: number;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate | null;
  readonly isTemporary: boolean;
  readonly isActive: boolean;
  readonly roleInDivision: string;
}

/* ------------------------------------------------------------------------- */
/* Attendance, WFH, leave, holidays                                          */
/* ------------------------------------------------------------------------- */

export interface HrAttendanceDayView {
  readonly employee: EmployeeRef;
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly state: AttendanceState;
  readonly stateLabel: string;
  readonly active: DurationView;
  readonly requiredActive: DurationView;
  /** Explains a state that is *not* a timesheet failure, e.g. approved leave. */
  readonly exemptionNote: string | null;
  readonly isMissing: boolean;
  readonly href: string;
}

export interface HrAttendanceView {
  readonly rangeLabel: string;
  readonly dates: readonly IsoDate[];
  readonly rows: readonly {
    readonly employee: EmployeeRef;
    readonly days: readonly HrAttendanceDayView[];
  }[];
  readonly stateCounts: readonly {
    readonly state: AttendanceState;
    readonly label: string;
    readonly count: number;
  }[];
}

export interface HrRequestRowView {
  readonly id: string;
  readonly kind: 'wfh' | 'leave';
  readonly employee: EmployeeRef;
  readonly division: DivisionRef;
  readonly dateLabel: string;
  readonly portion: DayPortion;
  readonly portionLabel: string;
  readonly leaveType: LeaveTypeKey | null;
  readonly leaveTypeLabel: string | null;
  readonly reason: string;
  readonly plannedWork: string | null;
  /** Populated once the WFH day has recorded work (`REQ-WFH-006`). */
  readonly completedWorkPreview: readonly {
    readonly label: string;
    readonly duration: DurationView;
    readonly completedWork: string;
  }[];
  readonly state: RequestWorkflowState;
  readonly stateLabel: string;
  readonly decisionLabel: string | null;
  readonly overrideReason: string | null;
  readonly previousOutcomeLabel: string | null;
  /** Another approved request already covers this date (`REQ-LV-007`). */
  readonly conflictNote: string | null;
  readonly canOverride: boolean;
}

export interface HrLeaveBalanceView {
  readonly employee: EmployeeRef;
  readonly leaveType: LeaveTypeKey;
  readonly typeLabel: string;
  readonly year: number;
  readonly entitledDays: number;
  readonly consumedDays: number;
  readonly reservedDays: number;
  readonly remainingDays: number;
}

export interface HrDivisionRequestSummaryView {
  readonly division: DivisionRef;
  readonly pending: number;
  readonly approved: number;
  readonly rejected: number;
  readonly totalDays: number;
}

export interface HolidayView {
  readonly id: string;
  readonly name: string;
  readonly scope: 'company' | 'division' | 'weekly';
  readonly scopeLabel: string;
  readonly division: DivisionRef | null;
  readonly dateLabel: string | null;
  readonly weekdayLabel: string | null;
  readonly isActive: boolean;
  readonly affectedEmployeeCount: number;
}

export interface HolidayFormInput {
  readonly name: string;
  readonly scope: 'company' | 'division' | 'weekly';
  readonly divisionId: string | null;
  readonly date: IsoDate | null;
  readonly weekday: number | null;
}

/* ------------------------------------------------------------------------- */
/* Period verification                                                       */
/* ------------------------------------------------------------------------- */

export interface HrPeriodEmployeeRowView {
  readonly employee: EmployeeRef;
  readonly recordedDays: number;
  readonly requiredDays: number;
  readonly completenessPercent: number;
  readonly active: DurationView;
  readonly missingDays: number;
  readonly underTimeDays: number;
  readonly overtimeDays: number;
  readonly criticalDays: number;
  readonly unresolvedCorrections: number;
  readonly isReady: boolean;
  readonly href: string;
}

export interface HrPeriodAmendmentView {
  readonly id: string;
  readonly employeeName: string;
  readonly recordLabel: string;
  readonly reason: string;
  readonly amendedAtLabel: string;
  readonly amendedByLabel: string;
  readonly changes: readonly {
    readonly label: string;
    readonly before: string;
    readonly after: string;
  }[];
}

export interface HrPeriodWorkspaceView {
  readonly periodId: string;
  readonly label: string;
  readonly rangeLabel: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly includedDateCount: number;
  readonly status: PeriodStatus;
  readonly statusLabel: string;
  readonly policyVersion: number;
  readonly employeeCount: number;
  readonly completeEmployeeCount: number;
  readonly openExceptionCount: number;
  readonly unresolvedCorrectionCount: number;
  readonly verifiedAtLabel: string | null;
  readonly verifiedByLabel: string | null;
  readonly canVerify: boolean;
  readonly canAmend: boolean;
  readonly blockedReason: string | null;
  readonly unlockRequest: {
    readonly requestedByLabel: string;
    readonly requestedAtLabel: string;
    readonly reason: string;
    readonly state: 'pending' | 'granted' | 'declined';
    readonly stateLabel: string;
  } | null;
  readonly rows: readonly HrPeriodEmployeeRowView[];
  readonly amendments: readonly HrPeriodAmendmentView[];
}

/* ------------------------------------------------------------------------- */
/* Evaluations                                                               */
/* ------------------------------------------------------------------------- */

export interface HrEvaluationPeriodView {
  readonly id: string;
  readonly name: string;
  readonly type: EvaluationPeriodType;
  readonly typeLabel: string;
  readonly rangeLabel: string;
  readonly dueDateLabel: string;
  readonly weightingVersion: number;
  readonly isOpen: boolean;
  readonly total: number;
  readonly notStarted: number;
  readonly selfEvaluation: number;
  readonly reviewerScoring: number;
  readonly hrReview: number;
  readonly published: number;
  readonly progressPercent: number;
  readonly overdueReviewerCount: number;
  readonly href: string;
}

export interface EvaluationPeriodFormInput {
  readonly name: string;
  readonly type: EvaluationPeriodType;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly dueDate: IsoDate;
  readonly employeeIds: readonly string[];
  /** Employee id of the reviewer for each assigned employee. */
  readonly reviewerByEmployeeId: Readonly<Record<string, string>>;
}

export interface HrEvaluationRowView {
  readonly id: string;
  readonly employee: EmployeeRef;
  readonly reviewer: EmployeeRef | null;
  readonly periodId: string;
  readonly periodLabel: string;
  readonly dueDateLabel: string;
  readonly state: EvaluationState;
  readonly stateLabel: string;
  readonly weightedScore: number | null;
  readonly isOverdue: boolean;
  readonly reminderSentAtLabel: string | null;
  readonly href: string;
}

export type SelfEvaluationState = 'not_submitted' | 'submitted' | 'restricted';

export interface HrEvaluationDetailView extends HrEvaluationRowView {
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly selfEvaluationState: SelfEvaluationState;
  readonly selfEvaluation: readonly {
    readonly label: string;
    readonly value: string;
  }[] | null;
  readonly weights: Readonly<Record<EvaluationAreaKey, number>>;
  readonly weightingVersion: number;
  readonly scores: Readonly<Record<EvaluationAreaKey, number>>;
  readonly comments: Readonly<Record<EvaluationAreaKey, string>>;
  readonly reviewerSummary: string;
  readonly publishedAtLabel: string | null;
  readonly publishedByLabel: string | null;
  readonly publicationHistory: readonly {
    readonly label: string;
    readonly actorLabel: string;
    readonly atLabel: string;
  }[];
  readonly canPublish: boolean;
  readonly canReturn: boolean;
  readonly isReadOnly: boolean;
  /** Set when the viewer may not read private evaluation content. */
  readonly restrictedNote: string | null;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export interface HrService {
  getDashboard(userId: string): Promise<Result<HrDashboard>>;

  listEmployees(
    userId: string,
    filters?: Partial<HrEmployeeFilters>,
  ): Promise<Result<readonly HrEmployeeRowView[]>>;
  getEmployee(userId: string, employeeId: string): Promise<Result<HrEmployeeDetailView>>;
  saveEmployee(
    userId: string,
    input: EmployeeFormInput,
    employeeId?: string,
  ): Promise<Result<HrEmployeeRowView>>;
  saveAssignment(
    userId: string,
    input: AssignmentFormInput,
    assignmentId?: string,
  ): Promise<Result<readonly HrAssignmentView[]>>;
  endAssignment(userId: string, assignmentId: string, endDate: IsoDate): Promise<Result<readonly HrAssignmentView[]>>;

  getAttendance(userId: string, from: IsoDate, to: IsoDate): Promise<Result<HrAttendanceView>>;

  listRequests(userId: string, kind: 'wfh' | 'leave'): Promise<Result<readonly HrRequestRowView[]>>;
  listDivisionRequestSummary(
    userId: string,
    kind: 'wfh' | 'leave',
  ): Promise<Result<readonly HrDivisionRequestSummaryView[]>>;
  listLeaveBalances(userId: string): Promise<Result<readonly HrLeaveBalanceView[]>>;
  decideRequest(input: {
    userId: string;
    kind: 'wfh' | 'leave';
    id: string;
    outcome: 'approved' | 'rejected' | 'information_requested';
    comment: string;
    /** Required when replacing an existing decision (`REQ-WFH-004`). */
    overrideReason: string | null;
  }): Promise<Result<HrRequestRowView>>;

  listHolidays(userId: string): Promise<Result<readonly HolidayView[]>>;
  saveHoliday(userId: string, input: HolidayFormInput, id?: string): Promise<Result<readonly HolidayView[]>>;
  setHolidayActive(userId: string, id: string, isActive: boolean): Promise<Result<readonly HolidayView[]>>;

  listPeriods(userId: string): Promise<Result<readonly HrPeriodWorkspaceView[]>>;
  getPeriod(userId: string, periodId: string): Promise<Result<HrPeriodWorkspaceView>>;
  verifyPeriod(input: {
    userId: string;
    periodId: string;
    acknowledgedExceptions: boolean;
  }): Promise<Result<HrPeriodWorkspaceView>>;
  requestUnlock(input: {
    userId: string;
    periodId: string;
    reason: string;
  }): Promise<Result<HrPeriodWorkspaceView>>;
  amendPeriod(input: {
    userId: string;
    periodId: string;
    employeeId: string;
    recordLabel: string;
    reason: string;
    before: string;
    after: string;
  }): Promise<Result<HrPeriodWorkspaceView>>;

  listEvaluationPeriods(userId: string): Promise<Result<readonly HrEvaluationPeriodView[]>>;
  createEvaluationPeriod(
    userId: string,
    input: EvaluationPeriodFormInput,
  ): Promise<Result<HrEvaluationPeriodView>>;
  listEvaluations(userId: string, periodId?: string): Promise<Result<readonly HrEvaluationRowView[]>>;
  getEvaluation(userId: string, id: string): Promise<Result<HrEvaluationDetailView>>;
  sendReminder(userId: string, evaluationId: string): Promise<Result<HrEvaluationRowView>>;
  publishEvaluation(userId: string, evaluationId: string): Promise<Result<HrEvaluationDetailView>>;
  returnEvaluation(
    userId: string,
    evaluationId: string,
    reason: string,
  ): Promise<Result<HrEvaluationDetailView>>;
}
