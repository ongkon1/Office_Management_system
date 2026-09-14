/**
 * FE-0016 - Typed service interfaces.
 *
 * This is the single boundary between the UI and its data. During the frontend
 * milestone these are implemented by in-memory mock adapters over deterministic
 * fixtures; during the backend milestone the same interfaces are implemented by
 * server components, server actions, and route handlers over MySQL. No UI
 * component may import a fixture directly (`frontend_milestone.md` 2.1,
 * `FE-0916`).
 *
 * Conventions:
 * - Every operation returns `Promise<Result<T>>`; failures are values, not throws.
 * - Every mutation takes an explicit input type so validation is shared.
 * - Authorization is applied inside the service, never by the caller. A service
 *   returns `permission_denied` or omits restricted fields; it never relies on
 *   the UI to hide anything (`REQ-NAV-005`, `REQ-NFR-SEC-001`).
 */

import type {
  AttendanceDay,
  AuditEvent,
  DailySummary,
  Division,
  Document,
  DurationMinutes,
  Employee,
  EmployeeDivisionAssignment,
  EvaluationPeriod,
  EvaluationScore,
  ExportFormat,
  ExportJob,
  GeneralRemark,
  Holiday,
  IsoDate,
  LeaveBalance,
  LeaveRequest,
  LeaveTypeKey,
  DayPortion,
  Project,
  SelfEvaluation,
  SessionUser,
  Task,
  TaskChecklistItem,
  TimeEntry,
  TimerSession,
  TimesheetPeriod,
  WfhRequest,
  WorkloadWeek,
  WorkLocation,
  WorkPolicy,
} from './domain';
import type { CommonFilters, DateRange, ListQuery, Paginated } from './query';
import type { Result } from './results';
import type {
  EmployeeDashboardView,
  EntryCalculationPreview,
  FinanceDashboardView,
  HrDashboardView,
  ManagementDashboardView,
  NotificationView,
  PeriodVerificationSummaryView,
  ReportPreviewView,
  TeamLeadDashboardView,
  TeamTimesheetRowView,
  TimesheetDayView,
  TimesheetMonthView,
  TimesheetWeekView,
} from './view-models';

/**
 * Passed to every mutation that must be safe to retry after a network failure
 * or a duplicate submission (`REQ-NFR-PERF-004`).
 */
export interface IdempotentInput {
  readonly idempotencyKey: string;
}

/* ------------------------------------------------------------------------- */
/* Authentication                                                            */
/* ------------------------------------------------------------------------- */

export interface LoginInput {
  readonly identifier: string;
  readonly password: string;
  readonly rememberMe: boolean;
}

export interface AuthService {
  getSession(): Promise<Result<SessionUser | null>>;
  login(input: LoginInput): Promise<Result<{ requiresTwoFactor: boolean; user: SessionUser | null }>>;
  verifyTwoFactor(input: { code: string }): Promise<Result<SessionUser>>;
  resendTwoFactorCode(): Promise<Result<{ nextResendAvailableAt: string }>>;
  requestPasswordReset(input: { email: string }): Promise<Result<void>>;
  resetPassword(input: { token: string; password: string }): Promise<Result<void>>;
  logout(): Promise<Result<void>>;
  /** Development-only demo role switch; absent from production builds. */
  switchDemoAccount?(input: { userId: string }): Promise<Result<SessionUser>>;
}

/* ------------------------------------------------------------------------- */
/* Organization                                                              */
/* ------------------------------------------------------------------------- */

export interface DivisionService {
  list(query?: ListQuery): Promise<Result<Paginated<Division>>>;
  getById(id: string): Promise<Result<Division>>;
  create(input: Omit<Division, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<Result<Division>>;
  update(id: string, input: Partial<Division>): Promise<Result<Division>>;
  setActive(id: string, isActive: boolean): Promise<Result<Division>>;
}

export interface EmployeeService {
  list(query: ListQuery): Promise<Result<Paginated<Employee>>>;
  getById(id: string): Promise<Result<Employee>>;
  create(input: Omit<Employee, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<Result<Employee>>;
  update(id: string, input: Partial<Employee>): Promise<Result<Employee>>;
  setStatus(id: string, status: 'active' | 'inactive'): Promise<Result<Employee>>;
  listAssignments(employeeId: string): Promise<Result<readonly EmployeeDivisionAssignment[]>>;
  createAssignment(
    input: Omit<EmployeeDivisionAssignment, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
  ): Promise<Result<EmployeeDivisionAssignment>>;
  updateAssignment(
    id: string,
    input: Partial<EmployeeDivisionAssignment>,
  ): Promise<Result<EmployeeDivisionAssignment>>;
  endAssignment(id: string, endDate: IsoDate): Promise<Result<EmployeeDivisionAssignment>>;
  /** Divisions the employee may record time against on a given date. */
  listEffectiveDivisions(employeeId: string, workDate: IsoDate): Promise<Result<readonly Division[]>>;
}

/* ------------------------------------------------------------------------- */
/* Work                                                                      */
/* ------------------------------------------------------------------------- */

export interface ProjectService {
  list(query: ListQuery): Promise<Result<Paginated<Project>>>;
  getById(id: string): Promise<Result<Project>>;
  create(input: Omit<Project, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<Result<Project>>;
  update(id: string, input: Partial<Project>): Promise<Result<Project>>;
  setStatus(id: string, status: Project['status']): Promise<Result<Project>>;
  /** Projects accepting time for this division and date (`REQ-WORK-008`). */
  listSelectable(input: { divisionId: string; workDate: IsoDate }): Promise<Result<readonly Project[]>>;
}

export interface TaskService {
  list(query: ListQuery): Promise<Result<Paginated<Task>>>;
  getById(id: string): Promise<Result<Task>>;
  create(input: Omit<Task, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<Result<Task>>;
  update(id: string, input: Partial<Task>): Promise<Result<Task>>;
  setStatus(id: string, status: Task['status']): Promise<Result<Task>>;
  listChecklist(taskId: string): Promise<Result<readonly TaskChecklistItem[]>>;
  setChecklistItem(taskId: string, itemId: string, isDone: boolean): Promise<Result<TaskChecklistItem>>;
  /** Tasks selectable for a time entry, constrained by project and date. */
  listSelectable(input: { projectId: string; workDate: IsoDate }): Promise<Result<readonly Task[]>>;
}

/* ------------------------------------------------------------------------- */
/* Time                                                                      */
/* ------------------------------------------------------------------------- */

export interface TimeEntryInput {
  /** Persisted timer draft returned by stopTimer; consumed once on save. */
  readonly draftEntryId?: string;
  readonly draftVersion?: number;
  readonly employeeId: string;
  readonly workDate: IsoDate;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly entryMethod: 'manual_clock' | 'manual_duration';
  readonly workLocation: WorkLocation;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly activeMinutes: DurationMinutes | null;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly supportingLink: string | null;
  readonly attachmentIds: readonly string[];
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
}

export interface StartTimerInput {
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly workLocation: WorkLocation;
}

export interface TimesheetService {
  getDay(input: { employeeId: string; date: IsoDate }): Promise<Result<TimesheetDayView>>;
  getWeek(input: { employeeId: string; weekStartDate: IsoDate }): Promise<Result<TimesheetWeekView>>;
  getMonth(input: { employeeId: string; month: string }): Promise<Result<TimesheetMonthView>>;
  listEntries(query: ListQuery): Promise<Result<Paginated<TimeEntry>>>;
  getDailySummaries(input: {
    employeeId: string;
    range: DateRange;
  }): Promise<Result<readonly DailySummary[]>>;

  createEntry(input: TimeEntryInput & IdempotentInput): Promise<Result<TimeEntry>>;
  updateEntry(id: string, input: TimeEntryInput & { readonly expectedVersion?: number }): Promise<Result<TimeEntry>>;
  deleteEntry(id: string, expectedVersion?: number): Promise<Result<void>>;
  /** Returns an unsaved draft on the target date (`REQ-TIME-007`). */
  copyEntry(input: { sourceEntryId: string; targetDate: IsoDate }): Promise<Result<TimeEntryInput>>;

  /**
   * Calculates the preview without persisting anything. Uses the same
   * calculation contract as `createEntry`, so preview and result agree.
   */
  previewCalculation(input: TimeEntryInput): Promise<Result<EntryCalculationPreview>>;

  setBreakOverride(input: {
    employeeId: string;
    workDate: IsoDate;
    minutes: DurationMinutes;
    reason: string;
  }): Promise<Result<DailySummary>>;

  getRunningTimer(): Promise<Result<TimerSession | null>>;
  startTimer(input: StartTimerInput & IdempotentInput): Promise<Result<TimerSession>>;
  /** Idempotent: repeating a stop with the same key never duplicates time. */
  stopTimer(input: { sessionId: string } & IdempotentInput): Promise<Result<TimeEntryInput>>;
  cancelTimer(input: { sessionId: string }): Promise<Result<void>>;
}

export interface TeamTimesheetService {
  listTeamDays(query: ListQuery<CommonFilters>): Promise<Result<Paginated<TeamTimesheetRowView>>>;
  getEmployeeDay(input: { employeeId: string; date: IsoDate }): Promise<Result<TimesheetDayView>>;
}

export interface PeriodService {
  list(query?: ListQuery): Promise<Result<Paginated<TimesheetPeriod>>>;
  getVerificationSummary(periodId: string): Promise<Result<PeriodVerificationSummaryView>>;
  verify(input: { periodId: string; note: string | null } & IdempotentInput): Promise<Result<TimesheetPeriod>>;
  requestUnlock(input: { periodId: string; reason: string }): Promise<Result<void>>;
  amend(input: {
    periodId: string;
    recordId: string;
    reason: string;
    changes: Readonly<Record<string, unknown>>;
  } & IdempotentInput): Promise<Result<TimesheetPeriod>>;
}

/* ------------------------------------------------------------------------- */
/* Remarks                                                                   */
/* ------------------------------------------------------------------------- */

export interface RemarkService {
  list(query: ListQuery): Promise<Result<Paginated<GeneralRemark>>>;
  getById(id: string): Promise<Result<GeneralRemark>>;
  create(input: {
    employeeId: string;
    message: string;
    relatedRecord: GeneralRemark['relatedRecord'];
    isCorrectionRequest: boolean;
    requestedChanges: string | null;
  }): Promise<Result<GeneralRemark>>;
  respond(input: { remarkId: string; message: string }): Promise<Result<GeneralRemark>>;
  resolve(input: { remarkId: string }): Promise<Result<GeneralRemark>>;
}

/* ------------------------------------------------------------------------- */
/* HR                                                                        */
/* ------------------------------------------------------------------------- */

export interface WfhService {
  list(query: ListQuery): Promise<Result<Paginated<WfhRequest>>>;
  getById(id: string): Promise<Result<WfhRequest>>;
  create(input: {
    wfhDate: IsoDate;
    portion: DayPortion;
    reason: string;
    plannedTasks: string;
    divisionId: string;
    contactAvailability: string;
    attachmentIds: readonly string[];
  }): Promise<Result<WfhRequest>>;
  update(id: string, input: Partial<WfhRequest>): Promise<Result<WfhRequest>>;
  submit(id: string): Promise<Result<WfhRequest>>;
  cancel(id: string): Promise<Result<WfhRequest>>;
  decide(input: {
    id: string;
    outcome: 'approved' | 'rejected' | 'information_requested';
    comment: string | null;
  }): Promise<Result<WfhRequest>>;
  override(input: { id: string; outcome: 'approved' | 'rejected'; reason: string }): Promise<Result<WfhRequest>>;
}

export interface LeaveService {
  listRequests(query: ListQuery): Promise<Result<Paginated<LeaveRequest>>>;
  getRequest(id: string): Promise<Result<LeaveRequest>>;
  listBalances(employeeId: string, year: number): Promise<Result<readonly LeaveBalance[]>>;
  create(input: {
    leaveType: LeaveTypeKey;
    startDate: IsoDate;
    endDate: IsoDate;
    portion: DayPortion;
    reason: string;
    attachmentIds: readonly string[];
  }): Promise<Result<LeaveRequest>>;
  update(id: string, input: Partial<LeaveRequest>): Promise<Result<LeaveRequest>>;
  submit(id: string): Promise<Result<LeaveRequest>>;
  cancel(id: string): Promise<Result<LeaveRequest>>;
  decide(input: {
    id: string;
    outcome: 'approved' | 'rejected' | 'information_requested';
    comment: string | null;
  }): Promise<Result<LeaveRequest>>;
  override(input: { id: string; outcome: 'approved' | 'rejected'; reason: string }): Promise<Result<LeaveRequest>>;
}

export interface AttendanceService {
  list(query: ListQuery<CommonFilters>): Promise<Result<Paginated<AttendanceDay>>>;
  getEmployeeMonth(input: { employeeId: string; month: string }): Promise<Result<readonly AttendanceDay[]>>;
}

export interface HolidayService {
  list(query?: ListQuery): Promise<Result<Paginated<Holiday>>>;
  create(input: Omit<Holiday, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>): Promise<Result<Holiday>>;
  update(id: string, input: Partial<Holiday>): Promise<Result<Holiday>>;
  setActive(id: string, isActive: boolean): Promise<Result<Holiday>>;
}

export interface WorkPolicyService {
  list(): Promise<Result<readonly WorkPolicy[]>>;
  getEffective(input: { employeeId: string; workDate: IsoDate }): Promise<Result<WorkPolicy>>;
}

/* ------------------------------------------------------------------------- */
/* Workload and evaluation                                                   */
/* ------------------------------------------------------------------------- */

export interface WorkloadService {
  listWeeks(query: ListQuery<CommonFilters>): Promise<Result<Paginated<WorkloadWeek>>>;
  getEmployeeWeek(input: { employeeId: string; weekStartDate: IsoDate }): Promise<Result<WorkloadWeek>>;
}

export interface EvaluationService {
  listPeriods(query?: ListQuery): Promise<Result<Paginated<EvaluationPeriod>>>;
  createPeriod(
    input: Omit<EvaluationPeriod, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>,
  ): Promise<Result<EvaluationPeriod>>;
  listEvaluations(query: ListQuery): Promise<Result<Paginated<import('./domain').EvaluationRead>>>;
  getById(id: string): Promise<Result<import('./domain').EvaluationRead>>;
  saveSelfEvaluation(input: { id: string; selfEvaluation: SelfEvaluation; expectedVersion?: number }): Promise<Result<import('./domain').EvaluationRead>>;
  submitSelfEvaluation(input: { id: string }): Promise<Result<import('./domain').EvaluationRead>>;
  saveReviewerScores(input: {
    id: string;
    expectedVersion?: number;
    scores: readonly EvaluationScore[];
    summary: string | null;
  }): Promise<Result<import('./domain').EvaluationRead>>;
  submitReview(input: { id: string }): Promise<Result<import('./domain').EvaluationRead>>;
  publish(input: { id: string }): Promise<Result<import('./domain').EvaluationRead>>;
}

/* ------------------------------------------------------------------------- */
/* Dashboards                                                                */
/* ------------------------------------------------------------------------- */

export interface DashboardService {
  getEmployeeDashboard(input?: { date?: IsoDate }): Promise<Result<EmployeeDashboardView>>;
  getTeamLeadDashboard(input?: { date?: IsoDate }): Promise<Result<TeamLeadDashboardView>>;
  getHrDashboard(input?: { date?: IsoDate }): Promise<Result<HrDashboardView>>;
  getFinanceDashboard(input?: { periodId?: string }): Promise<Result<FinanceDashboardView>>;
  getManagementDashboard(input?: { periodId?: string }): Promise<Result<ManagementDashboardView>>;
}

/* ------------------------------------------------------------------------- */
/* Reporting and exports                                                     */
/* ------------------------------------------------------------------------- */

export interface ReportCatalogueEntry {
  readonly key: string;
  readonly title: string;
  readonly group:
    | 'timesheet'
    | 'hr'
    | 'finance'
    | 'attendance'
    | 'wfh'
    | 'evaluation'
    | 'workload'
    | 'remarks';
  readonly description: string;
  readonly requiresPermission: string | null;
}

export interface ReportService {
  listCatalogue(): Promise<Result<readonly ReportCatalogueEntry[]>>;
  run(input: { reportKey: string; query: ListQuery<CommonFilters> }): Promise<Result<ReportPreviewView>>;
}

export interface ExportService {
  request(input: {
    reportKey: string;
    format: ExportFormat;
    query: ListQuery<CommonFilters>;
  } & IdempotentInput): Promise<Result<ExportJob>>;
  getStatus(id: string): Promise<Result<ExportJob>>;
  listHistory(query: ListQuery): Promise<Result<Paginated<ExportJob>>>;
  cancel(id: string): Promise<Result<ExportJob>>;
  retry(id: string): Promise<Result<ExportJob>>;
}

/* ------------------------------------------------------------------------- */
/* Supporting modules                                                        */
/* ------------------------------------------------------------------------- */

export interface NotificationService {
  list(query: ListQuery): Promise<Result<Paginated<NotificationView>>>;
  getUnreadCount(): Promise<Result<number>>;
  markRead(input: { ids: readonly string[] }): Promise<Result<void>>;
  markAllRead(): Promise<Result<void>>;
}

export interface SearchResultItem {
  readonly id: string;
  readonly type: 'employee' | 'division' | 'project' | 'task' | 'timesheet' | 'remark' | 'document';
  readonly title: string;
  readonly subtitle: string | null;
  readonly href: string;
}

export interface SearchService {
  search(query: ListQuery): Promise<Result<Paginated<SearchResultItem>>>;
}

export interface DocumentService {
  list(query: ListQuery): Promise<Result<Paginated<Document>>>;
  getById(id: string): Promise<Result<Document>>;
}

export interface AuditService {
  list(query: ListQuery): Promise<Result<Paginated<AuditEvent>>>;
  getById(id: string): Promise<Result<AuditEvent>>;
}

/* ------------------------------------------------------------------------- */
/* Service registry                                                          */
/* ------------------------------------------------------------------------- */

/**
 * The complete data boundary. Screens resolve services from this registry, so
 * swapping mock adapters for MySQL-backed implementations is a single
 * composition-root change.
 */
export interface ServiceRegistry {
  readonly auth: AuthService;
  readonly divisions: DivisionService;
  readonly employees: EmployeeService;
  readonly projects: ProjectService;
  readonly tasks: TaskService;
  readonly timesheets: TimesheetService;
  readonly teamTimesheets: TeamTimesheetService;
  readonly periods: PeriodService;
  readonly remarks: RemarkService;
  readonly wfh: WfhService;
  readonly leave: LeaveService;
  readonly attendance: AttendanceService;
  readonly holidays: HolidayService;
  readonly workPolicies: WorkPolicyService;
  readonly workload: WorkloadService;
  readonly evaluations: EvaluationService;
  readonly dashboards: DashboardService;
  readonly reports: ReportService;
  readonly exports: ExportService;
  readonly notifications: NotificationService;
  readonly search: SearchService;
  readonly documents: DocumentService;
  readonly audit: AuditService;
}
