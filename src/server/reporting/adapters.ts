import { reportFilters } from './filters';
import { randomUUID } from 'node:crypto';
import type { ReportingService, ReportRunInput, ReportDefinitionView, ReportPreviewView, ReportExportInput, ReportCatalogueGroupView } from '@/contracts/reporting';
import type { ExportJobView } from '@/contracts/view-models';
import { success } from '@/contracts/results';
import { formatDateRange, formatTimestamp } from '@/lib/format';
import { hasPermission } from '@/server/authorization/policy';
import { ReportApplication, denied, type ReportDataset } from './application';
import { ExportApplication, type StoredExport } from './exports';
import type { ReportSpec } from './catalogue';
export function runQuery(i: ReportRunInput) { return { dateRange: i.from || i.to ? { from: i.from ?? '', to: i.to ?? '' } : undefined, employeeIds: i.employeeIds, divisionIds: i.divisionIds, projectIds: i.projectIds, taskIds: i.taskIds, teamLeadIds: i.teamLeadIds, employmentTypes: i.employmentTypes, workLocations: i.workLocations, overtimeOnly: i.overtimeOnly, dayStatuses: i.statuses,recordStatuses:i.recordStatuses,sort:i.sort,direction:i.direction, ...('periodId' in i ? { periodId: i.periodId } : {}), ...('verifiedOnly' in i ? { verifiedOnly: i.verifiedOnly } : {}), ...('wfhOnly' in i ? { wfhOnly: i.wfhOnly } : {}), ...('page' in i ? { page: i.page } : {}), ...('pageSize' in i ? { pageSize: i.pageSize } : {}) }; }
export function preview(d: ReportDataset): ReportPreviewView {
    const fields = [...new Set(d.rows.flatMap(r => Object.keys(r.cells)))];
    return { policyVersions: d.metadata.policyVersions, pageInfo: { page: d.query.page, pageSize: d.query.pageSize, totalItems: d.totalItems, totalPages: Math.ceil(d.totalItems / d.query.pageSize), hasPreviousPage: d.query.page > 1, hasNextPage: d.query.page * d.query.pageSize < d.totalItems }, reportKey: d.spec.key, title: d.spec.title, description: d.spec.title, categoryLabel: d.spec.category, appliedFilters: [{ label: 'Filters', value: JSON.stringify(d.metadata.filters) }, { label: 'Policy versions', value: d.metadata.policyVersions.join(', ') || 'No calculated records' }], periodLabel: formatDateRange(d.metadata.period.from, d.metadata.period.to), timezone: d.metadata.timezone, policyVersion: d.metadata.policyVersions[0] ?? 0, generatedAtLabel: formatTimestamp(d.metadata.generatedAt), includesUnverifiedData: d.metadata.includesUnverifiedData, unverifiedWarning: d.metadata.includesUnverifiedData ? 'This report includes unverified information.' : null, restrictionNote: d.spec.financial && !d.cost && !d.spec.costOnly ? 'Financial fields require a separate permission.' : null, columns: fields.map(field => ({ field, label: field, align: field === 'active' || field === 'cost' ? 'right' as const : 'left' as const, restricted: d.rows.some(r => r.cells[field] === 'Restricted') })), rows: d.rows.map(r => r.cells), totals: d.totals, rowCount: d.totalItems, chart: null };
}
export function jobView(j: StoredExport): ExportJobView {
    return { id: j.id, reportTitle: j.reportKey, format: j.format, formatLabel: j.format === 'excel' ? 'Excel' : j.format.toUpperCase(), state: j.state, stateLabel: j.state.charAt(0).toUpperCase() + j.state.slice(1), requestedAtLabel: formatTimestamp(j.requestedAt), requestedByLabel: 'You', filterSummary: j.reportKey, expiresAtLabel: j.expiresAt ? formatTimestamp(j.expiresAt) : null, failureMessage: j.failureCode ? 'The export could not be generated. Review its filters and worker configuration.' : null, downloadUrl: j.state === 'ready' ? `/api/reporting?view=download&id=${j.id}` : null, canDownload: j.state === 'ready', canRetry: j.state === 'failed' };
}
export class BackendReportingService implements ReportingService {
    constructor(readonly app: ReportApplication, readonly exports: ExportApplication) { }
    private async identity(userId: string) { return (await this.app.actor())?.userId === userId; }
    private async definition(s: ReportSpec, filters?: ReportDefinitionView['filters']): Promise<ReportDefinitionView> { const actor = await this.app.actor(); return { key: s.key, title: s.title, description: s.title, category: s.category, categoryLabel: s.category, filters: filters??await reportFilters(this.app), containsProtectedFields: Boolean(s.financial || s.category === 'evaluation'), willRedactFields: Boolean(s.financial && actor && !hasPermission(actor, 'finance.cost.view')), href: `/reports/${s.key}` }; }
    async listReports(userId: string) { if (!await this.identity(userId))
        return denied; const r = await this.app.catalogue(); if (r.status !== 'success')
        return r; const filters=await reportFilters(this.app);const groups: ReportCatalogueGroupView[] = []; for (const category of new Set(r.data.map(s => s.category)))
        groups.push({ category, label: category, description: category, reports: await Promise.all(r.data.filter(s => s.category === category).map(s => this.definition(s,filters))) }); return success(groups); }
    async getReport(userId: string, key: string) { if (!await this.identity(userId))
        return denied; const r = await this.app.catalogue(); if (r.status !== 'success')
        return r; const s = r.data.find(s => s.key === key); return s ? success(await this.definition(s)) : { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'record was not found.', resource: 'record' }; }
    async runReport(userId: string, input: ReportRunInput) { if (!await this.identity(userId))
        return denied; const r = await this.app.run(input.reportKey, runQuery(input)); return r.status === 'success' ? success(preview(r.data)) : r; }
    async requestExport(userId: string, input: ReportExportInput) { if (!await this.identity(userId))
        return denied; if (input.reportKey !== input.run.reportKey)
        return denied; const r = await this.exports.request({ reportKey: input.reportKey, format: input.format, query: runQuery(input.run), idempotencyKey: input.idempotencyKey ?? randomUUID() }); return r.status === 'success' ? success({ job: jobView(r.data), note: 'Queued for secure server-side generation.' }) : r; }
    async listExports(userId: string) { if (!await this.identity(userId))
        return denied; const r = await this.exports.list(); return r.status === 'success' ? success(r.data.map(jobView)) : r; }
    async advanceExport(userId: string, id: string) { if (!await this.identity(userId))
        return denied; const r = await this.exports.get(id); return r.status === 'success' ? success(jobView(r.data)) : r; }
    async retryExport(userId: string, id: string) { if (!await this.identity(userId))
        return denied; const r = await this.exports.transition(id, 'retry'); return r.status === 'success' ? success(jobView(r.data)) : r; }
}
