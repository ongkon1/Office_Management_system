/**
 * FE-0018 - Pagination, sorting, filtering, date-range, and search contracts.
 *
 * Every data table, list, report, and search view uses these shapes, and every
 * one of them is expressible in the URL so list state is deep-linkable
 * (see `docs/frontend/phase-0/information-architecture.md`, section 3.4).
 */

/** ISO calendar date, `YYYY-MM-DD`. Never a `Date`, which carries a timezone. */
export type IsoDate = string;

/** ISO 8601 instant with offset, e.g. `2026-09-02T09:15:00+06:00`. */
export type IsoDateTime = string;

export interface PaginationParams {
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

export const DEFAULT_PAGINATION: PaginationParams = { page: 1, pageSize: 25 };

export interface PageInfo {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
  readonly hasPreviousPage: boolean;
  readonly hasNextPage: boolean;
}

/**
 * A page of results.
 *
 * `totalItems` is always the count the viewer is authorized to see. Counts must
 * never reveal the existence of records outside the viewer's scope
 * (`REQ-SRCH-003`, `AC-AUTH-004`).
 */
export interface Paginated<TItem> {
  readonly items: readonly TItem[];
  readonly pageInfo: PageInfo;
}

export type SortDirection = 'asc' | 'desc';

export interface SortParams<TField extends string = string> {
  readonly field: TField;
  readonly direction: SortDirection;
}

/**
 * A closed date range, inclusive at both ends.
 *
 * `preset` is retained so a report can state "This month" rather than only the
 * resolved dates, and so a saved filter re-resolves relative to the current day.
 */
export interface DateRange {
  readonly from: IsoDate;
  readonly to: IsoDate;
  readonly preset?: DateRangePreset;
}

export type DateRangePreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'payroll_period'
  | 'custom';

export interface SearchParams {
  /** Free-text term. Trimmed; an empty string means "no term". */
  readonly term: string;
}

/**
 * Filters shared by timesheet, report, attendance, and export views.
 *
 * Every field is optional; an absent field means "no constraint", and an empty
 * array means "no match", so the two are never conflated.
 */
export interface CommonFilters {
  readonly dateRange?: DateRange;
  readonly employeeIds?: readonly string[];
  readonly divisionIds?: readonly string[];
  readonly projectIds?: readonly string[];
  readonly taskIds?: readonly string[];
  readonly teamLeadIds?: readonly string[];
  readonly employmentTypes?: readonly string[];
  readonly workLocations?: readonly string[];
  readonly dayStatuses?: readonly string[];
  readonly recordStatuses?: readonly string[];
  /** `true` restricts to WFH, `false` to non-WFH, absent to both. */
  readonly wfhOnly?: boolean;
  /** `true` restricts to days classified Overtime or Critical. */
  readonly overtimeOnly?: boolean;
  /** `true` restricts to HR-verified periods (`REQ-RPT-010`). */
  readonly verifiedOnly?: boolean;
}

/** The full query envelope a list operation receives. */
export interface ListQuery<
  TFilters = CommonFilters,
  TSortField extends string = string,
> {
  readonly pagination: PaginationParams;
  readonly sort?: SortParams<TSortField>;
  readonly search?: SearchParams;
  readonly filters?: TFilters;
}

/**
 * URL parameter names. Centralised so table state, deep links, and saved
 * filters serialise identically everywhere.
 */
export const QUERY_PARAM_KEYS = {
  page: 'page',
  pageSize: 'size',
  sortField: 'sort',
  sortDirection: 'dir',
  search: 'q',
  dateFrom: 'from',
  dateTo: 'to',
  datePreset: 'range',
  employee: 'employee',
  division: 'division',
  project: 'project',
  task: 'task',
  teamLead: 'lead',
  employmentType: 'employment',
  workLocation: 'location',
  dayStatus: 'status',
  recordStatus: 'state',
  wfhOnly: 'wfh',
  overtimeOnly: 'ot',
  verifiedOnly: 'verified',
} as const;

export type QueryParamKey =
  (typeof QUERY_PARAM_KEYS)[keyof typeof QUERY_PARAM_KEYS];

/** Describes a column so the table, its filters, and its export agree. */
export interface ColumnDefinition<TField extends string = string> {
  readonly field: TField;
  readonly label: string;
  readonly sortable: boolean;
  readonly align: 'left' | 'right';
  /** Hidden below this width; `undefined` means always visible. */
  readonly hideBelow?: 'sm' | 'md' | 'lg';
  /** Marks a column that may be redacted by permission rather than omitted. */
  readonly permissionSensitive?: boolean;
}
