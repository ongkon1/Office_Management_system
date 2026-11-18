import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { success } from '@/contracts/results';
import { addDays, daysBetween } from '@/lib/format';
import { localParts } from '@/lib/calculation/instants';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { invalid, dateSchema } from '@/server/time/validation';
import { decode } from './repository';
import { AttendanceApplication } from './attendance';
import type { HrRepository } from './repository';
import { NotificationService } from '@/server/notifications/service';
import type { RelatedRecord } from '@/server/notifications/catalogue';
import type { NotificationType } from '@/contracts/domain';
import { leadsOfEmployee } from '@/server/organization/department-authority';
export class HrJobs {
    constructor(readonly attendance: AttendanceApplication) {
    }
    run(from: string, to: string) {
        const app = this.attendance.requests;
        return app.run(() => app.repository.transaction(async (tx) => {
            const actor = await app.resolveActor(app.today());
            if (!actor || !hasPermission(actor, 'hr.jobs.run') || !hasPermission(actor, 'organization.government.view') || actor.roles.includes('management'))
                return indistinguishableNotFound();
            if (!dateSchema.safeParse(from).success || !dateSchema.safeParse(to).success || to < from || to >= app.today() || daysBetween(from, to) > 366)
                return invalid('dateRange', 'Process a completed date range of at most 367 days.');
            await this.attendance.processMissing(tx, from, to);
            const jobs = await tx.rows("SELECT * FROM hr_jobs WHERE status='pending' AND due_at<=? ORDER BY due_at,id LIMIT 250 FOR UPDATE", [new Date(app.now())]);
            for (const job of jobs) {
                if (job.kind === 'calendar.recalculate') {
                    const payload = decode<{
                        from: string;
                        to: string | null;
                    }>(job.payload, { from, to });
                    const until = payload.to && payload.to < app.today() ? payload.to : app.today();
                    if (payload.from <= until)
                        await app.recalculate(tx, String(job.employee_id), payload.from, until);
                }
                else {
                    if (job.kind === 'evaluation.reminder') {
                        const evaluation = (await tx.evaluations()).find(e => e.id === job.resource_id);
                        if (!evaluation || evaluation.state === 'published') {
                            await tx.execute("UPDATE hr_jobs SET status='complete',completed_at=UTC_TIMESTAMP(6) WHERE id=?", [String(job.id)]);
                            continue;
                        }
                    }
                    await notifyForJob(tx, job, app.today());
                }
                await tx.execute("UPDATE hr_jobs SET status='complete',completed_at=UTC_TIMESTAMP(6) WHERE id=?", [String(job.id)]);
            }
            return success({ processed: jobs.length, from, to });
        }));
    }
}
/** The host supplies a trusted service identity with hr.jobs.run; never a payload actor. */
export async function startHrScheduler(jobs: HrJobs, connection: ConnectionOptions) {
    const queue = new Queue('office-hr', { connection });
    await queue.upsertJobScheduler('daily-exceptions', { pattern: '0 1 * * *', tz: 'Asia/Dhaka' }, { name: 'daily' });
    await queue.upsertJobScheduler('monthly-exceptions', { pattern: '0 2 1 * *', tz: 'Asia/Dhaka' }, { name: 'monthly' });
    const worker = new Worker('office-hr', async (job) => {
        const { from, to } = scheduledWindow(new Date(job.timestamp).toISOString(), job.name === 'monthly');
        const result = await jobs.run(from, to);
        if (result.status !== 'success')
            throw new Error('HR processing did not complete');
        return result.data;
    }, { connection });
    return { queue, worker, async close() {
            await worker.close();
            await queue.close();
        } };
}
export function scheduledWindow(scheduledAt: string, monthly: boolean) {
    const scheduledDate = localParts(scheduledAt, 'Asia/Dhaka').date;
    const to = addDays(scheduledDate, -1);
    return { from: monthly ? `${to.slice(0, 7)}-01` : to, to };
}

const EXCEPTION_TYPE: Readonly<Record<string, NotificationType>> = {
    missing: 'missing_time', under_time: 'under_time', overtime: 'overtime', critical: 'critical_time',
};
/**
 * `BE-0702`. One HR job becomes notifications through the shared service, so
 * every recipient is authorized individually, deduplicated by the job key and
 * offered email only when they opted in. Leads come from the department-aware
 * resolver, never the frozen legacy column.
 */
async function notifyForJob(tx: HrRepository, job: Record<string, unknown>, today: string) {
    const db = tx.connection ?? tx.pool;
    const notifications = new NotificationService(db);
    const kind = String(job.kind);
    const employeeId = job.employee_id ? String(job.employee_id) : null;
    const resourceId = job.resource_id ? String(job.resource_id) : null;
    const occurrenceKey = String(job.job_key);
    const payload = decode<{ date?: string; status?: string; kind?: 'wfh' | 'leave'; state?: string }>(job.payload, {});
    const leadsOf = async (id: string, on: string) => leadsOfEmployee(db, id, on);
    const hrUsers = async () => (await tx.rows("SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE r.role_key='hr_manager' AND u.status='active' AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)", [today, today])).map(r => String(r.user_id));
    if (kind === 'attendance.exception' && employeeId && payload.date && payload.status && EXCEPTION_TYPE[payload.status]) {
        const related: RelatedRecord = { type: 'timesheet', employeeId, date: payload.date };
        const type = EXCEPTION_TYPE[payload.status];
        await notifications.notifyEmployees([employeeId, ...await leadsOf(employeeId, payload.date)], { type, related, occurrenceKey });
        // HR follows missing records and overtime (`REQ-NOT-003`); under-time stays with the team.
        if (type !== 'under_time') await notifications.notify({ recipientUserIds: await hrUsers(), type, related, occurrenceKey });
        return;
    }
    if ((kind === 'evaluation.reminder' || kind === 'evaluation.published') && employeeId && resourceId) {
        await notifications.notifyEmployees([employeeId], {
            type: kind === 'evaluation.reminder' ? 'evaluation_due' : 'evaluation_published',
            related: { type: 'evaluation', id: resourceId }, occurrenceKey,
        });
        return;
    }
    if (kind.startsWith('request.') && employeeId && resourceId && (payload.kind === 'wfh' || payload.kind === 'leave')) {
        const related: RelatedRecord = { type: 'request', kind: payload.kind, id: resourceId };
        const state = kind.slice('request.'.length);
        if (state === 'submitted') {
            await notifications.notifyEmployees(await leadsOf(employeeId, today), { type: 'request_submitted', related, occurrenceKey });
        } else if (['approved', 'rejected', 'information_requested'].includes(state)) {
            await notifications.notifyEmployees([employeeId], { type: payload.kind === 'wfh' ? 'wfh_decision' : 'leave_decision', related, occurrenceKey });
        }
    }
}
