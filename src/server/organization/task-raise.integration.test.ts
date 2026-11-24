import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { CRM, EMPLOYEE, POWERINAI, USER, data, phase7Database } from '@/server/test/phase7-fixture';
import { BackendTaskReviewViews } from './task-review-views';

/**
 * Raising a task for review happens exactly once. Reported defect: after
 * "Send for review" the dialog stayed open and every further click created
 * another task — the idempotency key was dropped and the task was saved
 * before its audit and notification, so a later failure left it behind.
 */
let env: Awaited<ReturnType<typeof phase7Database>>;
let views: BackendTaskReviewViews;
let leadViews: BackendTaskReviewViews;
let adminViews: BackendTaskReviewViews;
const input = (title: string, overrides: Record<string, string> = {}) => ({
  title, projectId: CRM, priority: 'medium' as const, dueDate: '2027-01-15', estimatedMinutes: '120', description: 'Draft the report', ...overrides,
});
const count = async (title: string) => Number((await env.rows('SELECT COUNT(*) n FROM tasks WHERE title=?', [title]))[0].n);

beforeAll(async () => {
  env = await phase7Database();
  // A plain employee: placed in PowerInAI's Technical department, whose lead
  // (employee 2) must review their tasks. Employee 3 would not do — they lead
  // a department, so their self-tasks need no review at all.
  await env.pool.execute("INSERT INTO employee_division_assignments(id,employee_id,division_id,department_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary) VALUES(UUID(),?,?,'22000000-0000-4000-8000-000000000001','2026-01-01',10000,2100,TRUE)", [EMPLOYEE(7), POWERINAI]);
  const session = await new AuthenticationService(new MysqlAuthenticationStore(env.pool)).issueSession(USER(7), 'raise-test', null);
  if (session.status !== 'success') throw new Error('session');
  views = new BackendTaskReviewViews(env.pool, session.data.token);
  const leadSession = await new AuthenticationService(new MysqlAuthenticationStore(env.pool)).issueSession(USER(2), 'raise-lead-test', null);
  const adminSession = await new AuthenticationService(new MysqlAuthenticationStore(env.pool)).issueSession(USER(1), 'raise-admin-test', null);
  if (leadSession.status !== 'success' || adminSession.status !== 'success') throw new Error('review session');
  leadViews = new BackendTaskReviewViews(env.pool, leadSession.data.token);
  adminViews = new BackendTaskReviewViews(env.pool, adminSession.data.token);
});
afterAll(async () => { await env?.close(); });

describe('raising a task for review', () => {
  it('a retry with the same key returns the first task instead of creating another', async () => {
    const first = data(await views.create(USER(7), input('Retry task'), { idempotencyKey: 'retry-key-0001' }));
    const again = data(await views.create(USER(7), input('Retry task'), { idempotencyKey: 'retry-key-0001' }));
    expect(again.id).toBe(first.id);
    expect(await count('Retry task')).toBe(1);
    // One review notification for the Team Lead, not one per click.
    expect(await env.rows("SELECT recipient_user_id FROM notifications WHERE notification_type='task_review_requested' AND related_id=?", [first.id])).toEqual([{ recipient_user_id: USER(2) }]);
    expect((await env.rows('SELECT review_state FROM tasks WHERE id=?', [first.id]))[0].review_state).toBe('pending_review');
  });

  it('refuses a reused key with different content', async () => {
    data(await views.create(USER(7), input('Key reuse A'), { idempotencyKey: 'reuse-key-0001' }));
    expect((await views.create(USER(7), input('Key reuse B'), { idempotencyKey: 'reuse-key-0001' })).status).toBe('conflict');
    expect(await count('Key reuse B')).toBe(0);
  });

  it('creates one task when the same submit arrives several times at once', async () => {
    const results = await Promise.all([1, 2, 3].map(() => views.create(USER(7), input('Race task'), { idempotencyKey: 'race-key-00001' })));
    expect(new Set(results.map((result) => data(result).id)).size).toBe(1);
    expect(await count('Race task')).toBe(1);
  });

  it('saves nothing when a later step fails, so a retry is clean', async () => {
    await env.pool.query("CREATE TRIGGER block_notifications BEFORE INSERT ON notifications FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='injected failure'");
    await expect(views.create(USER(7), input('Failing task'), { idempotencyKey: 'fail-key-00001' })).rejects.toThrow();
    expect(await count('Failing task')).toBe(0);
    await env.pool.query('DROP TRIGGER block_notifications');
    data(await views.create(USER(7), input('Failing task'), { idempotencyKey: 'fail-key-00001' }));
    expect(await count('Failing task')).toBe(1);
  });

  it('accepts an empty due date, as the form says it is optional', async () => {
    data(await views.create(USER(7), input('No due date', { dueDate: '' }), { idempotencyKey: 'nodue-key-0001' }));
    expect((await env.rows("SELECT due_date FROM tasks WHERE title='No due date'"))[0].due_date).toBeNull();
    expect((await views.create(USER(7), input('Past due', { dueDate: '2020-01-01' }), { idempotencyKey: 'past-key-00001' })).status).toBe('validation_failure');
  });

  it('lets only the current Team Lead or Super Administrator reopen rejected review', async () => {
    const leadTask = data(await views.create(USER(7), input('Lead reopen task'), { idempotencyKey: 'lead-reopen-0001' }));
    data(await leadViews.decide(USER(2), leadTask.id, { decision: 'rejected', note: 'Revise the scope.' }));
    const [leadRejected] = await env.rows('SELECT version FROM tasks WHERE id=?', [leadTask.id]);

    expect((await views.reopen(USER(7), leadTask.id, {
      expectedVersion: Number(leadRejected.version), reason: 'Employee cannot reopen this.',
    })).status).toBe('not_found');
    expect((await leadViews.reopen(USER(2), leadTask.id, {
      expectedVersion: Number(leadRejected.version), reason: '',
    })).status).toBe('validation_failure');
    data(await leadViews.reopen(USER(2), leadTask.id, {
      expectedVersion: Number(leadRejected.version), reason: 'The revised scope is ready for review.',
    }));
    expect((await env.rows('SELECT review_state,reviewer_employee_id,review_note FROM tasks WHERE id=?', [leadTask.id]))[0])
      .toEqual({ review_state: 'pending_review', reviewer_employee_id: null, review_note: null });

    const adminTask = data(await views.create(USER(7), input('Admin reopen task'), { idempotencyKey: 'admin-reopen-001' }));
    data(await leadViews.decide(USER(2), adminTask.id, { decision: 'rejected', note: 'Needs admin correction.' }));
    const [adminRejected] = await env.rows('SELECT version FROM tasks WHERE id=?', [adminTask.id]);
    data(await adminViews.reopen(USER(1), adminTask.id, {
      expectedVersion: Number(adminRejected.version), reason: 'The administrator confirmed the correction.',
    }));
    expect((await env.rows('SELECT review_state FROM tasks WHERE id=?', [adminTask.id]))[0].review_state).toBe('pending_review');
    expect(await env.rows("SELECT reason FROM audit_events WHERE action='task.review_reopened' AND resource_id IN (?,?) ORDER BY resource_id", [leadTask.id, adminTask.id]))
      .toHaveLength(2);
  });
});
