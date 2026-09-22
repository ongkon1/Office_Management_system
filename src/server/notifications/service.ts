import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { hasPermission } from '@/server/authorization/policy';
import { localParts } from '@/lib/calculation/instants';
import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

export type NotificationExecutor = Pick<Pool | PoolConnection, 'execute'>;
/** Shared Phase 7 delivery foundation. Call with the mutation's transaction connection.
 * Text is a fixed template: never interpolate task titles, remarks, names or money.
 * Opening the related resource must go through its authenticated service boundary.
 */
export class NotificationService {
    constructor(private readonly db: NotificationExecutor) {}
    async send(input: { employeeIds: readonly string[]; type: string; resourceType: 'task' | 'timesheet'; resourceId: string; eventKey: string }) {
        for (const employeeId of new Set(input.employeeIds)) {
            const [recipients] = await this.db.execute<RowDataPacket[]>("SELECT u.id FROM employees e JOIN users u ON u.id=e.user_id WHERE e.id=? AND e.status='active' AND u.status='active'", [employeeId]);
            for (const recipient of recipients) {
                if (input.resourceType === 'task') {
                    const [tasks] = await this.db.execute<RowDataPacket[]>('SELECT d.is_government,t.estimated_minutes FROM tasks t JOIN projects p ON p.id=t.project_id JOIN divisions d ON d.id=p.division_id WHERE t.id=?', [input.resourceId]);
                    const actor = await loadActorPolicyContext(this.db, String(recipient.id), localParts(new Date().toISOString(), 'Asia/Dhaka').date);
                    if (!tasks.length || !actor || (tasks[0].is_government && !hasPermission(actor, 'organization.government.view'))) continue;
                    if (input.type === 'significant_variance') {
                        const [logs] = await this.db.execute<RowDataPacket[]>("SELECT t.employee_id,t.division_id,t.active_minutes,d.is_government FROM time_entries t JOIN divisions d ON d.id=t.division_id WHERE t.task_id=? AND t.is_active=TRUE AND t.status<>'draft'", [input.resourceId]);
                        const visible = logs.filter(log => (!log.is_government || hasPermission(actor, 'organization.government.view')) && (actor.employeeId === log.employee_id || actor.roles.includes('super_admin') || actor.roles.includes('hr_manager') || (hasPermission(actor, 'time.team.read') && actor.employeeIds.has(String(log.employee_id)) && actor.divisionIds.has(String(log.division_id)))));
                        // D6 matches the frontend: flag positive variance, never cap work.
                        if (visible.reduce((total, log) => total + Number(log.active_minutes), 0) <= Number(tasks[0].estimated_minutes ?? 0)) continue;
                    }
                }
                await this.db.execute("INSERT INTO notifications(id,recipient_user_id,notification_type,safe_payload,related_type,related_id,deduplication_key) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE deduplication_key=deduplication_key", [randomUUID(), recipient.id, input.type, JSON.stringify({ message: 'A work record has an update. Open it to view the details available to you.' }), input.resourceType, input.resourceId, createHash('sha256').update(`${input.type}:${input.eventKey}`).digest('hex')]);
            }
        }
    }
    async timeEvent(type: string, eventKey: string, employeeId: string, date: string) {
        const [rows] = await this.db.execute<RowDataPacket[]>(`SELECT DISTINCT e.id FROM employees e WHERE e.id=? OR e.id IN (SELECT lead_employee_id FROM employee_division_assignments WHERE employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)) OR EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=e.user_id AND r.role_key='hr_manager' AND ur.effective_from<=? AND (ur.effective_to IS NULL OR ur.effective_to>=?))`, [employeeId, employeeId, date, date, date, date]);
        const [entries] = await this.db.execute<RowDataPacket[]>("SELECT DISTINCT t.division_id,d.is_government FROM time_entries t JOIN divisions d ON d.id=t.division_id WHERE t.employee_id=? AND t.work_date=? AND t.is_active=TRUE AND t.status<>'draft'", [employeeId, date]);
        const recipients: string[] = [];
        for (const row of rows) {
            const [users] = await this.db.execute<RowDataPacket[]>('SELECT user_id FROM employees WHERE id=?', [row.id]);
            const actor = users[0] ? await loadActorPolicyContext(this.db, String(users[0].user_id), date) : null;
            if (!actor || entries.some(e => (e.is_government && !hasPermission(actor, 'organization.government.view')) || !(actor.employeeId === employeeId || actor.roles.includes('super_admin') || actor.roles.includes('hr_manager') || (actor.employeeIds.has(employeeId) && actor.divisionIds.has(String(e.division_id)))))) continue;
            recipients.push(String(row.id));
        }
        await this.send({ employeeIds: recipients, type, resourceType: 'timesheet', resourceId: employeeId, eventKey });
    }
}
