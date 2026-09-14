import { randomUUID } from 'node:crypto';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import { success } from '@/contracts/results';
import { addDays, daysBetween } from '@/lib/format';
import { localParts } from '@/lib/calculation/instants';
import { hasPermission, indistinguishableNotFound } from '@/server/authorization/policy';
import { invalid, dateSchema } from '@/server/time/validation';
import { decode } from './repository';
import { AttendanceApplication } from './attendance';
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
                    const recipientIds = new Set<string>();
                    if (job.employee_id) {
                        const employee = await tx.employee(String(job.employee_id));
                        if (employee?.user_id)
                            recipientIds.add(String(employee.user_id));
                        if (String(job.kind).startsWith('request.') || job.kind === 'attendance.exception')
                            for (const assignment of await tx.assignments(String(job.employee_id), app.today()))
                                if (assignment.is_primary && assignment.lead_employee_id) {
                                    const lead = await tx.employee(String(assignment.lead_employee_id));
                                    if (lead?.user_id)
                                        recipientIds.add(String(lead.user_id));
                                }
                    }
                    if (job.kind === 'attendance.exception')
                        for (const hr of await tx.rows("SELECT DISTINCT ur.user_id FROM user_roles ur JOIN roles r ON r.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE r.role_key='hr_manager' AND u.status='active' AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?)", [app.today(), app.today()]))
                            recipientIds.add(String(hr.user_id));
                    for (const recipient of recipientIds)
                        await tx.execute('INSERT INTO notifications(id,recipient_user_id,notification_type,safe_payload,related_type,related_id,deduplication_key) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE deduplication_key=VALUES(deduplication_key)', [randomUUID(), recipient, String(job.kind), JSON.stringify({ title: 'A work-management record needs your attention.', href: job.kind === 'evaluation.published' ? '/evaluations' : '/notifications' }), 'hr', job.resource_id ? String(job.resource_id) : null, String(job.job_key)]);
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
