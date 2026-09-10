import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { success } from '@/contracts/results';
import { addDays } from '@/lib/format';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { dateSchema, invalid } from '@/server/time/validation';
import { AttendanceApplication } from './attendance';
export class WorkloadPlanning {
    constructor(readonly attendance: AttendanceApplication) {
    }
    save(raw: unknown) {
        const app = this.attendance.requests;
        return app.run(() => app.repository.transaction(async (tx) => {
            const parsed = z.object({
                employeeId: z.uuid(), divisionId: z.uuid(), projectId: z.uuid().nullable(), weekStartDate: dateSchema, plannedMinutes: z.number().int().min(0).max(10080)
            }).safeParse(raw);
            if (!parsed.success)
                return invalid('allocation', parsed.error.issues[0].message);
            const input = parsed.data;
            const actor = await app.resolveActor(input.weekStartDate);
            if (!actor || actor.roles.includes('management') || (!app.isHr(actor) && !hasPermission(actor, 'request.decide')) || !await app.canRead(tx, actor, input.employeeId, input.weekStartDate, input.divisionId))
                return indistinguishableNotFound();
            for (let on = input.weekStartDate; on <= addDays(input.weekStartDate, 6); on = addDays(on, 1)) {
                const c = await tx.time.context(input.employeeId, on);
                if (!c?.effectiveDivisionIds.includes(input.divisionId))
                    return invalid('divisionId', 'The division must be assigned throughout this planning week.');
                if (input.projectId && !c.projects.some(p => p.id === input.projectId && p.divisionId === input.divisionId && p.isActive))
                    return invalid('projectId', 'Choose an active assigned project in this division.');
            }
            const week = await this.attendance.workload(input.employeeId, input.weekStartDate);
            if (week.status !== 'success')
                return week;
            const previous = (await tx.rows('SELECT * FROM workload_allocations WHERE employee_id=? AND division_id=? AND project_id<=>? AND week_start_date=?', [input.employeeId, input.divisionId, input.projectId, input.weekStartDate]))[0];
            const id = previous ? String(previous.id) : randomUUID(), basis = week.data.capacityMinutes ? Math.min(10000, Math.round(input.plannedMinutes * 10000 / week.data.capacityMinutes)) : 0;
            if (previous)
                await tx.execute('UPDATE workload_allocations SET planned_minutes=?,capacity_minutes=?,allocation_basis_points=?,version=version+1 WHERE id=?', [input.plannedMinutes, week.data.capacityMinutes, basis, id]);
            else
                await tx.execute('INSERT INTO workload_allocations(id,employee_id,division_id,project_id,week_start_date,planned_minutes,capacity_minutes,allocation_basis_points) VALUES(?,?,?,?,?,?,?,?)', [id, input.employeeId, input.divisionId, input.projectId, input.weekStartDate, input.plannedMinutes, week.data.capacityMinutes, basis]);
            await tx.record(actor, 'workload', id, previous, input);
            return success({ ...input, id });
        }));
    }
    settings(under: number, over: number) {
        const app = this.attendance.requests;
        return app.run(() => app.repository.transaction(async (tx) => {
            const actor = await app.resolveActor(app.today());
            if (!actor || !app.isHr(actor))
                return indistinguishableNotFound();
            if (!Number.isInteger(under) || !Number.isInteger(over) || under < 0 || over < under || over > 1000)
                return invalid('thresholds', 'Use ordered whole-percent thresholds from 0 to 1000.');
            const before = (await tx.rows('SELECT * FROM workload_settings WHERE id=1'))[0];
            await tx.execute('UPDATE workload_settings SET underallocation_percent=?,overallocation_percent=? WHERE id=1', [under, over]);
            await tx.record(actor, 'workload_settings', '1', before, { under, over });
            return success({ under, over });
        }));
    }
    calendar(employeeId: string, from: string) {
        const app = this.attendance.requests;
        return app.run(async () => {
            const week = await this.attendance.workload(employeeId, from);
            if (week.status !== 'success')
                return week;
            const days = await this.attendance.range(employeeId, from, addDays(from, 6));
            if (days.status !== 'success')
                return days;
            const c = await app.repository.time.context(employeeId, from), actor = await app.resolveActor(from);
            if (!c || !actor)
                return indistinguishableNotFound();
            const deadlines = c.tasks.filter(t => t.status !== 'completed' && t.dueDate && t.dueDate >= from && t.dueDate <= addDays(from, 13) && (!c.divisions.find(d => d.id === t.divisionId)?.isRestricted || hasPermission(actor, 'organization.government.view')));
            return success({ week: week.data, days: days.data, deadlines });
        });
    }
}
