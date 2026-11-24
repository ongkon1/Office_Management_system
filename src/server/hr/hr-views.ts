import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { HrService, HrAttendanceView, HrRequestRowView, HrDivisionRequestSummaryView, HrLeaveBalanceView, HolidayView, HrEvaluationPeriodView, HrEvaluationRowView, HrEvaluationDetailView, EvaluationPeriodFormInput, HolidayFormInput } from '@/contracts/hr';
import type { EvaluationRead, AttendanceState, LeaveTypeKey } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import type { EmployeeRef } from '@/contracts/view-models';
import { success } from '@/contracts/results';
import { addDays, formatDate, formatDateRange, formatTimestamp, formatDuration } from '@/lib/format';
import { ATTENDANCE_LABEL, REQUEST_STATE_LABEL, toDurationView } from '@/lib/status';
import { indistinguishableNotFound, hasPermission, isSuperAdministrator } from '@/server/authorization/policy';
import { AuditWriter, MysqlAuditSink } from '@/server/audit/writer';
import { invalid } from '@/server/time/validation';
import { RequestApplication } from './requests';
import { AttendanceApplication } from './attendance';
import { HolidayApplication } from './holidays';
import { EvaluationApplication, AREAS } from './evaluations';
import { BackendLeaveService } from './adapters';
type Phase5Views = Pick<HrService, 'getAttendance' | 'listRequests' | 'listDivisionRequestSummary' | 'listLeaveBalances' | 'getLeaveBalanceFormOptions' | 'addLeaveBalance' | 'decideRequest' | 'listHolidays' | 'saveHoliday' | 'setHolidayActive' | 'listEvaluationPeriods' | 'createEvaluationPeriod' | 'listEvaluations' | 'getEvaluation' | 'sendReminder' | 'publishEvaluation' | 'returnEvaluation'>;
const evaluationLabels = {
    not_started: 'Not started', self_evaluation: 'Self-evaluation', reviewer_scoring: 'Reviewer scoring', hr_review: 'HR review', published: 'Published'
};
const addLeaveBalanceSchema = z.object({
    userId: z.uuid(), employeeId: z.uuid(), leaveType: z.enum(['annual', 'sick', 'casual', 'unpaid', 'earned']),
    year: z.number().int().min(2000).max(2100),
    days: z.number().positive().max(366).refine(value => Number.isInteger(value * 2), 'Use full-day or half-day increments.'),
    reason: z.string().trim().min(3).max(1000),
}).strict();
/** Compatibility view models for the approved HR screens; userId is checked, never trusted as identity. */
export class BackendHrViews implements Phase5Views {
    constructor(readonly requests: RequestApplication, readonly attendance: AttendanceApplication, readonly holidays: HolidayApplication, readonly evaluations: EvaluationApplication) {
    }
    private async allowed(userId: string) {
        const actor = await this.requests.resolveActor(this.requests.today());
        return actor?.userId === userId && this.requests.isHr(actor);
    }
    private async superAdministrator(userId: string) {
        const actor = await this.requests.resolveActor(this.requests.today());
        return actor?.userId === userId && isSuperAdministrator(actor) ? actor : null;
    }
    async getAttendance(userId: string, from: string, to: string): Promise<Result<HrAttendanceView>> {
        return this.requests.run(async () => {
            if (!await this.allowed(userId))
                return indistinguishableNotFound();
            const dates: string[] = [], rows: HrAttendanceView['rows'][number][] = [], counts = new Map<AttendanceState, number>();
            for (const e of await this.requests.repository.employees()) {
                const actor = await this.requests.resolveActor(from);
                if (!actor || !await this.requests.canRead(this.requests.repository, actor, String(e.id), from))
                    continue;
                const days = await this.attendance.range(String(e.id), from, to);
                if (days.status !== 'success')
                    return days;
                const employee = await this.requests.repository.time.employeeRef(String(e.id));
                if (!employee)
                    continue;
                rows.push({ employee, days: days.data.map(d => {
                        counts.set(d.state, (counts.get(d.state) ?? 0) + 1);
                        return {
                            employee, date: d.date, dateLabel: formatDate(d.date), state: d.state, stateLabel: ATTENDANCE_LABEL[d.state], active: toDurationView(d.activeMinutes), requiredActive: toDurationView(d.requiredActiveMinutes), exemptionNote: d.requiredActiveMinutes === 0 ? ATTENDANCE_LABEL[d.state] : null, isMissing: d.requiredActiveMinutes > 0 && d.activeMinutes === 0, href: `/team/timesheets/${d.employeeId}/${d.date}`
                        };
                    }) });
            }
            if (rows.length)
                for (let on = from; on <= to; on = addDays(on, 1))
                    dates.push(on);
            return success({
                rangeLabel: formatDateRange(from, to), dates, rows, stateCounts: [...counts].map(([state, count]) => ({ state, label: ATTENDANCE_LABEL[state], count }))
            });
        });
    }
    async listRequests(userId: string, kind: 'wfh' | 'leave'): Promise<Result<readonly HrRequestRowView[]>> {
        return this.requests.run(async () => {
            if (!await this.allowed(userId))
                return indistinguishableNotFound();
            const result = await this.requests.list(kind);
            if (result.status !== 'success')
                return result;
            const rows: HrRequestRowView[] = [];
            for (const r of result.data) {
                const from = 'wfhDate' in r ? r.wfhDate : r.startDate;
                const actor = await this.requests.resolveActor(from);
                if (!actor || !await this.requests.canRead(this.requests.repository, actor, r.employeeId, from))
                    continue;
                const employee = await this.requests.repository.time.employeeRef(r.employeeId), c = await this.requests.repository.time.context(r.employeeId, from);
                if (!employee || !c)
                    continue;
                const assignment = (await this.requests.repository.assignments(r.employeeId, from)).find(a => a.is_primary);
                const division = c.divisions.find(d => d.id === ('divisionId' in r ? r.divisionId : assignment?.division_id));
                if (!division)
                    continue;
                const requestedDateLabel = 'wfhDate' in r ? formatDate(r.wfhDate) : formatDateRange(r.startDate, r.endDate);
                const approvedDateLabel = 'leaveType' in r && r.approved
                    ? formatDateRange(r.approved.startDate, r.approved.endDate)
                    : null;
                rows.push({
                    id: r.id, kind, employee, division: {
                        id: division.id, name: division.name, code: division.code, isRestricted: division.isRestricted
                    }, dateLabel: requestedDateLabel, requestedDateLabel,
                    requestedStartDate: 'wfhDate' in r ? r.wfhDate : r.startDate,
                    requestedEndDate: 'wfhDate' in r ? r.wfhDate : r.endDate,
                    requestedDays: 'leaveType' in r ? r.totalDays : null,
                    approvedDateLabel, approvedDays: 'leaveType' in r ? r.approved?.totalDays ?? null : null,
                    portion: r.portion, portionLabel: r.portion === 'half_day' ? 'Half day' : 'Full day', leaveType: 'leaveType' in r ? r.leaveType : null, leaveTypeLabel: 'leaveType' in r ? r.leaveType : null, reason: r.reason, plannedWork: 'plannedTasks' in r ? r.plannedTasks : null, completedWorkPreview: kind === 'wfh' ? c.entries.filter(e => e.isActive && e.state !== 'draft' && e.workLocation === 'wfh').map(e => ({ label: e.workDescription, duration: toDurationView(e.activeMinutes), completedWork: e.completedWork })) : [], state: r.state, stateLabel: REQUEST_STATE_LABEL[r.state], decisionLabel: r.decision ? `${REQUEST_STATE_LABEL[r.decision.outcome]} · ${formatTimestamp(r.decision.decidedAt)}` : null, overrideReason: r.decision?.override?.reason ?? null, previousOutcomeLabel: r.decision?.override ? REQUEST_STATE_LABEL[r.decision.override.previousOutcome] : null, conflictNote: null, canOverride: ['approved', 'rejected'].includes(r.state)
                });
            }
            return success(rows);
        });
    }
    async listDivisionRequestSummary(userId: string, kind: 'wfh' | 'leave'): Promise<Result<readonly HrDivisionRequestSummaryView[]>> {
        const result = await this.listRequests(userId, kind);
        if (result.status !== 'success')
            return result;
        const source = await this.requests.list(kind);
        if (source.status !== 'success')
            return source;
        const groups = new Map<string, HrDivisionRequestSummaryView>();
        for (const r of result.data) {
            const g = groups.get(r.division.id) ?? {
                division: r.division, pending: 0, approved: 0, rejected: 0, totalDays: 0
            };
            groups.set(r.division.id, {
                ...g, pending: g.pending + (r.state === 'pending' ? 1 : 0), approved: g.approved + (r.state === 'approved' ? 1 : 0), rejected: g.rejected + (r.state === 'rejected' ? 1 : 0), totalDays: g.totalDays + ((() => {
                    const original = source.data.find(item => item.id === r.id);
                    return original && 'totalDays' in original ? original.totalDays : r.portion === 'half_day' ? 0.5 : 1;
                })())
            });
        }
        return success([...groups.values()]);
    }
    async listLeaveBalances(userId: string, year = Number(this.requests.today().slice(0, 4))): Promise<Result<readonly HrLeaveBalanceView[]>> {
        return this.requests.run(async () => {
            if (!await this.allowed(userId))
                return indistinguishableNotFound();
            if (!Number.isInteger(year) || year < 2000 || year > 2100)
                return invalid('year', 'Choose a valid leave-balance year.');
            const rows: HrLeaveBalanceView[] = [];
            const service = new BackendLeaveService(this.requests);
            for (const employee of await this.requests.repository.employees()) {
                const id = String(employee.id), actor = await this.requests.resolveActor(this.requests.today());
                if (!actor || !await this.requests.canRead(this.requests.repository, actor, id, this.requests.today()))
                    continue;
                const r = await service.listBalances(id, year);
                if (r.status !== 'success')
                    return r;
                const ref = await this.requests.repository.time.employeeRef(id);
                if (ref)
                    rows.push(...r.data.map(b => ({ ...b, employee: ref, typeLabel: b.leaveType })));
            }
            return success(rows);
        });
    }
    async getLeaveBalanceFormOptions(userId: string): ReturnType<HrService['getLeaveBalanceFormOptions']> {
        return this.requests.run(async () => {
            if (!await this.superAdministrator(userId))
                return indistinguishableNotFound();
            const employees: EmployeeRef[] = [];
            for (const row of await this.requests.repository.employees()) {
                const ref = await this.requests.repository.time.employeeRef(String(row.id));
                if (ref)
                    employees.push(ref);
            }
            const leaveTypes = await this.requests.repository.leaveTypes();
            return success({
                employees: employees.sort((a, b) => a.fullName.localeCompare(b.fullName)),
                leaveTypes: leaveTypes.map(row => ({ value: row.type_key as LeaveTypeKey, label: String(row.name) })),
                defaultYear: Number(this.requests.today().slice(0, 4)),
            });
        });
    }
    async addLeaveBalance(input: Parameters<HrService['addLeaveBalance']>[0]): ReturnType<HrService['addLeaveBalance']> {
        const parsed = addLeaveBalanceSchema.safeParse(input);
        if (!parsed.success)
            return invalid(parsed.error.issues[0].path.join('.'), parsed.error.issues[0].message);
        return this.requests.run(() => this.requests.repository.transaction(async tx => {
            const actor = await this.superAdministrator(parsed.data.userId);
            if (!actor)
                return indistinguishableNotFound();
            const employee = await tx.employee(parsed.data.employeeId);
            if (!employee || employee.status !== 'active')
                return indistinguishableNotFound();
            const leaveType = (await tx.leaveTypes()).find(row => row.type_key === parsed.data.leaveType);
            if (!leaveType)
                return invalid('leaveType', 'Choose an active leave type.');
            const existing = (await tx.rows('SELECT * FROM leave_balances WHERE employee_id=? AND leave_type_id=? AND year=? FOR UPDATE', [parsed.data.employeeId, String(leaveType.id), parsed.data.year]))[0];
            const unitMinutes = existing ? Number(existing.unit_minutes) : 420;
            const addedMinutes = parsed.data.days * unitMinutes;
            if (!Number.isSafeInteger(addedMinutes))
                return invalid('days', 'Use a balance that converts to whole minutes.');
            const balanceId = existing ? String(existing.id) : randomUUID();
            const before = existing ? {
                entitledMinutes: Number(existing.entitled_minutes), usedMinutes: Number(existing.used_minutes),
                reservedMinutes: Number(existing.reserved_minutes), version: Number(existing.version),
            } : null;
            if (existing)
                await tx.execute('UPDATE leave_balances SET entitled_minutes=entitled_minutes+?,version=version+1 WHERE id=?', [addedMinutes, balanceId]);
            else
                await tx.execute('INSERT INTO leave_balances(id,employee_id,leave_type_id,year,entitled_minutes,used_minutes,reserved_minutes,unit_minutes) VALUES(?,?,?,?,?,0,0,?)', [balanceId, parsed.data.employeeId, String(leaveType.id), parsed.data.year, addedMinutes, unitMinutes]);
            const current = (await tx.rows('SELECT * FROM leave_balances WHERE id=?', [balanceId]))[0];
            const after = {
                entitledMinutes: Number(current.entitled_minutes), usedMinutes: Number(current.used_minutes),
                reservedMinutes: Number(current.reserved_minutes), version: Number(current.version),
            };
            await new AuditWriter(new MysqlAuditSink(tx.connection ?? tx.pool)).append({
                actorUserId: actor.userId, action: 'leave.balance.added', resourceType: 'leave_balance', resourceId: balanceId,
                scope: { employeeId: parsed.data.employeeId, leaveType: parsed.data.leaveType, year: parsed.data.year },
                reason: parsed.data.reason, correlationId: randomUUID(), before, after,
            });
            const ref = await tx.time.employeeRef(parsed.data.employeeId);
            if (!ref)
                return indistinguishableNotFound();
            return success({
                employee: ref, leaveType: parsed.data.leaveType, typeLabel: String(leaveType.name), year: parsed.data.year,
                entitledDays: after.entitledMinutes / unitMinutes, consumedDays: after.usedMinutes / unitMinutes,
                reservedDays: after.reservedMinutes / unitMinutes,
                remainingDays: (after.entitledMinutes - after.usedMinutes - after.reservedMinutes) / unitMinutes,
            });
        }));
    }
    async decideRequest(input: Parameters<HrService['decideRequest']>[0]): Promise<Result<HrRequestRowView>> {
        if (!await this.allowed(input.userId))
            return indistinguishableNotFound();
        const r = await this.requests.transition(
            input.kind, input.id, input.outcome, input.overrideReason ?? input.comment,
            Boolean(input.overrideReason), undefined,
            input.approvedStartDate && input.approvedEndDate
                ? { startDate: input.approvedStartDate, endDate: input.approvedEndDate }
                : undefined
        );
        if (r.status !== 'success')
            return r;
        const list = await this.listRequests(input.userId, input.kind);
        if (list.status !== 'success')
            return list;
        const item = list.data.find(r => r.id === input.id);
        return item ? success(item) : indistinguishableNotFound();
    }
    async listHolidays(userId: string): Promise<Result<readonly HolidayView[]>> {
        return this.requests.run(async () => {
            if (!await this.allowed(userId))
                return indistinguishableNotFound();
            const result = await this.holidays.list();
            if (result.status !== 'success')
                return result;
            const rows: HolidayView[] = [];
            for (const h of result.data) {
                const on = h.date ?? h.effectiveFrom ?? this.requests.today();
                let affectedEmployeeCount = 0;
                for (const e of await this.requests.repository.employees()) {
                    const actor = await this.requests.resolveActor(on);
                    if (!actor || !await this.requests.canRead(this.requests.repository, actor, String(e.id), on))
                        continue;
                    const assignments = await this.requests.repository.assignments(String(e.id), on);
                    if (!h.divisionId || assignments.some(a => a.division_id === h.divisionId))
                        affectedEmployeeCount++;
                }
                const d = h.divisionId ? (await this.requests.repository.rows('SELECT * FROM divisions WHERE id=?', [h.divisionId]))[0] : null;
                rows.push({
                    id: h.id, name: h.name, scope: h.scope, scopeLabel: h.scope === 'company' ? 'Company-wide' : h.scope === 'weekly' ? 'Weekly holiday' : 'Division', division: d ? {
                        id: String(d.id), name: String(d.name), code: String(d.division_key), isRestricted: Boolean(d.is_government)
                    } : null, dateLabel: h.date ? formatDate(h.date) : null, weekdayLabel: h.weekday ? ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][h.weekday - 1] : null, isActive: h.isActive, affectedEmployeeCount
                });
            }
            return success(rows);
        });
    }
    async saveHoliday(userId: string, input: HolidayFormInput, id?: string) {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const r = await this.holidays.save({ ...input, isActive: true }, id);
        return r.status === 'success' ? this.listHolidays(userId) : r;
    }
    async setHolidayActive(userId: string, id: string, isActive: boolean) {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const result = await this.holidays.list();
        if (result.status !== 'success')
            return result;
        const h = result.data.find(h => h.id === id);
        if (!h)
            return indistinguishableNotFound();
        const r = await this.holidays.save({ ...h, isActive }, id);
        return r.status === 'success' ? this.listHolidays(userId) : r;
    }
    async listEvaluationPeriods(userId: string): Promise<Result<readonly HrEvaluationPeriodView[]>> {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const p = await this.evaluations.periods(), e = await this.evaluations.list();
        if (p.status !== 'success')
            return p;
        if (e.status !== 'success')
            return e;
        return success(p.data.map(p => {
            const rows = e.data.filter(e => e.periodId === p.id);
            const count = (state: EvaluationRead['state']) => rows.filter(e => e.state === state).length;
            return {
                id: p.id, name: p.name, type: p.type, typeLabel: p.type, rangeLabel: formatDateRange(p.startDate, p.endDate), dueDateLabel: formatDate(p.dueDate), weightingVersion: p.weightingVersion, isOpen: p.isOpen, total: rows.length, notStarted: count('not_started'), selfEvaluation: count('self_evaluation'), reviewerScoring: count('reviewer_scoring'), hrReview: count('hr_review'), published: count('published'), progressPercent: rows.length ? Math.round(count('published') * 100 / rows.length) : 0, overdueReviewerCount: p.dueDate < this.requests.today() ? count('reviewer_scoring') : 0, href: `/evaluations?periodId=${p.id}`
            };
        }));
    }
    async createEvaluationPeriod(userId: string, input: EvaluationPeriodFormInput): Promise<Result<HrEvaluationPeriodView>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            if (!await this.allowed(userId))
                return indistinguishableNotFound();
            const requests = new RequestApplication(tx, this.requests.resolveActor, this.requests.now), app = new EvaluationApplication(requests);
            const weights = (await tx.weightings()).filter(w => w.effectiveFrom <= input.startDate).at(-1);
            const period = await app.createPeriod({ ...input, weightingVersion: weights?.version ?? 1, isOpen: true });
            if (period.status !== 'success')
                return period;
            for (const employeeId of input.employeeIds) {
                const r = await app.assign(period.data.id, employeeId, input.reviewerByEmployeeId[employeeId] ?? '');
                if (r.status !== 'success')
                    return r;
            }
            const views = new BackendHrViews(requests, new AttendanceApplication(requests), new HolidayApplication(requests), app);
            const list = await views.listEvaluationPeriods(userId);
            return list.status === 'success' ? success(list.data.find(p => p.id === period.data.id)!) : list;
        }));
    }
    private async evaluationRows(userId: string): Promise<Result<readonly HrEvaluationRowView[]>> {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const list = await this.evaluations.list(), periods = await this.evaluations.periods();
        if (list.status !== 'success')
            return list;
        if (periods.status !== 'success')
            return periods;
        const rows: HrEvaluationRowView[] = [];
        for (const e of list.data) {
            const employee = await this.requests.repository.time.employeeRef(e.employeeId), reviewer = await this.requests.repository.time.employeeRef(e.reviewerEmployeeId), p = periods.data.find(p => p.id === e.periodId);
            if (!employee || !p || e.weightedScore === 'restricted')
                continue;
            const reminder = (await this.requests.repository.rows("SELECT completed_at FROM hr_jobs WHERE resource_id=? AND kind='evaluation.reminder' AND status='complete' ORDER BY completed_at DESC LIMIT 1", [e.id]))[0];
            rows.push({
                id: e.id, employee, reviewer, periodId: p.id, periodLabel: p.name, dueDateLabel: formatDate(p.dueDate), state: e.state, stateLabel: evaluationLabels[e.state], weightedScore: e.weightedScore, isOverdue: p.dueDate < this.requests.today() && e.state !== 'published', reminderSentAtLabel: reminder?.completed_at ? formatTimestamp(reminder.completed_at instanceof Date ? reminder.completed_at.toISOString() : String(reminder.completed_at)) : null, href: `/evaluations/${e.id}`
            });
        }
        return success(rows);
    }
    async listEvaluations(userId: string, periodId?: string) {
        const rows = await this.evaluationRows(userId);
        return rows.status === 'success' ? success(rows.data.filter(e => !periodId || e.periodId === periodId)) : rows;
    }
    async getEvaluation(userId: string, id: string): Promise<Result<HrEvaluationDetailView>> {
        return this.requests.run(async () => {
            const list = await this.evaluationRows(userId);
            if (list.status !== 'success')
                return list;
            const row = list.data.find(r => r.id === id);
            if (!row)
                return indistinguishableNotFound();
            const result = await this.evaluations.get(id);
            if (result.status !== 'success')
                return result;
            const e = result.data;
            if (e.reviewerScores === 'restricted')
                return indistinguishableNotFound();
            const weighting = (await this.requests.repository.weightings()).find(w => w.version === e.weightingVersion);
            if (!weighting)
                return indistinguishableNotFound();
            const actor = await this.requests.resolveActor(this.requests.today());
            const self = e.selfEvaluation;
            const facts = [{ label: 'Required active time', value: formatDuration(e.facts.requiredActiveMinutes) }, { label: 'Actual active time', value: formatDuration(e.facts.actualActiveMinutes) }, { label: 'Break', value: formatDuration(e.facts.breakMinutes) }, { label: 'Overtime', value: formatDuration(e.facts.overtimeMinutes) }, { label: 'Tasks completed', value: String(e.facts.tasksCompleted) }, { label: 'Missing records', value: String(e.facts.missingDayCount) }];
            return success({
                ...row, facts, selfEvaluationState: self === 'restricted' ? 'restricted' : self?.submittedAt ? 'submitted' : 'not_submitted', selfEvaluation: self && self !== 'restricted' ? Object.entries(self).filter(([key]) => key !== 'submittedAt').map(([label, value]) => ({ label, value: String(value) })) : null, weights: weighting.weights, weightingVersion: e.weightingVersion, scores: Object.fromEntries(AREAS.map(area => [area, e.reviewerScores === 'restricted' ? 0 : e.reviewerScores.find(s => s.area === area)?.score ?? 0])) as HrEvaluationDetailView['scores'], comments: Object.fromEntries(AREAS.map(area => [area, e.reviewerScores === 'restricted' ? 'Restricted' : e.reviewerScores.find(s => s.area === area)?.comment ?? ''])) as HrEvaluationDetailView['comments'], reviewerSummary: e.reviewerSummary ?? '', publishedAtLabel: e.publishedAt ? formatTimestamp(e.publishedAt) : null, publishedByLabel: e.publishedBy?.displayName ?? null, publicationHistory: e.publishedAt ? [{ label: 'Published', actorLabel: e.publishedBy?.displayName ?? 'HR', atLabel: formatTimestamp(e.publishedAt) }] : [], canPublish: e.state === 'hr_review' && Boolean(actor && hasPermission(actor, 'evaluation.private.view')), canReturn: e.state === 'hr_review', isReadOnly: e.state === 'published', restrictedNote: self === 'restricted' ? 'Private content is restricted.' : null
            });
        });
    }
    async sendReminder(userId: string, id: string): Promise<Result<HrEvaluationRowView>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const r = await this.getEvaluation(userId, id);
            if (r.status !== 'success')
                return r;
            await tx.job(`manual-reminder:${id}:${this.requests.today()}`, 'evaluation.reminder', this.requests.now(), { id }, r.data.reviewer?.id ?? null, id);
            const list = await this.evaluationRows(userId);
            return list.status === 'success' ? success(list.data.find(e => e.id === id)!) : list;
        }));
    }
    async publishEvaluation(userId: string, id: string) {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const r = await this.evaluations.change(id, 'publish');
        return r.status === 'success' ? this.getEvaluation(userId, id) : r;
    }
    async returnEvaluation(userId: string, id: string, reason: string) {
        if (!await this.allowed(userId))
            return indistinguishableNotFound();
        const r = await this.evaluations.change(id, 'return', reason);
        return r.status === 'success' ? this.getEvaluation(userId, id) : r;
    }
}
