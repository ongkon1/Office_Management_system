/**
 * Mock Finance and Management services (Phase 6).
 *
 * Three rules are enforced here and nowhere above.
 *
 * 1. **Cost needs `finance.cost.view`.** Without it the service never reads a
 *    rate at all: it returns the restricted variant, so no money value exists
 *    in the view model to leak through a component. Hours remain available —
 *    the Finance role is not the permission.
 * 2. **Finance reports verified periods.** Figures from an open or
 *    pending-verification period still change, so every view carries an
 *    explicit warning and a cost export is blocked outright.
 * 3. **Money is exact.** Cost comes from `src/lib/money.ts`, which works in
 *    minor units and rounds once. Hours come from the calculation engine.
 *    Neither is recomputed here.
 *
 * The Management service is separate and has one reader. A read-only role
 * cannot be handed an action by importing the wrong module.
 */

import type {
  DailySummary,
  ExportFormat,
  IsoDate,
  Money,
  Project,
} from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  BillableSplitView,
  CostAnalysisView,
  CostLineView,
  FinanceDashboard,
  FinanceHoursRowView,
  FinanceHoursView,
  FinanceOvertimeRowView,
  FinanceOvertimeView,
  FinancePeriodRef,
  FinanceReportPreviewView,
  FinanceService,
  ManagementDashboard,
  ManagementService,
  PayrollSummaryView,
  RedactableMoneyView,
} from '@/contracts/finance';
import { success } from '@/contracts/results';
import type { ExportJobView, MetricTileView } from '@/contracts/view-models';
import { aggregateSummaries } from '@/lib/calculation/engine';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatMoney,
  formatMoneyCompact,
  formatTimestamp,
} from '@/lib/format';
import { costOfMinutes, subtractMoney, sumMoney, variancePercent, ZERO_BDT } from '@/lib/money';
import { toDurationView } from '@/lib/status';
import { PROJECTS, STANDARD_POLICY } from '@/fixtures';
import {
  BILLABLE_PROJECT_IDS,
  COST_RATES,
  DIVISION_BUDGETS,
  EXPORT_JOBS,
  NON_BILLABLE_REASON,
  PAYROLL_PERIODS,
  UNASSIGNED_LABEL,
  type ExportJobFixture,
} from '@/fixtures/finance';
import { EMPLOYEES } from '@/fixtures/hr';
import { DIVISIONS, findAccountByUserId } from './accounts';
import { mockStore } from './store';
import { summaryFor } from './timesheet';

const LATENCY_MS = 170;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

const REPORTED_EMPLOYEE_IDS: readonly string[] = [
  'emp-1001',
  'emp-1002',
  'emp-1003',
  'emp-1004',
];

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

function viewerOf(userId: string) {
  return findAccountByUserId(userId);
}

/** Finance screens are open to Finance Managers and Super Administrators. */
function canViewFinance(userId: string): boolean {
  const role = viewerOf(userId)?.primaryRole;
  return role === 'finance_manager' || role === 'super_admin';
}

/** Cost, salary and budget need the separately granted permission. */
function canViewCost(userId: string): boolean {
  return viewerOf(userId)?.permissions.includes(SENSITIVE_PERMISSIONS.financialDetail) ?? false;
}

function canExportProtected(userId: string): boolean {
  return viewerOf(userId)?.permissions.includes(SENSITIVE_PERMISSIONS.exportProtected) ?? false;
}

const RESTRICTED: RedactableMoneyView = { visible: false, reason: 'permission_required' };

function moneyView(value: Money, allowed: boolean): RedactableMoneyView {
  return allowed
    ? {
        visible: true,
        value,
        display: formatMoney(value),
        compact: formatMoneyCompact(value),
      }
    : RESTRICTED;
}

/** A metric tile that keeps its label when the value is withheld. */
function moneyTile(
  key: string,
  label: string,
  value: Money,
  allowed: boolean,
  extras: Partial<MetricTileView> = {},
): MetricTileView {
  if (!allowed) {
    return { key, label, value: 'Restricted', restricted: true, ...extras };
  }
  return { key, label, value: formatMoneyCompact(value), ...extras };
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

function projectRef(projectId: string) {
  const project = PROJECTS.find((item) => item.id === projectId);
  return project
    ? {
        id: project.id,
        name: project.name,
        code: project.code,
        divisionId: project.divisionId,
      }
    : null;
}

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

/* -------------------------------------------------------------------------- */
/* Periods                                                                    */
/* -------------------------------------------------------------------------- */

function periodRef(payrollPeriodId: string): FinancePeriodRef | null {
  const payroll = PAYROLL_PERIODS.find((period) => period.id === payrollPeriodId);
  if (!payroll) return null;
  // Verification is read from the timesheet period, never copied, so a period
  // verified during the session is immediately payroll-ready.
  const timesheet = mockStore.findPeriod(payroll.timesheetPeriodId);
  return {
    id: payroll.id,
    label: payroll.label,
    rangeLabel: formatDateRange(payroll.startDate, payroll.endDate),
    startDate: payroll.startDate,
    endDate: payroll.endDate,
    isVerified: timesheet?.status === 'verified' || timesheet?.status === 'amended',
    timesheetPeriodId: payroll.timesheetPeriodId,
  };
}

function allPeriods(): readonly FinancePeriodRef[] {
  return PAYROLL_PERIODS.map((period) => periodRef(period.id)).filter(
    (period): period is FinancePeriodRef => period !== null,
  );
}

/** The most recent verified period, which is what Finance defaults to. */
function defaultPeriod(): FinancePeriodRef {
  const periods = allPeriods();
  const verified = periods.filter((period) => period.isVerified);
  return verified.length ? verified[verified.length - 1] : periods[0];
}

function resolvePeriod(periodId?: string): FinancePeriodRef | null {
  if (!periodId) return defaultPeriod();
  return periodRef(periodId);
}

function unverifiedWarningFor(period: FinancePeriodRef): string | null {
  if (period.isVerified) return null;
  return `${period.label} is not verified. These figures come from an open period and can still change, so they are not payroll-ready.`;
}

/* -------------------------------------------------------------------------- */
/* Aggregation                                                                */
/* -------------------------------------------------------------------------- */

function datesIn(from: IsoDate, to: IsoDate): readonly IsoDate[] {
  const dates: IsoDate[] = [];
  const span = daysBetween(from, to);
  for (let offset = 0; offset <= span; offset += 1) dates.push(addDays(from, offset));
  return dates;
}

interface Slice {
  readonly employeeId: string;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly date: IsoDate;
  readonly activeMinutes: number;
  readonly status: DailySummary['status'];
}

/**
 * Per-entry active minutes for a period, carrying the day's classification.
 *
 * Breaks are a daily value, not an entry one, so they are aggregated
 * separately from these slices — adding a break per slice is the classic
 * misreading of this domain and would inflate every cost figure.
 */
function slicesFor(period: FinancePeriodRef, employeeIds: readonly string[]): readonly Slice[] {
  const slices: Slice[] = [];
  for (const employeeId of employeeIds) {
    for (const date of datesIn(period.startDate, period.endDate)) {
      const summary = summaryFor(employeeId, date);
      if (summary.activeMinutes === 0) continue;
      for (const entry of mockStore.entriesFor(employeeId, date)) {
        if (entry.state === 'draft') continue;
        slices.push({
          employeeId,
          divisionId: entry.divisionId,
          projectId: entry.projectId,
          date,
          activeMinutes: entry.activeMinutes,
          status: summary.status,
        });
      }
    }
  }
  return slices;
}

function summariesFor(
  period: FinancePeriodRef,
  employeeIds: readonly string[],
): readonly DailySummary[] {
  return employeeIds.flatMap((employeeId) =>
    datesIn(period.startDate, period.endDate).map((date) => summaryFor(employeeId, date)),
  );
}

function hourlyRateFor(employeeId: string): Money {
  const rate = COST_RATES.find((item) => item.scopeId === employeeId);
  if (!rate || !rate.hourlyRate.visible) return ZERO_BDT;
  return rate.hourlyRate.value;
}

function costOfSlices(slices: readonly Slice[]): Money {
  return sumMoney(
    slices.map((slice) => costOfMinutes(hourlyRateFor(slice.employeeId), slice.activeMinutes)),
  );
}

function isBillable(projectId: string | null): boolean {
  return projectId !== null && BILLABLE_PROJECT_IDS.includes(projectId);
}

function applyFilters(
  slices: readonly Slice[],
  filters: {
    employeeIds?: readonly string[];
    divisionIds?: readonly string[];
    projectIds?: readonly string[];
    statuses?: readonly string[];
  },
): readonly Slice[] {
  return slices.filter((slice) => {
    if (filters.employeeIds?.length && !filters.employeeIds.includes(slice.employeeId)) {
      return false;
    }
    if (filters.divisionIds?.length && !filters.divisionIds.includes(slice.divisionId)) {
      return false;
    }
    if (
      filters.projectIds?.length &&
      !filters.projectIds.includes(slice.projectId ?? '__none__')
    ) {
      return false;
    }
    if (filters.statuses?.length && !filters.statuses.includes(slice.status)) return false;
    return true;
  });
}

function overtimeMinutesOf(summary: DailySummary): number {
  return Math.max(0, summary.totalMinutes - STANDARD_POLICY.overtimeThresholdMinutes);
}

/* -------------------------------------------------------------------------- */
/* Export jobs                                                                */
/* -------------------------------------------------------------------------- */

const EXPORT_STATE_LABEL = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  expired: 'Expired',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

const FORMAT_LABEL: Readonly<Record<ExportFormat, string>> = {
  excel: 'Excel',
  csv: 'CSV',
  pdf: 'PDF',
  print: 'Print',
};

let exportJobs: ExportJobFixture[] = [...EXPORT_JOBS];

function exportJobView(job: ExportJobFixture, userId: string): ExportJobView {
  // A protected export is listed for anyone who may see the history, but only
  // an authorized viewer may retrieve the file.
  const mayDownload =
    job.state === 'ready' && (!job.includesProtectedFields || canExportProtected(userId));
  return {
    id: job.id,
    reportTitle: job.reportTitle,
    format: job.format,
    formatLabel: FORMAT_LABEL[job.format],
    requestedByLabel: job.requestedBy,
    requestedAtLabel: formatTimestamp(job.requestedAt),
    filterSummary: job.filterSummary,
    state: job.state,
    stateLabel: EXPORT_STATE_LABEL[job.state],
    expiresAtLabel: job.expiresAt ? formatTimestamp(job.expiresAt) : null,
    failureMessage: job.failureMessage,
    canDownload: mayDownload,
    canRetry: job.state === 'failed' || job.state === 'expired',
    downloadUrl: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Finance service                                                            */
/* -------------------------------------------------------------------------- */

const FINANCE_DENIAL = {
  message: 'The Finance workspace is limited to Finance Managers.',
  guidance: 'Return to your dashboard for the views available to your role.',
};

const COST_RESTRICTION_NOTE =
  'Cost, rate and budget values need the separately granted financial-detail permission. Hours are shown in full.';

export const mockFinanceService: FinanceService = {
  async listPeriods(userId) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);
    return success(allPeriods());
  },

  async getDashboard(userId, periodId) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const slices = slicesFor(period, REPORTED_EMPLOYEE_IDS);
    const summaries = summariesFor(period, REPORTED_EMPLOYEE_IDS);
    const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);

    const activeTotal = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0) || 1;

    const divisionIds = [...new Set(slices.map((slice) => slice.divisionId))];
    const projectIds = [...new Set(slices.map((slice) => slice.projectId).filter(Boolean))];

    const billableMinutes = slices
      .filter((slice) => isBillable(slice.projectId))
      .reduce((sum, slice) => sum + slice.activeMinutes, 0);
    const nonBillableMinutes = slices
      .filter((slice) => !isBillable(slice.projectId))
      .reduce((sum, slice) => sum + slice.activeMinutes, 0);

    const totalCost = costOfSlices(slices);
    const totalBudget = sumMoney(
      divisionIds.map((divisionId) => ({
        amount: DIVISION_BUDGETS[divisionId] ?? '0.00',
        currency: 'BDT',
      })),
    );
    const variance = subtractMoney(totalCost, totalBudget);

    return success<FinanceDashboard>({
      period,
      availablePeriods: allPeriods(),
      unverifiedWarning: unverifiedWarningFor(period),
      hasFinancialPermission: allowed,

      verifiedEmployeeHours: toDurationView(totals.activeMinutes),
      verifiedOvertimeHours: toDurationView(totals.overtimeMinutes),
      employeeCount: new Set(slices.map((slice) => slice.employeeId)).size,
      divisionHours: divisionIds.map((divisionId) => {
        const minutes = slices
          .filter((slice) => slice.divisionId === divisionId)
          .reduce((sum, slice) => sum + slice.activeMinutes, 0);
        return {
          division: divisionRef(divisionId),
          active: toDurationView(minutes),
          sharePercent: Math.round((minutes / activeTotal) * 100),
        };
      }),
      projectHours: projectIds.map((projectId) => {
        const minutes = slices
          .filter((slice) => slice.projectId === projectId)
          .reduce((sum, slice) => sum + slice.activeMinutes, 0);
        const project = projectRef(projectId as string);
        return {
          project: project ?? {
            id: projectId as string,
            name: projectId as string,
            code: projectId as string,
            divisionId: '',
          },
          division: divisionRef(project?.divisionId ?? ''),
          active: toDurationView(minutes),
          sharePercent: Math.round((minutes / activeTotal) * 100),
        };
      }),

      projectLabourCost: moneyTile(
        'project-cost',
        'Project labour cost',
        totalCost,
        allowed,
        { href: '/finance/project-costs' },
      ),
      divisionLabourCost: moneyTile(
        'division-cost',
        'Division labour cost',
        totalCost,
        allowed,
        { href: '/finance/division-costs' },
      ),
      billableHours: allowed
        ? {
            key: 'billable',
            label: 'Billable hours',
            value: toDurationView(billableMinutes).display,
            secondaryValue: `${Math.round((billableMinutes / activeTotal) * 100)}% of verified time`,
            href: '/finance/billable',
          }
        : {
            key: 'billable',
            label: 'Billable hours',
            value: 'Restricted',
            restricted: true,
          },
      nonBillableHours: allowed
        ? {
            key: 'non-billable',
            label: 'Non-billable hours',
            value: toDurationView(nonBillableMinutes).display,
            secondaryValue: `${Math.round((nonBillableMinutes / activeTotal) * 100)}% of verified time`,
            href: '/finance/billable',
          }
        : {
            key: 'non-billable',
            label: 'Non-billable hours',
            value: 'Restricted',
            restricted: true,
          },
      payrollSummary: moneyTile('payroll', 'Payroll total', totalCost, allowed, {
        href: '/finance/payroll',
        secondaryValue: period.isVerified ? 'Verified period' : 'Not verified',
      }),
      budgetVariance: moneyTile('variance', 'Budget variance', variance, allowed, {
        tone:
          variancePercent(totalCost, totalBudget) !== null &&
          (variancePercent(totalCost, totalBudget) as number) > 0
            ? 'negative'
            : 'positive',
        secondaryValue:
          variancePercent(totalCost, totalBudget) === null
            ? undefined
            : `${variancePercent(totalCost, totalBudget)}% against budget`,
      }),

      recentExports: exportJobs.slice(0, 3).map((job) => exportJobView(job, userId)),
    });
  },

  async getHours(userId, filters) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(filters.periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const slices = applyFilters(slicesFor(period, REPORTED_EMPLOYEE_IDS), filters);

    // One row per employee × division × project, which is the grain a payroll
    // reviewer reconciles against.
    const grouped = new Map<string, Slice[]>();
    for (const slice of slices) {
      const key = `${slice.employeeId}|${slice.divisionId}|${slice.projectId ?? 'none'}`;
      const existing = grouped.get(key);
      if (existing) existing.push(slice);
      else grouped.set(key, [slice]);
    }

    const rows: FinanceHoursRowView[] = [...grouped.entries()].map(([key, group]) => {
      const first = group[0];
      const activeMinutes = group.reduce((sum, slice) => sum + slice.activeMinutes, 0);
      const dates = [...new Set(group.map((slice) => slice.date))];
      const daySummaries = dates.map((date) => summaryFor(first.employeeId, date));
      const project = first.projectId ? projectRef(first.projectId) : null;

      // The break is a daily value; it belongs to the employee-day, not to
      // this division/project row, so it is attributed once per distinct date.
      const breakMinutes = dates.reduce((sum, date) => {
        const summary = summaryFor(first.employeeId, date);
        const dayEntries = mockStore
          .entriesFor(first.employeeId, date)
          .filter((entry) => entry.state !== 'draft');
        const rowEntries = dayEntries.filter(
          (entry) =>
            entry.divisionId === first.divisionId &&
            (entry.projectId ?? 'none') === (first.projectId ?? 'none'),
        );
        // Attribute the day's single break proportionally, never once per row.
        const dayActive = dayEntries.reduce((total, entry) => total + entry.activeMinutes, 0) || 1;
        const rowActive = rowEntries.reduce((total, entry) => total + entry.activeMinutes, 0);
        return sum + Math.round((summary.breakMinutes * rowActive) / dayActive);
      }, 0);

      const overtimeMinutes = daySummaries.reduce(
        (sum, summary) => sum + overtimeMinutesOf(summary),
        0,
      );

      return {
        key,
        employee: employeeRef(first.employeeId),
        division: divisionRef(first.divisionId),
        project,
        projectLabel: project ? `${project.code} · ${project.name}` : UNASSIGNED_LABEL,
        active: toDurationView(activeMinutes),
        break: toDurationView(breakMinutes),
        total: toDurationView(activeMinutes + breakMinutes),
        overtime: toDurationView(overtimeMinutes),
        dayCount: dates.length,
        statuses: [...new Set(group.map((slice) => slice.status))],
        isBillable: isBillable(first.projectId),
        cost: moneyView(costOfSlices(group), allowed),
      };
    });

    const summaries = summariesFor(period, REPORTED_EMPLOYEE_IDS);
    const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
    const filteredActive = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0);
    const filteredBreak = rows.reduce((sum, row) => sum + row.break.minutes, 0);

    return success<FinanceHoursView>({
      period,
      unverifiedWarning: unverifiedWarningFor(period),
      rows: rows.sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName)),
      totals: {
        active: toDurationView(filteredActive),
        break: toDurationView(filteredBreak),
        total: toDurationView(filteredActive + filteredBreak),
        overtime: toDurationView(totals.overtimeMinutes),
        cost: moneyView(costOfSlices(slices), allowed),
      },
      hasFinancialPermission: allowed,
    });
  },

  async getOvertime(userId, filters) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(filters.periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const employeeIds = filters.employeeIds?.length
      ? REPORTED_EMPLOYEE_IDS.filter((id) => filters.employeeIds!.includes(id))
      : REPORTED_EMPLOYEE_IDS;

    const rows: FinanceOvertimeRowView[] = [];
    for (const employeeId of employeeIds) {
      for (const date of datesIn(period.startDate, period.endDate)) {
        const summary = summaryFor(employeeId, date);
        if (summary.status !== 'overtime' && summary.status !== 'critical') continue;
        const divisionId =
          summary.divisionContributions[0]?.divisionId ??
          EMPLOYEES.find((item) => item.id === employeeId)?.primaryDivisionId ??
          'pia';
        if (filters.divisionIds?.length && !filters.divisionIds.includes(divisionId)) continue;

        const overtimeMinutes = overtimeMinutesOf(summary);
        rows.push({
          key: `${employeeId}-${date}`,
          employee: employeeRef(employeeId),
          division: divisionRef(divisionId),
          date,
          dateLabel: formatDate(date),
          total: toDurationView(summary.totalMinutes),
          overtime: toDurationView(overtimeMinutes),
          status: summary.status,
          statusLabel: summary.status === 'critical' ? 'Critical' : 'Overtime',
          reason:
            summary.status === 'critical'
              ? summary.criticalExplanation ?? summary.overtimeReason
              : summary.overtimeReason,
          cost: moneyView(costOfMinutes(hourlyRateFor(employeeId), overtimeMinutes), allowed),
          href: `/team/timesheets/${employeeId}/${date}`,
        });
      }
    }

    const totalOvertimeMinutes = rows.reduce((sum, row) => sum + row.overtime.minutes, 0);

    return success<FinanceOvertimeView>({
      period,
      unverifiedWarning: unverifiedWarningFor(period),
      rows: rows.sort((a, b) => b.overtime.minutes - a.overtime.minutes),
      totalOvertime: toDurationView(totalOvertimeMinutes),
      overtimeDayCount: rows.filter((row) => row.status === 'overtime').length,
      criticalDayCount: rows.filter((row) => row.status === 'critical').length,
      totalCost: moneyView(
        sumMoney(
          rows.map((row) =>
            costOfMinutes(hourlyRateFor(row.employee.id), row.overtime.minutes),
          ),
        ),
        allowed,
      ),
      hasFinancialPermission: allowed,
    });
  },

  async getCostAnalysis(userId, scope, filters) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(filters.periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const slices = applyFilters(slicesFor(period, REPORTED_EMPLOYEE_IDS), filters);
    const totalActive = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0) || 1;

    const keys =
      scope === 'project'
        ? [...new Set(slices.map((slice) => slice.projectId ?? '__none__'))]
        : [...new Set(slices.map((slice) => slice.divisionId))];

    const lines: CostLineView[] = keys.map((key) => {
      const group =
        scope === 'project'
          ? slices.filter((slice) => (slice.projectId ?? '__none__') === key)
          : slices.filter((slice) => slice.divisionId === key);

      const activeMinutes = group.reduce((sum, slice) => sum + slice.activeMinutes, 0);
      const overtimeMinutes = [...new Set(group.map((slice) => `${slice.employeeId}|${slice.date}`))]
        .map((composite) => {
          const [employeeId, date] = composite.split('|');
          return overtimeMinutesOf(summaryFor(employeeId, date));
        })
        .reduce((sum, minutes) => sum + minutes, 0);

      const cost = costOfSlices(group);
      const project: Project | undefined =
        scope === 'project' ? PROJECTS.find((item) => item.id === key) : undefined;

      const budget: Money =
        scope === 'project'
          ? project?.budget?.visible
            ? project.budget.value
            : ZERO_BDT
          : { amount: DIVISION_BUDGETS[key] ?? '0.00', currency: 'BDT' };

      const division =
        scope === 'project'
          ? divisionRef(project?.divisionId ?? '')
          : divisionRef(key);

      return {
        key,
        label:
          scope === 'project'
            ? project
              ? `${project.code} · ${project.name}`
              : UNASSIGNED_LABEL
            : division.name,
        secondaryLabel: scope === 'project' ? division.name : `${division.code} division`,
        active: toDurationView(activeMinutes),
        overtime: toDurationView(overtimeMinutes),
        cost: moneyView(cost, allowed),
        budget: moneyView(budget, allowed),
        variance: moneyView(subtractMoney(cost, budget), allowed),
        variancePercent: allowed ? variancePercent(cost, budget) : null,
        estimated: project ? toDurationView(project.estimatedMinutes) : null,
        estimateVariancePercent: project?.estimatedMinutes
          ? Math.round(
              ((activeMinutes - project.estimatedMinutes) / project.estimatedMinutes) * 100,
            )
          : null,
        sharePercent: Math.round((activeMinutes / totalActive) * 100),
        isRestrictedScope: division.isRestricted,
        drillDown: [
          ...new Set(group.map((slice) => slice.employeeId)),
        ].map((employeeId) => {
          const own = group.filter((slice) => slice.employeeId === employeeId);
          return {
            key: employeeId,
            label: employeeRef(employeeId).fullName,
            active: toDurationView(own.reduce((sum, slice) => sum + slice.activeMinutes, 0)),
            cost: moneyView(costOfSlices(own), allowed),
          };
        }),
      };
    });

    const totalCost = costOfSlices(slices);
    const totalBudget = sumMoney(lines.map((line) => (line.budget.visible ? line.budget.value : ZERO_BDT)));

    return success<CostAnalysisView>({
      scope,
      period,
      unverifiedWarning: unverifiedWarningFor(period),
      hasFinancialPermission: allowed,
      restrictionNote: allowed ? null : COST_RESTRICTION_NOTE,
      lines: lines.sort((a, b) => b.active.minutes - a.active.minutes),
      totalActive: toDurationView(totalActive),
      totalCost: moneyView(totalCost, allowed),
      totalBudget: moneyView(totalBudget, allowed),
      totalVariance: moneyView(subtractMoney(totalCost, totalBudget), allowed),
      totalVariancePercent: allowed ? variancePercent(totalCost, totalBudget) : null,
      trend: allPeriods().map((candidate) => {
        const candidateSlices = slicesFor(candidate, REPORTED_EMPLOYEE_IDS);
        return {
          periodLabel: candidate.label,
          active: toDurationView(
            candidateSlices.reduce((sum, slice) => sum + slice.activeMinutes, 0),
          ),
          cost: moneyView(costOfSlices(candidateSlices), allowed),
        };
      }),
    });
  },

  async getBillableAnalysis(userId, filters) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(filters.periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const slices = applyFilters(slicesFor(period, REPORTED_EMPLOYEE_IDS), filters);

    const billableSlices = slices.filter((slice) => isBillable(slice.projectId));
    const nonBillableSlices = slices.filter((slice) => !isBillable(slice.projectId));
    const billableMinutes = billableSlices.reduce((sum, slice) => sum + slice.activeMinutes, 0);
    const nonBillableMinutes = nonBillableSlices.reduce(
      (sum, slice) => sum + slice.activeMinutes,
      0,
    );
    const totalVerifiedMinutes = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0);
    const sumMinutes = billableMinutes + nonBillableMinutes;

    const projectKeys = [...new Set(slices.map((slice) => slice.projectId ?? '__none__'))];

    return success<BillableSplitView>({
      period,
      unverifiedWarning: unverifiedWarningFor(period),
      hasFinancialPermission: allowed,
      billable: toDurationView(billableMinutes),
      nonBillable: toDurationView(nonBillableMinutes),
      totalVerified: toDurationView(totalVerifiedMinutes),
      billablePercent: totalVerifiedMinutes
        ? Math.round((billableMinutes / totalVerifiedMinutes) * 100)
        : 0,
      reconciliation: {
        billableMinutes,
        nonBillableMinutes,
        sumMinutes,
        totalVerifiedMinutes,
        differenceMinutes: sumMinutes - totalVerifiedMinutes,
        balances: sumMinutes === totalVerifiedMinutes,
      },
      lines: projectKeys.map((key) => {
        const group = slices.filter((slice) => (slice.projectId ?? '__none__') === key);
        const project = key === '__none__' ? null : projectRef(key);
        const minutes = group.reduce((sum, slice) => sum + slice.activeMinutes, 0);
        const billable = isBillable(key === '__none__' ? null : key);
        return {
          key,
          label: project ? `${project.code} · ${project.name}` : UNASSIGNED_LABEL,
          division: divisionRef(project?.divisionId ?? group[0]?.divisionId ?? ''),
          isBillable: billable,
          nonBillableReason: billable
            ? null
            : NON_BILLABLE_REASON[key] ?? 'No billable project recorded against this time.',
          active: toDurationView(minutes),
          sharePercent: totalVerifiedMinutes
            ? Math.round((minutes / totalVerifiedMinutes) * 100)
            : 0,
          cost: moneyView(costOfSlices(group), allowed),
        };
      }),
      billableCost: moneyView(costOfSlices(billableSlices), allowed),
      nonBillableCost: moneyView(costOfSlices(nonBillableSlices), allowed),
      totalCost: moneyView(costOfSlices(slices), allowed),
    });
  },

  async getPayrollSummary(userId, periodId) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const timesheetPeriod = mockStore.findPeriod(period.timesheetPeriodId);
    const slices = slicesFor(period, REPORTED_EMPLOYEE_IDS);
    const summaries = summariesFor(period, REPORTED_EMPLOYEE_IDS);
    const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);

    const rows = REPORTED_EMPLOYEE_IDS.map((employeeId) => {
      const own = slices.filter((slice) => slice.employeeId === employeeId);
      const ownSummaries = datesIn(period.startDate, period.endDate).map((date) =>
        summaryFor(employeeId, date),
      );
      const ownTotals = aggregateSummaries(
        ownSummaries,
        STANDARD_POLICY.overtimeThresholdMinutes,
      );
      return {
        employee: employeeRef(employeeId),
        divisionCodes: [
          ...new Set(own.map((slice) => divisionRef(slice.divisionId).code)),
        ],
        active: toDurationView(ownTotals.activeMinutes),
        overtime: toDurationView(ownTotals.overtimeMinutes),
        dayCount: new Set(own.map((slice) => slice.date)).size,
        exceptionCount:
          ownTotals.missingDayCount + ownTotals.underTimeDayCount + ownTotals.criticalDayCount,
        hourlyRate: moneyView(hourlyRateFor(employeeId), allowed),
        cost: moneyView(costOfSlices(own), allowed),
      };
    }).filter((row) => row.dayCount > 0 || row.exceptionCount > 0);

    const blockers: string[] = [];
    if (!period.isVerified) {
      blockers.push(
        `${period.label} is not verified. HR must verify the payroll period before an export can be produced.`,
      );
    }
    if (!allowed) {
      blockers.push(
        'A payroll export includes rate and cost columns, which need the financial-detail permission.',
      );
    }
    if (!canExportProtected(userId)) {
      blockers.push(
        'Exporting protected fields needs the export-protected permission, granted separately from Finance access.',
      );
    }

    return success<PayrollSummaryView>({
      period,
      timesheetStatusLabel:
        timesheetPeriod?.status === 'verified'
          ? 'Verified and locked'
          : timesheetPeriod?.status === 'amended'
            ? 'Amended after verification'
            : timesheetPeriod?.status === 'pending_verification'
              ? 'Pending verification'
              : 'Open',
      isVerified: period.isVerified,
      verifiedAtLabel: timesheetPeriod?.verifiedAt
        ? formatTimestamp(timesheetPeriod.verifiedAt)
        : null,
      verifiedByLabel: timesheetPeriod?.verifiedBy?.displayName ?? null,
      unverifiedWarning: unverifiedWarningFor(period),
      policyVersion: timesheetPeriod?.policyVersion ?? STANDARD_POLICY.version,
      employeeCount: rows.length,
      totalActive: toDurationView(totals.activeMinutes),
      totalOvertime: toDurationView(totals.overtimeMinutes),
      totalCost: moneyView(costOfSlices(slices), allowed),
      exceptions: [
        { label: 'Missing days', count: totals.missingDayCount, tone: 'negative' as const },
        { label: 'Under-time days', count: totals.underTimeDayCount, tone: 'caution' as const },
        { label: 'Overtime days', count: totals.overtimeDayCount, tone: 'caution' as const },
        { label: 'Critical days', count: totals.criticalDayCount, tone: 'negative' as const },
      ],
      exportBlockers: blockers,
      canExport: blockers.length === 0,
      canExportProtected: canExportProtected(userId),
      rows,
      exportHistory: exportJobs.map((job) => exportJobView(job, userId)),
      auditTrail: [
        ...(timesheetPeriod?.verifiedAt
          ? [
              {
                label: 'Timesheet period verified',
                actorLabel: timesheetPeriod.verifiedBy?.displayName ?? 'HR',
                atLabel: formatTimestamp(timesheetPeriod.verifiedAt),
              },
            ]
          : []),
        ...exportJobs
          .filter((job) => job.reportKey === 'payroll-summary')
          .map((job) => ({
            label: `Payroll export ${EXPORT_STATE_LABEL[job.state].toLowerCase()}`,
            actorLabel: job.requestedBy,
            atLabel: formatTimestamp(job.requestedAt),
          })),
      ],
      hasFinancialPermission: allowed,
    });
  },

  async previewReport(userId, filters) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(filters.periodId);
    if (!period) return notFound('Payroll period not found.');

    const allowed = canViewCost(userId);
    const groupBy = filters.groupBy ?? 'employee';
    const slices = applyFilters(slicesFor(period, REPORTED_EMPLOYEE_IDS), {
      divisionIds: filters.divisionIds,
    });

    const keys = [
      ...new Set(
        slices.map((slice) =>
          groupBy === 'employee'
            ? slice.employeeId
            : groupBy === 'division'
              ? slice.divisionId
              : slice.projectId ?? '__none__',
        ),
      ),
    ];

    const rows = keys.map((key) => {
      const group = slices.filter((slice) =>
        groupBy === 'employee'
          ? slice.employeeId === key
          : groupBy === 'division'
            ? slice.divisionId === key
            : (slice.projectId ?? '__none__') === key,
      );
      const minutes = group.reduce((sum, slice) => sum + slice.activeMinutes, 0);
      const overtime = [...new Set(group.map((slice) => `${slice.employeeId}|${slice.date}`))]
        .map((composite) => {
          const [employeeId, date] = composite.split('|');
          return overtimeMinutesOf(summaryFor(employeeId, date));
        })
        .reduce((sum, value) => sum + value, 0);
      const cost = costOfSlices(group);
      const project = groupBy === 'project' && key !== '__none__' ? projectRef(key) : null;

      return {
        name:
          groupBy === 'employee'
            ? employeeRef(key).fullName
            : groupBy === 'division'
              ? divisionRef(key).name
              : project
                ? `${project.code} · ${project.name}`
                : UNASSIGNED_LABEL,
        active: toDurationView(minutes).display,
        overtime: toDurationView(overtime).display,
        // A restricted cell says so; it is never blank and never zero.
        cost: allowed ? formatMoney(cost) : 'Restricted',
      };
    });

    const totalCost = costOfSlices(slices);
    const totalMinutes = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0);

    return success<FinanceReportPreviewView>({
      reportKey: filters.reportKey ?? 'payroll-summary',
      title:
        filters.reportKey === 'employee-hours'
          ? 'Employee hours'
          : filters.reportKey === 'project-costs'
            ? 'Project labour cost'
            : 'Payroll summary',
      periodLabel: period.label,
      rangeLabel: period.rangeLabel,
      filterSummary: [
        { label: 'Period', value: period.label },
        {
          label: 'Divisions',
          value: filters.divisionIds?.length
            ? filters.divisionIds.map((id) => divisionRef(id).code).join(', ')
            : 'All divisions',
        },
        { label: 'Grouped by', value: groupBy },
        { label: 'Verification', value: period.isVerified ? 'Verified only' : 'Includes unverified data' },
      ],
      timezone: STANDARD_POLICY.businessTimezone,
      generatedAtLabel: formatTimestamp(new Date().toISOString()),
      policyVersion: STANDARD_POLICY.version,
      unverifiedWarning: unverifiedWarningFor(period),
      restrictionNote: allowed ? null : COST_RESTRICTION_NOTE,
      columns: [
        { field: 'name', label: groupBy === 'employee' ? 'Employee' : groupBy === 'division' ? 'Division' : 'Project', align: 'left', restricted: false },
        { field: 'active', label: 'Active hours', align: 'right', restricted: false },
        { field: 'overtime', label: 'Overtime', align: 'right', restricted: false },
        { field: 'cost', label: 'Labour cost', align: 'right', restricted: !allowed },
      ],
      rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
      totals: {
        name: 'Total',
        active: toDurationView(totalMinutes).display,
        overtime: toDurationView(
          aggregateSummaries(
            summariesFor(period, REPORTED_EMPLOYEE_IDS),
            STANDARD_POLICY.overtimeThresholdMinutes,
          ).overtimeMinutes,
        ).display,
        cost: allowed ? formatMoney(totalCost) : 'Restricted',
      },
      rowCount: rows.length,
      hasFinancialPermission: allowed,
    });
  },

  async requestExport(userId, configuration) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);

    const period = resolvePeriod(configuration.periodId);
    if (!period) return notFound('Payroll period not found.');

    if (configuration.includeProtectedFields && !canViewCost(userId)) {
      return denied(
        'This export includes cost and rate columns.',
        'Ask an administrator to grant finance.cost.view, or export the hours-only version.',
      );
    }
    if (configuration.includeProtectedFields && !canExportProtected(userId)) {
      return denied(
        'Exporting protected fields needs the export-protected permission.',
        'Ask an administrator to grant reporting.export.protected, or export the hours-only version.',
      );
    }
    if (!period.isVerified && configuration.includeProtectedFields) {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: `${period.label} is not verified.`,
        guidance:
          'A cost export needs a verified period so the figures cannot change after the file is produced. Ask HR to verify the period first.',
      };
    }

    const now = new Date().toISOString();
    const job: ExportJobFixture = {
      id: `exp-${Date.now()}`,
      reportKey: configuration.reportKey,
      reportTitle: `${configuration.reportKey.replace('-', ' ')} — ${period.label}`,
      format: configuration.format,
      requestedAt: now,
      requestedBy: viewerOf(userId)?.fullName ?? 'Finance',
      filterSummary: `Period ${period.label} · ${
        configuration.divisionIds.length
          ? configuration.divisionIds.map((id) => divisionRef(id).code).join(', ')
          : 'all divisions'
      } · ${configuration.includeProtectedFields ? 'includes cost columns' : 'hours only'}`,
      // Deliberately queued and never completed during the frontend milestone.
      state: 'queued',
      readyAt: null,
      expiresAt: null,
      failureMessage: null,
      includesProtectedFields: configuration.includeProtectedFields,
    };
    exportJobs = [job, ...exportJobs];

    return success({
      job: exportJobView(job, userId),
      simulationNote:
        'Export configuration recorded. No file is produced during the frontend milestone — the job stays queued until the backend export worker exists (BE-0705).',
    });
  },

  async listExports(userId) {
    await delay();
    if (!canViewFinance(userId)) return denied(FINANCE_DENIAL.message, FINANCE_DENIAL.guidance);
    return success(exportJobs.map((job) => exportJobView(job, userId)));
  },
};

/* -------------------------------------------------------------------------- */
/* Management service                                                         */
/* -------------------------------------------------------------------------- */

function canViewManagement(userId: string): boolean {
  const role = viewerOf(userId)?.primaryRole;
  return role === 'management' || role === 'super_admin';
}

export const mockManagementService: ManagementService = {
  async getDashboard(userId, periodId) {
    await delay();
    if (!canViewManagement(userId)) {
      return denied(
        'The management overview is limited to the Management role.',
        'Return to your dashboard for the views available to your role.',
      );
    }

    const period = resolvePeriod(periodId);
    if (!period) return notFound('Period not found.');

    const slices = slicesFor(period, REPORTED_EMPLOYEE_IDS);
    const summaries = summariesFor(period, REPORTED_EMPLOYEE_IDS);
    const totals = aggregateSummaries(summaries, STANDARD_POLICY.overtimeThresholdMinutes);
    const totalActive = slices.reduce((sum, slice) => sum + slice.activeMinutes, 0) || 1;

    const divisionIds = [...new Set(slices.map((slice) => slice.divisionId))];
    const divisionSummaries = divisionIds.map((divisionId) => {
      const minutes = slices
        .filter((slice) => slice.divisionId === divisionId)
        .reduce((sum, slice) => sum + slice.activeMinutes, 0);
      return {
        division: divisionRef(divisionId),
        active: toDurationView(minutes),
        sharePercent: Math.round((minutes / totalActive) * 100),
      };
    });

    return success<ManagementDashboard>({
      period,
      availablePeriods: allPeriods(),
      unverifiedWarning: unverifiedWarningFor(period),
      periodLabel: period.label,
      companyMetrics: [
        {
          key: 'active-hours',
          label: 'Recorded active hours',
          value: toDurationView(totals.activeMinutes).display,
          secondaryValue: period.isVerified ? 'Verified period' : 'Not verified',
        },
        {
          key: 'employees',
          label: 'Employees with recorded time',
          value: String(new Set(slices.map((slice) => slice.employeeId)).size),
        },
        {
          key: 'complete-days',
          label: 'Complete days',
          value: String(totals.completeDayCount),
        },
        {
          key: 'exceptions',
          label: 'Exception days',
          value: String(
            totals.missingDayCount + totals.underTimeDayCount + totals.criticalDayCount,
          ),
          tone: 'caution',
        },
      ],
      divisionSummaries,
      employeeSummaryCount: new Set(slices.map((slice) => slice.employeeId)).size,
      timeAllocation: divisionSummaries,
      projectProgress: PROJECTS.filter((project) =>
        slices.some((slice) => slice.projectId === project.id),
      ).map((project) => {
        const minutes = slices
          .filter((slice) => slice.projectId === project.id)
          .reduce((sum, slice) => sum + slice.activeMinutes, 0);
        return {
          project: {
            id: project.id,
            name: project.name,
            code: project.code,
            divisionId: project.divisionId,
          },
          completionPercent: project.completionPercent,
          estimated: toDurationView(project.estimatedMinutes),
          actual: toDurationView(minutes),
          variancePercent: project.estimatedMinutes
            ? Math.round(((minutes - project.estimatedMinutes) / project.estimatedMinutes) * 100)
            : null,
          status: project.status,
          // Cost is outside a view-only mandate, so it is restricted for this
          // role regardless of any permission grant.
          budget: { visible: false, reason: 'permission_required' },
          href: `/projects/${project.id}`,
        };
      }),
      employeeSummaries: REPORTED_EMPLOYEE_IDS.map((employeeId) => {
        const own = slices.filter((slice) => slice.employeeId === employeeId);
        const ownTotals = aggregateSummaries(
          datesIn(period.startDate, period.endDate).map((date) =>
            summaryFor(employeeId, date),
          ),
          STANDARD_POLICY.overtimeThresholdMinutes,
        );
        return {
          employee: employeeRef(employeeId),
          divisionCodes: [...new Set(own.map((slice) => divisionRef(slice.divisionId).code))],
          active: toDurationView(ownTotals.activeMinutes),
          completeDayCount: ownTotals.completeDayCount,
          exceptionCount:
            ownTotals.missingDayCount +
            ownTotals.underTimeDayCount +
            ownTotals.criticalDayCount,
        };
      }),
      restrictedTiles: [
        {
          key: 'labour-cost',
          label: 'Labour cost',
          value: 'Restricted',
          restricted: true,
        },
        {
          key: 'payroll',
          label: 'Payroll total',
          value: 'Restricted',
          restricted: true,
        },
      ],
      readOnlyNote:
        'This role is read-only throughout. There is no edit, approve, verify, override or export action on any management screen.',
    });
  },
};

/** Test seam: restores the Phase 6 demo state. */
export function resetFinanceState(): void {
  exportJobs = [...EXPORT_JOBS];
}
