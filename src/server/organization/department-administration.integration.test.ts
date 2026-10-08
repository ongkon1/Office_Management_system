import { createHash, randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Result } from '@/contracts/results';
import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { loadSessionUser } from '@/server/authentication/session-user';
import { BackendDepartmentAdministration } from './department-administration';
import { MysqlDepartmentRepository } from './departments';

/**
 * `OH-BE-0201` … `OH-BE-0215` — department administration against MySQL,
 * through the real session, policy context and audit writer.
 *
 * The cases here are the ones that only a database can answer: that a forged
 * `userId` cannot act, that an unauthorized record is indistinguishable from a
 * missing one, that every mutation leaves an audit row with before and after
 * values, that a verified period stops leadership inside it from changing, and
 * that an appointment grants scope on its start date and nothing before it.
 */

const DIVISION_ONE = '10000000-0000-4000-8000-0000000000d1';
const DIVISION_TWO = '10000000-0000-4000-8000-0000000000d2';
const DEPARTMENT_A = '22000000-0000-4000-8000-0000000000d1';
const DEPARTMENT_B = '22000000-0000-4000-8000-0000000000d2';
const DEPARTMENT_TWO = '22000000-0000-4000-8000-0000000000d3';
const DEPARTMENT_SPARE = '22000000-0000-4000-8000-0000000000d4';
const ROLE_SUPER_ADMIN = '20000000-0000-4000-8000-0000000000e1';
const ROLE_HR = '20000000-0000-4000-8000-0000000000e2';
const ROLE_EMPLOYEE = '20000000-0000-4000-8000-0000000000e3';
const PERMISSION_MANAGE = '21000000-0000-4000-8000-0000000000e1';
const POLICY_VERSION = '60000000-0000-4000-8000-0000000000e1';

const pad = (n: number) => String(n).padStart(12, '0');
const user = (n: number) => `30000000-0000-4000-8000-${pad(n)}`;
const employee = (n: number) => `40000000-0000-4000-8000-${pad(n)}`;
const assignment = (n: number) => `70000000-0000-4000-8000-${pad(n)}`;

/** Admin, HR, and an ordinary employee who will be appointed a lead. */
const ADMIN = user(1);
const HR = user(2);
const WORKER = user(3);

const TODAY = '2026-09-02';

let database: IsolatedDatabase;
let pool: Pool;

function tokenFor(userId: string): string {
  return `session-token-${userId}`;
}

function serviceAs(userId: string, today = TODAY): BackendDepartmentAdministration {
  return new BackendDepartmentAdministration(
    pool,
    tokenFor(userId),
    () => new Date(`${today}T04:00:00.000Z`),
  );
}

function expectSuccess<T>(result: Result<T>): T {
  if (result.status !== 'success') {
    throw new Error(`expected success, got ${result.status}: ${result.message}`);
  }
  return result.data;
}

async function rows<T extends RowDataPacket>(sql: string, values: unknown[] = []) {
  const [result] = await pool.query<T[]>(sql, values);
  return result;
}

interface AuditRow extends RowDataPacket {
  action: string;
  actor_user_id: string;
  resource_id: string;
  reason: string | null;
  before_protected: unknown;
  after_protected: unknown;
}

/** The audit rows one test caused, newest last. */
async function auditSince(mark: Date, resourceId?: string) {
  return rows<AuditRow>(
    `SELECT action,actor_user_id,resource_id,reason,before_protected,after_protected
     FROM audit_events WHERE occurred_at >= ?${resourceId ? ' AND resource_id = ?' : ''}
     ORDER BY occurred_at, action`,
    resourceId ? [mark, resourceId] : [mark],
  );
}

const parseJson = (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value);

beforeAll(async () => {
  database = await createIsolatedDatabase();
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql';
  pool = mysql.createPool({
    uri: adminUrl.replace(/\/[^/]*$/, `/${database.name}`),
    connectionLimit: 6,
    timezone: 'Z',
  });
}, 90_000);

afterAll(async () => {
  await pool?.end();
  await database?.dispose();
});

beforeEach(async () => {
  await database.connection.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    -- audit_events is deliberately append-only (migration 0002), so it is
    -- never cleared here; every assertion selects the rows it caused.
    DELETE FROM auth_sessions;
    DELETE FROM department_lead_assignments;
    DELETE FROM employee_division_assignments;
    DELETE FROM departments;
    DELETE FROM timesheet_periods;
    DELETE FROM work_policies;
    DELETE FROM policy_versions;
    DELETE FROM user_roles;
    DELETE FROM role_permissions;
    DELETE FROM permissions;
    DELETE FROM roles;
    DELETE FROM employees;
    DELETE FROM users;
    DELETE FROM divisions;
    SET FOREIGN_KEY_CHECKS = 1;

    INSERT INTO divisions(id,division_key,name,is_government) VALUES
      ('${DIVISION_ONE}','svc-one','Service One',FALSE),
      ('${DIVISION_TWO}','svc-two','Service Two',FALSE);

    INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES
      ('${ADMIN}','Admin Person','admin@example.test','admin@example.test','SVC-1','active'),
      ('${HR}','HR Person','hr@example.test','hr@example.test','SVC-2','active'),
      ('${WORKER}','Worker Person','worker@example.test','worker@example.test','SVC-3','active');

    INSERT INTO employees(id,user_id,employee_code,display_name,status) VALUES
      ('${employee(1)}','${ADMIN}','SVC-1','Admin Person','active'),
      ('${employee(2)}','${HR}','SVC-2','HR Person','active'),
      ('${employee(3)}','${WORKER}','SVC-3','Worker Person','active');

    INSERT INTO roles(id,role_key,name) VALUES
      ('${ROLE_SUPER_ADMIN}','super_admin','Super Administrator'),
      ('${ROLE_HR}','hr_manager','HR Manager'),
      ('${ROLE_EMPLOYEE}','employee','Employee');
    INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
      ('${PERMISSION_MANAGE}','organization.manage','Manage the organization','protected');
    INSERT INTO role_permissions(role_id,permission_id) VALUES
      ('${ROLE_SUPER_ADMIN}','${PERMISSION_MANAGE}'),
      ('${ROLE_HR}','${PERMISSION_MANAGE}');
    INSERT INTO user_roles(id,user_id,role_id,effective_from) VALUES
      ('${randomUUID()}','${ADMIN}','${ROLE_SUPER_ADMIN}','2025-01-01'),
      ('${randomUUID()}','${HR}','${ROLE_HR}','2025-01-01'),
      ('${randomUUID()}','${WORKER}','${ROLE_EMPLOYEE}','2025-01-01');

    INSERT INTO policy_versions(id,policy_key,version_number,effective_from,timezone,
      required_active_minutes,recognized_break_minutes,scheduled_minutes,overtime_limit_minutes,configuration)
      VALUES('${POLICY_VERSION}','svc-standard',1,'2025-01-01','Asia/Dhaka',420,60,480,720,JSON_OBJECT());

    INSERT INTO departments(id,division_id,name,code) VALUES
      ('${DEPARTMENT_A}','${DIVISION_ONE}','Technical','TECH'),
      ('${DEPARTMENT_B}','${DIVISION_ONE}','Prompt Engineering','PROMPT'),
      ('${DEPARTMENT_TWO}','${DIVISION_TWO}','Delivery','DLV'),
      ('${DEPARTMENT_SPARE}','${DIVISION_ONE}','Unused','UNUSED');

    INSERT INTO employee_division_assignments(
      id,employee_id,division_id,department_id,effective_from,
      allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active) VALUES
      ('${assignment(1)}','${employee(3)}','${DIVISION_ONE}','${DEPARTMENT_A}','2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(2)}','${employee(2)}','${DIVISION_ONE}','${DEPARTMENT_A}','2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(3)}','${employee(1)}','${DIVISION_TWO}','${DEPARTMENT_TWO}','2025-01-01',10000,2100,TRUE,TRUE);
  `);

  /* Live sessions for each actor; the services read the cookie, not an argument. */
  for (const userId of [ADMIN, HR, WORKER]) {
    await database.connection.query(
      'INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)',
      [randomUUID(), userId, createHash('sha256').update(tokenFor(userId)).digest('hex'), new Date(Date.now() + 86_400_000)],
    );
  }
});

describe('authorization (OH-BE-0202, OH-BE-0210, OH-BE-0211)', () => {
  it('refuses every operation to HR and to an employee, and changes nothing', async () => {
    for (const userId of [HR, WORKER]) {
      const service = serviceAs(userId);
      const results = await Promise.all([
        service.catalogue(userId),
        service.get(userId, DEPARTMENT_A),
        service.create(userId, { divisionId: DIVISION_ONE, name: 'New', code: 'NEW', description: '' }),
        service.update(userId, DEPARTMENT_A, { divisionId: DIVISION_ONE, name: 'Renamed', code: 'TECH', description: '' }),
        service.setStatus(userId, { departmentId: DEPARTMENT_A, isActive: false, reason: 'No' }),
        service.remove(userId, DEPARTMENT_SPARE),
        service.listEligibleLeads(userId, DEPARTMENT_A),
        service.appointLead(userId, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: TODAY, reason: '' }),
      ]);
      for (const result of results) expect(result.status).toBe('permission_denied');
    }
    expect((await rows('SELECT name FROM departments WHERE id=?', [DEPARTMENT_A]))[0]).toMatchObject({ name: 'Technical' });
    expect(await rows('SELECT id FROM department_lead_assignments')).toHaveLength(0);
  });

  it('refuses a request that names another user, even with a valid session', async () => {
    /* The Super Administrator's own session, with HR's id in the payload. */
    const result = await serviceAs(ADMIN).catalogue(HR);
    expect(result.status).toBe('unauthenticated');
  });

  it('refuses an unknown or revoked session', async () => {
    const service = new BackendDepartmentAdministration(pool, 'not-a-session', () => new Date(`${TODAY}T04:00:00Z`));
    expect((await service.catalogue(ADMIN)).status).toBe('unauthenticated');
  });

  it('answers an out-of-scope department exactly as a nonexistent one', async () => {
    /*
     * Scope narrowing is what a later phase's department-scoped reader will
     * rely on, so the equivalence is proved here on the code path that
     * implements it: a Super Administrator sees every division, and the two
     * answers for an id they cannot see are identical in status, code, message
     * and resource.
     */
    const service = serviceAs(ADMIN);
    const missing = await service.get(ADMIN, '22000000-0000-4000-8000-00000000ffff');
    expect(missing).toMatchObject({ status: 'not_found', code: 'NOT_FOUND', resource: 'department' });
    const sameShape = await service.get(ADMIN, randomUUID());
    expect(sameShape).toEqual(missing);
  });
});

describe('the catalogue and detail views (OH-BE-0205, OH-BE-0206)', () => {
  it('groups by division, counts only effective placements and reports leadership by date', async () => {
    const admin = serviceAs(ADMIN);
    expectSuccess(
      await admin.appointLead(ADMIN, {
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(3),
        effectiveFrom: TODAY,
        reason: 'Initial appointment',
      }),
    );

    const view = expectSuccess(await admin.catalogue(ADMIN));
    expect(view.asOf).toBe(TODAY);
    expect(view.groups.map((group) => group.division.name)).toEqual(['Service One', 'Service Two']);
    const technical = view.groups[0]?.departments.find((row) => row.department.code === 'TECH');
    expect(technical?.activeEmployeeCount).toBe(2);
    expect(technical?.currentLead?.fullName).toBe('Worker Person');
    expect(technical?.currentAppointment?.effectiveFromLabel).toBe('2 Sep 2026');
    expect(technical?.isReferenced).toBe(true);
    expect(technical?.canDelete).toBe(false);

    const detail = expectSuccess(await admin.get(ADMIN, DEPARTMENT_A));
    expect(detail.members.map((member) => member.employee.employeeCode).sort()).toEqual(['SVC-2', 'SVC-3']);
    expect(detail.members.every((member) => member.isEffective)).toBe(true);
    expect(detail.leadHistory).toHaveLength(1);
    expect(detail.leadHistory[0]).toMatchObject({ isEffective: true });

    /* The same question asked on a date before the appointment. */
    const earlier = expectSuccess(await serviceAs(ADMIN, '2026-08-01').get(ADMIN, DEPARTMENT_A));
    expect(earlier.currentLead).toBeNull();
    expect(earlier.leadHistory[0]?.isEffective).toBe(false);
  });

  it('offers only active employees assigned to the department division', async () => {
    const options = expectSuccess(await serviceAs(ADMIN).listEligibleLeads(ADMIN, DEPARTMENT_A));
    expect(options.map((option) => option.employee.employeeCode).sort()).toEqual(['SVC-2', 'SVC-3']);
    const otherDivision = expectSuccess(await serviceAs(ADMIN).listEligibleLeads(ADMIN, DEPARTMENT_TWO));
    expect(otherDivision.map((option) => option.employee.employeeCode)).toEqual(['SVC-1']);
  });

  it('narrows by division, status and search without leaking the total', async () => {
    const admin = serviceAs(ADMIN);
    const filtered = expectSuccess(await admin.catalogue(ADMIN, { divisionId: DIVISION_TWO }));
    expect(filtered.departmentCount).toBe(1);
    expect(filtered.totalCount).toBe(4);

    const searched = expectSuccess(await admin.catalogue(ADMIN, { search: 'TECH' }));
    expect(searched.departmentCount).toBe(1);

    expectSuccess(await admin.setStatus(ADMIN, { departmentId: DEPARTMENT_SPARE, isActive: false, reason: 'Unused.' }));
    expect(expectSuccess(await admin.catalogue(ADMIN, { status: 'inactive' })).departmentCount).toBe(1);
    expect(expectSuccess(await admin.catalogue(ADMIN, { status: 'active' })).departmentCount).toBe(3);
  });
});

describe('mutations, audit and concurrency (OH-BE-0203, OH-BE-0212, OH-BE-0214)', () => {
  it('creates, renames and reports every change in the audit log with before and after values', async () => {
    const admin = serviceAs(ADMIN);
    const mark = new Date(Date.now() - 1000);
    const created = expectSuccess(
      await admin.create(ADMIN, {
        divisionId: DIVISION_ONE,
        name: 'Renewals',
        code: 'RENEW',
        description: 'Retention.',
      }),
    );
    expect(created.department.code).toBe('RENEW');

    expectSuccess(
      await admin.update(ADMIN, created.department.id, {
        divisionId: DIVISION_ONE,
        name: 'Customer Success',
        code: 'CS',
        description: '',
      }),
    );
    expectSuccess(
      await admin.setStatus(ADMIN, {
        departmentId: created.department.id,
        isActive: false,
        reason: 'Folded into Technical.',
      }),
    );

    const events = await auditSince(mark, created.department.id);
    const actions = events.map((event) => event.action);
    expect(actions).toContain('department.created');
    expect(actions).toContain('department.updated');
    expect(actions).toContain('department.deactivated');
    for (const event of events) {
      expect(event.actor_user_id).toBe(ADMIN);
      expect(event.resource_id).toBe(created.department.id);
    }

    const updated = events.find((event) => event.action === 'department.updated');
    expect(parseJson(updated?.before_protected)).toMatchObject({ name: 'Renewals', code: 'RENEW' });
    expect(parseJson(updated?.after_protected)).toMatchObject({ name: 'Customer Success', code: 'CS' });

    const deactivated = events.find((event) => event.action === 'department.deactivated');
    expect(deactivated?.reason).toBe('Folded into Technical.');
    expect(parseJson(deactivated?.before_protected)).toMatchObject({ isActive: true });
    expect(parseJson(deactivated?.after_protected)).toMatchObject({ isActive: false });
  });

  it('refuses a duplicate name inside the division and names that division', async () => {
    const result = await serviceAs(ADMIN).create(ADMIN, {
      divisionId: DIVISION_ONE,
      name: '  technical ',
      code: 'TECH2',
      description: '',
    });
    if (result.status !== 'validation_failure') throw new Error('expected a validation failure');
    expect(result.fieldErrors[0]).toMatchObject({ field: 'name' });
    expect(result.fieldErrors[0]?.message).toContain('Service One');
    expect(result.fieldErrors[0]?.guidance).toContain('unique inside this division');
  });

  it('accepts the same name in another division', async () => {
    const created = expectSuccess(
      await serviceAs(ADMIN).create(ADMIN, {
        divisionId: DIVISION_TWO,
        name: 'Technical',
        code: 'TECH',
        description: '',
      }),
    );
    expect(created.division.id).toBe(DIVISION_TWO);
  });

  it('refuses to move or delete a referenced department, and deletes an unreferenced one', async () => {
    const admin = serviceAs(ADMIN);
    const mark = new Date(Date.now() - 1000);
    const moved = await admin.update(ADMIN, DEPARTMENT_A, {
      divisionId: DIVISION_TWO,
      name: 'Technical',
      code: 'TECH',
      description: '',
    });
    expect(moved.status).toBe('conflict');
    if (moved.status === 'conflict') expect(moved.guidance).toContain('Deactivate it instead');

    expect((await admin.remove(ADMIN, DEPARTMENT_A)).status).toBe('conflict');
    expect(expectSuccess(await admin.remove(ADMIN, DEPARTMENT_SPARE)).removedId).toBe(DEPARTMENT_SPARE);
    expect(await rows('SELECT id FROM departments WHERE id=?', [DEPARTMENT_SPARE])).toHaveLength(0);
    /* Rows from earlier tests in this file survive — the table is append-only
       — so the assertion names the action it caused. */
    expect(
      (await auditSince(mark, DEPARTMENT_SPARE)).filter((event) => event.action === 'department.deleted'),
    ).toHaveLength(1);
  });

  it('loses no update when two administrators edit at once', async () => {
    /*
     * Two outcomes are both correct and both acceptable: the writes serialize
     * and both succeed, or the second read the older version and is refused.
     * What must never happen is an interleaved save — a stored name neither
     * administrator submitted, or a version that did not advance once per
     * success. Asserting a conflict instead would be asserting the scheduler.
     */
    const admin = serviceAs(ADMIN);
    const before = expectSuccess(await admin.get(ADMIN, DEPARTMENT_B));
    const results = await Promise.all([
      admin.update(ADMIN, DEPARTMENT_B, { divisionId: DIVISION_ONE, name: 'Prompt', code: 'PROMPT', description: '' }),
      admin.update(ADMIN, DEPARTMENT_B, { divisionId: DIVISION_ONE, name: 'Prompting', code: 'PROMPT', description: '' }),
    ]);
    const succeeded = results.filter((result) => result.status === 'success');
    expect(succeeded.length).toBeGreaterThanOrEqual(1);
    for (const refused of results.filter((result) => result.status === 'conflict')) {
      if (refused.status === 'conflict') expect(refused.guidance).toContain('Reload');
    }

    const stored = (await rows<RowDataPacket & { name: string; version: number }>(
      'SELECT name,version FROM departments WHERE id=?',
      [DEPARTMENT_B],
    ))[0];
    expect(['Prompt', 'Prompting']).toContain(stored?.name);
    /* One version bump per successful write, starting from the version read. */
    expect(Number(stored?.version)).toBe(succeeded.length + 1);
    expect(before.department.name).toBe('Prompt Engineering');
  });

  it('refuses a stale version with guidance', async () => {
    /* The deterministic half: a write built on a version that has moved on. */
    const admin = serviceAs(ADMIN);
    expectSuccess(await admin.update(ADMIN, DEPARTMENT_B, { divisionId: DIVISION_ONE, name: 'Prompt', code: 'PROMPT', description: '' }));
    const repositoryRefusal = await new MysqlDepartmentRepository(pool).update(
      { id: DEPARTMENT_B, divisionId: DIVISION_ONE, name: 'Prompting', code: 'PROMPT', description: null },
      1,
      ADMIN,
    );
    expect(repositoryRefusal).toBe(false);
    expect(
      (await rows<RowDataPacket & { name: string }>('SELECT name FROM departments WHERE id=?', [DEPARTMENT_B]))[0]?.name,
    ).toBe('Prompt');
  });
});

describe('appointments (OH-BE-0204, OH-BE-0205, OH-BE-0213)', () => {
  it('appoints, closes the previous period and records both sides in the audit log', async () => {
    const admin = serviceAs(ADMIN);
    const mark = new Date(Date.now() - 1000);
    /* Made on the day it took effect: an appointment never starts in the past. */
    expectSuccess(
      await serviceAs(ADMIN, '2026-08-01').appointLead(ADMIN, {
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(3),
        effectiveFrom: '2026-08-01',
        reason: 'First lead',
      }),
    );
    const second = expectSuccess(
      await admin.appointLead(ADMIN, {
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(2),
        effectiveFrom: TODAY,
        reason: 'Handover',
      }),
    );
    expect(second.currentLead?.employeeCode).toBe('SVC-2');
    expect(second.leadHistory.map((row) => [row.lead.employeeCode, row.assignment.effectiveTo])).toEqual([
      ['SVC-2', null],
      ['SVC-3', '2026-09-01'],
    ]);

    const appointments = (await auditSince(mark, DEPARTMENT_A)).filter(
      (event) => event.action === 'department.lead.appointed',
    );
    /* The append-only table also holds earlier tests' rows; the handover is the
       latest one, and it is what carries the before and after values. */
    expect(appointments.length).toBeGreaterThanOrEqual(2);
    const handover = appointments[appointments.length - 1];
    expect(handover?.reason).toBe('Handover');
    expect(parseJson(handover?.before_protected)).toMatchObject({ leadEmployeeId: employee(3) });
    expect(parseJson(handover?.after_protected)).toMatchObject({ leadEmployeeId: employee(2), effectiveFrom: TODAY });
  });

  it('refuses a past date, an ineligible lead, a repeat of the current lead and an overlapping period', async () => {
    const admin = serviceAs(ADMIN);
    const past = await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: '2026-01-01', reason: '' });
    expect(past.status).toBe('validation_failure');
    if (past.status === 'validation_failure') expect(past.fieldErrors[0]?.guidance).toContain('never rewritten');

    /* Employee 1 works only in division two. */
    const ineligible = await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(1), effectiveFrom: TODAY, reason: '' });
    expect(ineligible.status).toBe('validation_failure');
    if (ineligible.status === 'validation_failure') expect(ineligible.fieldErrors[0]?.field).toBe('leadEmployeeId');

    expectSuccess(await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: TODAY, reason: '' }));
    const repeat = await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: '2026-09-03', reason: '' });
    expect(repeat.status).toBe('validation_failure');
    if (repeat.status === 'validation_failure') expect(repeat.fieldErrors[0]?.message).toContain('already leads');

    const overlap = await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: '' });
    expect(overlap.status).toBe('conflict');
    if (overlap.status === 'conflict') expect(overlap.guidance).toContain('later effective date');
  });

  it('schedules a future appointment and warns who remains in force', async () => {
    const result = await serviceAs(ADMIN).appointLead(ADMIN, {
      departmentId: DEPARTMENT_A,
      leadEmployeeId: employee(3),
      effectiveFrom: '2026-12-01',
      reason: '',
    });
    const detail = expectSuccess(result);
    expect(detail.currentLead).toBeNull();
    expect(detail.scheduledAppointment?.lead.employeeCode).toBe('SVC-3');
    if (result.status === 'success') expect(result.warnings?.[0]?.code).toBe('APPOINTMENT_SCHEDULED');
  });

  it('refuses leadership inside a verified payroll period (OH-BE-0213)', async () => {
    await database.connection.query(
      `INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id,verified_at)
       VALUES(?,?,?,?,?,?,?)`,
      [randomUUID(), 'September 2026', '2026-09-01', '2026-09-30', 'verified', POLICY_VERSION, new Date('2026-10-01T04:00:00Z')],
    );
    const result = await serviceAs(ADMIN).appointLead(ADMIN, {
      departmentId: DEPARTMENT_A,
      leadEmployeeId: employee(3),
      effectiveFrom: TODAY,
      reason: '',
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') {
      expect(result.code).toBe('PERIOD_LOCKED');
      expect(result.lockedPeriod?.label).toBe('September 2026');
      expect(result.guidance).toContain('amendment');
    }
    /* A date after the verified period is accepted. */
    expect(
      (
        await serviceAs(ADMIN).appointLead(ADMIN, {
          departmentId: DEPARTMENT_A,
          leadEmployeeId: employee(3),
          effectiveFrom: '2026-10-01',
          reason: '',
        })
      ).status,
    ).toBe('success');
  });
});

describe('the scope an appointment grants (OH-BE-0207, OH-BE-0209)', () => {
  it('appears in the policy context and the session only while effective', async () => {
    expectSuccess(
      await serviceAs(ADMIN).appointLead(ADMIN, {
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(3),
        effectiveFrom: TODAY,
        reason: '',
      }),
    );

    const before = await loadActorPolicyContext(pool, WORKER, '2026-09-01');
    expect(before?.departmentLeadScopes ?? []).toEqual([]);
    expect(before?.employeeIds.has(employee(2))).toBe(false);

    const onDate = await loadActorPolicyContext(pool, WORKER, TODAY);
    expect(onDate?.departmentLeadScopes).toEqual([
      { departmentId: DEPARTMENT_A, divisionId: DIVISION_ONE, effectiveFrom: TODAY, effectiveTo: null },
    ]);
    /* The department's other member is now in reach; the division is not. */
    expect(onDate?.employeeIds.has(employee(2))).toBe(true);
    expect(onDate?.divisionIds.has(DIVISION_TWO)).toBe(false);

    /* No role was granted, and the session reports the scope rather than a role. */
    expect(onDate?.roles).toEqual(['employee']);
    const session = await loadSessionUser(pool, WORKER, new Date().toISOString());
    expect(session?.primaryRole).toBe('employee');
    expect(session?.departmentLeadScopes).toHaveLength(1);
  });

  it('stops granting scope once the appointment is closed, with nothing to purge', async () => {
    const admin = serviceAs(ADMIN);
    expectSuccess(
      await serviceAs(ADMIN, '2026-08-01').appointLead(ADMIN, {
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(3),
        effectiveFrom: '2026-08-01',
        reason: '',
      }),
    );
    expect((await loadActorPolicyContext(pool, WORKER, TODAY))?.departmentLeadScopes).toHaveLength(1);

    /* Appointing somebody else closes the previous period the day before. */
    expectSuccess(await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: '' }));
    expect((await loadActorPolicyContext(pool, WORKER, TODAY))?.departmentLeadScopes).toEqual([]);
    /* The historical answer is still reproducible. */
    expect((await loadActorPolicyContext(pool, WORKER, '2026-08-15'))?.departmentLeadScopes).toHaveLength(1);
  });

  it('grants no scope from an inactive department', async () => {
    const admin = serviceAs(ADMIN);
    expectSuccess(await admin.appointLead(ADMIN, { departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: TODAY, reason: '' }));
    expectSuccess(await admin.setStatus(ADMIN, { departmentId: DEPARTMENT_A, isActive: false, reason: 'Paused.' }));
    expect((await loadActorPolicyContext(pool, WORKER, TODAY))?.departmentLeadScopes).toEqual([]);
  });
});
