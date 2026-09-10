import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { RequestWorkflowState, WfhRequest, LeaveRequest } from '@/contracts/domain';
import { calculateDay } from '@/lib/calculation/engine';
import { addDays, daysBetween } from '@/lib/format';
import { localParts } from '@/lib/calculation/instants';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import type { ActorResolver } from '@/server/time/application';
import { conflict, invalid, dateSchema } from '@/server/time/validation';
import { HrRepository, type HrRequest, type RequestKind } from './repository';
type RequestRead = (WfhRequest | LeaveRequest) & { version: number; requestedMinutes?: number };
const discloseRequest = (actor: ActorPolicyContext, request: HrRequest): RequestRead =>
    hasPermission(actor, 'file.protected.view') ? request : { ...request, attachmentIds: 'restricted' };
const denied = { status: 'permission_denied', code: 'FORBIDDEN', message: 'You cannot perform this operation.' } as const;
const unauthenticated = {
    status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session'
} as const;
const common = { portion: z.enum(['full_day', 'half_day']), reason: z.string().trim().min(1).max(10000), attachmentIds: z.array(z.uuid()).max(20) };
const wfhSchema = z.object({
    ...common, wfhDate: dateSchema, divisionId: z.uuid(), plannedTasks: z.string().trim().min(1).max(10000), contactAvailability: z.string().trim().min(1).max(255)
});
const leaveSchema = z.object({
    ...common, leaveType: z.enum(['annual', 'sick', 'casual', 'unpaid']), startDate: dateSchema, endDate: dateSchema
});
export class RequestApplication {
    constructor(readonly repository: HrRepository, readonly resolveActor: ActorResolver, readonly now = () => new Date().toISOString()) {
    }
    today() {
        return localParts(this.now(), 'Asia/Dhaka').date;
    }
    async run<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
        try {
            return await work();
        }
        catch {
            return {
                status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true, reference: randomUUID()
            };
        }
    }
    isHr(actor: ActorPolicyContext) {
        return hasPermission(actor, 'request.override') && !actor.roles.includes('management');
    }
    async canRead(tx: HrRepository, actor: ActorPolicyContext, employeeId: string, on: string, divisionId?: string) {
        const assignments = await tx.assignments(employeeId, on);
        if (divisionId && assignments.some(a => a.division_id === divisionId && a.is_government) && !hasPermission(actor, 'organization.government.view'))
            return false;
        if (!divisionId && assignments.some(a => a.is_government) && !hasPermission(actor, 'organization.government.view'))
            return false;
        return actor.employeeId === employeeId || this.isHr(actor) || (hasPermission(actor, 'request.decide') && assignments.some(a => a.is_primary && a.lead_employee_id === actor.employeeId));
    }
    range(r: HrRequest) {
        return 'wfhDate' in r ? { from: r.wfhDate, to: r.wfhDate } : { from: r.startDate, to: r.endDate };
    }
    async list(kind: RequestKind): Promise<Result<readonly (WfhRequest | LeaveRequest)[]>> {
        return this.run(async () => {
            const actor = await this.resolveActor(this.today());
            if (!actor)
                return unauthenticated;
            const result: (WfhRequest | LeaveRequest)[] = [];
            for (const r of await this.repository.requests(kind)) {
                if (await this.canRead(this.repository, actor, r.employeeId, this.range(r).from, 'divisionId' in r ? r.divisionId : undefined))
                    result.push(discloseRequest(actor, r));
            }
            return success(result);
        });
    }
    async get(kind: RequestKind, id: string): Promise<Result<WfhRequest | LeaveRequest>> {
        const result = await this.list(kind);
        if (result.status !== 'success')
            return result;
        const r = result.data.find(r => r.id === id);
        return r ? success(r) : indistinguishableNotFound();
    }
    async history(kind: RequestKind, id: string) {
        return this.run(async () => {
            const r = await this.get(kind, id);
            if (r.status !== 'success')
                return r;
            const actor = await this.resolveActor(this.today());
            if (!actor || !hasPermission(actor, 'control.audit.view'))
                return denied;
            return success(await this.repository.history(kind, id));
        });
    }
    private async validate(tx: HrRepository, actor: ActorPolicyContext, kind: RequestKind, raw: unknown, before?: HrRequest): Promise<Result<HrRequest>> {
        const parsed = (kind === 'wfh' ? wfhSchema : leaveSchema).safeParse(raw);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return invalid(issue.path.join('.'), issue.message);
        }
        if (!actor.employeeId || actor.roles.includes('management'))
            return denied;
        const data = parsed.data;
        const range = 'wfhDate' in data ? { from: data.wfhDate, to: data.wfhDate } : { from: data.startDate, to: data.endDate };
        if (range.to < range.from || daysBetween(range.from, range.to) > 366)
            return invalid('endDate', 'Choose an ordered range of at most 367 days.');
        if (range.from < this.today())
            return invalid('startDate', 'Choose today or a future request date.');
        if (range.from.slice(0, 4) !== range.to.slice(0, 4))
            return invalid('endDate', 'Split leave across calendar years into separate requests.');
        if (data.portion === 'half_day' && range.from !== range.to)
            return invalid('portion', 'A half-day request must cover one date.');
        for (const id of data.attachmentIds)
            if (!await tx.time.attachmentAllowed(id, actor.employeeId, actor))
                return invalid('attachmentIds', 'Choose an authorized clean attachment owned by you.');
        let minutes = 0, totalDays = 0;
        for (let on = range.from; on <= range.to; on = addDays(on, 1)) {
            const context = await tx.time.context(actor.employeeId, on);
            if (!context)
                return invalid('startDate', 'An effective work policy is required for every requested date.');
            if (context.period && ['verified', 'amended'].includes(context.period.status))
                return conflict('This period is verified and locked.', true);
            if ('divisionId' in data && !context.effectiveDivisionIds.includes(data.divisionId))
                return invalid('divisionId', 'Choose a division assigned on the requested date.');
            if (!await this.canRead(tx, actor, actor.employeeId, on, 'divisionId' in data ? data.divisionId : undefined))
                return indistinguishableNotFound();
            const day = calculateDay({
                employeeId: actor.employeeId, workDate: on, entries: [], policy: context.policy, holidayName: context.holidayName, leave: data.portion === 'half_day' ? { portion: 'half_day', leaveType: 'requested' } : null
            });
            if (day.requiredActiveMinutes) {
                minutes += day.requiredActiveMinutes;
                totalDays += data.portion === 'half_day' ? 0.5 : 1;
            }
        }
        if (!totalDays)
            return invalid('startDate', 'Choose at least one scheduled working day.');
        if ('leaveType' in data) {
            const type = (await tx.leaveTypes()).find(t => t.type_key === data.leaveType);
            if (!type)
                return invalid('leaveType', 'Choose an active leave type.');
            if (data.portion === 'half_day' && !type.allows_half_day)
                return invalid('portion', 'This leave type requires a full day.');
            if (type.requires_attachment && !data.attachmentIds.length)
                return invalid('attachmentIds', 'Attach the required supporting document.');
        }
        const actorRef = { userId: actor.userId, displayName: 'Employee' };
        const base = {
            id: before?.id ?? randomUUID(), employeeId: actor.employeeId, createdAt: before?.createdAt ?? this.now(), updatedAt: this.now(), createdBy: before?.createdBy ?? actorRef, updatedBy: actorRef, state: 'draft' as const, decision: null, version: (before?.version ?? 0) + 1
        };
        return success(('wfhDate' in data ? { ...base, ...data, requestDate: before && 'requestDate' in before ? before.requestDate : this.today() } : {
            ...base, ...data, totalDays, requestedMinutes: minutes
        }) as HrRequest);
    }
    async save(kind: RequestKind, input: unknown, id?: string, expectedVersion?: number): Promise<Result<RequestRead>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            const actor = await this.resolveActor(this.today());
            if (!actor)
                return unauthenticated;
            const before = id ? await tx.request(kind, id) : undefined;
            if (id && (!before || before.employeeId !== actor.employeeId))
                return indistinguishableNotFound();
            if (before && (!['draft', 'information_requested'].includes(before.state) || expectedVersion !== before.version))
                return conflict('Only the current draft can be edited.');
            const r = await this.validate(tx, actor, kind, input, before ?? undefined);
            if (r.status !== 'success')
                return r;
            if (before?.state === 'information_requested' && 'leaveType' in before && before.leaveType !== 'unpaid') {
                const balance = (await tx.balances(before.employeeId, Number(before.startDate.slice(0, 4)))).find(b => b.type_key === before.leaveType);
                if (!balance)
                    return conflict('The leave balance is unavailable.');
                await tx.adjustBalance(String(balance.id), -(before.requestedMinutes ?? 0), 0);
            }
            await tx.saveRequest(kind, r.data, !id);
            await tx.record(actor, kind, r.data.id, before, r.data);
            return success(discloseRequest(actor, r.data));
        }));
    }
    async transition(kind: RequestKind, id: string, action: 'submit' | 'cancel' | 'approved' | 'rejected' | 'information_requested', comment: string | null = null, override = false, expectedVersion?: number): Promise<Result<RequestRead>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            const actor = await this.resolveActor(this.today());
            if (!actor)
                return unauthenticated;
            const before = await tx.request(kind, id);
            if (!before)
                return indistinguishableNotFound();
            const range = this.range(before);
            if (!await this.canRead(tx, actor, before.employeeId, range.from, 'divisionId' in before ? before.divisionId : undefined))
                return indistinguishableNotFound();
            if (expectedVersion !== undefined && expectedVersion !== before.version)
                return conflict();
            const self = actor.employeeId === before.employeeId;
            if (actor.roles.includes('management'))
                return denied;
            if (action === 'submit' || action === 'cancel') {
                if (!self)
                    return denied;
                if (action === 'submit' && !['draft', 'information_requested'].includes(before.state))
                    return conflict('Only a draft or information request can be submitted.');
                if (action === 'cancel' && !['draft', 'pending', 'information_requested', 'approved'].includes(before.state))
                    return conflict('This request can no longer be cancelled.');
                if (range.from < this.today())
                    return conflict('Past requests require HR review.');
            }
            else if (override) {
                if (!this.isHr(actor) || !comment?.trim())
                    return invalid('reason', 'An authorized HR override requires a reason.');
                if (!['approved', 'rejected'].includes(before.state))
                    return conflict('Override an existing approval or rejection.');
            }
            else {
                const assignments = await tx.assignments(before.employeeId, range.from);
                if (self || !hasPermission(actor, 'request.decide') || !assignments.some(a => a.is_primary && a.lead_employee_id === actor.employeeId))
                    return denied;
                if (before.state !== 'pending')
                    return conflict('Only a pending request can be decided.');
                if (action !== 'approved' && !comment?.trim())
                    return invalid('comment', 'Explain the decision or information needed.');
            }
            const nextState: RequestWorkflowState = action === 'submit' ? 'pending' : action === 'cancel' ? 'cancelled' : action;
            if (nextState === 'pending' || nextState === 'approved') {
                for (const k of ['wfh', 'leave'] as const)
                    for (const r of await tx.requests(k)) {
                        const other = this.range(r);
                        if (r.id !== id && r.employeeId === before.employeeId && ['pending', 'approved', 'information_requested'].includes(r.state) && range.from <= other.to && range.to >= other.from)
                            return invalid('startDate', 'Resolve the overlapping WFH or leave request first.');
                    }
            }
            for (let on = range.from; on <= range.to; on = addDays(on, 1)) {
                const c = await tx.time.context(before.employeeId, on);
                if (c?.period && ['verified', 'amended'].includes(c.period.status))
                    return conflict('This period is verified and locked.', true);
                if (['pending', 'approved'].includes(nextState) && (!c || ('divisionId' in before && !c.effectiveDivisionIds.includes(before.divisionId))))
                    return invalid('divisionId', 'The request needs an effective work policy and division assignment.');
                if (nextState === 'approved' && kind === 'leave' && before.portion === 'full_day' && c?.entries.some(e => e.isActive && e.state !== 'draft'))
                    return conflict('Resolve recorded work before approving full-day leave.');
            }
            if (kind === 'leave' && 'leaveType' in before) {
                const balance = (await tx.balances(before.employeeId, Number(range.from.slice(0, 4)))).find(b => b.type_key === before.leaveType);
                const minutes = before.requestedMinutes ?? 0;
                const reserved = (state: RequestWorkflowState) => ['pending', 'information_requested'].includes(state) ? minutes : 0;
                const used = (state: RequestWorkflowState) => state === 'approved' ? minutes : 0;
                const rd = reserved(nextState) - reserved(before.state), ud = used(nextState) - used(before.state);
                if (before.leaveType !== 'unpaid') {
                    if (!balance || Number(balance.used_minutes) + Number(balance.reserved_minutes) + rd + ud > Number(balance.entitled_minutes))
                        return invalid('leaveType', 'This request exceeds the available leave balance.');
                    await tx.adjustBalance(String(balance.id), rd, ud);
                }
            }
            const decision = action === 'submit' || action === 'cancel' ? before.decision : {
                decidedAt: this.now(), decidedBy: { userId: actor.userId, displayName: 'Reviewer' }, outcome: action, comment, override: override ? { reason: comment!, previousOutcome: before.state as 'approved' | 'rejected' } : null
            };
            const next: HrRequest = {
                ...before, state: nextState, decision, version: before.version + 1, updatedAt: this.now(), updatedBy: { userId: actor.userId, displayName: 'Reviewer' }
            };
            await tx.saveRequest(kind, next);
            await tx.record(actor, kind, id, before, next, comment);
            await this.recalculate(tx, before.employeeId, range.from, range.to);
            await tx.job(`${kind}:${id}:${next.version}`, `request.${nextState}`, this.now(), { kind, id, state: nextState }, before.employeeId, id);
            return success(discloseRequest(actor, next));
        }));
    }
    async recalculate(tx: HrRepository, employeeId: string, from: string, to: string) {
        for (let on = from; on <= to; on = addDays(on, 1)) {
            const c = await tx.time.context(employeeId, on);
            if (!c)
                continue;
            if (c.period && ['verified', 'amended'].includes(c.period.status))
                continue;
            const s = calculateDay({
                employeeId, workDate: on, entries: c.entries.filter(e => e.isActive && e.state !== 'draft'), policy: c.policy, leave: c.leave, holidayName: c.holidayName, approvedWfh: c.approvedWfh, breakOverrideMinutes: c.breakOverrideMinutes, overtimeReason: c.entries.find(e => e.overtimeReason)?.overtimeReason, criticalExplanation: c.entries.find(e => e.criticalExplanation)?.criticalExplanation
            });
            await tx.time.saveSummary(s, c.policyId, c);
            await tx.time.enqueue(`${employeeId}:${on}:${randomUUID()}`, 'time.projections.changed', employeeId, on);
        }
    }
}
