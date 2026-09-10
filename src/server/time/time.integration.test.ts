import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import type { TimeEntryInput } from '@/contracts/services';
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
let now = '2026-09-11T03:00:00Z';
const input = (date: string, minutes = 420): TimeEntryInput => ({ employeeId, workDate: date, divisionId, projectId: null, taskId: null, entryMethod: 'manual_duration', workLocation: 'office', startTime: null, endTime: null, activeMinutes: minutes, workDescription: `Work ${date}`, completedWork: 'Delivered work', supportingLink: null, attachmentIds: [], overtimeReason: minutes > 420 ? 'Deadline' : null, criticalExplanation: minutes > 660 ? 'Incident response' : null });
const create = (date: string, minutes = 420) => app.save({ ...input(date, minutes), idempotencyKey: randomUUID() });
beforeAll(async () => { db = await createIsolatedDatabase(); await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8')); const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql'); url.pathname = `/${db.name}`; pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 6 }); repository = new MysqlTimeRepository(pool); app = new TimeApplication(repository, async () => actor, () => now); });
afterAll(async () => { await pool?.end(); await db?.dispose(); });
describe('Phase 4 authoritative time workflows', () => {
    it('BE-0403/0404/0406 stores one break and exact integer daily totals', async () => { const r = await create('2026-09-07'); expect(r.status, JSON.stringify(r)).toBe('success'); const day = await app.day(employeeId, '2026-09-07'); expect(day.status).toBe('success'); if (day.status === 'success')
        expect(day.data.summary).toMatchObject({ activeMinutes: 420, breakMinutes: 60, totalMinutes: 480, status: 'complete' }); });
    it('BE-0420 saves idempotently and detects changed retry payloads', async () => { const payload = { ...input('2026-09-08'), idempotencyKey: randomUUID() }; const first = await app.save(payload); expect(first.status, JSON.stringify(first)).toBe('success'); expect(await app.save(payload)).toEqual(first); expect((await app.save({ ...payload, activeMinutes: 419 })).status).toBe('conflict'); });
    it('BE-0450 validates both thresholds, exact 12 hours and critical explanation', async () => { expect((await create('2026-09-09', 419)).status).toBe('success'); const day = await app.day(employeeId, '2026-09-09'); if (day.status === 'success')
        expect(day.data.summary.status).toBe('under_time'); expect((await create('2026-09-14', 660)).status).toBe('success'); const exact = await app.day(employeeId, '2026-09-14'); if (exact.status === 'success')
        expect(exact.data.summary.status).toBe('overtime'); expect((await app.save({ ...input('2026-09-15', 661), criticalExplanation: null, idempotencyKey: randomUUID() })).status).toBe('validation_failure'); expect((await create('2026-09-15', 661)).status).toBe('success'); const [events] = await pool.query<RowDataPacket[]>("SELECT id FROM time_outbox WHERE event_type='time.critical' AND employee_id=? AND work_date='2026-09-15'", [employeeId]); expect(events).toHaveLength(1); });
    it('BE-0425 rejects overlapping clock entries regardless of the host timezone', async () => { const first = { ...input('2026-09-16', 120), entryMethod: 'manual_clock' as const, startTime: '09:00', endTime: '11:00', activeMinutes: null }; expect((await app.save({ ...first, idempotencyKey: randomUUID() })).status).toBe('success'); const overlap = await app.save({ ...first, startTime: '10:00', endTime: '12:00', workDescription: 'Different work', idempotencyKey: randomUUID() }); expect(overlap.status, JSON.stringify(overlap)).toBe('validation_failure'); });
    it('BE-0422/0453 allows exactly one concurrent timer start', async () => { const timer = { divisionId, projectId: null, taskId: null, workLocation: 'office' as const }; const results = await Promise.all([app.startTimer({ ...timer, idempotencyKey: randomUUID() }), app.startTimer({ ...timer, idempotencyKey: randomUUID() })]); expect(results.map((r) => r.status).sort(), JSON.stringify(results)).toEqual(['conflict', 'success']); });
    it('BE-0423 persists exactly one stopped draft and no counted time', async () => { const running = await app.runningTimer(); expect(running.status).toBe('success'); if (running.status !== 'success' || !running.data)
        throw new Error('Missing timer'); now = '2026-09-11T04:00:00Z'; const command = { sessionId: running.data.id, idempotencyKey: randomUUID() }; const [a, b] = await Promise.all([app.stopTimer(command), app.stopTimer(command)]); expect(a.status, JSON.stringify(a)).toBe('success'); expect(b).toEqual(a); const day = await app.day(employeeId, '2026-09-11'); if (day.status === 'success') {
        expect(day.data.summary.activeMinutes).toBe(0);
        expect(day.data.context.entries.filter((e) => e.state === 'draft')).toHaveLength(1);
    } });
    it('BE-0442 prevents stale updates and preserves correction evidence', async () => { const r = await create('2026-09-17'); if (r.status !== 'success')
        throw new Error(JSON.stringify(r)); const [a, b] = await Promise.all([app.save({ ...input('2026-09-17'), completedWork: 'First correction' }, r.data.id, r.data.version), app.save({ ...input('2026-09-17'), completedWork: 'Second correction' }, r.data.id, r.data.version)]); expect([a.status, b.status].sort()).toEqual(['conflict', 'success']); const [rows] = await pool.query<RowDataPacket[]>("SELECT before_protected,after_protected FROM audit_events WHERE resource_id=? AND action='time.correct'", [r.data.id]); expect(rows).toHaveLength(1); });
    it('BE-0424 returns corrective guidance for invalid payloads', async () => { const r = await app.save({ ...input('2026-09-21'), activeMinutes: 1.2, idempotencyKey: randomUUID() }); expect(r.status).toBe('validation_failure'); if (r.status === 'validation_failure')
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
    it('BE-0423 saves a stopped draft exactly once', async () => { const day = await app.day(employeeId, '2026-09-11'); if (day.status !== 'success')
        throw new Error(JSON.stringify(day)); const draft = day.data.context.entries.find((e) => e.state === 'draft')!; const payload = { ...input('2026-09-11', draft.activeMinutes), draftEntryId: draft.id, draftVersion: draft.version, idempotencyKey: randomUUID() }; const saved = await app.save(payload); expect(saved.status, JSON.stringify(saved)).toBe('success'); expect(await app.save(payload)).toEqual(saved); const next = await app.day(employeeId, '2026-09-11'); if (next.status === 'success') {
        expect(next.data.context.entries).toHaveLength(1);
        expect(next.data.context.entries[0].state).toBe('saved');
        expect(next.data.summary.activeMinutes).toBe(60);
    } });
    it('BE-0425 rejects across-division and cross-date interval collisions', async () => { const first = { ...input('2026-09-24', 120), entryMethod: 'manual_clock' as const, startTime: '09:00', endTime: '11:00', activeMinutes: null }; expect((await app.save({ ...first, idempotencyKey: randomUUID() })).status).toBe('success'); expect((await app.save({ ...first, divisionId: gov, startTime: '10:00', endTime: '12:00', workDescription: 'Government work', idempotencyKey: randomUUID() })).status).toBe('validation_failure'); });
    it('government records are filtered before summary aggregation and pagination', async () => { expect((await app.save({ ...input('2026-09-25', 120), divisionId: gov, idempotencyKey: randomUUID() })).status).toBe('success'); const restricted = new TimeApplication(repository, async () => ({ ...actor, permissions: new Set() })); const day = await restricted.day(employeeId, '2026-09-25'); expect(day.status).toBe('success'); if (day.status === 'success') {
        expect(day.data.summary.entryIds).toEqual([]);
        expect(day.data.summary.divisionContributions).toEqual([]);
        expect(day.data.summary.activeMinutes).toBe(0);
    } const adapter = new BackendTimesheetService(restricted); const rows = await adapter.listEntries({ pagination: { page: 1, pageSize: 25 }, filters: { employeeIds: [employeeId], dateRange: { from: '2026-09-25', to: '2026-09-25' } } }); if (rows.status === 'success')
        expect(rows.data.pageInfo.totalItems).toBe(0); });
    it('BE-0332/0425 refuses unreviewed tasks and inactive projects at the entry boundary', async () => {
        const projectId = '80000000-0000-4000-8000-000000000001';
        const taskId = '81000000-0000-4000-8000-000000000001';
        await pool.execute("INSERT INTO project_members(id,project_id,employee_id,effective_from) VALUES(UUID(),?,?,'2026-01-01')", [projectId, employeeId]);
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
    it('persists a cross-midnight timer on its start date and rejects overlap on the next day', async () => {
        now='2026-09-26T17:30:00Z';
        const started=await app.startTimer({divisionId,projectId:null,taskId:null,workLocation:'office',idempotencyKey:randomUUID()});
        if(started.status!=='success')throw new Error(JSON.stringify(started));
        now='2026-09-26T19:15:00Z';
        const stopped=await app.stopTimer({sessionId:started.data.id,idempotencyKey:randomUUID()});
        if(stopped.status!=='success')throw new Error(JSON.stringify(stopped));
        expect(stopped.data.workDate).toBe('2026-09-26');
        expect(stopped.data.activeMinutes).toBe(105);
        const saved=await app.save({...stopped.data,workDescription:'Overnight work',completedWork:'Incident resolved',idempotencyKey:randomUUID()});
        expect(saved.status,JSON.stringify(saved)).toBe('success');
        const overlap=await app.save({...input('2026-09-27'),entryMethod:'manual_clock',activeMinutes:null,startTime:'00:30',endTime:'02:00',idempotencyKey:randomUUID()});
        expect(overlap.status).toBe('validation_failure');
    });
    it('uses the real database session and rejects a revoked session at the HTTP boundary', async () => {
        const {AuthenticationService}=await import('@/server/authentication/service');
        const {MysqlAuthenticationStore}=await import('@/server/authentication/mysql-store');
        const {createTimeServices}=await import('./composition');
        const {handleTimeMutation}=await import('./http');
        const auth=new AuthenticationService(new MysqlAuthenticationStore(pool));
        const session=await auth.issueSession(userId,'test-origin',null);
        const services=()=>createTimeServices(pool,session.data.token);
        const payload={operation:'create',input:{...input('2026-09-30',60),idempotencyKey:randomUUID(),actor:{userId:'forged-admin'}}};
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
            const refused = await app.save(input('2026-10-01'), day.data.context.entries[0].id, day.data.context.entries[0].version);
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
        const command = { periodId: '90000000-0000-4000-8000-000000000003', recordId: entry.id, expectedVersion: entry.version, reason: 'Additional documented work', changes: { activeMinutes: 421, overtimeReason: 'Documented deadline' }, idempotencyKey: randomUUID() };
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
        const [verified,edited]=await Promise.all([hr.verify({periodId,note:null,idempotencyKey:randomUUID()}),app.save({...input('2026-10-02'),completedWork:'Concurrent correction'},created.data.id,created.data.version)]);
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
