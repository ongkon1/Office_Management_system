import { createHash, randomUUID } from 'node:crypto';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RoleKey, TaskStatus } from '@/contracts/domain';
import { taskAcceptsTime } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { canTransition, transitionRequiresNote, type TaskTransitionInput, type TaskStatusTransition, type TaskHistoryView, type TaskHistoryItemView } from '@/contracts/task-transition';
import { hasPermission, indistinguishableNotFound, type ActorPolicyContext } from '@/server/authorization/policy';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import { TimeApplication, isHistorical } from '@/server/time/application';
import type { ActorResolver } from '@/server/time/application';
import { conflict, invalid } from '@/server/time/validation';
import { NotificationService } from '@/server/notifications/service';
import { localParts } from '@/lib/calculation/instants';
import { formatDate, formatDurationDelta, formatTimeRange } from '@/lib/format';
import { toDurationView, WORK_LOCATION_LABEL } from '@/lib/status';
import { transitionInputSchema, assignmentInputSchema } from './validation';

type TaskRow = RowDataPacket & { id: string; project_id: string; division_id: string; assignee_employee_id: string; status: TaskStatus; review_state: 'not_required' | 'approved' | 'pending_review' | 'rejected'; version: number; estimated_minutes: number; title: string; is_active: number; project_active: number; accepts_time_entries: number; is_government: number; completed_at: Date | null };
const missing = () => indistinguishableNotFound('task');
const denied = () => ({ status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message: 'You cannot change this task.' });
const unauthenticated = () => ({ status: 'unauthenticated' as const, code: 'UNAUTHENTICATED' as const, message: 'Sign in to continue.', reason: 'no_session' as const });
const stamp = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const hash = (input: unknown) => createHash('sha256').update(JSON.stringify(input)).digest('hex');

/** Workflow state is persisted separately from work duration. No transition calls time.save/refresh. */
export class TaskWorkApplication {
    constructor(private readonly pool: Pool, readonly resolveActor: ActorResolver, readonly now = () => new Date().toISOString()) {}
    private async transaction<T>(work: (db: PoolConnection, time: MysqlTimeRepository) => Promise<Result<T>>): Promise<Result<T>> {
        let db: PoolConnection | undefined;
        try {
            db = await this.pool.getConnection(); await db.beginTransaction();
            const result = await work(db, new MysqlTimeRepository(this.pool, db));
            if (result.status === 'success') await db.commit(); else await db.rollback();
            return result;
        } catch { if (db) await db.rollback(); return { status: 'error', code: 'DEPENDENCY_FAILED', message: 'The task operation could not be completed.', retryable: true }; }
        finally { db?.release(); }
    }
    private async task(db: PoolConnection, id: string, lock = false) {
        const [rows] = await db.execute<TaskRow[]>(`SELECT t.*,p.division_id,p.is_active project_active,p.accepts_time_entries,d.is_government FROM tasks t JOIN projects p ON p.id=t.project_id JOIN divisions d ON d.id=p.division_id WHERE t.id=? ${lock ? 'FOR UPDATE' : ''}`, [id]);
        return rows[0] ?? null;
    }
    private async scope(db: PoolConnection, actor: ActorPolicyContext, task: TaskRow, date: string) {
        if (task.is_government && !hasPermission(actor, 'organization.government.view')) return { read: false, lead: false, own: false, activeOwn: false };
        const [members] = await db.execute<RowDataPacket[]>('SELECT employee_id FROM task_members WHERE task_id=?', [task.id]);
        const own = actor.employeeId !== null && (actor.employeeId === task.assignee_employee_id || members.some(r => r.employee_id === actor.employeeId));
        const [leads] = await db.execute<RowDataPacket[]>('SELECT id FROM employee_division_assignments WHERE employee_id=? AND division_id=? AND lead_employee_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)', [task.assignee_employee_id, task.division_id, actor.employeeId, date, date]);
        const [placements] = await db.execute<RowDataPacket[]>('SELECT id FROM employee_division_assignments WHERE employee_id=? AND division_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)', [actor.employeeId, task.division_id, date, date]);
        const activeOwn = own && placements.length > 0;
        const lead = actor.roles.includes('team_lead') && (leads.length > 0 || activeOwn);
        const read = own || lead || actor.roles.includes('super_admin') || (actor.roles.includes('hr_manager') && hasPermission(actor, 'time.verified.read')) || (actor.roles.includes('management') && actor.projectIds.has(task.project_id) && actor.divisionIds.has(task.division_id));
        return { read, lead, own, activeOwn };
    }
    private async notify(db: PoolConnection, task: TaskRow, date: string, type: string, eventKey: string) {
        const [leads] = await db.execute<RowDataPacket[]>('SELECT lead_employee_id FROM employee_division_assignments WHERE employee_id=? AND division_id=? AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)', [task.assignee_employee_id, task.division_id, date, date]);
        await new NotificationService(db).send({ employeeIds: [task.assignee_employee_id, ...leads.map(r => String(r.lead_employee_id))], type, resourceType: 'task', resourceId: task.id, eventKey });
    }
    async transition(input: TaskTransitionInput): Promise<Result<TaskStatusTransition>> {
        const parsed = transitionInputSchema.safeParse(input);
        if (!parsed.success) { const issue = parsed.error.issues[0]; return invalid(issue.path.join('.'), issue.message); }
        const command = parsed.data;
        return this.transaction(async (db, time) => {
            const changedAt = this.now(); const date = localParts(changedAt, 'Asia/Dhaka').date;
            const actor = await this.resolveActor(date); if (!actor) return unauthenticated();
            // Same order as work-log saves: global time guard, then task. Prevents a
            // completion racing between log eligibility validation and insertion.
            await time.lockPeriods();
            const task = await this.task(db, command.taskId, true); if (!task) return missing();
            const scope = await this.scope(db, actor, task, date); if (!scope.read) return missing();
            if (actor.roles.includes('management')) return denied();
            const role: RoleKey | null = scope.lead ? 'team_lead' : actor.roles.includes('super_admin') ? 'super_admin' : scope.activeOwn && actor.roles.some(r => ['employee', 'team_lead', 'hr_manager'].includes(r)) ? 'employee' : null;
            if (!role) return denied();
            const payload = { taskId: command.taskId, fromStatus: command.fromStatus, toStatus: command.toStatus, note: command.note, expectedVersion: command.expectedVersion };
            const replay = await time.replay(actor.userId, 'task.transition', command.idempotencyKey);
            if (replay) return replay.hash === hash(payload) ? replay.result as Result<TaskStatusTransition> : conflict('This retry key was used for a different transition.');
            if (!task.is_active || !task.project_active || !task.accepts_time_entries) return invalid('taskId', 'Choose an active task in an active project.');
            if (Number(task.version) !== command.expectedVersion || task.status !== command.fromStatus) return conflict();
            if (!canTransition(task.status, command.toStatus, role)) return invalid('toStatus', 'Choose an allowed transition for your task role.', 'TRANSITION_NOT_ALLOWED');
            if (transitionRequiresNote(task.status, command.toStatus) && !command.note) return invalid('note', task.status === 'completed' ? 'Explain why this task is being reopened.' : 'Explain why this pending task is being completed.', 'TRANSITION_NOTE_REQUIRED');
            if (!taskAcceptsTime({ status: 'in_progress', reviewState: task.review_state })) return invalid('taskId', 'Wait for Team Lead review before starting or completing this task.', 'TASK_AWAITING_REVIEW');
            const transition: TaskStatusTransition = { id: randomUUID(), taskId: task.id, fromStatus: task.status, toStatus: command.toStatus, actor: { userId: actor.userId, displayName: 'Team member' }, actorRole: role, changedAt, note: command.note, idempotencyKey: command.idempotencyKey };
            await db.execute('INSERT INTO task_status_transitions(id,task_id,from_status,to_status,actor_user_id,changed_at_utc,note,idempotency_key,task_version) VALUES(?,?,?,?,?,?,?,?,?)', [transition.id, task.id, task.status, command.toStatus, actor.userId, new Date(changedAt), command.note, command.idempotencyKey, Number(task.version) + 1]);
            await db.execute('UPDATE tasks SET status=?,completed_at=?,version=version+1 WHERE id=? AND version=?', [command.toStatus, command.toStatus === 'completed' ? new Date(changedAt) : null, task.id, command.expectedVersion]);
            await time.audit({ actorUserId: actor.userId, action: 'task.transition', resourceType: 'task_transition', resourceId: transition.id, employeeId: task.assignee_employee_id, before: { taskId: task.id, status: task.status, completedAt: task.completed_at }, after: transition, reason: command.note, correlationId: randomUUID() });
            const type = command.toStatus === 'completed' ? 'task_completed' : task.status === 'completed' ? 'task_reopened' : 'task_started';
            await this.notify(db, task, date, type, transition.id);
            if (command.toStatus === 'completed') await this.notify(db, task, date, 'significant_variance', transition.id);
            const result = success(transition); await time.remember(actor.userId, 'task.transition', command.idempotencyKey, hash(payload), result); return result;
        });
    }
    async assign(input: { taskId: string; assigneeEmployeeId: string; expectedVersion: number; idempotencyKey: string }): Promise<Result<{ taskId: string; version: number }>> {
        const parsed = assignmentInputSchema.safeParse(input); if (!parsed.success) { const issue = parsed.error.issues[0]; return invalid(issue.path.join('.'), issue.message); }
        return this.transaction(async (db, time) => {
            const date = localParts(this.now(), 'Asia/Dhaka').date; const actor = await this.resolveActor(date); if (!actor) return unauthenticated();
            await time.lockPeriods(); const task = await this.task(db, input.taskId, true); if (!task) return missing();
            const scope = await this.scope(db, actor, task, date); if (!scope.read) return missing();
            if (actor.roles.includes('management') || !(scope.lead || actor.roles.includes('super_admin'))) return denied();
            const [placements] = await db.execute<RowDataPacket[]>("SELECT a.id FROM employee_division_assignments a JOIN employees e ON e.id=a.employee_id WHERE a.employee_id=? AND a.division_id=? AND e.status='active' AND a.is_active=TRUE AND a.effective_from<=? AND (a.effective_to IS NULL OR a.effective_to>=?) AND (? OR a.lead_employee_id=? OR a.employee_id=?)", [input.assigneeEmployeeId, task.division_id, date, date, actor.roles.includes('super_admin'), actor.employeeId, actor.employeeId]);
            if (!placements.length) return missing();
            const replay = await time.replay(actor.userId, 'task.assign', input.idempotencyKey);
            if (replay) return replay.hash === hash(parsed.data) ? replay.result as Result<{ taskId: string; version: number }> : conflict();
            if (Number(task.version) !== input.expectedVersion) return conflict();
            if (!task.is_active || !task.project_active) return invalid('taskId', 'Choose an active task and project.');
            await db.execute('UPDATE tasks SET assignee_employee_id=?,version=version+1 WHERE id=?', [input.assigneeEmployeeId, task.id]);
            await time.audit({ actorUserId: actor.userId, action: 'task.assignment.changed', resourceType: 'task', resourceId: task.id, employeeId: input.assigneeEmployeeId, before: { assigneeEmployeeId: task.assignee_employee_id }, after: { assigneeEmployeeId: input.assigneeEmployeeId }, correlationId: randomUUID() });
            if (task.assignee_employee_id !== input.assigneeEmployeeId) await this.notify(db, { ...task, assignee_employee_id: input.assigneeEmployeeId }, date, task.assignee_employee_id ? 'task_reassigned' : 'task_assigned', `${task.id}:${Number(task.version) + 1}`);
            const result = success({ taskId: task.id, version: Number(task.version) + 1 }); await time.remember(actor.userId, 'task.assign', input.idempotencyKey, hash(parsed.data), result); return result;
        });
    }
    async history(taskId: string): Promise<Result<TaskHistoryView>> {
        return this.transaction(async (db, time) => {
            const date = localParts(this.now(), 'Asia/Dhaka').date; const actor = await this.resolveActor(date); if (!actor) return unauthenticated();
            const task = await this.task(db, taskId); if (!task || !(await this.scope(db, actor, task, date)).read) return missing();
            const [rows] = await db.execute<RowDataPacket[]>("SELECT tr.*,a.after_protected FROM task_status_transitions tr LEFT JOIN audit_events a ON a.resource_id=tr.id AND a.action='task.transition' WHERE tr.task_id=? ORDER BY tr.changed_at_utc,tr.id", [taskId]);
            const items: TaskHistoryItemView[] = rows.map(r => {
                const recorded = typeof r.after_protected === 'string' ? JSON.parse(r.after_protected) : r.after_protected;
                return { kind: 'transition', transition: { id: String(r.id), taskId, fromStatus: r.from_status, toStatus: r.to_status, actor: { userId: String(r.actor_user_id), displayName: 'Team member' }, actorRole: recorded?.actorRole ?? 'employee', changedAt: stamp(r.changed_at_utc), note: r.note ?? null, idempotencyKey: String(r.idempotency_key) } };
            });
            const [ids] = await db.execute<RowDataPacket[]>("SELECT id FROM time_entries WHERE task_id=? AND is_active=TRUE AND status<>'draft' ORDER BY work_date,id", [taskId]);
            const days = new Map<string, { minutes: number; ids: string[] }>(); let actualMinutes = 0;
            const access = new TimeApplication(time, this.resolveActor, this.now);
            for (const { id } of ids) {
                const entry = await time.entry(String(id)); if (!entry) continue;
                const context = await time.context(entry.employeeId, entry.workDate); if (!context) continue;
                if (!access.visible(actor, context, entry)) continue;
                actualMinutes += entry.activeMinutes;
                const day = days.get(entry.workDate) ?? { minutes: 0, ids: [] }; day.minutes += entry.activeMinutes; day.ids.push(entry.id); days.set(entry.workDate, day);
                if (isHistorical(entry)) items.push({ kind: 'historical_clock_entry', historicalEntry: { id: entry.id, workDate: entry.workDate, workDateLabel: formatDate(entry.workDate), timeRangeLabel: entry.startTime && entry.endTime ? formatTimeRange(entry.startTime, entry.endTime) : 'Historical duration', duration: toDurationView(entry.activeMinutes), completedWork: entry.completedWork, createdAt: entry.createdAt } });
                else {
                    const division = context.divisions.find(d => d.id === entry.divisionId)!;
                    const project = context.projects.find(p => p.id === entry.projectId);
                    // References use the already-authorized task/project, not hidden group labels.
                    const [projectRows] = project ? [[]] : await db.execute<RowDataPacket[]>('SELECT name,project_code FROM projects WHERE id=?', [entry.projectId]);
                    items.push({ kind: 'work_log', workLog: { id: entry.id, version: entry.version, employeeId: entry.employeeId, workDate: entry.workDate, workDateLabel: formatDate(entry.workDate), division: { id: division.id, name: division.name, code: division.code }, project: { id: entry.projectId!, name: project?.name ?? String(projectRows[0]?.name), code: project?.code ?? String(projectRows[0]?.project_code) }, task: { id: taskId, title: task.title }, duration: toDurationView(entry.activeMinutes), workLocation: entry.workLocation, workLocationLabel: WORK_LOCATION_LABEL[entry.workLocation], workDescription: entry.workDescription, completedWork: entry.completedWork, supportingLink: entry.supportingLink, attachmentCount: hasPermission(actor, 'file.protected.view') ? entry.attachmentIds.length : 'restricted', source: entry.source ?? 'manual', state: entry.state, createdAt: entry.createdAt, createdBy: entry.createdBy, canEdit: actor.employeeId === entry.employeeId && !actor.roles.includes('management') && !['verified','amended'].includes(context.period?.status ?? '') && entry.state !== 'locked', canDelete: actor.employeeId === entry.employeeId && !actor.roles.includes('management') && !['verified','amended'].includes(context.period?.status ?? '') && entry.state !== 'locked' } });
                }
            }
            const itemStamp = (item: TaskHistoryItemView) => item.kind === 'transition' ? item.transition.changedAt : item.kind === 'work_log' ? item.workLog.createdAt : item.historicalEntry.createdAt;
            const itemId = (item: TaskHistoryItemView) => item.kind === 'transition' ? item.transition.id : item.kind === 'work_log' ? item.workLog.id : item.historicalEntry.id;
            items.sort((a, b) => itemStamp(a).localeCompare(itemStamp(b)) || itemId(a).localeCompare(itemId(b)));
            const estimatedMinutes = Number(task.estimated_minutes ?? 0); const variance = actualMinutes - estimatedMinutes;
            return success({ taskId, items, estimatedMinutes, actualMinutes, variance: { minutes: variance, label: formatDurationDelta(variance) }, dailyActuals: [...days].sort(([a],[b]) => a.localeCompare(b)).map(([workDate, d]) => ({ workDate, workDateLabel: formatDate(workDate), actual: toDurationView(d.minutes), workLogIds: d.ids })) });
        });
    }
}
