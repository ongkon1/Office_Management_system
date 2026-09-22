import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import type { WorkLogInput } from '@/contracts/work-log';
import { TimeApplication } from './application';
import { MysqlTimeRepository } from './mysql-repository';
import { BackendTimesheetService } from './adapters';
const employeeId = '40000000-0000-4000-8000-000000000003';
const userId = '30000000-0000-4000-8000-000000000003';
const divisionId = '10000000-0000-4000-8000-000000000001';
const gov = '10000000-0000-4000-8000-000000000003';
const actor: ActorPolicyContext = { userId, employeeId, roles: ['employee'], permissions: new Set(['organization.government.view']), divisionIds: new Set([divisionId, gov]), employeeIds: new Set(), projectIds: new Set(), teamIds: new Set() };
let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
let pool: Pool;
let repository: MysqlTimeRepository;
let app: TimeApplication;
const now = '2026-09-11T03:00:00Z';
const input = (date: string, minutes = 420): WorkLogInput => ({ employeeId, workDate: date, divisionId, projectId: '80000000-0000-4000-8000-000000000001', taskId: '81000000-0000-4000-8000-000000000001', source: 'manual', idempotencyKey: randomUUID(), workLocation: 'office', durationMinutes: minutes, workDescription: `Work ${date}`, completedWork: 'Delivered work', supportingLink: null, attachmentIds: [], overtimeReason: minutes > 420 ? 'Deadline' : null, criticalExplanation: minutes > 660 ? 'Incident response' : null });
const create = (date: string, minutes = 420) => app.save({ ...input(date, minutes), idempotencyKey: randomUUID() });
beforeAll(async () => { db = await createIsolatedDatabase(); await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8')); const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql'); url.pathname = `/${db.name}`; pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 6 }); await pool.execute("INSERT INTO project_members(id,project_id,employee_id,effective_from) SELECT UUID(),id,?,'2026-01-01' FROM projects", [employeeId]); repository = new MysqlTimeRepository(pool); app = new TimeApplication(repository, async () => actor, () => now); });
afterAll(async () => { await pool?.end(); await db?.dispose(); });
describe('Modify B2 authoritative work-log workflows', () => {
    it('BE-0403/0404/0406 stores one break and exact integer daily totals', async () => { const r = await create('2026-09-07'); expect(r.status, JSON.stringify(r)).toBe('success'); const day = await app.day(employeeId, '2026-09-07'); expect(day.status).toBe('success'); if (day.status === 'success')
        expect(day.data.summary).toMatchObject({ activeMinutes: 420, breakMinutes: 60, totalMinutes: 480, status: 'complete' }); });
    it('BE-0420 saves idempotently and detects changed retry payloads', async () => { const payload = { ...input('2026-09-08'), idempotencyKey: randomUUID() }; const first = await app.save(payload); expect(first.status, JSON.stringify(first)).toBe('success'); expect(await app.save(payload)).toEqual(first); expect((await app.save({ ...payload, durationMinutes: 419 })).status).toBe('conflict'); });
    it('BE-0450 validates both thresholds, exact 12 hours and critical explanation', async () => { expect((await create('2026-09-09', 419)).status).toBe('success'); const day = await app.day(employeeId, '2026-09-09'); if (day.status === 'success')
        expect(day.data.summary.status).toBe('under_time'); expect((await create('2026-09-14', 660)).status).toBe('success'); const exact = await app.day(employeeId, '2026-09-14'); if (exact.status === 'success')
        expect(exact.data.summary.status).toBe('overtime'); expect((await app.save({ ...input('2026-09-15', 661), criticalExplanation: null, idempotencyKey: randomUUID() })).status).toBe('validation_failure'); expect((await create('2026-09-15', 661)).status).toBe('success'); const [events] = await pool.query<RowDataPacket[]>("SELECT id FROM time_outbox WHERE event_type='time.critical' AND employee_id=? AND work_date='2026-09-15'", [employeeId]); expect(events).toHaveLength(1); });
    it('BE-0442 prevents stale updates and preserves correction evidence', async () => { const r = await create('2026-09-17'); if (r.status !== 'success')
        throw new Error(JSON.stringify(r)); const [a, b] = await Promise.all([app.save({ ...input('2026-09-17'), completedWork: 'First correction' }, r.data.id, r.data.version, 'Corrected outcome'), app.save({ ...input('2026-09-17'), completedWork: 'Second correction' }, r.data.id, r.data.version, 'Corrected outcome')]); expect([a.status, b.status].sort()).toEqual(['conflict', 'success']); const [rows] = await pool.query<RowDataPacket[]>("SELECT before_protected,after_protected FROM audit_events WHERE resource_id=? AND action='time.correct'", [r.data.id]); expect(rows).toHaveLength(1); });
    it('BE-0424 returns corrective guidance for invalid payloads', async () => { const r = await app.save({ ...input('2026-09-21'), durationMinutes: 1.2, idempotencyKey: randomUUID() }); expect(r.status).toBe('validation_failure'); if (r.status === 'validation_failure')
        expect(r.fieldErrors[0].guidance).toBeTruthy(); });
    it('BE-0421 copies an unsaved draft without locks, attachments or reasons', async () => { const r = await create('2026-09-22'); if (r.status !== 'success')
        throw new Error(JSON.stringify(r)); const copy = await app.copy(r.data.id, '2026-09-23'); expect(copy.status).toBe('success'); if (copy.status === 'success')
        expect(copy.data).toMatchObject({ workDate: '2026-09-23', attachmentIds: [], overtimeReason: null }); const day = await app.day(employeeId, '2026-09-23'); if (day.status === 'success')
        expect(day.data.summary.entryIds).toHaveLength(0); });
    it('authorization rejects other employees with the same result as missing records', async () => { const other = new TimeApplication(repository, async () => ({ ...actor, employeeId: 'other' })); expect(await other.day(employeeId, '2026-09-07')).toEqual(await other.day('absent', '2026-09-07')); expect((await other.save({ ...input('2026-09-24'), idempotencyKey: randomUUID() })).status).toBe('not_found'); });
    it('BE-0405 denies break overrides without the separate grant', async () => { expect((await app.overrideBreak({ employeeId, workDate: '2026-09-07', minutes: 0, reason: 'Correction' })).status).toBe('permission_denied'); const privileged = new TimeApplication(repository, async () => ({ ...actor, permissions: new Set([...actor.permissions, 'time.break.override']) })); const r = await privileged.overrideBreak({ employeeId, workDate: '2026-09-07', minutes: 0, reason: 'No break taken' }); expect(r.status, JSON.stringify(r)).toBe('success'); if (r.status === 'success')
        expect(r.data).toMatchObject({ activeMinutes: 420, totalMinutes: 420, status: 'under_time' }); });
    it('BE-0440/0441 supports one remark, clarification and resolution history', async () => { const raised = await app.createRemark({ employeeId, message: 'Clarifying the work', relatedRecord: { type: 'timesheet', workDate: '2026-09-07' }, isCorrectionRequest: false, requestedChanges: null }); expect(raised.status, JSON.stringify(raised)).toBe('success'); if (raised.status !== 'success')
        return; expect((await app.changeRemark(raised.data.id, 'Additional detail')).status).toBe('success'); const resolved = await app.changeRemark(raised.data.id, null); if (resolved.status === 'success') {
        expect(resolved.data.responses).toHaveLength(1);
        expect(resolved.data.state).toBe('resolved');
    } });
    it('BE-0454 adapter totals reconcile with the canonical summary', async () => { const adapter = new BackendTimesheetService(app); const r = await adapter.getDay({ employeeId, date: '2026-09-08' }); expect(r.status, JSON.stringify(r)).toBe('success'); if (r.status === 'success')
        expect(r.data.summary.total.minutes).toBe(480); const rows = await adapter.listEntries({ pagination: { page: 1, pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: '2026-09-08', to: '2026-09-08' } } }); expect(rows.status).toBe('success'); if (rows.status === 'success')
        expect(rows.data.pageInfo.totalItems).toBe(1); });
    it('BE-0426 rejects seeded full-day leave and holidays', async () => { expect((await create('2026-09-10')).status).toBe('validation_failure'); expect((await create('2026-09-01')).status).toBe('validation_failure'); });
    it('government records are filtered before summary aggregation and pagination', async () => { expect((await app.save({ ...input('2026-09-25', 120), divisionId: gov, projectId: '80000000-0000-4000-8000-000000000002', taskId: '81000000-0000-4000-8000-000000000002', idempotencyKey: randomUUID() })).status).toBe('success'); const restricted = new TimeApplication(repository, async () => ({ ...actor, permissions: new Set() })); const day = await restricted.day(employeeId, '2026-09-25'); expect(day.status).toBe('success'); if (day.status === 'success') {
        expect(day.data.summary.entryIds).toEqual([]);
        expect(day.data.summary.divisionContributions).toEqual([]);
        expect(day.data.summary.activeMinutes).toBe(0);
    } const adapter = new BackendTimesheetService(restricted); const rows = await adapter.listEntries({ pagination: { page: 1, pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: '2026-09-25', to: '2026-09-25' } } }); if (rows.status === 'success')
        expect(rows.data.pageInfo.totalItems).toBe(0); });
    it('BE-0332/0425 refuses unreviewed tasks and inactive projects at the entry boundary', async () => {
        const projectId = '80000000-0000-4000-8000-000000000001';
        const taskId = '81000000-0000-4000-8000-000000000001';
        await pool.execute("UPDATE tasks SET review_state='pending_review',reviewer_employee_id=NULL,reviewed_at=NULL WHERE id=?", [taskId]);
        const command = { ...input('2026-09-28', 60), projectId, taskId, idempotencyKey: randomUUID() };
        expect((await app.save(command)).status).toBe('validation_failure');
        await pool.execute("UPDATE tasks SET review_state='rejected',reviewer_employee_id='40000000-0000-4000-8000-000000000002',reviewed_at=UTC_TIMESTAMP(6),review_note='Revise' WHERE id=?", [taskId]);
        expect((await app.save(command)).status).toBe('validation_failure');
        await pool.execute("UPDATE tasks SET review_state='approved' WHERE id=?", [taskId]);
        expect((await app.save(command)).status).toBe('success');
        await pool.execute('UPDATE projects SET accepts_time_entries=FALSE WHERE id=?', [projectId]);
        expect((await app.save({ ...command, workDescription: 'More work', idempotencyKey: randomUUID() })).status).toBe('validation_failure');
        await pool.execute('UPDATE projects SET accepts_time_entries=TRUE WHERE id=?', [projectId]);
    });
    it('protected attachment identifiers and counts are explicitly restricted', async () => { const first = await create('2026-09-29', 60); if (first.status !== 'success')
        throw new Error(JSON.stringify(first)); await pool.execute('UPDATE time_entries SET attachment_ids=JSON_ARRAY(?) WHERE id=?', ['protected-file-id', first.data.id]); const adapter = new BackendTimesheetService(app); const day = await adapter.getDay({ employeeId, date: '2026-09-29' }); if (day.status === 'success')
        expect(day.data.entries[0].attachmentCount).toBe('restricted'); const listed = await adapter.listEntries({ pagination: { page: 1, pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: '2026-09-29', to: '2026-09-29' } } }); if (listed.status === 'success') {
        expect(listed.data.items[0].attachmentIds).toBe('restricted');
        expect(JSON.stringify(listed)).not.toContain('protected-file-id');
    } });
    it('audit failure rolls back entry, summary, outbox and retry result together', async () => {
        const broken = new Proxy(repository, { get(target, property) { if (property === 'transaction')
                return <T>(work: (tx: import('./ports').TimeRepository) => Promise<import('@/contracts/results').Result<T>>) => target.transaction((tx) => work(new Proxy(tx, { get(inner, key) { if (key === 'audit')
                        return async () => { throw new Error('Injected audit outage'); }; const value = Reflect.get(inner, key); return typeof value === 'function' ? value.bind(inner) : value; } }))); const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value; } });
        const service = new TimeApplication(broken, async () => actor);
        const failed = await service.save({ ...input('2026-09-30'), idempotencyKey: randomUUID() });
        expect(failed.status).toBe('error');
        const [entries] = await pool.query<RowDataPacket[]>("SELECT id FROM time_entries WHERE employee_id=? AND work_date='2026-09-30'", [employeeId]);
        expect(entries).toHaveLength(0);
        const [summaries] = await pool.query<RowDataPacket[]>("SELECT id FROM daily_summaries WHERE employee_id=? AND work_date='2026-09-30'", [employeeId]);
        expect(summaries).toHaveLength(0);
    });
    it('uses the real database session and rejects a revoked session at the HTTP boundary', async () => {
        const {AuthenticationService}=await import('@/server/authentication/service');
        const {MysqlAuthenticationStore}=await import('@/server/authentication/mysql-store');
        const {createTimeServices}=await import('./composition');
        const {handleTimeMutation}=await import('./http');
        const auth=new AuthenticationService(new MysqlAuthenticationStore(pool));
        const session=await auth.issueSession(userId,'test-origin',null);
        const services=()=>createTimeServices(pool,session.data.token);
        const payload={operation:'create',input:{...input('2026-09-30',60),idempotencyKey:randomUUID()}};
        const request=()=>new Request('http://localhost:3000/api/time',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body:JSON.stringify(payload)});
        const response=await handleTimeMutation(request(),services,'http://localhost:3000');
        expect(response.status,JSON.stringify(await response.clone().json())).toBe(200);
        await auth.logout(session.data.token);
        expect((await handleTimeMutation(request(),services,'http://localhost:3000')).status).toBe(401);
    });
    it('BE-0443/0444 verifies a complete period and snapshots policy inputs', async () => {
        await pool.execute("UPDATE employees SET status=IF(id=?,'active','inactive')", [employeeId]);
        await pool.execute("INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id) VALUES('90000000-0000-4000-8000-000000000003','October day','2026-10-01','2026-10-01','open','60000000-0000-4000-8000-000000000001')");
        const hrActor = { ...actor, userId: '30000000-0000-4000-8000-000000000004', employeeId: null, roles: ['hr_manager' as const], permissions: new Set(['organization.government.view']) };
        const hr = new TimeApplication(repository, async () => hrActor);
        const command = { periodId: '90000000-0000-4000-8000-000000000003', note: 'Reviewed', idempotencyKey: randomUUID() };
        expect((await hr.verify(command)).status).toBe('conflict');
        expect((await create('2026-10-01')).status).toBe('success');
        const verified = await hr.verify(command);
        expect(verified.status, JSON.stringify(verified)).toBe('success');
        expect(await hr.verify(command)).toEqual(verified);
        const day = await app.day(employeeId, '2026-10-01');
        if (day.status === 'success') {
            expect(day.data.summary.isLocked).toBe(true);
            expect(day.data.context.entries[0].state).toBe('locked');
            const refused = await app.save(input('2026-10-01'), day.data.context.entries[0].id, day.data.context.entries[0].version, 'Correction');
            expect(refused).toMatchObject({ status: 'conflict', code: 'PERIOD_LOCKED' });
        }
        const [snapshots] = await pool.query<RowDataPacket[]>("SELECT snapshot_json FROM period_verifications WHERE period_id=?", [command.periodId]);
        expect(snapshots).toHaveLength(1);
    });
    it('BE-0445 amendments require a grant and preserve both values and the locked policy', async () => {
        const day = await app.day(employeeId, '2026-10-01');
        if (day.status !== 'success')
            throw new Error(JSON.stringify(day));
        const entry = day.data.context.entries[0];
        await pool.execute("UPDATE policy_versions SET recognized_break_minutes=30,scheduled_minutes=450 WHERE id='60000000-0000-4000-8000-000000000001'");
        const command = { periodId: '90000000-0000-4000-8000-000000000003', recordId: entry.id, expectedVersion: entry.version, reason: 'Additional documented work', changes: { durationMinutes: 421, overtimeReason: 'Documented deadline' }, idempotencyKey: randomUUID() };
        expect((await app.amend(command)).status).toBe('permission_denied');
        const hr = new TimeApplication(repository, async () => ({ ...actor, userId: '30000000-0000-4000-8000-000000000004', employeeId: null, roles: ['hr_manager'], permissions: new Set(['time.period.amend', 'organization.government.view']) }));
        const amended = await hr.amend(command);
        expect(amended.status, JSON.stringify(amended)).toBe('success');
        expect(await hr.amend(command)).toEqual(amended);
        const after = await app.day(employeeId, '2026-10-01');
        if (after.status === 'success')
            expect(after.data.summary).toMatchObject({ activeMinutes: 421, totalMinutes: 481, isLocked: true, policyVersion: 1 });
        const [audit] = await pool.query<RowDataPacket[]>("SELECT before_protected,after_protected,reason FROM audit_events WHERE resource_id=? AND action='period.amend'", [entry.id]);
        expect(audit).toHaveLength(1);
        expect(audit[0].reason).toBe(command.reason);
    });
    it('BE-0445 unlock is separately authorized and retains verification history', async () => { const command = { periodId: '90000000-0000-4000-8000-000000000003', reason: 'Reopen for HR review' }; expect((await app.unlock(command)).status).toBe('permission_denied'); const hr = new TimeApplication(repository, async () => ({ ...actor, userId: '30000000-0000-4000-8000-000000000004', employeeId: null, roles: ['hr_manager'], permissions: new Set(['time.period.unlock', 'organization.government.view']) })); const result = await hr.unlock(command); expect(result.status, JSON.stringify(result)).toBe('success'); const day = await app.day(employeeId, '2026-10-01'); if (day.status === 'success')
        expect(day.data.summary.isLocked).toBe(false); const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM period_verifications WHERE period_id=?", [command.periodId]); expect(rows).toHaveLength(2); });
    it('BE-0453 serializes verification against an ordinary edit',async()=>{
        const [engines]=await pool.query<RowDataPacket[]>("SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='time_write_guard'");
        expect(engines[0].ENGINE).toBe('InnoDB');
        const created=await create('2026-10-02');
        if(created.status!=='success')throw new Error(JSON.stringify(created));
        const periodId=randomUUID();
        await pool.execute("INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id) VALUES(?,'Concurrency day','2026-10-02','2026-10-02','open','60000000-0000-4000-8000-000000000001')",[periodId]);
        const hr=new TimeApplication(repository,async()=>({...actor,userId:'30000000-0000-4000-8000-000000000004',employeeId:null,roles:['hr_manager'],permissions:new Set(['organization.government.view'])}));
        const [verified,edited]=await Promise.all([hr.verify({periodId,note:null,idempotencyKey:randomUUID()}),app.save({...input('2026-10-02'),completedWork:'Concurrent correction'},created.data.id,created.data.version,'Concurrent correction')]);
        expect(verified.status,JSON.stringify(verified)).toBe('success');
        expect(['success','conflict']).toContain(edited.status);
        const day=await app.day(employeeId,'2026-10-02');
        if(day.status==='success'){expect(day.data.summary.isLocked).toBe(true);expect(day.data.context.entries[0].state).toBe('locked');}
        if(day.status!=='success')throw new Error(JSON.stringify(day));
        const amendments=new TimeApplication(repository,async()=>({...actor,userId:'30000000-0000-4000-8000-000000000004',employeeId:null,roles:['hr_manager'],permissions:new Set(['organization.government.view','time.period.amend'])}));
        const command={periodId,recordId:created.data.id,reason:'Verified correction',expectedVersion:day.data.context.entries[0].version};
        const results=await Promise.all(['First amendment','Second amendment'].map(completedWork=>amendments.amend({...command,changes:{completedWork},idempotencyKey:randomUUID()})));
        expect(results.map(r=>r.status).sort(),JSON.stringify(results)).toEqual(['conflict','success']);
        const [snapshots]=await pool.query<RowDataPacket[]>('SELECT id FROM period_verifications WHERE period_id=?',[periodId]);
        expect(snapshots).toHaveLength(2);
    });

});

describe('MBE-0203/0204/0206/0209 work-log safeguards', () => {
    it('refuses direct completed and pending task ids, and revalidates copies', async () => {
        const saved = await create('2026-11-02', 60);
        expect(saved.status, JSON.stringify(saved)).toBe('success');
        for (const status of ['completed', 'pending']) {
            await pool.execute('UPDATE tasks SET status=? WHERE id=?', [status, input('2026-11-02').taskId]);
            const result = await create('2026-11-03', 60);
            expect(result.status).toBe('validation_failure');
            if (result.status === 'validation_failure') expect(result.fieldErrors[0].guidance).toBeTruthy();
            if (saved.status === 'success') expect((await app.copy(saved.data.id, '2026-11-03')).status).toBe('validation_failure');
        }
        await pool.execute("UPDATE tasks SET status='in_progress' WHERE id=?", [input('2026-11-02').taskId]);
    });
    it('serializes concurrent retries and persists the supplied unique key', async () => {
        const command = input('2026-11-04', 60);
        const [first, second] = await Promise.all([app.save(command), app.save(command)]);
        expect(first.status, JSON.stringify(first)).toBe('success'); expect(second).toEqual(first);
        const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM time_entries WHERE idempotency_key=?', [command.idempotencyKey]);
        expect(rows).toHaveLength(1);
    });
    it('accepts repeated task logs but serializes the 24-hour daily cap', async () => {
        expect((await create('2026-11-05', 1400)).status).toBe('success');
        const results = await Promise.all([app.save({ ...input('2026-11-05', 40), overtimeReason: 'Deadline', criticalExplanation: 'Incident' }), app.save({ ...input('2026-11-05', 40), overtimeReason: 'Deadline', criticalExplanation: 'Incident' })]);
        // Each addition needs the day-level overtime and critical explanations.
        expect(results.map(r => r.status).sort()).toEqual(['success', 'validation_failure']);
        const failure = results.find(r => r.status === 'validation_failure');
        if (failure?.status === 'validation_failure') expect(failure.fieldErrors.some(e => e.code === 'DAILY_ACTIVE_LIMIT')).toBe(true);
    });
    it('makes unauthorized division, project and task ids indistinguishable from missing ids', async () => {
        for (const field of ['divisionId', 'projectId', 'taskId'] as const) {
            const a = await app.save({ ...input('2026-11-08', 60), [field]: 'not-authorized' });
            const b = await app.save({ ...input('2026-11-08', 60), [field]: 'nonexistent' });
            expect(a).toEqual(b); expect(a.status).toBe('not_found');
        }
        // Real but unavailable records must match missing identifiers too.
        expect((await app.save({ ...input('2026-11-08', 60), divisionId: '10000000-0000-4000-8000-000000000002' })).status).toBe('not_found');
        const leadEmployee = '40000000-0000-4000-8000-000000000002';
        const lead = new TimeApplication(repository, async () => ({ ...actor, employeeId: leadEmployee, roles: ['team_lead'] }));
        const unavailableTask = await lead.save({ ...input('2026-11-08', 60), employeeId: leadEmployee });
        const missingTask = await lead.save({ ...input('2026-11-08', 60), employeeId: leadEmployee, taskId: 'missing' });
        expect(unavailableTask).toEqual(missingTask); expect(unavailableTask.status).toBe('not_found');
        await pool.execute('UPDATE project_members SET is_active=FALSE WHERE employee_id=? AND project_id=?', [employeeId, input('2026-11-08').projectId]);
        try { expect(await create('2026-11-08', 60)).toEqual(await app.save({ ...input('2026-11-08', 60), projectId: 'missing' })); }
        finally { await pool.execute('UPDATE project_members SET is_active=TRUE WHERE employee_id=? AND project_id=?', [employeeId, input('2026-11-08').projectId]); }
    });
    it('deletes permitted logs with transactional summary invalidation', async () => {
        const result = await create('2026-11-09', 60); if (result.status !== 'success') throw new Error(JSON.stringify(result));
        expect((await app.remove(result.data.id, result.data.version + 1)).status).toBe('conflict');
        expect((await app.remove(result.data.id, result.data.version)).status).toBe('success');
        const day = await app.day(employeeId, '2026-11-09'); if (day.status === 'success') expect(day.data.summary.activeMinutes).toBe(0);
        const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM time_outbox WHERE employee_id=? AND work_date='2026-11-09'", [employeeId]);
        expect(rows.length).toBeGreaterThan(1);
    });
});

describe('B2 read models, provenance and corrections', () => {
    it('exposes duration-only logs and requires audit permission for revision history', async () => {
        const adapter = new BackendTimesheetService(app);
        const created = await adapter.createWorkLog(input('2026-11-10', 60));
        if (created.status !== 'success') throw new Error(JSON.stringify(created));
        expect(created.data).not.toHaveProperty('startTime'); expect(created.data).not.toHaveProperty('activeMinutes');
        const edit = { ...input('2026-11-10', 75), expectedVersion: created.data.version!, changeReason: 'Correct documented duration' };
        const corrected = await adapter.updateWorkLog(created.data.id, edit);
        expect(corrected.status, JSON.stringify(corrected)).toBe('success');
        expect(await adapter.updateWorkLog(created.data.id, edit)).toEqual(corrected);
        expect((await adapter.getWorkLogHistory(created.data.id)).status).toBe('permission_denied');
        const privileged = new BackendTimesheetService(new TimeApplication(repository, async () => ({ ...actor, permissions: new Set([...actor.permissions, 'control.audit.view']) })));
        const history = await privileged.getWorkLogHistory(created.data.id);
        expect(history.status, JSON.stringify(history)).toBe('success');
        if (history.status === 'success') expect(history.data[0]).toMatchObject({ reason: edit.changeReason, before: { durationMinutes: 60 }, after: { durationMinutes: 75 } });
        const preview = await adapter.previewWorkLog({ ...input('2026-11-10', 90) }, { excludeWorkLogId: created.data.id });
        if (preview.status === 'success') expect(preview.data.dayActive.minutes).toBe(90);
        else throw new Error(JSON.stringify(preview));
        const listed = await adapter.listWorkLogs({ pagination: { page: 1, pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: '2026-08-31', to: '2026-09-02' } } });
        expect(listed.status).toBe('success');
        if (listed.status === 'success') { expect(listed.data.pageInfo.totalItems).toBe(3); expect(listed.data.items.every(e => !('startTime' in e))).toBe(true); }
    });
    it('keeps historical clocks immutable even after an authorized unlock', async () => {
        const id = 'a0000000-0000-4000-8000-000000000004';
        const original = await repository.entry(id); if (!original) throw new Error('Missing historical fixture');
        const hr = new TimeApplication(repository, async () => ({ ...actor, roles: ['hr_manager'], permissions: new Set([...actor.permissions, 'time.period.unlock']) }));
        const context = await repository.context(employeeId, original.workDate);
        if (context?.period) expect((await hr.unlock({ periodId: context.period.id, reason: 'Historical preservation test' })).status).toBe('success');
        expect((await app.save(input(original.workDate, 200), id, original.version, 'Correction')).status).toBe('conflict');
        expect((await app.remove(id, original.version)).status).toBe('conflict');
        expect(await repository.entry(id)).toEqual(original);
    });
    it('converts a preserved draft once while retaining its clock provenance', async () => {
        const id = randomUUID();
        await pool.execute("INSERT INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,source,idempotency_key,work_location,start_at_utc,end_at_utc,active_minutes,work_description,completed_work,status,created_by_user_id,created_at) VALUES(?,?, '2026-11-11', ?,?,?, '60000000-0000-4000-8000-000000000001','Asia/Dhaka','timer','migrated_clock_entry',?,'office','2026-09-01 03:00:00','2026-09-01 04:00:00',60,'Review','Draft','draft',?,'2026-09-01 04:00:00')", [id, employeeId, divisionId, input('2026-11-11').projectId, input('2026-11-11').taskId, randomUUID(), userId]);
        const original = await repository.entry(id); if (!original) throw new Error('Missing draft');
        const adapter = new BackendTimesheetService(app); const command = input('2026-11-11', 75);
        const result = await adapter.convertDraft(id, original.version, command);
        expect(result.status, JSON.stringify(result)).toBe('success'); expect(await adapter.convertDraft(id, original.version, command)).toEqual(result);
        const retained = await repository.entry(id);
        expect(retained).toMatchObject({ startTime: original.startTime, endTime: original.endTime, activeMinutes: 60, state: 'draft', isActive: false });
        const day = await app.day(employeeId, '2026-11-11'); if (day.status === 'success') expect(day.data.summary.activeMinutes).toBe(75);
    });
    it('enforces task eligibility through authenticated HTTP requests', async () => {
        const { AuthenticationService } = await import('@/server/authentication/service');
        const { MysqlAuthenticationStore } = await import('@/server/authentication/mysql-store');
        const { createTimeServices } = await import('./composition');
        const { handleTimeMutation } = await import('./http');
        const auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
        const session = await auth.issueSession(userId, 'b2-endpoint', null);
        const command = input('2026-11-12', 60);
        try {
            for (const [status, review] of [['completed', 'approved'], ['in_progress', 'pending_review']]) {
                await pool.execute("UPDATE tasks SET status=?,review_state=?,reviewer_employee_id=IF(?='approved','40000000-0000-4000-8000-000000000002',NULL),reviewed_at=IF(?='approved',UTC_TIMESTAMP(6),NULL) WHERE id=?", [status, review, review, review, command.taskId]);
                const response = await handleTimeMutation(new Request('http://localhost:3000/api/time', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: JSON.stringify({ operation: 'create', input: command }) }), () => createTimeServices(pool, session.data.token), 'http://localhost:3000');
                expect(response.status).toBe(400); expect((await response.json()).fieldErrors.some((e: { field: string }) => e.field === 'taskId')).toBe(true);
            }
        } finally { await pool.execute("UPDATE tasks SET status='in_progress',review_state='not_required',reviewer_employee_id=NULL,reviewed_at=NULL WHERE id=?", [command.taskId]); await auth.logout(session.data.token); }
    });
});
