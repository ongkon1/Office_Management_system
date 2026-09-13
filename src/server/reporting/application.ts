import type { DailySummary, Money } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { addDays, formatDate, formatDuration, formatMoney, formatTimestamp } from '@/lib/format';
import { aggregateSummaries, allocateMinutes } from '@/lib/calculation/engine';
import { describeDayStatus, ATTENDANCE_LABEL, REQUEST_STATE_LABEL, REMARK_STATE_LABEL } from '@/lib/status';
import { localParts } from '@/lib/calculation/instants';
import { costOfRatedMinutes, storedMoney, subtractMoney, sumMoney } from '@/lib/money';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import { TimeApplication } from '@/server/time/application';
import { HrRepository, date } from '@/server/hr/repository';
import { RequestApplication } from '@/server/hr/requests';
import { AttendanceApplication } from '@/server/hr/attendance';
import { EvaluationApplication } from '@/server/hr/evaluations';
import { invalid } from '@/server/time/validation';
import type { DayContext } from '@/server/time/ports';
import { REPORTS, canRun, type ReportSpec } from './catalogue';
import { matches, reportQuerySchema, type ReportQuery } from './query';
export const denied = { status: 'permission_denied', code: 'FORBIDDEN', message: 'You cannot perform this operation.' } as const;
export interface ReportDay {
    employeeId: string;
    employee: string;
    date: string;
    summary: DailySummary;
    context: DayContext;
    overtimeMinutes: number;
}
export interface RatedLine {
    hourlyRate: Money;
    minutes: number;
    isBillable?: boolean;
}
export interface ReportRow {
    key: string;
    employee?: string;
    date?: string;
    activeMinutes: number;
    overtimeMinutes?: number;
    cells: Record<string, string>;
    rated: RatedLine[];
}
export interface ReportDataset {
    spec: ReportSpec;
    query: ReportQuery;
    hasProtectedFields?: boolean;
    rows: ReportRow[];
    totalItems: number;
    totals: Record<string, string>;
    activeMinutes: number;
    overtimeMinutes: number;
    breakMinutes: number;
    totalMinutes: number;
    cost?: Money;
    metadata: {
        timezone: string;
        generatedAt: string;
        policyVersions: number[];
        period: {
            from: string;
            to: string;
        };
        includesUnverifiedData: boolean;
        filters: ReportQuery;
    };
}
export class ReportApplication {
    constructor(readonly requests: RequestApplication) { }
    today() { return localParts(this.requests.now(), 'Asia/Dhaka').date; }
    async actor() { return this.requests.resolveActor(this.today()); }
    async catalogue() { const actor = await this.actor(); return actor ? success(REPORTS.filter(s => canRun(actor, s))) : denied; }
    async employeeVisible(repo: HrRepository, actor: ActorPolicyContext, id: string, on: string) {
        if (!(actor.employeeId === id || actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.employeeIds.has(id)))
            return false;
        const assignments = await repo.assignments(id, on);
        return assignments.some(a => (!a.is_government || hasPermission(actor, 'organization.government.view')) && (actor.employeeId === id || actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.divisionIds.has(String(a.division_id))));
    }
    async resolveQuery(raw: unknown, spec: ReportSpec, actor: ActorPolicyContext): Promise<Result<ReportQuery>> {
        const p = reportQuerySchema.safeParse(raw);
        if (!p.success)
            return invalid(p.error.issues[0].path.join('.'), p.error.issues[0].message);
        const q = p.data;
        if (spec.financial && q.verifiedOnly === false && !hasPermission(actor, 'report.finance.unverified'))
            return denied;
        if (spec.financial && q.verifiedOnly === undefined)
            q.verifiedOnly = true;
        if (q.periodId || !q.dateRange) {
            const periods = await this.requests.repository.time.periods();
            const payroll = q.periodId ? (await this.requests.repository.rows('SELECT timesheet_period_id FROM payroll_periods WHERE id=?', [q.periodId]))[0] : null;
            const period = periods.filter(p => q.periodId ? p.id === (payroll ? String(payroll.timesheet_period_id) : q.periodId) : ['verified', 'amended'].includes(p.status)).sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
            if (!period)
                return invalid('periodId', 'Choose an available reporting period or date range.');
            if (q.dateRange && (q.dateRange.from !== period.startDate || q.dateRange.to !== period.endDate))
                return invalid('dateRange', 'Use the selected period dates.');
            q.dateRange = { from: period.startDate, to: period.endDate };
        }
        return success(q);
    }
    /** A bounded employee/date scan. Source reads use the existing period lock and one snapshot transaction. */
    async collect(repo: HrRepository, q: ReportQuery): Promise<Result<ReportDay[]>> {
        const days: ReportDay[] = [];
        const { from, to } = q.dateRange!;
        const employees = await repo.rows('SELECT id,display_name,employment_type,hire_date FROM employees ORDER BY id');
        const time = new TimeApplication(repo.time, this.requests.resolveActor, this.requests.now);
        let examined = 0, sourceBytes = 0;
        for (let on = from; on <= to; on = addDays(on, 1)) {
            const actor = await this.requests.resolveActor(on);
            if (!actor)
                return denied;
            for (const e of employees) {
                const id = String(e.id);
                if (!matches(q.employeeIds, id) || !matches(q.employmentTypes, String(e.employment_type)) || (e.hire_date && date(e.hire_date) > on))
                    continue;
                if (!await this.employeeVisible(repo, actor, id, on))
                    continue;
                const assignments = (await repo.assignments(id, on)).filter(a => !a.is_government || hasPermission(actor, 'organization.government.view'));
                if (q.teamLeadIds && !assignments.some(a => matches(q.teamLeadIds, String(a.lead_employee_id))))
                    continue;
                if (q.divisionIds && !assignments.some(a => matches(q.divisionIds, String(a.division_id))))
                    continue;
                if (++examined > 20000)
                    return invalid('dateRange', 'Limit this report to 20,000 employee days; split larger ranges or employee groups.');
                const rawContext = await repo.time.context(id, on);
                if (!rawContext)
                    return invalid('policy', 'Configure an effective work policy for the selected employees and dates.');
                const visibleEntries = rawContext.entries.filter(e => e.isActive && rawContext.divisions.some(d => d.id === e.divisionId && (!d.isRestricted || hasPermission(actor, 'organization.government.view'))) && (actor.employeeId === id || actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.divisionIds.has(e.divisionId)));
                const allVisible = visibleEntries.length === rawContext.entries.filter(e => e.isActive).length;
                const c = { ...rawContext, entries: visibleEntries, snapshot: allVisible ? rawContext.snapshot : null };
                const locked = Boolean(c.period && ['verified', 'amended'].includes(c.period.status));
                const original = locked && c.snapshot ? c.snapshot : time.summary(id, on, c, visibleEntries.filter(e => e.state !== 'draft'));
                if (q.verifiedOnly && !original.isLocked)
                    continue;
                if (!matches(q.dayStatuses, original.status))
                    continue;
                if (q.overtimeOnly && !['overtime', 'critical'].includes(original.status))
                    continue;
                if (q.wfhOnly !== undefined && (original.attendance === 'wfh') !== q.wfhOnly)
                    continue;
                const entries = c.entries.filter(e => e.isActive && e.state !== 'draft' && matches(q.divisionIds, e.divisionId) && matches(q.projectIds, e.projectId) && matches(q.taskIds, e.taskId) && matches(q.workLocations, e.workLocation) && matches(q.recordStatuses, e.state));
                const filtered = q.divisionIds !== undefined || q.projectIds !== undefined || q.taskIds !== undefined || q.workLocations !== undefined || q.recordStatuses !== undefined;
                if (filtered && !entries.length && (q.projectIds !== undefined || q.taskIds !== undefined || q.workLocations !== undefined || q.recordStatuses !== undefined || c.entries.some(e => e.state !== 'draft')))
                    continue;
                const summary = filtered ? time.summary(id, on, c, entries) : original;
                // Classifications stay attached to the authorized local day; filters select work, not a new attendance policy.
                const selected = { ...summary, status: original.status, attendance: original.attendance, overtimeReason: original.overtimeReason, criticalExplanation: original.criticalExplanation };
                if (q.search && !String(e.display_name).toLowerCase().includes(q.search.toLowerCase()))
                    continue;
                sourceBytes += Buffer.byteLength(JSON.stringify(c));
                if (sourceBytes > 32 * 1024 * 1024)
                    return invalid('dateRange', 'Reduce the date range or employee selection to keep report source data below 32 MiB.');
                days.push({ employeeId: id, employee: String(e.display_name), date: on, summary: selected, context: { ...c, entries }, overtimeMinutes: aggregateSummaries([selected], c.policy.overtimeThresholdMinutes).overtimeMinutes });
            }
        }
        return success(days);
    }
    async rate(repo: HrRepository, employeeId: string, projectId: string | null, on: string): Promise<Money | null> {
        const rows = await repo.rows("SELECT * FROM cost_rates WHERE is_active=TRUE AND rate_unit='hour' AND division_id IS NULL AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) AND ((employee_id=? AND project_id IS NULL) OR (project_id=? AND employee_id IS NULL)) ORDER BY (project_id IS NOT NULL) DESC,effective_from DESC,id", [on, on, employeeId, projectId]);
        return rows[0] ? storedMoney(String(rows[0].rate_amount), String(rows[0].currency)) : null;
    }
    async build(spec: ReportSpec, q: ReportQuery, repo: HrRepository, actor: ActorPolicyContext): Promise<Result<ReportDataset>> {
        const gathered = await this.collect(repo, { ...q, ...(spec.group === 'hr' ? { recordStatuses: undefined } : {}), ...(spec.key === 'overtime-summary' || spec.key === 'finance-overtime' ? { overtimeOnly: true } : {}), ...(spec.key === 'under-time' ? { dayStatuses: ['under_time'] as ReportQuery['dayStatuses'] } : {}), ...(spec.key === 'missing' ? { dayStatuses: ['missing'] as ReportQuery['dayStatuses'] } : {}), ...(spec.key === 'critical' ? { dayStatuses: ['critical'] as ReportQuery['dayStatuses'] } : {}), ...(spec.key === 'wfh-hours' ? { wfhOnly: true } : {}) });
        if (gathered.status !== 'success')
            return gathered;
        const days = gathered.data, groups = new Map<string, ReportRow>(), rated: RatedLine[] = [];
        let payrollFields: string[] | undefined;
        if (spec.key === 'payroll-ready') {
            const config = (await repo.rows('SELECT fields FROM payroll_field_config WHERE id=1'))[0];
            if (!config)
                return invalid('payrollFields', 'Have an authorized Finance owner configure approved payroll fields.');
            payrollFields = typeof config.fields === 'string' ? JSON.parse(config.fields) : config.fields as string[];
        }
        const protectedCost = Boolean(spec.financial && q.includeProtectedFields && hasPermission(actor, 'finance.cost.view') && (!payrollFields || payrollFields.includes('cost')));
        const time = new TimeApplication(repo.time, this.requests.resolveActor, this.requests.now);
        for (const d of days) {
            const pieces: {
                key: string;
                label: string;
                minutes: number;
                projectId: string | null;
            }[] = [];
            const s = d.summary;
            if (spec.group === 'division')
                for (const v of s.divisionContributions)
                    pieces.push({ key: v.divisionId, label: d.context.divisions.find(x => x.id === v.divisionId)?.name ?? v.divisionId, minutes: v.activeMinutes, projectId: null });
            else if (spec.group === 'project') {
                for (const v of s.projectContributions)
                    pieces.push({ key: v.projectId, label: d.context.projects.find(x => x.id === v.projectId)?.name ?? v.projectId, minutes: v.activeMinutes, projectId: v.projectId });
                const rest = s.activeMinutes - s.projectContributions.reduce((n, v) => n + v.activeMinutes, 0);
                if (rest)
                    pieces.push({ key: 'unassigned', label: 'Not recorded', minutes: rest, projectId: null });
            }
            else if (spec.group === 'task') {
                for (const v of s.taskContributions ?? [])
                    pieces.push({ key: v.taskId, label: d.context.tasks.find(x => x.id === v.taskId)?.title ?? v.taskId, minutes: v.activeMinutes, projectId: null });
                const rest = s.activeMinutes - (s.taskContributions ?? []).reduce((n, v) => n + v.activeMinutes, 0);
                if (rest)
                    pieces.push({ key: 'unassigned', label: 'Not recorded', minutes: rest, projectId: null });
            }
            else {
                const weekday = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7;
                const key = spec.group === 'employee' ? d.employeeId : spec.group === 'month' ? d.date.slice(0, 7) : spec.group === 'week' ? addDays(d.date, -weekday) : `${d.date}:${d.employeeId}`;
                pieces.push({ key, label: spec.group === 'employee' ? d.employee : spec.group === 'week' || spec.group === 'month' ? key : `${formatDate(d.date)} · ${d.employee}`, minutes: s.activeMinutes, projectId: null });
            }
            const overtimeShares = allocateMinutes(d.overtimeMinutes, pieces.map(p => p.minutes));
            for (const [pieceIndex, p] of pieces.entries()) {
                const g = groups.get(p.key) ?? { key: p.key, employee: d.employee, date: d.date, activeMinutes: 0, cells: { label: p.label }, rated: [] };
                g.activeMinutes += p.minutes;
                g.overtimeMinutes = (g.overtimeMinutes ?? 0) + overtimeShares[pieceIndex];
                if (spec.group === 'day')
                    Object.assign(g.cells, { employee: d.employee, date: formatDate(d.date), break: formatDuration(s.breakMinutes), total: formatDuration(s.totalMinutes), status: describeDayStatus(s.status).label, attendance: ATTENDANCE_LABEL[s.attendance], overtime: formatDuration(d.overtimeMinutes), reason: s.criticalExplanation ?? s.overtimeReason ?? 'Not recorded' });
                if (protectedCost && spec.key === 'finance-overtime') {
                    const rate = await this.rate(repo, d.employeeId, null, d.date);
                    if (!rate)
                        return invalid('costRate', 'An employee hourly rate is required for overtime valuation.');
                    const line = { hourlyRate: rate, minutes: d.overtimeMinutes };
                    g.rated.push(line);
                    rated.push(line);
                }
                else if (protectedCost && spec.group !== 'hr') {
                    for (const entry of d.context.entries.filter(e => e.state !== 'draft' && (spec.group !== 'project' || (p.key === 'unassigned' ? e.projectId === null : e.projectId === p.key)) && (spec.group !== 'division' || e.divisionId === p.key))) {
                        const minutes = time.summary(d.employeeId, d.date, d.context, [entry]).activeMinutes;
                        const rate = await this.rate(repo, d.employeeId, entry.projectId, d.date);
                        if (!rate)
                            return invalid('costRate', 'Configure an effective hourly rate for every included work record.');
                        if (rate.currency !== 'BDT')
                            return invalid('currency', 'This report requires BDT rates. Currency conversion needs an approved policy.');
                        const classification = spec.key === 'billable-hours' && entry.projectId ? (await repo.rows('SELECT is_billable FROM project_billability WHERE project_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1', [entry.projectId, d.date, d.date]))[0] : null;
                        const line = { hourlyRate: rate, minutes, ...(spec.key === 'billable-hours' ? { isBillable: Boolean(classification?.is_billable) } : {}) };
                        g.rated.push(line);
                        rated.push(line);
                    }
                }
                if (spec.key === 'billable-hours') {
                    const b = p.projectId ? (await repo.rows('SELECT is_billable FROM project_billability WHERE project_id=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1', [p.projectId, d.date, d.date]))[0] : null;
                    const field = b?.is_billable ? 'billableMinutes' : 'nonBillableMinutes';
                    g.cells[field] = String(Number(g.cells[field] ?? 0) + p.minutes);
                }
                groups.set(p.key, g);
            }
        }
        let rows = [...groups.values()];
        for (const r of rows) {
            r.cells.active = formatDuration(r.activeMinutes);
            r.cells.overtime = formatDuration(r.overtimeMinutes ?? 0);
            if (spec.financial)
                r.cells.cost = protectedCost ? formatMoney(costOfRatedMinutes(r.rated)) : 'Restricted';
        }
        if (spec.group === 'hr') {
            const hr = await this.hrRows(spec, q, repo, actor, days);
            if (hr.status !== 'success')
                return hr;
            rows = hr.data;
        }
        if (spec.key === 'budget-actual')
            for (const r of rows) {
                const budgets = await repo.rows('SELECT amount,currency FROM budgets WHERE project_id=? AND period_start=? AND period_end=?', [r.key, q.dateRange!.from, q.dateRange!.to]);
                if (budgets.length) {
                    const budget = sumMoney(budgets.map(b => storedMoney(String(b.amount), String(b.currency))));
                    r.cells.budget = formatMoney(budget);
                    r.cells.variance = formatMoney(subtractMoney(costOfRatedMinutes(r.rated), budget));
                }
                else {
                    r.cells.budget = 'Not recorded';
                    r.cells.variance = 'Not recorded';
                }
            }
        if (spec.key === 'payroll-ready') {
            const fields = payrollFields!;
            rows = rows.map(r => ({ ...r, cells: Object.fromEntries(Object.entries({ employeeId: r.key, employee: r.employee ?? '', active: r.cells.active, overtime: r.cells.overtime, cost: r.cells.cost }).filter(([key]) => fields.includes(key) && (key !== 'cost' || protectedCost))) }));
        }
        rows.sort((a, b) => { const cmp = q.sort === 'activeMinutes' ? a.activeMinutes - b.activeMinutes : String(a[q.sort] ?? a.key).localeCompare(String(b[q.sort] ?? b.key)); return (q.direction === 'desc' ? -cmp : cmp) || a.key.localeCompare(b.key); });
        const activeMinutes = days.reduce((n, d) => n + d.summary.activeMinutes, 0), overtimeMinutes = days.reduce((n, d) => n + d.overtimeMinutes, 0), breakMinutes = days.reduce((n, d) => n + d.summary.breakMinutes, 0), totalMinutes = days.reduce((n, d) => n + d.summary.totalMinutes, 0);
        const cost = protectedCost && spec.group !== 'hr' ? costOfRatedMinutes(rated) : undefined;
        const totals: Record<string, string> = { active: formatDuration(activeMinutes), break: formatDuration(breakMinutes), total: formatDuration(totalMinutes), overtime: formatDuration(overtimeMinutes) };
        if (spec.financial && spec.key !== 'cost-rates' && (spec.key !== 'payroll-ready' || rows.some(r => 'cost' in r.cells)))
            totals.cost = cost ? formatMoney(cost) : 'Restricted';
        return success({ spec, query: q, hasProtectedFields: protectedCost || spec.category === 'evaluation' || spec.category === 'remarks' || days.some(d => d.summary.divisionContributions.some(v => d.context.divisions.find(x => x.id === v.divisionId)?.isRestricted)), rows, totalItems: rows.length, totals, activeMinutes, overtimeMinutes, breakMinutes, totalMinutes, ...(cost ? { cost } : {}), metadata: { timezone: 'Asia/Dhaka', generatedAt: this.requests.now(), policyVersions: [...new Set(days.map(d => d.summary.policyVersion))].sort((a, b) => a - b), period: q.dateRange!, includesUnverifiedData: days.some(d => !d.summary.isLocked), filters: q } });
    }
    async hrRows(spec: ReportSpec, q: ReportQuery, repo: HrRepository, actor: ActorPolicyContext, days: ReportDay[]): Promise<Result<ReportRow[]>> {
        const rows: ReportRow[] = [];
        const { from, to } = q.dateRange!;
        const app = new RequestApplication(repo, this.requests.resolveActor, this.requests.now);
        const push = (key: string, cells: Record<string, string>, activeMinutes = 0) => rows.push({ key, activeMinutes, cells, rated: [] });
        const selected = (id: string) => matches(q.employeeIds, id) && days.some(d => d.employeeId === id);
        if (spec.key === 'cost-rates') {
            for (const r of await repo.rows('SELECT * FROM cost_rates WHERE is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?) ORDER BY id', [to, from])) {
                if (r.employee_id && !selected(String(r.employee_id)))
                    continue;
                if (r.project_id && !days.some(d => d.summary.projectContributions.some(p => p.projectId === r.project_id)))
                    continue;
                if (!r.employee_id && !r.project_id)
                    continue;
                push(String(r.id), { scope: String(r.employee_id ?? r.project_id), rate: formatMoney(storedMoney(String(r.rate_amount), String(r.currency))), unit: String(r.rate_unit), from: formatDate(date(r.effective_from)), to: r.effective_to ? formatDate(date(r.effective_to)) : 'Not recorded' });
            }
        }
        else if (spec.key === 'leave-register' || spec.key === 'wfh-register') {
            const result = await app.list(spec.key === 'leave-register' ? 'leave' : 'wfh');
            if (result.status !== 'success')
                return result;
            for (const r of result.data) {
                const range = app.range({ ...r, attachmentIds: [], version: 1 });
                if (selected(r.employeeId) && range.from <= to && range.to >= from && matches(q.recordStatuses, r.state))
                    push(r.id, { employee: r.employeeId, from: formatDate(range.from), to: formatDate(range.to), state: REQUEST_STATE_LABEL[r.state], portion: r.portion });
            }
        }
        else if (spec.category === 'evaluation') {
            const result = await new EvaluationApplication(app).list();
            if (result.status !== 'success')
                return result;
            const periods = await repo.periods();
            for (const e of result.data) {
                const p = periods.find(p => p.id === e.periodId);
                if (!p || p.startDate > to || p.endDate < from || !selected(e.employeeId) || !matches(q.recordStatuses, e.state) || (spec.key === 'performance-history' && e.state !== 'published'))
                    continue;
                push(e.id, { employee: e.employeeId, period: p.name, state: e.state, score: hasPermission(actor, 'evaluation.private.view') && e.weightedScore !== null ? String(e.weightedScore) : 'Restricted' });
            }
        }
        else if (spec.key === 'remarks-register') {
            const time = new TimeApplication(repo.time, this.requests.resolveActor, this.requests.now);
            for (const id of new Set(days.map(d => d.employeeId))) {
                const result = await time.listRemarks(id);
                if (result.status !== 'success')
                    return result;
                for (const r of result.data) {
                    const on = localParts(r.createdAt, 'Asia/Dhaka').date;
                    if (on >= from && on <= to && matches(q.recordStatuses, r.state))
                        push(r.id, { employee: id, message: r.message, state: REMARK_STATE_LABEL[r.state], created: formatTimestamp(r.createdAt) });
                }
            }
        }
        else if (spec.key === 'headcount') {
            const seen = new Set<string>();
            for (const d of days)
                for (const a of await repo.assignments(d.employeeId, d.date)) {
                    const scopedActor = await this.requests.resolveActor(d.date);
                    if (!scopedActor || a.is_government && !hasPermission(scopedActor, 'organization.government.view') || !matches(q.divisionIds, String(a.division_id)))
                        continue;
                    const key = String(a.id);
                    if (seen.has(key))
                        continue;
                    seen.add(key);
                    push(key, { employee: d.employee, division: String(a.division_id), lead: a.lead_employee_id ? String(a.lead_employee_id) : 'Not recorded', from: formatDate(date(a.effective_from)), to: a.effective_to ? formatDate(date(a.effective_to)) : 'Not recorded' });
                }
        }
        else if (spec.key === 'workload-capacity') {
            const grouped = new Map<string, ReportDay[]>();
            for (const d of days) {
                const week = addDays(d.date, -((new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7)), key = `${d.employeeId}:${week}`;
                grouped.set(key, [...(grouped.get(key) ?? []), d]);
            }
            for (const [key, own] of grouped) {
                const d = own[0], week = key.slice(-10), scopedActor = await this.requests.resolveActor(d.date);
                if (!scopedActor)
                    continue;
                const allocations = (await repo.rows('SELECT a.*,v.is_government FROM workload_allocations a JOIN divisions v ON v.id=a.division_id WHERE a.employee_id=? AND a.week_start_date=?', [d.employeeId, week])).filter(a => (!a.is_government || hasPermission(scopedActor, 'organization.government.view')) && matches(q.divisionIds, String(a.division_id)) && matches(q.projectIds, a.project_id ? String(a.project_id) : null) && (scopedActor.roles.includes('hr_manager') || scopedActor.roles.includes('super_admin') || scopedActor.employeeId === d.employeeId || scopedActor.divisionIds.has(String(a.division_id))));
                const capacity = own.reduce((n, d) => n + d.summary.requiredActiveMinutes, 0), actual = own.reduce((n, d) => n + d.summary.activeMinutes, 0), planned = allocations.reduce((n, a) => n + Number(a.planned_minutes), 0);
                push(key, { employee: d.employee, week: formatDate(week), capacity: formatDuration(capacity), planned: formatDuration(planned), active: formatDuration(actual), remaining: formatDuration(Math.max(0, capacity - planned)) }, actual);
            }
        }
        else
            for (const d of days) {
                const r = await new AttendanceApplication(app).day(d.employeeId, d.date);
                if (r.status !== 'success')
                    return r;
                push(`${d.employeeId}:${d.date}`, { employee: d.employee, date: formatDate(d.date), state: ATTENDANCE_LABEL[r.data.state], active: formatDuration(d.summary.activeMinutes), required: formatDuration(r.data.requiredActiveMinutes) }, d.summary.activeMinutes);
            }
        return success(rows);
    }
    async run(key: string, raw: unknown, all = false): Promise<Result<ReportDataset>> {
        return this.requests.run(async () => {
            const actor = await this.actor(), spec = REPORTS.find(s => s.key === key);
            if (!actor || !spec || !canRun(actor, spec))
                return indistinguishableNotFound();
            const q = await this.resolveQuery(raw, spec, actor);
            if (q.status !== 'success')
                return q;
            return this.requests.repository.transaction(async (repo) => { const result = await this.build(spec, q.data, repo, actor); if (result.status !== 'success')
                return result; return success({ ...result.data, rows: all ? result.data.rows : result.data.rows.slice((q.data.page - 1) * q.data.pageSize, q.data.page * q.data.pageSize) }); });
        });
    }
}
