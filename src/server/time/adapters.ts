import type { DailySummary, TimeEntry } from '@/contracts/domain';
import type { ListQuery, Paginated } from '@/contracts/query';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { TimesheetService, PeriodService, RemarkService, TimeEntryInput } from '@/contracts/services';
import type { TimesheetDayView, TimesheetDayRowView, PeriodTotalsView } from '@/contracts/view-models';
import { aggregateSummaries, requiresCriticalExplanation, requiresOvertimeReason } from '@/lib/calculation/engine';
import { localParts } from '@/lib/calculation/instants';
import { draftMinutes } from '@/lib/calculation/validation';
import { toClientContributions } from '@/lib/client-time';
import { addDays, formatDate, formatDateWithWeekday, formatMonth, formatTimeRange } from '@/lib/format';
import { toDayStatusView, toDurationView, WORK_LOCATION_LABEL } from '@/lib/status';
import { hasPermission } from '@/server/authorization/policy';
import { TimeApplication } from './application';
import { conflict, dateSchema, invalid } from './validation';
import type { DayContext } from './ports';
export function paginate<T>(items: readonly T[], query: ListQuery): Result<Paginated<T>> {
    const { page, pageSize } = query.pagination;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
        return invalid('pagination', 'Choose a positive page and a page size from 1 to 100.');
    const totalPages = Math.ceil(items.length / pageSize);
    return success({ items: items.slice((page - 1) * pageSize, page * pageSize), pageInfo: { page, pageSize, totalItems: items.length, totalPages, hasPreviousPage: page > 1, hasNextPage: page < totalPages } });
}
function totals(label: string, days: readonly DailySummary[]): PeriodTotalsView { const t = aggregateSummaries(days); return { label, active: toDurationView(t.activeMinutes), break: toDurationView(t.breakMinutes), total: toDurationView(t.totalMinutes), overtime: toDurationView(t.overtimeMinutes), requiredActive: toDurationView(t.requiredActiveMinutes), completeDayCount: t.completeDayCount, underTimeDayCount: t.underTimeDayCount, overtimeDayCount: t.overtimeDayCount, criticalDayCount: t.criticalDayCount, missingDayCount: t.missingDayCount }; }
function row(s: DailySummary, c: DayContext): TimesheetDayRowView { return { date: s.workDate, dateLabel: formatDate(s.workDate), weekdayLabel: formatDateWithWeekday(s.workDate).slice(0, 3), active: toDurationView(s.activeMinutes), break: toDurationView(s.breakMinutes), total: toDurationView(s.totalMinutes), status: toDayStatusView(s.status), attendance: s.attendance, attendanceLabel: s.attendance, divisionCodes: s.divisionContributions.map((d) => c.divisions.find((v) => v.id === d.divisionId)?.code ?? 'Restricted'), clientContributions: toClientContributions(s.activeMinutes, s.projectContributions.map((p) => ({ clientId: c.projects.find((v) => v.id === p.projectId)?.client ?? null, activeMinutes: p.activeMinutes }))), isLocked: s.isLocked, href: `/timesheets/${s.workDate}` }; }
export class BackendTimesheetService implements TimesheetService {
    constructor(readonly application: TimeApplication) { }
    async getDay(input: {
        employeeId: string;
        date: string;
    }): Promise<Result<TimesheetDayView>> {
        const result = await this.application.day(input.employeeId, input.date);
        if (result.status !== 'success')
            return result;
        const { summary: s, context: c, actor } = result.data;
        const canEdit = actor.employeeId === input.employeeId && !actor.roles.includes('management') && !s.isLocked;
        const remarks = await this.application.listRemarks(input.employeeId);
        if (remarks.status !== 'success')
            return remarks;
        const people = new Map<string, NonNullable<Awaited<ReturnType<typeof this.application.repository.employeeRef>>>>();
        for (const id of new Set([input.employeeId, ...remarks.data.map((r) => r.authorEmployeeId)])) {
            const person = await this.application.repository.employeeRef(id);
            if (person)
                people.set(id, person);
        }
        const ref = (id: string) => people.get(id)!;
        return success({ employee: ref(input.employeeId), date: s.workDate, dateLabel: formatDateWithWeekday(s.workDate), summary: { date: s.workDate, dateLabel: formatDateWithWeekday(s.workDate), active: toDurationView(s.activeMinutes), break: toDurationView(s.breakMinutes), total: toDurationView(s.totalMinutes), requiredActive: toDurationView(s.requiredActiveMinutes), remainingActive: toDurationView(s.remainingActiveMinutes), scheduleProgressPercent: s.requiredTotalMinutes ? Math.min(100, Math.round(s.totalMinutes * 100 / s.requiredTotalMinutes)) : s.totalMinutes ? 100 : 0, status: toDayStatusView(s.status), attendance: s.attendance, isLocked: s.isLocked, overtimeReason: s.overtimeReason, criticalExplanation: s.criticalExplanation },
            entries: c.entries.map((e) => { const d = c.divisions.find((d) => d.id === e.divisionId)!; const p = c.projects.find((p) => p.id === e.projectId); const t = c.tasks.find((t) => t.id === e.taskId); return { id: e.id, version: e.version, division: { id: d.id, name: d.name, code: d.code, isRestricted: d.isRestricted }, project: p ? { id: p.id, name: p.name, code: p.code, divisionId: p.divisionId } : null, task: t ? { id: t.id, title: t.title, projectId: t.projectId, status: t.status } : null, timeRangeLabel: e.startTime && e.endTime ? formatTimeRange(e.startTime, e.endTime) : null, duration: toDurationView(e.activeMinutes), workLocation: e.workLocation, workLocationLabel: WORK_LOCATION_LABEL[e.workLocation], workDescription: e.workDescription, completedWork: e.completedWork, attachmentCount: hasPermission(actor, 'file.protected.view') ? e.attachmentIds.length : 'restricted' as const, supportingLink: e.supportingLink, isDraft: e.state === 'draft', canEdit, canDelete: canEdit }; }),
            breakEntry: { duration: toDurationView(s.breakMinutes), isOverridden: c.breakOverrideMinutes !== null, overrideReason: c.breakReason, canOverride: !s.isLocked && hasPermission(actor, 'time.break.override') && !actor.roles.includes('management') },
            divisionContributions: s.divisionContributions.map((item) => { const d = c.divisions.find((d) => d.id === item.divisionId)!; return { division: { id: d.id, name: d.name, code: d.code, isRestricted: d.isRestricted }, active: toDurationView(item.activeMinutes), sharePercent: s.activeMinutes ? Math.round(item.activeMinutes * 100 / s.activeMinutes) : 0 }; }),
            remarks: remarks.data.filter((r) => r.relatedRecord.type === 'timesheet' && r.relatedRecord.workDate === input.date).map((r) => ({ id: r.id, author: ref(r.authorEmployeeId), employee: ref(r.employeeId), message: r.message, createdAtLabel: formatDate(r.createdAt), state: r.state, stateLabel: r.state, isCorrectionRequest: r.isCorrectionRequest, relatedLabel: formatDate(input.date), relatedHref: `/timesheets/${input.date}`, responseCount: r.responses.length, href: `/remarks/${r.id}` })),
            exemption: s.exemption ? { kind: s.exemption, label: s.exemption } : null, canAddEntry: canEdit, lockedReason: s.isLocked ? 'This period has been verified by HR.' : null, policyVersion: s.policyVersion, timezone: s.timezone });
    }
    private async periodRows(employeeId: string, from: string, to: string) { const summaries = await this.application.summaries(employeeId, from, to); if (summaries.status !== 'success')
        return summaries; const rows: TimesheetDayRowView[] = []; for (const s of summaries.data) {
        const day = await this.application.day(employeeId, s.workDate);
        if (day.status !== 'success')
            return day;
        rows.push(row(day.data.summary, day.data.context));
    } return success({ summaries: summaries.data, rows }); }
    async getWeek(input: {
        employeeId: string;
        weekStartDate: string;
    }) { if (!dateSchema.safeParse(input.weekStartDate).success)
        return invalid('weekStartDate', 'Choose a valid week start date.'); const r = await this.periodRows(input.employeeId, input.weekStartDate, addDays(input.weekStartDate, 6)); return r.status === 'success' ? success({ weekStartDate: input.weekStartDate, label: formatDate(input.weekStartDate), days: r.data.rows, totals: totals(formatDate(input.weekStartDate), r.data.summaries) }) : r; }
    async getMonth(input: {
        employeeId: string;
        month: string;
    }) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))
        return invalid('month', 'Choose a valid month.'); const from = `${input.month}-01`; const to = addDays(`${input.month}-28`, new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0)).getUTCDate() - 28); const r = await this.periodRows(input.employeeId, from, to); return r.status === 'success' ? success({ month: input.month, label: formatMonth(input.month), days: r.data.rows, totals: totals(formatMonth(input.month), r.data.summaries), isVerified: r.data.summaries.length > 0 && r.data.summaries.every((s) => s.isLocked) }) : r; }
    async listEntries(query: ListQuery): Promise<Result<Paginated<TimeEntry>>> {
        const range = query.filters?.dateRange;
        if (!range)
            return invalid('dateRange', 'Select a date range.');
        const actor = await this.application.resolveActor(range.from);
        if (!actor)
            return { status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' };
        const employees = query.filters?.employeeIds ?? (actor.employeeId ? [actor.employeeId] : []);
        const entries: TimeEntry[] = [];
        for (const employeeId of employees) {
            const summaries = await this.application.summaries(employeeId, range.from, range.to);
            if (summaries.status !== 'success')
                return summaries;
            for (const s of summaries.data) {
                const r = await this.application.day(employeeId, s.workDate);
                if (r.status !== 'success')
                    return r;
                const f = query.filters;
                if (f?.dayStatuses && !f.dayStatuses.includes(s.status) || f?.overtimeOnly && !['overtime', 'critical'].includes(s.status) || f?.verifiedOnly && !s.isLocked)
                    continue;
                entries.push(...r.data.context.entries.filter((e) => (!f?.divisionIds || f.divisionIds.includes(e.divisionId)) && (!f?.projectIds || (e.projectId !== null && f.projectIds.includes(e.projectId))) && (!f?.taskIds || (e.taskId !== null && f.taskIds.includes(e.taskId))) && (!f?.workLocations || f.workLocations.includes(e.workLocation)) && (!f?.recordStatuses || f.recordStatuses.includes(e.state)) && (f?.wfhOnly === undefined || (e.workLocation === 'wfh') === f.wfhOnly) && (!query.search?.term || `${e.workDescription} ${e.completedWork}`.toLowerCase().includes(query.search.term.trim().toLowerCase()))).map((e) => ({ ...e, attachmentIds: hasPermission(r.data.actor, 'file.protected.view') ? e.attachmentIds : 'restricted' as const })));
            }
        }
        const field = query.sort?.field ?? 'workDate';
        if (!['workDate', 'activeMinutes', 'workDescription'].includes(field))
            return invalid('sort', 'Sort by work date, duration or description.');
        entries.sort((a, b) => { const value = field === 'activeMinutes' ? a.activeMinutes - b.activeMinutes : String(a[field as 'workDate' | 'workDescription']).localeCompare(String(b[field as 'workDate' | 'workDescription'])); return (query.sort?.direction === 'desc' ? -value : value) || a.id.localeCompare(b.id); });
        return paginate(entries, query);
    }
    getDailySummaries(input: {
        employeeId: string;
        range: {
            from: string;
            to: string;
        };
    }) { return this.application.summaries(input.employeeId, input.range.from, input.range.to); }
    createEntry(input: TimeEntryInput & {
        idempotencyKey: string;
    }) { return this.application.save(input); }
    updateEntry(id: string, input: TimeEntryInput & {
        expectedVersion?: number;
    }) { return this.application.save(input, id, input.expectedVersion); }
    deleteEntry(id: string, expectedVersion?: number) { return expectedVersion === undefined ? Promise.resolve(conflict('Reload the entry to obtain its version.')) : this.application.remove(id, expectedVersion); }
    copyEntry(input: {
        sourceEntryId: string;
        targetDate: string;
    }) { return this.application.copy(input.sourceEntryId, input.targetDate); }
    async previewCalculation(input: TimeEntryInput) { const result = await this.application.preview(input); if (result.status !== 'success')
        return result; const day = await this.application.day(input.employeeId, input.workDate); if (day.status !== 'success')
        return day; const s = result.data; return success({ entryDuration: toDurationView(draftMinutes(input, day.data.context.policy.businessTimezone)), dayActive: toDurationView(s.activeMinutes), dayBreak: toDurationView(s.breakMinutes), dayTotal: toDurationView(s.totalMinutes), remainingActive: toDurationView(s.remainingActiveMinutes), resultingStatus: toDayStatusView(s.status), requiresOvertimeReason: requiresOvertimeReason(s.totalMinutes, day.data.context.policy), requiresCriticalExplanation: requiresCriticalExplanation(s.totalMinutes, day.data.context.policy) }); }
    setBreakOverride(input: Parameters<TimeApplication['overrideBreak']>[0]) { return this.application.overrideBreak(input); }
    getRunningTimer() { return this.application.runningTimer(); }
    startTimer(input: Parameters<TimeApplication['startTimer']>[0]) { return this.application.startTimer(input); }
    stopTimer(input: Parameters<TimeApplication['stopTimer']>[0]) { return this.application.stopTimer(input); }
    cancelTimer(input: {
        sessionId: string;
    }) { return this.application.cancelTimer(input.sessionId); }
}
export class BackendRemarkService implements RemarkService {
    constructor(private readonly app: TimeApplication) { }
    async list(query: ListQuery) { const ids = query.filters?.employeeIds; if (!ids)
        return invalid('employeeIds', 'Choose the employee whose remarks you want to read.'); const rows = []; for (const id of ids) {
        const r = await this.app.listRemarks(id);
        if (r.status !== 'success')
            return r;
        rows.push(...r.data);
    } return paginate(rows, query); }
    async getById(id: string) { const remark = await this.app.repository.remark(id); if (!remark)
        return { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'record was not found.', resource: 'record' }; const list = await this.app.listRemarks(remark.employeeId); if (list.status !== 'success')
        return list; const visible = list.data.find((r) => r.id === id); return visible ? success(visible) : { status: 'not_found' as const, code: 'NOT_FOUND' as const, message: 'record was not found.', resource: 'record' }; }
    create(input: Parameters<TimeApplication['createRemark']>[0]) { return this.app.createRemark(input); }
    respond(input: {
        remarkId: string;
        message: string;
    }) { return this.app.changeRemark(input.remarkId, input.message); }
    resolve(input: {
        remarkId: string;
    }) { return this.app.changeRemark(input.remarkId, null); }
}
export class BackendPeriodService implements PeriodService {
    constructor(private readonly app: TimeApplication) { }
    async list(query: ListQuery = { pagination: { page: 1, pageSize: 25 } }) { const actor = await this.app.resolveActor(new Date().toISOString().slice(0, 10)); if (!actor || !hasPermission(actor, 'time.period.verify'))
        return { status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message: 'You cannot read periods.' };
        const periods = [];
        for (const period of await this.app.repository.periods()) {
            const inventory = await this.app.periodInventory(period.id);
            if (inventory.status !== 'success') return inventory;
            periods.push({...period, includedEmployeeCount: new Set(inventory.data.days.map(day=>day.employeeId)).size,
                openExceptionCount: inventory.data.days.filter(day=>['missing','under_time'].includes(day.status) || (day.status==='overtime'&&!day.overtimeReason) || (day.status==='critical'&&(!day.overtimeReason||!day.criticalExplanation))).length});
        }
        return paginate(periods, query); }
    async getVerificationSummary(id: string) { const r = await this.app.periodInventory(id); if (r.status !== 'success')
        return r; const p = r.data.period; const actor=await this.app.resolveActor(localParts(this.app.now(),'Asia/Dhaka').date); const employees = new Set(r.data.days.map((d) => d.employeeId)); const incomplete = r.data.days.filter((d) => ['missing', 'under_time'].includes(d.status) || (d.status === 'overtime' && !d.overtimeReason) || (d.status === 'critical' && (!d.overtimeReason || !d.criticalExplanation))); return success({ periodId: p.id, label: p.label, rangeLabel: `${formatDate(p.startDate)} – ${formatDate(p.endDate)}`, status: p.status, statusLabel: p.status, employeeCount: employees.size, completeEmployeeCount: employees.size - new Set(incomplete.map((d) => d.employeeId)).size, openExceptionCount: incomplete.length, unresolvedCorrectionCount: r.data.unresolvedCorrectionCount, policyVersion: p.policyVersion, verifiedAtLabel: p.verifiedAt ? formatDate(p.verifiedAt) : null, verifiedByLabel: p.verifiedBy?.displayName ?? null, canVerify: !incomplete.length && !r.data.unresolvedCorrectionCount && p.status !== 'verified' && p.status !== 'amended', canAmend: Boolean(actor&&hasPermission(actor,'time.period.amend')) && (p.status === 'verified' || p.status === 'amended'), href: `/hr/periods/${id}` }); }
    verify(input: Parameters<TimeApplication['verify']>[0]) { return this.app.verify(input); }
    requestUnlock(input: Parameters<TimeApplication['unlock']>[0]) { return this.app.unlock(input); }
    amend(input: {
        periodId: string;
        recordId: string;
        reason: string;
        changes: Readonly<Record<string, unknown>>;
        idempotencyKey: string;
    }) { const { expectedVersion, ...changes } = input.changes; if (typeof expectedVersion !== 'number')
        return Promise.resolve(conflict('Supply the record version with this amendment.')); return this.app.amend({ ...input, changes, expectedVersion }); }
}
