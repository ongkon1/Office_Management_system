/**
 * Mock timesheet service.
 *
 * Implements the `TimesheetService` contract. It calls the same calculation
 * engine the preview uses, so a saved day and its preview cannot disagree
 * (`REQ-NFR-OPS-003`).
 */

import type {
  DailySummary,
  IsoDate,
  Task,
  TimeEntry,
} from '@/contracts/domain';
import { taskAcceptsTime } from '@/contracts/domain';
import { canTransition, transitionRequiresNote } from '@/contracts/task-transition';
import type { TaskStatusTransition } from '@/contracts/task-transition';
import type {
  WorkLog,
  WorkLogInput,
  WorkLogRevision,
  WorkLogUpdateInput,
} from '@/contracts/work-log';
import type { DateRange, ListQuery, Paginated } from '@/contracts/query';
import { success, type Result } from '@/contracts/results';
import type { TimeEntryInput, TimesheetService } from '@/contracts/services';
import type {
  BreakView,
  EntryCalculationPreview,
  TimeEntryView,
  TimesheetDayView,
  TimesheetMonthView,
  TimesheetWeekView,
} from '@/contracts/view-models';
import { calculateDay, aggregateSummaries } from '@/lib/calculation/engine';
import {
  validateEntry,
  validateWorkLog,
  draftMinutes,
  type EntryDraft,
} from '@/lib/calculation/validation';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateWithWeekday,
  formatDurationDelta,
  formatTimeRange,
} from '@/lib/format';
import {
  TASK_STATUS_LABEL,
  toDayStatusView,
  toDurationView,
  WORK_LOCATION_LABEL,
} from '@/lib/status';
import { toClientContributions } from '@/lib/client-time';
import {
  PROJECTS,
  STANDARD_POLICY,
  DEMO_TODAY,
} from '@/fixtures';
import { DEMO_ACCOUNTS, DIVISIONS } from './accounts';
import { mockStore } from './store';
import { effectiveDivisionIds, projectById } from './organization';
import { addMockNotification, notifyEmployee } from './notification-store';

const LATENCY_MS = 220;

function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function holidayOn(date: IsoDate, divisionIds: readonly string[]): string | null {
  const match = mockStore.holidays().find(
    (holiday) =>
      holiday.isActive &&
      holiday.date === date &&
      (holiday.scope === 'company' ||
        (holiday.divisionId !== null && divisionIds.includes(holiday.divisionId))),
  );
  return match?.name ?? null;
}

/** Builds the authoritative summary for one employee-day. */
export function summaryFor(employeeId: string, workDate: IsoDate): DailySummary {
  const entries = mockStore
    .entriesFor(employeeId, workDate)
    .filter((entry) => entry.state !== 'draft');

  const divisions = effectiveDivisionIds(employeeId, workDate);
  const leave = mockStore.approvedLeaveOn(employeeId, workDate);
  const wfh = mockStore.approvedWfhOn(employeeId, workDate);
  const reason = mockStore.dayReason(employeeId, workDate);

  return calculateDay({
    employeeId,
    workDate,
    entries,
    policy: STANDARD_POLICY,
    breakOverrideMinutes: mockStore.breakOverride(employeeId, workDate),
    leave: leave ? { portion: leave.portion, leaveType: leave.leaveType } : null,
    holidayName: holidayOn(workDate, divisions),
    overtimeReason: reason.overtimeReason ?? null,
    criticalExplanation: reason.criticalExplanation ?? null,
    isLocked: mockStore.isDateLocked(workDate),
    approvedWfh: Boolean(wfh),
  });
}

function divisionRef(divisionId: string) {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division
    ? { id: division.id, name: division.name, code: division.code, isRestricted: division.isRestricted }
    : { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

function projectRef(projectId: string | null) {
  if (!projectId) return null;
  const project = PROJECTS.find((item) => item.id === projectId);
  return project
    ? { id: project.id, name: project.name, code: project.code, divisionId: project.divisionId }
    : null;
}

function taskRef(taskId: string | null) {
  if (!taskId) return null;
  const task = mockStore.findTask(taskId);
  return task
    ? { id: task.id, title: task.title, projectId: task.projectId, status: task.status }
    : null;
}

function toEntryView(entry: TimeEntry, locked: boolean): TimeEntryView {
  const isHistoricalClockEntry = Boolean(entry.startTime && entry.endTime);
  return {
    id: entry.id,
    recordKind: isHistoricalClockEntry ? 'historical_clock_entry' : 'work_log',
    division: divisionRef(entry.divisionId),
    project: projectRef(entry.projectId),
    task: taskRef(entry.taskId),
    timeRangeLabel:
      entry.startTime && entry.endTime
        ? formatTimeRange(entry.startTime, entry.endTime, STANDARD_POLICY.businessTimezone)
        : null,
    duration: toDurationView(entry.activeMinutes),
    workLocation: entry.workLocation,
    workLocationLabel: WORK_LOCATION_LABEL[entry.workLocation],
    workDescription: entry.workDescription,
    completedWork: entry.completedWork,
    attachmentCount: entry.attachmentIds === 'restricted' ? 'restricted' : entry.attachmentIds.length,
    supportingLink: entry.supportingLink,
    isDraft: entry.state === 'draft',
    canEdit: !locked && !isHistoricalClockEntry,
    canDelete: !locked && !isHistoricalClockEntry,
  };
}

function contributionViews(summary: DailySummary) {
  const total = summary.activeMinutes || 1;
  return summary.divisionContributions.map((contribution) => ({
    division: divisionRef(contribution.divisionId),
    active: toDurationView(contribution.activeMinutes),
    sharePercent: Math.round((contribution.activeMinutes / total) * 100),
  }));
}

function toTodaySummary(summary: DailySummary) {
  const progress =
    summary.requiredTotalMinutes > 0
      ? Math.min(100, Math.round((summary.totalMinutes / summary.requiredTotalMinutes) * 100))
      : summary.totalMinutes > 0
        ? 100
        : 0;

  return {
    date: summary.workDate,
    dateLabel: formatDateWithWeekday(summary.workDate),
    active: toDurationView(summary.activeMinutes),
    break: toDurationView(summary.breakMinutes),
    total: toDurationView(summary.totalMinutes),
    requiredActive: toDurationView(summary.requiredActiveMinutes),
    remainingActive: toDurationView(summary.remainingActiveMinutes),
    scheduleProgressPercent: progress,
    status: toDayStatusView(summary.status),
    attendance: summary.attendance,
    isLocked: summary.isLocked,
    overtimeReason: summary.overtimeReason,
    criticalExplanation: summary.criticalExplanation,
  };
}

function toBreakView(summary: DailySummary, canOverride: boolean): BreakView {
  const override = mockStore.breakOverride(summary.employeeId, summary.workDate);
  return {
    duration: toDurationView(summary.breakMinutes),
    isOverridden: override !== null,
    overrideReason: null,
    canOverride,
  };
}

function exemptionLabel(summary: DailySummary): { kind: string; label: string } | null {
  switch (summary.exemption) {
    case 'holiday':
      return { kind: 'holiday', label: 'Company holiday' };
    case 'full_day_leave':
      return { kind: 'leave', label: 'Approved full-day leave' };
    case 'weekly_off':
      return { kind: 'weekly_off', label: 'Weekly off' };
    default:
      return null;
  }
}

export function buildDayView(employeeId: string, date: IsoDate): TimesheetDayView {
  const summary = summaryFor(employeeId, date);
  const entries = mockStore
    .entriesFor(employeeId, date)
    .sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));

  const remarks = mockStore
    .remarksFor(employeeId)
    .filter(
      (remark) =>
        remark.relatedRecord.type === 'timesheet' && remark.relatedRecord.workDate === date,
    );

  return {
    date,
    dateLabel: formatDateWithWeekday(date),
    summary: toTodaySummary(summary),
    entries: entries.map((entry) => toEntryView(entry, summary.isLocked)),
    breakEntry: toBreakView(summary, false),
    divisionContributions: contributionViews(summary),
    remarks: remarks.map((remark) => {
      const workLogId = remark.relatedRecord.type === 'timesheet'
        ? remark.relatedRecord.workLogId
        : undefined;
      return {
      id: remark.id,
      author: {
        id: remark.authorEmployeeId,
        fullName: remark.createdBy.displayName,
        employeeCode: remark.authorEmployeeId,
        avatarUrl: null,
        designation: null,
      },
      employee: {
        id: remark.employeeId,
        fullName: remark.employeeId,
        employeeCode: remark.employeeId,
        avatarUrl: null,
        designation: null,
      },
      message: remark.message,
      createdAtLabel: formatDate(remark.createdAt.slice(0, 10)),
      state: remark.state,
      stateLabel: remark.state,
      isCorrectionRequest: remark.isCorrectionRequest,
      relatedLabel: workLogId
        ? `Work log · ${formatDate(date)}`
        : `Timesheet · ${formatDate(date)}`,
      relatedHref: workLogId
        ? `/timesheets/${date}?workLog=${workLogId}`
        : `/timesheets/${date}`,
      responseCount: remark.responses.length,
      href: `/remarks/${remark.id}`,
    };
    }),
    exemption: exemptionLabel(summary),
    canAddEntry: !summary.isLocked,
    lockedReason: summary.isLocked
      ? 'This period has been verified by HR. Ordinary edits are not allowed; request an amendment instead.'
      : null,
    policyVersion: summary.policyVersion,
    timezone: summary.timezone,
  };
}

function rangeSummaries(
  employeeId: string,
  from: IsoDate,
  to: IsoDate,
): DailySummary[] {
  const summaries: DailySummary[] = [];
  const span = daysBetween(from, to);
  for (let offset = 0; offset <= span; offset += 1) {
    summaries.push(summaryFor(employeeId, addDays(from, offset)));
  }
  return summaries;
}

/** Project id to the client it is delivered for; `null` when none is recorded. */
const PROJECT_CLIENT = new Map<string, string | null>(
  PROJECTS.map((project) => [project.id, project.client]),
);

/**
 * The client split for one day.
 *
 * Reads the minutes the calculation engine already assigned to each project and
 * regroups them; it never recomputes a duration. Time on a project with no
 * client, and time on no project at all, both land in the unattributed bucket
 * so the split still sums to the day's active total.
 */
function clientContributionViews(summary: DailySummary) {
  return toClientContributions(
    summary.activeMinutes,
    summary.projectContributions.map((contribution) => ({
      clientId: PROJECT_CLIENT.get(contribution.projectId) ?? null,
      activeMinutes: contribution.activeMinutes,
    })),
  );
}

function toRowView(summary: DailySummary) {
  return {
    date: summary.workDate,
    dateLabel: formatDate(summary.workDate),
    weekdayLabel: formatDateWithWeekday(summary.workDate).slice(0, 3),
    active: toDurationView(summary.activeMinutes),
    break: toDurationView(summary.breakMinutes),
    total: toDurationView(summary.totalMinutes),
    requiredActive: toDurationView(summary.requiredActiveMinutes),
    status: toDayStatusView(summary.status),
    isRequiredWorkingDay: summary.isRequiredWorkingDay,
    attendance: summary.attendance,
    attendanceLabel: summary.attendance,
    divisionIds: summary.divisionContributions.map(
      (contribution) => contribution.divisionId,
    ),
    divisionCodes: summary.divisionContributions.map(
      (contribution) => divisionRef(contribution.divisionId).code,
    ),
    clientContributions: clientContributionViews(summary),
    isLocked: summary.isLocked,
    href: `/timesheets/${summary.workDate}`,
  };
}

function toPeriodTotals(label: string, summaries: readonly DailySummary[]) {
  const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
  return {
    label,
    active: toDurationView(totals.activeMinutes),
    break: toDurationView(totals.breakMinutes),
    total: toDurationView(totals.totalMinutes),
    overtime: toDurationView(totals.overtimeMinutes),
    requiredActive: toDurationView(totals.requiredActiveMinutes),
    completeDayCount: totals.completeDayCount,
    underTimeDayCount: totals.underTimeDayCount,
    overtimeDayCount: totals.overtimeDayCount,
    criticalDayCount: totals.criticalDayCount,
    missingDayCount: totals.missingDayCount,
  };
}

/** Monday of the week containing `date`. */
export function weekStart(date: IsoDate): IsoDate {
  const parts = date.split('-').map(Number);
  const jsDay = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay();
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  return addDays(date, 1 - isoWeekday);
}

function monthBounds(month: string): { from: IsoDate; to: IsoDate } {
  const [year, monthIndex] = month.split('-').map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return { from, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function draftFromInput(input: TimeEntryInput, id?: string): EntryDraft {
  return {
    id,
    employeeId: input.employeeId,
    workDate: input.workDate,
    divisionId: input.divisionId,
    projectId: input.projectId,
    taskId: input.taskId,
    entryMethod: input.entryMethod,
    workLocation: input.workLocation,
    startTime: input.startTime,
    endTime: input.endTime,
    activeMinutes: input.activeMinutes,
    workDescription: input.workDescription,
    completedWork: input.completedWork,
    overtimeReason: input.overtimeReason,
    criticalExplanation: input.criticalExplanation,
  };
}

function validationContext(input: TimeEntryInput, excludeId?: string) {
  const existing = mockStore
    .entriesFor(input.employeeId, input.workDate)
    .filter((entry) => entry.id !== excludeId && entry.state !== 'draft');

  const divisions = effectiveDivisionIds(input.employeeId, input.workDate);
  const leave = mockStore.approvedLeaveOn(input.employeeId, input.workDate);

  return {
    policy: STANDARD_POLICY,
    existingEntries: existing,
    effectiveDivisionIds: divisions,
    projects: PROJECTS,
    tasks: mockStore.tasks(),
    leave: leave ? { portion: leave.portion, leaveType: leave.leaveType } : null,
    holidayName: holidayOn(input.workDate, divisions),
    isPeriodLocked: mockStore.isDateLocked(input.workDate),
    breakOverrideMinutes: mockStore.breakOverride(input.employeeId, input.workDate),
  };
}

let idCounter = 9000;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function toStoredEntry(input: TimeEntryInput, id: string): TimeEntry {
  const minutes = draftMinutes(draftFromInput(input, id));
  const actor = { userId: 'usr-mock', displayName: 'You' };
  const stamp = new Date().toISOString();

  return {
    id,
    employeeId: input.employeeId,
    workDate: input.workDate,
    divisionId: input.divisionId,
    projectId: input.projectId,
    taskId: input.taskId,
    entryMethod: input.entryMethod,
    workLocation: input.workLocation,
    startTime: input.startTime ? `${input.workDate}T${input.startTime}:00+06:00` : null,
    endTime: input.endTime ? `${input.workDate}T${input.endTime}:00+06:00` : null,
    activeMinutes: minutes,
    workDescription: input.workDescription,
    completedWork: input.completedWork,
    supportingLink: input.supportingLink,
    attachmentIds: input.attachmentIds,
    state: 'saved',
    crossMidnightGroupId: null,
    policyVersion: STANDARD_POLICY.version,
    createdAt: stamp,
    createdBy: actor,
    updatedAt: stamp,
    updatedBy: actor,
  };
}

/** Idempotency keys already applied, so a retry cannot duplicate time. */
const appliedKeys = new Map<string, string>();
const workLogMetadata = new Map<string, Pick<WorkLogInput, 'source' | 'idempotencyKey'>>();
const workLogRevisions: WorkLogRevision[] = [];
const SEEDED_TASK_TRANSITIONS: readonly TaskStatusTransition[] = [
  {
    id: 'trn-seed-1', taskId: 'tsk-14', fromStatus: 'pending', toStatus: 'in_progress',
    actor: { userId: 'usr-1001', displayName: 'Nadia Rahman' }, actorRole: 'employee',
    changedAt: '2026-08-21T09:00:00+06:00', note: 'Started the variance demonstration.', idempotencyKey: 'seed:tsk-14:start',
  },
  {
    id: 'trn-seed-2', taskId: 'tsk-14', fromStatus: 'in_progress', toStatus: 'completed',
    actor: { userId: 'usr-1001', displayName: 'Nadia Rahman' }, actorRole: 'employee',
    changedAt: '2026-08-21T17:00:00+06:00', note: 'Completed with 1:15 more actual work than estimated.', idempotencyKey: 'seed:tsk-14:complete',
  },
  {
    id: 'trn-seed-3', taskId: 'tsk-6', fromStatus: 'pending', toStatus: 'in_progress',
    actor: { userId: 'usr-1001', displayName: 'Nadia Rahman' }, actorRole: 'employee',
    changedAt: '2026-08-20T09:00:00+06:00', note: 'Started accessibility review.', idempotencyKey: 'seed:tsk-6:start',
  },
  {
    id: 'trn-seed-4', taskId: 'tsk-6', fromStatus: 'in_progress', toStatus: 'completed',
    actor: { userId: 'usr-1001', displayName: 'Nadia Rahman' }, actorRole: 'employee',
    changedAt: '2026-08-25T17:00:00+06:00', note: 'Initial audit completed.', idempotencyKey: 'seed:tsk-6:complete',
  },
  {
    id: 'trn-seed-5', taskId: 'tsk-6', fromStatus: 'completed', toStatus: 'in_progress',
    actor: { userId: 'usr-1001', displayName: 'Nadia Rahman' }, actorRole: 'employee',
    changedAt: '2026-08-26T09:30:00+06:00', note: 'Reopened to verify three remediated issues.', idempotencyKey: 'seed:tsk-6:reopen',
  },
];
const taskTransitions: TaskStatusTransition[] = [...SEEDED_TASK_TRANSITIONS];
const transitionKeys = new Map<string, string>();

/** Test/demo reset for the append-only in-memory workflow adapter. */
export function resetTaskWorkflowState(): void {
  workLogRevisions.splice(0, workLogRevisions.length);
  taskTransitions.splice(0, taskTransitions.length, ...SEEDED_TASK_TRANSITIONS);
  transitionKeys.clear();
}

function lockedPeriodConflict(workDate: string, action: 'save' | 'edit' | 'delete') {
  const period = mockStore.periods().find(
    (item) =>
      (item.status === 'verified' || item.status === 'amended') &&
      workDate >= item.startDate &&
      workDate <= item.endDate,
  );
  const actionGuidance =
    action === 'save'
      ? 'Request an amendment with a reason instead of saving work directly.'
      : action === 'edit'
        ? 'Request an amendment with a reason instead of editing directly.'
        : 'Request an amendment with a reason instead of deleting.';

  return {
    status: 'conflict' as const,
    code: 'PERIOD_LOCKED' as const,
    message: 'This period has been verified and is locked.',
    guidance: actionGuidance,
    ...(period
      ? {
          lockedPeriod: {
            periodId: period.id,
            label: period.label,
            verifiedAt: period.verifiedAt ?? period.updatedAt,
            amendmentPathAvailable: true,
          },
        }
      : {}),
  };
}

/** Temporary concrete-method compatibility for the pre-F3 screens. */
interface LegacyTimesheetCompatibility {
  listEntries(query: ListQuery): Promise<Result<Paginated<TimeEntry>>>;
  createEntry(input: TimeEntryInput & { readonly idempotencyKey: string }): Promise<Result<TimeEntry>>;
  updateEntry(id: string, input: TimeEntryInput & { readonly expectedVersion?: number }): Promise<Result<TimeEntry>>;
  deleteEntry(id: string): Promise<Result<void>>;
  copyEntry(input: { readonly sourceEntryId: string; readonly targetDate: IsoDate }): Promise<Result<TimeEntryInput>>;
  previewCalculation(input: TimeEntryInput): Promise<Result<EntryCalculationPreview>>;
}

function entryAsWorkLog(entry: TimeEntry): WorkLog | null {
  if (!entry.projectId || !entry.taskId || entry.startTime || entry.endTime) return null;
  const metadata = workLogMetadata.get(entry.id);
  return {
    id: entry.id,
    version: entry.version,
    employeeId: entry.employeeId,
    workDate: entry.workDate,
    divisionId: entry.divisionId,
    projectId: entry.projectId,
    taskId: entry.taskId,
    durationMinutes: entry.activeMinutes,
    workLocation: entry.workLocation,
    workDescription: entry.workDescription,
    completedWork: entry.completedWork,
    supportingLink: entry.supportingLink,
    attachmentIds: entry.attachmentIds === 'restricted' ? [] : entry.attachmentIds,
    overtimeReason: mockStore.dayReason(entry.employeeId, entry.workDate).overtimeReason ?? null,
    criticalExplanation: mockStore.dayReason(entry.employeeId, entry.workDate).criticalExplanation ?? null,
    source: metadata?.source ?? (entry.entryMethod === 'imported' ? 'imported' : 'migrated_clock_entry'),
    idempotencyKey: metadata?.idempotencyKey ?? `legacy:${entry.id}`,
    state: entry.state,
    policyVersion: entry.policyVersion,
    createdAt: entry.createdAt,
    createdBy: entry.createdBy,
    updatedAt: entry.updatedAt,
    updatedBy: entry.updatedBy,
  };
}

function workLogValidationContext(input: WorkLogInput, excludeWorkLogId?: string) {
  const dayEntries = mockStore.entriesFor(input.employeeId, input.workDate);
  const divisions = effectiveDivisionIds(input.employeeId, input.workDate);
  const leave = mockStore.approvedLeaveOn(input.employeeId, input.workDate);
  return {
    policy: STANDARD_POLICY,
    existingWorkLogs: dayEntries
      .map(entryAsWorkLog)
      .filter((item): item is WorkLog => item !== null),
    historicalEntries: dayEntries.filter((entry) => Boolean(entry.startTime && entry.endTime)),
    effectiveDivisionIds: divisions,
    projects: PROJECTS,
    tasks: mockStore.tasks(),
    leave: leave ? { portion: leave.portion, leaveType: leave.leaveType } : null,
    holidayName: holidayOn(input.workDate, divisions),
    isPeriodLocked: mockStore.isDateLocked(input.workDate),
    breakOverrideMinutes: mockStore.breakOverride(input.employeeId, input.workDate),
    excludeWorkLogId,
  };
}

function toStoredWorkLogEntry(input: WorkLogInput, id: string): TimeEntry {
  const actor = { userId: 'usr-mock', displayName: 'You' };
  const stamp = new Date().toISOString();
  return {
    id,
    employeeId: input.employeeId,
    workDate: input.workDate,
    divisionId: input.divisionId,
    projectId: input.projectId,
    taskId: input.taskId,
    entryMethod: input.source === 'imported' ? 'imported' : 'manual_duration',
    workLocation: input.workLocation,
    startTime: null,
    endTime: null,
    activeMinutes: input.durationMinutes,
    workDescription: input.workDescription,
    completedWork: input.completedWork,
    supportingLink: input.supportingLink,
    attachmentIds: input.attachmentIds,
    state: 'saved',
    crossMidnightGroupId: null,
    policyVersion: STANDARD_POLICY.version,
    createdAt: stamp,
    createdBy: actor,
    updatedAt: stamp,
    updatedBy: actor,
  };
}

const mockTimesheetServiceImpl = {
  async getDay({ employeeId, date }) {
    await delay();
    return success(buildDayView(employeeId, date));
  },

  async getWeek({ employeeId, weekStartDate }) {
    await delay();
    const to = addDays(weekStartDate, 6);
    const summaries = rangeSummaries(employeeId, weekStartDate, to);
    const view: TimesheetWeekView = {
      weekStartDate,
      label: `${formatDate(weekStartDate)} – ${formatDate(to)}`,
      days: summaries.map(toRowView),
      totals: toPeriodTotals('This week', summaries),
    };
    return success(view);
  },

  async getMonth({ employeeId, month }) {
    await delay();
    const { from, to } = monthBounds(month);
    const summaries = rangeSummaries(employeeId, from, to);
    const view: TimesheetMonthView = {
      month,
      label: month,
      days: summaries.map(toRowView),
      totals: toPeriodTotals(month, summaries),
      isVerified: mockStore.isDateLocked(from),
    };
    return success(view);
  },

  async listWorkLogs(query) {
    await delay();
    const employeeId = query.filters?.employeeIds?.[0];
    const range = query.filters?.dateRange;
    const entries =
      employeeId && range
        ? mockStore.entriesBetween(employeeId, range.from, range.to)
        : [...mockStore.allEntries()];
    const items = entries
      .map(entryAsWorkLog)
      .filter((item): item is WorkLog => item !== null);
    return success({
      items,
      pageInfo: {
        page: 1,
        pageSize: items.length || 1,
        totalItems: items.length,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
  },

  async listEntries(query) {
    await delay();
    const employeeId = query.filters?.employeeIds?.[0];
    const range = query.filters?.dateRange;
    const items =
      employeeId && range
        ? mockStore.entriesBetween(employeeId, range.from, range.to)
        : [...mockStore.allEntries()];

    return success({
      items,
      pageInfo: {
        page: 1,
        pageSize: items.length || 1,
        totalItems: items.length,
        totalPages: 1,
        hasPreviousPage: false,
        hasNextPage: false,
      },
    });
  },

  async getDailySummaries({ employeeId, range }) {
    await delay();
    return success(rangeSummaries(employeeId, range.from, range.to));
  },

  async createWorkLog(input: WorkLogInput) {
    await delay();
    const previousId = appliedKeys.get(input.idempotencyKey);
    if (previousId) {
      const previous = mockStore.findEntry(previousId);
      const workLog = previous ? entryAsWorkLog(previous) : null;
      if (workLog) return success(workLog);
    }

    if (mockStore.isDateLocked(input.workDate)) {
      return lockedPeriodConflict(input.workDate, 'save');
    }

    const beforeStatus = summaryFor(input.employeeId, input.workDate).status;
    const errors = validateWorkLog(input, workLogValidationContext(input));
    if (errors.length) {
      return {
        status: 'validation_failure' as const,
        code: 'VALIDATION_FAILED' as const,
        message: errors.length === 1 ? 'This work log cannot be saved yet.' : `${errors.length} fields need attention.`,
        fieldErrors: errors,
        focusField: errors[0].field,
      };
    }

    const id = nextId('wl');
    const entry = toStoredWorkLogEntry(input, id);
    mockStore.addEntry(entry);
    workLogMetadata.set(id, { source: input.source, idempotencyKey: input.idempotencyKey });
    appliedKeys.set(input.idempotencyKey, id);
    if (input.overtimeReason || input.criticalExplanation) {
      mockStore.setDayReason(input.employeeId, input.workDate, {
        overtimeReason: input.overtimeReason ?? undefined,
        criticalExplanation: input.criticalExplanation ?? undefined,
      });
    }
    const afterStatus = summaryFor(input.employeeId, input.workDate).status;
    if ((afterStatus === 'overtime' || afterStatus === 'critical') && afterStatus !== beforeStatus) {
      const recipients = DEMO_ACCOUNTS.filter(
        (account) => account.primaryRole === 'hr_manager' ||
          (account.primaryRole === 'team_lead' && account.scopedEmployeeIds.includes(input.employeeId)),
      );
      for (const recipient of recipients) {
        addMockNotification({
          recipientUserId: recipient.userId,
          type: afterStatus === 'critical' ? 'critical_time' : 'overtime',
          title: afterStatus === 'critical' ? 'Critical daily total recorded' : 'Overtime daily total recorded',
          body: `A daily total on ${formatDate(input.workDate)} needs review. Open the timesheet for authorized details.`,
          href: `/team/timesheets/${input.employeeId}/${input.workDate}`,
          relatedLabel: `Timesheet, ${formatDate(input.workDate)}`,
        });
      }
    }
    return success(entryAsWorkLog(entry)!);
  },

  async getWorkLog(id: string) {
    await delay();
    const entry = mockStore.findEntry(id);
    const workLog = entry ? entryAsWorkLog(entry) : null;
    return workLog
      ? success(workLog)
      : { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That work log no longer exists.' };
  },

  async getWorkLogHistory(id: string) {
    await delay();
    const entry = mockStore.findEntry(id);
    if (!entry || !entryAsWorkLog(entry)) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That work log no longer exists.' };
    }
    return success(
      workLogRevisions
        .filter((revision) => revision.workLogId === id)
        .sort((a, b) => b.changedAt.localeCompare(a.changedAt)),
    );
  },

  async updateWorkLog(id: string, input: WorkLogUpdateInput) {
    await delay();
    const existingEntry = mockStore.findEntry(id);
    const existing = existingEntry ? entryAsWorkLog(existingEntry) : null;
    if (!existing || !existingEntry) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That work log no longer exists.' };
    }
    if (mockStore.isDateLocked(existing.workDate)) {
      return lockedPeriodConflict(existing.workDate, 'edit');
    }
    if (
      existing.version !== undefined &&
      input.expectedVersion !== existing.version
    ) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'This work log changed after you opened it.',
        guidance: 'Reload it and apply your changes to the latest version.',
      };
    }
    if (!input.changeReason.trim()) {
      return {
        status: 'validation_failure' as const,
        code: 'VALIDATION_FAILED' as const,
        message: 'A reason is required to change this work log.',
        fieldErrors: [{
          field: 'changeReason',
          code: 'CHANGE_REASON_REQUIRED',
          message: 'Enter a reason for this change.',
          guidance: 'Explain what was corrected so the audit history remains understandable.',
        }],
        focusField: 'changeReason',
      };
    }
    const errors = validateWorkLog(input, workLogValidationContext(input, id));
    if (errors.length) {
      return {
        status: 'validation_failure' as const,
        code: 'VALIDATION_FAILED' as const,
        message: errors.length === 1 ? 'This work log cannot be saved yet.' : `${errors.length} fields need attention.`,
        fieldErrors: errors,
        focusField: errors[0].field,
      };
    }
    const nextEntry: TimeEntry = {
      ...toStoredWorkLogEntry(input, id),
      version: (existing.version ?? 0) + 1,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    };
    mockStore.updateEntry(id, nextEntry);
    workLogMetadata.set(id, { source: input.source, idempotencyKey: input.idempotencyKey });
    if (input.overtimeReason || input.criticalExplanation) {
      mockStore.setDayReason(input.employeeId, input.workDate, {
        overtimeReason: input.overtimeReason ?? undefined,
        criticalExplanation: input.criticalExplanation ?? undefined,
      });
    }
    const updated = entryAsWorkLog(nextEntry)!;
    workLogRevisions.push({
      id: nextId('wlr'),
      workLogId: id,
      version: updated.version ?? 1,
      reason: input.changeReason.trim(),
      changedAt: updated.updatedAt,
      changedBy: updated.updatedBy,
      before: existing,
      after: updated,
    });
    return success(updated);
  },

  async deleteWorkLog(id: string) {
    await delay();
    const entry = mockStore.findEntry(id);
    if (!entry || !entryAsWorkLog(entry)) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That work log no longer exists.' };
    }
    if (mockStore.isDateLocked(entry.workDate)) {
      return lockedPeriodConflict(entry.workDate, 'delete');
    }
    mockStore.removeEntry(id);
    workLogMetadata.delete(id);
    return success(undefined);
  },

  async copyWorkLog({ sourceWorkLogId, targetDate }: { sourceWorkLogId: string; targetDate: IsoDate }) {
    await delay();
    const entry = mockStore.findEntry(sourceWorkLogId);
    const source = entry ? entryAsWorkLog(entry) : null;
    if (!source) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That work log no longer exists.' };
    }
    const draft: Omit<WorkLogInput, 'idempotencyKey'> = {
      employeeId: source.employeeId,
      workDate: targetDate,
      divisionId: source.divisionId,
      projectId: source.projectId,
      taskId: source.taskId,
      durationMinutes: source.durationMinutes,
      workLocation: source.workLocation,
      workDescription: source.workDescription,
      completedWork: '',
      supportingLink: null,
      attachmentIds: [],
      // Day-specific evidence and reasons never carry to another date. The
      // target-day preview and validation ask for them again when required.
      overtimeReason: null,
      criticalExplanation: null,
      source: 'manual',
    };
    return success(draft);
  },

  async previewWorkLog(
    input: WorkLogInput,
    options?: { readonly excludeWorkLogId?: string },
  ) {
    await delay(80);
    const context = workLogValidationContext(input, options?.excludeWorkLogId);
    const actor = { userId: 'preview', displayName: 'Preview' };
    const stamp = `${input.workDate}T00:00:00+06:00`;
    const candidate: WorkLog = {
      ...input,
      id: 'preview',
      state: 'saved',
      policyVersion: STANDARD_POLICY.version,
      createdAt: stamp,
      createdBy: actor,
      updatedAt: stamp,
      updatedBy: actor,
    };
    const projected = calculateDay({
      employeeId: input.employeeId,
      workDate: input.workDate,
      workLogs: [
        ...context.existingWorkLogs.filter(
          (item) => item.state !== 'draft' && item.id !== options?.excludeWorkLogId,
        ),
        candidate,
      ],
      historicalEntries: context.historicalEntries,
      policy: STANDARD_POLICY,
      breakOverrideMinutes: context.breakOverrideMinutes,
      leave: context.leave,
      holidayName: context.holidayName,
    });
    return success({
      entryDuration: toDurationView(input.durationMinutes),
      taskDayActive: toDurationView(
        context.existingWorkLogs
          .filter(
            (item) =>
              item.state !== 'draft' &&
              item.id !== options?.excludeWorkLogId &&
              item.taskId === input.taskId,
          )
          .reduce((sum, item) => sum + item.durationMinutes, input.durationMinutes) +
          context.historicalEntries
            .filter((item) => item.state !== 'draft' && item.taskId === input.taskId)
            .reduce((sum, item) => sum + item.activeMinutes, 0),
      ),
      dayActive: toDurationView(projected.activeMinutes),
      dayBreak: toDurationView(projected.breakMinutes),
      dayTotal: toDurationView(projected.totalMinutes),
      remainingActive: toDurationView(projected.remainingActiveMinutes),
      resultingStatus: toDayStatusView(projected.status),
      requiresOvertimeReason: projected.totalMinutes > STANDARD_POLICY.overtimeThresholdMinutes,
      requiresCriticalExplanation: projected.totalMinutes > STANDARD_POLICY.criticalThresholdMinutes,
    });
  },

  async transitionTask(input) {
    await delay();
    const replayId = transitionKeys.get(input.idempotencyKey);
    if (replayId) {
      const replay = taskTransitions.find((item) => item.id === replayId);
      if (
        replay &&
        replay.taskId === input.taskId &&
        replay.fromStatus === input.fromStatus &&
        replay.toStatus === input.toStatus
      ) {
        return success(replay);
      }
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'That retry key was already used for a different task move.',
        guidance: 'Reload the board and start the intended move again.',
      };
    }
    const task = mockStore.findTask(input.taskId);
    if (!task) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That task was not found.' };
    }
    if (task.status !== input.fromStatus) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `This task is already ${TASK_STATUS_LABEL[task.status]}.`,
        guidance: 'Reload the task and choose an action available for its current status.',
      };
    }
    if (!canTransition(input.fromStatus, input.toStatus, input.actorRole)) {
      return {
        status: 'permission_denied' as const,
        code: 'FORBIDDEN' as const,
        message: 'You cannot make that task move.',
        guidance: 'Choose an action available for your role, or ask the assigned Team Lead.',
      };
    }
    if (
      input.fromStatus === 'pending' &&
      input.toStatus === 'in_progress' &&
      !taskAcceptsTime({ ...task, status: 'in_progress' })
    ) {
      return {
        status: 'validation_failure' as const,
        code: 'VALIDATION_FAILED' as const,
        message: 'This task cannot be started yet.',
        fieldErrors: [{
          field: 'taskId',
          code: task.reviewState === 'rejected' ? 'TASK_REVIEW_REJECTED' : 'TASK_AWAITING_REVIEW',
          message: 'The employee-raised task has not been approved.',
          guidance: 'Wait for Team Lead review before starting this task.',
        }],
        focusField: 'taskId',
      };
    }
    if (transitionRequiresNote(input.fromStatus, input.toStatus) && !input.note?.trim()) {
      return {
        status: 'validation_failure' as const,
        code: 'VALIDATION_FAILED' as const,
        message: 'A reason is required for this task move.',
        fieldErrors: [{ field: 'note', code: 'TRANSITION_NOTE_REQUIRED', message: 'A reason is required.', guidance: 'Explain why this task is being reopened or completed directly.' }],
        focusField: 'note',
      };
    }
    const stamp = new Date().toISOString();
    if (
      input.fromStatus === 'completed' &&
      input.toStatus === 'in_progress' &&
      !taskTransitions.some((item) => item.taskId === task.id && item.toStatus === 'completed')
    ) {
      taskTransitions.push({
        id: nextId('trn'),
        taskId: task.id,
        fromStatus: 'in_progress',
        toStatus: 'completed',
        actor: task.updatedBy,
        actorRole: 'team_lead',
        changedAt: task.updatedAt,
        note: 'Historical completion preserved at task-based cutover.',
        idempotencyKey: `historical-completion:${task.id}`,
      });
    }
    const transition: TaskStatusTransition = {
      id: nextId('trn'),
      taskId: task.id,
      fromStatus: input.fromStatus,
      toStatus: input.toStatus,
      actor: { userId: 'usr-mock', displayName: 'You' },
      actorRole: input.actorRole,
      changedAt: stamp,
      note: input.note?.trim() || null,
      idempotencyKey: input.idempotencyKey,
    };
    taskTransitions.push(transition);
    transitionKeys.set(input.idempotencyKey, transition.id);
    mockStore.updateTask(task.id, {
      ...task,
      status: input.toStatus,
      completedDate: input.toStatus === 'completed' ? DEMO_TODAY : null,
      updatedAt: stamp,
      updatedBy: transition.actor,
    } as Task & typeof task);
    const transitionType = input.toStatus === 'completed'
      ? 'task_completed'
      : input.fromStatus === 'completed'
        ? 'task_reopened'
        : 'task_started';
    notifyEmployee(task.assigneeEmployeeId, {
      type: transitionType,
      title: transitionType === 'task_completed' ? 'Task completed' : transitionType === 'task_reopened' ? 'Task reopened' : 'Task started',
      body: 'The task status changed. Open the task to see the authorized details.',
      href: `/tasks/${task.id}`,
      relatedLabel: 'Task',
    });
    if (input.toStatus === 'completed') {
      const actualMinutes = mockStore.entriesForTask(task.id)
        .filter((entry) => entry.state !== 'draft')
        .reduce((total, entry) => total + entry.activeMinutes, 0);
      if (actualMinutes > task.estimatedMinutes) {
        notifyEmployee(task.assigneeEmployeeId, {
          type: 'significant_variance',
          title: 'Task estimate exceeded',
          body: 'Actual work exceeded the estimate. Open the task to review the variance and optional completion note.',
          href: `/tasks/${task.id}`,
          relatedLabel: 'Task variance',
        });
      }
    }
    return success(transition);
  },

  async getTaskHistory(taskId: string) {
    await delay();
    const task = mockStore.findTask(taskId);
    if (!task) {
      return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'That task was not found.' };
    }
    const entries = mockStore.entriesForTask(taskId).filter((item) => item.state !== 'draft');
    const logs = entries.map(entryAsWorkLog).filter((item): item is WorkLog => item !== null);
    const historicalEntries = entries.filter((item) => item.startTime && item.endTime);
    const actualMinutes = entries.reduce((sum, item) => sum + item.activeMinutes, 0);
    const dailyActuals = [...new Set(entries.map((item) => item.workDate))].sort().map((workDate) => {
      const dayEntries = entries.filter((item) => item.workDate === workDate);
      const minutes = dayEntries.reduce((sum, item) => sum + item.activeMinutes, 0);
      return {
        workDate,
        workDateLabel: formatDate(workDate),
        actual: toDurationView(minutes),
        workLogIds: dayEntries.map((item) => item.id),
      };
    });
    const workLogViews = logs.map((item) => {
      const division = Object.values(DIVISIONS).find((candidate) => candidate.id === item.divisionId)!;
      const project = projectById(item.projectId)!;
      return {
        id: item.id,
        version: item.version,
        workDate: item.workDate,
        workDateLabel: formatDate(item.workDate),
        employeeId: item.employeeId,
        division: { id: division.id, name: division.name, code: division.code },
        project: { id: project.id, name: project.name, code: project.code },
        task: { id: task.id, title: task.title },
        duration: toDurationView(item.durationMinutes),
        workLocation: item.workLocation,
        workLocationLabel: WORK_LOCATION_LABEL[item.workLocation],
        workDescription: item.workDescription,
        completedWork: item.completedWork,
        supportingLink: item.supportingLink,
        attachmentCount: item.attachmentIds.length,
        source: item.source,
        state: item.state,
        createdAt: item.createdAt,
        createdBy: item.createdBy,
        canEdit: item.state !== 'locked',
        canDelete: item.state !== 'locked',
      };
    });
    const items = [
      ...taskTransitions.filter((item) => item.taskId === taskId).map((transition) => ({ kind: 'transition' as const, transition, at: transition.changedAt })),
      ...workLogViews.map((workLog) => ({ kind: 'work_log' as const, workLog, at: workLog.createdAt })),
      ...historicalEntries.map((entry) => ({
        kind: 'historical_clock_entry' as const,
        historicalEntry: {
          id: entry.id,
          workDate: entry.workDate,
          workDateLabel: formatDate(entry.workDate),
          timeRangeLabel: formatTimeRange(
            entry.startTime!,
            entry.endTime!,
            STANDARD_POLICY.businessTimezone,
          ),
          duration: toDurationView(entry.activeMinutes),
          completedWork: entry.completedWork,
          createdAt: entry.createdAt,
        },
        at: entry.createdAt,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at)).map((item) => (
      item.kind === 'transition'
        ? { kind: 'transition' as const, transition: item.transition }
        : item.kind === 'work_log'
          ? { kind: 'work_log' as const, workLog: item.workLog }
          : { kind: 'historical_clock_entry' as const, historicalEntry: item.historicalEntry }
    ));
    const varianceMinutes = actualMinutes - task.estimatedMinutes;
    return success({ taskId, items, estimatedMinutes: task.estimatedMinutes, actualMinutes, variance: { minutes: varianceMinutes, label: formatDurationDelta(varianceMinutes) }, dailyActuals });
  },

  async createEntry(input) {
    await delay();

    const previous = appliedKeys.get(input.idempotencyKey);
    if (previous) {
      // A retried save returns the original entry rather than a second one
      // (`REQ-NFR-PERF-004`, `BAC-TIME-07`).
      const existing = mockStore.findEntry(previous);
      if (existing) return success(existing);
    }

    const errors = validateEntry(draftFromInput(input), validationContext(input));
    if (errors.length > 0) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message:
          errors.length === 1
            ? 'This entry cannot be saved yet.'
            : `${errors.length} fields need attention.`,
        fieldErrors: errors,
        focusField: errors[0].field,
      };
    }

    const id = nextId('te');
    const entry = toStoredEntry(input, id);
    mockStore.addEntry(entry);
    appliedKeys.set(input.idempotencyKey, id);

    if (input.overtimeReason || input.criticalExplanation) {
      mockStore.setDayReason(input.employeeId, input.workDate, {
        overtimeReason: input.overtimeReason ?? undefined,
        criticalExplanation: input.criticalExplanation ?? undefined,
      });
    }

    return success(entry);
  },

  async updateEntry(id, input) {
    await delay();

    const errors = validateEntry(draftFromInput(input, id), validationContext(input, id));
    if (errors.length > 0) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message:
          errors.length === 1
            ? 'This entry cannot be saved yet.'
            : `${errors.length} fields need attention.`,
        fieldErrors: errors,
        focusField: errors[0].field,
      };
    }

    const existing = mockStore.findEntry(id);
    if (!existing) {
      return { status: 'not_found', code: 'NOT_FOUND', message: 'That entry no longer exists.' };
    }

    const next: TimeEntry = {
      ...toStoredEntry(input, id),
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    };
    mockStore.updateEntry(id, next);

    if (input.overtimeReason || input.criticalExplanation) {
      mockStore.setDayReason(input.employeeId, input.workDate, {
        overtimeReason: input.overtimeReason ?? undefined,
        criticalExplanation: input.criticalExplanation ?? undefined,
      });
    }

    return success(next);
  },

  async deleteEntry(id) {
    await delay();
    const entry = mockStore.findEntry(id);
    if (!entry) {
      return { status: 'not_found', code: 'NOT_FOUND', message: 'That entry no longer exists.' };
    }
    if (mockStore.isDateLocked(entry.workDate)) {
      return {
        status: 'conflict',
        code: 'PERIOD_LOCKED',
        message: 'This period has been verified and is locked.',
        guidance: 'Request an amendment with a reason instead of deleting.',
      };
    }
    mockStore.removeEntry(id);
    return success(undefined);
  },

  async copyEntry({ sourceEntryId, targetDate }) {
    await delay();
    const source = mockStore.findEntry(sourceEntryId);
    if (!source) {
      return { status: 'not_found', code: 'NOT_FOUND', message: 'That entry no longer exists.' };
    }

    // The copy takes the target date and carries no verification state
    // (`REQ-TIME-007`). It is returned as an unsaved draft for revalidation.
    const copy: TimeEntryInput = {
      employeeId: source.employeeId,
      workDate: targetDate,
      divisionId: source.divisionId,
      projectId: source.projectId,
      taskId: source.taskId,
      // A copy is always a manual entry: the source may have come from a timer
      // or an import, but the copy is something the employee is authoring.
      entryMethod: source.startTime && source.endTime ? 'manual_clock' : 'manual_duration',
      workLocation: source.workLocation,
      startTime: source.startTime ? source.startTime.slice(11, 16) : null,
      endTime: source.endTime ? source.endTime.slice(11, 16) : null,
      activeMinutes: source.activeMinutes,
      workDescription: source.workDescription,
      completedWork: '',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
    };
    return success(copy);
  },

  async previewCalculation(input) {
    await delay(80);

    const others = mockStore
      .entriesFor(input.employeeId, input.workDate)
      .filter((entry) => entry.id !== undefined && entry.state !== 'draft');

    const minutes = draftMinutes(draftFromInput(input));
    const leave = mockStore.approvedLeaveOn(input.employeeId, input.workDate);
    const divisions = effectiveDivisionIds(input.employeeId, input.workDate);

    // The preview runs the same engine as the save, so the number the user
    // sees before saving is the number they get after.
    const projected = calculateDay({
      employeeId: input.employeeId,
      workDate: input.workDate,
      entries: [
        ...others,
        {
          ...toStoredEntry(input, 'preview'),
          activeMinutes: minutes,
        },
      ],
      policy: STANDARD_POLICY,
      breakOverrideMinutes: mockStore.breakOverride(input.employeeId, input.workDate),
      leave: leave ? { portion: leave.portion, leaveType: leave.leaveType } : null,
      holidayName: holidayOn(input.workDate, divisions),
    });

    const preview: EntryCalculationPreview = {
      entryDuration: toDurationView(minutes),
      taskDayActive: input.taskId
        ? toDurationView(
            others
              .filter((entry) => entry.taskId === input.taskId)
              .reduce((sum, entry) => sum + entry.activeMinutes, minutes),
          )
        : null,
      dayActive: toDurationView(projected.activeMinutes),
      dayBreak: toDurationView(projected.breakMinutes),
      dayTotal: toDurationView(projected.totalMinutes),
      remainingActive: toDurationView(projected.remainingActiveMinutes),
      resultingStatus: toDayStatusView(projected.status),
      requiresOvertimeReason:
        projected.totalMinutes > STANDARD_POLICY.overtimeThresholdMinutes,
      requiresCriticalExplanation:
        projected.totalMinutes > STANDARD_POLICY.criticalThresholdMinutes,
    };
    return success(preview);
  },

  async setBreakOverride({ employeeId, workDate, minutes }) {
    await delay();
    mockStore.setBreakOverride(employeeId, workDate, minutes);
    return success(summaryFor(employeeId, workDate));
  },

} satisfies TimesheetService & LegacyTimesheetCompatibility;

export const mockTimesheetService: TimesheetService & LegacyTimesheetCompatibility =
  mockTimesheetServiceImpl;

export type { DateRange };
