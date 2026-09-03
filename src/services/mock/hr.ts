/**
 * Mock HR service (Phase 5).
 *
 * HR's scope is company-wide, so the checks here are about *sensitivity*, not
 * reach. Three rules are enforced in this file and nowhere above it:
 *
 * - Verification requires `time.period.verify`; amendment requires
 *   `time.period.amend`; replacing an existing request decision requires
 *   `hr.request.override` **and** a reason (`REQ-WFH-004`, `REQ-ATT-006`).
 * - Verifying a period writes its status to the store, which is what makes the
 *   dates locked for every other service — the lock is one fact, not a copy.
 * - Private evaluation content is withheld by returning
 *   `selfEvaluationState: 'restricted'` rather than an empty object, so an
 *   unauthorized read can never look like an unsubmitted one.
 *
 * Nothing here approves a daily time record. HR verifies periods; Team Leads
 * request corrections. There is no daily approval anywhere in this product.
 */

import type {
  DailySummary,
  Employee,
  EmployeeDivisionAssignment,
  EvaluationAreaKey,
  EvaluationPeriod,
  Holiday,
  IsoDate,
  LeaveRequest,
  WfhRequest,
} from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  HolidayView,
  HrAssignmentView,
  HrAttendanceDayView,
  HrEmployeeDetailView,
  HrEmployeeRowView,
  HrEvaluationDetailView,
  HrEvaluationPeriodView,
  HrEvaluationRowView,
  HrLeaveBalanceView,
  HrPeriodWorkspaceView,
  HrRequestRowView,
  HrService,
} from '@/contracts/hr';
import { success, type Result } from '@/contracts/results';
import { aggregateSummaries } from '@/lib/calculation/engine';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatDateWithWeekday,
  formatTimestamp,
} from '@/lib/format';
import { ATTENDANCE_LABEL, toDurationView } from '@/lib/status';
import {
  DEMO_TODAY,
  LEAVE_BALANCES,
  LEAVE_TYPES,
  PROJECTS,
  STANDARD_POLICY,
} from '@/fixtures';
import {
  EMPLOYEES,
  EMPLOYEE_AUDIT,
  EMPLOYEE_DOCUMENTS,
  EVALUATIONS,
  EVALUATION_PERIODS,
  EVALUATION_WEIGHTING,
  PERIOD_AMENDMENTS,
  UNLOCK_REQUESTS,
  type EvaluationFixture,
  type PeriodAmendmentFixture,
  type UnlockRequestFixture,
} from '@/fixtures/hr';
import { DIVISIONS, findAccountByUserId } from './accounts';
import { actualProjectMinutes, isEffectiveOn } from './organization';
import { mockStore } from './store';
import { summaryFor } from './timesheet';

const LATENCY_MS = 160;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

function notFound(message: string) {
  return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message };
}

function denied(message: string, guidance: string) {
  return {
    status: 'permission_denied' as const,
    code: 'FORBIDDEN' as const,
    message,
    guidance,
  };
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

/** HR administration is available to HR Managers and Super Administrators. */
function canAdminister(userId: string): boolean {
  const viewer = viewerOf(userId);
  return viewer?.primaryRole === 'hr_manager' || viewer?.primaryRole === 'super_admin';
}

function hasPermission(userId: string, permission: string): boolean {
  return viewerOf(userId)?.permissions.includes(permission) ?? false;
}

function actorName(userId: string): string {
  return viewerOf(userId)?.fullName ?? 'HR Manager';
}

function divisionRef(divisionId: string | null) {
  if (!divisionId) return null;
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division
    ? { id: division.id, name: division.name, code: division.code, isRestricted: division.isRestricted }
    : { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

/* -------------------------------------------------------------------------- */
/* Mutable demo state                                                         */
/* -------------------------------------------------------------------------- */

let employees: Employee[] = [...EMPLOYEES];
let evaluationPeriods: EvaluationPeriod[] = [...EVALUATION_PERIODS];
let evaluations: EvaluationFixture[] = EVALUATIONS.map((item) => ({ ...item }));
let unlockRequests: UnlockRequestFixture[] = [...UNLOCK_REQUESTS];
let amendments: PeriodAmendmentFixture[] = [...PERIOD_AMENDMENTS];

function employeeById(employeeId: string): Employee | undefined {
  return employees.find((employee) => employee.id === employeeId);
}

function employeeRef(employeeId: string) {
  const employee = employeeById(employeeId);
  return {
    id: employeeId,
    fullName: employee?.fullName ?? employeeId,
    employeeCode: employee?.employeeCode ?? employeeId,
    avatarUrl: null,
    designation: employee?.designation ?? null,
  };
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

const EMPLOYMENT_TYPE_LABEL: Readonly<Record<Employee['employmentType'], string>> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  intern: 'Intern',
  consultant: 'Consultant',
};

const WORK_MODE_LABEL: Readonly<Record<Employee['normalWorkMode'], string>> = {
  office: 'Office',
  wfh: 'WFH',
  hybrid: 'Hybrid',
  field_work: 'Field Work',
  official_travel: 'Official Travel',
  training: 'Training',
  client_location: 'Client Location',
};

const EVALUATION_TYPE_LABEL: Readonly<Record<EvaluationPeriod['type'], string>> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  half_yearly: 'Half-yearly',
  annual: 'Annual',
  project_based: 'Project-based',
  probation: 'Probation',
};

const EVALUATION_STATE_LABEL: Readonly<Record<EvaluationFixture['state'], string>> = {
  not_started: 'Not started',
  self_evaluation: 'Self-evaluation',
  reviewer_scoring: 'Reviewer scoring',
  hr_review: 'HR review',
  published: 'Published',
};

const PERIOD_STATUS_LABEL = {
  open: 'Open',
  pending_verification: 'Pending verification',
  verified: 'Verified and locked',
  amended: 'Amended after verification',
} as const;

const REQUEST_STATE_LABEL = {
  draft: 'Draft',
  pending: 'Pending',
  information_requested: 'Information requested',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
} as const;

const WEEKDAY_LABEL = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const AREAS: readonly EvaluationAreaKey[] = [
  'task_completion',
  'work_quality',
  'timeliness',
  'teamwork_communication',
  'responsibility',
  'learning_initiative',
];

/* -------------------------------------------------------------------------- */
/* Employee views                                                             */
/* -------------------------------------------------------------------------- */

/** Fields whose absence makes a profile incomplete for HR follow-up. */
function missingFieldsOf(employee: Employee): readonly string[] {
  const missing: string[] = [];
  if (!employee.phone) missing.push('Phone number');
  if (!employee.officeLocation) missing.push('Office location');
  if (!employee.department) missing.push('Department');
  if (employee.skills.length === 0) missing.push('Skills');
  return missing;
}

function assignmentsOf(employeeId: string): readonly EmployeeDivisionAssignment[] {
  return mockStore
    .assignments()
    .filter((assignment) => assignment.employeeId === employeeId)
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

function assignmentView(assignment: EmployeeDivisionAssignment): HrAssignmentView {
  return {
    id: assignment.id,
    employeeId: assignment.employeeId,
    division: divisionRef(assignment.divisionId)!,
    isPrimary: assignment.isPrimary,
    teamLead: assignment.teamLeadEmployeeId ? employeeRef(assignment.teamLeadEmployeeId) : null,
    allocationPercent: assignment.allocationPercent,
    expectedWeekly: toDurationView(assignment.expectedWeeklyMinutes),
    startDate: assignment.startDate,
    startDateLabel: formatDate(assignment.startDate),
    endDate: assignment.endDate,
    endDateLabel: assignment.endDate ? formatDate(assignment.endDate) : null,
    isTemporary: assignment.isTemporary,
    isActive: assignment.isActive,
    isEffectiveToday: assignment.isActive && isEffectiveOn(assignment, DEMO_TODAY),
    roleInDivision: assignment.roleInDivision,
  };
}

function employeeRow(employee: Employee): HrEmployeeRowView {
  const missing = missingFieldsOf(employee);
  const divisions = assignmentsOf(employee.id).filter((assignment) => assignment.isActive);
  return {
    employee: employeeRef(employee.id),
    status: employee.status,
    statusLabel: employee.status === 'active' ? 'Active' : 'Inactive',
    primaryDivision: divisionRef(employee.primaryDivisionId),
    divisionCodes: [
      ...new Set(divisions.map((assignment) => divisionRef(assignment.divisionId)!.code)),
    ],
    teamLeadName: employee.teamLeadEmployeeId
      ? employeeRef(employee.teamLeadEmployeeId).fullName
      : null,
    employmentType: employee.employmentType,
    employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[employee.employmentType],
    workMode: employee.normalWorkMode,
    workModeLabel: WORK_MODE_LABEL[employee.normalWorkMode],
    joiningDateLabel: formatDate(employee.joiningDate),
    isProfileIncomplete: missing.length > 0,
    missingFields: missing,
    href: `/employees/${employee.id}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Attendance                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The exemption note is the whole point of `FE-0514`: an approved-leave or
 * holiday day must read as an explained non-working day, never as a missing
 * timesheet, and a half-day must show the reduced requirement it produced.
 */
function exemptionNoteFor(summary: DailySummary): string | null {
  if (summary.exemption === 'holiday') return 'Holiday — no timesheet required.';
  if (summary.exemption === 'full_day_leave') return 'Approved leave — no timesheet required.';
  if (summary.exemption === 'weekly_off') return 'Weekly off — no timesheet required.';
  if (summary.attendance === 'half_day_leave') {
    return `Half-day leave — required active time reduced to ${toDurationView(summary.requiredActiveMinutes).display}.`;
  }
  return null;
}

function attendanceDay(employeeId: string, date: IsoDate): HrAttendanceDayView {
  const summary = summaryFor(employeeId, date);
  return {
    employee: employeeRef(employeeId),
    date,
    dateLabel: formatDate(date),
    state: summary.attendance,
    stateLabel: ATTENDANCE_LABEL[summary.attendance],
    active: toDurationView(summary.activeMinutes),
    requiredActive: toDurationView(summary.requiredActiveMinutes),
    exemptionNote: exemptionNoteFor(summary),
    isMissing: summary.status === 'missing',
    href: `/employees/${employeeId}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Requests                                                                   */
/* -------------------------------------------------------------------------- */

function leaveTypeLabel(key: LeaveRequest['leaveType']): string {
  return LEAVE_TYPES.find((type) => type.key === key)?.label ?? key;
}

/** Completed work recorded on an approved WFH day (`REQ-WFH-006`). */
function completedWorkOn(employeeId: string, date: IsoDate) {
  return mockStore
    .entriesFor(employeeId, date)
    .filter((entry) => entry.state !== 'draft')
    .map((entry) => ({
      label: divisionRef(entry.divisionId)!.code,
      duration: toDurationView(entry.activeMinutes),
      completedWork: entry.completedWork,
    }));
}

function conflictNoteFor(request: LeaveRequest): string | null {
  const overlapping = mockStore
    .allLeaveRequests()
    .find(
      (other) =>
        other.id !== request.id &&
        other.employeeId === request.employeeId &&
        other.state === 'approved' &&
        other.startDate <= request.endDate &&
        other.endDate >= request.startDate,
    );
  if (overlapping) {
    return `Overlaps approved ${leaveTypeLabel(overlapping.leaveType)} on ${formatDate(overlapping.startDate)}.`;
  }
  const balance = LEAVE_BALANCES.find(
    (item) => item.employeeId === request.employeeId && item.leaveType === request.leaveType,
  );
  if (balance && request.totalDays > balance.remainingDays) {
    return `Requested ${request.totalDays} day(s) exceeds the remaining ${balance.remainingDays} day(s) of ${leaveTypeLabel(request.leaveType)}.`;
  }
  return null;
}

function requestRow(
  request: WfhRequest | LeaveRequest,
  kind: 'wfh' | 'leave',
  userId: string,
): HrRequestRowView {
  const isWfh = kind === 'wfh';
  const wfh = isWfh ? (request as WfhRequest) : null;
  const leave = isWfh ? null : (request as LeaveRequest);
  const divisionId = wfh
    ? wfh.divisionId
    : employeeById(request.employeeId)?.primaryDivisionId ?? 'pia';
  const dateLabel = wfh
    ? formatDateWithWeekday(wfh.wfhDate)
    : leave!.startDate === leave!.endDate
      ? formatDateWithWeekday(leave!.startDate)
      : formatDateRange(leave!.startDate, leave!.endDate);

  return {
    id: request.id,
    kind,
    employee: employeeRef(request.employeeId),
    division: divisionRef(divisionId)!,
    dateLabel,
    portion: request.portion,
    portionLabel: request.portion === 'half_day' ? 'Half day' : 'Full day',
    leaveType: leave?.leaveType ?? null,
    leaveTypeLabel: leave ? leaveTypeLabel(leave.leaveType) : null,
    reason: request.reason,
    plannedWork: wfh ? `${wfh.plannedTasks} ${wfh.contactAvailability}` : null,
    completedWorkPreview:
      wfh && wfh.state === 'approved' ? completedWorkOn(wfh.employeeId, wfh.wfhDate) : [],
    state: request.state,
    stateLabel: REQUEST_STATE_LABEL[request.state],
    decisionLabel: request.decision
      ? `${REQUEST_STATE_LABEL[request.decision.outcome]} by ${request.decision.decidedBy.displayName} on ${formatDate(request.decision.decidedAt.slice(0, 10))}`
      : null,
    overrideReason: request.decision?.override?.reason ?? null,
    previousOutcomeLabel: request.decision?.override
      ? REQUEST_STATE_LABEL[request.decision.override.previousOutcome]
      : null,
    conflictNote: leave ? conflictNoteFor(leave) : null,
    canOverride: hasPermission(userId, SENSITIVE_PERMISSIONS.hrOverride),
  };
}

/* -------------------------------------------------------------------------- */
/* Holidays                                                                   */
/* -------------------------------------------------------------------------- */

function holidayView(holiday: Holiday): HolidayView {
  const division = divisionRef(holiday.divisionId);
  return {
    id: holiday.id,
    name: holiday.name,
    scope: holiday.scope,
    scopeLabel:
      holiday.scope === 'company'
        ? 'Company-wide'
        : holiday.scope === 'division'
          ? `Division: ${division?.name ?? 'Unknown'}`
          : 'Weekly',
    division,
    dateLabel: holiday.date ? formatDateWithWeekday(holiday.date) : null,
    weekdayLabel: holiday.weekday ? WEEKDAY_LABEL[holiday.weekday] : null,
    isActive: holiday.isActive,
    affectedEmployeeCount:
      holiday.scope === 'division' && holiday.divisionId
        ? mockStore
            .assignments()
            .filter((item) => item.divisionId === holiday.divisionId && item.isActive).length
        : employees.filter((employee) => employee.status === 'active').length,
  };
}

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

function reviewedEmployeeIds(): readonly string[] {
  return ['emp-1001', 'emp-1002', 'emp-1003', 'emp-1004'];
}

function workingDatesIn(from: IsoDate, to: IsoDate): readonly IsoDate[] {
  const dates: IsoDate[] = [];
  const span = daysBetween(from, to);
  for (let offset = 0; offset <= span; offset += 1) dates.push(addDays(from, offset));
  return dates;
}

function periodWorkspace(periodId: string, userId: string): HrPeriodWorkspaceView | null {
  const period = mockStore.findPeriod(periodId);
  if (!period) return null;

  const dates = workingDatesIn(period.startDate, period.endDate);
  const rows = reviewedEmployeeIds().map((employeeId) => {
    const summaries = dates.map((date) => summaryFor(employeeId, date));
    const required = summaries.filter((summary) => summary.isRequiredWorkingDay);
    const recorded = required.filter((summary) => summary.status !== 'missing');
    const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
    const unresolved = mockStore
      .remarksFor(employeeId)
      .filter(
        (remark) =>
          remark.isCorrectionRequest &&
          remark.state !== 'resolved' &&
          remark.relatedRecord.type === 'timesheet' &&
          remark.relatedRecord.workDate >= period.startDate &&
          remark.relatedRecord.workDate <= period.endDate,
      ).length;
    const exceptions =
      totals.missingDayCount + totals.underTimeDayCount + totals.criticalDayCount;
    return {
      employee: employeeRef(employeeId),
      recordedDays: recorded.length,
      requiredDays: required.length,
      completenessPercent: required.length
        ? Math.round((recorded.length / required.length) * 100)
        : 100,
      active: toDurationView(totals.activeMinutes),
      missingDays: totals.missingDayCount,
      underTimeDays: totals.underTimeDayCount,
      overtimeDays: totals.overtimeDayCount,
      criticalDays: totals.criticalDayCount,
      unresolvedCorrections: unresolved,
      isReady: exceptions === 0 && unresolved === 0,
      href: `/team/timesheets/${employeeId}/${period.endDate}`,
    };
  });

  const openExceptionCount = rows.reduce(
    (total, row) => total + row.missingDays + row.underTimeDays + row.criticalDays,
    0,
  );
  const unresolvedCorrectionCount = rows.reduce(
    (total, row) => total + row.unresolvedCorrections,
    0,
  );
  const canVerifyPermission = hasPermission(userId, SENSITIVE_PERMISSIONS.periodVerification);
  const isClosed = period.status === 'verified' || period.status === 'amended';
  const unlock = unlockRequests.find((request) => request.periodId === periodId) ?? null;

  return {
    periodId,
    label: period.label,
    rangeLabel: formatDateRange(period.startDate, period.endDate),
    startDate: period.startDate,
    endDate: period.endDate,
    includedDateCount: dates.length,
    status: period.status,
    statusLabel: PERIOD_STATUS_LABEL[period.status],
    policyVersion: period.policyVersion,
    employeeCount: rows.length,
    completeEmployeeCount: rows.filter((row) => row.isReady).length,
    openExceptionCount,
    unresolvedCorrectionCount,
    verifiedAtLabel: period.verifiedAt ? formatTimestamp(period.verifiedAt) : null,
    verifiedByLabel: period.verifiedBy?.displayName ?? null,
    canVerify: canVerifyPermission && !isClosed && unresolvedCorrectionCount === 0,
    canAmend: hasPermission(userId, SENSITIVE_PERMISSIONS.periodAmendment) && isClosed,
    blockedReason: isClosed
      ? 'This period is verified and locked. Amending it requires the period-amendment permission and a recorded reason.'
      : !canVerifyPermission
        ? 'Verifying a payroll period needs the separately granted period-verification permission.'
        : unresolvedCorrectionCount > 0
          ? `${unresolvedCorrectionCount} correction request(s) are still unresolved. Resolve them before verifying.`
          : null,
    unlockRequest: unlock
      ? {
          requestedByLabel: unlock.requestedBy,
          requestedAtLabel: formatTimestamp(unlock.requestedAt),
          reason: unlock.reason,
          state: unlock.state,
          stateLabel:
            unlock.state === 'pending'
              ? 'Unlock requested'
              : unlock.state === 'granted'
                ? 'Unlock granted'
                : 'Unlock declined',
        }
      : null,
    rows,
    amendments: amendments
      .filter((amendment) => amendment.periodId === periodId)
      .map((amendment) => ({
        id: amendment.id,
        employeeName: employeeRef(amendment.employeeId).fullName,
        recordLabel: amendment.recordLabel,
        reason: amendment.reason,
        amendedAtLabel: formatTimestamp(amendment.amendedAt),
        amendedByLabel: amendment.amendedBy,
        changes: [{ label: 'Value', before: amendment.before, after: amendment.after }],
      })),
  };
}

/* -------------------------------------------------------------------------- */
/* Evaluations                                                                */
/* -------------------------------------------------------------------------- */

function weightedScoreOf(fixture: EvaluationFixture): number | null {
  if (AREAS.some((area) => !fixture.scores[area])) return null;
  const total = AREAS.reduce(
    (sum, area) => sum + fixture.scores[area] * EVALUATION_WEIGHTING.weights[area],
    0,
  );
  return Math.round((total / 100) * 100) / 100;
}

function evaluationPeriodOf(fixture: EvaluationFixture): EvaluationPeriod | undefined {
  return evaluationPeriods.find((period) => period.id === fixture.periodId);
}

function evaluationRow(fixture: EvaluationFixture): HrEvaluationRowView {
  const period = evaluationPeriodOf(fixture);
  return {
    id: fixture.id,
    employee: employeeRef(fixture.employeeId),
    reviewer: fixture.reviewerEmployeeId ? employeeRef(fixture.reviewerEmployeeId) : null,
    periodId: fixture.periodId,
    periodLabel: period?.name ?? fixture.periodId,
    dueDateLabel: period ? formatDate(period.dueDate) : '',
    state: fixture.state,
    stateLabel: EVALUATION_STATE_LABEL[fixture.state],
    weightedScore: weightedScoreOf(fixture),
    isOverdue: Boolean(
      period && period.dueDate < DEMO_TODAY && fixture.state !== 'published',
    ),
    reminderSentAtLabel: fixture.reminderSentAt ? formatTimestamp(fixture.reminderSentAt) : null,
    href: `/evaluations/${fixture.id}`,
  };
}

/** Facts derived from authoritative records, never hand-entered (`REQ-EVAL-003`). */
function evaluationFacts(fixture: EvaluationFixture) {
  const period = evaluationPeriodOf(fixture);
  const from = period?.startDate ?? '2026-07-01';
  const to = period?.endDate ?? '2026-09-30';
  const summaries = workingDatesIn(from, to).map((date) => summaryFor(fixture.employeeId, date));
  const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
  const tasks = mockStore.tasks().filter((task) => task.assigneeEmployeeId === fixture.employeeId);
  const completed = tasks.filter((task) => task.status === 'completed');
  const overdue = tasks.filter(
    (task) => task.status !== 'completed' && task.dueDate && task.dueDate < DEMO_TODAY,
  );
  return [
    { label: 'Required active time', value: toDurationView(totals.requiredActiveMinutes).display },
    { label: 'Actual active time', value: toDurationView(totals.activeMinutes).display },
    { label: 'Recognized break', value: toDurationView(totals.breakMinutes).display },
    { label: 'Overtime', value: toDurationView(totals.overtimeMinutes).display },
    { label: 'Missing days', value: String(totals.missingDayCount) },
    { label: 'Tasks completed', value: String(completed.length) },
    { label: 'Tasks overdue', value: String(overdue.length) },
    {
      label: 'Task completion rate',
      value: tasks.length ? `${Math.round((completed.length / tasks.length) * 100)}%` : '0%',
    },
    {
      label: 'WFH days',
      value: String(
        mockStore
          .wfhFor(fixture.employeeId)
          .filter((request) => request.state === 'approved').length,
      ),
    },
    {
      label: 'Leave days',
      value: String(
        mockStore
          .leaveFor(fixture.employeeId)
          .filter((request) => request.state === 'approved')
          .reduce((total, request) => total + request.totalDays, 0),
      ),
    },
    { label: 'General remarks', value: String(mockStore.remarksFor(fixture.employeeId).length) },
  ];
}

const SELF_EVALUATION_LABELS: readonly { key: keyof NonNullable<EvaluationFixture['selfEvaluation']>; label: string }[] = [
  { key: 'achievements', label: 'Key achievements' },
  { key: 'completedProjects', label: 'Completed projects' },
  { key: 'challenges', label: 'Challenges faced' },
  { key: 'skills', label: 'Skills developed' },
  { key: 'trainingNeeds', label: 'Training needs' },
  { key: 'goals', label: 'Goals for the next period' },
  { key: 'supportRequired', label: 'Support required' },
];

function evaluationDetail(fixture: EvaluationFixture, userId: string): HrEvaluationDetailView {
  const row = evaluationRow(fixture);
  const mayReadPrivate =
    hasPermission(userId, SENSITIVE_PERMISSIONS.evaluationPrivate) || canAdminister(userId);
  const selfEvaluationState = !mayReadPrivate
    ? ('restricted' as const)
    : fixture.selfEvaluation?.submittedAt
      ? ('submitted' as const)
      : ('not_submitted' as const);

  return {
    ...row,
    facts: evaluationFacts(fixture),
    selfEvaluationState,
    selfEvaluation:
      selfEvaluationState === 'submitted' && fixture.selfEvaluation
        ? SELF_EVALUATION_LABELS.map((entry) => ({
            label: entry.label,
            value: String(fixture.selfEvaluation![entry.key] ?? ''),
          }))
        : null,
    weights: EVALUATION_WEIGHTING.weights,
    weightingVersion: EVALUATION_WEIGHTING.version,
    scores: fixture.scores,
    comments: fixture.comments,
    reviewerSummary: fixture.reviewerSummary,
    publishedAtLabel: fixture.publishedAt ? formatTimestamp(fixture.publishedAt) : null,
    publishedByLabel: fixture.publishedBy,
    publicationHistory: [
      ...(fixture.selfEvaluation?.submittedAt
        ? [
            {
              label: 'Self-evaluation submitted',
              actorLabel: employeeRef(fixture.employeeId).fullName,
              atLabel: formatTimestamp(fixture.selfEvaluation.submittedAt),
            },
          ]
        : []),
      ...(fixture.state === 'hr_review' || fixture.state === 'published'
        ? [
            {
              label: 'Reviewer scoring submitted to HR',
              actorLabel: employeeRef(fixture.reviewerEmployeeId).fullName,
              atLabel: 'Recorded with the submission',
            },
          ]
        : []),
      ...(fixture.publishedAt
        ? [
            {
              label: 'Published to the employee',
              actorLabel: fixture.publishedBy ?? 'HR',
              atLabel: formatTimestamp(fixture.publishedAt),
            },
          ]
        : []),
    ],
    canPublish: canAdminister(userId) && fixture.state === 'hr_review',
    canReturn: canAdminister(userId) && fixture.state === 'hr_review',
    isReadOnly: fixture.state === 'published',
    restrictedNote:
      selfEvaluationState === 'restricted'
        ? 'Self-evaluation content needs the separately granted private-evaluation permission.'
        : null,
  };
}

function evaluationPeriodView(period: EvaluationPeriod): HrEvaluationPeriodView {
  const items = evaluations.filter((item) => item.periodId === period.id);
  const count = (state: EvaluationFixture['state']) =>
    items.filter((item) => item.state === state).length;
  const published = count('published');
  return {
    id: period.id,
    name: period.name,
    type: period.type,
    typeLabel: EVALUATION_TYPE_LABEL[period.type],
    rangeLabel: formatDateRange(period.startDate, period.endDate),
    dueDateLabel: formatDate(period.dueDate),
    weightingVersion: period.weightingVersion,
    isOpen: period.isOpen,
    total: items.length,
    notStarted: count('not_started'),
    selfEvaluation: count('self_evaluation'),
    reviewerScoring: count('reviewer_scoring'),
    hrReview: count('hr_review'),
    published,
    progressPercent: items.length ? Math.round((published / items.length) * 100) : 0,
    overdueReviewerCount: items.filter(
      (item) => period.dueDate < DEMO_TODAY && item.state !== 'published',
    ).length,
    href: `/evaluations?period=${period.id}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const mockHrService: HrService = {
  async getDashboard(userId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied(
        'The HR workspace is limited to HR Managers.',
        'Return to your dashboard for the views available to your role.',
      );
    }

    const active = employees.filter((employee) => employee.status === 'active');
    const reviewed = reviewedEmployeeIds();
    const todaySummaries = reviewed.map((employeeId) => summaryFor(employeeId, DEMO_TODAY));
    const monthDates = workingDatesIn('2026-09-01', '2026-09-30');
    const monthSummaries = reviewed.flatMap((employeeId) =>
      monthDates.map((date) => summaryFor(employeeId, date)),
    );
    const monthTotals = aggregateSummaries(
      monthSummaries,
      STANDARD_POLICY.overtimeThresholdMinutes,
    );
    const countAttendance = (state: DailySummary['attendance']) =>
      todaySummaries.filter((summary) => summary.attendance === state).length;

    const exceptionTile = (
      key: string,
      label: string,
      value: number,
      tone: 'negative' | 'caution',
    ) => ({ key, label, value: String(value), tone, href: '/hr/timesheets' }) as const;

    const countStatus = (status: DailySummary['status']) =>
      monthSummaries.filter((summary) => summary.status === status).length;

    return success({
      totalEmployees: employees.length,
      activeEmployees: active.length,
      divisionCount: Object.keys(DIVISIONS).length,
      divisionHeadcount: Object.values(DIVISIONS).map((division) => ({
        division: divisionRef(division.id)!,
        count: mockStore
          .assignments()
          .filter((assignment) => assignment.divisionId === division.id && assignment.isActive)
          .length,
      })),
      attendanceBreakdown: (
        [
          'office',
          'wfh',
          'approved_leave',
          'half_day_leave',
          'holiday',
          'weekly_off',
          'missing_timesheet',
        ] as const
      ).map((state) => ({
        state,
        label: ATTENDANCE_LABEL[state],
        count: countAttendance(state),
        href: '/attendance',
      })),
      exceptions: {
        missing: exceptionTile('missing', 'Missing', countStatus('missing'), 'negative'),
        underTime: exceptionTile('under_time', 'Under-time', countStatus('under_time'), 'caution'),
        overtime: exceptionTile('overtime', 'Overtime', countStatus('overtime'), 'caution'),
        critical: exceptionTile('critical', 'Critical', countStatus('critical'), 'negative'),
      },
      monthlyHours: {
        label: 'September 2026',
        active: toDurationView(monthTotals.activeMinutes),
        break: toDurationView(monthTotals.breakMinutes),
        total: toDurationView(monthTotals.totalMinutes),
        overtime: toDurationView(monthTotals.overtimeMinutes),
        requiredActive: toDurationView(monthTotals.requiredActiveMinutes),
        completeDayCount: monthTotals.completeDayCount,
        underTimeDayCount: monthTotals.underTimeDayCount,
        overtimeDayCount: monthTotals.overtimeDayCount,
        criticalDayCount: monthTotals.criticalDayCount,
        missingDayCount: monthTotals.missingDayCount,
      },
      openEvaluationPeriods: evaluationPeriods
        .filter((period) => period.isOpen)
        .map((period) => {
          const view = evaluationPeriodView(period);
          return {
            periodLabel: view.name,
            dueDateLabel: view.dueDateLabel,
            total: view.total,
            notStarted: view.notStarted,
            inProgress: view.reviewerScoring + view.selfEvaluation,
            submitted: view.hrReview,
            published: view.published,
            href: view.href,
          };
        }),
      wfhTrend: [
        { label: 'Jun', count: 6 },
        { label: 'Jul', count: 9 },
        { label: 'Aug', count: 12 },
        { label: 'Sep', count: mockStore.allWfhRequests().length },
      ],
      workloadConcerns: reviewed.slice(0, 2).map((employeeId, index) => ({
        employee: employeeRef(employeeId),
        weekLabel: '31 Aug – 6 Sep 2026',
        capacity: toDurationView(2100),
        planned: toDurationView(index === 0 ? 2400 : 1080),
        actual: toDurationView(
          workingDatesIn('2026-08-31', '2026-09-04').reduce(
            (total, date) => total + summaryFor(employeeId, date).activeMinutes,
            0,
          ),
        ),
        utilizationPercent: index === 0 ? 114 : 51,
        warning: index === 0 ? ('overallocated' as const) : ('underallocated' as const),
        warningLabel: index === 0 ? 'Overallocated' : 'Underallocated',
      })),
      incompleteProfiles: employees.filter((employee) => missingFieldsOf(employee).length > 0)
        .length,
      pendingVerification: (() => {
        const workspace = periodWorkspace('per-2026-08', userId);
        if (!workspace) return null;
        return {
          periodId: workspace.periodId,
          label: workspace.label,
          rangeLabel: workspace.rangeLabel,
          status: workspace.status,
          statusLabel: workspace.statusLabel,
          employeeCount: workspace.employeeCount,
          completeEmployeeCount: workspace.completeEmployeeCount,
          openExceptionCount: workspace.openExceptionCount,
          unresolvedCorrectionCount: workspace.unresolvedCorrectionCount,
          policyVersion: workspace.policyVersion,
          verifiedAtLabel: workspace.verifiedAtLabel,
          verifiedByLabel: workspace.verifiedByLabel,
          canVerify: workspace.canVerify,
          canAmend: workspace.canAmend,
          href: `/hr/timesheets?period=${workspace.periodId}`,
        };
      })(),
      recentAssignments: mockStore
        .assignments()
        .slice()
        .sort((a, b) => b.startDate.localeCompare(a.startDate))
        .slice(0, 4)
        .map((assignment) => ({
          id: assignment.id,
          employee: employeeRef(assignment.employeeId),
          division: divisionRef(assignment.divisionId)!,
          changeLabel: `${assignment.allocationPercent}% ${assignment.isPrimary ? 'primary' : 'secondary'} allocation`,
          effectiveLabel: assignment.endDate
            ? `${formatDate(assignment.startDate)} – ${formatDate(assignment.endDate)}`
            : `From ${formatDate(assignment.startDate)}`,
          isTemporary: assignment.isTemporary,
        })),
    });
  },

  async listEmployees(userId, filters) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('The employee directory is limited to HR.', 'Return to your dashboard.');
    }
    const search = (filters?.search ?? '').trim().toLowerCase();
    const rows = employees.map(employeeRow).filter((row) => {
      if (filters?.status?.length && !filters.status.includes(row.status)) return false;
      if (
        filters?.divisionIds?.length &&
        !row.divisionCodes.some((code) =>
          filters.divisionIds!.some((id) => divisionRef(id)?.code === code),
        )
      ) {
        return false;
      }
      if (
        filters?.teamLeadIds?.length &&
        !filters.teamLeadIds.includes(
          employeeById(row.employee.id)?.teamLeadEmployeeId ?? '',
        )
      ) {
        return false;
      }
      if (
        filters?.employmentTypes?.length &&
        !filters.employmentTypes.includes(row.employmentType)
      ) {
        return false;
      }
      if (filters?.workModes?.length && !filters.workModes.includes(row.workMode)) return false;
      if (filters?.incompleteOnly && !row.isProfileIncomplete) return false;
      if (
        search &&
        !`${row.employee.fullName} ${row.employee.employeeCode}`.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });
    return success(rows);
  },

  async getEmployee(userId, employeeId) {
    await delay();
    if (!canAdminister(userId)) {
      return notFound('Employee not found.');
    }
    const employee = employeeById(employeeId);
    if (!employee) return notFound('Employee not found.');

    const assignments = assignmentsOf(employeeId).map(assignmentView);
    const concurrent = assignments
      .filter((assignment) => assignment.isEffectiveToday)
      .reduce((total, assignment) => total + assignment.allocationPercent, 0);
    const monthDates = workingDatesIn('2026-09-01', '2026-09-30');
    const monthTotals = aggregateSummaries(
      monthDates.map((date) => summaryFor(employeeId, date)),
      STANDARD_POLICY.overtimeThresholdMinutes,
    );

    return success({
      employee: employeeRef(employeeId),
      status: employee.status,
      statusLabel: employee.status === 'active' ? 'Active' : 'Inactive',
      email: employee.email,
      phone: employee.phone,
      officeLocation: employee.officeLocation,
      department: employee.department,
      employmentType: employee.employmentType,
      employmentTypeLabel: EMPLOYMENT_TYPE_LABEL[employee.employmentType],
      joiningDateLabel: formatDate(employee.joiningDate),
      workMode: employee.normalWorkMode,
      workModeLabel: WORK_MODE_LABEL[employee.normalWorkMode],
      skills: employee.skills,
      standardDaily: toDurationView(employee.standardDailyActiveMinutes),
      standardWeekly: toDurationView(employee.standardWeeklyActiveMinutes),
      workPolicyLabel: `${STANDARD_POLICY.name} (version ${STANDARD_POLICY.version})`,
      missingFields: missingFieldsOf(employee),

      assignments,
      totalAllocationPercent: concurrent,
      allocationWarning:
        concurrent > 100
          ? `Concurrent allocation is ${concurrent}%. Reduce an allocation or end an assignment before saving payroll expectations.`
          : null,

      projects: PROJECTS.filter((project) =>
        mockStore
          .tasks()
          .some(
            (task) => task.projectId === project.id && task.assigneeEmployeeId === employeeId,
          ),
      ).map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
        division: divisionRef(project.divisionId)!,
        actual: toDurationView(actualProjectMinutes(project.id)),
      })),
      monthly: {
        label: 'September 2026',
        active: toDurationView(monthTotals.activeMinutes),
        break: toDurationView(monthTotals.breakMinutes),
        total: toDurationView(monthTotals.totalMinutes),
        overtime: toDurationView(monthTotals.overtimeMinutes),
        requiredActive: toDurationView(monthTotals.requiredActiveMinutes),
        completeDayCount: monthTotals.completeDayCount,
        underTimeDayCount: monthTotals.underTimeDayCount,
        overtimeDayCount: monthTotals.overtimeDayCount,
        criticalDayCount: monthTotals.criticalDayCount,
        missingDayCount: monthTotals.missingDayCount,
      },
      attendance: workingDatesIn('2026-08-17', '2026-09-02').map((date) =>
        attendanceDay(employeeId, date),
      ),
      wfh: mockStore
        .wfhFor(employeeId)
        .map((request) => requestRow(request, 'wfh', userId)),
      leave: mockStore
        .leaveFor(employeeId)
        .map((request) => requestRow(request, 'leave', userId)),
      leaveBalances: LEAVE_BALANCES.filter((balance) => balance.employeeId === employeeId).map(
        (balance) => ({
          employee: employeeRef(employeeId),
          leaveType: balance.leaveType,
          typeLabel: leaveTypeLabel(balance.leaveType),
          year: balance.year,
          entitledDays: balance.entitledDays,
          consumedDays: balance.consumedDays,
          reservedDays: balance.reservedDays,
          remainingDays: balance.remainingDays,
        }),
      ),
      evaluations: evaluations
        .filter((item) => item.employeeId === employeeId)
        .map((item) => {
          const row = evaluationRow(item);
          return {
            id: row.id,
            periodLabel: row.periodLabel,
            state: row.state,
            stateLabel: row.stateLabel,
            weightedScore: row.weightedScore,
            href: row.href,
          };
        }),
      remarks: mockStore.remarksFor(employeeId).map((remark) => ({
        id: remark.id,
        author: employeeRef(remark.authorEmployeeId),
        employee: employeeRef(remark.employeeId),
        message: remark.message,
        createdAtLabel: formatTimestamp(remark.createdAt),
        state: remark.state,
        stateLabel: remark.state.charAt(0).toUpperCase() + remark.state.slice(1),
        isCorrectionRequest: remark.isCorrectionRequest,
        relatedLabel:
          remark.relatedRecord.type === 'timesheet'
            ? formatDate(remark.relatedRecord.workDate)
            : null,
        relatedHref:
          remark.relatedRecord.type === 'timesheet'
            ? `/timesheets/${remark.relatedRecord.workDate}`
            : null,
        responseCount: remark.responses.length,
        href: `/remarks/${remark.id}`,
      })),
      documents: EMPLOYEE_DOCUMENTS.filter((doc) => doc.employeeId === employeeId).map((doc) => ({
        id: doc.id,
        title: doc.title,
        categoryLabel: doc.category,
        uploadedAtLabel: formatTimestamp(doc.uploadedAt),
        isRestricted: doc.isRestricted,
      })),
      auditHistory: EMPLOYEE_AUDIT.filter((entry) => entry.employeeId === employeeId)
        .slice()
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .map((entry) => ({
          id: entry.id,
          occurredAtLabel: formatTimestamp(entry.occurredAt),
          actorLabel: entry.actor,
          action: entry.action,
          detail: entry.detail,
          reason: entry.reason,
        })),
    } satisfies HrEmployeeDetailView);
  },

  async saveEmployee(userId, input, employeeId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can create or edit an employee record.', 'Return to your dashboard.');
    }
    if (!input.fullName.trim()) {
      return invalid('fullName', 'Enter the employee name.', 'Use the name as it appears on the employment record.');
    }
    if (!input.employeeCode.trim()) {
      return invalid('employeeCode', 'Enter an employee code.', 'Use the format EMP-0000.');
    }
    if (!input.email.trim()) {
      return invalid('email', 'Enter a work email address.', 'The employee signs in with this address.');
    }
    const duplicate = employees.find(
      (employee) =>
        employee.id !== employeeId &&
        employee.employeeCode.toLowerCase() === input.employeeCode.trim().toLowerCase(),
    );
    if (duplicate) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `Employee code ${input.employeeCode} is already used by ${duplicate.fullName}.`,
        guidance: 'Choose a different employee code.',
      };
    }

    const existing = employeeId ? employeeById(employeeId) : undefined;
    const now = new Date().toISOString();
    const actor = { userId, displayName: actorName(userId) };
    const record: Employee = {
      id: existing?.id ?? `emp-${Date.now()}`,
      employeeCode: input.employeeCode.trim().toUpperCase(),
      fullName: input.fullName.trim(),
      photoUrl: existing?.photoUrl ?? null,
      designation: input.designation.trim(),
      department: input.department.trim() || null,
      employmentType: input.employmentType,
      joiningDate: input.joiningDate,
      status: input.status,
      email: input.email.trim(),
      phone: input.phone.trim() || null,
      officeLocation: input.officeLocation.trim() || null,
      primaryDivisionId: input.primaryDivisionId,
      teamLeadEmployeeId: input.teamLeadEmployeeId || null,
      skills: input.skills.filter((skill) => skill.trim().length > 0),
      normalWorkMode: input.normalWorkMode,
      standardDailyActiveMinutes: input.standardDailyActiveMinutes,
      standardWeeklyActiveMinutes: input.standardWeeklyActiveMinutes,
      workPolicyId: STANDARD_POLICY.id,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? actor,
      updatedAt: now,
      updatedBy: actor,
    };
    employees = existing
      ? employees.map((employee) => (employee.id === record.id ? record : employee))
      : [...employees, record];
    return success(employeeRow(record));
  },

  async saveAssignment(userId, input, assignmentId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can change division assignments.', 'Return to your dashboard.');
    }
    if (input.isTemporary && !input.endDate) {
      return invalid(
        'endDate',
        'A temporary assignment needs an end date.',
        'Set the last date the employee may record time against this division.',
      );
    }
    if (input.allocationPercent < 1 || input.allocationPercent > 100) {
      return invalid(
        'allocationPercent',
        'Allocation must be between 1 and 100 percent.',
        'Enter the share of the working week this division expects.',
      );
    }
    if (input.endDate && input.endDate < input.startDate) {
      return invalid(
        'endDate',
        'The end date cannot be before the start date.',
        'Choose an end date on or after the start date.',
      );
    }

    const now = new Date().toISOString();
    const actor = { userId, displayName: actorName(userId) };
    const existing = assignmentId
      ? mockStore.assignments().find((assignment) => assignment.id === assignmentId)
      : undefined;
    const record: EmployeeDivisionAssignment = {
      id: existing?.id ?? `asg-${Date.now()}`,
      employeeId: input.employeeId,
      divisionId: input.divisionId,
      isPrimary: input.isPrimary,
      roleInDivision: input.roleInDivision.trim() || null,
      teamLeadEmployeeId: input.teamLeadEmployeeId || null,
      allocationPercent: input.allocationPercent,
      expectedWeeklyMinutes: input.expectedWeeklyMinutes,
      startDate: input.startDate,
      endDate: input.endDate,
      isTemporary: input.isTemporary,
      isActive: input.isActive,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? actor,
      updatedAt: now,
      updatedBy: actor,
    };
    if (existing) mockStore.updateAssignment(record.id, record);
    else mockStore.addAssignment(record);

    // Exactly one primary assignment per employee (`REQ-ORG-005`).
    if (input.isPrimary) {
      for (const other of mockStore.assignments()) {
        if (other.employeeId === input.employeeId && other.id !== record.id && other.isPrimary) {
          mockStore.updateAssignment(other.id, { ...other, isPrimary: false });
        }
      }
    }
    return success(assignmentsOf(input.employeeId).map(assignmentView));
  },

  async endAssignment(userId, assignmentId, endDate) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can end a division assignment.', 'Return to your dashboard.');
    }
    const assignment = mockStore
      .assignments()
      .find((candidate) => candidate.id === assignmentId);
    if (!assignment) return notFound('Assignment not found.');
    mockStore.updateAssignment(assignmentId, {
      ...assignment,
      endDate,
      isActive: endDate > DEMO_TODAY,
      updatedAt: new Date().toISOString(),
      updatedBy: { userId, displayName: actorName(userId) },
    });
    return success(assignmentsOf(assignment.employeeId).map(assignmentView));
  },

  async getAttendance(userId, from, to) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Attendance administration is limited to HR.', 'Return to your dashboard.');
    }
    const dates = workingDatesIn(from, to);
    const rows = reviewedEmployeeIds().map((employeeId) => ({
      employee: employeeRef(employeeId),
      days: dates.map((date) => attendanceDay(employeeId, date)),
    }));
    const allDays = rows.flatMap((row) => row.days);
    const states = [...new Set(allDays.map((day) => day.state))];
    return success({
      rangeLabel: formatDateRange(from, to),
      dates,
      rows,
      stateCounts: states.map((state) => ({
        state,
        label: ATTENDANCE_LABEL[state],
        count: allDays.filter((day) => day.state === state).length,
      })),
    });
  },

  async listRequests(userId, kind) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Request administration is limited to HR.', 'Return to your dashboard.');
    }
    const rows =
      kind === 'wfh'
        ? mockStore.allWfhRequests().map((request) => requestRow(request, 'wfh', userId))
        : mockStore.allLeaveRequests().map((request) => requestRow(request, 'leave', userId));
    return success(rows);
  },

  async listDivisionRequestSummary(userId, kind) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Request administration is limited to HR.', 'Return to your dashboard.');
    }
    const rows =
      kind === 'wfh'
        ? mockStore.allWfhRequests().map((request) => requestRow(request, 'wfh', userId))
        : mockStore.allLeaveRequests().map((request) => requestRow(request, 'leave', userId));
    return success(
      Object.values(DIVISIONS)
        .map((division) => {
          const scoped = rows.filter((row) => row.division.id === division.id);
          return {
            division: divisionRef(division.id)!,
            pending: scoped.filter((row) => row.state === 'pending').length,
            approved: scoped.filter((row) => row.state === 'approved').length,
            rejected: scoped.filter((row) => row.state === 'rejected').length,
            totalDays: scoped.reduce(
              (total, row) => total + (row.portion === 'half_day' ? 0.5 : 1),
              0,
            ),
          };
        })
        .filter((summary) => summary.pending + summary.approved + summary.rejected > 0),
    );
  },

  async listLeaveBalances(userId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Leave administration is limited to HR.', 'Return to your dashboard.');
    }
    return success(
      LEAVE_BALANCES.map<HrLeaveBalanceView>((balance) => ({
        employee: employeeRef(balance.employeeId),
        leaveType: balance.leaveType,
        typeLabel: leaveTypeLabel(balance.leaveType),
        year: balance.year,
        entitledDays: balance.entitledDays,
        consumedDays: balance.consumedDays,
        reservedDays: balance.reservedDays,
        remainingDays: balance.remainingDays,
      })),
    );
  },

  async decideRequest({ userId, kind, id, outcome, comment, overrideReason }) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can decide this request here.', 'Return to your dashboard.');
    }
    const source = kind === 'wfh' ? mockStore.allWfhRequests() : mockStore.allLeaveRequests();
    const request = source.find((item) => item.id === id);
    if (!request) return notFound('Request not found.');

    const replacesDecision =
      request.decision !== null &&
      (request.decision.outcome === 'approved' || request.decision.outcome === 'rejected');

    if (replacesDecision) {
      if (!hasPermission(userId, SENSITIVE_PERMISSIONS.hrOverride)) {
        return denied(
          'Replacing an existing decision needs the HR override permission.',
          'Ask an administrator to grant hr.request.override, or leave the decision unchanged.',
        );
      }
      if (!overrideReason?.trim()) {
        return invalid(
          'overrideReason',
          'An override reason is required.',
          'Record why the previous decision is being replaced. The reason is stored in the audit history and shown to the Team Lead.',
        );
      }
    }

    const now = new Date().toISOString();
    const actor = { userId, displayName: actorName(userId) };
    const previousOutcome =
      request.decision?.outcome === 'approved' || request.decision?.outcome === 'rejected'
        ? request.decision.outcome
        : null;

    const next = {
      ...request,
      state: outcome,
      decision: {
        decidedAt: now,
        decidedBy: actor,
        outcome,
        comment: comment.trim() || null,
        override:
          replacesDecision && previousOutcome
            ? { reason: overrideReason!.trim(), previousOutcome }
            : null,
      },
      updatedAt: now,
      updatedBy: actor,
    };

    if (kind === 'wfh') mockStore.updateWfhRequest(id, next as WfhRequest);
    else mockStore.updateLeaveRequest(id, next as LeaveRequest);
    return success(requestRow(next as WfhRequest | LeaveRequest, kind, userId));
  },

  async listHolidays(userId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Holiday administration is limited to HR.', 'Return to your dashboard.');
    }
    return success(mockStore.holidays().map(holidayView));
  },

  async saveHoliday(userId, input, id) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Holiday administration is limited to HR.', 'Return to your dashboard.');
    }
    if (!input.name.trim()) {
      return invalid('name', 'Enter a holiday name.', 'Employees see this name on the calendar.');
    }
    if (input.scope === 'weekly' && !input.weekday) {
      return invalid('weekday', 'Choose the weekday.', 'A weekly holiday repeats on one weekday.');
    }
    if (input.scope !== 'weekly' && !input.date) {
      return invalid('date', 'Choose the holiday date.', 'A dated holiday needs a calendar date.');
    }
    if (input.scope === 'division' && !input.divisionId) {
      return invalid('divisionId', 'Choose the division.', 'A division holiday applies to one division.');
    }

    const now = new Date().toISOString();
    const actor = { userId, displayName: actorName(userId) };
    const existing = id ? mockStore.holidays().find((holiday) => holiday.id === id) : undefined;
    const record: Holiday = {
      id: existing?.id ?? `hol-${Date.now()}`,
      name: input.name.trim(),
      scope: input.scope,
      divisionId: input.scope === 'division' ? input.divisionId : null,
      date: input.scope === 'weekly' ? null : input.date,
      weekday: input.scope === 'weekly' ? input.weekday : null,
      isActive: existing?.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      createdBy: existing?.createdBy ?? actor,
      updatedAt: now,
      updatedBy: actor,
    };
    if (existing) mockStore.updateHoliday(record.id, record);
    else mockStore.addHoliday(record);
    return success(mockStore.holidays().map(holidayView));
  },

  async setHolidayActive(userId, id, isActive) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Holiday administration is limited to HR.', 'Return to your dashboard.');
    }
    const holiday = mockStore.holidays().find((item) => item.id === id);
    if (!holiday) return notFound('Holiday not found.');
    mockStore.updateHoliday(id, {
      ...holiday,
      isActive,
      updatedAt: new Date().toISOString(),
      updatedBy: { userId, displayName: actorName(userId) },
    });
    return success(mockStore.holidays().map(holidayView));
  },

  async listPeriods(userId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Period verification is limited to HR.', 'Return to your dashboard.');
    }
    return success(
      mockStore
        .periods()
        .map((period) => periodWorkspace(period.id, userId))
        .filter((workspace): workspace is HrPeriodWorkspaceView => workspace !== null),
    );
  },

  async getPeriod(userId, periodId) {
    await delay();
    if (!canAdminister(userId)) return notFound('Period not found.');
    const workspace = periodWorkspace(periodId, userId);
    return workspace ? success(workspace) : notFound('Period not found.');
  },

  async verifyPeriod({ userId, periodId, acknowledgedExceptions }) {
    await delay();
    if (!hasPermission(userId, SENSITIVE_PERMISSIONS.periodVerification)) {
      return denied(
        'Verifying a payroll period needs the period-verification permission.',
        'Ask an administrator to grant time.period.verify.',
      );
    }
    const period = mockStore.findPeriod(periodId);
    if (!period) return notFound('Period not found.');
    if (period.status === 'verified' || period.status === 'amended') {
      return {
        status: 'conflict' as const,
        code: 'PERIOD_LOCKED' as const,
        message: `${period.label} is already verified and locked.`,
        guidance: 'Record an amendment with a reason instead of verifying again.',
      };
    }
    const workspace = periodWorkspace(periodId, userId)!;
    if (workspace.unresolvedCorrectionCount > 0) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `${workspace.unresolvedCorrectionCount} correction request(s) are unresolved.`,
        guidance: 'Resolve every outstanding correction request before verifying the period.',
      };
    }
    if (workspace.openExceptionCount > 0 && !acknowledgedExceptions) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `${workspace.openExceptionCount} open exception(s) remain in ${period.label}.`,
        guidance: 'Confirm that the remaining exceptions are accepted before locking the period.',
      };
    }

    const now = new Date().toISOString();
    mockStore.updatePeriod(periodId, {
      ...period,
      status: 'verified',
      verifiedAt: now,
      verifiedBy: { userId, displayName: actorName(userId) },
      openExceptionCount: workspace.openExceptionCount,
      updatedAt: now,
      updatedBy: { userId, displayName: actorName(userId) },
    });
    return success(periodWorkspace(periodId, userId)!);
  },

  async requestUnlock({ userId, periodId, reason }) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can raise an unlock request here.', 'Return to your dashboard.');
    }
    if (!reason.trim()) {
      return invalid(
        'reason',
        'An unlock reason is required.',
        'Describe the record that needs changing and why the change cannot wait for the next period.',
      );
    }
    const period = mockStore.findPeriod(periodId);
    if (!period) return notFound('Period not found.');
    unlockRequests = [
      ...unlockRequests.filter((request) => request.periodId !== periodId),
      {
        periodId,
        requestedBy: actorName(userId),
        requestedAt: new Date().toISOString(),
        reason: reason.trim(),
        state: 'pending',
      },
    ];
    return success(periodWorkspace(periodId, userId)!);
  },

  async amendPeriod({ userId, periodId, employeeId, recordLabel, reason, before, after }) {
    await delay();
    if (!hasPermission(userId, SENSITIVE_PERMISSIONS.periodAmendment)) {
      return denied(
        'Amending a verified period needs the period-amendment permission.',
        'Ask an administrator to grant time.period.amend.',
      );
    }
    if (!reason.trim()) {
      return invalid(
        'reason',
        'An amendment reason is required.',
        'The reason is stored with the before and after values and cannot be edited later.',
      );
    }
    const period = mockStore.findPeriod(periodId);
    if (!period) return notFound('Period not found.');
    if (period.status !== 'verified' && period.status !== 'amended') {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `${period.label} is not verified, so it cannot be amended.`,
        guidance: 'Edit the underlying record directly while the period is open.',
      };
    }

    const now = new Date().toISOString();
    amendments = [
      ...amendments,
      {
        id: `amd-${Date.now()}`,
        periodId,
        employeeId,
        recordLabel,
        reason: reason.trim(),
        amendedAt: now,
        amendedBy: actorName(userId),
        before,
        after,
      },
    ];
    mockStore.updatePeriod(periodId, {
      ...period,
      status: 'amended',
      updatedAt: now,
      updatedBy: { userId, displayName: actorName(userId) },
    });
    return success(periodWorkspace(periodId, userId)!);
  },

  async listEvaluationPeriods(userId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Evaluation administration is limited to HR.', 'Return to your dashboard.');
    }
    return success(evaluationPeriods.map(evaluationPeriodView));
  },

  async createEvaluationPeriod(userId, input) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can create an evaluation period.', 'Return to your dashboard.');
    }
    if (!input.name.trim()) {
      return invalid('name', 'Enter a period name.', 'Employees and reviewers see this name.');
    }
    if (input.endDate < input.startDate) {
      return invalid('endDate', 'The end date cannot be before the start date.', 'Choose a later end date.');
    }
    if (input.dueDate < input.endDate) {
      return invalid(
        'dueDate',
        'The due date cannot be before the period ends.',
        'Reviewers need the full period before scoring closes.',
      );
    }
    if (input.employeeIds.length === 0) {
      return invalid('employeeIds', 'Assign at least one employee.', 'Choose the employees this period covers.');
    }

    const now = new Date().toISOString();
    const actor = { userId, displayName: actorName(userId) };
    const period: EvaluationPeriod = {
      id: `evp-${Date.now()}`,
      name: input.name.trim(),
      type: input.type,
      startDate: input.startDate,
      endDate: input.endDate,
      dueDate: input.dueDate,
      weightingVersion: EVALUATION_WEIGHTING.version,
      isOpen: true,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
    };
    evaluationPeriods = [...evaluationPeriods, period];
    evaluations = [
      ...evaluations,
      ...input.employeeIds.map<EvaluationFixture>((employeeId) => ({
        id: `eval-${period.id}-${employeeId}`,
        periodId: period.id,
        employeeId,
        reviewerEmployeeId:
          input.reviewerByEmployeeId[employeeId] ??
          employeeById(employeeId)?.teamLeadEmployeeId ??
          'emp-2001',
        state: 'not_started',
        scores: {
          task_completion: 0,
          work_quality: 0,
          timeliness: 0,
          teamwork_communication: 0,
          responsibility: 0,
          learning_initiative: 0,
        },
        comments: {
          task_completion: '',
          work_quality: '',
          timeliness: '',
          teamwork_communication: '',
          responsibility: '',
          learning_initiative: '',
        },
        reviewerSummary: '',
        selfEvaluation: null,
        publishedAt: null,
        publishedBy: null,
        reminderSentAt: null,
      })),
    ];
    return success(evaluationPeriodView(period));
  },

  async listEvaluations(userId, periodId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Evaluation administration is limited to HR.', 'Return to your dashboard.');
    }
    return success(
      evaluations
        .filter((item) => !periodId || item.periodId === periodId)
        .map(evaluationRow),
    );
  },

  async getEvaluation(userId, id) {
    await delay();
    if (!canAdminister(userId)) return notFound('Evaluation not found.');
    const fixture = evaluations.find((item) => item.id === id);
    if (!fixture) return notFound('Evaluation not found.');
    return success(evaluationDetail(fixture, userId));
  },

  async sendReminder(userId, evaluationId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can send an evaluation reminder.', 'Return to your dashboard.');
    }
    const fixture = evaluations.find((item) => item.id === evaluationId);
    if (!fixture) return notFound('Evaluation not found.');
    const next = { ...fixture, reminderSentAt: new Date().toISOString() };
    evaluations = evaluations.map((item) => (item.id === evaluationId ? next : item));
    return success(evaluationRow(next));
  },

  async publishEvaluation(userId, evaluationId) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can publish an evaluation.', 'Return to your dashboard.');
    }
    const fixture = evaluations.find((item) => item.id === evaluationId);
    if (!fixture) return notFound('Evaluation not found.');
    if (fixture.state !== 'hr_review') {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'Only an evaluation submitted for HR review can be published.',
        guidance: 'Wait for the reviewer to submit their scoring, or return the evaluation first.',
      };
    }
    const next: EvaluationFixture = {
      ...fixture,
      state: 'published',
      publishedAt: new Date().toISOString(),
      publishedBy: actorName(userId),
    };
    evaluations = evaluations.map((item) => (item.id === evaluationId ? next : item));
    return success(evaluationDetail(next, userId));
  },

  async returnEvaluation(userId, evaluationId, reason) {
    await delay();
    if (!canAdminister(userId)) {
      return denied('Only HR can return an evaluation.', 'Return to your dashboard.');
    }
    if (!reason.trim()) {
      return invalid(
        'reason',
        'Explain what the reviewer should change.',
        'The reviewer sees this note when the evaluation reopens.',
      );
    }
    const fixture = evaluations.find((item) => item.id === evaluationId);
    if (!fixture) return notFound('Evaluation not found.');
    const next: EvaluationFixture = { ...fixture, state: 'reviewer_scoring' };
    evaluations = evaluations.map((item) => (item.id === evaluationId ? next : item));
    return success(evaluationDetail(next, userId));
  },
};

/** Test seam: restores the Phase 5 demo state. */
export function resetHrState(): void {
  employees = [...EMPLOYEES];
  evaluationPeriods = [...EVALUATION_PERIODS];
  evaluations = EVALUATIONS.map((item) => ({ ...item }));
  unlockRequests = [...UNLOCK_REQUESTS];
  amendments = [...PERIOD_AMENDMENTS];
}

export type { Result };
