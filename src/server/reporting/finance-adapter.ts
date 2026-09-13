import { RequestApplication } from '@/server/hr/requests';
import { randomUUID } from 'node:crypto';
import type { FinanceService, FinanceFilters, FinancePeriodRef, FinanceHoursView, FinanceOvertimeView, CostAnalysisView, BillableSplitView, PayrollSummaryView, FinanceDashboard, FinanceReportFilters, FinanceReportPreviewView, ExportConfiguration, RedactableMoneyView } from '@/contracts/finance';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { Money } from '@/contracts/domain';
import type { DivisionRef, ProjectRef } from '@/contracts/view-models';
import { formatDate, formatDateRange, formatMoney, formatMoneyCompact, formatTimestamp } from '@/lib/format';
import { costOfRatedMinutes, storedMoney, sumMoney, subtractMoney, variancePercent } from '@/lib/money';
import { allocateMinutes } from '@/lib/calculation/engine';
import { toDurationView } from '@/lib/status';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { TimeApplication } from '@/server/time/application';
import { invalid } from '@/server/time/validation';
import { ReportApplication, denied, type RatedLine } from './application';
import { ExportApplication } from './exports';
import { jobView, preview } from './adapters';
const redacted: RedactableMoneyView = { visible: false, reason: 'permission_required' };
const moneyView = (m: Money | undefined): RedactableMoneyView => m ? { visible: true, value: m, display: formatMoney(m), compact: formatMoneyCompact(m) } : redacted;
const warning = (verified: boolean) => verified ? null : 'This report includes unverified information.';
export class BackendFinanceService implements FinanceService {
    constructor(readonly app: ReportApplication, readonly exports: ExportApplication) { }
    private async identity(userId: string) { const a = await this.app.actor(); return a?.userId === userId && hasPermission(a, 'report.finance.read'); }
    async listPeriods(userId: string): Promise<Result<readonly FinancePeriodRef[]>> {
        if (!await this.identity(userId))
            return denied;
        const actor = (await this.app.actor())!;
        return success((await this.app.requests.repository.time.periods()).filter(p => ['verified', 'amended'].includes(p.status) || hasPermission(actor, 'report.finance.unverified')).map(p => ({ id: p.id, label: p.label, rangeLabel: formatDateRange(p.startDate, p.endDate), startDate: p.startDate, endDate: p.endDate, isVerified: ['verified', 'amended'].includes(p.status), timesheetPeriodId: p.id })).sort((a, b) => b.endDate.localeCompare(a.endDate)));
    }
    private async period(userId: string, id?: string): Promise<Result<FinancePeriodRef>> { const r = await this.listPeriods(userId); if (r.status !== 'success')
        return r; const p = id ? r.data.find(p => p.id === id) : r.data.find(p => p.isVerified); return p ? success(p) : indistinguishableNotFound(); }
    private query(p: FinancePeriodRef, f: Partial<FinanceFilters> = {}) { return { periodId: p.id, verifiedOnly: p.isVerified, employeeIds: f.employeeIds?.length ? f.employeeIds : undefined, divisionIds: f.divisionIds?.length ? f.divisionIds : undefined, projectIds: f.projectIds?.length ? f.projectIds : undefined, dayStatuses: f.statuses?.length ? f.statuses : undefined }; }
    async getHours(userId: string, f: Partial<FinanceFilters>): Promise<Result<FinanceHoursView>> {
        const period = await this.period(userId, f.periodId);
        if (period.status !== 'success')
            return period;
        const dataset = await this.app.run('payroll-hours', this.query(period.data, f), true);
        if (dataset.status !== 'success')
            return dataset;
        const collected = await this.app.collect(this.app.requests.repository, dataset.data.query);
        if (collected.status !== 'success')
            return collected;
        const actor = (await this.app.actor())!, allowed = hasPermission(actor, 'finance.cost.view'), rows: FinanceHoursView['rows'][number][] = [], allRated: RatedLine[] = [];
        const time = new TimeApplication(this.app.requests.repository.time, this.app.requests.resolveActor, this.app.requests.now);
        for (const d of collected.data) {
            const employee = await this.app.requests.repository.time.employeeRef(d.employeeId);
            if (!employee)
                continue;
            const pieces = d.context.entries.filter(e => e.isActive && e.state !== 'draft').map(e => ({ entry: e, minutes: time.summary(d.employeeId, d.date, d.context, [e]).activeMinutes }));
            const breaks = allocateMinutes(d.summary.breakMinutes, pieces.map(p => p.minutes)), overtime = allocateMinutes(d.overtimeMinutes, pieces.map(p => p.minutes));
            for (const [i, p] of pieces.entries()) {
                const dv = d.context.divisions.find(v => v.id === p.entry.divisionId)!;
                const division: DivisionRef = { id: dv.id, name: dv.name, code: dv.code, isRestricted: dv.isRestricted };
                const pr = d.context.projects.find(v => v.id === p.entry.projectId);
                const project: ProjectRef | null = pr ? { id: pr.id, name: pr.name, code: pr.code, divisionId: pr.divisionId } : null;
                const rate = allowed ? await this.app.rate(this.app.requests.repository, d.employeeId, p.entry.projectId, d.date) : null;
                if (allowed && !rate)
                    return invalid('costRate', 'Configure an effective cost rate for every included record.');
                const rated = rate ? [{ hourlyRate: rate, minutes: p.minutes }] : [];
                allRated.push(...rated);
                const bill = p.entry.projectId ? (await this.app.requests.repository.rows('SELECT is_billable FROM project_billability WHERE project_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1', [p.entry.projectId, d.date, d.date]))[0] : null;
                rows.push({ key: p.entry.id, employee, division, project, projectLabel: project?.name ?? 'Not recorded', active: toDurationView(p.minutes), break: toDurationView(breaks[i]), total: toDurationView(p.minutes + breaks[i]), overtime: toDurationView(overtime[i]), dayCount: 1, statuses: [d.summary.status], isBillable: Boolean(bill?.is_billable), cost: moneyView(allowed ? costOfRatedMinutes(rated) : undefined) });
            }
        }
        return success({ period: period.data, unverifiedWarning: warning(period.data.isVerified), rows, totals: { active: toDurationView(dataset.data.activeMinutes), break: toDurationView(dataset.data.breakMinutes), total: toDurationView(dataset.data.totalMinutes), overtime: toDurationView(dataset.data.overtimeMinutes), cost: moneyView(allowed ? costOfRatedMinutes(allRated) : undefined) }, hasFinancialPermission: allowed });
    }
    async getOvertime(userId: string, f: Partial<FinanceFilters>): Promise<Result<FinanceOvertimeView>> {
        const p = await this.period(userId, f.periodId);
        if (p.status !== 'success')
            return p;
        const r = await this.app.run('finance-overtime', this.query(p.data, f), true);
        if (r.status !== 'success')
            return r;
        const collected = await this.app.collect(this.app.requests.repository, { ...r.data.query, overtimeOnly: true });
        if (collected.status !== 'success')
            return collected;
        const rows: FinanceOvertimeView['rows'][number][] = [], rated: RatedLine[] = [];
        const allowed = r.data.cost !== undefined;
        for (const d of collected.data) {
            const employee = await this.app.requests.repository.time.employeeRef(d.employeeId);
            if (!employee || !['overtime', 'critical'].includes(d.summary.status))
                continue;
            const v = d.context.divisions.find(v => v.id === d.summary.divisionContributions[0]?.divisionId);
            if (!v)
                continue;
            const rate = allowed ? await this.app.rate(this.app.requests.repository, d.employeeId, null, d.date) : null;
            if (allowed && !rate)
                return invalid('costRate', 'An employee hourly rate is required for overtime valuation.');
            const lines = rate ? [{ hourlyRate: rate, minutes: d.overtimeMinutes }] : [];
            rated.push(...lines);
            rows.push({ key: `${d.employeeId}:${d.date}`, employee, division: { id: v.id, name: v.name, code: v.code, isRestricted: v.isRestricted }, date: d.date, dateLabel: formatDate(d.date), total: toDurationView(d.summary.totalMinutes), overtime: toDurationView(d.overtimeMinutes), status: d.summary.status as 'overtime' | 'critical', statusLabel: d.summary.status === 'critical' ? 'Critical' : 'Overtime', reason: d.summary.criticalExplanation ?? d.summary.overtimeReason, cost: moneyView(allowed ? costOfRatedMinutes(lines) : undefined), href: `/timesheets?employee=${d.employeeId}&date=${d.date}` });
        }
        return success({ period: p.data, unverifiedWarning: warning(p.data.isVerified), rows, totalOvertime: toDurationView(r.data.overtimeMinutes), overtimeDayCount: rows.filter(r => r.status === 'overtime').length, criticalDayCount: rows.filter(r => r.status === 'critical').length, totalCost: moneyView(allowed ? costOfRatedMinutes(rated) : undefined), hasFinancialPermission: allowed });
    }
    async getCostAnalysis(userId: string, scope: 'project' | 'division', f: Partial<FinanceFilters>): Promise<Result<CostAnalysisView>> {
        const p = await this.period(userId, f.periodId);
        if (p.status !== 'success')
            return p;
        const r = await this.app.run(scope === 'project' ? 'project-cost' : 'division-cost', this.query(p.data, f), true);
        if (r.status !== 'success')
            return r;
        const allowed = r.data.cost !== undefined, lines: CostAnalysisView['lines'][number][] = [], budgets: Money[] = [];
        for (const row of r.data.rows) {
            let budget: Money | undefined;
            if (allowed) {
                const values = await this.app.requests.repository.rows(`SELECT amount,currency FROM budgets WHERE ${scope === 'project' ? 'project_id' : 'division_id'}=? AND period_start=? AND period_end=?`, [row.key, p.data.startDate, p.data.endDate]);
                if (!values.length)
                    return invalid('budget', 'Configure a budget for each included scope and the exact report period.');
                budget = sumMoney(values.map(v => storedMoney(String(v.amount), String(v.currency))));
                budgets.push(budget);
            }
            const cost = allowed ? costOfRatedMinutes(row.rated) : undefined;
            lines.push({ key: row.key, label: row.cells.label, secondaryLabel: p.data.label, active: toDurationView(row.activeMinutes), overtime: toDurationView(row.overtimeMinutes ?? 0), cost: moneyView(cost), budget: moneyView(budget), variance: moneyView(cost && budget ? subtractMoney(cost, budget) : undefined), variancePercent: cost && budget ? variancePercent(cost, budget) : null, estimated: null, estimateVariancePercent: null, sharePercent: r.data.activeMinutes ? Math.round(row.activeMinutes * 100 / r.data.activeMinutes) : 0, isRestrictedScope: false, drillDown: [] });
        }
        const budget = allowed ? sumMoney(budgets) : undefined;
        return success({ scope, period: p.data, unverifiedWarning: warning(p.data.isVerified), hasFinancialPermission: allowed, restrictionNote: allowed ? null : 'Financial fields require a separate permission.', lines, totalActive: toDurationView(r.data.activeMinutes), totalCost: moneyView(r.data.cost), totalBudget: moneyView(budget), totalVariance: moneyView(r.data.cost && budget ? subtractMoney(r.data.cost, budget) : undefined), totalVariancePercent: r.data.cost && budget ? variancePercent(r.data.cost, budget) : null, trend: [] });
    }
    async getBillableAnalysis(userId: string, f: Partial<FinanceFilters>): Promise<Result<BillableSplitView>> {
        const hours = await this.getHours(userId, f);
        if (hours.status !== 'success')
            return hours;
        const h = hours.data, billable = h.rows.filter(r => r.isBillable).reduce((n, r) => n + r.active.minutes, 0), nonBillable = h.rows.filter(r => !r.isBillable).reduce((n, r) => n + r.active.minutes, 0), total = h.totals.active.minutes;
        // Cost splits are calculated from exact source rated minutes by a dedicated report.
        const dataset = await this.app.run('billable-hours', this.query(h.period, f), true);
        if (dataset.status !== 'success')
            return dataset;
        const billRated = dataset.data.rows.flatMap(r => r.rated.filter(line => line.isBillable)), nonRated = dataset.data.rows.flatMap(r => r.rated.filter(line => !line.isBillable));
        return success({ period: h.period, unverifiedWarning: h.unverifiedWarning, hasFinancialPermission: h.hasFinancialPermission, billable: toDurationView(billable), nonBillable: toDurationView(nonBillable), totalVerified: toDurationView(total), billablePercent: total ? Math.round(billable * 100 / total) : 0, reconciliation: { billableMinutes: billable, nonBillableMinutes: nonBillable, sumMinutes: billable + nonBillable, totalVerifiedMinutes: total, differenceMinutes: billable + nonBillable - total, balances: billable + nonBillable === total }, lines: h.rows.map(r => ({ key: r.key, label: r.projectLabel, division: r.division, isBillable: r.isBillable, nonBillableReason: r.isBillable ? null : 'No effective billable classification', active: r.active, sharePercent: total ? Math.round(r.active.minutes * 100 / total) : 0, cost: r.cost })), billableCost: moneyView(h.hasFinancialPermission ? costOfRatedMinutes(billRated) : undefined), nonBillableCost: moneyView(h.hasFinancialPermission ? costOfRatedMinutes(nonRated) : undefined), totalCost: h.totals.cost });
    }
    async getPayrollSummary(userId: string, periodId?: string): Promise<Result<PayrollSummaryView>> {
        const p = await this.period(userId, periodId);
        if (p.status !== 'success')
            return p;
        const r = await this.app.run('payroll-hours', this.query(p.data), true);
        if (r.status !== 'success')
            return r;
        const actor = (await this.app.actor())!, allowed = r.data.cost !== undefined, rows: PayrollSummaryView['rows'][number][] = [];
        const gathered = await this.app.collect(this.app.requests.repository, r.data.query);
        if (gathered.status !== 'success')
            return gathered;
        for (const row of r.data.rows) {
            const employee = await this.app.requests.repository.time.employeeRef(row.key);
            if (!employee)
                continue;
            const own = gathered.data.filter(d => d.employeeId === row.key), rate = allowed ? await this.app.rate(this.app.requests.repository, row.key, null, p.data.startDate) : null;
            rows.push({ employee, divisionCodes: [...new Set(own.flatMap(d => d.summary.divisionContributions.map(v => d.context.divisions.find(x => x.id === v.divisionId)?.code ?? v.divisionId)))], active: toDurationView(row.activeMinutes), overtime: toDurationView(own.reduce((n, d) => n + d.overtimeMinutes, 0)), dayCount: own.length, exceptionCount: own.filter(d => d.summary.status !== 'complete' && d.summary.isRequiredWorkingDay).length, hourlyRate: moneyView(rate ?? undefined), cost: moneyView(allowed ? costOfRatedMinutes(row.rated) : undefined) });
        }
        const config = (await this.app.requests.repository.rows('SELECT id FROM payroll_field_config WHERE id=1'))[0];
        const blockers = [...(!p.data.isVerified ? ['HR verification is required.'] : []), ...(!config ? ['Approved payroll fields are required.'] : [])];
        const period = (await this.app.requests.repository.time.periods()).find(v => v.id === p.data.id)!;
        const history = await this.listExports(userId);
        return success({ period: p.data, timesheetStatusLabel: period.status, isVerified: p.data.isVerified, verifiedAtLabel: period.verifiedAt ? formatTimestamp(period.verifiedAt) : null, verifiedByLabel: period.verifiedBy?.displayName ?? null, unverifiedWarning: warning(p.data.isVerified), policyVersion: period.policyVersion, employeeCount: rows.length, totalActive: toDurationView(r.data.activeMinutes), totalOvertime: toDurationView(r.data.overtimeMinutes), totalCost: moneyView(r.data.cost), exceptions: [{ label: 'Exceptions', count: rows.reduce((n, r) => n + r.exceptionCount, 0), tone: 'caution' }], exportBlockers: blockers, canExport: !blockers.length && hasPermission(actor, 'report.export'), canExportProtected: !blockers.length && hasPermission(actor, 'reporting.export.protected') && allowed, rows, exportHistory: history.status === 'success' ? history.data : [], auditTrail: [], hasFinancialPermission: allowed });
    }
    async getDashboard(userId: string, periodId?: string): Promise<Result<FinanceDashboard>> {
        const h = await this.getHours(userId, { periodId });
        if (h.status !== 'success')
            return h;
        const b = await this.getBillableAnalysis(userId, { periodId: h.data.period.id });
        if (b.status !== 'success')
            return b;
        const periods = await this.listPeriods(userId);
        if (periods.status !== 'success')
            return periods;
        const exports = await this.listExports(userId);
        if (exports.status !== 'success')
            return exports;
        const value = h.data.totals.cost.visible ? h.data.totals.cost.display : 'Restricted';
        const divisionHours = [...new Set(h.data.rows.map(r => r.division.id))].map(id => { const rows = h.data.rows.filter(r => r.division.id === id), minutes = rows.reduce((n, r) => n + r.active.minutes, 0); return { division: rows[0].division, active: toDurationView(minutes), sharePercent: h.data.totals.active.minutes ? Math.round(minutes * 100 / h.data.totals.active.minutes) : 0 }; });
        const projectHours = [...new Set(h.data.rows.flatMap(r => r.project ? [r.project.id] : []))].map(id => { const rows = h.data.rows.filter(r => r.project?.id === id), minutes = rows.reduce((n, r) => n + r.active.minutes, 0); return { project: rows[0].project!, division: rows[0].division, active: toDurationView(minutes), sharePercent: h.data.totals.active.minutes ? Math.round(minutes * 100 / h.data.totals.active.minutes) : 0 }; });
        return success({ period: h.data.period, availablePeriods: periods.data, unverifiedWarning: h.data.unverifiedWarning, hasFinancialPermission: h.data.hasFinancialPermission, verifiedEmployeeHours: h.data.totals.active, verifiedOvertimeHours: h.data.totals.overtime, employeeCount: new Set(h.data.rows.map(r => r.employee.id)).size, divisionHours, projectHours, projectLabourCost: { key: 'project-cost', label: 'Labour cost', value, restricted: !h.data.hasFinancialPermission }, divisionLabourCost: { key: 'division-cost', label: 'Division labour cost', value, restricted: !h.data.hasFinancialPermission }, billableHours: { key: 'billable', label: 'Billable hours', value: b.data.billable.display }, nonBillableHours: { key: 'non-billable', label: 'Non-billable hours', value: b.data.nonBillable.display }, payrollSummary: { key: 'payroll', label: 'Payroll hours', value: h.data.totals.active.display }, budgetVariance: { key: 'variance', label: 'Budget variance', value: h.data.hasFinancialPermission ? 'See cost analysis' : 'Restricted', restricted: !h.data.hasFinancialPermission }, recentExports: exports.data.slice(0, 5) });
    }
    async previewReport(userId: string, f: Partial<FinanceReportFilters>): Promise<Result<FinanceReportPreviewView>> { const p = await this.period(userId, f.periodId); if (p.status !== 'success')
        return p; const r = await this.app.run(f.reportKey ?? 'payroll-hours', { ...this.query(p.data, { divisionIds: f.divisionIds }), includeProtectedFields: f.includeProtectedFields ?? false }, true); if (r.status !== 'success')
        return r; const v = preview(r.data); return success({ reportKey: v.reportKey, title: v.title, periodLabel: p.data.label, rangeLabel: p.data.rangeLabel, filterSummary: v.appliedFilters, timezone: v.timezone, generatedAtLabel: v.generatedAtLabel, policyVersion: v.policyVersion, unverifiedWarning: v.unverifiedWarning, restrictionNote: v.restrictionNote, columns: v.columns, rows: v.rows, totals: v.totals, rowCount: v.rowCount, hasFinancialPermission: r.data.cost !== undefined }); }
    async requestExport(userId: string, c: ExportConfiguration) { const p = await this.period(userId, c.periodId); if (p.status !== 'success')
        return p; const r = await this.exports.request({ reportKey: c.reportKey, format: c.format, query: { ...this.query(p.data, { divisionIds: c.divisionIds }), includeProtectedFields: c.includeProtectedFields }, idempotencyKey: randomUUID() }); return r.status === 'success' ? success({ job: jobView(r.data), simulationNote: 'Queued for secure server-side generation.' }) : r; }
    async listExports(userId: string) { if (!await this.identity(userId))
        return denied; const r = await this.exports.list(); return r.status === 'success' ? success(r.data.map(jobView)) : r; }
}

/** All reads composing one Finance view share the period lock and SQL snapshot. */
export function createFinanceViewService(app:ReportApplication,exports:ExportApplication):FinanceService {
 const base=new BackendFinanceService(app,exports);
 return new Proxy(base,{
  get(target,property,receiver){
   const member=Reflect.get(target,property,receiver);if(typeof member!=='function')return member;
   return (...args:unknown[])=>app.requests.run(()=>app.requests.repository.transaction(async repo=>{
    const reports=new ReportApplication(new RequestApplication(repo,app.requests.resolveActor,app.requests.now));
    const service=new BackendFinanceService(reports,new ExportApplication(reports,exports.storage,exports.options));
    return await (Reflect.apply(Reflect.get(service,property),service,args) as Promise<Result<unknown>>);
   }));
  }
 });
}
