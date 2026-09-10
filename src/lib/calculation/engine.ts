/**
 * The authoritative daily calculation.
 *
 * This is the single implementation required by `REQ-NFR-OPS-003` and
 * `REQ-DASH-009`. Entry validation, the live preview, timesheet views,
 * dashboards, reports, exports and evaluations all call it, so their totals
 * cannot diverge.
 *
 * Properties that must hold:
 *  - Pure. Inputs are values; there is no database, HTTP or React dependency.
 *  - Integer minutes throughout. `6:59` never becomes `7:00`.
 *  - Policy-version aware: the policy is an input, never read from current
 *    configuration, which is what makes historical results reproducible.
 */

import type {
  AttendanceState,
  DailySummary,
  DayExemption,
  DayStatus,
  DivisionContribution,
  DurationMinutes,
  IsoDate,
  ProjectContribution,
  TimeEntry,
  WorkPolicy,
} from '@/contracts/domain';
import { parseIsoDate } from '@/lib/format';

/** Leave that applies to the day, if any. */
export interface LeaveContext {
  readonly portion: 'full_day' | 'half_day';
  readonly leaveType: string;
}

export interface DayCalculationInput {
  readonly employeeId: string;
  readonly workDate: IsoDate;
  /** Saved entries only. Drafts are excluded from every total. */
  readonly entries: readonly TimeEntry[];
  readonly policy: WorkPolicy;
  /** Overrides the policy's recognized break when present. */
  readonly breakOverrideMinutes?: DurationMinutes | null;
  readonly leave?: LeaveContext | null;
  readonly holidayName?: string | null;
  readonly overtimeReason?: string | null;
  readonly criticalExplanation?: string | null;
  readonly isLocked?: boolean;
  /** An approved WFH day, used when entries do not settle the location. */
  readonly approvedWfh?: boolean;
}

function isWorkingWeekday(policy: WorkPolicy, workDate: IsoDate): boolean {
  const parts = parseIsoDate(workDate);
  if (!parts) return false;
  const jsDay = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  // Convert Sunday=0 into ISO weekdays, where Monday is 1 and Sunday is 7.
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  return policy.workingWeekdays.includes(isoWeekday);
}

function sumBy<T>(items: readonly T[], select: (item: T) => number): number {
  return items.reduce((total, item) => total + select(item), 0);
}

function groupContributions(entries: readonly TimeEntry[]): {
  divisions: readonly DivisionContribution[];
  projects: readonly ProjectContribution[];
  tasks: readonly { taskId: string; activeMinutes: DurationMinutes }[];
} {
  const byDivision = new Map<string, number>();
  const byProject = new Map<string, number>();
  const byTask = new Map<string, number>();

  for (const entry of entries) {
    if (entry.taskId) byTask.set(entry.taskId, (byTask.get(entry.taskId) ?? 0) + entry.activeMinutes);
    byDivision.set(
      entry.divisionId,
      (byDivision.get(entry.divisionId) ?? 0) + entry.activeMinutes,
    );
    if (entry.projectId) {
      byProject.set(
        entry.projectId,
        (byProject.get(entry.projectId) ?? 0) + entry.activeMinutes,
      );
    }
  }

  return {
    tasks: [...byTask.entries()].map(([taskId, activeMinutes]) => ({ taskId, activeMinutes })),
    divisions: [...byDivision.entries()]
      .map(([divisionId, activeMinutes]) => ({ divisionId, activeMinutes }))
      .sort((a, b) => b.activeMinutes - a.activeMinutes),
    projects: [...byProject.entries()]
      .map(([projectId, activeMinutes]) => ({ projectId, activeMinutes }))
      .sort((a, b) => b.activeMinutes - a.activeMinutes),
  };
}

export interface ClassifyInput {
  readonly hasEntries: boolean;
  readonly activeMinutes: DurationMinutes;
  readonly totalMinutes: DurationMinutes;
  readonly requiredActiveMinutes: DurationMinutes;
  readonly requiredTotalMinutes: DurationMinutes;
  readonly overtimeThresholdMinutes: DurationMinutes;
  readonly criticalThresholdMinutes: DurationMinutes;
  readonly isRequiredWorkingDay: boolean;
  readonly hasExemption: boolean;
}

/**
 * Classifies a day.
 *
 * Two boundaries are easy to get wrong, and both are asserted by the tests:
 * a total of exactly 12:00 is Overtime rather than Critical, and Under-time
 * triggers on failing *either* threshold, not both.
 */
export function classifyDay(input: ClassifyInput): DayStatus {
  const {
    hasEntries,
    activeMinutes,
    totalMinutes,
    requiredActiveMinutes,
    requiredTotalMinutes,
    overtimeThresholdMinutes,
    criticalThresholdMinutes,
    isRequiredWorkingDay,
    hasExemption,
  } = input;

  if (!hasEntries) {
    // A required day with nothing recorded and no approved exemption is the
    // only Missing case (`REQ-ATT-004`).
    if (isRequiredWorkingDay && !hasExemption) return 'missing';
    // Nothing was required and nothing is outstanding. Callers display the
    // exemption — Holiday, Approved leave — rather than this status.
    return 'complete';
  }

  // Overtime and critical thresholds are absolute, so a half day still counts
  // as overtime past eight hours (`REQ-TIME-018`).
  if (totalMinutes > criticalThresholdMinutes) return 'critical';
  if (totalMinutes > overtimeThresholdMinutes) return 'overtime';

  if (activeMinutes < requiredActiveMinutes || totalMinutes < requiredTotalMinutes) {
    return 'under_time';
  }

  return 'complete';
}

function deriveAttendance(input: {
  readonly hasEntries: boolean;
  readonly entries: readonly TimeEntry[];
  readonly leave: LeaveContext | null | undefined;
  readonly holidayName: string | null | undefined;
  readonly isWorkingDay: boolean;
  readonly approvedWfh: boolean | undefined;
}): AttendanceState {
  const { hasEntries, entries, leave, holidayName, isWorkingDay, approvedWfh } = input;

  if (holidayName) return 'holiday';
  if (!isWorkingDay) return 'weekly_off';
  if (leave?.portion === 'full_day') return 'approved_leave';

  if (!hasEntries) {
    return leave?.portion === 'half_day' ? 'half_day_leave' : approvedWfh ? 'wfh' : 'missing_timesheet';
  }

  if (leave?.portion === 'half_day') return 'half_day_leave';

  // The day takes the location where most of its active time was spent.
  const byLocation = new Map<string, number>();
  for (const entry of entries) {
    byLocation.set(
      entry.workLocation,
      (byLocation.get(entry.workLocation) ?? 0) + entry.activeMinutes,
    );
  }
  const dominant = [...byLocation.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  switch (dominant) {
    case 'wfh':
      return 'wfh';
    case 'official_travel':
      return 'official_travel';
    case 'field_work':
      return 'field_duty';
    case 'training_venue':
      return 'training_duty';
    default:
      return approvedWfh ? 'wfh' : 'office';
  }
}

/**
 * Produces the day's authoritative summary.
 *
 * Half-day leave scales the requirement proportionally, including the
 * recognized break, so a half day is 3:30 active plus 0:30 break for a 4:00
 * total (`REQ-ATT-005`).
 */
export function calculateDay(input: DayCalculationInput): DailySummary {
  const {
    employeeId,
    workDate,
    entries,
    policy,
    breakOverrideMinutes,
    leave,
    holidayName,
    overtimeReason,
    criticalExplanation,
    isLocked,
    approvedWfh,
  } = input;

  const workingWeekday = isWorkingWeekday(policy, workDate);
  const isFullDayLeave = leave?.portion === 'full_day';
  const isHalfDayLeave = leave?.portion === 'half_day';
  const isHoliday = Boolean(holidayName);

  const exemption: DayExemption | null = isHoliday
    ? 'holiday'
    : isFullDayLeave
      ? 'full_day_leave'
      : !workingWeekday
        ? 'weekly_off'
        : null;

  const isRequiredWorkingDay = workingWeekday && !isHoliday && !isFullDayLeave;

  const activeMinutes = sumBy(entries, (entry) => entry.activeMinutes);
  const hasEntries = entries.length > 0;

  // The break is one daily value, never added per entry (`REQ-TIME-013`,
  // Assumption §12), and it is recognized only on a day with recorded work.
  const policyBreak = isHalfDayLeave
    ? Math.round(policy.recognizedBreakMinutes / 2)
    : policy.recognizedBreakMinutes;
  const recognizedBreak =
    breakOverrideMinutes !== undefined && breakOverrideMinutes !== null
      ? breakOverrideMinutes
      : hasEntries
        ? policyBreak
        : 0;

  const totalMinutes = activeMinutes + recognizedBreak;

  const requiredActiveMinutes = !isRequiredWorkingDay
    ? 0
    : isHalfDayLeave
      ? Math.round(policy.requiredActiveMinutes / 2)
      : policy.requiredActiveMinutes;

  const requiredTotalMinutes = !isRequiredWorkingDay
    ? 0
    : isHalfDayLeave
      ? Math.round(policy.requiredTotalMinutes / 2)
      : policy.requiredTotalMinutes;

  const status = classifyDay({
    hasEntries,
    activeMinutes,
    totalMinutes,
    requiredActiveMinutes,
    requiredTotalMinutes,
    overtimeThresholdMinutes: policy.overtimeThresholdMinutes,
    criticalThresholdMinutes: policy.criticalThresholdMinutes,
    isRequiredWorkingDay,
    hasExemption: exemption !== null,
  });

  const { divisions, projects, tasks } = groupContributions(entries);

  return {
    employeeId,
    workDate,
    activeMinutes,
    breakMinutes: recognizedBreak,
    totalMinutes,
    requiredActiveMinutes,
    requiredTotalMinutes,
    remainingActiveMinutes: Math.max(0, requiredActiveMinutes - activeMinutes),
    status,
    exemption,
    isRequiredWorkingDay,
    overtimeReason: overtimeReason ?? null,
    criticalExplanation: criticalExplanation ?? null,
    divisionContributions: divisions,
    projectContributions: projects,
    taskContributions: tasks,
    entryIds: entries.map((entry) => entry.id),
    attendance: deriveAttendance({
      hasEntries,
      entries,
      leave,
      holidayName,
      isWorkingDay: workingWeekday,
      approvedWfh,
    }),
    isLocked: isLocked ?? false,
    policyVersion: policy.version,
    timezone: policy.businessTimezone,
  };
}

/** True when the day's total requires a reason (`REQ-TIME-018`). */
export function requiresOvertimeReason(
  totalMinutes: DurationMinutes,
  policy: WorkPolicy,
): boolean {
  return totalMinutes > policy.overtimeThresholdMinutes;
}

/** True when the day's total requires an explanation (`REQ-TIME-019`). */
export function requiresCriticalExplanation(
  totalMinutes: DurationMinutes,
  policy: WorkPolicy,
): boolean {
  return totalMinutes > policy.criticalThresholdMinutes;
}

export interface PeriodTotals {
  readonly activeMinutes: DurationMinutes;
  readonly breakMinutes: DurationMinutes;
  readonly totalMinutes: DurationMinutes;
  readonly requiredActiveMinutes: DurationMinutes;
  readonly overtimeMinutes: DurationMinutes;
  readonly completeDayCount: number;
  readonly underTimeDayCount: number;
  readonly overtimeDayCount: number;
  readonly criticalDayCount: number;
  readonly missingDayCount: number;
}

/**
 * Aggregates day summaries into the totals a week or month view shows.
 *
 * Overtime minutes are counted per day against the day's own threshold, never
 * against the period total — a short Monday must not cancel a long Tuesday.
 */
export function aggregateSummaries(
  summaries: readonly DailySummary[],
  overtimeThresholdMinutes = 480,
): PeriodTotals {
  const activeMinutes = sumBy(summaries, (day) => day.activeMinutes);
  const breakMinutes = sumBy(summaries, (day) => day.breakMinutes);

  const countOf = (status: DayStatus) =>
    summaries.filter((day) => day.status === status && day.isRequiredWorkingDay).length;

  return {
    activeMinutes,
    breakMinutes,
    totalMinutes: activeMinutes + breakMinutes,
    requiredActiveMinutes: sumBy(summaries, (day) => day.requiredActiveMinutes),
    overtimeMinutes: sumBy(summaries, (day) =>
      day.totalMinutes > overtimeThresholdMinutes
        ? day.totalMinutes - overtimeThresholdMinutes
        : 0,
    ),
    completeDayCount: countOf('complete'),
    underTimeDayCount: countOf('under_time'),
    overtimeDayCount: countOf('overtime'),
    criticalDayCount: countOf('critical'),
    missingDayCount: countOf('missing'),
  };
}
