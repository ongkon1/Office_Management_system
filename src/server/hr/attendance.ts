import { randomUUID } from 'node:crypto';
import type { AttendanceDay, AttendanceState, WorkloadWeek } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { ListQuery } from '@/contracts/query';
import { addDays, daysBetween } from '@/lib/format';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { TimeApplication } from '@/server/time/application';
import { paginate } from '@/server/time/adapters';
import { invalid, dateSchema, conflict } from '@/server/time/validation';
import { RequestApplication } from './requests';
import { date, HrRepository } from './repository';
export class AttendanceApplication {
    constructor(readonly requests: RequestApplication) {
    }
    async day(employeeId: string, on: string): Promise<Result<AttendanceDay>> {
        return this.requests.run(async () => {
            const actor = await this.requests.resolveActor(on);
            if (!actor)
                return {
                    status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session'
                };
            if (!await this.requests.canRead(this.requests.repository, actor, employeeId, on))
                return indistinguishableNotFound();
            const time = new TimeApplication(this.requests.repository.time, this.requests.resolveActor, this.requests.now);
            const r = await time.day(employeeId, on);
            if (r.status !== 'success')
                return r;
            const { summary: s, context: c } = r.data;
            const validEntries = c.entries.filter(e => e.isActive && e.state !== 'draft');
            const duty = (await this.requests.repository.rows('SELECT duty FROM attendance_duties WHERE employee_id=? AND work_date=?', [employeeId, on]))[0];
            let state: AttendanceState = s.attendance;
            if (!['approved_leave', 'half_day_leave', 'holiday', 'weekly_off'].includes(state)) {
                if (duty)
                    state = duty.duty as AttendanceState;
                else if (validEntries.some(e => e.workLocation === 'official_travel'))
                    state = 'official_travel';
                else if (validEntries.some(e => e.workLocation === 'field_work'))
                    state = 'field_duty';
                else if (validEntries.some(e => e.workLocation === 'training_venue'))
                    state = 'training_duty';
            }
            const leave = (await this.requests.repository.requests('leave')).find(r => 'startDate' in r && r.employeeId === employeeId && r.state === 'approved' && r.startDate <= on && r.endDate >= on);
            const wfh = (await this.requests.repository.requests('wfh')).find(r => 'wfhDate' in r && r.employeeId === employeeId && r.state === 'approved' && r.wfhDate === on);
            const holiday = (await this.requests.repository.rows('SELECT h.id FROM holidays h JOIN holiday_calendars c ON c.id=h.calendar_id WHERE h.holiday_date=? AND h.is_active=TRUE AND c.is_active=TRUE AND c.effective_from<=? AND (c.effective_to IS NULL OR c.effective_to>=?) AND (c.division_id IS NULL OR c.division_id IN (SELECT division_id FROM employee_division_assignments WHERE employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)))', [on, on, on, employeeId, on, on]))[0];
            return success({
                employeeId, date: on, state, workLocation: validEntries[0]?.workLocation ?? null, activeMinutes: s.activeMinutes, requiredActiveMinutes: s.requiredActiveMinutes, leaveRequestId: leave?.id ?? null, wfhRequestId: wfh?.id ?? null, holidayId: holiday ? String(holiday.id) : null
            });
        });
    }
    async range(employeeId: string, from: string, to: string): Promise<Result<readonly AttendanceDay[]>> {
        if (!dateSchema.safeParse(from).success || !dateSchema.safeParse(to).success || to < from || daysBetween(from, to) > 366)
            return invalid('dateRange', 'Choose an ordered range of at most 367 days.');
        const days: AttendanceDay[] = [];
        for (let on = from; on <= to; on = addDays(on, 1)) {
            const r = await this.day(employeeId, on);
            if (r.status !== 'success')
                return r;
            days.push(r.data);
        }
        return success(days);
    }
    async list(query: ListQuery) {
        return this.requests.run(async () => {
            const range = query.filters?.dateRange;
            if (!range)
                return invalid('dateRange', 'Choose a date range.');
            const rows: AttendanceDay[] = [];
            for (const employee of await this.requests.repository.employees()) {
                const id = String(employee.id);
                if (query.filters?.employeeIds && !query.filters.employeeIds.includes(id))
                    continue;
                const actor = await this.requests.resolveActor(range.from);
                if (!actor || !await this.requests.canRead(this.requests.repository, actor, id, range.from))
                    continue;
                const r = await this.range(id, range.from, range.to);
                if (r.status !== 'success')
                    return r;
                rows.push(...r.data);
            }
            return paginate(rows, query);
        });
    }
    async workload(employeeId: string, from: string): Promise<Result<WorkloadWeek>> {
        return this.requests.run(async () => {
            const days = await this.range(employeeId, from, addDays(from, 6));
            if (days.status !== 'success')
                return days;
            const actor = await this.requests.resolveActor(from);
            if (!actor)
                return indistinguishableNotFound();
            const c = await this.requests.repository.time.context(employeeId, from);
            if (!c)
                return indistinguishableNotFound();
            const plans = await this.requests.repository.rows('SELECT * FROM workload_allocations WHERE employee_id=? AND week_start_date=?', [employeeId, from]);
            const time = new TimeApplication(this.requests.repository.time, this.requests.resolveActor, this.requests.now);
            const summaries = await time.summaries(employeeId, from, addDays(from, 6));
            if (summaries.status !== 'success')
                return summaries;
            const allocations = plans.filter(p => !c.divisions.find(d => d.id === p.division_id)?.isRestricted || hasPermission(actor, 'organization.government.view')).map(p => ({
                divisionId: String(p.division_id), projectId: p.project_id ? String(p.project_id) : null, plannedMinutes: Number(p.planned_minutes), actualMinutes: summaries.data.reduce((n, s) => n + (p.project_id ? s.projectContributions.find(v => v.projectId === p.project_id)?.activeMinutes ?? 0 : s.divisionContributions.find(v => v.divisionId === p.division_id)?.activeMinutes ?? 0), 0)
            }));
            const capacityMinutes = days.data.reduce((n, d) => n + d.requiredActiveMinutes, 0), actualActiveMinutes = days.data.reduce((n, d) => n + d.activeMinutes, 0), plannedMinutes = allocations.reduce((n, a) => n + a.plannedMinutes, 0);
            const settings = (await this.requests.repository.rows('SELECT * FROM workload_settings WHERE id=1'))[0];
            return success({
                employeeId, weekStartDate: from, capacityMinutes, plannedMinutes, actualActiveMinutes, remainingMinutes: Math.max(0, capacityMinutes - plannedMinutes), utilizationPercent: capacityMinutes ? Math.round(plannedMinutes * 100 / capacityMinutes) : plannedMinutes ? 100 : 0, warning: plannedMinutes * 100 > capacityMinutes * Number(settings.overallocation_percent) ? 'overallocated' : plannedMinutes * 100 < capacityMinutes * Number(settings.underallocation_percent) ? 'underallocated' : null, allocations
            });
        });
    }
    async duty(employeeId: string, on: string, state: 'official_travel' | 'field_duty' | 'training_duty' | 'absent', reason: string) {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(on);
            if (!actor || !this.requests.isHr(actor))
                return indistinguishableNotFound();
            if (!dateSchema.safeParse(on).success || !reason.trim())
                return invalid('reason', 'Choose a date and explain the attendance designation.');
            if (!await this.requests.canRead(tx, actor, employeeId, on))
                return indistinguishableNotFound();
            const c = await tx.time.context(employeeId, on);
            if (c?.period && ['verified', 'amended'].includes(c.period.status))
                return conflict('This period is verified and locked.', true);
            if (state === 'absent' && c?.entries.some(e => e.isActive && e.state !== 'draft'))
                return conflict('Recorded work prevents an absence designation.');
            const before = (await tx.rows('SELECT * FROM attendance_duties WHERE employee_id=? AND work_date=?', [employeeId, on]))[0] ?? null;
            await tx.execute('INSERT INTO attendance_duties(id,employee_id,work_date,duty,reason,actor_user_id) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE duty=VALUES(duty),reason=VALUES(reason),actor_user_id=VALUES(actor_user_id)', [randomUUID(), employeeId, on, state, reason, actor.userId]);
            await tx.record(actor, 'attendance', employeeId, before, { on, state }, reason);
            return success({ employeeId, date: on, state });
        }));
    }
    async processMissing(tx: HrRepository, from: string, to: string) {
        for (const e of await tx.employees())
            for (let on = from; on <= to; on = addDays(on, 1)) {
                if (e.hire_date && date(e.hire_date) > on)
                    continue;
                const c = await tx.time.context(String(e.id), on);
                if (!c)
                    continue;
                const app = new TimeApplication(tx.time, this.requests.resolveActor, this.requests.now);
                const s = c.snapshot && c.period && ['verified', 'amended'].includes(c.period.status) ? c.snapshot : app.summary(String(e.id), on, c);
                const duty = (await tx.rows('SELECT duty FROM attendance_duties WHERE employee_id=? AND work_date=?', [String(e.id), on]))[0];
                const attendance = duty && !['approved_leave', 'half_day_leave', 'holiday', 'weekly_off'].includes(s.attendance) ? String(duty.duty) : s.attendance;
                await tx.execute('INSERT INTO attendance_days(id,employee_id,work_date,status,required_minutes,worked_minutes,source_version,recalculated_at) VALUES(?,?,?,?,?,?,1,UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE status=VALUES(status),required_minutes=VALUES(required_minutes),worked_minutes=VALUES(worked_minutes),source_version=source_version+1,recalculated_at=UTC_TIMESTAMP(6)', [randomUUID(), String(e.id), on, attendance, s.requiredActiveMinutes, s.activeMinutes]);
                if (['missing', 'under_time', 'overtime', 'critical'].includes(s.status))
                    await tx.job(`exception:${e.id}:${on}:${s.status}`, 'attendance.exception', this.requests.now(), { date: on, status: s.status }, String(e.id));
            }
    }
}
