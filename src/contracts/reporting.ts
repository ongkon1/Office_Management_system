/**
 * Phase 7 — shared reporting and export contracts.
 *
 * The report surface is shared across every role, so authorization is a
 * property of the *catalogue*, not of the screen: a report a viewer may not run
 * is absent from `listReports`, and running it by key returns the same
 * not-found response as a report that does not exist. That keeps the catalogue
 * from becoming a directory of what other people can see.
 *
 * Every preview carries provenance — filters, timezone, policy version,
 * generated timestamp, and whether unverified data is included (`REQ-RPT-009`).
 * A report without that context cannot be reconciled later, and a screenshot of
 * one is unfalsifiable.
 */

import type { ExportFormat, ExportState, IsoDate } from './domain';
import type { Result } from './results';
import type { ExportJobView } from './view-models';

export type ReportCategory =
  | 'timesheet'
  | 'hr'
  | 'finance'
  | 'attendance'
  | 'wfh'
  | 'evaluation'
  | 'workload'
  | 'remarks';

export type ReportFilterKind =
  | 'date_range'
  | 'employee'
  | 'division'
  | 'project'
  | 'task'
  | 'team_lead'
  | 'employment_type'
  | 'work_location'
  | 'overtime'
  | 'status';

export interface ReportFilterOption {
  readonly value: string;
  readonly label: string;
}

export interface ReportFilterDefinition {
  readonly kind: ReportFilterKind;
  readonly label: string;
  readonly options: readonly ReportFilterOption[];
  readonly multiple: boolean;
  readonly helperText?: string;
}

export interface ReportDefinitionView {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: ReportCategory;
  readonly categoryLabel: string;
  /** Filters this report accepts, in the order they should be presented. */
  readonly filters: readonly ReportFilterDefinition[];
  /** Set when the report contains cost, salary or other protected columns. */
  readonly containsProtectedFields: boolean;
  /** True when the viewer may run it but some columns will be redacted. */
  readonly willRedactFields: boolean;
  readonly href: string;
}

export interface ReportCatalogueGroupView {
  readonly category: ReportCategory;
  readonly label: string;
  readonly description: string;
  readonly reports: readonly ReportDefinitionView[];
}

/** What the builder submits. Absent keys mean "no filter applied". */
export interface ReportRunInput {
  readonly reportKey: string;
  readonly from?: IsoDate;
  readonly to?: IsoDate;
  readonly employeeIds?: readonly string[];
  readonly divisionIds?: readonly string[];
  readonly projectIds?: readonly string[];
  readonly taskIds?: readonly string[];
  readonly teamLeadIds?: readonly string[];
  readonly employmentTypes?: readonly string[];
  readonly workLocations?: readonly string[];
  readonly overtimeOnly?: boolean;
  readonly statuses?: readonly string[];
}

export interface ReportColumnView {
  readonly field: string;
  readonly label: string;
  readonly align: 'left' | 'right';
  /** Present in the report but withheld from this viewer. */
  readonly restricted: boolean;
}

export interface ReportChartView {
  readonly title: string;
  readonly kind: 'bar' | 'donut';
  readonly valueHeader: string;
  readonly data: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: number;
    readonly display: string;
  }[];
}

export interface ReportPreviewView {
  readonly reportKey: string;
  readonly title: string;
  readonly description: string;
  readonly categoryLabel: string;
  /** One line per applied filter, so a printed report explains itself. */
  readonly appliedFilters: readonly { readonly label: string; readonly value: string }[];
  readonly periodLabel: string;
  readonly timezone: string;
  readonly policyVersion: number;
  readonly generatedAtLabel: string;
  readonly includesUnverifiedData: boolean;
  readonly unverifiedWarning: string | null;
  readonly restrictionNote: string | null;
  readonly columns: readonly ReportColumnView[];
  readonly rows: readonly Readonly<Record<string, string>>[];
  readonly totals: Readonly<Record<string, string>> | null;
  readonly rowCount: number;
  /** Present only where a chart adds something the table does not. */
  readonly chart: ReportChartView | null;
}

export interface ReportExportInput {
  readonly reportKey: string;
  readonly format: ExportFormat;
  readonly run: ReportRunInput;
}

export interface ReportingService {
  listReports(userId: string): Promise<Result<readonly ReportCatalogueGroupView[]>>;
  getReport(userId: string, reportKey: string): Promise<Result<ReportDefinitionView>>;
  runReport(userId: string, input: ReportRunInput): Promise<Result<ReportPreviewView>>;
  requestExport(
    userId: string,
    input: ReportExportInput,
  ): Promise<Result<{ readonly job: ExportJobView; readonly note: string }>>;
  listExports(userId: string): Promise<Result<readonly ExportJobView[]>>;
  /** Moves a mocked job to its next state, so every state is demonstrable. */
  advanceExport(userId: string, jobId: string): Promise<Result<ExportJobView>>;
  retryExport(userId: string, jobId: string): Promise<Result<ExportJobView>>;
}

export type { ExportFormat, ExportState };
