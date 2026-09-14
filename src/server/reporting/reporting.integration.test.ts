import { sweepExportJobs } from './jobs';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool } from 'mysql2/promise';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { HrRepository } from '@/server/hr/repository';
import { RequestApplication } from '@/server/hr/requests';
import { ReportApplication } from './application';
import { createFinanceViewService } from './finance-adapter';
import { BackendReportingService } from './adapters';
import { FinanceApplication } from './finance';
import { ExportApplication } from './exports';
import type { ExportStorage } from './storage';
import type { Result } from '@/contracts/results';
const eid = '40000000-0000-4000-8000-000000000003', division = '10000000-0000-4000-8000-000000000001', project = '80000000-0000-4000-8000-000000000001';
let actor: ActorPolicyContext = { userId: '30000000-0000-4000-8000-000000000004', employeeId: '40000000-0000-4000-8000-000000000004', roles: ['hr_manager'], permissions: new Set(['organization.government.view', 'finance.cost.view', 'report.finance.unverified', 'finance.settings.manage', 'reporting.export.protected']), divisionIds: new Set([division]), employeeIds: new Set([eid]), projectIds: new Set([project]), teamIds: new Set() };
const authorized = actor;
let now = '2026-09-13T00:00:00.000Z';
let db: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: Pool, repo: HrRepository, reports: ReportApplication, finance: FinanceApplication, exports: ExportApplication;
const artifacts = new Map<string, Buffer>();
let failUpload = false;
const storage: ExportStorage = { async put(key, path) { if (failUpload)
        throw new Error('Provider down'); artifacts.set(key, await readFile(path)); }, async get(key) { const b = artifacts.get(key); if (!b)
        throw new Error('Missing'); return new ReadableStream({ start(c) { c.enqueue(b); c.close(); } }); }, async delete(key) { artifacts.delete(key); } };
function data<T>(r: Result<T>): T { expect(r.status, JSON.stringify(r)).toBe('success'); if (r.status !== 'success')
    throw new Error(JSON.stringify(r)); return r.data; }
const query = { dateRange: { from: '2026-09-02', to: '2026-09-02' }, employeeIds: [eid], verifiedOnly: false };
beforeAll(async () => {
    db = await createIsolatedDatabase();
    await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8'));
    const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
    url.pathname = `/${db.name}`;
    pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 8 });
    await pool.execute('INSERT INTO work_policies(id,policy_version_id,effective_from) VALUES(?,?,?)', [randomUUID(), '60000000-0000-4000-8000-000000000001', '2026-01-01']);
    await pool.execute("UPDATE cost_rates SET effective_to='2026-08-31' WHERE employee_id=?", [eid]);
    await pool.execute("UPDATE budgets SET period_end='2026-08-31' WHERE project_id=?", [project]);
    repo = new HrRepository(pool);
    reports = new ReportApplication(new RequestApplication(repo, async () => actor, () => now));
    finance = new FinanceApplication(reports);
    exports = new ExportApplication(reports, storage, { ttlMs: 10000 });
}, 60000);
afterAll(async () => { await pool?.end(); await db?.dispose(); });
describe('Phase 6 database reports and protected exports', () => {
    it('reconciles 420 active minutes across employee, division, project and task groupings', async () => {
        for (const key of ['timesheet-detail', 'weekly-hours', 'monthly-hours', 'employee-hours', 'division-contribution', 'project-hours', 'task-hours']) {
            const r = data(await reports.run(key, query, true));
            expect(r.activeMinutes, key).toBe(420);
            expect(r.rows.reduce((n, r) => n + r.activeMinutes, 0), key).toBe(420);
            expect(r.breakMinutes).toBe(60);
            expect(r.metadata.policyVersions).toEqual([1]);
        }
    });
    it('filters contributions without including unrelated projects or cross-division work', async () => {
        const r = data(await reports.run('division-contribution', { ...query, projectIds: [project] }, true));
        expect(r.activeMinutes).toBe(180);
        expect(r.rows).toHaveLength(1);
        expect(r.rows[0].key).toBe(division);
        expect(data(await reports.run('employee-hours', { ...query, employeeIds: [] }, true)).totalItems).toBe(0);
        expect(data(await reports.run('employee-hours', { ...query, taskIds: [] }, true)).activeMinutes).toBe(0);
    });
    it('validates filters, range, sorting and pagination rather than ignoring invalid input', async () => {
        for (const bad of [{ dateRange: { from: '2026-02-30', to: '2026-03-01' } }, { ...query, page: 0 }, { ...query, dayStatuses: ['approved'] }, { ...query, unknown: true }, { ...query, dateRange: { from: '2025-01-01', to: '2026-09-01' } }])
            expect((await reports.run('employee-hours', bad)).status).toBe('validation_failure');
        const r = data(await reports.run('division-contribution', { ...query, pageSize: 1, page: 2, sort: 'activeMinutes', direction: 'desc' }));
        expect(r.rows).toHaveLength(1);
        expect(r.totalItems).toBe(3);
    });
    it('removes government work before totals and never lists cost reports without the grant', async () => {
        actor = { ...authorized, permissions: new Set() };
        const r = data(await reports.run('division-contribution', query, true));
        expect(r.activeMinutes).toBe(300);
        expect(JSON.stringify(r)).not.toContain('Government');
        expect(data(await reports.catalogue()).some(s => s.key === 'cost-rates')).toBe(false);
        expect(await reports.run('cost-rates', query)).toEqual(await reports.run('absent', query));
        actor = authorized;
    });
    it('defaults finance to verified records and separately gates unverified access', async () => {
        actor = { ...authorized, permissions: new Set() };
        expect((await reports.run('payroll-hours', query)).status).toBe('permission_denied');
        const r = data(await reports.run('payroll-hours', { ...query, verifiedOnly: undefined }));
        expect(r.totalItems).toBe(0);
        expect(r.cost).toBeUndefined();
        actor = authorized;
    });
    it('stores exact effective rates and rejects overlapping, excess-precision and locked-history changes', async () => {
        const rate = { scope: 'employee', scopeId: eid, hourlyRate: { amount: '1250.75', currency: 'BDT' }, effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30', reason: 'Engineering test rate' };
        data(await finance.change('rate', rate));
        expect((await finance.change('rate', rate)).status).toBe('conflict');
        expect((await finance.change('rate', { ...rate, hourlyRate: { amount: '1.001', currency: 'BDT' } })).status).toBe('validation_failure');
        expect((await finance.change('rate', { ...rate, effectiveFrom: '2026-08-01', effectiveTo: '2026-08-31' })).status).toBe('conflict');
        expect(data(await reports.run('payroll-hours', query)).cost).toEqual({ amount: '8755.25', currency: 'BDT' });
    });
    it('uses project rate precedence and rounds total only once', async () => {
        data(await finance.change('rate', { scope: 'project', scopeId: project, hourlyRate: { amount: '1.01', currency: 'BDT' }, effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30', reason: 'Engineering project rate' }));
        expect(data(await reports.run('payroll-hours', query)).cost?.amount).toBe('5006.03');
    });
    it('redacts all cost values and blocks settings without financial permission', async () => {
        actor = { ...authorized, permissions: new Set(['organization.government.view', 'report.finance.unverified']) };
        const r = data(await reports.run('payroll-hours', query));
        expect(r.cost).toBeUndefined();
        expect(r.rows[0].rated).toEqual([]);
        expect(r.rows[0].cells.cost).toBe('Restricted');
        expect((await finance.change('payroll', { fields: ['cost'], reason: 'Not authorized' })).status).toBe('permission_denied');
        actor = authorized;
    });
    it('billable and non-billable durations reconcile and payroll mapping requires approved configuration', async () => {
        data(await finance.change('billable', { projectId: project, isBillable: true, effectiveFrom: '2026-09-01', effectiveTo: '2026-09-30', reason: 'Contract basis' }));
        const r = data(await reports.run('billable-hours', query, true));
        expect(r.rows.reduce((n, r) => n + Number(r.cells.billableMinutes ?? 0) + Number(r.cells.nonBillableMinutes ?? 0), 0)).toBe(420);
        expect((await reports.run('payroll-ready', query)).status).toBe('validation_failure');
        data(await finance.change('payroll', { fields: ['employeeId', 'active'], reason: 'Engineering configuration, not production approval' }));
        const payroll = data(await reports.run('payroll-ready', query));
        expect(Object.keys(payroll.rows[0].cells)).toEqual(['employeeId', 'active']);
    });
    it('records one idempotent request and rejects key reuse with different filters', async () => {
        const input = { reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: 'same-request' };
        const [a, b] = await Promise.all([exports.request(input), exports.request(input)]);
        expect(data(a).id).toBe(data(b).id);
        expect((await exports.request({ ...input, format: 'pdf' })).status).toBe('conflict');
    });
    it('generates an audited file, rejects another owner and revalidates revoked scope', async () => {
        const job = data(await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() }));
        expect(data(await exports.process(job.id)).state).toBe('ready');
        expect(data(await exports.process(job.id)).state).toBe('ready');
        const download = data(await exports.download(job.id));
        expect(await new Response(download.stream).text()).toContain('7:00');
        actor = { ...authorized, userId: '30000000-0000-4000-8000-000000000003' };
        expect(await exports.get(job.id)).toEqual(await exports.get(randomUUID()));
        actor = { ...authorized, permissions: new Set() };
        expect((await exports.download(job.id)).status).toBe('not_found');
        actor = authorized;
        expect((await repo.history('export.download', job.id))).toHaveLength(1);
    });
    it('handles provider failure, retry, cancellation, expiry and artifact deletion', async () => {
        const job = data(await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() }));
        failUpload = true;
        expect(data(await exports.process(job.id)).state).toBe('failed');
        failUpload = false;
        expect(data(await exports.transition(job.id, 'retry')).state).toBe('queued');
        expect(data(await exports.process(job.id)).state).toBe('ready');
        now = '2026-09-13T00:00:11.000Z';
        expect(data(await exports.get(job.id)).state).toBe('expired');
        expect((await exports.download(job.id)).status).toBe('not_found');
        expect(await repo.history('export.expiry', job.id)).toHaveLength(1);
        const cancelled = data(await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() }));
        expect(data(await exports.transition(cancelled.id, 'cancel')).state).toBe('cancelled');
        expect((await exports.process(cancelled.id)).status).toBe('conflict');
        data(await exports.transition(cancelled.id, 'delete'));
        expect((await exports.get(cancelled.id)).status).toBe('not_found');
    });
    it('supports HR report variants with period and record-state filters', async () => {
        for (const key of ['attendance-register', 'headcount', 'workload-capacity', 'evaluation-progress', 'performance-history', 'remarks-register'])
            data(await reports.run(key, query, true));
        const wfh = data(await reports.run('wfh-register', { dateRange: { from: '2026-09-03', to: '2026-09-03' }, employeeIds: [eid], recordStatuses: ['approved'] }, true));
        expect(wfh.totalItems).toBe(1);
        const leave = data(await reports.run('leave-register', { dateRange: { from: '2026-09-10', to: '2026-09-10' }, employeeIds: [eid], recordStatuses: ['approved'] }, true));
        expect(leave.totalItems).toBe(1);
    });
    it('keeps management reads scoped and rejects employee catalogue access and impersonation', async () => {
        actor = { ...authorized, roles: ['management'], permissions: new Set(), employeeIds: new Set([eid]), divisionIds: new Set([division]) };
        expect(data(await reports.run('employee-hours', query, true)).activeMinutes).toBe(180);
        expect((await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() })).status).toBe('permission_denied');
        actor = { ...authorized, roles: ['employee'], permissions: new Set() };
        expect(data(await reports.catalogue())).toHaveLength(0);
        actor = authorized;
        expect((await new BackendReportingService(reports, exports).runReport('someone-else', { reportKey: 'employee-hours', from: '2026-09-02', to: '2026-09-02' })).status).toBe('permission_denied');
    });
    it('requires protected export permission for government records even without cost columns', async () => {
        actor = { ...authorized, permissions: new Set(['organization.government.view']) };
        expect((await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() })).status).toBe('permission_denied');
        actor = authorized;
    });
    it('prevents simultaneous workers from publishing two artifacts and reclaims abandoned leases', async () => {
        const job = data(await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() }));
        const results = await Promise.all([exports.process(job.id), exports.process(job.id)]);
        expect(results.filter(r => r.status === 'success')).toHaveLength(1);
        expect(results.filter(r => r.status === 'conflict')).toHaveLength(1);
        expect(await repo.rows('SELECT id FROM export_artifacts WHERE export_job_id=?', [job.id])).toHaveLength(1);
        const abandoned = data(await exports.request({ reportKey: 'employee-hours', format: 'csv', query, idempotencyKey: randomUUID() }));
        await repo.execute("UPDATE export_jobs SET state='processing',lease_token=?,lease_until=? WHERE id=?", [randomUUID(), new Date('2026-09-12T00:00:00Z'), abandoned.id]);
        expect(data(await exports.process(abandoned.id)).state).toBe('ready');
    });
    it('implements finance adapters against the same totals and denies a forged viewer id', async () => {
        const service = createFinanceViewService(reports, exports), f = { periodId: '90000000-0000-4000-8000-000000000002', employeeIds: [eid] };
        const h = data(await service.getHours(actor.userId, f));
        expect(h.totals.active.minutes).toBe(420);
        expect(h.rows.reduce((n, r) => n + r.break.minutes, 0)).toBe(60);
        expect(h.totals.cost.visible && h.totals.cost.value.amount).toBe('5006.03');
        const b = data(await service.getBillableAnalysis(actor.userId, f));
        expect(b.reconciliation.balances).toBe(true);
        expect(b.billable.minutes).toBe(180);
        expect(b.nonBillable.minutes).toBe(240);
        data(await service.getOvertime(actor.userId, f));
        expect((await service.getHours('forged', f)).status).toBe('permission_denied');
    });
    it('records budget comparisons and effective-rate succession without rewriting prior rates', async () => {
        data(await finance.change('budget', { projectId: project, from: '2026-09-01', to: '2026-09-30', amount: '100.00', currency: 'BDT', reason: 'Engineering budget' }));
        const budget = data(await reports.run('budget-actual', { ...query, dateRange: { from: '2026-09-01', to: '2026-09-30' }, projectIds: [project] }, true));
        expect(budget.rows[0].cells.budget).toContain('100.00');
        const previous = (await repo.rows('SELECT id FROM cost_rates WHERE employee_id=? AND effective_from=?', [eid, '2026-09-01']))[0];
        const replacement = { scope: 'employee', scopeId: eid, hourlyRate: { amount: '1500.25', currency: 'BDT' }, effectiveFrom: '2026-09-15', effectiveTo: '2026-09-30', supersedesId: String(previous.id), reason: 'New effective rate' };
        data(await finance.change('rate', replacement));
        expect((await reports.rate(repo, eid, null, '2026-09-14'))?.amount).toBe('1250.75');
        expect((await reports.rate(repo, eid, null, '2026-09-15'))?.amount).toBe('1500.25');
    });
    it('removes protected divisions, projects and tasks from filter options',async()=>{
        actor={...authorized,permissions:new Set()};
        const service=new BackendReportingService(reports,exports);
        const report=data(await service.getReport(actor.userId,'employee-hours'));
        expect(JSON.stringify(report.filters)).not.toContain('80000000-0000-4000-8000-000000000002');
        expect(report.filters.find(f=>f.kind==='employee')?.options.some(o=>o.value===eid)).toBe(true);
        actor=authorized;
    });

    it('audits scheduler cleanup and terminates queued work for an inactive requester',async()=>{
        const job=data(await exports.request({reportKey:'employee-hours',format:'csv',query,idempotencyKey:randomUUID()}));
        await repo.execute("UPDATE users SET status='inactive' WHERE id=?",[authorized.userId]);
        try {data(await sweepExportJobs(pool,storage));expect((await repo.rows('SELECT state,failure_code FROM export_jobs WHERE id=?',[job.id]))[0]).toMatchObject({state:'failed',failure_code:'REQUESTER_INACTIVE'});expect(await repo.rows("SELECT event_id FROM audit_events WHERE resource_id=? AND actor_user_id IS NULL AND action='export.failure'",[job.id])).toHaveLength(1);} finally {await repo.execute("UPDATE users SET status='active' WHERE id=?",[authorized.userId]);}
    });

});
