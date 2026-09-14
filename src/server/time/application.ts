import { createHash, randomUUID } from 'node:crypto';
import type { DailySummary, GeneralRemark } from '@/contracts/domain';
import type { Failure, Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { IdempotentInput, StartTimerInput, TimeEntryInput } from '@/contracts/services';
import { calculateDay } from '@/lib/calculation/engine';
import { draftMinutes, validateEntry } from '@/lib/calculation/validation';
import { clockInstant, elapsedMinutes, localParts } from '@/lib/calculation/instants';
import { addDays, daysBetween } from '@/lib/format';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import type { DayContext, StoredEntry, StoredPeriod, StoredTimer, TimeRepository } from './ports';
import { conflict, dateSchema, entryInputSchema, invalid, timerInputSchema } from './validation';
export type ActorResolver = (date: string) => Promise<ActorPolicyContext | null>;
const notFound = () => indistinguishableNotFound('record');
const unauthenticated: Failure = { status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' };
const denied: Failure = { status: 'permission_denied', code: 'FORBIDDEN', message: 'You cannot perform this operation.' };
const locked = (context: DayContext) => context.period?.status === 'verified' || context.period?.status === 'amended';
const fingerprint = (input: unknown) => createHash('sha256').update(JSON.stringify(input, (_key,value) => value && typeof value==='object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b))) : value)).digest('hex');
/** Trusted composition supplies identity; payloads never supply the acting user. */
export class TimeApplication {
    constructor(readonly repository: TimeRepository, readonly resolveActor: ActorResolver, readonly now = () => new Date().toISOString()) { }
    private async run<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
        try {
            return await work();
        }
        catch {
            return { status: 'error', code: 'DEPENDENCY_FAILED', message: 'The operation could not be completed.', retryable: true, reference: randomUUID() };
        }
    }
    private canRead(actor: ActorPolicyContext, employeeId: string) {
        return actor.employeeId === employeeId || ((hasPermission(actor, 'time.team.read') || hasPermission(actor, 'time.verified.read') || hasPermission(actor, 'time.period.verify')) && (actor.employeeIds.has(employeeId) || actor.roles.includes('super_admin') || actor.roles.includes('hr_manager')));
    }
    private canWrite(actor: ActorPolicyContext, employeeId: string) {
        return actor.employeeId === employeeId && !actor.roles.includes('management') && (actor.roles.some((role)=>['employee','team_lead','hr_manager','super_admin'].includes(role)) || hasPermission(actor,'time.self.manage'));
    }
    visible(actor: ActorPolicyContext, context: DayContext, entry: StoredEntry) {
        const division = context.divisions.find((d) => d.id === entry.divisionId);
        return this.canRead(actor, entry.employeeId) && Boolean(division) && (!division!.isRestricted || hasPermission(actor, 'organization.government.view')) &&
            (actor.employeeId === entry.employeeId || actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.divisionIds.has(entry.divisionId));
    }
    summary(employeeId: string, date: string, context: DayContext, entries = context.entries.filter((e) => e.isActive && e.state !== 'draft')): DailySummary {
        return calculateDay({ employeeId, workDate: date, entries, policy: context.policy, breakOverrideMinutes: context.breakOverrideMinutes,
            leave: context.leave, holidayName: context.holidayName, approvedWfh: context.approvedWfh, isLocked: locked(context),
            overtimeReason: entries.find((e) => e.overtimeReason?.trim())?.overtimeReason,
            criticalExplanation: entries.find((e) => e.criticalExplanation?.trim())?.criticalExplanation });
    }
    private async record(tx: TimeRepository, actor: ActorPolicyContext, action: string, id: string, before: unknown, after: unknown, employeeId?: string, reason?: string) {
        await tx.audit({ actorUserId: actor.userId, action, resourceId: id, before, after, employeeId, reason, correlationId: randomUUID() });
    }
    private async refresh(tx: TimeRepository, employeeId: string, date: string, policyId?: string) {
        const context = await tx.context(employeeId, date, policyId);
        if (!context)
            throw new Error('Missing calculation context');
        const summary = this.summary(employeeId, date, context);
        await tx.saveSummary(summary, context.policyId, context);
        await tx.enqueue(`${employeeId}:${date}:${fingerprint(summary)}`, 'time.projections.changed', employeeId, date);
        if (summary.status === 'critical')
            await tx.enqueue(`${employeeId}:${date}`, 'time.critical', employeeId, date);
        return summary;
    }
    private async idempotent<T>(tx: TimeRepository, actor: ActorPolicyContext, operation: string, key: string, input: unknown, work: () => Promise<Result<T>>): Promise<Result<T>> {
        if (!key?.trim() || key.length > 128)
            return invalid('idempotencyKey', 'Supply a retry key of 1–128 characters.');
        const hash = fingerprint(input);
        const replay = await tx.replay(actor.userId, operation, key);
        if (replay)
            return replay.hash === hash ? replay.result as Result<T> : conflict('This retry key was used for different input.');
        const result = await work();
        if (result.status === 'success')
            await tx.remember(actor.userId, operation, key, hash, result);
        return result;
    }
    async day(employeeId: string, date: string): Promise<Result<{
        context: DayContext;
        summary: DailySummary;
        actor: ActorPolicyContext;
    }>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            if (!dateSchema.safeParse(date).success)
                return invalid('date', 'Enter a valid calendar date.');
            const actor = await this.resolveActor(date);
            if (!actor)
                return unauthenticated;
            if (!this.canRead(actor, employeeId))
                return notFound();
            const context = await tx.context(employeeId, date);
            if (!context)
                return notFound();
            const entries = context.entries.filter((e) => e.isActive && this.visible(actor, context, e));
            const allVisible = entries.length === context.entries.filter((e) => e.isActive).length;
            const summary = allVisible && locked(context) && context.snapshot ? context.snapshot : this.summary(employeeId, date, context, entries.filter((e) => e.state !== 'draft'));
            return success({ context: { ...context, entries, snapshot: allVisible ? context.snapshot : null }, summary, actor });
        }));
    }
    async summaries(employeeId: string, from: string, to: string): Promise<Result<readonly DailySummary[]>> {
        if (!dateSchema.safeParse(from).success || !dateSchema.safeParse(to).success || to < from || daysBetween(from, to) > 366)
            return invalid('dateRange', 'Choose an ordered range of at most 367 days.');
        const items: DailySummary[] = [];
        for (let date = from; date <= to; date = addDays(date, 1)) {
            const result = await this.day(employeeId, date);
            if (result.status !== 'success')
                return result;
            items.push(result.data.summary);
        }
        return success(items);
    }
    private async prepare(tx: TimeRepository, actor: ActorPolicyContext, raw: TimeEntryInput, id?: string, amendment = false): Promise<Result<{
        entry: StoredEntry;
        context: DayContext;
        before: StoredEntry | null;
    }>> {
        const parsed = entryInputSchema.safeParse(raw);
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return invalid(issue.path.join('.'), issue.message);
        }
        const input = parsed.data;
        if (!amendment && !this.canWrite(actor, input.employeeId))
            return notFound();
        const before = id ? await tx.entry(id) : null;
        if (id && (!before || before.employeeId !== input.employeeId || !before.isActive))
            return notFound();
        if (before && before.workDate !== input.workDate)
            return invalid('workDate', 'Keep the existing date; copy the entry to record work on another date.');
        const context = await tx.context(input.employeeId, input.workDate, amendment ? before?.policyId : undefined);
        if (!context)
            return notFound();
        if (!amendment && (locked(context) || before?.state === 'locked'))
            return conflict('This period is verified and locked.', true);
        const division = context.divisions.find((d) => d.id === input.divisionId);
        if (!division || (division.isRestricted && !hasPermission(actor, 'organization.government.view')))
            return notFound();
        if (before && !this.visible(actor, context, before))
            return notFound();
        // A write validates the complete employee-day. Do not disclose hidden
        // contributions through an overtime threshold or overlap response.
        if (context.entries.some((entry)=>entry.isActive && entry.state!=='draft' && !this.visible(actor,context,entry))) return notFound();
        if (input.taskId && !input.projectId)
            return invalid('projectId', 'Choose the project that owns this task.');
        const validation = validateEntry({ ...input, id }, { ...context, existingEntries: context.entries.filter((e) => e.isActive && e.state !== 'draft'), isPeriodLocked: false });
        if (validation.length)
            return { status: 'validation_failure', code: 'VALIDATION_FAILED', message: 'Correct the highlighted fields.', fieldErrors: validation.map((error) => error.relatedRecordId && !context.entries.some((e) => e.id === error.relatedRecordId && this.visible(actor, context, e)) ? { ...error, message: 'This entry conflicts with existing work.', relatedRecordId: undefined } : error), focusField: validation[0].field };
        for (const attachment of input.attachmentIds)
            if (!(await tx.attachmentAllowed(attachment, input.employeeId, actor)))
                return invalid('attachmentIds', 'Choose an authorized, clean attachment owned by this employee.');
        let startTime: string | null = null;
        let endTime: string | null = null;
        if (input.entryMethod === 'manual_clock') {
            startTime = clockInstant(input.workDate, input.startTime!, context.policy.businessTimezone);
            endTime = clockInstant(input.workDate, input.endTime!, context.policy.businessTimezone);
            if (!startTime || !endTime)
                return invalid('startTime', 'Choose an unambiguous local time that exists in the work timezone.');
            if (context.entries.some((e) => e.isActive && e.id !== id && e.state !== 'draft' && e.startTime && e.endTime && Date.parse(startTime!) < Date.parse(e.endTime) && Date.parse(e.startTime) < Date.parse(endTime!)))
                return invalid('startTime', 'Adjust the times to avoid overlapping existing work.', 'OVERLAPPING_ENTRY');
        }
        if (before?.state === 'draft' && before.entryMethod === 'timer') {
            if (input.activeMinutes !== before.activeMinutes)
                return invalid('activeMinutes', 'Keep the measured timer duration, or remove this draft and enter corrected work manually.');
            startTime = before.startTime;
            endTime = before.endTime;
        }
        if (startTime && endTime && await tx.overlapsClock(input.employeeId, startTime, endTime, id))
            return invalid('startTime', 'Adjust the times to avoid overlapping existing work.', 'OVERLAPPING_ENTRY');
        const now = this.now();
        const entry: StoredEntry = { ...input, entryMethod:before?.state==='draft'&&before.entryMethod==='timer'?'timer':input.entryMethod, id: id ?? randomUUID(), startTime, endTime, activeMinutes: startTime && endTime ? elapsedMinutes(startTime, endTime) : draftMinutes(input),
            state: amendment ? 'locked' : 'saved', crossMidnightGroupId: null, policyVersion: context.policy.version, policyId: context.policyId, timezone: context.policy.businessTimezone,
            version: (before?.version ?? 0) + 1, isActive: true, createdAt: before?.createdAt ?? now, updatedAt: now, createdBy: before?.createdBy ?? { userId: actor.userId, displayName: 'Employee' }, updatedBy: { userId: actor.userId, displayName: 'Employee' } };
        return success({ entry, context, before });
    }
    async save(input: TimeEntryInput & Partial<IdempotentInput>, id?: string, expectedVersion?: number): Promise<Result<StoredEntry>> {
        return this.run(async () => {
            const actor = await this.resolveActor(input.workDate);
            if (!actor)
                return unauthenticated;
            if (!this.canWrite(actor, input.employeeId))
                return notFound();
            return this.repository.transaction(async (tx) => {
                await tx.lockPeriods();
                if (!(await tx.lockEmployee(input.employeeId)))
                    return notFound();
                const work = async (): Promise<Result<StoredEntry>> => {
                    const targetId = id ?? input.draftEntryId;
                    const result = await this.prepare(tx, actor, input, targetId);
                    if (result.status !== 'success')
                        return result;
                    const { entry, before } = result.data;
                    if (input.draftEntryId && (!before || before.state !== 'draft' || before.version !== input.draftVersion))
                        return conflict('This timer draft has already changed or been saved.');
                    if (id && (!Number.isInteger(expectedVersion) || before?.version !== expectedVersion))
                        return conflict();
                    if (!(await tx.saveEntry(entry, before?.version)))
                        return conflict();
                    await this.refresh(tx, entry.employeeId, entry.workDate);
                    await this.record(tx, actor, id ? 'time.correct' : 'time.create', entry.id, before, entry, entry.employeeId);
                    return success(entry);
                };
                if (!id) {
                    const context = await tx.context(input.employeeId, input.workDate);
                    const division = context?.divisions.find((d) => d.id === input.divisionId);
                    if (!division || (division.isRestricted && !hasPermission(actor, 'organization.government.view')))
                        return notFound();
                }
                return id ? work() : this.idempotent(tx, actor, 'time.create', input.idempotencyKey ?? '', input, work);
            });
        });
    }
    async preview(input: TimeEntryInput): Promise<Result<DailySummary>> {
        return this.run(async () => { const actor = await this.resolveActor(input.workDate); if (!actor)
            return unauthenticated; const result = await this.prepare(this.repository, actor, input); if (result.status !== 'success')
            return result; const { entry, context } = result.data; return success(this.summary(input.employeeId, input.workDate, context, [...context.entries.filter((e) => e.isActive && e.state !== 'draft'), entry])); });
    }
    async remove(id: string, expectedVersion: number): Promise<Result<void>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            await tx.lockPeriods();
            const initial = await tx.entry(id);
            if (!initial)
                return notFound();
            const actor = await this.resolveActor(initial.workDate);
            if (!actor)
                return unauthenticated;
            if (!this.canWrite(actor, initial.employeeId))
                return notFound();
            await tx.lockEmployee(initial.employeeId);
            const entry = await tx.entry(id);
            if (!entry || !entry.isActive)
                return notFound();
            const context = await tx.context(entry.employeeId, entry.workDate);
            if (!context || !this.visible(actor, context, entry))
                return notFound();
            if (locked(context))
                return conflict('This period is verified and locked.', true);
            if (entry.version !== expectedVersion)
                return conflict();
            const next = { ...entry, isActive: false, version: entry.version + 1, updatedAt: this.now() };
            if (!(await tx.saveEntry(next, entry.version)))
                return conflict();
            await this.refresh(tx, entry.employeeId, entry.workDate);
            await this.record(tx, actor, 'time.delete', id, entry, next, entry.employeeId);
            return success(undefined);
        }));
    }
    async copy(id: string, date: string): Promise<Result<TimeEntryInput>> {
        return this.run(async () => { const entry = await this.repository.entry(id); if (!entry)
            return notFound(); const source = await this.day(entry.employeeId, entry.workDate); if (source.status !== 'success')
            return source; if (!source.data.context.entries.some((e) => e.id === id))
            return notFound(); const target = await this.day(entry.employeeId, date); if (target.status !== 'success')
            return target; if (!this.canWrite(target.data.actor, entry.employeeId))
            return notFound(); if (locked(target.data.context))
            return conflict('The target period is locked.', true); return success(this.draft(entry, date)); });
    }
    private draft(entry: StoredEntry, date = entry.workDate): TimeEntryInput {
        return { employeeId: entry.employeeId, workDate: date, divisionId: entry.divisionId, projectId: entry.projectId, taskId: entry.taskId, entryMethod: 'manual_duration', workLocation: entry.workLocation, startTime: null, endTime: null, activeMinutes: entry.activeMinutes, workDescription: entry.workDescription, completedWork: entry.completedWork, supportingLink: null, attachmentIds: [], overtimeReason: null, criticalExplanation: null };
    }
    async overrideBreak(input: {
        employeeId: string;
        workDate: string;
        minutes: number;
        reason: string;
    }): Promise<Result<DailySummary>> {
        return this.run(() => this.repository.transaction(async (tx) => { const actor = await this.resolveActor(input.workDate); if (!actor)
            return unauthenticated; if (!hasPermission(actor, 'time.break.override') || actor.roles.includes('management'))
            return denied; if (!this.canRead(actor, input.employeeId))
            return notFound(); if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > 1440)
            return invalid('minutes', 'Enter whole minutes from 0 to 1440.'); if (!input.reason.trim())
            return invalid('reason', 'Explain why the recognized break must change.'); await tx.lockPeriods(); await tx.lockEmployee(input.employeeId); const context = await tx.context(input.employeeId, input.workDate); if (!context)
            return notFound(); if (locked(context))
            return conflict('This period is verified and locked.', true); if (context.entries.some((e) => !this.visible(actor, context, e)))
            return notFound(); const proposed = this.summary(input.employeeId, input.workDate, { ...context, breakOverrideMinutes: input.minutes }); if (proposed.totalMinutes > context.policy.overtimeThresholdMinutes && !proposed.overtimeReason)
            return invalid('reason', 'Record the day’s overtime reason before increasing its break.'); if (proposed.totalMinutes > context.policy.criticalThresholdMinutes && !proposed.criticalExplanation)
            return invalid('reason', 'Record the day’s critical explanation before increasing its break.'); await tx.saveBreak(input.employeeId, input.workDate, input.minutes, input.reason, context.policyId); const result = await this.refresh(tx, input.employeeId, input.workDate); await this.record(tx, actor, 'time.break.override', randomUUID(), context.breakOverrideMinutes, input.minutes, input.employeeId, input.reason); return success(result); }));
    }
    private async timerVisible(tx: TimeRepository, actor: ActorPolicyContext, timer: StoredTimer) {
        if (timer.employeeId !== actor.employeeId)
            return false;
        const context = await tx.context(timer.employeeId, localParts(timer.startedAt, timer.timezone).date, timer.policyId);
        const division = context?.divisions.find((d) => d.id === timer.divisionId);
        return Boolean(division) && (!division!.isRestricted || hasPermission(actor, 'organization.government.view'));
    }
    async runningTimer() { return this.run(async () => { const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
        return unauthenticated; if (!actor.employeeId)
        return notFound(); const timer = await this.repository.runningTimer(actor.employeeId); if (timer && !await this.timerVisible(this.repository, actor, timer))
        return notFound(); return success(timer); }); }
    async startTimer(input: StartTimerInput & IdempotentInput) {
        return this.run(() => this.repository.transaction(async (tx) => {
            const startedAt = this.now();
            let date = localParts(startedAt, 'Asia/Dhaka').date;
            let actor = await this.resolveActor(date);
            if (!actor) return unauthenticated;
            if (!actor.employeeId || !this.canWrite(actor, actor.employeeId)) return denied;
            const parsed = timerInputSchema.safeParse(input);
            if (!parsed.success) return invalid('divisionId', 'Choose a valid division, project, task and work location.');
            await tx.lockPeriods();
            await tx.lockEmployee(actor.employeeId);
            let context = await tx.context(actor.employeeId, date);
            if (!context) return notFound();
            const localDate = localParts(startedAt, context.policy.businessTimezone).date;
            if (localDate !== date) {
                date = localDate;
                actor = await this.resolveActor(date);
                if (!actor || !actor.employeeId || !this.canWrite(actor, actor.employeeId)) return denied;
                context = await tx.context(actor.employeeId, date);
                if (!context) return notFound();
            }
            const division = context.divisions.find((d) => d.id === input.divisionId);
            if (!division || (division.isRestricted && !hasPermission(actor,'organization.government.view'))) return notFound();
            const currentActor = actor;
            const employeeId = actor.employeeId!;
            const timerContext = context;
            return this.idempotent(tx, currentActor, 'timer.start', input.idempotencyKey, parsed.data, async () => {
                if (await tx.runningTimer(employeeId)) return conflict('A timer is already running.');
                if (locked(timerContext)) return conflict('This period is verified and locked.', true);
                const draft: TimeEntryInput = {...parsed.data, employeeId, workDate:date, entryMethod:'manual_duration',activeMinutes:1,startTime:null,endTime:null,workDescription:'Timer start',completedWork:'Timer draft',attachmentIds:[],supportingLink:null,overtimeReason:'Timer preview',criticalExplanation:'Timer preview'};
                const valid = await this.prepare(tx,currentActor,draft);
                if (valid.status !== 'success') return valid;
                const timer:StoredTimer = {...parsed.data,id:randomUUID(),employeeId,startedAt,isRunning:true,draftTimeEntryId:null,timezone:timerContext.policy.businessTimezone,policyId:timerContext.policyId,stoppedAt:null,cancelledAt:null,draft:null};
                await tx.saveTimer(timer,currentActor.userId);
                await this.record(tx,currentActor,'timer.start',timer.id,null,timer,employeeId);
                return success(timer);
            });
        }));
    }
    async stopTimer(input: {
        sessionId: string;
        idempotencyKey: string;
    }) {
        return this.run(() => this.repository.transaction(async (tx) => { const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
            return unauthenticated; if (!actor.employeeId || !this.canWrite(actor, actor.employeeId))
            return denied; await tx.lockPeriods(); await tx.lockEmployee(actor.employeeId); const timer = await tx.timer(input.sessionId); if (!timer || !await this.timerVisible(tx, actor, timer))
            return notFound(); return this.idempotent(tx, actor, 'timer.stop', input.idempotencyKey, { sessionId: input.sessionId }, async () => { if (timer.draft)
            return success(timer.draft); if (!timer.isRunning)
            return conflict('This timer is no longer running.'); const stoppedAt = this.now(); const workDate = localParts(timer.startedAt, timer.timezone).date; const context = await tx.context(actor.employeeId!, workDate, timer.policyId); if (!context)
            return notFound(); if (locked(context))
            return conflict('The timer’s work date is locked.', true); const minutes = elapsedMinutes(timer.startedAt, stoppedAt); if (minutes < 1 || minutes > 1440)
            return invalid('activeMinutes', 'A timer must contain 1–1440 whole minutes; cancel it and enter longer work as separate daily records.'); const draftId = randomUUID(); const draft: TimeEntryInput = { draftEntryId: draftId, draftVersion: 1, employeeId: actor.employeeId!, workDate, divisionId: timer.divisionId, projectId: timer.projectId, taskId: timer.taskId, workLocation: timer.workLocation, entryMethod: 'manual_duration', startTime: null, endTime: null, activeMinutes: minutes, workDescription: '', completedWork: '', supportingLink: null, attachmentIds: [], overtimeReason: null, criticalExplanation: null }; const entry: StoredEntry = { ...draft, id: draftId, entryMethod: 'timer', activeMinutes: minutes, startTime: timer.startedAt, endTime: stoppedAt, state: 'draft', crossMidnightGroupId: null, policyId: timer.policyId, policyVersion: context.policy.version, timezone: timer.timezone, version: 1, isActive: true, createdAt: stoppedAt, updatedAt: stoppedAt, createdBy: { userId: actor.userId, displayName: 'Employee' }, updatedBy: { userId: actor.userId, displayName: 'Employee' } }; await tx.saveEntry(entry); await tx.saveTimer({ ...timer, isRunning: false, stoppedAt, draftTimeEntryId: draftId, draft }, actor.userId); await this.record(tx, actor, 'timer.stop', timer.id, timer, { draftTimeEntryId: draftId }, actor.employeeId!); return success(draft); }); }));
    }
    async cancelTimer(id: string): Promise<Result<void>> { return this.run(() => this.repository.transaction(async (tx) => { const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
        return unauthenticated; if (!actor.employeeId || !this.canWrite(actor, actor.employeeId))
        return denied; await tx.lockEmployee(actor.employeeId); const timer = await tx.timer(id); if (!timer || !await this.timerVisible(tx, actor, timer))
        return notFound(); if (!timer.isRunning)
        return conflict('This timer has already stopped.'); await tx.saveTimer({ ...timer, isRunning: false, cancelledAt: this.now() }, actor.userId); await this.record(tx, actor, 'timer.cancel', id, timer, null, actor.employeeId); return success(undefined); })); }
    async periodInventory(id: string): Promise<Result<{
        period: StoredPeriod;
        days: readonly DailySummary[];
        unresolvedCorrectionCount: number;
    }>> {
        return this.run(() => this.repository.transaction(async (tx) => { await tx.lockPeriods(); const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
            return unauthenticated; if (!hasPermission(actor, 'time.period.verify'))
            return denied; const period = (await tx.periods()).find((p) => p.id === id); if (!period)
            return notFound(); return this.inventory(tx, actor, period); }));
    }
    private async inventory(tx: TimeRepository, actor: ActorPolicyContext, period: StoredPeriod): Promise<Result<{
        period: StoredPeriod;
        days: readonly DailySummary[];
        unresolvedCorrectionCount: number;
    }>> {
        if (daysBetween(period.startDate, period.endDate) > 366)
            return invalid('periodId', 'Use a period no longer than 367 days.');
        const days: DailySummary[] = [];
        let unresolvedCorrectionCount = 0;
        for (const employeeId of [...await tx.employeeIds()].sort()) {
            if (!this.canRead(actor, employeeId))
                return denied;
            await tx.lockEmployee(employeeId);
            unresolvedCorrectionCount += (await tx.remarks(employeeId)).filter((r) => r.isCorrectionRequest && r.state !== 'resolved' && r.relatedRecord.type === 'timesheet' && r.relatedRecord.workDate >= period.startDate && r.relatedRecord.workDate <= period.endDate).length;
            for (let date = period.startDate; date <= period.endDate; date = addDays(date, 1)) {
                const context = await tx.context(employeeId, date);
                if (!context)
                    return conflict('Assign an effective work policy to every included employee before verification.');
                if (context.entries.some((entry) => entry.isActive && !this.visible(actor, context, entry)))
                    return denied;
                days.push(locked(context) && context.snapshot ? context.snapshot : this.summary(employeeId, date, context));
            }
        }
        return success({ period, days, unresolvedCorrectionCount });
    }
    async verify(input: {
        periodId: string;
        note: string | null;
        idempotencyKey: string;
    }): Promise<Result<StoredPeriod>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            await tx.lockPeriods();
            const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date);
            if (!actor)
                return unauthenticated;
            if (!hasPermission(actor, 'time.period.verify') || actor.roles.includes('management'))
                return denied;
            return this.idempotent(tx, actor, 'period.verify', input.idempotencyKey, input, async () => {
                const period = (await tx.periods()).find((p) => p.id === input.periodId);
                if (!period)
                    return notFound();
                if (period.status === 'verified' || period.status === 'amended')
                    return conflict('This period is already verified.');
                const inventory = await this.inventory(tx, actor, period);
                if (inventory.status !== 'success')
                    return inventory;
                const exceptions = inventory.data.days.filter((day) => day.status === 'missing' || day.status === 'under_time' || (day.status === 'overtime' && !day.overtimeReason) || (day.status === 'critical' && (!day.overtimeReason || !day.criticalExplanation)));
                if (exceptions.length)
                    return conflict('Resolve incomplete days and missing explanations before verification.');
                for (const employeeId of new Set(inventory.data.days.map((d) => d.employeeId))) {
                    if (await tx.runningTimer(employeeId))
                        return conflict('Stop running timers before verification.');
                    if ((await tx.remarks(employeeId)).some((r) => r.isCorrectionRequest && r.state !== 'resolved' && r.relatedRecord.type === 'timesheet' && r.relatedRecord.workDate >= period.startDate && r.relatedRecord.workDate <= period.endDate))
                        return conflict('Resolve outstanding correction requests before verification.');
                }
                const next: StoredPeriod = { ...period, status: 'verified', verifiedAt: this.now(), verifiedBy: { userId: actor.userId, displayName: 'HR' }, version: period.version + 1, includedEmployeeCount: new Set(inventory.data.days.map((d) => d.employeeId)).size, openExceptionCount: 0 };
                await tx.verification(next, inventory.data.days, actor.userId, input.note);
                for (const day of inventory.data.days) {
                    const context = await tx.context(day.employeeId, day.workDate);
                    if (!context)
                        throw new Error('Missing context');
                    for (const entry of context.entries.filter((e) => e.isActive)) {
                        if (entry.state === 'draft')
                            return conflict('Review and save or remove draft entries before verification.');
                        if (!(await tx.saveEntry({ ...entry, state: 'locked', version: entry.version + 1 }, entry.version)))
                            return conflict();
                    }
                    await tx.saveSummary({ ...day, isLocked: true }, context.policyId, context);
                }
                await tx.savePeriod(next);
                await this.record(tx, actor, 'period.verify', period.id, period, next, undefined, input.note ?? undefined);
                return success(next);
            });
        }));
    }
    async amend(input: {
        periodId: string;
        recordId: string;
        reason: string;
        changes: Readonly<Record<string, unknown>>;
        idempotencyKey: string;
        expectedVersion: number;
    }): Promise<Result<StoredPeriod>> {
        return this.run(() => this.repository.transaction(async (tx) => {
            await tx.lockPeriods();
            const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date);
            if (!actor)
                return unauthenticated;
            if (!hasPermission(actor, 'time.period.amend') || actor.roles.includes('management'))
                return denied;
            if (!input.reason.trim())
                return invalid('reason', 'Explain the amendment.');
            return this.idempotent(tx, actor, 'period.amend', input.idempotencyKey, input, async () => {
                const period = (await tx.periods()).find((p) => p.id === input.periodId);
                const before = await tx.entry(input.recordId);
                if (!period || !before || before.workDate < period.startDate || before.workDate > period.endDate || !this.canRead(actor, before.employeeId))
                    return notFound();
                if (period.status !== 'verified' && period.status !== 'amended')
                    return conflict('Only a verified period can be amended.');
                await tx.lockEmployee(before.employeeId);
                if (before.version !== input.expectedVersion)
                    return conflict();
                const allowed = ['divisionId', 'projectId', 'taskId', 'workLocation', 'startTime', 'endTime', 'entryMethod', 'activeMinutes', 'workDescription', 'completedWork', 'supportingLink', 'attachmentIds', 'overtimeReason', 'criticalExplanation'];
                if (Object.keys(input.changes).some((key) => !allowed.includes(key)))
                    return invalid('changes', 'Change only editable time-entry fields; employee, date and policy are fixed.');
                const candidate = { ...this.draft(before), attachmentIds: before.attachmentIds, supportingLink: before.supportingLink, overtimeReason: before.overtimeReason, criticalExplanation: before.criticalExplanation, ...input.changes };
                const prepared = await this.prepare(tx, actor, candidate, before.id, true);
                if (prepared.status !== 'success')
                    return prepared;
                if (!(await tx.saveEntry(prepared.data.entry, before.version)))
                    return conflict();
                const day = await this.refresh(tx, before.employeeId, before.workDate, before.policyId);
                const next = { ...period, status: 'amended' as const, version: period.version + 1 };
                await tx.savePeriod(next);
                await tx.verification(next, [day], actor.userId, input.reason);
                await this.record(tx, actor, 'period.amend', before.id, before, prepared.data.entry, before.employeeId, input.reason);
                await tx.enqueue(`${period.id}:${next.version}`, 'time.period.amended', before.employeeId, before.workDate);
                return success(next);
            });
        }));
    }
    async unlock(input: {
        periodId: string;
        reason: string;
    }): Promise<Result<void>> {
        return this.run(() => this.repository.transaction(async (tx) => { await tx.lockPeriods(); const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
            return unauthenticated; if (!hasPermission(actor, 'time.period.unlock') || actor.roles.includes('management'))
            return denied; if (!input.reason.trim())
            return invalid('reason', 'Explain why the period must be reopened.'); const period = (await tx.periods()).find((p) => p.id === input.periodId); if (!period)
            return notFound(); const inventory = await this.inventory(tx, actor, period); if (inventory.status !== 'success')
            return inventory; if (period.status !== 'verified' && period.status !== 'amended')
            return conflict('This period is already open.'); const next = { ...period, status: 'open' as const, verifiedAt: null, verifiedBy: null, version: period.version + 1 }; await tx.savePeriod(next); for (const day of inventory.data.days) {
            const context = await tx.context(day.employeeId, day.workDate);
            if (!context)
                continue;
            for (const entry of context.entries.filter((e) => e.isActive && e.state === 'locked'))
                await tx.saveEntry({ ...entry, state: 'saved', version: entry.version + 1 }, entry.version);
            await this.refresh(tx, day.employeeId, day.workDate);
        } await this.record(tx, actor, 'period.unlock', period.id, period, next, undefined, input.reason); return success(undefined); }));
    }
    async listRemarks(employeeId: string): Promise<Result<readonly GeneralRemark[]>> { return this.run(async () => { const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
        return unauthenticated; if (!this.canRead(actor, employeeId))
        return notFound(); const remarks = await this.repository.remarks(employeeId); const visible: GeneralRemark[] = []; for (const remark of remarks)
        if (await this.remarkVisible(actor, remark))
            visible.push(remark); return success(visible); }); }
    private async remarkVisible(actor: ActorPolicyContext, remark: GeneralRemark) {
        if (!this.canRead(actor, remark.employeeId))
            return false;
        if (remark.relatedRecord.type === 'timesheet') {
            const context = await this.repository.context(remark.employeeId, remark.relatedRecord.workDate);
            return Boolean(context) && context!.entries.every((e) => !e.isActive || this.visible(actor, context!, e));
        }
        // Task-linked remarks need explicit task scope; no task metadata is revealed.
        if (remark.relatedRecord.type === 'task')
            return this.repository.taskRemarkAllowed(remark.relatedRecord.taskId, remark.employeeId, actor);
        return true;
    }
    async createRemark(input: {
        employeeId: string;
        message: string;
        relatedRecord: GeneralRemark['relatedRecord'];
        isCorrectionRequest: boolean;
        requestedChanges: string | null;
    }): Promise<Result<GeneralRemark>> {
        return this.run(() => this.repository.transaction(async (tx) => { const date = input.relatedRecord.type === 'timesheet' ? input.relatedRecord.workDate : localParts(this.now(), 'Asia/Dhaka').date; const actor = await this.resolveActor(date); if (!actor)
            return unauthenticated; if (!actor.employeeId || actor.roles.includes('management') || !this.canRead(actor, input.employeeId))
            return denied; if (!input.message.trim() || (input.isCorrectionRequest && !input.requestedChanges?.trim()))
            return invalid('message', 'Provide a remark and describe any requested correction.'); if (input.isCorrectionRequest && !hasPermission(actor, 'time.team.read') && !hasPermission(actor, 'time.period.verify'))
            return denied; await tx.lockEmployee(input.employeeId); const now = this.now(); const remark: GeneralRemark = { ...input, id: randomUUID(), authorEmployeeId: actor.employeeId, state: 'open', responses: [], createdAt: now, updatedAt: now, createdBy: { userId: actor.userId, displayName: 'Employee' }, updatedBy: { userId: actor.userId, displayName: 'Employee' } }; if (!(await this.remarkVisible(actor, remark)))
            return notFound(); await tx.saveRemark(remark, actor.userId); await this.record(tx, actor, 'remark.create', remark.id, null, remark, input.employeeId); await tx.enqueue(remark.id, 'time.remark.created', input.employeeId, date); return success(remark); }));
    }
    async changeRemark(id: string, message: string | null): Promise<Result<GeneralRemark>> {
        return this.run(() => this.repository.transaction(async (tx) => { const actor = await this.resolveActor(localParts(this.now(), 'Asia/Dhaka').date); if (!actor)
            return unauthenticated; const initial = await tx.remark(id); if (!initial || !(await this.remarkVisible(actor, initial)))
            return notFound(); if (!actor.employeeId || actor.roles.includes('management'))
            return denied; await tx.lockEmployee(initial.employeeId); const remark = await tx.remark(id); if (!remark)
            return notFound(); if (remark.state === 'resolved')
            return conflict('This remark is already resolved.'); if (message === null && actor.employeeId !== remark.authorEmployeeId && !hasPermission(actor, 'time.period.verify'))
            return denied; if (message !== null && !message.trim())
            return invalid('message', 'Enter a clarification.'); const next: GeneralRemark = { ...remark, state: message === null ? 'resolved' : 'responded', updatedAt: this.now(), responses: message === null ? remark.responses : [...remark.responses, { id: randomUUID(), remarkId: id, authorEmployeeId: actor.employeeId, message, createdAt: this.now() }] }; await tx.saveRemark(next, actor.userId); await this.record(tx, actor, message === null ? 'remark.resolve' : 'remark.respond', id, remark, next, remark.employeeId); await tx.enqueue(`${id}:${next.responses.length}:${next.state}`, 'time.remark.changed', remark.employeeId, localParts(this.now(), 'Asia/Dhaka').date); return success(next); }));
    }
}
