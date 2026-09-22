import { createHash, randomUUID } from 'node:crypto';
import type { DailySummary, GeneralRemark } from '@/contracts/domain';
import type { Failure, Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { WorkLog, WorkLogInput, WorkLogRevision } from '@/contracts/work-log';
import { calculateDay } from '@/lib/calculation/engine';
import { validateWorkLog } from '@/lib/calculation/validation';
import { localParts } from '@/lib/calculation/instants';
import { addDays, daysBetween } from '@/lib/format';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import type { DayContext, StoredEntry, StoredPeriod, TimeRepository } from './ports';
import { conflict, dateSchema, entryInputSchema, invalid } from './validation';
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
        return calculateDay({ employeeId, workDate: date, entries: entries.filter(isHistorical), workLogs: entries.filter(e => !isHistorical(e)).map(toWorkLog), policy: context.policy, breakOverrideMinutes: context.breakOverrideMinutes,
            leave: context.leave, holidayName: context.holidayName, approvedWfh: context.approvedWfh, isLocked: locked(context),
            overtimeReason: entries.find((e) => e.overtimeReason?.trim())?.overtimeReason,
            criticalExplanation: entries.find((e) => e.criticalExplanation?.trim())?.criticalExplanation });
    }
    private async lockedConflict(actor: ActorPolicyContext, employeeId: string, date: string) {
        // Independent audit write survives rollback of the refused mutation.
        await this.repository.audit({ actorUserId: actor.userId, action: 'time.period.locked_conflict', resourceId: employeeId, employeeId, before: null, after: { workDate: date }, reason: 'Verified period refused an ordinary mutation.', correlationId: randomUUID() });
        return conflict('This period is verified and locked.', true);
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
        if (summary.status === 'overtime') await tx.enqueue(`${employeeId}:${date}`, 'time.overtime', employeeId, date);
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
    private async prepare(tx: TimeRepository, actor: ActorPolicyContext, raw: WorkLogInput, id?: string, amendment = false): Promise<Result<{
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
            return notFound();
        const context = await tx.context(input.employeeId, input.workDate, amendment ? before?.policyId : undefined);
        if (!context)
            return notFound();
        if (!amendment && (locked(context) || before?.state === 'locked'))
            return this.lockedConflict(actor, input.employeeId, input.workDate);
        const division = context.divisions.find((d) => d.id === input.divisionId);
        if (!division || (division.isRestricted && !hasPermission(actor, 'organization.government.view')))
            return notFound();
        if (before && !this.visible(actor, context, before))
            return notFound();
        if (before && isHistorical(before)) return conflict('Historical clock entries are read-only.');
        // A write validates the complete employee-day. Do not disclose hidden
        // contributions through an overtime threshold or overlap response.
        if (context.entries.some((entry)=>entry.isActive && entry.state!=='draft' && !this.visible(actor,context,entry))) return notFound();
        if (!context.effectiveDivisionIds.includes(input.divisionId) || !context.projects.some(p => p.id === input.projectId) || !context.tasks.some(t => t.id === input.taskId)) return notFound();
        const existing = context.entries.filter(e => e.isActive && e.state !== 'draft' && e.id !== id);
        const validation = validateWorkLog(input, { ...context, existingWorkLogs: existing.filter(e => !isHistorical(e)).map(toWorkLog), historicalEntries: existing.filter(isHistorical), availableTaskIds: context.tasks.map(t => t.id), isPeriodLocked: false, excludeWorkLogId: id });
        if (validation.length)
            return { status: 'validation_failure', code: 'VALIDATION_FAILED', message: 'Correct the highlighted fields.', fieldErrors: validation, focusField: validation[0].field };
        for (const attachment of input.attachmentIds)
            if (!(await tx.attachmentAllowed(attachment, input.employeeId, actor)))
                return invalid('attachmentIds', 'Choose an authorized, clean attachment owned by this employee.');
        const now = this.now();
        const entry: StoredEntry = { ...input, idempotencyKey: before?.idempotencyKey ?? input.idempotencyKey, entryMethod: 'manual_duration', id: id ?? randomUUID(), startTime: null, endTime: null, activeMinutes: input.durationMinutes,
            state: amendment ? 'locked' : 'saved', crossMidnightGroupId: null, policyVersion: context.policy.version, policyId: context.policyId, timezone: context.policy.businessTimezone,
            version: (before?.version ?? 0) + 1, isActive: true, createdAt: before?.createdAt ?? now, updatedAt: now, createdBy: before?.createdBy ?? { userId: actor.userId, displayName: 'Employee' }, updatedBy: { userId: actor.userId, displayName: 'Employee' } };
        return success({ entry, context, before });
    }
    async save(input: WorkLogInput, id?: string, expectedVersion?: number, changeReason?: string, legacyDraft?: { id: string; version: number }): Promise<Result<StoredEntry>> {
        return this.run(async () => {
            const parsed = entryInputSchema.safeParse(input);
            if (!parsed.success) { const issue = parsed.error.issues[0]; return invalid(issue.path.join('.'), issue.message); }
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
                    if (id && !changeReason?.trim()) return invalid('changeReason', 'Explain why this work log is being corrected.');
                    await tx.lockTask(input.taskId);
                    if (!id && await tx.keyUsed(input.idempotencyKey)) return conflict('This retry key is already in use.');
                    const draft = legacyDraft ? await tx.entry(legacyDraft.id) : null;
                    if (legacyDraft && (!draft || draft.employeeId !== input.employeeId || draft.workDate !== input.workDate)) return notFound();
                    if (legacyDraft && (!draft?.isActive || draft.state !== 'draft' || draft.version !== legacyDraft.version)) return conflict('This draft has already changed or been converted.');
                    const targetId = id;
                    const result = await this.prepare(tx, actor, input, targetId);
                    if (result.status !== 'success')
                        return result;
                    const { entry, before } = result.data;
                    if (id && (!Number.isInteger(expectedVersion) || before?.version !== expectedVersion))
                        return conflict();
                    if (!(await tx.saveEntry(entry, before?.version)))
                        return conflict();
                    if (draft) {
                        if (!this.visible(actor, result.data.context, draft)) return notFound();
                        if (!(await tx.saveEntry({ ...draft, isActive: false, version: draft.version + 1 }, draft.version))) return conflict();
                        await this.record(tx, actor, 'time.draft.convert', draft.id, draft, { workLogId: entry.id }, entry.employeeId, 'Employee reviewed the preserved draft and saved a duration work log.');
                    }
                    await this.refresh(tx, entry.employeeId, entry.workDate);
                    await this.record(tx, actor, id ? 'time.correct' : 'time.create', entry.id, before, entry, entry.employeeId, changeReason);
                    return success(entry);
                };
                // Recheck current access before replaying a previously successful response.
                const context = await tx.context(input.employeeId, input.workDate);
                const division = context?.divisions.find(d => d.id === input.divisionId);
                if (!context || !division || (division.isRestricted && !hasPermission(actor, 'organization.government.view')) || !context.effectiveDivisionIds.includes(input.divisionId) || !context.projects.some(p => p.id === input.projectId) || !context.tasks.some(t => t.id === input.taskId)) return notFound();
                if (id) { const current = await tx.entry(id); if (!current || !this.visible(actor, context, current)) return notFound(); }
                for (const attachment of input.attachmentIds) if (!await tx.attachmentAllowed(attachment, input.employeeId, actor)) return invalid('attachmentIds', 'Choose an authorized, clean attachment owned by this employee.');
                return this.idempotent(tx, actor, id ? `time.update:${id}` : 'time.create', input.idempotencyKey, { input, expectedVersion, changeReason, legacyDraft }, work);
            });
        });
    }
    async history(id: string): Promise<Result<readonly WorkLogRevision[]>> {
        return this.run(async () => {
            const entry = await this.repository.entry(id);
            if (!entry) return notFound();
            const day = await this.day(entry.employeeId, entry.workDate);
            if (day.status !== 'success') return day;
            if (!day.data.context.entries.some(e => e.id === id) || isHistorical(entry)) return notFound();
            const { actor, context } = day.data;
            if (!hasPermission(actor, 'control.audit.view')) return denied;
            const revisions = await this.repository.revisions(id);
            if (revisions.some(r => !this.visible(actor, context, r.before) || !this.visible(actor, context, r.after))) return notFound();
            if (!hasPermission(actor, 'file.protected.view') && revisions.some(r => r.before.attachmentIds.length || r.after.attachmentIds.length)) return denied;
            return success(revisions.map(r => ({ id: r.id, workLogId: id, version: r.after.version, reason: r.reason, changedAt: r.changedAt, changedBy: r.after.updatedBy, before: toWorkLog(r.before), after: toWorkLog(r.after) })));
        });
    }
    async preview(input: WorkLogInput, excludeWorkLogId?: string): Promise<Result<DailySummary>> {
        return this.run(async () => { const actor = await this.resolveActor(input.workDate); if (!actor)
            return unauthenticated; const result = await this.prepare(this.repository, actor, input, excludeWorkLogId); if (result.status !== 'success')
            return result; const { entry, context } = result.data; return success(this.summary(input.employeeId, input.workDate, context, [...context.entries.filter((e) => e.isActive && e.state !== 'draft' && e.id !== excludeWorkLogId), entry])); });
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
                return this.lockedConflict(actor, entry.employeeId, entry.workDate);
            if (isHistorical(entry)) return conflict('Historical clock entries are read-only.');
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
    async copy(id: string, date: string): Promise<Result<WorkLogInput>> {
        return this.run(async () => { const entry = await this.repository.entry(id); if (!entry)
            return notFound(); const source = await this.day(entry.employeeId, entry.workDate); if (source.status !== 'success')
            return source; if (!source.data.context.entries.some((e) => e.id === id))
            return notFound(); const target = await this.day(entry.employeeId, date); if (target.status !== 'success')
            return target; if (!this.canWrite(target.data.actor, entry.employeeId))
            return notFound(); if (locked(target.data.context))
            return conflict('The target period is locked.', true); const draft = this.draft(entry, date); const checked = await this.prepare(this.repository, target.data.actor, draft); return checked.status === 'success' ? success(draft) : checked; });
    }
    private draft(entry: StoredEntry, date = entry.workDate): WorkLogInput {
        return { employeeId: entry.employeeId, workDate: date, divisionId: entry.divisionId, projectId: entry.projectId ?? '', taskId: entry.taskId ?? '', source: 'manual', idempotencyKey: randomUUID(), workLocation: entry.workLocation, durationMinutes: entry.activeMinutes, workDescription: entry.workDescription, completedWork: entry.completedWork, supportingLink: null, attachmentIds: [], overtimeReason: null, criticalExplanation: null };
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
            return this.lockedConflict(actor, input.employeeId, input.workDate); if (context.entries.some((e) => !this.visible(actor, context, e)))
            return notFound(); const proposed = this.summary(input.employeeId, input.workDate, { ...context, breakOverrideMinutes: input.minutes }); if (proposed.totalMinutes > context.policy.overtimeThresholdMinutes && !proposed.overtimeReason)
            return invalid('reason', 'Record the day’s overtime reason before increasing its break.'); if (proposed.totalMinutes > context.policy.criticalThresholdMinutes && !proposed.criticalExplanation)
            return invalid('reason', 'Record the day’s critical explanation before increasing its break.'); await tx.saveBreak(input.employeeId, input.workDate, input.minutes, input.reason, context.policyId); const result = await this.refresh(tx, input.employeeId, input.workDate); await this.record(tx, actor, 'time.break.override', randomUUID(), context.breakOverrideMinutes, input.minutes, input.employeeId, input.reason); return success(result); }));
    }
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
                        if (isHistorical(entry)) continue;
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
                const allowed = ['divisionId', 'projectId', 'taskId', 'workLocation', 'durationMinutes', 'workDescription', 'completedWork', 'supportingLink', 'attachmentIds', 'overtimeReason', 'criticalExplanation'];
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
            for (const entry of context.entries.filter((e) => e.isActive && e.state === 'locked' && !isHistorical(e)))
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
            return notFound(); await tx.saveRemark(remark, actor.userId); await this.record(tx, actor, 'remark.create', remark.id, null, remark, input.employeeId); await tx.enqueue(remark.id, input.isCorrectionRequest ? 'time.correction.requested' : 'time.remark.created', input.employeeId, date); return success(remark); }));
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

export const isHistorical = (entry: StoredEntry) => entry.source === 'migrated_clock_entry' || Boolean(entry.startTime || entry.endTime);
export function toWorkLog(entry: StoredEntry): WorkLog {
    return { id: entry.id, version: entry.version, employeeId: entry.employeeId, workDate: entry.workDate, divisionId: entry.divisionId, projectId: entry.projectId ?? '', taskId: entry.taskId ?? '', durationMinutes: entry.activeMinutes, workLocation: entry.workLocation, workDescription: entry.workDescription, completedWork: entry.completedWork, supportingLink: entry.supportingLink, attachmentIds: entry.attachmentIds, overtimeReason: entry.overtimeReason, criticalExplanation: entry.criticalExplanation, source: entry.source ?? 'manual', idempotencyKey: entry.idempotencyKey ?? entry.id, state: entry.state, policyVersion: entry.policyVersion, createdAt: entry.createdAt, updatedAt: entry.updatedAt, createdBy: entry.createdBy, updatedBy: entry.updatedBy };
}
