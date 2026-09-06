/**
 * Phase 6 — Finance and Management view models and service contracts.
 *
 * Two rules shape every type in this file.
 *
 * **Cost is `Redactable<Money>`, never `Money | null`.** A viewer without
 * `finance.cost.view` must see that a cost exists and is withheld. A nullable
 * money field would render identically to "this project cost nothing", which
 * is a different and wrong statement (`REQ-NFR-SEC-004`, `REQ-RPT-007`).
 *
 * **Finance reads verified periods.** Every list and analysis view carries
 * `isVerifiedPeriod` and an `unverifiedWarning`, because a payroll figure taken
 * from an open period can still change (`REQ-FIN-002`). The warning is a
 * service decision, not a component's.
 *
 * The Management contract is separated deliberately: it exposes only readers.
 * There is no mutation on `ManagementService` at all, so a read-only role
 * cannot be given an action by an accidental import (`FE-0613`).
 */

import type {
  DurationMinutes,
  ExportFormat,
  ExportState,
  IsoDate,
  Money,
  Redactable,
} from './domain';
import type { Result } from './results';
import type {
  DivisionContributionView,
  DivisionRef,
  DurationView,
  EmployeeRef,
  ExportJobView,
  ManagementDashboardView,
  MetricTileView,
  ProjectRef,
} from './view-models';

/* ------------------------------------------------------------------------- */
/* Shared                                                                    */
/* ------------------------------------------------------------------------- */

export interface FinancePeriodRef {
  readonly id: string;
  readonly label: string;
  readonly rangeLabel: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly isVerified: boolean;
  readonly timesheetPeriodId: string;
}

/** Filters shared by the hours, overtime and cost screens. */
export interface FinanceFilters {
  readonly periodId: string;
  readonly employeeIds: readonly string[];
  readonly divisionIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly statuses: readonly string[];
}

/**
 * A money value the viewer may not be authorized to see.
 *
 * `display` is present only on the visible variant, so a component cannot
 * accidentally render a formatted string for a restricted value.
 */
export type RedactableMoneyView =
  | {
      readonly visible: true;
      readonly value: Money;
      /** Exact, e.g. `BDT 1,234,567.89`. Used wherever figures reconcile. */
      readonly display: string;
      /**
       * Abbreviated, e.g. `BDT 1.23M`. Used in dense summary tiles, where the
       * exact string does not fit beside a sidebar at 768 px and precision is
       * not what the tile is for.
       */
      readonly compact: string;
    }
  | { readonly visible: false; readonly reason: 'permission_required' };

export interface FinanceDashboard {
  readonly period: FinancePeriodRef;
  readonly availablePeriods: readonly FinancePeriodRef[];
  readonly unverifiedWarning: string | null;
  readonly hasFinancialPermission: boolean;

  /* Hours — available to any Finance viewer (`FE-0601`). */
  readonly verifiedEmployeeHours: DurationView;
  readonly verifiedOvertimeHours: DurationView;
  readonly employeeCount: number;
  readonly divisionHours: readonly DivisionContributionView[];
  readonly projectHours: readonly {
    readonly project: ProjectRef;
    readonly division: DivisionRef;
    readonly active: DurationView;
    readonly sharePercent: number;
  }[];

  /* Money — restricted tiles keep their label (`FE-0602`). */
  readonly projectLabourCost: MetricTileView;
  readonly divisionLabourCost: MetricTileView;
  readonly billableHours: MetricTileView;
  readonly nonBillableHours: MetricTileView;
  readonly payrollSummary: MetricTileView;
  readonly budgetVariance: MetricTileView;

  readonly recentExports: readonly ExportJobView[];
}

/* ------------------------------------------------------------------------- */
/* Hours and overtime (`FE-0603`)                                            */
/* ------------------------------------------------------------------------- */

export interface FinanceHoursRowView {
  readonly key: string;
  readonly employee: EmployeeRef;
  readonly division: DivisionRef;
  readonly project: ProjectRef | null;
  readonly projectLabel: string;
  readonly active: DurationView;
  readonly break: DurationView;
  readonly total: DurationView;
  readonly overtime: DurationView;
  readonly dayCount: number;
  /** Day classifications present in the row, for the status filter. */
  readonly statuses: readonly string[];
  readonly isBillable: boolean;
  readonly cost: RedactableMoneyView;
}

export interface FinanceHoursView {
  readonly period: FinancePeriodRef;
  readonly unverifiedWarning: string | null;
  readonly rows: readonly FinanceHoursRowView[];
  readonly totals: {
    readonly active: DurationView;
    readonly break: DurationView;
    readonly total: DurationView;
    readonly overtime: DurationView;
    readonly cost: RedactableMoneyView;
  };
  readonly hasFinancialPermission: boolean;
}

export interface FinanceOvertimeRowView {
  readonly key: string;
  readonly employee: EmployeeRef;
  readonly division: DivisionRef;
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly total: DurationView;
  readonly overtime: DurationView;
  readonly status: 'overtime' | 'critical';
  readonly statusLabel: string;
  /** Required above 8:00, and an explanation above 12:00 (`REQ-TIME-018/019`). */
  readonly reason: string | null;
  readonly cost: RedactableMoneyView;
  readonly href: string;
}

export interface FinanceOvertimeView {
  readonly period: FinancePeriodRef;
  readonly unverifiedWarning: string | null;
  readonly rows: readonly FinanceOvertimeRowView[];
  readonly totalOvertime: DurationView;
  readonly overtimeDayCount: number;
  readonly criticalDayCount: number;
  readonly totalCost: RedactableMoneyView;
  readonly hasFinancialPermission: boolean;
}

/* ------------------------------------------------------------------------- */
/* Cost analysis (`FE-0604`)                                                 */
/* ------------------------------------------------------------------------- */

export interface CostLineView {
  readonly key: string;
  readonly label: string;
  readonly secondaryLabel: string;
  readonly active: DurationView;
  readonly overtime: DurationView;
  readonly cost: RedactableMoneyView;
  readonly budget: RedactableMoneyView;
  readonly variance: RedactableMoneyView;
  readonly variancePercent: number | null;
  readonly estimated: DurationView | null;
  readonly estimateVariancePercent: number | null;
  readonly sharePercent: number;
  readonly isRestrictedScope: boolean;
  readonly drillDown: readonly {
    readonly key: string;
    readonly label: string;
    readonly active: DurationView;
    readonly cost: RedactableMoneyView;
  }[];
}

export interface CostAnalysisView {
  readonly scope: 'project' | 'division';
  readonly period: FinancePeriodRef;
  readonly unverifiedWarning: string | null;
  readonly hasFinancialPermission: boolean;
  /** Explains what is withheld, when anything is. */
  readonly restrictionNote: string | null;
  readonly lines: readonly CostLineView[];
  readonly totalActive: DurationView;
  readonly totalCost: RedactableMoneyView;
  readonly totalBudget: RedactableMoneyView;
  readonly totalVariance: RedactableMoneyView;
  readonly totalVariancePercent: number | null;
  /** Cost per period, for the trend chart. Restricted viewers get none. */
  readonly trend: readonly {
    readonly periodLabel: string;
    readonly active: DurationView;
    readonly cost: RedactableMoneyView;
  }[];
}

/* ------------------------------------------------------------------------- */
/* Billable analysis (`FE-0605`)                                             */
/* ------------------------------------------------------------------------- */

export interface BillableSplitView {
  readonly period: FinancePeriodRef;
  readonly unverifiedWarning: string | null;
  readonly hasFinancialPermission: boolean;
  readonly billable: DurationView;
  readonly nonBillable: DurationView;
  readonly totalVerified: DurationView;
  readonly billablePercent: number;
  /**
   * Proof that the split adds up. Billable + non-billable must equal the total
   * verified active time exactly; a mismatch is a defect, not a rounding
   * artefact, because these are integer minutes.
   */
  readonly reconciliation: {
    readonly billableMinutes: DurationMinutes;
    readonly nonBillableMinutes: DurationMinutes;
    readonly sumMinutes: DurationMinutes;
    readonly totalVerifiedMinutes: DurationMinutes;
    readonly differenceMinutes: DurationMinutes;
    readonly balances: boolean;
  };
  readonly lines: readonly {
    readonly key: string;
    readonly label: string;
    readonly division: DivisionRef;
    readonly isBillable: boolean;
    readonly nonBillableReason: string | null;
    readonly active: DurationView;
    readonly sharePercent: number;
    readonly cost: RedactableMoneyView;
  }[];
  readonly billableCost: RedactableMoneyView;
  readonly nonBillableCost: RedactableMoneyView;
  readonly totalCost: RedactableMoneyView;
}

/* ------------------------------------------------------------------------- */
/* Payroll summary (`FE-0606`, `FE-0610`)                                    */
/* ------------------------------------------------------------------------- */

export interface PayrollEmployeeRowView {
  readonly employee: EmployeeRef;
  readonly divisionCodes: readonly string[];
  readonly active: DurationView;
  readonly overtime: DurationView;
  readonly dayCount: number;
  readonly exceptionCount: number;
  readonly hourlyRate: RedactableMoneyView;
  readonly cost: RedactableMoneyView;
}

export interface PayrollSummaryView {
  readonly period: FinancePeriodRef;
  readonly timesheetStatusLabel: string;
  readonly isVerified: boolean;
  readonly verifiedAtLabel: string | null;
  readonly verifiedByLabel: string | null;
  readonly unverifiedWarning: string | null;
  readonly policyVersion: number;
  readonly employeeCount: number;
  readonly totalActive: DurationView;
  readonly totalOvertime: DurationView;
  readonly totalCost: RedactableMoneyView;
  readonly exceptions: readonly {
    readonly label: string;
    readonly count: number;
    readonly tone: 'neutral' | 'caution' | 'negative';
  }[];
  /** Blocking reasons; empty means the period is ready to export. */
  readonly exportBlockers: readonly string[];
  readonly canExport: boolean;
  readonly canExportProtected: boolean;
  readonly rows: readonly PayrollEmployeeRowView[];
  readonly exportHistory: readonly ExportJobView[];
  readonly auditTrail: readonly {
    readonly label: string;
    readonly actorLabel: string;
    readonly atLabel: string;
  }[];
  readonly hasFinancialPermission: boolean;
}

/* ------------------------------------------------------------------------- */
/* Report preview and export configuration (`FE-0610`, `FE-0611`)            */
/* ------------------------------------------------------------------------- */

export interface FinanceReportFilters {
  readonly reportKey: string;
  readonly periodId: string;
  readonly divisionIds: readonly string[];
  readonly includeProtectedFields: boolean;
  readonly groupBy: 'employee' | 'division' | 'project';
}

export interface FinanceReportColumn {
  readonly field: string;
  readonly label: string;
  readonly align: 'left' | 'right';
  /** Present but withheld: the column stays, the values read `Restricted`. */
  readonly restricted: boolean;
}

export interface FinanceReportPreviewView {
  readonly reportKey: string;
  readonly title: string;
  readonly periodLabel: string;
  readonly rangeLabel: string;
  readonly filterSummary: readonly { readonly label: string; readonly value: string }[];
  readonly timezone: string;
  readonly generatedAtLabel: string;
  readonly policyVersion: number;
  readonly unverifiedWarning: string | null;
  readonly restrictionNote: string | null;
  readonly columns: readonly FinanceReportColumn[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly totals: Readonly<Record<string, string>> | null;
  readonly rowCount: number;
  readonly hasFinancialPermission: boolean;
}

export interface ExportConfiguration {
  readonly reportKey: string;
  readonly periodId: string;
  readonly format: ExportFormat;
  readonly includeProtectedFields: boolean;
  readonly divisionIds: readonly string[];
}

/**
 * The result of *configuring* an export during the frontend milestone.
 *
 * No file is produced. `state` is always `queued`, and `simulationNote` says so
 * on screen — an export that appears to succeed and delivers nothing is worse
 * than one that is honestly labelled as not yet wired up (`FE-0610`).
 */
export interface ExportRequestView {
  readonly job: ExportJobView;
  readonly simulationNote: string;
}

/* ------------------------------------------------------------------------- */
/* Services                                                                  */
/* ------------------------------------------------------------------------- */

export interface FinanceService {
  listPeriods(userId: string): Promise<Result<readonly FinancePeriodRef[]>>;
  getDashboard(userId: string, periodId?: string): Promise<Result<FinanceDashboard>>;
  getHours(
    userId: string,
    filters: Partial<FinanceFilters>,
  ): Promise<Result<FinanceHoursView>>;
  getOvertime(
    userId: string,
    filters: Partial<FinanceFilters>,
  ): Promise<Result<FinanceOvertimeView>>;
  getCostAnalysis(
    userId: string,
    scope: 'project' | 'division',
    filters: Partial<FinanceFilters>,
  ): Promise<Result<CostAnalysisView>>;
  getBillableAnalysis(
    userId: string,
    filters: Partial<FinanceFilters>,
  ): Promise<Result<BillableSplitView>>;
  getPayrollSummary(userId: string, periodId?: string): Promise<Result<PayrollSummaryView>>;
  previewReport(
    userId: string,
    filters: Partial<FinanceReportFilters>,
  ): Promise<Result<FinanceReportPreviewView>>;
  requestExport(
    userId: string,
    configuration: ExportConfiguration,
  ): Promise<Result<ExportRequestView>>;
  listExports(userId: string): Promise<Result<readonly ExportJobView[]>>;
}

/**
 * Management is read-only by construction.
 *
 * There is no `save`, `approve`, `verify`, `override` or `delete` on this
 * interface, and no screen for this role imports another service. `FE-0613` is
 * therefore enforced by the type, not by remembering to omit a button.
 */
export interface ManagementService {
  getDashboard(userId: string, periodId?: string): Promise<Result<ManagementDashboard>>;
}

export interface ManagementDashboard extends ManagementDashboardView {
  readonly period: FinancePeriodRef;
  readonly availablePeriods: readonly FinancePeriodRef[];
  readonly unverifiedWarning: string | null;
  readonly employeeSummaries: readonly {
    readonly employee: EmployeeRef;
    readonly divisionCodes: readonly string[];
    readonly active: DurationView;
    readonly completeDayCount: number;
    readonly exceptionCount: number;
  }[];
  /** Always restricted for this role: cost is outside a view-only mandate. */
  readonly restrictedTiles: readonly MetricTileView[];
  readonly readOnlyNote: string;
}

export type { Redactable, ExportState };
