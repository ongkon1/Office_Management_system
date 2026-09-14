import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import type { Result } from '@/contracts/results';
import { HrRepository } from './repository';
import { RequestApplication } from './requests';
import { AttendanceApplication } from './attendance';
import { HolidayApplication } from './holidays';
import { EvaluationApplication, AREAS, DEFAULT_WEIGHTS, COMPETENCIES } from './evaluations';
import { HrJobs } from './jobs';
import { WorkloadPlanning } from './planning';
import { BackendHrViews } from './hr-views';
const eid = '40000000-0000-4000-8000-000000000003', leadId = '40000000-0000-4000-8000-000000000002', division = '10000000-0000-4000-8000-000000000001';
const employee: ActorPolicyContext = {
    userId: '30000000-0000-4000-8000-000000000003', employeeId: eid, roles: ['employee'], permissions: new Set(['organization.government.view']), divisionIds: new Set([division]), employeeIds: new Set([eid]), projectIds: new Set(), teamIds: new Set()
};
const lead: ActorPolicyContext = {
    ...employee, userId: '30000000-0000-4000-8000-000000000002', employeeId: leadId, roles: ['team_lead'], permissions: new Set(['organization.government.view', 'evaluation.private.view'])
};
const hr: ActorPolicyContext = {
    ...employee, userId: '30000000-0000-4000-8000-000000000004', employeeId: '40000000-0000-4000-8000-000000000004', roles: ['hr_manager'], permissions: new Set(['organization.government.view', 'evaluation.private.view', 'evaluation.weight.manage', 'hr.jobs.run'])
};
let db: Awaited<ReturnType<typeof createIsolatedDatabase>>, pool: Pool, repo: HrRepository, self: RequestApplication, review: RequestApplication, admin: RequestApplication;
let now = '2026-09-02T03:00:00Z';
function data<T>(r: Result<T>): T {
    expect(r.status, JSON.stringify(r)).toBe('success');
    if (r.status !== 'success')
        throw new Error(JSON.stringify(r));
    return r.data;
}
const wfh = (on: string) => ({
    wfhDate: on, portion: 'full_day', reason: 'Focused delivery', plannedTasks: 'Complete assigned work', divisionId: division, contactAvailability: 'Online during work hours', attachmentIds: []
});
const leave = (on: string, portion = 'full_day') => ({
    startDate: on, endDate: on, portion, leaveType: 'annual', reason: 'Personal leave', attachmentIds: []
});
beforeAll(async () => {
    db = await createIsolatedDatabase();
    await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8'));
    const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
    url.pathname = `/${db.name}`;
    pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 8 });
    // The core seed assigns a policy only to PowerInAI. HR reporting needs
    // an explicit company policy for the other demonstration employees too.
    await pool.execute('INSERT INTO work_policies(id,policy_version_id,effective_from) VALUES(?,?,?)', [randomUUID(), '60000000-0000-4000-8000-000000000001', '2026-01-01']);
    repo = new HrRepository(pool);
    self = new RequestApplication(repo, async () => employee, () => now);
    review = new RequestApplication(repo, async () => lead, () => now);
    admin = new RequestApplication(repo, async () => hr, () => now);
});
afterAll(async () => {
    await pool?.end();
    await db?.dispose();
});
describe('Phase 5 real database workflows', () => {
    it('WFH drafts, versions, submission and effective primary lead approval do not create hours', async () => {
        const created = data(await self.save('wfh', wfh('2026-10-05')));
        expect((await self.save('wfh', { ...wfh('2026-10-05'), reason: 'Changed' }, created.id, 99)).status).toBe('conflict');
        const edited = data(await self.save('wfh', { ...wfh('2026-10-05'), reason: 'Changed' }, created.id, created.version));
        data(await self.transition('wfh', edited.id, 'submit'));
        expect((await self.transition('wfh', edited.id, 'approved')).status).toBe('permission_denied');
        data(await review.transition('wfh', edited.id, 'approved'));
        const day = data(await new AttendanceApplication(self).day(eid, '2026-10-05'));
        expect(day).toMatchObject({ state: 'wfh', activeMinutes: 0, requiredActiveMinutes: 420 });
    });
    it('request details and list counts do not reveal other employees', async () => {
        const outsider = new RequestApplication(repo, async () => ({ ...employee, employeeId: leadId, roles: ['employee'] }), () => now);
        const own = data(await self.list('wfh')).find(r => 'wfhDate' in r && r.wfhDate === '2026-10-05')!;
        expect((await outsider.get('wfh', own.id)).status).toBe('not_found');
        expect(data(await outsider.list('wfh'))).toHaveLength(0);
    });
    it('reserves, consumes and releases exactly one half day of leave', async () => {
        const before = (await repo.balances(eid, 2026))[0];
        const r = data(await self.save('leave', leave('2026-10-06', 'half_day')));
        expect(r.requestedMinutes).toBe(210);
        data(await self.transition('leave', r.id, 'submit'));
        expect(Number((await repo.balances(eid, 2026))[0].reserved_minutes) - Number(before.reserved_minutes)).toBe(210);
        const decisions = await Promise.all([review.transition('leave', r.id, 'approved'), review.transition('leave', r.id, 'approved')]);
        expect(decisions.map(r => r.status).sort()).toEqual(['conflict', 'success']);
        const balance = (await repo.balances(eid, 2026))[0];
        expect(Number(balance.used_minutes) - Number(before.used_minutes)).toBe(210);
        expect(balance.reserved_minutes).toBe(before.reserved_minutes);
        const day = data(await new AttendanceApplication(self).day(eid, '2026-10-06'));
        expect(day.requiredActiveMinutes).toBe(210);
        expect(day.state).toBe('half_day_leave');
    });
    it('rejects overlaps, invalid dates and division assignments', async () => {
        const r = data(await self.save('leave', leave('2026-10-05')));
        expect((await self.transition('leave', r.id, 'submit')).status).toBe('validation_failure');
        expect((await self.save('wfh', wfh('not-a-date'))).status).toBe('validation_failure');
        expect((await self.save('wfh', { ...wfh('2026-10-07'), divisionId: randomUUID() })).status).toBe('validation_failure');
    });
    it('HR overrides require a reason and retain history', async () => {
        const r = data(await self.save('wfh', wfh('2026-10-07')));
        data(await self.transition('wfh', r.id, 'submit'));
        data(await review.transition('wfh', r.id, 'rejected', 'Not available'));
        expect((await admin.transition('wfh', r.id, 'approved', null, true)).status).toBe('validation_failure');
        data(await admin.transition('wfh', r.id, 'approved', 'Coverage confirmed', true));
        const history = await repo.history('wfh', r.id);
        expect(history).toHaveLength(4);
        await expect(pool.execute('DELETE FROM hr_workflow_history WHERE resource_id=?', [r.id])).rejects.toThrow();
    });
    it('concurrent submissions cannot overspend a balance', async () => {
        const [before] = await repo.balances(eid, 2026);
        await pool.execute('UPDATE leave_balances SET entitled_minutes=used_minutes+reserved_minutes+420 WHERE id=?', [String(before.id)]);
        const a = data(await self.save('leave', leave('2026-10-08'))), b = data(await self.save('leave', leave('2026-10-09')));
        const results = await Promise.all([self.transition('leave', a.id, 'submit'), self.transition('leave', b.id, 'submit')]);
        expect(results.map(r => r.status).sort()).toEqual(['success', 'validation_failure']);
        for (const r of [a, b]) {
            const current = await repo.request('leave', r.id);
            if (current?.state === 'pending')
                data(await self.transition('leave', r.id, 'cancel'));
        }
        await pool.execute('UPDATE leave_balances SET entitled_minutes=8400 WHERE id=?', [String(before.id)]);
    });
    it('company holidays remove missing-time requirements and reduce active weekly capacity', async () => {
        const holidays = new HolidayApplication(admin);
        data(await holidays.save({
            name: 'Company holiday', scope: 'company', divisionId: null, date: '2026-10-09', weekday: null, isActive: true
        }));
        const attendance = new AttendanceApplication(self);
        expect(data(await attendance.day(eid, '2026-10-09'))).toMatchObject({ state: 'holiday', requiredActiveMinutes: 0 });
        const week = data(await attendance.workload(eid, '2026-10-05'));
        expect(week.capacityMinutes).toBe(1470);
        expect(week.actualActiveMinutes).toBe(0);
    });
    it('weekly calendar changes are effective dated and preserve verified dates', async () => {
        const holidays = new HolidayApplication(admin);
        expect((await holidays.save({
            name: 'Old holiday', scope: 'company', divisionId: null, date: '2026-08-15', weekday: null, isActive: true
        })).status).toBe('conflict');
        data(await holidays.save({
            name: 'Weekly Thursday', scope: 'weekly', divisionId: null, date: null, weekday: 4, isActive: true, effectiveFrom: '2026-11-01', effectiveTo: '2026-11-30'
        }));
        const attendance = new AttendanceApplication(self);
        expect(data(await attendance.day(eid, '2026-11-05'))).toMatchObject({ state: 'weekly_off', requiredActiveMinutes: 0 });
        expect(data(await attendance.day(eid, '2026-10-08')).requiredActiveMinutes).toBe(420);
    });
    it('workload plans remain separate from active capacity and use configurable warnings', async () => {
        const attendance = new AttendanceApplication(admin), planning = new WorkloadPlanning(attendance);
        data(await planning.save({
            employeeId: eid, divisionId: division, projectId: null, weekStartDate: '2026-10-12', plannedMinutes: 2200
        }));
        let week = data(await attendance.workload(eid, '2026-10-12'));
        expect(week.capacityMinutes).toBe(2100);
        expect(week.plannedMinutes).toBe(2200);
        expect(week.actualActiveMinutes).toBe(0);
        expect(week.warning).toBe('overallocated');
        data(await planning.settings(80, 110));
        week = data(await attendance.workload(eid, '2026-10-12'));
        expect(week.warning).toBeNull();
        expect(data(await planning.calendar(eid, '2026-10-12')).days).toHaveLength(7);
    });
    it('information requests can be corrected and resubmitted without double reservation', async () => {
        const r = data(await self.save('leave', leave('2026-10-13')));
        data(await self.transition('leave', r.id, 'submit'));
        const info = data(await review.transition('leave', r.id, 'information_requested', 'Clarify the reason'));
        const before = Number((await repo.balances(eid, 2026))[0].reserved_minutes);
        const draft = data(await self.save('leave', { ...leave('2026-10-13'), reason: 'Clarified' }, r.id, info.version));
        expect(Number((await repo.balances(eid, 2026))[0].reserved_minutes)).toBe(before - 420);
        data(await self.transition('leave', draft.id, 'submit'));
        expect(Number((await repo.balances(eid, 2026))[0].reserved_minutes)).toBe(before);
        data(await self.transition('leave', draft.id, 'cancel'));
    });
    it('full-day leave is exempt and absence/duty remains distinct from missing time', async () => {
        const r = data(await self.save('leave', leave('2026-10-14')));
        data(await self.transition('leave', r.id, 'submit'));
        data(await review.transition('leave', r.id, 'approved'));
        const attendance = new AttendanceApplication(admin);
        expect(data(await attendance.day(eid, '2026-10-14'))).toMatchObject({ state: 'approved_leave', requiredActiveMinutes: 0 });
        data(await attendance.duty(eid, '2026-10-15', 'training_duty', 'Approved training'));
        expect(data(await attendance.day(eid, '2026-10-15')).state).toBe('training_duty');
        data(await attendance.duty(eid, '2026-10-16', 'absent', 'Confirmed absence'));
        expect(data(await attendance.day(eid, '2026-10-16')).state).toBe('absent');
    });
    it('an audit failure rolls back a request and its workflow history', async () => {
        const failing = new HrRepository(pool);
        failing.transaction = work => repo.transaction(tx => {
            tx.record = async () => {
                throw new Error('Injected audit outage');
            };
            return work(tx);
        });
        const app = new RequestApplication(failing, async () => employee, () => now);
        expect((await app.save('wfh', wfh('2026-10-19'))).status).toBe('error');
        expect((await repo.requests('wfh')).some(r => 'wfhDate' in r && r.wfhDate === '2026-10-19')).toBe(false);
    });
    it('publication protects reviewer content and preserves weighted results', async () => {
        const hrEval = new EvaluationApplication(admin), selfEval = new EvaluationApplication(self), leadEval = new EvaluationApplication(review);
        const period = data(await hrEval.createPeriod({
            name: 'October review', type: 'monthly', startDate: '2026-10-05', endDate: '2026-10-09', dueDate: '2026-10-15', weightingVersion: 1, isOpen: true
        }));
        const e = data(await hrEval.assign(period.id, eid, leadId));
        expect(e.facts.requiredActiveMinutes).toBe(1470);
        const selfInput = {
            achievements: 'Delivered', completedProjects: 'CRM', challenges: 'Scheduling', skills: 'Testing', trainingNeeds: 'Security', goals: 'Reliable delivery', supportRequired: 'Review time', submittedAt: null
        };
        const competing = await Promise.all([selfEval.change(e.id, 'save_self', selfInput, e.version), selfEval.change(e.id, 'save_self', selfInput, e.version)]);
        expect(competing.map(r => r.status).sort()).toEqual(['conflict', 'success']);
        data(await selfEval.change(e.id, 'submit_self'));
        const scores = AREAS.map(area => ({ area, score: 4, comment: 'Observed evidence', competencies: COMPETENCIES[area].map(key => ({ area: key, score: 4, comment: 'Observed evidence' })) }));
        data(await leadEval.change(e.id, 'save_scores', { scores: scores.map(s => ({ ...s, competencies: [] })), summary: 'Incomplete evidence' }, data(await leadEval.get(e.id)).version));
        expect((await leadEval.change(e.id, 'submit_review')).status).toBe('validation_failure');
        data(await leadEval.change(e.id, 'save_scores', { scores, summary: 'Solid delivery' }, data(await leadEval.get(e.id)).version));
        expect(data(await selfEval.get(e.id)).reviewerScores).toBe('restricted');
        expect(data(await selfEval.get(e.id)).weightedScore).toBe('restricted');
        data(await leadEval.change(e.id, 'submit_review'));
        const results = await Promise.all([hrEval.change(e.id, 'publish'), hrEval.change(e.id, 'publish')]);
        expect(results.map(r => r.status).sort()).toEqual(['conflict', 'success']);
        expect(data(await selfEval.get(e.id)).weightedScore).toBe(4);
        data(await hrEval.versionWeights({ version: 2, effectiveFrom: '2026-11-01', weights: { ...DEFAULT_WEIGHTS, task_completion: 25, work_quality: 30 } }));
        expect(data(await selfEval.get(e.id)).weightingVersion).toBe(1);
        expect((await leadEval.change(e.id, 'save_scores', { scores, summary: 'Changed' })).status).toBe('conflict');
    });
    it('private evaluation reads are denied without the separate grant', async () => {
        const noGrant = new EvaluationApplication(new RequestApplication(repo, async () => ({ ...hr, permissions: new Set(['organization.government.view']) }), () => now));
        expect(data(await noGrant.list())).toHaveLength(0);
    });
    it('HR view models reconcile attendance and cannot impersonate a different user', async () => {
        const views = new BackendHrViews(admin, new AttendanceApplication(admin), new HolidayApplication(admin), new EvaluationApplication(admin));
        const attendance = data(await views.getAttendance(hr.userId, '2026-10-05', '2026-10-09'));
        expect(attendance.rows.find(r => r.employee.id === eid)?.days.reduce((n, d) => n + d.requiredActive.minutes, 0)).toBe(1470);
        expect((await views.getAttendance(employee.userId, '2026-10-05', '2026-10-09')).status).toBe('not_found');
        const requests = data(await views.listRequests(hr.userId, 'wfh'));
        expect(requests.some(r => r.state === 'approved')).toBe(true);
        expect(data(await views.listEvaluations(hr.userId)).some(r => r.state === 'published')).toBe(true);
    });
    it('invalid reviewer assignment rolls back a combined period creation', async () => {
        const views = new BackendHrViews(admin, new AttendanceApplication(admin), new HolidayApplication(admin), new EvaluationApplication(admin));
        const before = (await repo.periods()).length;
        const r = await views.createEvaluationPeriod(hr.userId, {
            name: 'Invalid assignment', type: 'monthly', startDate: '2026-11-01', endDate: '2026-11-30', dueDate: '2026-12-05', employeeIds: [eid], reviewerByEmployeeId: { [eid]: randomUUID() }
        });
        expect(r.status).toBe('not_found');
        expect(await repo.periods()).toHaveLength(before);
    });
    it('request mutations redact attachment metadata as well as reads', async () => {
        const created = data(await self.save('wfh', wfh('2026-11-02')));
        expect(created.attachmentIds).toBe('restricted');
        expect(data(await self.transition('wfh', created.id, 'submit')).attachmentIds).toBe('restricted');
        expect(data(await review.transition('wfh', created.id, 'approved')).attachmentIds).toBe('restricted');
    });
    it('draft time cannot establish a duty location or active attendance', async () => {
        const id = randomUUID();
        await pool.execute(`INSERT INTO time_entries(id,employee_id,work_date,division_id,policy_version_id,timezone,entry_method,work_location,active_minutes,work_description,completed_work,status,created_by_user_id)
            VALUES(?,?,?,?,?,'Asia/Dhaka','manual_duration','official_travel',60,'Draft travel','', 'draft',?)`,
            [id, eid, '2026-11-03', division, '60000000-0000-4000-8000-000000000001', employee.userId]);
        const day = data(await new AttendanceApplication(self).day(eid, '2026-11-03'));
        expect(day).toMatchObject({ state: 'missing_timesheet', activeMinutes: 0, workLocation: null });
    });
    it('a closed evaluation period prevents self edits and can be reopened', async () => {
        const app = new EvaluationApplication(admin);
        const period = data(await app.createPeriod({ name: 'November review', type: 'probation', startDate: '2026-11-02', endDate: '2026-11-06', dueDate: '2026-11-10', weightingVersion: 2, isOpen: true }));
        const e = data(await app.assign(period.id, eid, leadId));
        data(await app.setPeriodOpen(period.id, false));
        expect((await new EvaluationApplication(self).change(e.id, 'save_self', {}, e.version)).status).toBe('conflict');
        expect(data(await app.setPeriodOpen(period.id, true)).isOpen).toBe(true);
    });
    it('scheduled detection is repeatable without duplicate notifications or leave/holiday missing exceptions', async () => {
        now = '2026-10-10T03:00:00Z';
        const jobs = new HrJobs(new AttendanceApplication(admin));
        data(await jobs.run('2026-10-05', '2026-10-09'));
        const [before] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) n FROM notifications');
        data(await jobs.run('2026-10-05', '2026-10-09'));
        const [after] = await pool.query<RowDataPacket[]>('SELECT COUNT(*) n FROM notifications');
        expect(after[0].n).toBe(before[0].n);
        const [holiday] = await pool.query<RowDataPacket[]>("SELECT * FROM hr_jobs WHERE employee_id=? AND job_key LIKE 'exception:%2026-10-09:missing'", [eid]);
        expect(holiday).toHaveLength(0);
    });
});
