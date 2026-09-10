import type { WfhService, LeaveService, AttendanceService, HolidayService, WorkPolicyService, WorkloadService, EvaluationService } from '@/contracts/services';
import type { WfhRequest, LeaveRequest, Holiday, EvaluationPeriod, SelfEvaluation, EvaluationScore } from '@/contracts/domain';
import type { ListQuery } from '@/contracts/query';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { addDays, daysBetween } from '@/lib/format';
import { paginate } from '@/server/time/adapters';
import { invalid, dateSchema } from '@/server/time/validation';
import { RequestApplication } from './requests';
import { AttendanceApplication } from './attendance';
import { HolidayApplication } from './holidays';
import { EvaluationApplication } from './evaluations';
function filtered<T extends {
    employeeId: string;
    state: string;
    reason?: string;
    divisionId?: string;
    wfhDate?: string;
    startDate?: string;
    endDate?: string;
    createdAt?: string;
}>(rows: readonly T[], query: ListQuery) {
    const result = rows.filter(r => {
        const from = r.wfhDate ?? r.startDate, to = r.wfhDate ?? r.endDate ?? from, range = query.filters?.dateRange;
        return (!query.filters?.employeeIds || query.filters.employeeIds.includes(r.employeeId)) && (!query.filters?.recordStatuses || query.filters.recordStatuses.includes(r.state)) && (!query.filters?.divisionIds || Boolean(r.divisionId && query.filters.divisionIds.includes(r.divisionId))) && (!range || !from || !to || from <= range.to && to >= range.from) && (!query.search?.term || `${r.reason ?? ''} ${r.employeeId} ${r.state}`.toLowerCase().includes(query.search.term.trim().toLowerCase()));
    });
    const direction = query.sort?.direction === 'desc' ? -1 : 1;
    return result.sort((a, b) => direction * ((a.wfhDate ?? a.startDate ?? a.createdAt ?? '').localeCompare(b.wfhDate ?? b.startDate ?? b.createdAt ?? '') || a.employeeId.localeCompare(b.employeeId)));
}
export class BackendWfhService implements WfhService {
    constructor(readonly app: RequestApplication) {
    }
    async list(query: ListQuery) {
        const r = await this.app.list('wfh');
        return r.status === 'success' ? paginate(filtered(r.data as readonly WfhRequest[], query), query) : r;
    }
    getById(id: string) {
        return this.app.get('wfh', id) as Promise<Result<WfhRequest>>;
    }
    create(input: Parameters<WfhService['create']>[0]) {
        return this.app.save('wfh', input) as Promise<Result<WfhRequest>>;
    }
    async update(id: string, input: Partial<WfhRequest>) {
        const before = await this.getById(id);
        if (before.status !== 'success')
            return before;
        return this.app.save('wfh', { ...before.data, ...input }, id, input.version) as Promise<Result<WfhRequest>>;
    }
    submit(id: string) {
        return this.app.transition('wfh', id, 'submit') as Promise<Result<WfhRequest>>;
    }
    cancel(id: string) {
        return this.app.transition('wfh', id, 'cancel') as Promise<Result<WfhRequest>>;
    }
    decide(input: Parameters<WfhService['decide']>[0]) {
        return this.app.transition('wfh', input.id, input.outcome, input.comment) as Promise<Result<WfhRequest>>;
    }
    override(input: Parameters<WfhService['override']>[0]) {
        return this.app.transition('wfh', input.id, input.outcome, input.reason, true) as Promise<Result<WfhRequest>>;
    }
}
export class BackendLeaveService implements LeaveService {
    constructor(readonly app: RequestApplication) {
    }
    async listRequests(query: ListQuery) {
        const r = await this.app.list('leave');
        return r.status === 'success' ? paginate(filtered(r.data as readonly LeaveRequest[], query), query) : r;
    }
    getRequest(id: string) {
        return this.app.get('leave', id) as Promise<Result<LeaveRequest>>;
    }
    listBalances(employeeId: string, year: number) {
        return this.app.run(async () => {
            const actor = await this.app.resolveActor(this.app.today());
            if (!actor || !await this.app.canRead(this.app.repository, actor, employeeId, this.app.today()))
                return {
                    status: 'not_found', code: 'NOT_FOUND', message: 'record was not found.', resource: 'record'
                } as const;
            if (!Number.isInteger(year) || year < 1900 || year > 9999)
                return invalid('year', 'Choose a valid year.');
            return success((await this.app.repository.balances(employeeId, year)).map(b => ({
                employeeId, year, leaveType: b.type_key as LeaveRequest['leaveType'], entitledDays: Number(b.entitled_minutes) / Number(b.unit_minutes), consumedDays: Number(b.used_minutes) / Number(b.unit_minutes), reservedDays: Number(b.reserved_minutes) / Number(b.unit_minutes), remainingDays: (Number(b.entitled_minutes) - Number(b.used_minutes) - Number(b.reserved_minutes)) / Number(b.unit_minutes)
            })));
        });
    }
    create(input: Parameters<LeaveService['create']>[0]) {
        return this.app.save('leave', input) as Promise<Result<LeaveRequest>>;
    }
    async update(id: string, input: Partial<LeaveRequest>) {
        const before = await this.getRequest(id);
        if (before.status !== 'success')
            return before;
        return this.app.save('leave', { ...before.data, ...input }, id, input.version) as Promise<Result<LeaveRequest>>;
    }
    submit(id: string) {
        return this.app.transition('leave', id, 'submit') as Promise<Result<LeaveRequest>>;
    }
    cancel(id: string) {
        return this.app.transition('leave', id, 'cancel') as Promise<Result<LeaveRequest>>;
    }
    decide(input: Parameters<LeaveService['decide']>[0]) {
        return this.app.transition('leave', input.id, input.outcome, input.comment) as Promise<Result<LeaveRequest>>;
    }
    override(input: Parameters<LeaveService['override']>[0]) {
        return this.app.transition('leave', input.id, input.outcome, input.reason, true) as Promise<Result<LeaveRequest>>;
    }
}
export class BackendAttendanceService implements AttendanceService {
    constructor(readonly app: AttendanceApplication) {
    }
    list(query: ListQuery) {
        return this.app.list(query);
    }
    getEmployeeMonth(input: {
        employeeId: string;
        month: string;
    }) {
        if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month))
            return Promise.resolve(invalid('month', 'Choose a valid month.'));
        const end = new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5)), 0)).getUTCDate();
        return this.app.range(input.employeeId, `${input.month}-01`, `${input.month}-${end}`);
    }
}
export class BackendHolidayService implements HolidayService {
    constructor(readonly app: HolidayApplication) {
    }
    async list(query: ListQuery = { pagination: { page: 1, pageSize: 25 } }) {
        const r = await this.app.list();
        return r.status === 'success' ? paginate(r.data, query) : r;
    }
    create(input: Omit<Holiday, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>) {
        return this.app.save(input);
    }
    async update(id: string, input: Partial<Holiday>) {
        const r = await this.app.list();
        if (r.status !== 'success')
            return r;
        const before = r.data.find(h => h.id === id);
        return before ? this.app.save({ ...before, ...input }, id) : {
            status: 'not_found', code: 'NOT_FOUND', message: 'record was not found.', resource: 'record'
        } as const;
    }
    setActive(id: string, isActive: boolean) {
        return this.update(id, { isActive });
    }
}
export class BackendWorkPolicyService implements WorkPolicyService {
    constructor(readonly app: RequestApplication) {
    }
    async list() {
        return this.app.run(async () => {
            const actor = await this.app.resolveActor(this.app.today());
            if (!actor)
                return {
                    status: 'not_found', code: 'NOT_FOUND', message: 'record was not found.', resource: 'record'
                } as const;
            const policies: import('@/contracts/domain').WorkPolicy[] = [];
            for (const e of await this.app.repository.employees()) {
                if (!await this.app.canRead(this.app.repository, actor, String(e.id), this.app.today()))
                    continue;
                const c = await this.app.repository.time.context(String(e.id), this.app.today());
                if (c && !policies.some(p => p.id === c.policy.id))
                    policies.push(c.policy);
            }
            return success(policies);
        });
    }
    getEffective(input: {
        employeeId: string;
        workDate: string;
    }) {
        return this.app.run(async () => {
            const actor = await this.app.resolveActor(input.workDate);
            if (!actor || !await this.app.canRead(this.app.repository, actor, input.employeeId, input.workDate))
                return {
                    status: 'not_found', code: 'NOT_FOUND', message: 'record was not found.', resource: 'record'
                } as const;
            const c = await this.app.repository.time.context(input.employeeId, input.workDate);
            return c ? success(c.policy) : invalid('workDate', 'No effective policy is assigned.');
        });
    }
}
export class BackendWorkloadService implements WorkloadService {
    constructor(readonly app: AttendanceApplication) {
    }
    getEmployeeWeek(input: {
        employeeId: string;
        weekStartDate: string;
    }) {
        return this.app.workload(input.employeeId, input.weekStartDate);
    }
    async listWeeks(query: ListQuery) {
        return this.app.requests.run(async () => {
            const range = query.filters?.dateRange;
            if (!range || !dateSchema.safeParse(range.from).success || !dateSchema.safeParse(range.to).success || range.to < range.from || daysBetween(range.from, range.to) > 366)
                return invalid('dateRange', 'Choose an ordered date range of at most 367 days.');
            const rows = [];
            for (const e of await this.app.requests.repository.employees()) {
                const id = String(e.id);
                if (query.filters?.employeeIds && !query.filters.employeeIds.includes(id))
                    continue;
                const actor = await this.app.requests.resolveActor(range.from);
                if (!actor || !await this.app.requests.canRead(this.app.requests.repository, actor, id, range.from))
                    continue;
                for (let start = range.from; start <= range.to; start = addDays(start, 7)) {
                    const r = await this.app.workload(id, start);
                    if (r.status !== 'success')
                        return r;
                    rows.push(r.data);
                }
            }
            return paginate(rows, query);
        });
    }
}
export class BackendEvaluationService implements EvaluationService {
    constructor(readonly app: EvaluationApplication) {
    }
    async listPeriods(query: ListQuery = { pagination: { page: 1, pageSize: 25 } }) {
        const r = await this.app.periods();
        return r.status === 'success' ? paginate(r.data, query) : r;
    }
    createPeriod(input: Omit<EvaluationPeriod, 'id' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy'>) {
        return this.app.createPeriod(input);
    }
    async listEvaluations(query: ListQuery) {
        const r = await this.app.list();
        return r.status === 'success' ? paginate(filtered(r.data, query), query) : r;
    }
    getById(id: string) {
        return this.app.get(id);
    }
    saveSelfEvaluation(input: {
        id: string;
        selfEvaluation: SelfEvaluation;
        expectedVersion?: number;
    }) {
        return this.app.change(input.id, 'save_self', input.selfEvaluation, input.expectedVersion);
    }
    submitSelfEvaluation(input: {
        id: string;
    }) {
        return this.app.change(input.id, 'submit_self');
    }
    saveReviewerScores(input: {
        id: string;
        scores: readonly EvaluationScore[];
        summary: string | null;
        expectedVersion?: number;
    }) {
        return this.app.change(input.id, 'save_scores', input, input.expectedVersion);
    }
    submitReview(input: {
        id: string;
    }) {
        return this.app.change(input.id, 'submit_review');
    }
    publish(input: {
        id: string;
    }) {
        return this.app.change(input.id, 'publish');
    }
}
