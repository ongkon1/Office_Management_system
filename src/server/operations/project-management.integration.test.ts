import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Result } from '@/contracts/results';
import type { ProjectFormInput, TeamProjectView } from '@/contracts/team-lead';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { createOperationsService } from './composition';

/**
 * The project workflow end to end on MySQL. Before this, every project list
 * was empty (visibility read a grants table nothing writes), a saved project
 * vanished, an edit erased its members and dates, and the people allowed to
 * create projects were the wrong ones.
 */

const USER = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const EMPLOYEE = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = USER(1), LEAD = USER(2), DEPARTMENT_LEAD_ONLY = USER(3), HR = USER(4), MANAGEMENT = USER(6), UNPLACED = USER(7);
const POWERINAI = '10000000-0000-4000-8000-000000000001';
const GOVERNMENT = '10000000-0000-4000-8000-000000000003';
const CRM = '80000000-0000-4000-8000-000000000001';
const GOV_PORTAL = '80000000-0000-4000-8000-000000000002';

let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
let pool: Pool;
const services: Record<string, ReturnType<typeof createOperationsService>> = {};

function data<T>(result: Result<T>): T {
  expect(result.status, JSON.stringify(result)).toBe('success');
  if (result.status !== 'success') throw new Error(JSON.stringify(result));
  return result.data;
}
const as = (userId: string) => services[userId];
const input = (overrides: Partial<ProjectFormInput> = {}): ProjectFormInput => ({
  name: 'Client Portal', divisionId: POWERINAI, managerEmployeeId: EMPLOYEE(2), memberIds: [EMPLOYEE(3)], client: 'Acme',
  startDate: '2026-09-01', endDate: '2026-12-31', priority: 'high', estimatedMinutes: 6000, budgetAmount: '',
  completionPercent: 10, notes: 'Phase one', ...overrides,
});

beforeAll(async () => {
  db = await createIsolatedDatabase();
  await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8'));
  const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
  url.pathname = `/${db.name}`;
  pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 8 });
  const auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
  for (const userId of [ADMIN, LEAD, DEPARTMENT_LEAD_ONLY, HR, MANAGEMENT, UNPLACED]) {
    const session = await auth.issueSession(userId, 'project-test', null);
    if (session.status !== 'success') throw new Error('session');
    services[userId] = createOperationsService(pool, session.data.token);
  }
});

afterAll(async () => {
  await pool?.end();
  await db?.dispose();
});

describe('who sees projects', () => {
  it('shows a Team Lead the projects in their divisions, without government work', async () => {
    const codes = data(await as(LEAD).listProjects(LEAD)).map((project) => project.code);
    expect(codes).toEqual(expect.arrayContaining(['PIAI-CRM', 'WCF-WEB']));
    expect(codes).not.toContain('GOV-PORTAL');
    expect((await as(LEAD).getProject(LEAD, GOV_PORTAL)).status).toBe('not_found');
  });

  it('shows a Super Administrator every project, government included', async () => {
    expect(data(await as(ADMIN).listProjects(ADMIN)).map((project) => project.code)).toContain('GOV-PORTAL');
  });

  it('lets Management read but never change', async () => {
    const projects = data(await as(MANAGEMENT).listProjects(MANAGEMENT));
    expect(projects.length).toBeGreaterThan(0);
    expect(projects.every((project) => !project.canManage)).toBe(true);
    expect((await as(MANAGEMENT).saveProject(MANAGEMENT, input())).status).toBe('permission_denied');
  });

  it('shows an employee only projects they work on, and someone unplaced nothing', async () => {
    expect(data(await as(DEPARTMENT_LEAD_ONLY).listProjects(DEPARTMENT_LEAD_ONLY)).map((project) => project.id)).toContain(CRM);
    expect(data(await as(UNPLACED).listProjects(UNPLACED))).toHaveLength(0);
    expect((await as(UNPLACED).getProject(UNPLACED, CRM)).status).toBe('not_found');
  });
});

describe('who creates projects', () => {
  it('refuses an employee whose only authority is a department appointment', async () => {
    expect((await as(DEPARTMENT_LEAD_ONLY).saveProject(DEPARTMENT_LEAD_ONLY, input())).status).toBe('permission_denied');
    expect(data(await as(DEPARTMENT_LEAD_ONLY).getProjectFormOptions(DEPARTMENT_LEAD_ONLY)).canCreate).toBe(false);
  });

  it('offers HR every non-government division and only placed people', async () => {
    const options = data(await as(HR).getProjectFormOptions(HR));
    expect(options.canCreate).toBe(true);
    expect(options.divisions.map((division) => division.value)).toContain(POWERINAI);
    expect(options.divisions.map((division) => division.value)).not.toContain(GOVERNMENT);
    expect(options.people.map((person) => person.value)).not.toContain(EMPLOYEE(7));
  });
});

describe('creating and managing a project', () => {
  let created: TeamProjectView;

  it('creates a project that stays visible, with members, code and activity', async () => {
    created = data(await as(LEAD).saveProject(LEAD, input()));
    expect(created).toMatchObject({ code: 'PRJ-0001', status: 'active', canManage: true, startDate: '2026-09-01', endDate: '2026-12-31' });
    expect(created.members.map((member) => member.id)).toEqual([EMPLOYEE(3)]);
    expect(created.activity[0].label).toBe('Project created');
    expect(data(await as(LEAD).listProjects(LEAD)).map((project) => project.id)).toContain(created.id);
  });

  it('edits only what changed and keeps membership history', async () => {
    const edited = data(await as(LEAD).saveProject(LEAD, input({ name: 'Client Portal v2', memberIds: [EMPLOYEE(2)], status: 'on_hold' }), created.id));
    expect(edited).toMatchObject({ name: 'Client Portal v2', status: 'on_hold', startDate: '2026-09-01', endDate: '2026-12-31', code: 'PRJ-0001' });
    expect(edited.members.map((member) => member.id)).toEqual([EMPLOYEE(2)]);
    expect(edited.activity[0].label).toBe('Updated name, status, members');
    // The removed member's row is ended, not deleted.
    const [rows] = await pool.execute<RowDataPacket[]>('SELECT employee_id,is_active FROM project_members WHERE project_id=? ORDER BY employee_id', [created.id]);
    expect(rows.map((row) => [row.employee_id, row.is_active])).toEqual([[EMPLOYEE(2), 1], [EMPLOYEE(3), 0]]);
  });

  it('refuses invalid input field by field instead of failing', async () => {
    expect(await as(LEAD).saveProject(LEAD, input({ managerEmployeeId: 'emp-2001' }))).toMatchObject({ status: 'validation_failure', focusField: 'managerEmployeeId' });
    expect(await as(LEAD).saveProject(LEAD, input({ memberIds: [EMPLOYEE(7)] }))).toMatchObject({ status: 'validation_failure', focusField: 'memberIds' });
    expect(await as(LEAD).saveProject(LEAD, input({ divisionId: 'pia' }))).toMatchObject({ status: 'validation_failure', focusField: 'divisionId' });
    expect(await as(LEAD).saveProject(LEAD, input({ endDate: '2026-08-01' }))).toMatchObject({ status: 'validation_failure', focusField: 'endDate' });
    expect((await as(LEAD).saveProject(LEAD, input({ divisionId: '10000000-0000-4000-8000-000000000005' }), created.id)).status).toBe('conflict');
  });

  it('keeps budgets behind cost access', async () => {
    // The Team Lead has no cost access: their budget input is ignored.
    const lead = data(await as(LEAD).saveProject(LEAD, input({ name: 'Client Portal v2', memberIds: [EMPLOYEE(2)], status: 'on_hold', budgetAmount: '999' }), created.id));
    expect(lead).toMatchObject({ budgetRestricted: true, budgetAmount: null, budgetLabel: null });
    // A Super Administrator holds every permission.
    expect(await as(ADMIN).saveProject(ADMIN, input({ budgetAmount: '12.345' }), created.id)).toMatchObject({ status: 'validation_failure', focusField: 'budgetAmount' });
    const admin = data(await as(ADMIN).saveProject(ADMIN, input({ name: 'Client Portal v2', memberIds: [EMPLOYEE(2)], status: 'on_hold', budgetAmount: '450000.50' }), created.id));
    expect(admin).toMatchObject({ budgetRestricted: false, budgetAmount: '450000.50' });
    const [row] = await pool.execute<RowDataPacket[]>('SELECT budget_amount,currency FROM projects WHERE id=?', [created.id]);
    expect([String(row[0].budget_amount), row[0].currency]).toEqual(['450000.5000', 'BDT']);
  });

  it('adds tasks to the project for people placed in its division', async () => {
    await as(LEAD).saveProject(LEAD, input({ name: 'Client Portal v2', memberIds: [EMPLOYEE(2)], status: 'active' }), created.id);
    const task = data(await as(LEAD).saveTask(LEAD, {
      title: 'Build login', projectId: created.id, assigneeEmployeeId: EMPLOYEE(3), supportingMemberIds: [EMPLOYEE(2)],
      startDate: '2026-09-02', dueDate: '2026-09-30', priority: 'medium', estimatedMinutes: 600, description: '', checklist: ['Design', 'Build'],
    }));
    expect(task).toMatchObject({ projectId: created.id, startDate: '2026-09-02', dueDate: '2026-09-30' });
    expect(task.supportingMembers.map((member) => member.id)).toEqual([EMPLOYEE(2)]);
    const edited = data(await as(LEAD).saveTask(LEAD, {
      title: 'Build secure login', projectId: created.id, assigneeEmployeeId: EMPLOYEE(3), supportingMemberIds: task.supportingMembers.map((member) => member.id),
      startDate: task.startDate, dueDate: task.dueDate, priority: task.priority, estimatedMinutes: task.estimated.minutes,
      description: task.description ?? '', checklist: task.checklist.map((item) => item.label),
    }, task.id));
    expect(edited.supportingMembers.map((member) => member.id)).toEqual([EMPLOYEE(2)]);
    const [effects] = await pool.execute<RowDataPacket[]>(
      `SELECT
       (SELECT COUNT(*) FROM audit_events WHERE resource_type='task' AND resource_id=?) audit_count,
       (SELECT COUNT(*) FROM notifications WHERE related_type='task' AND related_id=? AND notification_type='task_assigned') notification_count`,
      [task.id, task.id],
    );
    expect(Number(effects[0].audit_count)).toBe(2);
    expect(Number(effects[0].notification_count)).toBe(1);
    expect(data(await as(LEAD).listTasks(LEAD)).map((item) => item.id)).toContain(task.id);
    expect(await as(LEAD).saveTask(LEAD, {
      title: 'Nobody', projectId: created.id, assigneeEmployeeId: EMPLOYEE(7), supportingMemberIds: [],
      startDate: null, dueDate: null, priority: 'low', estimatedMinutes: 0, description: '', checklist: [],
    })).toMatchObject({ status: 'validation_failure', focusField: 'assigneeEmployeeId' });
    // The assignee now sees the project through their task.
    expect(data(await as(DEPARTMENT_LEAD_ONLY).listProjects(DEPARTMENT_LEAD_ONLY)).map((project) => project.id)).toContain(created.id);
  });

  it('rejects incomplete task data and new work on a closed project', async () => {
    const base = {
      title: 'Validate task', projectId: created.id, assigneeEmployeeId: EMPLOYEE(3), supportingMemberIds: [],
      startDate: '2026-09-02', dueDate: '2026-09-30', priority: 'medium' as const, estimatedMinutes: 60,
      description: '', checklist: [] as string[],
    };
    expect(await as(LEAD).saveTask(LEAD, { ...base, dueDate: '2026-09-01' })).toMatchObject({ status: 'validation_failure', focusField: 'dueDate' });
    expect(await as(LEAD).saveTask(LEAD, { ...base, checklist: ['Same', 'same'] })).toMatchObject({ status: 'validation_failure', focusField: 'checklist' });
    await pool.execute("UPDATE projects SET status='closed',accepts_time_entries=FALSE WHERE id=?", [created.id]);
    expect(await as(LEAD).saveTask(LEAD, base)).toMatchObject({ status: 'validation_failure', focusField: 'projectId' });
  });
});
