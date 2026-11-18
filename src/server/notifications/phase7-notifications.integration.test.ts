import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BackendWorkspaceService } from '@/server/workspace/application';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { CRM_TASK, EMPLOYEE, GOV_TASK, USER, data, phase7Database } from '@/server/test/phase7-fixture';
import { NotificationService, deduplicationKey } from './service';
import { NotificationRuleRunner } from './rules';
import { CaptureEmailSender, EmailDeliveryError, NotificationDeliveryWorker } from './delivery';

let env: Awaited<ReturnType<typeof phase7Database>>;
const NOW = '2026-10-04T04:00:00.000Z';

beforeAll(async () => { env = await phase7Database(); });
afterAll(async () => { await env?.close(); });

const notificationsFor = (userId: string, type?: string) =>
  env.rows(`SELECT * FROM notifications WHERE recipient_user_id=? ${type ? 'AND notification_type=?' : ''}`, type ? [userId, type] : [userId]);

describe('BE-0701 and BE-0705: one authorized, content-free path', () => {
  it('authorizes every recipient individually: a government task never reaches someone without that access', async () => {
    const created = await new NotificationService(env.pool, () => NOW).notify({
      recipientUserIds: [USER(1), USER(2), USER(7)], type: 'task_assigned', related: { type: 'task', id: GOV_TASK }, occurrenceKey: 'gov-assign',
    });
    expect(created).toBe(1);
    expect(await notificationsFor(USER(1), 'task_assigned')).toHaveLength(1);
    expect(await notificationsFor(USER(2), 'task_assigned')).toHaveLength(0);
    expect(await notificationsFor(USER(7), 'task_assigned')).toHaveLength(0);
    const [row] = await notificationsFor(USER(1), 'task_assigned');
    // Fixed template only: the task title is not in the stored payload.
    expect(JSON.stringify(row.safe_payload)).not.toContain('Secure reporting endpoint');
    expect(row).toMatchObject({ related_type: 'task', related_id: GOV_TASK });
  });

  it('records read state and the creation timestamp', async () => {
    const [row] = await notificationsFor(USER(1), 'task_assigned');
    expect(row.created_at).toBeInstanceOf(Date);
    expect(row.read_at).toBeNull();
  });

  it('offers the link only while the recipient can still open the record', async () => {
    // User 7 has no placement: a stored notification about the CRM task is shown without a way in.
    await env.pool.execute("INSERT INTO notifications(id,recipient_user_id,notification_type,safe_payload,related_type,related_id,deduplication_key) VALUES(?,?,?,JSON_OBJECT(),'task',?,?)",
      [randomUUID(), USER(7), 'task_overdue', CRM_TASK, randomUUID()]);
    const session = await new AuthenticationService(new MysqlAuthenticationStore(env.pool)).issueSession(USER(7), 'test', null);
    if (session.status !== 'success') throw new Error('session');
    const centre = data(await new BackendWorkspaceService(env.pool, session.data.token).getNotifications(USER(7)));
    const item = centre.groups.flatMap((group) => group.items).find((entry) => entry.type === 'task_overdue')!;
    expect(item).toMatchObject({ href: null, requiresAction: false });
    expect(item.body).toContain('no longer have access');
  });

  it('reads notifications stored under pre-catalogue types without rewriting them', async () => {
    await env.pool.execute("INSERT INTO notifications(id,recipient_user_id,notification_type,safe_payload,related_type,related_id,deduplication_key) VALUES(?,?,?,JSON_OBJECT('relatedDate','2026-10-04'),'timesheet',?,?)",
      [randomUUID(), USER(3), 'time.overtime', EMPLOYEE(3), randomUUID()]);
    const session = await new AuthenticationService(new MysqlAuthenticationStore(env.pool)).issueSession(USER(3), 'test', null);
    if (session.status !== 'success') throw new Error('session');
    const centre = data(await new BackendWorkspaceService(env.pool, session.data.token).getNotifications(USER(3)));
    const item = centre.groups.flatMap((group) => group.items).find((entry) => entry.type === 'overtime')!;
    // 4 October has no government work, so employee 3 can open their own day.
    expect(item).toMatchObject({ group: 'time', href: '/timesheets/2026-10-04' });
    expect((await env.rows("SELECT id FROM notifications WHERE notification_type='time.overtime'")).length).toBe(1);
  });
});

describe('BE-0702 and BE-0703: triggers, preferences and idempotency', () => {
  it('deduplicates per occurrence and recipient', async () => {
    const service = new NotificationService(env.pool, () => NOW);
    const input = { recipientUserIds: [USER(3)], type: 'task_started' as const, related: { type: 'task' as const, id: CRM_TASK }, occurrenceKey: 'started-1' };
    expect(await service.notify(input)).toBe(1);
    expect(await service.notify(input)).toBe(0);
    expect(await service.notify({ ...input, occurrenceKey: 'started-2' })).toBe(1);
    expect((await notificationsFor(USER(3), 'task_started')).map((row) => row.deduplication_key)).toContain(deduplicationKey('task_started', 'started-1'));
  });

  it('honours in-app preferences, except for mandatory types, and queues email only on opt-in', async () => {
    await env.pool.execute("INSERT INTO notification_preferences(user_id,setting_key,in_app_enabled,email_enabled) VALUES(?,'task_activity',FALSE,FALSE),(?,'critical_time',FALSE,TRUE)", [USER(3), USER(3)]);
    const service = new NotificationService(env.pool, () => NOW);
    expect(await service.notify({ recipientUserIds: [USER(3)], type: 'task_reopened', related: { type: 'task', id: CRM_TASK }, occurrenceKey: 'reopen' })).toBe(0);
    expect(await service.notify({ recipientUserIds: [USER(3)], type: 'critical_time', related: { type: 'timesheet', employeeId: EMPLOYEE(3), date: '2026-10-04' }, occurrenceKey: 'critical' })).toBe(1);
    const [critical] = await notificationsFor(USER(3), 'critical_time');
    expect(await env.rows('SELECT state,channel FROM notification_deliveries WHERE notification_id=?', [critical.id])).toEqual([{ state: 'pending', channel: 'email' }]);
  });

  it('sends time events to the employee, their lead and — for overtime and critical — HR', async () => {
    await new NotificationService(env.pool, () => NOW).timeEvent('time.overtime', 'ot-1', EMPLOYEE(3), '2026-10-04');
    const recipients = (await env.rows("SELECT recipient_user_id FROM notifications WHERE notification_type='overtime' AND deduplication_key=?", [deduplicationKey('overtime', 'ot-1')])).map((row) => row.recipient_user_id);
    expect(recipients).toEqual(expect.arrayContaining([USER(3), USER(2), USER(4)]));
  });

  it('runs each scheduled rule window once, and a rerun notifies nobody twice', async () => {
    const dueSoon = randomUUID(), overdue = randomUUID();
    await env.pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state,due_date) SELECT ?,project_id,division_id,'Due soon','in_progress',?,?,'team_lead','not_required','2026-10-05' FROM tasks WHERE id=?",
      [dueSoon, EMPLOYEE(3), EMPLOYEE(2), CRM_TASK]);
    await env.pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state,due_date) SELECT ?,project_id,division_id,'Late','pending',?,?,'team_lead','not_required','2026-10-01' FROM tasks WHERE id=?",
      [overdue, EMPLOYEE(3), EMPLOYEE(2), CRM_TASK]);
    await env.pool.execute("INSERT INTO workload_allocations(id,employee_id,division_id,week_start_date,planned_minutes,capacity_minutes,allocation_basis_points) VALUES(UUID(),?,'10000000-0000-4000-8000-000000000001','2026-10-04',3000,2100,10000)", [EMPLOYEE(3)]);
    const runner = new NotificationRuleRunner(env.pool, () => NOW);
    const first = await runner.runDaily();
    expect(first.map((result) => result.outcome)).toEqual(['completed', 'completed', 'completed']);
    expect(await env.rows("SELECT id FROM notifications WHERE notification_type='deadline_approaching' AND related_id=? AND recipient_user_id=?", [dueSoon, USER(3)])).toHaveLength(1);
    expect((await env.rows("SELECT recipient_user_id FROM notifications WHERE notification_type='task_overdue' AND related_id=?", [overdue])).map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([USER(3), USER(2)]));
    expect((await env.rows("SELECT recipient_user_id FROM notifications WHERE notification_type='workload_warning'")).map((row) => row.recipient_user_id)).toEqual(expect.arrayContaining([USER(2), USER(4)]));
    const [before] = await env.rows('SELECT COUNT(*) n FROM notifications');
    expect((await runner.runDaily()).map((result) => result.outcome)).toEqual(['already_completed', 'already_completed', 'already_completed']);
    // Even forcing the windows open again generates nothing new: occurrence keys dedupe.
    await env.pool.execute("UPDATE notification_rule_runs SET state='failed'");
    await runner.runDaily();
    const [after] = await env.rows('SELECT COUNT(*) n FROM notifications');
    expect(after.n).toBe(before.n);
  });

  it('lets one of two concurrent runners take a window', async () => {
    const runner = new NotificationRuleRunner(env.pool, () => NOW);
    const results = await Promise.all([1, 2, 3].map(() => runner.run('concurrency_probe', 'w1', async () => 0)));
    expect(results.filter((result) => result.outcome === 'completed')).toHaveLength(1);
  });
});

describe('BE-0704: delivery attempts, retry, dead letter and safe logging', () => {
  async function queued(type: 'critical_time' = 'critical_time', occurrence = randomUUID()) {
    await new NotificationService(env.pool, () => NOW).notify({ recipientUserIds: [USER(3)], type, related: { type: 'timesheet', employeeId: EMPLOYEE(3), date: '2026-10-04' }, occurrenceKey: occurrence });
    const [row] = await env.rows("SELECT d.id FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id WHERE n.deduplication_key=?", [deduplicationKey(type, occurrence)]);
    return String(row.id);
  }
  const state = async (id: string) => (await env.rows('SELECT state,attempt_count,safe_error_code,next_attempt_at FROM notification_deliveries WHERE id=?', [id]))[0];

  it('sends fixed text with a link, and records the attempt without the address', async () => {
    const id = await queued();
    const sender = new CaptureEmailSender();
    const summary = await new NotificationDeliveryWorker(env.pool, sender, { now: () => NOW, baseUrl: 'https://office.test' }).processDue();
    expect(summary.sent).toBeGreaterThanOrEqual(1);
    expect(await state(id)).toMatchObject({ state: 'sent', attempt_count: 1 });
    const message = sender.messages.find((m) => m.idempotencyKey === id)!;
    expect(message).toMatchObject({ to: 'employee@powerin.ai', subject: 'PowerInAI: A working day needs urgent review' });
    expect(message.text).toContain('https://office.test/timesheets/2026-10-04');
    const attempts = await env.rows('SELECT * FROM delivery_attempts WHERE delivery_id=?', [id]);
    expect(JSON.stringify(attempts)).not.toContain('employee@powerin.ai');
  });

  it('retries a transient failure with backoff, then dead-letters after the last attempt', async () => {
    const id = await queued();
    const failing = new CaptureEmailSender(new EmailDeliveryError('rate_limit_exceeded', true));
    let clock = Date.parse(NOW);
    const worker = new NotificationDeliveryWorker(env.pool, failing, { now: () => new Date(clock).toISOString(), maxAttempts: 3, random: () => 0.5 });
    await worker.processDue();
    expect(await state(id)).toMatchObject({ state: 'pending', attempt_count: 1, safe_error_code: 'rate_limit_exceeded' });
    for (let attempt = 0; attempt < 2; attempt += 1) { clock += 2 * 3_600_000; await worker.processDue(); }
    expect(await state(id)).toMatchObject({ state: 'dead_letter', attempt_count: 3 });
    expect(await env.rows('SELECT attempt_number,state FROM delivery_attempts WHERE delivery_id=? ORDER BY attempt_number', [id]))
      .toEqual([{ attempt_number: 1, state: 'retry' }, { attempt_number: 2, state: 'retry' }, { attempt_number: 3, state: 'dead_letter' }]);
  });

  it('dead-letters a permanent failure at once, and skips when no channel is configured', async () => {
    const permanent = await queued();
    await new NotificationDeliveryWorker(env.pool, new CaptureEmailSender(new EmailDeliveryError('validation_error', false)), { now: () => NOW }).processDue();
    expect(await state(permanent)).toMatchObject({ state: 'dead_letter', attempt_count: 1 });
    const unconfigured = await queued();
    await new NotificationDeliveryWorker(env.pool, null, { now: () => NOW }).processDue();
    expect(await state(unconfigured)).toMatchObject({ state: 'skipped', safe_error_code: 'channel_unconfigured' });
  });

  it('rechecks the email preference before sending', async () => {
    const id = await queued();
    await env.pool.execute("UPDATE notification_preferences SET email_enabled=FALSE WHERE user_id=? AND setting_key='critical_time'", [USER(3)]);
    await new NotificationDeliveryWorker(env.pool, new CaptureEmailSender(), { now: () => NOW }).processDue();
    expect(await state(id)).toMatchObject({ state: 'skipped', safe_error_code: 'preference_disabled' });
    await env.pool.execute("UPDATE notification_preferences SET email_enabled=TRUE WHERE user_id=? AND setting_key='critical_time'", [USER(3)]);
  });

  it('never lets two workers send the same delivery', async () => {
    const id = await queued();
    const sender = new CaptureEmailSender();
    const worker = new NotificationDeliveryWorker(env.pool, sender, { now: () => NOW });
    await Promise.all([worker.processDue(), worker.processDue(), worker.processDue()]);
    expect(sender.messages.filter((message) => message.idempotencyKey === id)).toHaveLength(1);
  });
});
