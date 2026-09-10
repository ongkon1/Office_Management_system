import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Holiday } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { dateSchema, invalid, conflict } from '@/server/time/validation';
import { RequestApplication } from './requests';
import { date } from './repository';
const schema = z.object({
    name: z.string().trim().min(1).max(160), scope: z.enum(['company', 'division', 'weekly']), divisionId: z.uuid().nullable(), date: dateSchema.nullable(), weekday: z.number().int().min(1).max(7).nullable(), isActive: z.boolean(), effectiveFrom: dateSchema.optional(), effectiveTo: dateSchema.nullable().optional()
});
export class HolidayApplication {
    constructor(readonly requests: RequestApplication) {
    }
    async list(): Promise<Result<readonly Holiday[]>> {
        return this.requests.run(async () => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor)
                return indistinguishableNotFound();
            const rows = await this.requests.repository.rows('SELECT h.*,c.division_id,c.effective_from,c.effective_to,d.is_government FROM holidays h JOIN holiday_calendars c ON c.id=h.calendar_id LEFT JOIN divisions d ON d.id=c.division_id');
            const weekly = await this.requests.repository.rows('SELECT w.*,d.is_government FROM weekly_holidays w LEFT JOIN divisions d ON d.id=w.division_id');
            const ref = { userId: actor.userId, displayName: 'HR' };
            const provenance = {
                createdAt: this.requests.now(), updatedAt: this.requests.now(), createdBy: ref, updatedBy: ref
            };
            return success([...rows.filter(r => !r.is_government || hasPermission(actor, 'organization.government.view')).map(r => ({
                    ...provenance, id: String(r.id), name: String(r.name), scope: r.division_id ? 'division' as const : 'company' as const, divisionId: r.division_id ? String(r.division_id) : null, date: date(r.holiday_date), weekday: null, effectiveFrom: date(r.effective_from), effectiveTo: r.effective_to ? date(r.effective_to) : null, isActive: Boolean(r.is_active)
                })), ...weekly.filter(r => !r.is_government || hasPermission(actor, 'organization.government.view')).map(r => ({
                    ...provenance, id: String(r.id), name: 'Weekly holiday', scope: 'weekly' as const, divisionId: r.division_id ? String(r.division_id) : null, date: null, weekday: Number(r.weekday) || 7, effectiveFrom: date(r.effective_from), effectiveTo: r.effective_to ? date(r.effective_to) : null, isActive: Boolean(r.is_active)
                }))]);
        });
    }
    async save(raw: unknown, id?: string): Promise<Result<Holiday>> {
        return this.requests.run(() => this.requests.repository.transaction(async (tx) => {
            const actor = await this.requests.resolveActor(this.requests.today());
            if (!actor || !this.requests.isHr(actor))
                return indistinguishableNotFound();
            const parsed = schema.safeParse(raw);
            if (!parsed.success)
                return invalid(String(parsed.error.issues[0].path[0]), parsed.error.issues[0].message);
            const input = parsed.data;
            if (input.scope === 'weekly' ? !input.weekday : !input.date)
                return invalid('date', 'Choose a date, or a weekday for a weekly holiday.');
            if (input.scope === 'division' && !input.divisionId)
                return invalid('divisionId', 'Choose the holiday division.');
            if (input.scope === 'company' && input.divisionId)
                return invalid('divisionId', 'Company holidays apply to all divisions.');
            if (input.divisionId) {
                const division = (await tx.rows('SELECT * FROM divisions WHERE id=?', [input.divisionId]))[0];
                if (!division || division.is_government && !hasPermission(actor, 'organization.government.view'))
                    return indistinguishableNotFound();
            }
            const from = input.effectiveFrom ?? input.date ?? this.requests.today(), to = input.effectiveTo ?? null;
            if (to && to < from)
                return invalid('effectiveTo', 'The end must not precede the start.');
            if (input.scope === 'weekly' && from < this.requests.today())
                return invalid('effectiveFrom', 'Weekly changes must start today or later.');
            const existing = id ? (await this.list()) : null;
            if (existing && existing.status !== 'success')
                return existing;
            const before = existing?.status === 'success' ? existing.data.find(h => h.id === id) : undefined;
            if (id && !before)
                return indistinguishableNotFound();
            if (before && before.scope !== input.scope)
                return invalid('scope', 'Create a separate holiday to change its scope.');
            const affectedFrom = before?.date && before.date < from ? before.date : from;
            const affectedTo = input.scope === 'weekly' ? to ?? '9999-12-31' : before?.date && before.date > input.date! ? before.date : input.date!;
            if ((await tx.time.periods()).some(p => ['verified', 'amended'].includes(p.status) && p.startDate <= affectedTo && p.endDate >= affectedFrom))
                return conflict('The holiday change overlaps a verified period.', true);
            const key = id ?? randomUUID();
            if (input.scope === 'weekly')
                await tx.execute('INSERT INTO weekly_holidays(id,division_id,weekday,effective_from,effective_to,is_active) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE division_id=VALUES(division_id),weekday=VALUES(weekday),effective_from=VALUES(effective_from),effective_to=VALUES(effective_to),is_active=VALUES(is_active)', [key, input.divisionId, input.weekday! % 7, from, to, input.isActive]);
            else {
                let calendarId: string;
                if (id) {
                    calendarId = String((await tx.rows('SELECT calendar_id FROM holidays WHERE id=?', [id]))[0].calendar_id);
                    await tx.execute('UPDATE holiday_calendars SET division_id=?,effective_from=?,effective_to=? WHERE id=?', [input.divisionId, from, to, calendarId]);
                }
                else {
                    calendarId = randomUUID();
                    await tx.execute('INSERT INTO holiday_calendars(id,division_id,name,effective_from,effective_to) VALUES(?,?,?,?,?)', [calendarId, input.divisionId, input.name, from, to]);
                }
                await tx.execute('INSERT INTO holidays(id,calendar_id,holiday_date,name,is_active) VALUES(?,?,?,?,?) ON DUPLICATE KEY UPDATE holiday_date=VALUES(holiday_date),name=VALUES(name),is_active=VALUES(is_active)', [key, calendarId, input.date, input.name, input.isActive]);
            }
            const ref = { userId: actor.userId, displayName: 'HR' };
            const result: Holiday = {
                ...input, id: key, createdAt: before?.createdAt ?? this.requests.now(), updatedAt: this.requests.now(), createdBy: before?.createdBy ?? ref, updatedBy: ref
            };
            await tx.record(actor, 'holiday', key, before, result);
            for (const employee of await tx.employees()) {
                const employeeId = String(employee.id);
                if (input.scope !== 'weekly') {
                    if (before?.date)
                        await this.requests.recalculate(tx, employeeId, before.date, before.date);
                    await this.requests.recalculate(tx, employeeId, input.date!, input.date!);
                }
                else {
                    for (const stored of await tx.rows('SELECT work_date FROM daily_summaries WHERE employee_id=? AND work_date>=? AND (? IS NULL OR work_date<=?)', [employeeId, from, to, to]))
                        await this.requests.recalculate(tx, employeeId, date(stored.work_date), date(stored.work_date));
                    await tx.job(`holiday:${key}:${randomUUID()}:${employeeId}`, 'calendar.recalculate', this.requests.now(), { from, to }, employeeId, key);
                }
            }
            return success(result);
        }));
    }
}
