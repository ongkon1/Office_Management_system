import { afterAll, beforeAll, expect, it } from 'vitest';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { createOperationsService } from '@/server/operations/composition';
import { CRM, EMPLOYEE, USER, data, phase7Database } from '@/server/test/phase7-fixture';
import { businessToday } from '@/lib/business-date';
import { manageTaskCategories } from './task-categories';
import { BackendTaskReviewViews } from './task-review-views';

let env: Awaited<ReturnType<typeof phase7Database>>;
beforeAll(async () => { env = await phase7Database(); });
afterAll(async () => { await env?.close(); });

it('keeps categories unique and persists their selection in both task creation flows', async () => {
  const admin = { userId: USER(1), isAdmin: true };
  const employee = { userId: USER(3), isAdmin: false };
  const change = (command: Parameters<typeof manageTaskCategories>[2]) =>
    manageTaskCategories(env.pool, admin, command);
  const [category] = data(await manageTaskCategories(env.pool, employee, { action: 'create', name: '  Client   Support ' }));
  expect(category.name).toBe('Client Support');
  expect((await change({ action: 'create', name: 'client support' })).status).toBe('validation_failure');
  data(await manageTaskCategories(env.pool, employee, { action: 'rename', id: category.id, name: 'Support' }));
  expect((await manageTaskCategories(env.pool, employee, { action: 'setActive', id: category.id, isActive: false })).status).toBe('not_found');
  const auth = new AuthenticationService(new MysqlAuthenticationStore(env.pool));
  const [adminSession, employeeSession] = await Promise.all([
    auth.issueSession(admin.userId, 'category-test', null),
    auth.issueSession(employee.userId, 'category-test', null),
  ]);
  const operations = createOperationsService(env.pool, data(adminSession).token);
  const task = data(await operations.saveTask(admin.userId, {
    title: 'Assigned category test', projectId: CRM, categoryId: category.id,
    billingType: 'billable',
    assigneeEmployeeId: EMPLOYEE(3), supportingMemberIds: [], startDate: businessToday(),
    dueDate: null, priority: 'medium', estimatedMinutes: 90, description: '', checklist: [],
  }));
  expect(task.categoryName).toBe('Support');
  expect(data(await operations.getTask(admin.userId, task.id)).billingType).toBe('billable');
  const review = new BackendTaskReviewViews(env.pool, data(employeeSession).token);
  const input = {
    title: 'Raised category test', projectId: CRM, categoryId: category.id,
    billingType: 'non_billable' as const,
    dueDate: '', priority: 'medium' as const, estimatedMinutes: '90', description: '',
  };
  const raised = data(await review.create(employee.userId, input));
  expect((await env.rows('SELECT category_id,billing_type FROM tasks WHERE id=?', [raised.id]))[0])
    .toMatchObject({ category_id: category.id, billing_type: 'non_billable' });
  data(await change({ action: 'setActive', id: category.id, isActive: false }));
  expect(data(await manageTaskCategories(env.pool, employee, { action: 'list' }))).toEqual([]);
  expect((await manageTaskCategories(env.pool, employee, { action: 'list', includeArchived: true })).status).toBe('not_found');
  expect((await manageTaskCategories(env.pool, employee, { action: 'rename', id: category.id, name: 'New name' })).status).toBe('not_found');
  expect(data(await manageTaskCategories(env.pool, employee, { action: 'create', name: 'Design' })))
    .toEqual([expect.objectContaining({ name: 'Design' })]);
  expect(data(await operations.getTask(admin.userId, task.id)).categoryName).toBe('Support');
  expect((await review.create(employee.userId, input)).status).toBe('validation_failure');
  expect((await change({ action: 'create', name: 'support' })).status).toBe('validation_failure');
  expect(data(await change({ action: 'setActive', id: category.id, isActive: true })))
    .toContainEqual(expect.objectContaining({ id: category.id, isActive: true }));
});
