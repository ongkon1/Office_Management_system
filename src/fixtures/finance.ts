/**
 * Phase 6 demo data: cost rates, billability, payroll periods and export jobs.
 *
 * Rates are the most sensitive values in the dataset. They live here, behind
 * the service, and every path that reads them checks `finance.cost.view` first
 * — a rate must never reach a view model for a viewer without that permission,
 * not even to be blanked in the component.
 *
 * Development only. Nothing above the service layer imports this file.
 */

import type { CostRate, DecimalString, PayrollPeriod } from '@/contracts/domain';

/* -------------------------------------------------------------------------- */
/* Cost rates                                                                 */
/* -------------------------------------------------------------------------- */

interface RateSpec {
  readonly employeeId: string;
  /** BDT per hour, fixed precision. */
  readonly hourly: DecimalString;
  readonly effectiveFrom: string;
}

/**
 * Rates deliberately carry non-round paisa values.
 *
 * `1250.75` per hour over a 420-minute day is exactly `8755.25`. A rate ending
 * in `.00` would let a floating-point implementation pass every check here and
 * still be wrong in production.
 */
const RATE_SPECS: readonly RateSpec[] = [
  { employeeId: 'emp-1001', hourly: '1250.75', effectiveFrom: '2025-01-01' },
  { employeeId: 'emp-1002', hourly: '940.50', effectiveFrom: '2025-01-01' },
  { employeeId: 'emp-1003', hourly: '815.25', effectiveFrom: '2025-01-01' },
  { employeeId: 'emp-1004', hourly: '690.40', effectiveFrom: '2025-01-01' },
  { employeeId: 'emp-2001', hourly: '1680.00', effectiveFrom: '2025-01-01' },
  { employeeId: 'emp-2002', hourly: '1610.35', effectiveFrom: '2025-01-01' },
];

export const COST_RATES: readonly CostRate[] = RATE_SPECS.map((spec) => ({
  id: `rate-${spec.employeeId}`,
  scope: 'employee',
  scopeId: spec.employeeId,
  hourlyRate: { visible: true, value: { amount: spec.hourly, currency: 'BDT' } },
  effectiveFrom: spec.effectiveFrom,
  effectiveTo: null,
}));

/** Overtime is paid at the standard rate in this demo; no multiplier is assumed. */
export const OVERTIME_MULTIPLIER_NOTE =
  'Overtime is costed at the standard hourly rate. No premium multiplier has been agreed with the business.';

/* -------------------------------------------------------------------------- */
/* Billability                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Which project work is billable to a client or stakeholder.
 *
 * Internal training and legacy maintenance are not billable, which is what
 * makes the billable-versus-non-billable reconciliation show a real split
 * rather than 100% one way.
 */
export const BILLABLE_PROJECT_IDS: readonly string[] = [
  'prj-vp2',
  'prj-nrd',
  'prj-mip',
  'prj-wpr',
];

export const NON_BILLABLE_REASON: Readonly<Record<string, string>> = {
  'prj-alb': 'Internal capability programme, not invoiced.',
  'prj-lsm': 'Legacy maintenance absorbed into overhead.',
};

/** Time with no project attached is non-billable and reported separately. */
export const UNASSIGNED_LABEL = 'No project recorded';

/* -------------------------------------------------------------------------- */
/* Payroll periods                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Payroll periods mirror the timesheet periods one-to-one in this demo.
 *
 * `isVerified` is *not* stored here — it is read from the timesheet period in
 * the mock store, so a period verified during a session immediately becomes
 * payroll-ready. Duplicating the flag would let the two disagree.
 */
export const PAYROLL_PERIODS: readonly Omit<PayrollPeriod, 'isVerified'>[] = [
  {
    id: 'pay-2026-07',
    label: 'July 2026',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    timesheetPeriodId: 'per-2026-07',
  },
  {
    id: 'pay-2026-08',
    label: 'August 2026',
    startDate: '2026-08-01',
    endDate: '2026-08-31',
    timesheetPeriodId: 'per-2026-08',
  },
  {
    id: 'pay-2026-09',
    label: 'September 2026',
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    timesheetPeriodId: 'per-2026-09',
  },
];

/* -------------------------------------------------------------------------- */
/* Export history                                                             */
/* -------------------------------------------------------------------------- */

export interface ExportJobFixture {
  readonly id: string;
  readonly reportKey: string;
  readonly reportTitle: string;
  readonly format: 'excel' | 'csv' | 'pdf' | 'print';
  readonly requestedAt: string;
  readonly requestedBy: string;
  readonly filterSummary: string;
  readonly state: 'queued' | 'processing' | 'ready' | 'expired' | 'failed' | 'cancelled';
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly failureMessage: string | null;
  /** True when the export includes salary, rate or cost columns. */
  readonly includesProtectedFields: boolean;
}

/**
 * One job in each state that matters.
 *
 * The expired and failed rows exist because an export history that only ever
 * shows `ready` teaches the user nothing about what to do when one is not.
 */
export const EXPORT_JOBS: readonly ExportJobFixture[] = [
  {
    id: 'exp-1',
    reportKey: 'payroll-summary',
    reportTitle: 'Payroll summary — July 2026',
    format: 'excel',
    requestedAt: '2026-08-05T10:12:00+06:00',
    requestedBy: 'Mahmuda Akter',
    filterSummary: 'Period July 2026 · all divisions · verified only',
    state: 'ready',
    readyAt: '2026-08-05T10:13:20+06:00',
    expiresAt: '2026-09-05T10:13:20+06:00',
    failureMessage: null,
    includesProtectedFields: true,
  },
  {
    id: 'exp-2',
    reportKey: 'employee-hours',
    reportTitle: 'Employee hours — July 2026',
    format: 'csv',
    requestedAt: '2026-08-04T16:40:00+06:00',
    requestedBy: 'Shakil Chowdhury',
    filterSummary: 'Period July 2026 · all divisions · hours only',
    state: 'ready',
    readyAt: '2026-08-04T16:40:35+06:00',
    expiresAt: '2026-09-04T16:40:35+06:00',
    failureMessage: null,
    includesProtectedFields: false,
  },
  {
    id: 'exp-3',
    reportKey: 'project-costs',
    reportTitle: 'Project labour cost — June 2026',
    format: 'pdf',
    requestedAt: '2026-07-03T09:05:00+06:00',
    requestedBy: 'Mahmuda Akter',
    filterSummary: 'Period June 2026 · PowerInAI, Government Projects',
    state: 'expired',
    readyAt: '2026-07-03T09:06:10+06:00',
    expiresAt: '2026-08-03T09:06:10+06:00',
    failureMessage: null,
    includesProtectedFields: true,
  },
  {
    id: 'exp-4',
    reportKey: 'division-costs',
    reportTitle: 'Division labour cost — August 2026',
    format: 'excel',
    requestedAt: '2026-09-01T11:20:00+06:00',
    requestedBy: 'Mahmuda Akter',
    filterSummary: 'Period August 2026 · all divisions',
    state: 'failed',
    readyAt: null,
    expiresAt: null,
    failureMessage:
      'August 2026 is not verified. A cost export needs a verified period so the figures cannot change after the file is produced.',
    includesProtectedFields: true,
  },
];

/* -------------------------------------------------------------------------- */
/* Budgets                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Division labour budgets for the period, used for the variance analysis.
 *
 * Project budgets already live on the project records; these are the division
 * envelope those projects are drawn against.
 */
export const DIVISION_BUDGETS: Readonly<Record<string, DecimalString>> = {
  pia: '900000.00',
  pit: '260000.00',
  gov: '750000.00',
  cjg: '420000.00',
  wcf: '560000.00',
};
