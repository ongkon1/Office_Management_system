/**
 * FE-0015 - View models.
 *
 * A view model is what a screen renders. It is already permission-filtered,
 * already formatted where formatting is a decision rather than a presentation
 * detail, and carries no logic of its own. Components read these; they never
 * recompute a total, re-derive a status, or re-check a permission
 * (`REQ-DASH-009`, `REQ-NFR-OPS-003`).
 */

import type {
  AttendanceState,
  DayStatus,
  DurationMinutes,
  ExportFormat,
  ExportState,
  IsoDate,
  IsoDateTime,
  Money,
  NotificationType,
  Priority,
  Redactable,
  RemarkState,
  RequestWorkflowState,
  RoleKey,
  TaskStatus,
  WorkLocation,
} from './domain';

/* ------------------------------------------------------------------------- */
/* Shared presentation primitives                                            */
/* ------------------------------------------------------------------------- */

/** A duration carried with its display string so screens never format twice. */
export interface DurationView {
  readonly minutes: DurationMinutes;
  /** `H:MM`, e.g. `7:00`. */
  readonly display: string;
  /** e.g. `7 hours 0 minutes`. */
  readonly accessibleLabel: string;
}

export interface DayStatusView {
  readonly status: DayStatus;
  readonly label: string;
  readonly accessibleLabel: string;
  readonly tone: 'missing' | 'undertime' | 'complete' | 'overtime' | 'critical';
}

export interface EmployeeRef {
  readonly id: string;
  readonly fullName: string;
  readonly employeeCode: string;
  readonly avatarUrl: string | null;
  readonly designation: string | null;
}

export interface DivisionRef {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly isRestricted: boolean;
}

export interface ProjectRef {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly divisionId: string;
}

export interface TaskRef {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly status: TaskStatus;
}

/** A dashboard tile. `href` is absent when the viewer may not drill in. */
export interface MetricTileView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly secondaryValue?: string;
  readonly trend?: { readonly direction: 'up' | 'down' | 'flat'; readonly label: string };
  readonly tone?: 'neutral' | 'positive' | 'caution' | 'negative';
  readonly href?: string;
  /** Set when the metric is withheld by permission (`REQ-NFR-SEC-004`). */
  readonly restricted?: boolean;
}

/* ------------------------------------------------------------------------- */
/* Employee dashboard (`REQ-DASH-001`, `REQ-DASH-002`, `REQ-DASH-003`)       */
/* ------------------------------------------------------------------------- */

export interface EmployeeDashboardView {
  readonly today: TodaySummaryView;
  readonly runningTimer: RunningTimerView | null;
  readonly todaysDivisions: readonly DivisionContributionView[];
  readonly activeTasks: readonly TaskSummaryView[];
  readonly upcomingDeadlines: readonly DeadlineView[];
  readonly weekly: PeriodTotalsView;
  readonly monthly: PeriodTotalsView;
  readonly missingDates: readonly IsoDate[];
  readonly recentRemarks: readonly RemarkSummaryView[];
  readonly wfhStatus: RequestSummaryView | null;
  readonly leaveBalances: readonly LeaveBalanceView[];
  readonly divisionContribution: readonly DivisionContributionView[];
  readonly recentlyCompletedTasks: readonly TaskSummaryView[];
  readonly quickActions: readonly QuickActionView[];
}

export interface TodaySummaryView {
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly active: DurationView;
  readonly break: DurationView;
  readonly total: DurationView;
  readonly requiredActive: DurationView;
  readonly remainingActive: DurationView;
  /** 0-100, clamped; progress toward the scheduled total. */
  readonly scheduleProgressPercent: number;
  readonly status: DayStatusView;
  readonly attendance: AttendanceState;
  readonly isLocked: boolean;
  /**
   * The reason recorded for a day above eight hours, and the explanation
   * required above twelve (`REQ-TIME-018`, `REQ-TIME-019`).
   *
   * Carried on the summary because whoever reads the classification needs the
   * stated cause with it — a reviewer shown "Critical" and nothing else has no
   * basis on which to review.
   */
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
}

export interface RunningTimerView {
  readonly sessionId: string;
  readonly startedAt: IsoDateTime;
  readonly elapsed: DurationView;
  readonly division: DivisionRef;
  readonly project: ProjectRef | null;
  readonly task: TaskRef | null;
  readonly workLocation: WorkLocation;
  /** True when the timer was restored after a refresh (`FE-0330`). */
  readonly wasRecovered: boolean;
}

export interface PeriodTotalsView {
  readonly label: string;
  readonly active: DurationView;
  readonly break: DurationView;
  readonly total: DurationView;
  readonly overtime: DurationView;
  readonly requiredActive: DurationView;
  readonly completeDayCount: number;
  readonly underTimeDayCount: number;
  readonly overtimeDayCount: number;
  readonly criticalDayCount: number;
  readonly missingDayCount: number;
}

export interface DivisionContributionView {
  readonly division: DivisionRef;
  readonly active: DurationView;
  readonly sharePercent: number;
}

/**
 * Active time regrouped by the client its project is delivered for
 * (`REQ-WORK-001`).
 *
 * A client is a label on a project, not an entity, so `clientId` is the client
 * name itself and `null` means the project records no client. Absent and
 * "no time" stay distinct: a client with no work simply does not appear, and a
 * project without a client is reported under the `null` bucket rather than
 * dropped, because dropping it would make the parts stop summing to the day.
 */
export interface ClientContributionView {
  readonly clientId: string | null;
  readonly clientLabel: string;
  readonly active: DurationView;
  readonly sharePercent: number;
}

export interface QuickActionView {
  readonly key:
    | 'add_time'
    | 'start_timer'
    | 'add_completed_work'
    | 'request_wfh'
    | 'apply_leave';
  readonly label: string;
  readonly href: string;
  readonly enabled: boolean;
  /** Present when disabled, e.g. a locked period or a disabled module. */
  readonly disabledReason?: string;
}

/* ------------------------------------------------------------------------- */
/* Timesheet views                                                           */
/* ------------------------------------------------------------------------- */

export interface TimesheetDayView {
  /** Present when the day is viewed in another employee's assigned scope. */
  readonly employee?: EmployeeRef;
  /** Team Lead-only comparison after an employee clarification/correction. */
  readonly teamReview?: {
    readonly clarification: string;
    readonly correctedValues: readonly {
      readonly label: string;
      readonly before: string;
      readonly after: string;
    }[];
  };
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly summary: TodaySummaryView;
  readonly entries: readonly TimeEntryView[];
  readonly breakEntry: BreakView;
  readonly divisionContributions: readonly DivisionContributionView[];
  readonly remarks: readonly RemarkSummaryView[];
  readonly exemption: { readonly kind: string; readonly label: string } | null;
  readonly canAddEntry: boolean;
  readonly lockedReason: string | null;
  readonly policyVersion: number;
  readonly timezone: string;
}

export interface TimeEntryView {
  readonly id: string;
  readonly division: DivisionRef;
  readonly project: ProjectRef | null;
  readonly task: TaskRef | null;
  readonly timeRangeLabel: string | null;
  readonly duration: DurationView;
  readonly workLocation: WorkLocation;
  readonly workLocationLabel: string;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly attachmentCount: number;
  readonly supportingLink: string | null;
  readonly isDraft: boolean;
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}

export interface BreakView {
  readonly duration: DurationView;
  readonly isOverridden: boolean;
  readonly overrideReason: string | null;
  readonly canOverride: boolean;
}

export interface TimesheetWeekView {
  readonly weekStartDate: IsoDate;
  readonly label: string;
  readonly days: readonly TimesheetDayRowView[];
  readonly totals: PeriodTotalsView;
}

export interface TimesheetMonthView {
  readonly month: string;
  readonly label: string;
  readonly days: readonly TimesheetDayRowView[];
  readonly totals: PeriodTotalsView;
  readonly isVerified: boolean;
}

export interface TimesheetDayRowView {
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly weekdayLabel: string;
  readonly active: DurationView;
  readonly break: DurationView;
  readonly total: DurationView;
  readonly status: DayStatusView;
  readonly attendance: AttendanceState;
  readonly attendanceLabel: string;
  readonly divisionCodes: readonly string[];
  /** Active minutes on this day split by client; sums to `active`. */
  readonly clientContributions: readonly ClientContributionView[];
  readonly isLocked: boolean;
  readonly href: string;
}

/**
 * The live calculation preview shown while an entry is being edited
 * (`FE-0323`). It is produced by the same calculation contract as the saved
 * summary, so the preview and the result can never disagree.
 */
export interface EntryCalculationPreview {
  readonly entryDuration: DurationView;
  readonly dayActive: DurationView;
  readonly dayBreak: DurationView;
  readonly dayTotal: DurationView;
  readonly remainingActive: DurationView;
  readonly resultingStatus: DayStatusView;
  readonly requiresOvertimeReason: boolean;
  readonly requiresCriticalExplanation: boolean;
}

/* ------------------------------------------------------------------------- */
/* Tasks, remarks, requests                                                  */
/* ------------------------------------------------------------------------- */

export interface TaskSummaryView {
  readonly id: string;
  readonly title: string;
  readonly project: ProjectRef;
  readonly division: DivisionRef;
  readonly assignee: EmployeeRef;
  readonly status: TaskStatus;
  readonly statusLabel: string;
  readonly priority: Priority;
  readonly dueDate: IsoDate | null;
  readonly dueDateLabel: string | null;
  readonly isOverdue: boolean;
  readonly estimated: DurationView;
  readonly actual: DurationView;
  readonly variancePercent: number | null;
  readonly href: string;
}

export interface DeadlineView {
  readonly taskId: string;
  readonly title: string;
  readonly dueDate: IsoDate;
  readonly dueDateLabel: string;
  readonly daysRemaining: number;
  readonly isOverdue: boolean;
  readonly href: string;
}

export interface RemarkSummaryView {
  readonly id: string;
  readonly author: EmployeeRef;
  readonly employee: EmployeeRef;
  readonly message: string;
  readonly createdAtLabel: string;
  readonly state: RemarkState;
  readonly stateLabel: string;
  readonly isCorrectionRequest: boolean;
  readonly relatedLabel: string | null;
  readonly relatedHref: string | null;
  readonly responseCount: number;
  readonly href: string;
}

export interface RequestSummaryView {
  readonly id: string;
  readonly kind: 'wfh' | 'leave';
  readonly employee: EmployeeRef;
  readonly dateLabel: string;
  readonly portionLabel: string;
  readonly reason: string;
  readonly state: RequestWorkflowState;
  readonly stateLabel: string;
  readonly decidedByLabel: string | null;
  readonly wasOverridden: boolean;
  readonly href: string;
}

export interface LeaveBalanceView {
  readonly typeLabel: string;
  readonly entitledDays: number;
  readonly consumedDays: number;
  readonly remainingDays: number;
}

/* ------------------------------------------------------------------------- */
/* Team Lead dashboard (`REQ-DASH-004`, `REQ-DASH-005`)                      */
/* ------------------------------------------------------------------------- */

export interface TeamLeadDashboardView {
  readonly assignedHeadcount: number;
  readonly workingToday: number;
  readonly attendanceBreakdown: readonly AttendanceCountView[];
  readonly exceptions: TeamExceptionSummaryView;
  readonly divisionHours: readonly DivisionContributionView[];
  readonly projectProgress: readonly ProjectProgressView[];
  readonly pendingTasks: number;
  readonly overdueTasks: number;
  readonly pendingRequests: readonly RequestSummaryView[];
  readonly workloadWarnings: readonly WorkloadWarningView[];
  readonly recentEntries: readonly TeamTimesheetRowView[];
  readonly evaluationStatus: EvaluationProgressView | null;
}

export interface AttendanceCountView {
  readonly state: AttendanceState;
  readonly label: string;
  readonly count: number;
  readonly href?: string;
}

export interface TeamExceptionSummaryView {
  readonly missing: MetricTileView;
  readonly underTime: MetricTileView;
  readonly overtime: MetricTileView;
  readonly critical: MetricTileView;
}

export interface TeamTimesheetRowView {
  readonly employee: EmployeeRef;
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly active: DurationView;
  readonly break: DurationView;
  readonly total: DurationView;
  readonly divisionContributions: readonly DivisionContributionView[];
  readonly workLocations: readonly string[];
  readonly status: DayStatusView;
  readonly hasOpenRemark: boolean;
  readonly href: string;
}

export interface ProjectProgressView {
  readonly project: ProjectRef;
  readonly completionPercent: number;
  readonly estimated: DurationView;
  readonly actual: DurationView;
  readonly variancePercent: number | null;
  readonly status: string;
  readonly budget: Redactable<Money> | null;
  readonly href: string;
}

export interface WorkloadWarningView {
  readonly employee: EmployeeRef;
  readonly weekLabel: string;
  readonly capacity: DurationView;
  readonly planned: DurationView;
  readonly actual: DurationView;
  readonly utilizationPercent: number;
  readonly warning: 'overallocated' | 'underallocated';
  readonly warningLabel: string;
}

export interface EvaluationProgressView {
  readonly periodLabel: string;
  readonly dueDateLabel: string;
  readonly total: number;
  readonly notStarted: number;
  readonly inProgress: number;
  readonly submitted: number;
  readonly published: number;
  readonly href: string;
}

/* ------------------------------------------------------------------------- */
/* HR dashboard and verification (`REQ-DASH-006`)                            */
/* ------------------------------------------------------------------------- */

export interface HrDashboardView {
  readonly totalEmployees: number;
  readonly activeEmployees: number;
  readonly divisionHeadcount: readonly { readonly division: DivisionRef; readonly count: number }[];
  readonly attendanceBreakdown: readonly AttendanceCountView[];
  readonly exceptions: TeamExceptionSummaryView;
  readonly monthlyHours: PeriodTotalsView;
  readonly openEvaluationPeriods: readonly EvaluationProgressView[];
  readonly wfhTrend: readonly { readonly label: string; readonly count: number }[];
  readonly workloadConcerns: readonly WorkloadWarningView[];
  readonly incompleteProfiles: number;
  readonly pendingVerification: PeriodVerificationSummaryView | null;
}

export interface PeriodVerificationSummaryView {
  readonly periodId: string;
  readonly label: string;
  readonly rangeLabel: string;
  readonly status: 'open' | 'pending_verification' | 'verified' | 'amended';
  readonly statusLabel: string;
  readonly employeeCount: number;
  readonly completeEmployeeCount: number;
  readonly openExceptionCount: number;
  readonly unresolvedCorrectionCount: number;
  readonly policyVersion: number;
  readonly verifiedAtLabel: string | null;
  readonly verifiedByLabel: string | null;
  readonly canVerify: boolean;
  readonly canAmend: boolean;
  readonly href: string;
}

/* ------------------------------------------------------------------------- */
/* Finance dashboard (`REQ-DASH-007`)                                        */
/* ------------------------------------------------------------------------- */

export interface FinanceDashboardView {
  readonly periodLabel: string;
  readonly isVerifiedPeriod: boolean;
  readonly unverifiedWarning: string | null;
  readonly verifiedEmployeeHours: DurationView;
  readonly verifiedOvertimeHours: DurationView;
  readonly divisionHours: readonly DivisionContributionView[];
  readonly projectHours: readonly ProjectProgressView[];
  /** Restricted tiles keep their label and render a restricted marker. */
  readonly projectLabourCost: MetricTileView;
  readonly divisionLabourCost: MetricTileView;
  readonly billableHours: MetricTileView;
  readonly nonBillableHours: MetricTileView;
  readonly payrollSummary: MetricTileView;
  readonly budgetVariance: MetricTileView;
  readonly exportHistory: readonly ExportJobView[];
  readonly hasFinancialPermission: boolean;
}

export interface ExportJobView {
  readonly id: string;
  readonly reportTitle: string;
  readonly format: ExportFormat;
  readonly formatLabel: string;
  readonly requestedByLabel: string;
  readonly requestedAtLabel: string;
  readonly filterSummary: string;
  readonly state: ExportState;
  readonly stateLabel: string;
  readonly expiresAtLabel: string | null;
  readonly failureMessage: string | null;
  readonly canDownload: boolean;
  readonly canRetry: boolean;
  readonly downloadUrl: string | null;
}

/* ------------------------------------------------------------------------- */
/* Management dashboard                                                      */
/* ------------------------------------------------------------------------- */

/** Read-only by construction: no action, href-to-form, or mutation field. */
export interface ManagementDashboardView {
  readonly periodLabel: string;
  readonly companyMetrics: readonly MetricTileView[];
  readonly divisionSummaries: readonly DivisionContributionView[];
  readonly employeeSummaryCount: number;
  readonly timeAllocation: readonly DivisionContributionView[];
  readonly projectProgress: readonly ProjectProgressView[];
}

/* ------------------------------------------------------------------------- */
/* Reports and notifications                                                 */
/* ------------------------------------------------------------------------- */

export interface ReportPreviewView {
  readonly metadata: {
    readonly title: string;
    readonly periodLabel: string;
    readonly filterSummary: readonly { readonly label: string; readonly value: string }[];
    readonly timezone: string;
    readonly generatedAtLabel: string;
    readonly policyVersion: number;
    readonly unverifiedWarning: string | null;
  };
  readonly columns: readonly {
    readonly field: string;
    readonly label: string;
    readonly align: 'left' | 'right';
    readonly restricted: boolean;
  }[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly totals: Readonly<Record<string, string>> | null;
  readonly rowCount: number;
}

export interface NotificationView {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  readonly body: string;
  readonly createdAtLabel: string;
  readonly isRead: boolean;
  readonly href: string | null;
  readonly groupLabel: string;
}

/* ------------------------------------------------------------------------- */
/* Shell                                                                     */
/* ------------------------------------------------------------------------- */

export interface AppShellView {
  readonly viewer: {
    readonly displayName: string;
    readonly roleLabel: string;
    readonly primaryRole: RoleKey;
    readonly avatarUrl: string | null;
  };
  readonly navigation: readonly NavGroupView[];
  readonly unreadNotificationCount: number;
  readonly runningTimer: RunningTimerView | null;
  readonly sessionExpiresAt: IsoDateTime;
}

export interface NavGroupView {
  readonly key: string;
  readonly label: string | null;
  readonly items: readonly NavItemView[];
}

export interface NavItemView {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  readonly iconKey: string;
  readonly badgeCount?: number;
  readonly inMobileBottomNav: boolean;
}
