import { createHash, randomUUID } from 'node:crypto';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { MysqlDepartmentRepository } from './departments';
import {
  authorityForEmployee,
  departmentsOfEmployee,
  employeesLedBy,
  leadsOfEmployee,
  primaryLeadOfEmployee,
} from './department-authority';

/**
 * `OH-BE-0301` … `OH-BE-0313` — workflow authority against MySQL.
 *
 * Every rewired surface asks the same two questions: who leads this employee on
 * this date, and whom does this lead reach. These cases pin the answers at the
 * boundaries that matter — a transfer between departments, a change of lead, an
 * appointment's first and last day, an unplaced assignment still routing on its
 * frozen legacy lead, one employee leading departments in two divisions, and a
 * restricted Government Projects department.
 */

const DIVISION_ONE = '10000000-0000-4000-8000-0000000000f1';
const DIVISION_GOV = '10000000-0000-4000-8000-0000000000f2';
const DEPARTMENT_A = '22000000-0000-4000-8000-0000000000f1';
const DEPARTMENT_B = '22000000-0000-4000-8000-0000000000f2';
const DEPARTMENT_GOV = '22000000-0000-4000-8000-0000000000f3';
const ROLE_EMPLOYEE = '20000000-0000-4000-8000-0000000000f3';
const PERMISSION_GOVERNMENT = '21000000-0000-4000-8000-0000000000f5';

const pad = (n: number) => String(n).padStart(12, '0');
const user = (n: number) => `30000000-0000-4000-8000-${pad(n)}`;
const employee = (n: number) => `40000000-0000-4000-8000-${pad(n)}`;
const assignment = (n: number) => `70000000-0000-4000-8000-${pad(n)}`;
const period = (n: number) => `80000000-0000-4000-8000-${pad(n)}`;

/** 1 = the lead, 2 = a member of A, 3 = a member of B, 4 = a government member. */
const LEAD = employee(1);
const MEMBER_A = employee(2);
const MEMBER_B = employee(3);
const MEMBER_GOV = employee(4);

const TODAY = '2026-09-02';

let database: IsolatedDatabase;
let pool: Pool;

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
    DELETE FROM auth_sessions;
    DELETE FROM department_lead_assignments;
    DELETE FROM employee_division_assignments;
    DELETE FROM departments;
    DELETE FROM scoped_grants;
    DELETE FROM user_roles;
    DELETE FROM role_permissions;
    DELETE FROM permissions;
    DELETE FROM roles;
    DELETE FROM employees;
    DELETE FROM users;
    DELETE FROM divisions;
    SET FOREIGN_KEY_CHECKS = 1;

    INSERT INTO divisions(id,division_key,name,is_government) VALUES
      ('${DIVISION_ONE}','flow-one','Flow One',FALSE),
      ('${DIVISION_GOV}','flow-gov','Flow Government',TRUE);

    INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES
      ${[1, 2, 3, 4]
        .map((n) => `('${user(n)}','Flow ${n}','flow${n}@example.test','flow${n}@example.test','FLW-${n}','active')`)
        .join(',')};

    INSERT INTO employees(id,user_id,employee_code,display_name,status) VALUES
      ${[1, 2, 3, 4]
        .map((n) => `('${employee(n)}','${user(n)}','FLW-${n}','Flow ${n}','active')`)
        .join(',')};

    INSERT INTO roles(id,role_key,name) VALUES('${ROLE_EMPLOYEE}','employee','Employee');
    INSERT INTO permissions(id,permission_key,name,sensitivity) VALUES
      ('${PERMISSION_GOVERNMENT}','organization.government.view','View government projects','government');
    INSERT INTO user_roles(id,user_id,role_id,effective_from) VALUES
      ${[1, 2, 3, 4]
        .map((n) => `('${randomUUID()}','${user(n)}','${ROLE_EMPLOYEE}','2025-01-01')`)
        .join(',')};

    INSERT INTO departments(id,division_id,name,code) VALUES
      ('${DEPARTMENT_A}','${DIVISION_ONE}','Technical','TECH'),
      ('${DEPARTMENT_B}','${DIVISION_ONE}','Prompt Engineering','PROMPT'),
      ('${DEPARTMENT_GOV}','${DIVISION_GOV}','Delivery','DLV');

    INSERT INTO employee_division_assignments(
      id,employee_id,division_id,department_id,lead_employee_id,effective_from,effective_to,
      allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active) VALUES
      -- The lead works in both divisions, so they are eligible in both.
      ('${assignment(1)}','${LEAD}','${DIVISION_ONE}','${DEPARTMENT_A}',NULL,'2025-01-01',NULL,6000,2100,TRUE,TRUE),
      ('${assignment(2)}','${LEAD}','${DIVISION_GOV}','${DEPARTMENT_GOV}',NULL,'2025-01-01',NULL,4000,2100,FALSE,TRUE),
      -- Member A transfers from Technical to Prompt Engineering on 1 September.
      ('${assignment(3)}','${MEMBER_A}','${DIVISION_ONE}','${DEPARTMENT_A}',NULL,'2025-01-01','2026-08-31',10000,2100,FALSE,TRUE),
      ('${assignment(4)}','${MEMBER_A}','${DIVISION_ONE}','${DEPARTMENT_B}',NULL,'2026-09-01',NULL,10000,2100,TRUE,TRUE),
      -- Member B is never placed: the Phase B1 backfill could not map them, so
      -- they still route on the frozen legacy lead.
      ('${assignment(5)}','${MEMBER_B}','${DIVISION_ONE}',NULL,'${LEAD}','2025-01-01',NULL,10000,2100,TRUE,TRUE),
      ('${assignment(6)}','${MEMBER_GOV}','${DIVISION_GOV}','${DEPARTMENT_GOV}',NULL,'2025-01-01',NULL,10000,2100,TRUE,TRUE);

    INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,effective_to) VALUES
      -- Technical: led by MEMBER_B until 31 August, by LEAD from 1 September.
      ('${period(1)}','${DEPARTMENT_A}','${MEMBER_B}','2025-01-01','2026-08-31'),
      ('${period(2)}','${DEPARTMENT_A}','${LEAD}','2026-09-01',NULL),
      ('${period(3)}','${DEPARTMENT_B}','${LEAD}','2026-09-01',NULL),
      ('${period(4)}','${DEPARTMENT_GOV}','${LEAD}','2026-09-01',NULL);
  `);

  for (const userId of [user(1), user(2), user(3), user(4)]) {
    await database.connection.query(
      'INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)',
      [randomUUID(), userId, createHash('sha256').update(`token-${userId}`).digest('hex'), new Date(Date.now() + 86_400_000)],
    );
  }
});

async function rows<T extends RowDataPacket>(sql: string, values: unknown[] = []) {
  const [result] = await pool.query<T[]>(sql, values);
  return result;
}

describe('effective-date boundaries (OH-BE-0312)', () => {
  it('answers a lead change on the day before and the day of its start', () => {
    return (async () => {
      expect(await primaryLeadOfEmployee(pool, MEMBER_A, '2026-08-31')).toBe(MEMBER_B);
      expect(await primaryLeadOfEmployee(pool, MEMBER_A, '2026-09-01')).toBe(LEAD);
    })();
  });

  it('follows a transfer between departments on its first effective day', async () => {
    /* 31 August: still Technical, whose lead then was MEMBER_B. */
    const before = await authorityForEmployee(pool, MEMBER_A, '2026-08-31');
    expect(before.map((row) => [row.departmentId, row.leadEmployeeId])).toEqual([
      [DEPARTMENT_A, MEMBER_B],
    ]);
    /* 1 September: Prompt Engineering, led by LEAD. */
    const after = await authorityForEmployee(pool, MEMBER_A, '2026-09-01');
    expect(after.map((row) => [row.departmentId, row.leadEmployeeId])).toEqual([
      [DEPARTMENT_B, LEAD],
    ]);
    expect((await departmentsOfEmployee(pool, MEMBER_A, TODAY)).map((row) => row.departmentId)).toEqual([
      DEPARTMENT_B,
    ]);
  });

  it('grants nothing from an appointment that has not started or has ended', async () => {
    expect(await employeesLedBy(pool, LEAD, '2026-08-31')).toEqual([MEMBER_B]);
    expect([...(await employeesLedBy(pool, LEAD, TODAY))].sort()).toEqual([MEMBER_A, MEMBER_B, MEMBER_GOV].sort());
    /*
     * MEMBER_B led Technical until 31 August and nothing after. Technical's
     * members then were MEMBER_A and LEAD — who is placed there too, so on that
     * date the eventual lead was himself led by MEMBER_B. Leadership is a
     * property of the department on a date, not a rank.
     */
    expect([...(await employeesLedBy(pool, MEMBER_B, '2026-08-31'))].sort()).toEqual([LEAD, MEMBER_A].sort());
    expect(await employeesLedBy(pool, MEMBER_B, TODAY)).toEqual([]);
  });

  it('keeps routing an unplaced assignment on its frozen legacy lead', async () => {
    const authority = await authorityForEmployee(pool, MEMBER_B, TODAY);
    expect(authority).toEqual([
      expect.objectContaining({ departmentId: null, leadEmployeeId: LEAD, fromDepartment: false }),
    ]);
    /* And the same answer on a date before any appointment existed. */
    expect(await primaryLeadOfEmployee(pool, MEMBER_B, '2024-01-01')).toBeNull();
  });

  it('stops granting scope when the department is deactivated', async () => {
    expect((await employeesLedBy(pool, LEAD, TODAY)).includes(MEMBER_A)).toBe(true);
    await new MysqlDepartmentRepository(pool).setActive(DEPARTMENT_B, false, 'Paused.', 1, user(1));
    expect((await employeesLedBy(pool, LEAD, TODAY)).includes(MEMBER_A)).toBe(false);
  });
});

describe('multi-department leadership across divisions (OH-BE-0313)', () => {
  it('reaches every department the lead holds, in both divisions', async () => {
    const actor = await loadActorPolicyContext(pool, user(1), TODAY);
    expect([...(actor?.departmentIds ?? [])].sort()).toEqual([DEPARTMENT_A, DEPARTMENT_B, DEPARTMENT_GOV].sort());
    expect((actor?.departmentLeadScopes ?? []).map((scope) => scope.divisionId).sort()).toEqual(
      [DIVISION_ONE, DIVISION_ONE, DIVISION_GOV].sort(),
    );
    expect([...(actor?.employeeIds ?? [])].sort()).toEqual([LEAD, MEMBER_A, MEMBER_B, MEMBER_GOV].sort());
  });

  it('does not widen the divisions the lead may see', async () => {
    const actor = await loadActorPolicyContext(pool, user(1), TODAY);
    /* Both divisions appear only because the lead is assigned to both. */
    expect([...(actor?.divisionIds ?? [])].sort()).toEqual([DIVISION_ONE, DIVISION_GOV].sort());
    /* A member leading nothing gains no department scope at all. */
    const member = await loadActorPolicyContext(pool, user(2), TODAY);
    expect(member?.departmentIds?.size ?? 0).toBe(0);
    expect([...(member?.employeeIds ?? [])]).toEqual([MEMBER_A]);
  });

  it('still requires the government permission for a restricted department (OH-BE-0313)', async () => {
    /*
     * Leading a Government Projects department puts its members in reach, but
     * the restriction is a separate, unconditional check: the lead holds no
     * `organization.government.view` grant, so every surface that asks for it
     * still refuses. The scope and the sensitivity are deliberately not the
     * same question.
     */
    const actor = await loadActorPolicyContext(pool, user(1), TODAY);
    expect(actor?.permissions.has('organization.government.view')).toBe(false);
    expect(actor?.employeeIds.has(MEMBER_GOV)).toBe(true);

    await database.connection.query(
      'INSERT INTO role_permissions(role_id,permission_id) VALUES(?,?)',
      [ROLE_EMPLOYEE, PERMISSION_GOVERNMENT],
    );
    const granted = await loadActorPolicyContext(pool, user(1), TODAY);
    expect(granted?.permissions.has('organization.government.view')).toBe(true);
  });
});

describe('reconciliation for one date and scope (OH-BE-0311)', () => {
  it('gives the same lead and the same membership through every route', async () => {
    const onDate = TODAY;

    /* Route 1: the resolver used by workflows. */
    const fromResolver = (await employeesLedBy(pool, LEAD, onDate)).slice().sort();

    /* Route 2: the authorization context used by reports and search. */
    const actor = await loadActorPolicyContext(pool, user(1), onDate);
    const fromContext = [...(actor?.employeeIds ?? [])].filter((id) => id !== LEAD).sort();

    /* Route 3: the department detail the administration screen reads. */
    const repository = new MysqlDepartmentRepository(pool);
    const fromDepartments: string[] = [];
    for (const departmentId of [DEPARTMENT_A, DEPARTMENT_B, DEPARTMENT_GOV]) {
      for (const member of await repository.members(departmentId, onDate)) {
        if (member.isEffective && member.employeeId !== LEAD) fromDepartments.push(member.employeeId);
      }
    }

    /*
     * The resolver and the authorization context agree exactly, including
     * MEMBER_B, whose assignment has no department and still routes on its
     * frozen legacy lead — losing them during the compatibility deployment
     * would be the defect, not the agreement.
     *
     * Department membership is the narrower set by construction: an unplaced
     * assignment cannot appear in any department's members, which is precisely
     * what `department_migration_review` lists for completion.
     */
    expect(fromResolver).toEqual([MEMBER_A, MEMBER_B, MEMBER_GOV].sort());
    expect(fromContext).toEqual(fromResolver);
    expect(fromDepartments.sort()).toEqual([MEMBER_A, MEMBER_GOV].sort());
    for (const id of fromDepartments) expect(fromResolver).toContain(id);

    /* Each employee's own answer matches the lead's view of them. */
    for (const id of [MEMBER_A, MEMBER_GOV]) {
      expect(await leadsOfEmployee(pool, id, onDate)).toContain(LEAD);
    }
    /* And the stored row count matches what the repository reported. */
    const placements = await rows<RowDataPacket & { total: number }>(
      `SELECT COUNT(*) AS total FROM employee_division_assignments
       WHERE department_id IN (?,?,?) AND is_active=TRUE AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)`,
      [DEPARTMENT_A, DEPARTMENT_B, DEPARTMENT_GOV, onDate, onDate],
    );
    expect(Number(placements[0]?.total)).toBe(fromDepartments.length + 2);
  });
});
