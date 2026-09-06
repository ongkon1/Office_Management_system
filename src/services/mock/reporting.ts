/**
 * Mock reporting service (Phase 7).
 *
 * The catalogue is authorization-filtered: a report a viewer may not run is not
 * listed, and `getReport`/`runReport` return not-found for it rather than
 * permission-denied, so the catalogue cannot be used to enumerate what other
 * roles can see.
 *
 * Reports that merely *contain* protected columns behave differently from
 * reports that are *about* them. A payroll report is listed for any Finance
 * viewer with its cost column redacted; a cost-rate report is not listed at all
 * without `finance.cost.view`. `willRedactFields` is what the catalogue uses to
 * say so up front.
 *
 * Every preview carries provenance — filters, timezone, policy version,
 * generated timestamp, and whether unverified data is included (`REQ-RPT-009`).
 */

import type { DailySummary, ExportFormat, IsoDate } from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  ReportCatalogueGroupView,
  ReportCategory,
  ReportDefinitionView,
  ReportFilterDefinition,
  ReportPreviewView,
  ReportRunInput,
  ReportingService,
} from '@/contracts/reporting';
import { success } from '@/contracts/results';
import type { ExportJobView } from '@/contracts/view-models';
import { aggregateSummaries } from '@/lib/calculation/engine';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatMoney,
  formatTimestamp,
} from '@/lib/format';
import { costOfMinutes, sumMoney, ZERO_BDT } from '@/lib/money';
import { ATTENDANCE_LABEL, toDurationView, WORK_LOCATION_LABEL } from '@/lib/status';
import { LEAVE_TYPES, PROJECTS, STANDARD_POLICY } from '@/fixtures';
import { COST_RATES } from '@/fixtures/finance';
import { EMPLOYEES } from '@/fixtures/hr';
import { DIVISIONS, findAccountByUserId } from './accounts';
import { mockStore } from './store';
import { summaryFor } from './timesheet';

const LATENCY_MS = 180;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

const REPORTED_EMPLOYEE_IDS: readonly string[] = [
  'emp-1001',
  'emp-1002',
  'emp-1003',
  'emp-1004',
];

const DEFAULT_FROM: IsoDate = '2026-08-01';
const DEFAULT_TO: IsoDate = '2026-09-02';

function notFound(message: string) {
  return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message };
}

function viewerOf(userId: string) {
  return findAccountByUserId(userId);
}

function hasPermission(userId: string, permission: string): boolean {
  return viewerOf(userId)?.permissions.includes(permission) ?? false;
}

function employeeName(employeeId: string): string {
  return EMPLOYEES.find((item) => item.id === employeeId)?.fullName ?? employeeId;
}

function divisionOf(divisionId: string) {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division ?? { id: divisionId, name: divisionId, code: divisionId.toUpperCase(), isRestricted: false };
}

function datesIn(from: IsoDate, to: IsoDate): readonly IsoDate[] {
  const dates: IsoDate[] = [];
  const span = daysBetween(from, to);
  for (let offset = 0; offset <= span; offset += 1) dates.push(addDays(from, offset));
  return dates;
}

/* -------------------------------------------------------------------------- */
/* Filter definitions                                                         */
/* -------------------------------------------------------------------------- */

const EMPLOYEE_OPTIONS = REPORTED_EMPLOYEE_IDS.map((id) => ({
  value: id,
  label: employeeName(id),
}));

const DIVISION_OPTIONS = Object.values(DIVISIONS).map((division) => ({
  value: division.id,
  label: division.name,
}));

const PROJECT_OPTIONS = PROJECTS.map((project) => ({
  value: project.id,
  label: `${project.code} · ${project.name}`,
}));

const TEAM_LEAD_OPTIONS = [
  { value: 'emp-2001', label: 'Imran Hossain' },
  { value: 'emp-2002', label: 'Farhana Islam' },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'intern', label: 'Intern' },
  { value: 'consultant', label: 'Consultant' },
];

const WORK_LOCATION_OPTIONS = Object.entries(WORK_LOCATION_LABEL).map(([value, label]) => ({
  value,
  label,
}));

const STATUS_OPTIONS = [
  { value: 'complete', label: 'Complete' },
  { value: 'under_time', label: 'Under-time' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'critical', label: 'Critical' },
  { value: 'missing', label: 'Missing' },
];

const FILTERS: Readonly<Record<string, ReportFilterDefinition>> = {
  date_range: {
    kind: 'date_range',
    label: 'Date range',
    options: [],
    multiple: false,
    helperText: 'Work dates in the business timezone, Asia/Dhaka.',
  },
  employee: { kind: 'employee', label: 'Employee', options: EMPLOYEE_OPTIONS, multiple: true },
  division: { kind: 'division', label: 'Division', options: DIVISION_OPTIONS, multiple: true },
  project: { kind: 'project', label: 'Project', options: PROJECT_OPTIONS, multiple: true },
  task: { kind: 'task', label: 'Task', options: [], multiple: true },
  team_lead: { kind: 'team_lead', label: 'Team Lead', options: TEAM_LEAD_OPTIONS, multiple: true },
  employment_type: {
    kind: 'employment_type',
    label: 'Employment type',
    options: EMPLOYMENT_TYPE_OPTIONS,
    multiple: true,
  },
  work_location: {
    kind: 'work_location',
    label: 'Work location',
    options: WORK_LOCATION_OPTIONS,
    multiple: true,
  },
  overtime: {
    kind: 'overtime',
    label: 'Overtime only',
    options: [],
    multiple: false,
    helperText: 'Limits the report to days above eight hours in total.',
  },
  status: { kind: 'status', label: 'Day status', options: STATUS_OPTIONS, multiple: true },
};

function filtersFor(kinds: readonly string[]): readonly ReportFilterDefinition[] {
  return kinds.map((kind) => FILTERS[kind]).filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Report definitions                                                         */
/* -------------------------------------------------------------------------- */

const CATEGORY_LABEL: Readonly<Record<ReportCategory, string>> = {
  timesheet: 'Timesheet',
  hr: 'HR',
  finance: 'Finance',
  attendance: 'Attendance',
  wfh: 'Work from home',
  evaluation: 'Evaluation',
  workload: 'Workload',
  remarks: 'Remarks',
};

const CATEGORY_DESCRIPTION: Readonly<Record<ReportCategory, string>> = {
  timesheet: 'Recorded time, classifications and division contribution.',
  hr: 'Headcount, assignments and profile completeness.',
  finance: 'Verified hours, overtime and labour cost.',
  attendance: 'Daily attendance states, including explained non-working days.',
  wfh: 'Work-from-home requests, decisions and recorded output.',
  evaluation: 'Evaluation progress and published results.',
  workload: 'Capacity against planned and actual allocation.',
  remarks: 'General remarks and correction requests.',
};

interface ReportSpec {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly category: ReportCategory;
  readonly filters: readonly string[];
  /** Roles that may run it at all. */
  readonly roles: readonly string[];
  /** Without this permission the report is not listed at all. */
  readonly requiresPermission?: string;
  /** Without this permission the report runs with columns redacted. */
  readonly redactsWithoutPermission?: string;
}

const REPORT_SPECS: readonly ReportSpec[] = [
  {
    key: 'timesheet-detail',
    title: 'Timesheet detail',
    description: 'Every recorded day with active time, break, total and classification.',
    category: 'timesheet',
    filters: ['date_range', 'employee', 'division', 'project', 'work_location', 'status', 'overtime'],
    roles: ['team_lead', 'hr_manager', 'finance_manager', 'management', 'super_admin'],
  },
  {
    key: 'division-contribution',
    title: 'Division contribution',
    description: 'Active time split by division across the selected period.',
    category: 'timesheet',
    filters: ['date_range', 'employee', 'division'],
    roles: ['team_lead', 'hr_manager', 'finance_manager', 'management', 'super_admin'],
  },
  {
    key: 'overtime-summary',
    title: 'Overtime summary',
    description: 'Days above eight hours, with the recorded reason and classification.',
    category: 'timesheet',
    filters: ['date_range', 'employee', 'division', 'status'],
    roles: ['team_lead', 'hr_manager', 'finance_manager', 'management', 'super_admin'],
  },
  {
    key: 'headcount',
    title: 'Headcount and assignments',
    description: 'Active employees, division assignments, Team Lead and profile completeness.',
    category: 'hr',
    filters: ['division', 'team_lead', 'employment_type'],
    roles: ['hr_manager', 'management', 'super_admin'],
  },
  {
    key: 'payroll-hours',
    title: 'Payroll hours and cost',
    description: 'Verified hours and labour cost per employee for a payroll period.',
    category: 'finance',
    filters: ['date_range', 'employee', 'division'],
    roles: ['finance_manager', 'super_admin'],
    redactsWithoutPermission: SENSITIVE_PERMISSIONS.financialDetail,
  },
  {
    key: 'cost-rates',
    title: 'Employee cost rates',
    description: 'Hourly cost rate per employee and its effective date.',
    category: 'finance',
    filters: ['employee', 'division'],
    roles: ['finance_manager', 'super_admin'],
    requiresPermission: SENSITIVE_PERMISSIONS.financialDetail,
  },
  {
    key: 'attendance-register',
    title: 'Attendance register',
    description: 'Daily attendance state per employee, including explained non-working days.',
    category: 'attendance',
    filters: ['date_range', 'employee', 'division', 'work_location'],
    roles: ['team_lead', 'hr_manager', 'management', 'super_admin'],
  },
  {
    key: 'wfh-register',
    title: 'Work-from-home register',
    description: 'WFH requests, decisions and the work recorded on approved days.',
    category: 'wfh',
    filters: ['date_range', 'employee', 'division'],
    roles: ['team_lead', 'hr_manager', 'management', 'super_admin'],
  },
  {
    key: 'evaluation-progress',
    title: 'Evaluation progress',
    description: 'Evaluation state per employee for the open periods.',
    category: 'evaluation',
    filters: ['employee', 'division'],
    roles: ['hr_manager', 'management', 'super_admin'],
  },
  {
    key: 'workload-capacity',
    title: 'Workload and capacity',
    description: 'Weekly capacity against actual recorded time.',
    category: 'workload',
    filters: ['date_range', 'employee', 'division'],
    roles: ['team_lead', 'hr_manager', 'management', 'super_admin'],
  },
  {
    key: 'remarks-register',
    title: 'Remarks and corrections',
    description: 'General remarks, correction requests and their current state.',
    category: 'remarks',
    filters: ['date_range', 'employee'],
    roles: ['team_lead', 'hr_manager', 'super_admin'],
  },
];

function canRun(userId: string, spec: ReportSpec): boolean {
  const viewer = viewerOf(userId);
  if (!viewer) return false;
  if (!spec.roles.includes(viewer.primaryRole)) return false;
  if (spec.requiresPermission && !hasPermission(userId, spec.requiresPermission)) return false;
  return true;
}

function definitionView(userId: string, spec: ReportSpec): ReportDefinitionView {
  const willRedact = Boolean(
    spec.redactsWithoutPermission && !hasPermission(userId, spec.redactsWithoutPermission),
  );
  return {
    key: spec.key,
    title: spec.title,
    description: spec.description,
    category: spec.category,
    categoryLabel: CATEGORY_LABEL[spec.category],
    filters: filtersFor(spec.filters),
    containsProtectedFields: Boolean(spec.requiresPermission || spec.redactsWithoutPermission),
    willRedactFields: willRedact,
    href: `/reports/${spec.key}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Row building                                                               */
/* -------------------------------------------------------------------------- */

interface DayRow {
  readonly employeeId: string;
  readonly date: IsoDate;
  readonly summary: DailySummary;
}

function collectDays(input: ReportRunInput): readonly DayRow[] {
  const from = input.from ?? DEFAULT_FROM;
  const to = input.to ?? DEFAULT_TO;
  const employeeIds = input.employeeIds?.length
    ? REPORTED_EMPLOYEE_IDS.filter((id) => input.employeeIds!.includes(id))
    : REPORTED_EMPLOYEE_IDS;

  const rows: DayRow[] = [];
  for (const employeeId of employeeIds) {
    for (const date of datesIn(from, to)) {
      const summary = summaryFor(employeeId, date);

      if (input.statuses?.length && !input.statuses.includes(summary.status)) continue;
      if (input.overtimeOnly && summary.status !== 'overtime' && summary.status !== 'critical') {
        continue;
      }
      if (input.divisionIds?.length) {
        const touchesDivision = summary.divisionContributions.some((contribution) =>
          input.divisionIds!.includes(contribution.divisionId),
        );
        if (!touchesDivision) continue;
      }
      if (input.projectIds?.length) {
        const touchesProject = summary.projectContributions.some((contribution) =>
          input.projectIds!.includes(contribution.projectId),
        );
        if (!touchesProject) continue;
      }
      if (input.workLocations?.length) {
        const entries = mockStore
          .entriesFor(employeeId, date)
          .filter((entry) => entry.state !== 'draft');
        if (!entries.some((entry) => input.workLocations!.includes(entry.workLocation))) continue;
      }
      if (input.employmentTypes?.length) {
        const employee = EMPLOYEES.find((item) => item.id === employeeId);
        if (!employee || !input.employmentTypes.includes(employee.employmentType)) continue;
      }
      if (input.teamLeadIds?.length) {
        const employee = EMPLOYEES.find((item) => item.id === employeeId);
        if (!employee?.teamLeadEmployeeId || !input.teamLeadIds.includes(employee.teamLeadEmployeeId)) {
          continue;
        }
      }
      rows.push({ employeeId, date, summary });
    }
  }
  return rows;
}

function hourlyRateFor(employeeId: string) {
  const rate = COST_RATES.find((item) => item.scopeId === employeeId);
  return rate?.hourlyRate.visible ? rate.hourlyRate.value : ZERO_BDT;
}

const RESTRICTED_CELL = 'Restricted';

/* -------------------------------------------------------------------------- */
/* Export jobs                                                                */
/* -------------------------------------------------------------------------- */

interface JobRecord {
  id: string;
  reportKey: string;
  reportTitle: string;
  format: ExportFormat;
  requestedAt: string;
  requestedBy: string;
  requestedByUserId: string;
  filterSummary: string;
  state: 'queued' | 'processing' | 'ready' | 'expired' | 'failed' | 'cancelled';
  readyAt: string | null;
  expiresAt: string | null;
  failureMessage: string | null;
  includesProtectedFields: boolean;
}

const FORMAT_LABEL: Readonly<Record<ExportFormat, string>> = {
  excel: 'Excel',
  csv: 'CSV',
  pdf: 'PDF',
  print: 'Print',
};

const STATE_LABEL = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready',
  expired: 'Expired',
  failed: 'Failed',
  cancelled: 'Cancelled',
} as const;

/**
 * Seeded so every export state is demonstrable without waiting.
 *
 * `advanceExport` walks a job queued → processing → ready, which is how the
 * demo shows the lifecycle; nothing here produces a file.
 */
function seedJobs(): JobRecord[] {
  return [
    {
      id: 'rep-exp-1',
      reportKey: 'timesheet-detail',
      reportTitle: 'Timesheet detail',
      format: 'excel',
      requestedAt: '2026-09-01T15:40:00+06:00',
      requestedBy: 'Imran Hossain',
      requestedByUserId: 'usr-2001',
      filterSummary: '1 Aug – 31 Aug 2026 · assigned employees',
      state: 'ready',
      readyAt: '2026-09-01T15:40:50+06:00',
      expiresAt: '2026-10-01T15:40:50+06:00',
      failureMessage: null,
      includesProtectedFields: false,
    },
    {
      id: 'rep-exp-2',
      reportKey: 'attendance-register',
      reportTitle: 'Attendance register',
      format: 'pdf',
      requestedAt: '2026-09-02T09:05:00+06:00',
      requestedBy: 'Rezaul Haque',
      requestedByUserId: 'usr-3001',
      filterSummary: '17 Aug – 2 Sep 2026 · all divisions',
      state: 'processing',
      readyAt: null,
      expiresAt: null,
      failureMessage: null,
      includesProtectedFields: false,
    },
    {
      id: 'rep-exp-3',
      reportKey: 'payroll-hours',
      reportTitle: 'Payroll hours and cost',
      format: 'excel',
      requestedAt: '2026-08-02T11:00:00+06:00',
      requestedBy: 'Mahmuda Akter',
      requestedByUserId: 'usr-4001',
      filterSummary: 'July 2026 · all divisions',
      state: 'expired',
      readyAt: '2026-08-02T11:01:10+06:00',
      expiresAt: '2026-09-01T11:01:10+06:00',
      failureMessage: null,
      includesProtectedFields: true,
    },
    {
      id: 'rep-exp-5',
      reportKey: 'workload-capacity',
      reportTitle: 'Workload and capacity',
      format: 'excel',
      requestedAt: '2026-09-02T08:55:00+06:00',
      requestedBy: 'Imran Hossain',
      requestedByUserId: 'usr-2001',
      filterSummary: '31 Aug – 6 Sep 2026 · assigned employees',
      // Seeded queued rather than relying on one the viewer just created: a
      // full page load resets the in-memory mock, and every state has to be
      // demonstrable on a cold open.
      state: 'queued',
      readyAt: null,
      expiresAt: null,
      failureMessage: null,
      includesProtectedFields: false,
    },
    {
      id: 'rep-exp-4',
      reportKey: 'evaluation-progress',
      reportTitle: 'Evaluation progress',
      format: 'csv',
      requestedAt: '2026-09-01T10:30:00+06:00',
      requestedBy: 'Rezaul Haque',
      requestedByUserId: 'usr-3001',
      filterSummary: 'Q3 2026 · all divisions',
      state: 'failed',
      readyAt: null,
      expiresAt: null,
      failureMessage:
        'The evaluation period is still open. Export once scoring is complete so the file cannot disagree with the published results.',
      includesProtectedFields: false,
    },
  ];
}

let jobs: JobRecord[] = seedJobs();

function jobView(job: JobRecord, userId: string): ExportJobView {
  const mayDownload =
    job.state === 'ready' &&
    (!job.includesProtectedFields || hasPermission(userId, SENSITIVE_PERMISSIONS.exportProtected));
  return {
    id: job.id,
    reportTitle: `${job.reportTitle} — ${job.filterSummary}`,
    format: job.format,
    formatLabel: FORMAT_LABEL[job.format],
    requestedByLabel: job.requestedBy,
    requestedAtLabel: formatTimestamp(job.requestedAt),
    filterSummary: job.filterSummary,
    state: job.state,
    stateLabel: STATE_LABEL[job.state],
    expiresAtLabel: job.expiresAt ? formatTimestamp(job.expiresAt) : null,
    failureMessage: job.failureMessage,
    canDownload: mayDownload,
    canRetry: job.state === 'failed' || job.state === 'expired',
    downloadUrl: null,
  };
}

/* -------------------------------------------------------------------------- */
/* Service                                                                    */
/* -------------------------------------------------------------------------- */

export const mockReportingService: ReportingService = {
  async listReports(userId) {
    await delay();
    const runnable = REPORT_SPECS.filter((spec) => canRun(userId, spec));
    const categories = [...new Set(runnable.map((spec) => spec.category))];

    return success<readonly ReportCatalogueGroupView[]>(
      categories.map((category) => ({
        category,
        label: CATEGORY_LABEL[category],
        description: CATEGORY_DESCRIPTION[category],
        reports: runnable
          .filter((spec) => spec.category === category)
          .map((spec) => definitionView(userId, spec)),
      })),
    );
  },

  async getReport(userId, reportKey) {
    await delay();
    const spec = REPORT_SPECS.find((item) => item.key === reportKey);
    // A report the viewer may not run is indistinguishable from one that does
    // not exist, so the catalogue cannot be used to enumerate other roles.
    if (!spec || !canRun(userId, spec)) return notFound('Report not found.');
    return success(definitionView(userId, spec));
  },

  async runReport(userId, input) {
    await delay();
    const spec = REPORT_SPECS.find((item) => item.key === input.reportKey);
    if (!spec || !canRun(userId, spec)) return notFound('Report not found.');

    const from = input.from ?? DEFAULT_FROM;
    const to = input.to ?? DEFAULT_TO;
    const allowedCost = hasPermission(userId, SENSITIVE_PERMISSIONS.financialDetail);
    const willRedact = Boolean(
      spec.redactsWithoutPermission && !hasPermission(userId, spec.redactsWithoutPermission),
    );

    const days = collectDays(input);
    const includesUnverified = !mockStore.isDateLocked(from) || !mockStore.isDateLocked(to);

    const appliedFilters: { label: string; value: string }[] = [
      { label: 'Date range', value: formatDateRange(from, to) },
    ];
    const addFilter = (label: string, values: readonly string[] | undefined, resolve: (value: string) => string) => {
      if (values?.length) appliedFilters.push({ label, value: values.map(resolve).join(', ') });
    };
    addFilter('Employee', input.employeeIds, employeeName);
    addFilter('Division', input.divisionIds, (id) => divisionOf(id).name);
    addFilter('Project', input.projectIds, (id) => PROJECTS.find((p) => p.id === id)?.code ?? id);
    addFilter('Team Lead', input.teamLeadIds, employeeName);
    addFilter('Employment type', input.employmentTypes, (value) =>
      EMPLOYMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value,
    );
    addFilter('Work location', input.workLocations, (value) =>
      WORK_LOCATION_LABEL[value as keyof typeof WORK_LOCATION_LABEL] ?? value,
    );
    addFilter('Day status', input.statuses, (value) =>
      STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value,
    );
    if (input.overtimeOnly) appliedFilters.push({ label: 'Overtime only', value: 'Yes' });

    const base = {
      reportKey: spec.key,
      title: spec.title,
      description: spec.description,
      categoryLabel: CATEGORY_LABEL[spec.category],
      appliedFilters,
      periodLabel: formatDateRange(from, to),
      timezone: STANDARD_POLICY.businessTimezone,
      policyVersion: STANDARD_POLICY.version,
      generatedAtLabel: formatTimestamp(new Date().toISOString()),
      includesUnverifiedData: includesUnverified,
      unverifiedWarning: includesUnverified
        ? 'This range includes dates from a period that is not verified. Those figures can still change.'
        : null,
      restrictionNote: willRedact
        ? 'Cost columns need the financial-detail permission. They are listed here and their values are withheld.'
        : null,
    };

    if (spec.key === 'timesheet-detail') {
      const rows = days.map((day) => ({
        employee: employeeName(day.employeeId),
        date: formatDate(day.date),
        active: toDurationView(day.summary.activeMinutes).display,
        break: toDurationView(day.summary.breakMinutes).display,
        total: toDurationView(day.summary.totalMinutes).display,
        status: day.summary.status.replace('_', '-'),
        divisions: day.summary.divisionContributions
          .map((contribution) => divisionOf(contribution.divisionId).code)
          .join(', ') || '—',
      }));
      const totals = aggregateSummaries(
        days.map((day) => day.summary),
        STANDARD_POLICY.overtimeThresholdMinutes,
      );
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'date', label: 'Date', align: 'left', restricted: false },
          { field: 'active', label: 'Active', align: 'right', restricted: false },
          { field: 'break', label: 'Break', align: 'right', restricted: false },
          { field: 'total', label: 'Total', align: 'right', restricted: false },
          { field: 'status', label: 'Status', align: 'left', restricted: false },
          { field: 'divisions', label: 'Divisions', align: 'left', restricted: false },
        ],
        rows,
        totals: {
          employee: 'Total',
          date: `${rows.length} days`,
          active: toDurationView(totals.activeMinutes).display,
          break: toDurationView(totals.breakMinutes).display,
          total: toDurationView(totals.totalMinutes).display,
          status: '',
          divisions: '',
        },
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'division-contribution') {
      const byDivision = new Map<string, number>();
      for (const day of days) {
        for (const contribution of day.summary.divisionContributions) {
          if (input.divisionIds?.length && !input.divisionIds.includes(contribution.divisionId)) {
            continue;
          }
          byDivision.set(
            contribution.divisionId,
            (byDivision.get(contribution.divisionId) ?? 0) + contribution.activeMinutes,
          );
        }
      }
      const total = [...byDivision.values()].reduce((sum, value) => sum + value, 0) || 1;
      const rows = [...byDivision.entries()].map(([divisionId, minutes]) => ({
        division: divisionOf(divisionId).name,
        code: divisionOf(divisionId).code,
        active: toDurationView(minutes).display,
        share: `${Math.round((minutes / total) * 100)}%`,
      }));
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'division', label: 'Division', align: 'left', restricted: false },
          { field: 'code', label: 'Code', align: 'left', restricted: false },
          { field: 'active', label: 'Active', align: 'right', restricted: false },
          { field: 'share', label: 'Share', align: 'right', restricted: false },
        ],
        rows,
        totals: {
          division: 'Total',
          code: '',
          active: toDurationView(total).display,
          share: '100%',
        },
        rowCount: rows.length,
        chart: {
          title: 'Active time by division',
          kind: 'donut',
          valueHeader: 'Active hours',
          data: [...byDivision.entries()].map(([divisionId, minutes]) => ({
            key: divisionId,
            label: divisionOf(divisionId).name,
            value: minutes,
            display: toDurationView(minutes).display,
          })),
        },
      });
    }

    if (spec.key === 'overtime-summary') {
      const overtimeDays = days.filter(
        (day) => day.summary.status === 'overtime' || day.summary.status === 'critical',
      );
      const rows = overtimeDays.map((day) => ({
        employee: employeeName(day.employeeId),
        date: formatDate(day.date),
        total: toDurationView(day.summary.totalMinutes).display,
        overtime: toDurationView(
          Math.max(0, day.summary.totalMinutes - STANDARD_POLICY.overtimeThresholdMinutes),
        ).display,
        status: day.summary.status === 'critical' ? 'Critical' : 'Overtime',
        reason:
          (day.summary.status === 'critical'
            ? day.summary.criticalExplanation ?? day.summary.overtimeReason
            : day.summary.overtimeReason) ?? '—',
      }));
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'date', label: 'Date', align: 'left', restricted: false },
          { field: 'total', label: 'Day total', align: 'right', restricted: false },
          { field: 'overtime', label: 'Overtime', align: 'right', restricted: false },
          { field: 'status', label: 'Classification', align: 'left', restricted: false },
          { field: 'reason', label: 'Recorded reason', align: 'left', restricted: false },
        ],
        rows,
        totals: {
          employee: 'Total',
          date: `${rows.length} days`,
          total: '',
          overtime: toDurationView(
            overtimeDays.reduce(
              (sum, day) =>
                sum +
                Math.max(0, day.summary.totalMinutes - STANDARD_POLICY.overtimeThresholdMinutes),
              0,
            ),
          ).display,
          status: '',
          reason: '',
        },
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'headcount') {
      const employees = EMPLOYEES.filter((employee) => {
        if (input.employmentTypes?.length && !input.employmentTypes.includes(employee.employmentType)) {
          return false;
        }
        if (
          input.teamLeadIds?.length &&
          (!employee.teamLeadEmployeeId || !input.teamLeadIds.includes(employee.teamLeadEmployeeId))
        ) {
          return false;
        }
        if (input.divisionIds?.length) {
          const assignments = mockStore
            .assignments()
            .filter((item) => item.employeeId === employee.id && item.isActive);
          if (!assignments.some((item) => input.divisionIds!.includes(item.divisionId))) return false;
        }
        return true;
      });
      const rows = employees.map((employee) => {
        const assignments = mockStore
          .assignments()
          .filter((item) => item.employeeId === employee.id && item.isActive);
        const missing: string[] = [];
        if (!employee.phone) missing.push('phone');
        if (!employee.officeLocation) missing.push('office');
        if (!employee.department) missing.push('department');
        return {
          employee: employee.fullName,
          code: employee.employeeCode,
          status: employee.status === 'active' ? 'Active' : 'Inactive',
          employment: EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === employee.employmentType)?.label ?? '',
          divisions: assignments.map((item) => divisionOf(item.divisionId).code).join(', ') || '—',
          teamLead: employee.teamLeadEmployeeId ? employeeName(employee.teamLeadEmployeeId) : '—',
          profile: missing.length ? `Missing ${missing.join(', ')}` : 'Complete',
        };
      });
      return success<ReportPreviewView>({
        ...base,
        appliedFilters: appliedFilters.filter((filter) => filter.label !== 'Date range'),
        periodLabel: 'Current records',
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'code', label: 'Code', align: 'left', restricted: false },
          { field: 'status', label: 'Status', align: 'left', restricted: false },
          { field: 'employment', label: 'Employment', align: 'left', restricted: false },
          { field: 'divisions', label: 'Divisions', align: 'left', restricted: false },
          { field: 'teamLead', label: 'Team Lead', align: 'left', restricted: false },
          { field: 'profile', label: 'Profile', align: 'left', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'payroll-hours') {
      const employeeIds = [...new Set(days.map((day) => day.employeeId))];
      const rows = employeeIds.map((employeeId) => {
        const own = days.filter((day) => day.employeeId === employeeId);
        const totals = aggregateSummaries(
          own.map((day) => day.summary),
          STANDARD_POLICY.overtimeThresholdMinutes,
        );
        const cost = costOfMinutes(hourlyRateFor(employeeId), totals.activeMinutes);
        return {
          employee: employeeName(employeeId),
          days: String(own.filter((day) => day.summary.activeMinutes > 0).length),
          active: toDurationView(totals.activeMinutes).display,
          overtime: toDurationView(totals.overtimeMinutes).display,
          rate: allowedCost ? formatMoney(hourlyRateFor(employeeId)) : RESTRICTED_CELL,
          cost: allowedCost ? formatMoney(cost) : RESTRICTED_CELL,
        };
      });
      const totalCost = sumMoney(
        employeeIds.map((employeeId) =>
          costOfMinutes(
            hourlyRateFor(employeeId),
            aggregateSummaries(
              days.filter((day) => day.employeeId === employeeId).map((day) => day.summary),
              STANDARD_POLICY.overtimeThresholdMinutes,
            ).activeMinutes,
          ),
        ),
      );
      const allTotals = aggregateSummaries(
        days.map((day) => day.summary),
        STANDARD_POLICY.overtimeThresholdMinutes,
      );
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'days', label: 'Days', align: 'right', restricted: false },
          { field: 'active', label: 'Active', align: 'right', restricted: false },
          { field: 'overtime', label: 'Overtime', align: 'right', restricted: false },
          { field: 'rate', label: 'Hourly rate', align: 'right', restricted: !allowedCost },
          { field: 'cost', label: 'Labour cost', align: 'right', restricted: !allowedCost },
        ],
        rows,
        totals: {
          employee: 'Total',
          days: '',
          active: toDurationView(allTotals.activeMinutes).display,
          overtime: toDurationView(allTotals.overtimeMinutes).display,
          rate: '',
          cost: allowedCost ? formatMoney(totalCost) : RESTRICTED_CELL,
        },
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'cost-rates') {
      const rows = REPORTED_EMPLOYEE_IDS.filter(
        (id) => !input.employeeIds?.length || input.employeeIds.includes(id),
      ).map((employeeId) => ({
        employee: employeeName(employeeId),
        rate: formatMoney(hourlyRateFor(employeeId)),
        effective: formatDate('2025-01-01'),
      }));
      return success<ReportPreviewView>({
        ...base,
        appliedFilters: appliedFilters.filter((filter) => filter.label !== 'Date range'),
        periodLabel: 'Current rates',
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'rate', label: 'Hourly rate', align: 'right', restricted: false },
          { field: 'effective', label: 'Effective from', align: 'left', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'attendance-register') {
      const rows = days.map((day) => ({
        employee: employeeName(day.employeeId),
        date: formatDate(day.date),
        state: ATTENDANCE_LABEL[day.summary.attendance],
        active: toDurationView(day.summary.activeMinutes).display,
        required: toDurationView(day.summary.requiredActiveMinutes).display,
        note:
          day.summary.exemption === 'holiday'
            ? 'Holiday, no timesheet required'
            : day.summary.exemption === 'full_day_leave'
              ? 'Approved leave, no timesheet required'
              : day.summary.exemption === 'weekly_off'
                ? 'Weekly off'
                : day.summary.attendance === 'half_day_leave'
                  ? 'Half-day leave, requirement reduced'
                  : '—',
      }));
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'date', label: 'Date', align: 'left', restricted: false },
          { field: 'state', label: 'Attendance', align: 'left', restricted: false },
          { field: 'active', label: 'Active', align: 'right', restricted: false },
          { field: 'required', label: 'Required', align: 'right', restricted: false },
          { field: 'note', label: 'Note', align: 'left', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'wfh-register') {
      const requests = mockStore.allWfhRequests().filter((request) => {
        if (request.wfhDate < from || request.wfhDate > to) return false;
        if (input.employeeIds?.length && !input.employeeIds.includes(request.employeeId)) return false;
        if (input.divisionIds?.length && !input.divisionIds.includes(request.divisionId)) return false;
        return true;
      });
      const rows = requests.map((request) => {
        const recorded = mockStore
          .entriesFor(request.employeeId, request.wfhDate)
          .filter((entry) => entry.state !== 'draft');
        return {
          employee: employeeName(request.employeeId),
          date: formatDate(request.wfhDate),
          division: divisionOf(request.divisionId).code,
          portion: request.portion === 'half_day' ? 'Half day' : 'Full day',
          state: request.state.replace('_', ' '),
          recorded: recorded.length
            ? toDurationView(
                recorded.reduce((sum, entry) => sum + entry.activeMinutes, 0),
              ).display
            : '—',
        };
      });
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'date', label: 'Date', align: 'left', restricted: false },
          { field: 'division', label: 'Division', align: 'left', restricted: false },
          { field: 'portion', label: 'Portion', align: 'left', restricted: false },
          { field: 'state', label: 'State', align: 'left', restricted: false },
          { field: 'recorded', label: 'Work recorded', align: 'right', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'evaluation-progress') {
      const rows = REPORTED_EMPLOYEE_IDS.filter(
        (id) => !input.employeeIds?.length || input.employeeIds.includes(id),
      ).map((employeeId) => ({
        employee: employeeName(employeeId),
        period: employeeId === 'emp-1004' ? 'H1 2026 half-yearly review' : 'Q3 2026 quarterly review',
        state:
          employeeId === 'emp-1001'
            ? 'Reviewer scoring'
            : employeeId === 'emp-1002'
              ? 'Not started'
              : employeeId === 'emp-1003'
                ? 'HR review'
                : 'Published',
        due: employeeId === 'emp-1004' ? formatDate('2026-07-15') : formatDate('2026-09-30'),
      }));
      return success<ReportPreviewView>({
        ...base,
        appliedFilters: appliedFilters.filter((filter) => filter.label !== 'Date range'),
        periodLabel: 'Open evaluation periods',
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'period', label: 'Period', align: 'left', restricted: false },
          { field: 'state', label: 'State', align: 'left', restricted: false },
          { field: 'due', label: 'Due', align: 'left', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: null,
      });
    }

    if (spec.key === 'workload-capacity') {
      const employeeIds = [...new Set(days.map((day) => day.employeeId))];
      const rows = employeeIds.map((employeeId) => {
        const own = days.filter((day) => day.employeeId === employeeId);
        const totals = aggregateSummaries(
          own.map((day) => day.summary),
          STANDARD_POLICY.overtimeThresholdMinutes,
        );
        const capacity = totals.requiredActiveMinutes || 1;
        return {
          employee: employeeName(employeeId),
          capacity: toDurationView(totals.requiredActiveMinutes).display,
          actual: toDurationView(totals.activeMinutes).display,
          utilization: `${Math.round((totals.activeMinutes / capacity) * 100)}%`,
        };
      });
      return success<ReportPreviewView>({
        ...base,
        columns: [
          { field: 'employee', label: 'Employee', align: 'left', restricted: false },
          { field: 'capacity', label: 'Required', align: 'right', restricted: false },
          { field: 'actual', label: 'Actual', align: 'right', restricted: false },
          { field: 'utilization', label: 'Utilization', align: 'right', restricted: false },
        ],
        rows,
        totals: null,
        rowCount: rows.length,
        chart: {
          title: 'Actual against required time',
          kind: 'bar',
          valueHeader: 'Active hours',
          data: rows.map((row, index) => ({
            key: `${row.employee}-${index}`,
            label: row.employee,
            value:
              aggregateSummaries(
                days.filter((day) => employeeName(day.employeeId) === row.employee).map((day) => day.summary),
                STANDARD_POLICY.overtimeThresholdMinutes,
              ).activeMinutes,
            display: row.actual,
          })),
        },
      });
    }

    // remarks-register
    const remarks = REPORTED_EMPLOYEE_IDS.filter(
      (id) => !input.employeeIds?.length || input.employeeIds.includes(id),
    ).flatMap((employeeId) => mockStore.remarksFor(employeeId));
    const rows = remarks.map((remark) => ({
      employee: employeeName(remark.employeeId),
      author: employeeName(remark.authorEmployeeId),
      kind: remark.isCorrectionRequest ? 'Correction request' : 'General remark',
      state: remark.state.charAt(0).toUpperCase() + remark.state.slice(1),
      created: formatDate(remark.createdAt.slice(0, 10)),
      responses: String(remark.responses.length),
    }));
    return success<ReportPreviewView>({
      ...base,
      columns: [
        { field: 'employee', label: 'Employee', align: 'left', restricted: false },
        { field: 'author', label: 'Author', align: 'left', restricted: false },
        { field: 'kind', label: 'Type', align: 'left', restricted: false },
        { field: 'state', label: 'State', align: 'left', restricted: false },
        { field: 'created', label: 'Created', align: 'left', restricted: false },
        { field: 'responses', label: 'Responses', align: 'right', restricted: false },
      ],
      rows,
      totals: null,
      rowCount: rows.length,
      chart: null,
    });
  },

  async requestExport(userId, input) {
    await delay();
    const spec = REPORT_SPECS.find((item) => item.key === input.reportKey);
    if (!spec || !canRun(userId, spec)) return notFound('Report not found.');

    const includesProtected = Boolean(
      spec.requiresPermission ||
        (spec.redactsWithoutPermission &&
          hasPermission(userId, spec.redactsWithoutPermission)),
    );
    if (includesProtected && !hasPermission(userId, SENSITIVE_PERMISSIONS.exportProtected)) {
      return {
        status: 'permission_denied' as const,
        code: 'FORBIDDEN' as const,
        message: 'This report includes protected columns.',
        guidance:
          'Exporting protected fields needs the export-protected permission, granted separately from report access.',
      };
    }

    const job: JobRecord = {
      id: `rep-exp-${Date.now()}`,
      reportKey: spec.key,
      reportTitle: spec.title,
      format: input.format,
      requestedAt: new Date().toISOString(),
      requestedBy: viewerOf(userId)?.fullName ?? 'Viewer',
      requestedByUserId: userId,
      filterSummary: formatDateRange(
        input.run.from ?? DEFAULT_FROM,
        input.run.to ?? DEFAULT_TO,
      ),
      state: 'queued',
      readyAt: null,
      expiresAt: null,
      failureMessage: null,
      includesProtectedFields: includesProtected,
    };
    jobs = [job, ...jobs];

    return success({
      job: jobView(job, userId),
      note:
        input.format === 'print'
          ? 'Use your browser print dialog. The print stylesheet removes the application chrome and keeps the report title, filters, table headers and totals.'
          : 'Export configuration recorded and queued. No file is produced during the frontend milestone — advance the job to see the remaining states.',
    });
  },

  async listExports(userId) {
    await delay();
    return success(jobs.map((job) => jobView(job, userId)));
  },

  async advanceExport(userId, jobId) {
    await delay();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return notFound('Export job not found.');

    // Queued → processing → ready, so the lifecycle is demonstrable without a
    // worker. Terminal states stay put.
    const next: JobRecord =
      job.state === 'queued'
        ? { ...job, state: 'processing' }
        : job.state === 'processing'
          ? {
              ...job,
              state: 'ready',
              readyAt: new Date().toISOString(),
              expiresAt: addDays(new Date().toISOString().slice(0, 10), 30),
            }
          : job;

    jobs = jobs.map((item) => (item.id === jobId ? next : item));
    return success(jobView(next, userId));
  },

  async retryExport(userId, jobId) {
    await delay();
    const job = jobs.find((item) => item.id === jobId);
    if (!job) return notFound('Export job not found.');
    const next: JobRecord = {
      ...job,
      state: 'queued',
      requestedAt: new Date().toISOString(),
      requestedBy: viewerOf(userId)?.fullName ?? job.requestedBy,
      readyAt: null,
      expiresAt: null,
      failureMessage: null,
    };
    jobs = jobs.map((item) => (item.id === jobId ? next : item));
    return success(jobView(next, userId));
  },
};

/** Test seam: restores the Phase 7 export state. */
export function resetReportingState(): void {
  jobs = seedJobs();
}

export { LEAVE_TYPES };
