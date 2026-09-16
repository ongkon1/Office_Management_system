import type { DayStatus } from '@/contracts/domain';
import type { PeriodTotalsView, TimesheetDayRowView } from '@/contracts/view-models';
import { aggregateSummaries } from '@/lib/calculation/engine';
import { sumClientContributions } from '@/lib/client-time';
import { toDurationView } from '@/lib/status';

export type TimesheetViewMode = 'week' | 'month' | 'calendar' | 'list';

export interface TimesheetPeriodFilters {
  readonly statuses: readonly string[];
  readonly divisionIds: readonly string[];
  readonly clientIds: readonly string[];
  readonly searchTerm: string;
  readonly noClientValue: string;
}

/** Week and List share one fixed seven-day dataset; Month and Calendar share the month. */
export function periodKindForView(mode: TimesheetViewMode): 'week' | 'month' {
  return mode === 'week' || mode === 'list' ? 'week' : 'month';
}

/** Applies presentation filters only after the service has authorized the period rows. */
export function filterTimesheetDays(
  rows: readonly TimesheetDayRowView[],
  filters: TimesheetPeriodFilters,
): readonly TimesheetDayRowView[] {
  const searchTerm = filters.searchTerm.trim().toLowerCase();

  return rows.filter((row) => {
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.status.status)) {
      return false;
    }
    if (
      filters.clientIds.length > 0 &&
      !row.clientContributions.some((contribution) =>
        filters.clientIds.includes(contribution.clientId ?? filters.noClientValue),
      )
    ) {
      return false;
    }
    if (
      filters.divisionIds.length > 0 &&
      !row.divisionIds.some((id) => filters.divisionIds.includes(id))
    ) {
      return false;
    }
    return !searchTerm || row.dateLabel.toLowerCase().includes(searchTerm);
  });
}

/**
 * Produces the totals for exactly the rows on screen.
 *
 * The helper only projects integer facts into the shared calculation engine;
 * it never performs duration or classification arithmetic itself.
 */
export function summarizeTimesheetDays(
  label: string,
  rows: readonly TimesheetDayRowView[],
): PeriodTotalsView {
  const totals = aggregateSummaries(
    rows.map((row) => ({
      activeMinutes: row.active.minutes,
      breakMinutes: row.break.minutes,
      totalMinutes: row.total.minutes,
      requiredActiveMinutes: row.requiredActive.minutes,
      status: row.status.status as DayStatus,
      isRequiredWorkingDay: row.isRequiredWorkingDay,
    })),
  );

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

/** One read model keeps rows, totals and client attribution in reconciliation. */
export function buildTimesheetPeriodPresentation(
  label: string,
  rows: readonly TimesheetDayRowView[],
  filters: TimesheetPeriodFilters,
) {
  const days = filterTimesheetDays(rows, filters);
  return {
    days,
    totals: summarizeTimesheetDays(label, days),
    clientTotals: sumClientContributions(days),
  } as const;
}
