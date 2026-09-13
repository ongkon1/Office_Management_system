import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { success, type Result } from '@/contracts/results';
import { addDays } from '@/lib/format';
import { money } from '@/lib/money';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import { dateSchema, invalid, conflict } from '@/server/time/validation';
import { HrRepository } from '@/server/hr/repository';
import { ReportApplication, denied } from './application';
const range = { supersedesId: z.uuid().optional(), effectiveFrom: dateSchema, effectiveTo: dateSchema.nullable(), reason: z.string().trim().min(1).max(500) };
const amount = z.string().regex(/^\d{1,15}(\.\d{1,2})?$/, 'Enter a non-negative amount with at most two decimal places.');
const rateSchema = z.object({ ...range, scope: z.enum(['employee', 'project']), scopeId: z.uuid(), hourlyRate: z.object({ amount, currency: z.literal('BDT') }) }).strict();
const billableSchema = z.object({ ...range, projectId: z.uuid(), isBillable: z.boolean() }).strict();
const budgetSchema = z.object({ projectId: z.uuid().optional(), divisionId: z.uuid().optional(), from: dateSchema, to: dateSchema, amount, currency: z.literal('BDT'), reason: z.string().trim().min(1).max(500) }).strict().refine(v => Boolean(v.projectId) !== Boolean(v.divisionId), 'Choose exactly one project or division budget.');
export class FinanceApplication {
    constructor(readonly reports: ReportApplication) { }
    async scope(repo: HrRepository, actor: ActorPolicyContext, scope: 'employee' | 'project' | 'division', id: string, on: string) {
        if (scope === 'employee')
            return this.reports.employeeVisible(repo, actor, id, on);
        if (scope === 'division') {
            const d = (await repo.rows('SELECT id,is_government FROM divisions WHERE id=?', [id]))[0];
            return Boolean(d && (!d.is_government || hasPermission(actor, 'organization.government.view')) && (actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.divisionIds.has(id)));
        }
        const p = (await repo.rows('SELECT p.division_id,d.is_government FROM projects p JOIN divisions d ON d.id=p.division_id WHERE p.id=?', [id]))[0];
        return Boolean(p && (!p.is_government || hasPermission(actor, 'organization.government.view')) && (actor.roles.includes('hr_manager') || actor.roles.includes('super_admin') || actor.projectIds.has(id) && actor.divisionIds.has(String(p.division_id))));
    }
    async mutable(repo: HrRepository, from: string, to: string | null) {
        return !(await repo.rows("SELECT id FROM timesheet_periods WHERE status IN ('verified','amended') AND end_date>=? AND start_date<=? LIMIT 1", [from, to ?? '9999-12-31'])).length;
    }
    async change(kind: 'rate' | 'billable' | 'budget' | 'payroll', raw: unknown): Promise<Result<{
        id: string;
    }>> {
        return this.reports.requests.run(() => this.reports.requests.repository.transaction(async (repo) => {
            const actor = await this.reports.actor();
            if (!actor || actor.roles.includes('management') || !hasPermission(actor, 'report.finance.read') || !hasPermission(actor, 'finance.cost.view') || !hasPermission(actor, 'finance.settings.manage'))
                return denied;
            const id = randomUUID();
            if (kind === 'payroll') {
                const p = z.object({ fields: z.array(z.enum(['employeeId', 'employee', 'active', 'overtime', 'cost'])).min(1).max(5), reason: z.string().trim().min(1).max(500) }).strict().safeParse(raw);
                if (!p.success)
                    return invalid('fields', 'Choose approved payroll fields and record the approval reason.');
                if (new Set(p.data.fields).size !== p.data.fields.length)
                    return invalid('fields', 'Select each field once.');
                const before = (await repo.rows('SELECT * FROM payroll_field_config WHERE id=1'))[0] ?? null;
                await repo.execute('INSERT INTO payroll_field_config(id,fields,approved_by_user_id,reason) VALUES(1,?,?,?) ON DUPLICATE KEY UPDATE fields=VALUES(fields),approved_by_user_id=VALUES(approved_by_user_id),reason=VALUES(reason),version=version+1', [JSON.stringify(p.data.fields), actor.userId, p.data.reason]);
                await repo.record(actor, 'finance.payroll-fields', '1', before, p.data, p.data.reason);
                return success({ id: '1' });
            }
            if (kind === 'budget') {
                const p = budgetSchema.safeParse(raw);
                if (!p.success)
                    return invalid('budget', p.error.issues[0].message);
                const b = p.data;
                if (b.to < b.from)
                    return invalid('to', 'Choose an end date after the start date.');
                const scopeId = b.projectId ?? b.divisionId!, column = b.projectId ? 'project_id' : 'division_id';
                if (!await this.scope(repo, actor, b.projectId ? 'project' : 'division', scopeId, b.from))
                    return indistinguishableNotFound();
                const overlaps = await repo.rows(`SELECT id FROM budgets WHERE ${column}=? AND period_start<=? AND period_end>=?`, [scopeId, b.to, b.from]);
                if (overlaps.length)
                    return conflict('A budget already covers these dates. Preserve it and choose a new period.');
                await repo.execute(`INSERT INTO budgets(id,${column},period_start,period_end,amount,currency) VALUES(?,?,?,?,?,?)`, [id, scopeId, b.from, b.to, money(b.amount, b.currency).amount, b.currency]);
                await repo.record(actor, 'finance.budget', id, null, b, b.reason);
                return success({ id });
            }
            const parsed = (kind === 'rate' ? rateSchema : billableSchema).safeParse(raw);
            if (!parsed.success)
                return invalid('input', parsed.error.issues[0].message);
            const v = parsed.data;
            if (v.effectiveTo && v.effectiveTo < v.effectiveFrom)
                return invalid('effectiveTo', 'Choose an ordered effective date range.');
            if (!await this.mutable(repo, v.effectiveFrom, v.effectiveTo))
                return conflict('Financial classification cannot change a verified period.', true);
            const scope = 'scope' in v ? v.scope : 'project', scopeId = 'scopeId' in v ? v.scopeId : v.projectId;
            if (!await this.scope(repo, actor, scope, scopeId, v.effectiveFrom))
                return indistinguishableNotFound();
            const table = kind === 'rate' ? 'cost_rates' : 'project_billability', column = scope === 'employee' ? 'employee_id' : 'project_id';
            const overlaps = await repo.rows(`SELECT * FROM ${table} WHERE ${column}=? ${kind === 'rate' ? 'AND is_active=TRUE' : ''} AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`, [scopeId, v.effectiveTo ?? '9999-12-31', v.effectiveFrom]);
            if (overlaps.length) {
                const previous = overlaps[0];
                if (overlaps.length !== 1 || v.supersedesId !== previous.id || String(previous.effective_from instanceof Date ? previous.effective_from.toISOString().slice(0, 10) : previous.effective_from) >= v.effectiveFrom)
                    return conflict('An effective record already covers these dates. Supply its id to supersede it from a later date.');
                const until = addDays(v.effectiveFrom, -1);
                await repo.execute(`UPDATE ${table} SET effective_to=? WHERE id=?`, [until, String(previous.id)]);
                await repo.record(actor, `finance.${kind}.supersede`, String(previous.id), previous, { effectiveTo: until, nextId: id }, v.reason);
            }
            else if (v.supersedesId)
                return conflict('The record to supersede no longer covers these dates.');
            if ('hourlyRate' in v)
                await repo.execute(`INSERT INTO cost_rates(id,${column},rate_amount,currency,rate_unit,effective_from,effective_to) VALUES(?,?,?,?,'hour',?,?)`, [id, scopeId, money(v.hourlyRate.amount, v.hourlyRate.currency).amount, v.hourlyRate.currency, v.effectiveFrom, v.effectiveTo]);
            else
                await repo.execute('INSERT INTO project_billability(id,project_id,effective_from,effective_to,is_billable,reason,created_by_user_id) VALUES(?,?,?,?,?,?,?)', [id, scopeId, v.effectiveFrom, v.effectiveTo, v.isBillable, v.reason, actor.userId]);
            await repo.record(actor, `finance.${kind}`, id, null, v, v.reason);
            return success({ id });
        }));
    }
}
