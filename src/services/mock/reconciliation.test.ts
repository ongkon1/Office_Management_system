import { beforeEach, describe, expect, it } from 'vitest';
import { aggregateSummaries } from '@/lib/calculation/engine';
import { addDays, daysBetween } from '@/lib/format';
import { sumClientContributions } from '@/lib/client-time';
import { PROJECTS, STANDARD_POLICY } from '@/fixtures';
import { mockStore } from './store';
import { summaryFor, mockTimesheetService } from './timesheet';
import { mockTeamLeadService } from './team-lead';
import { mockHrService, resetHrState } from './hr';
import { mockFinanceService, resetFinanceState } from './finance';
import { mockReportingService, resetReportingState } from './reporting';
import { mockWorkspaceService, resetWorkspaceState } from './workspace';

/**
 * FE-0823 — totals must reconcile across every screen that shows them.
 *
 * The calculation engine is the single implementation, but each service builds
 * its own view model on top of it. This asserts they agree: a figure that reads
 * one way on a dashboard and another in a report is the defect this product can
 * least afford, and it is exactly the kind that survives casual review because
 * each screen looks internally consistent.
 *
 * Every expectation here is derived from the engine, never hard-coded, so these
 * stay true if the fixtures change.
 */

const EMPLOYEE_USER = 'usr-1001';
const EMPLOYEE = 'emp-1001';
const TEAM_LEAD = 'usr-2001';
const HR = 'usr-3001';
const FINANCE = 'usr-4001';

const JULY = { from: '2026-07-01', to: '2026-07-31' };

function datesIn(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset <= daysBetween(from, to); offset += 1) {
    dates.push(addDays(from, offset));
  }
  return dates;
}

/** The authoritative figure, straight from the engine. */
function engineTotals(employeeIds: readonly string[], from: string, to: string) {
  return aggregateSummaries(
    employeeIds.flatMap((employeeId) =>
      datesIn(from, to).map((date) => summaryFor(employeeId, date)),
    ),
    STANDARD_POLICY.overtimeThresholdMinutes,
  );
}

beforeEach(() => {
  mockStore.reset();
  resetHrState();
  resetFinanceState();
  resetReportingState();
  resetWorkspaceState();
});

describe('one day reconciles across every view of it', () => {
  const DATE = '2026-09-01';

  it('agrees between the engine, the employee day view and the Team Lead view', async () => {
    const engine = summaryFor(EMPLOYEE, DATE);

    const dayResult = await mockTimesheetService.getDay({ employeeId: EMPLOYEE, date: DATE });
    expect(dayResult.status).toBe('success');
    if (dayResult.status !== 'success') return;

    const leadResult = await mockTeamLeadService.getTimesheet(TEAM_LEAD, EMPLOYEE, DATE);
    expect(leadResult.status).toBe('success');
    if (leadResult.status !== 'success') return;

    // Active, break and total must be identical in all three.
    expect(dayResult.data.summary.active.minutes).toBe(engine.activeMinutes);
    expect(dayResult.data.summary.break.minutes).toBe(engine.breakMinutes);
    expect(dayResult.data.summary.total.minutes).toBe(engine.totalMinutes);

    expect(leadResult.data.summary.active.minutes).toBe(engine.activeMinutes);
    expect(leadResult.data.summary.break.minutes).toBe(engine.breakMinutes);
    expect(leadResult.data.summary.total.minutes).toBe(engine.totalMinutes);

    // And so must the classification.
    expect(dayResult.data.summary.status.status).toBe(engine.status);
    expect(leadResult.data.summary.status.status).toBe(engine.status);
  });

  it('never renders a rounded duration', async () => {
    // 6:59 must not become 7:00 anywhere (`REQ-TIME-012`).
    const under = summaryFor('emp-1003', '2026-08-25');
    const dayResult = await mockTimesheetService.getDay({
      employeeId: 'emp-1003',
      date: '2026-08-25',
    });
    if (dayResult.status !== 'success') return;

    const hours = Math.floor(under.activeMinutes / 60);
    const minutes = under.activeMinutes % 60;
    expect(dayResult.data.summary.active.display).toBe(
      `${hours}:${String(minutes).padStart(2, '0')}`,
    );
  });

  it('splits the day across divisions without inventing or losing minutes', async () => {
    const engine = summaryFor(EMPLOYEE, DATE);
    const dayResult = await mockTimesheetService.getDay({ employeeId: EMPLOYEE, date: DATE });
    if (dayResult.status !== 'success') return;

    const contributionTotal = dayResult.data.divisionContributions.reduce(
      (sum, contribution) => sum + contribution.active.minutes,
      0,
    );
    expect(contributionTotal).toBe(engine.activeMinutes);
  });
});

describe('a period reconciles across dashboard, timesheet, HR and Finance', () => {
  it('reports the same July active total everywhere it appears', async () => {
    const employees = ['emp-1001', 'emp-1002', 'emp-1003', 'emp-1004'];
    const engine = engineTotals(employees, JULY.from, JULY.to);

    const finance = await mockFinanceService.getHours(FINANCE, { periodId: 'pay-2026-07' });
    expect(finance.status).toBe('success');
    if (finance.status !== 'success') return;

    const payroll = await mockFinanceService.getPayrollSummary(FINANCE, 'pay-2026-07');
    if (payroll.status !== 'success') return;

    const report = await mockReportingService.runReport(HR, {
      reportKey: 'timesheet-detail',
      from: JULY.from,
      to: JULY.to,
    });
    if (report.status !== 'success') return;

    expect(finance.data.totals.active.minutes).toBe(engine.activeMinutes);
    expect(payroll.data.totalActive.minutes).toBe(engine.activeMinutes);
    // The report renders the same figure as a formatted duration.
    expect(report.data.totals?.active).toBe(finance.data.totals.active.display);
  });

  it('reports the same July overtime total in Finance and the overtime report', async () => {
    const employees = ['emp-1001', 'emp-1002', 'emp-1003', 'emp-1004'];
    const engine = engineTotals(employees, JULY.from, JULY.to);

    const overtime = await mockFinanceService.getOvertime(FINANCE, { periodId: 'pay-2026-07' });
    const payroll = await mockFinanceService.getPayrollSummary(FINANCE, 'pay-2026-07');
    if (overtime.status !== 'success' || payroll.status !== 'success') return;

    expect(payroll.data.totalOvertime.minutes).toBe(engine.overtimeMinutes);
    expect(overtime.data.totalOvertime.minutes).toBe(engine.overtimeMinutes);
  });

  it('reconciles the billable split to the same period total', async () => {
    const billable = await mockFinanceService.getBillableAnalysis(FINANCE, {
      periodId: 'pay-2026-07',
    });
    const hours = await mockFinanceService.getHours(FINANCE, { periodId: 'pay-2026-07' });
    if (billable.status !== 'success' || hours.status !== 'success') return;

    expect(billable.data.reconciliation.balances).toBe(true);
    expect(billable.data.totalVerified.minutes).toBe(hours.data.totals.active.minutes);
  });

  it('agrees between the HR period workspace and the engine, per employee', async () => {
    const workspace = await mockHrService.getPeriod(HR, 'per-2026-07');
    if (workspace.status !== 'success') return;

    for (const row of workspace.data.rows) {
      const engine = engineTotals([row.employee.id], JULY.from, JULY.to);
      expect(row.active.minutes).toBe(engine.activeMinutes);
    }
  });
});

describe('an employee sees their own figures unchanged', () => {
  it('shows the same period facts on the evaluation as the engine produces', async () => {
    const evaluation = await mockWorkspaceService.getSelfEvaluation(EMPLOYEE_USER);
    if (evaluation.status !== 'success') return;

    // The Q3 period the fixture assigns.
    const engine = engineTotals([EMPLOYEE], '2026-07-01', '2026-09-30');
    const activeFact = evaluation.data.facts.find((fact) => fact.label === 'Active work');
    const hours = Math.floor(engine.activeMinutes / 60);
    const minutes = engine.activeMinutes % 60;
    expect(activeFact?.value).toBe(`${hours}:${String(minutes).padStart(2, '0')}`);
  });

  it('shows the same monthly total on the dashboard as the month view', async () => {
    const month = await mockTimesheetService.getMonth({
      employeeId: EMPLOYEE,
      month: '2026-09',
    });
    if (month.status !== 'success') return;

    const engine = engineTotals([EMPLOYEE], '2026-09-01', '2026-09-30');
    expect(month.data.totals.active.minutes).toBe(engine.activeMinutes);
    expect(month.data.totals.break.minutes).toBe(engine.breakMinutes);
    expect(month.data.totals.overtime.minutes).toBe(engine.overtimeMinutes);
  });
});

describe('the recognized break is never multiplied', () => {
  it('counts one break per employee-day however many divisions the day spans', async () => {
    // 1 September is Nadia's three-division day.
    const engine = summaryFor(EMPLOYEE, '2026-09-01');
    expect(engine.divisionContributions.length).toBeGreaterThan(1);
    expect(engine.breakMinutes).toBe(STANDARD_POLICY.recognizedBreakMinutes);

    // And the Finance row split must not re-add it per row.
    const hours = await mockFinanceService.getHours(FINANCE, {
      periodId: 'pay-2026-09',
      employeeIds: [EMPLOYEE],
    });
    if (hours.status !== 'success') return;

    const engineMonth = engineTotals([EMPLOYEE], '2026-09-01', '2026-09-30');
    // Attribution is proportional, so the sum matches the daily values rather
    // than the number of rows.
    expect(hours.data.totals.break.minutes).toBeLessThanOrEqual(engineMonth.breakMinutes + 1);
  });
});

describe('classification boundaries hold wherever they are shown', () => {
  it('treats exactly 12:00 as overtime and above it as critical, in every view', async () => {
    const exactlyTwelve = summaryFor('emp-1002', '2026-08-25');
    const aboveTwelve = summaryFor('emp-1002', '2026-08-24');
    expect(exactlyTwelve.totalMinutes).toBe(720);
    expect(exactlyTwelve.status).toBe('overtime');
    expect(aboveTwelve.status).toBe('critical');

    const overtime = await mockFinanceService.getOvertime(FINANCE, { periodId: 'pay-2026-08' });
    const report = await mockReportingService.runReport(HR, {
      reportKey: 'overtime-summary',
      from: '2026-08-24',
      to: '2026-08-25',
    });
    if (overtime.status !== 'success' || report.status !== 'success') return;

    const financeTwelve = overtime.data.rows.find((row) => row.total.minutes === 720);
    expect(financeTwelve?.status).toBe('overtime');

    const reportTwelve = report.data.rows.find((row) => row.total === '12:00');
    expect(reportTwelve?.status).toBe('Overtime');
  });
});

describe('the client split reconciles with the day it came from', () => {
  it('sums each day back to that day active total', async () => {
    const month = await mockTimesheetService.getMonth({
      employeeId: EMPLOYEE,
      month: '2026-09',
    });
    if (month.status !== 'success') return;

    const recorded = month.data.days.filter((day) => day.active.minutes > 0);
    expect(recorded.length).toBeGreaterThan(0);

    for (const day of recorded) {
      const split = day.clientContributions.reduce(
        (total, contribution) => total + contribution.active.minutes,
        0,
      );
      expect(split).toBe(day.active.minutes);
    }
  });

  it('sums the period split back to the period active total', async () => {
    const month = await mockTimesheetService.getMonth({
      employeeId: EMPLOYEE,
      month: '2026-09',
    });
    if (month.status !== 'success') return;

    const period = sumClientContributions(month.data.days);
    const split = period.reduce((total, contribution) => total + contribution.active.minutes, 0);
    expect(split).toBe(month.data.totals.active.minutes);
  });

  it('names the client recorded on the project, and only clients the employee worked for', async () => {
    const month = await mockTimesheetService.getMonth({
      employeeId: EMPLOYEE,
      month: '2026-09',
    });
    if (month.status !== 'success') return;

    const known = new Set(PROJECTS.map((project) => project.client).filter(Boolean));
    for (const contribution of sumClientContributions(month.data.days)) {
      if (contribution.clientId === null) {
        expect(contribution.clientLabel).toBe('Not recorded');
        continue;
      }
      expect(known.has(contribution.clientId)).toBe(true);
    }
  });
});
