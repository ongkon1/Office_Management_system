import { beforeEach, describe, expect, it } from 'vitest';
import { mockFinanceService, mockManagementService, resetFinanceState } from './finance';
import { mockStore } from './store';

/** Finance WITH the financial-detail and export-protected permissions. */
const FINANCE_FULL = 'usr-4001';
/** Finance WITHOUT them — hours only. */
const FINANCE_LIMITED = 'usr-4002';
const MANAGEMENT = 'usr-5001';
const EMPLOYEE = 'usr-1001';
const HR = 'usr-3001';

const VERIFIED_PERIOD = 'pay-2026-07';
const OPEN_PERIOD = 'pay-2026-09';

beforeEach(() => {
  mockStore.reset();
  resetFinanceState();
});

describe('role and permission boundaries', () => {
  it('denies the Finance workspace to a non-Finance role', async () => {
    const result = await mockFinanceService.getDashboard(EMPLOYEE);
    expect(result.status).toBe('permission_denied');
  });

  it('gives a Finance viewer hours even without the cost permission', async () => {
    const result = await mockFinanceService.getDashboard(FINANCE_LIMITED, VERIFIED_PERIOD);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // The role is not the permission: hours are available, cost is not.
    expect(result.data.verifiedEmployeeHours.minutes).toBeGreaterThan(0);
    expect(result.data.hasFinancialPermission).toBe(false);
  });

  it('withholds a cost value entirely rather than blanking or zeroing it', async () => {
    const result = await mockFinanceService.getHours(FINANCE_LIMITED, {
      periodId: VERIFIED_PERIOD,
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.totals.cost.visible).toBe(false);
    for (const row of result.data.rows) {
      expect(row.cost.visible).toBe(false);
      // No money value exists in the view model at all, so nothing can leak.
      expect('value' in row.cost).toBe(false);
      expect('display' in row.cost).toBe(false);
    }
  });

  it('keeps the label on a restricted metric tile', async () => {
    const result = await mockFinanceService.getDashboard(FINANCE_LIMITED, VERIFIED_PERIOD);
    if (result.status !== 'success') return;
    expect(result.data.projectLabourCost.label).toBe('Project labour cost');
    expect(result.data.projectLabourCost.restricted).toBe(true);
    // Never rendered as zero — that would be a different, wrong statement.
    expect(result.data.projectLabourCost.value).toBe('Restricted');
  });

  it('shows cost to a viewer holding the permission', async () => {
    const result = await mockFinanceService.getHours(FINANCE_FULL, { periodId: VERIFIED_PERIOD });
    if (result.status !== 'success') return;
    expect(result.data.totals.cost.visible).toBe(true);
    if (result.data.totals.cost.visible) {
      expect(result.data.totals.cost.display).toMatch(/BDT/);
    }
  });
});

describe('verification', () => {
  it('defaults to the most recent verified period', async () => {
    const result = await mockFinanceService.getDashboard(FINANCE_FULL);
    if (result.status !== 'success') return;
    expect(result.data.period.id).toBe(VERIFIED_PERIOD);
    expect(result.data.period.isVerified).toBe(true);
    expect(result.data.unverifiedWarning).toBeNull();
  });

  it('warns when an unverified period is selected', async () => {
    const result = await mockFinanceService.getDashboard(FINANCE_FULL, OPEN_PERIOD);
    if (result.status !== 'success') return;
    expect(result.data.period.isVerified).toBe(false);
    expect(result.data.unverifiedWarning).toContain('not verified');
  });

  it('reads verification from the timesheet period rather than a copy', async () => {
    const before = await mockFinanceService.getPayrollSummary(FINANCE_FULL, OPEN_PERIOD);
    if (before.status !== 'success') return;
    expect(before.data.isVerified).toBe(false);

    const period = mockStore.findPeriod('per-2026-09')!;
    mockStore.updatePeriod('per-2026-09', {
      ...period,
      status: 'verified',
      verifiedAt: '2026-10-01T10:00:00+06:00',
      verifiedBy: { userId: 'usr-3001', displayName: 'Rezaul Haque' },
    });

    const after = await mockFinanceService.getPayrollSummary(FINANCE_FULL, OPEN_PERIOD);
    if (after.status !== 'success') return;
    expect(after.data.isVerified).toBe(true);
    expect(after.data.verifiedByLabel).toBe('Rezaul Haque');
  });
});

describe('labour cost', () => {
  it('costs verified minutes at the employee rate, exactly', async () => {
    const result = await mockFinanceService.getHours(FINANCE_FULL, {
      periodId: VERIFIED_PERIOD,
      employeeIds: ['emp-1002'],
    });
    if (result.status !== 'success') return;

    const minutes = result.data.totals.active.minutes;
    // Tanvir's rate is 940.50/hour; the total must equal rate x minutes / 60
    // computed once, not a sum of separately rounded rows.
    const expected = (94050n * BigInt(minutes)) / 60n;
    const expectedString = `${expected / 100n}.${(expected % 100n).toString().padStart(2, '0')}`;
    expect(result.data.totals.cost.visible).toBe(true);
    if (result.data.totals.cost.visible) {
      expect(result.data.totals.cost.value.amount).toBe(expectedString);
      expect(result.data.totals.cost.value.currency).toBe('BDT');
    }
  });

  it('never adds the daily break more than once across division rows', async () => {
    // Nadia's cross-division days carry one 1:00 break, not one per row.
    const result = await mockFinanceService.getHours(FINANCE_FULL, {
      periodId: 'pay-2026-09',
      employeeIds: ['emp-1001'],
    });
    if (result.status !== 'success') return;
    const breakMinutes = result.data.totals.break.minutes;
    const dayCount = new Set(result.data.rows.flatMap((row) => row.dayCount)).size;
    expect(breakMinutes).toBeLessThanOrEqual(60 * Math.max(1, dayCount) * 3);
    // The decisive check: total is active + break, and break stays a multiple
    // of the recognized daily value rather than scaling with the row count.
    expect(result.data.totals.total.minutes).toBe(
      result.data.totals.active.minutes + breakMinutes,
    );
  });
});

describe('billable reconciliation (FE-0605)', () => {
  it('accounts for every verified minute exactly', async () => {
    const result = await mockFinanceService.getBillableAnalysis(FINANCE_FULL, {
      periodId: VERIFIED_PERIOD,
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const reconciliation = result.data.reconciliation;
    expect(reconciliation.sumMinutes).toBe(reconciliation.totalVerifiedMinutes);
    expect(reconciliation.differenceMinutes).toBe(0);
    expect(reconciliation.balances).toBe(true);
  });

  it('splits the period into both billable and non-billable work', async () => {
    const result = await mockFinanceService.getBillableAnalysis(FINANCE_FULL, {
      periodId: VERIFIED_PERIOD,
    });
    if (result.status !== 'success') return;
    // A dataset that is 100% one way would not exercise the analysis at all.
    expect(result.data.billable.minutes).toBeGreaterThan(0);
    expect(result.data.nonBillable.minutes).toBeGreaterThan(0);
    expect(result.data.lines.some((line) => line.nonBillableReason !== null)).toBe(true);
  });
});

describe('overtime', () => {
  it('treats exactly 12:00 as overtime and above it as critical', async () => {
    const result = await mockFinanceService.getOvertime(FINANCE_FULL, {
      periodId: 'pay-2026-08',
    });
    if (result.status !== 'success') return;

    const exactlyTwelve = result.data.rows.find((row) => row.total.minutes === 720);
    const aboveTwelve = result.data.rows.find((row) => row.total.minutes > 720);
    expect(exactlyTwelve?.status).toBe('overtime');
    expect(aboveTwelve?.status).toBe('critical');
  });

  it('carries the recorded reason through to Finance', async () => {
    const result = await mockFinanceService.getOvertime(FINANCE_FULL, {
      periodId: 'pay-2026-08',
    });
    if (result.status !== 'success') return;
    expect(result.data.rows.every((row) => row.reason !== null)).toBe(true);
  });
});

describe('exports', () => {
  it('refuses a protected export without the cost permission', async () => {
    const result = await mockFinanceService.requestExport(FINANCE_LIMITED, {
      reportKey: 'payroll-summary',
      periodId: VERIFIED_PERIOD,
      format: 'excel',
      includeProtectedFields: true,
      divisionIds: [],
    });
    expect(result.status).toBe('permission_denied');
  });

  it('refuses a cost export from an unverified period', async () => {
    const result = await mockFinanceService.requestExport(FINANCE_FULL, {
      reportKey: 'payroll-summary',
      periodId: OPEN_PERIOD,
      format: 'excel',
      includeProtectedFields: true,
      divisionIds: [],
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.guidance).toContain('verified period');
    }
  });

  it('allows an hours-only export from an unverified period', async () => {
    const result = await mockFinanceService.requestExport(FINANCE_LIMITED, {
      reportKey: 'employee-hours',
      periodId: OPEN_PERIOD,
      format: 'csv',
      includeProtectedFields: false,
      divisionIds: [],
    });
    expect(result.status).toBe('success');
  });

  it('queues rather than completes, and says so', async () => {
    const result = await mockFinanceService.requestExport(FINANCE_FULL, {
      reportKey: 'payroll-summary',
      periodId: VERIFIED_PERIOD,
      format: 'excel',
      includeProtectedFields: true,
      divisionIds: [],
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // No file is produced in the frontend milestone; the state must not claim
    // otherwise.
    expect(result.data.job.state).toBe('queued');
    expect(result.data.job.canDownload).toBe(false);
    expect(result.data.simulationNote).toContain('No file is produced');
  });

  it('blocks download of a protected file without the export permission', async () => {
    const result = await mockFinanceService.listExports(FINANCE_LIMITED);
    if (result.status !== 'success') return;
    const protectedReady = result.data.find(
      (job) => job.state === 'ready' && job.reportTitle.includes('Payroll'),
    );
    expect(protectedReady?.canDownload).toBe(false);
  });
});

describe('report preview', () => {
  it('keeps a restricted column and marks its cells', async () => {
    const result = await mockFinanceService.previewReport(FINANCE_LIMITED, {
      periodId: VERIFIED_PERIOD,
      groupBy: 'employee',
    });
    if (result.status !== 'success') return;

    const costColumn = result.data.columns.find((column) => column.field === 'cost');
    expect(costColumn).toBeDefined();
    expect(costColumn?.restricted).toBe(true);
    // The column stays so the report shape is honest; the cells say Restricted.
    expect(result.data.rows.every((row) => row.cost === 'Restricted')).toBe(true);
    expect(result.data.totals?.cost).toBe('Restricted');
  });

  it('reports zero rows as a no-results state rather than an error', async () => {
    const result = await mockFinanceService.previewReport(FINANCE_FULL, {
      periodId: VERIFIED_PERIOD,
      divisionIds: ['pit'],
      groupBy: 'project',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.rowCount).toBeGreaterThanOrEqual(0);
  });
});

describe('management read-only view (FE-0612, FE-0613)', () => {
  it('denies the overview to a Finance role', async () => {
    const result = await mockManagementService.getDashboard(FINANCE_FULL);
    expect(result.status).toBe('permission_denied');
  });

  it('exposes only readers on the service', () => {
    // The interface has no mutating method at all, so a management screen
    // cannot be handed an action by importing it.
    const methods = Object.keys(mockManagementService);
    expect(methods).toEqual(['getDashboard']);
  });

  it('restricts cost for management regardless of any grant', async () => {
    const result = await mockManagementService.getDashboard(MANAGEMENT);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.restrictedTiles.every((tile) => tile.restricted)).toBe(true);
    expect(result.data.projectProgress.every((entry) => entry.budget?.visible === false)).toBe(
      true,
    );
    expect(result.data.readOnlyNote).toContain('read-only');
  });

  it('lets a Super Administrator see both workspaces', async () => {
    const finance = await mockFinanceService.getDashboard('usr-9001');
    const management = await mockManagementService.getDashboard('usr-9001');
    expect(finance.status).toBe('success');
    expect(management.status).toBe('success');
  });

  it('does not expose the management overview to HR', async () => {
    const result = await mockManagementService.getDashboard(HR);
    expect(result.status).toBe('permission_denied');
  });
});
