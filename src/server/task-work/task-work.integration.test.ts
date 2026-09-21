import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import type { RoleKey, TaskStatus } from '@/contracts/domain';
import type { TaskTransitionInput } from '@/contracts/task-transition';
import { TaskWorkApplication } from './application';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import { TimeApplication } from '@/server/time/application';

const uid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const eid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const projectId = '80000000-0000-4000-8000-000000000001';
const divisionId = '10000000-0000-4000-8000-000000000001';
const date = '2026-10-04'; const now = () => `${date}T04:00:00.000Z`;
let database: Awaited<ReturnType<typeof createIsolatedDatabase>>; let pool: Pool;
const actor = (role: RoleKey = 'employee'): ActorPolicyContext => {
    const n = { employee: 3, team_lead: 2, super_admin: 1, hr_manager: 4, management: 6 }[role];
    return { userId: uid(n), employeeId: eid(n), roles: [role], permissions: new Set(), divisionIds: new Set([divisionId]), employeeIds: new Set([eid(3)]), projectIds: new Set([projectId]), teamIds: new Set() };
};
const service = (role: RoleKey = 'employee') => new TaskWorkApplication(pool, async () => actor(role), now);
async function task(status: TaskStatus = 'pending', employeeId: string | null = eid(3), project = projectId) {
    const id = randomUUID();
    await pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state,estimated_minutes) SELECT ?,id,division_id,'Private task title',?,?,?,'team_lead','not_required',480 FROM projects WHERE id=?", [id, status, employeeId, eid(2), project]);
    return id;
}
const move = (taskId: string, fromStatus: TaskStatus = 'pending', toStatus: TaskStatus = 'in_progress', expectedVersion = 1): TaskTransitionInput => ({ taskId, fromStatus, toStatus, expectedVersion, actorRole: 'team_lead', note: 'Documented workflow change', idempotencyKey: randomUUID() });
async function rows(sql: string, values: (string | number | boolean | null | Date)[] = []) { return (await pool.execute<RowDataPacket[]>(sql, values))[0]; }
function log(taskId: string, durationMinutes = 555) { return { employeeId: eid(3), workDate: date, divisionId, projectId, taskId, durationMinutes, source: 'manual' as const, idempotencyKey: randomUUID(), workLocation: 'office' as const, workDescription: 'Private work description', completedWork: 'Private completed work', supportingLink: null, attachmentIds: [], overtimeReason: 'Documented delivery', criticalExplanation: 'Documented critical work' }; }
beforeAll(async () => {
    database = await createIsolatedDatabase(); await database.connection.query(readFileSync('scripts/seed-development.sql', 'utf8'));
    const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql'); url.pathname = `/${database.name}`;
    pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 8 });
    await pool.execute("INSERT INTO employee_division_assignments(id,employee_id,division_id,lead_employee_id,effective_from,is_primary) VALUES(UUID(),?,?,?,'2026-01-01',TRUE)", [eid(7), divisionId, eid(2)]);
    await pool.execute("INSERT INTO project_members(id,project_id,employee_id,effective_from) VALUES(UUID(),?,?,'2026-01-01')", [projectId, eid(3)]);
});
afterAll(async () => { await pool?.end(); await database?.dispose(); });

describe('MBE-0301/0302/0303/0309 transition matrix', () => {
    const roles: RoleKey[] = ['employee', 'team_lead', 'super_admin', 'hr_manager', 'management'];
    const statuses: TaskStatus[] = ['pending', 'in_progress', 'completed'];
    it.each(roles.flatMap(role => statuses.flatMap(from => statuses.map(to => ({ role, from, to })))))('$role: $from → $to uses server authority', async ({ role, from, to }) => {
        const id = await task(from); const result = await service(role).transition(move(id, from, to));
        const ordinary = (from === 'pending' && to === 'in_progress') || (from === 'in_progress' && to === 'completed') || (from === 'completed' && to === 'in_progress');
        const allowed = !['hr_manager', 'management'].includes(role) && (ordinary || (role === 'team_lead' && from === 'pending' && to === 'completed'));
        expect(result.status, JSON.stringify(result)).toBe(allowed ? 'success' : ['hr_manager', 'management'].includes(role) ? 'permission_denied' : 'validation_failure');
        expect(await rows('SELECT id FROM time_entries WHERE task_id=?', [id])).toHaveLength(0);
        expect(await rows('SELECT id FROM task_status_transitions WHERE task_id=?', [id])).toHaveLength(allowed ? 1 : 0);
    });
    it.each(['completed', 'pending'] as const)('requires a note for the %s special transition', async from => {
        const id = await task(from); const result = await service('team_lead').transition({ ...move(id, from, from === 'completed' ? 'in_progress' : 'completed'), note: '   ' });
        expect(result.status).toBe('validation_failure'); if (result.status === 'validation_failure') expect(result.fieldErrors[0]).toMatchObject({ field: 'note', code: 'TRANSITION_NOTE_REQUIRED' });
    });
    it('requires an optimistic version and rejects an unapproved task', async () => {
        const id = await task(); expect((await service().transition({ ...move(id), expectedVersion: undefined })).status).toBe('validation_failure');
        await pool.execute("UPDATE tasks SET review_state='pending_review' WHERE id=?", [id]);
        expect((await service().transition(move(id))).status).toBe('validation_failure');
    });
    it('returns exactly one result for concurrent retries and a conflict for changed input', async () => {
        const id = await task(); const command = move(id); const [a, b] = await Promise.all([service().transition(command), service().transition(command)]);
        expect(a.status).toBe('success'); expect(b).toEqual(a);
        expect((await service().transition({ ...command, note: 'Different' })).status).toBe('conflict');
        expect(await rows('SELECT id FROM task_status_transitions WHERE task_id=?', [id])).toHaveLength(1);
        expect(await rows('SELECT id FROM notifications WHERE related_id=?', [id])).toHaveLength(2);
    });
    it('concurrent different moves share a version and only one succeeds', async () => {
        const id = await task(); const result = await Promise.all([service('team_lead').transition(move(id)), service('team_lead').transition(move(id, 'pending', 'completed'))]);
        expect(result.map(r => r.status).sort()).toEqual(['conflict', 'success']); expect(await rows('SELECT id FROM task_status_transitions WHERE task_id=?', [id])).toHaveLength(1);
    });
    it('completion survives reopening in append-only history while the current date clears', async () => {
        const id = await task('in_progress'); const first = await service().transition(move(id, 'in_progress', 'completed'));
        expect(first.status).toBe('success'); expect((await rows('SELECT completed_at FROM tasks WHERE id=?', [id]))[0].completed_at).not.toBeNull();
        const reopened = await service().transition(move(id, 'completed', 'in_progress', 2)); expect(reopened.status).toBe('success');
        expect((await rows('SELECT completed_at FROM tasks WHERE id=?', [id]))[0].completed_at).toBeNull();
        expect(await rows('SELECT id FROM task_status_transitions WHERE task_id=?', [id])).toHaveLength(2);
        await expect(pool.execute("UPDATE task_status_transitions SET note='rewrite' WHERE task_id=?", [id])).rejects.toThrow();
        await expect(pool.execute('DELETE FROM task_status_transitions WHERE task_id=?', [id])).rejects.toThrow();
    });
});

describe('MBE-0304/0305/0306 history and actual work', () => {
    it('transitions leave every daily total unchanged; actual/variance come only from visible work', async () => {
        const id = await task(); const app = new TimeApplication(new MysqlTimeRepository(pool), async () => actor(), now);
        const before = await app.day(eid(3), date); expect((await service().transition(move(id))).status).toBe('success');
        const started = await app.day(eid(3), date); expect(before.status).toBe('success'); expect(started.status).toBe('success'); if (before.status === 'success' && started.status === 'success') expect(started.data.summary).toEqual(before.data.summary);
        const saved = await app.save(log(id)); expect(saved.status, JSON.stringify(saved)).toBe('success');
        expect((await service().transition(move(id, 'in_progress', 'completed', 2))).status).toBe('success');
        const history = await service().history(id); expect(history.status, JSON.stringify(history)).toBe('success');
        if (history.status === 'success') { expect(history.data).toMatchObject({ actualMinutes: 555, estimatedMinutes: 480, variance: { minutes: 75, label: '+1:15' } }); expect(history.data.dailyActuals[0].actual.minutes).toBe(555); expect(history.data.items).toHaveLength(3); }
        const notifications = await rows('SELECT notification_type,safe_payload FROM notifications WHERE related_id=?', [id]);
        expect(notifications.some(n => n.notification_type === 'significant_variance')).toBe(true);
        expect(JSON.stringify(notifications)).not.toContain('Private');
        const complete = await app.day(eid(3), date); await service().transition(move(id, 'completed', 'in_progress', 3)); const reopened = await app.day(eid(3), date); expect(complete.status).toBe('success'); expect(reopened.status).toBe('success'); if (complete.status === 'success' && reopened.status === 'success') expect(reopened.data.summary).toEqual(complete.data.summary);
    });
    it('does not reveal unauthorized task existence, history or aggregation', async () => {
        const id = await task('pending', eid(7));
        expect(await service().history(id)).toEqual(await service().history(randomUUID()));
        expect(await service().transition(move(id))).toEqual(await service().transition(move(randomUUID())));
        const government = await task('pending', eid(3), '80000000-0000-4000-8000-000000000002');
        expect(await service().history(government)).toEqual(await service().history(randomUUID()));
        expect(await service().transition(move(government))).toEqual(await service().transition(move(randomUUID())));
    });
    it('filters another employee’s task logs before totals and daily grouping', async () => {
        const id = await task('in_progress');
        const hidden = randomUUID();
        await pool.execute("INSERT INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,source,idempotency_key,work_location,active_minutes,work_description,completed_work,status,created_by_user_id) VALUES(?,?,'2026-10-05',?,?,?,'60000000-0000-4000-8000-000000000001','Asia/Dhaka','manual_duration','manual',?,'office',123,'Hidden work','Hidden result','saved',?)", [hidden,eid(7),divisionId,projectId,id,randomUUID(),uid(7)]);
        const history = await service().history(id); expect(history.status).toBe('success'); if (history.status === 'success') { expect(history.data.actualMinutes).toBe(0); expect(history.data.dailyActuals).toEqual([]); expect(history.data.items).toEqual([]); }
    });
});

describe('MBE-0307/0308 reliable effects and assignment', () => {
    it('reassigns within effective lead scope, audits before/after, and deduplicates delivery', async () => {
        const id = await task();
        const command = { taskId: id, assigneeEmployeeId: eid(7), expectedVersion: 1, idempotencyKey: randomUUID() };
        const result = await service('team_lead').assign(command); expect(result.status, JSON.stringify(result)).toBe('success'); expect(await service('team_lead').assign(command)).toEqual(result);
        expect(await rows("SELECT event_id FROM audit_events WHERE resource_id=? AND action='task.assignment.changed'", [id])).toHaveLength(1);
        const notifications = await rows("SELECT id FROM notifications WHERE related_id=? AND notification_type='task_reassigned'", [id]); expect(notifications.length).toBeGreaterThan(0);
        expect((await service().transition(move(id, 'pending', 'in_progress', 2))).status).toBe('not_found');
    });
    it('delivers the first assignment event for an unassigned task', async () => {
        const id = await task('pending', null);
        const result = await service('super_admin').assign({ taskId: id, assigneeEmployeeId: eid(3), expectedVersion: 1, idempotencyKey: randomUUID() });
        expect(result.status, JSON.stringify(result)).toBe('success');
        expect((await rows("SELECT id FROM notifications WHERE related_id=? AND notification_type='task_assigned'", [id])).length).toBeGreaterThan(0);
    });
    it.each(['audit_events', 'notifications'])('rolls back state/history/replay on %s failure', async table => {
        const id = await task();
        const broken = new Proxy(pool, { get(target, property) {
            if (property === 'getConnection') return async () => { const connection = await target.getConnection(); return new Proxy(connection, { get(inner, key) { if (key === 'execute') return async (sql: string, values: (string | number | boolean | null | Date)[]) => { if (sql.startsWith(`INSERT INTO ${table}`)) throw new Error('Injected failure'); return inner.execute(sql, values); }; const value = Reflect.get(inner, key); return typeof value === 'function' ? value.bind(inner) : value; } }) as PoolConnection; };
            const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
        } });
        const result = await new TaskWorkApplication(broken, async () => actor(), now).transition(move(id)); expect(result.status).toBe('error');
        expect((await rows('SELECT status,version FROM tasks WHERE id=?', [id]))[0]).toMatchObject({ status: 'pending', version: 1 });
        expect(await rows('SELECT id FROM task_status_transitions WHERE task_id=?', [id])).toHaveLength(0);
    });
    it('records a locked-period refusal without changing the work log', async () => {
        const id = await task('in_progress'); const app = new TimeApplication(new MysqlTimeRepository(pool), async () => actor(), now);
        expect((await app.save({ ...log(id, 60), workDate: '2026-08-31' })).status).toBe('conflict');
        expect((await rows("SELECT event_id FROM audit_events WHERE action='time.period.locked_conflict' AND resource_id=?", [eid(3)])).length).toBeGreaterThan(0);
    });
});

describe('B3 authenticated boundary and related effects', () => {
    it('uses the authenticated identity at HTTP and refuses revoked sessions', async () => {
        const { AuthenticationService } = await import('@/server/authentication/service');
        const { MysqlAuthenticationStore } = await import('@/server/authentication/mysql-store');
        const { createTimeServices } = await import('@/server/time/composition');
        const { handleTimeMutation } = await import('@/server/time/http');
        const auth = new AuthenticationService(new MysqlAuthenticationStore(pool)); const session = await auth.issueSession(uid(3), 'b3', null);
        const id = await task(); const command = move(id, 'pending', 'completed');
        const request = (input: TaskTransitionInput) => new Request('http://localhost:3000/api/time', { method: 'POST', headers: { origin: 'http://localhost:3000' }, body: JSON.stringify({ operation: 'task.transition', input }) });
        const services = () => createTimeServices(pool, session.data.token);
        expect((await handleTimeMutation(request(command), services, 'http://localhost:3000')).status).toBe(400);
        const valid = move(id); expect((await handleTimeMutation(request(valid), services, 'http://localhost:3000')).status).toBe(200);
        await auth.logout(session.data.token);
        expect((await handleTimeMutation(request(valid), services, 'http://localhost:3000')).status).toBe(401);
    });
    it('sends safe correction, overtime and critical notifications through one delivery service', async () => {
        const app = new TimeApplication(new MysqlTimeRepository(pool), async () => actor('team_lead'), now);
        const remark = await app.createRemark({ employeeId: eid(3), message: 'Private correction details', relatedRecord: { type: 'timesheet', workDate: date }, isCorrectionRequest: true, requestedChanges: 'Private description' });
        expect(remark.status, JSON.stringify(remark)).toBe('success');
        const id = await task('in_progress'); const self = new TimeApplication(new MysqlTimeRepository(pool), async () => actor(), now);
        const critical = await self.save({ ...log(id, 661), workDate: '2026-10-05' }); expect(critical.status).toBe('success');
        const events = await rows("SELECT notification_type,safe_payload FROM notifications WHERE notification_type IN('time.overtime','time.critical','time.correction.requested')");
        expect(new Set(events.map(e => e.notification_type))).toEqual(new Set(['time.overtime', 'time.critical', 'time.correction.requested']));
        expect(JSON.stringify(events)).not.toContain('Private');
        const recipients = await rows("SELECT recipient_user_id FROM notifications WHERE notification_type='time.critical'");
        expect(recipients.map(r => r.recipient_user_id)).toEqual(expect.arrayContaining([uid(2), uid(4)]));
    });
    it('never grants company-wide Team Lead rights from a forged role or unrelated lead scope', async () => {
        const id = await task();
        const outsider = new TaskWorkApplication(pool, async () => ({ ...actor('team_lead'), employeeId: eid(8), userId: uid(8) }), now);
        expect(await outsider.transition(move(id))).toEqual(await outsider.transition(move(randomUUID())));
        const noRole = new TaskWorkApplication(pool, async () => ({ ...actor(), roles: [] }), now);
        expect((await noRole.transition(move(id))).status).toBe('permission_denied');
    });
});
