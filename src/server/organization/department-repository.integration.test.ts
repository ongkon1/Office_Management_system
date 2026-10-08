import mysql, { type Pool } from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';
import { MysqlDepartmentRepository } from './departments';

/**
 * `OH-BE-0106`, `OH-BE-0107`, `OH-BE-0113` — the hierarchy repository against
 * MySQL, including the two races the locks exist for.
 *
 * The pure decisions are covered in `department-rules.unit.test.ts`. What needs
 * a database is everything around them: that a cross-division placement is
 * refused with an answer rather than a constraint violation, that appointing
 * closes the open period in the same transaction that appended the new one, and
 * that two writers racing for the same department produce one winner instead of
 * two overlapping truths.
 */

const DIVISION_ONE = '10000000-0000-4000-8000-0000000000b1';
const DIVISION_TWO = '10000000-0000-4000-8000-0000000000b2';
const DEPARTMENT_A = '20000000-0000-4000-8000-0000000000b1';
const DEPARTMENT_B = '20000000-0000-4000-8000-0000000000b2';
const DEPARTMENT_TWO = '20000000-0000-4000-8000-0000000000b3';
const DEPARTMENT_SPARE = '20000000-0000-4000-8000-0000000000b4';
/* Padded to twelve digits: CHAR(36) silently truncates a longer id, which made
   `period(12)` collide with `period(1)`. */
const suffix = (n: number) => String(n).padStart(12, '0');
const employee = (n: number) => `40000000-0000-4000-8000-${suffix(n)}`;
const user = (n: number) => `30000000-0000-4000-8000-${suffix(n)}`;
const assignment = (n: number) => `70000000-0000-4000-8000-${suffix(n)}`;
const period = (n: number) => `80000000-0000-4000-8000-${suffix(n)}`;

const TODAY = '2026-09-02';

let database: IsolatedDatabase;
let pool: Pool;
let repository: MysqlDepartmentRepository;

beforeAll(async () => {
  database = await createIsolatedDatabase();
  const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql';
  pool = mysql.createPool({
    uri: adminUrl.replace(/\/[^/]*$/, `/${database.name}`),
    connectionLimit: 6,
    timezone: 'Z',
  });
  repository = new MysqlDepartmentRepository(pool);
}, 90_000);

afterAll(async () => {
  await pool?.end();
  await database?.dispose();
});

/**
 * Division one owns departments A and B; division two owns one department.
 * Employee 1 works in both divisions, employee 2 only in division one, and
 * employee 3 is inactive.
 */
beforeEach(async () => {
  await database.connection.query(`
    SET FOREIGN_KEY_CHECKS = 0;
    DELETE FROM department_lead_assignments;
    DELETE FROM employee_division_assignments;
    DELETE FROM departments;
    DELETE FROM employees;
    DELETE FROM users;
    DELETE FROM divisions;
    SET FOREIGN_KEY_CHECKS = 1;

    INSERT INTO divisions(id,division_key,name,is_government) VALUES
      ('${DIVISION_ONE}','repo-one','Repo One',FALSE),
      ('${DIVISION_TWO}','repo-two','Repo Two',FALSE);

    INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES
      ('${user(1)}','Repo One','repo1@example.test','repo1@example.test','REP-1','active'),
      ('${user(2)}','Repo Two','repo2@example.test','repo2@example.test','REP-2','active'),
      ('${user(3)}','Repo Three','repo3@example.test','repo3@example.test','REP-3','inactive');

    INSERT INTO employees(id,user_id,employee_code,display_name,status) VALUES
      ('${employee(1)}','${user(1)}','REP-1','Repo One','active'),
      ('${employee(2)}','${user(2)}','REP-2','Repo Two','active'),
      ('${employee(3)}','${user(3)}','REP-3','Repo Three','inactive');

    INSERT INTO departments(id,division_id,name,code) VALUES
      ('${DEPARTMENT_A}','${DIVISION_ONE}','Technical','TECH'),
      ('${DEPARTMENT_B}','${DIVISION_ONE}','Prompt Engineering','PROMPT'),
      ('${DEPARTMENT_TWO}','${DIVISION_TWO}','Delivery','DLV'),
      ('${DEPARTMENT_SPARE}','${DIVISION_ONE}','Unused','UNUSED');

    INSERT INTO employee_division_assignments(
      id,employee_id,division_id,department_id,lead_employee_id,effective_from,effective_to,
      allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active) VALUES
      ('${assignment(1)}','${employee(1)}','${DIVISION_ONE}','${DEPARTMENT_A}',NULL,'2025-01-01',NULL,6000,2100,TRUE,TRUE),
      ('${assignment(2)}','${employee(1)}','${DIVISION_TWO}',NULL,NULL,'2025-06-01',NULL,4000,2100,FALSE,TRUE),
      ('${assignment(3)}','${employee(2)}','${DIVISION_ONE}',NULL,NULL,'2025-02-01',NULL,10000,2100,TRUE,TRUE),
      ('${assignment(4)}','${employee(2)}','${DIVISION_ONE}',NULL,NULL,'2024-01-01','2024-12-31',10000,2100,FALSE,FALSE),
      ('${assignment(5)}','${employee(3)}','${DIVISION_ONE}',NULL,NULL,'2025-01-01',NULL,10000,2100,TRUE,FALSE);

    INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,effective_to) VALUES
      ('${period(1)}','${DEPARTMENT_A}','${employee(1)}','2025-01-01',NULL),
      ('${period(2)}','${DEPARTMENT_A}','${employee(2)}','2024-01-01','2024-12-31');
  `);
});

describe('reads (OH-BE-0113)', () => {
  it('lists departments by division and hides inactive ones unless asked', async () => {
    await database.connection.query(
      `UPDATE departments SET is_active=FALSE, deactivated_at=NOW(6) WHERE id='${DEPARTMENT_SPARE}'`,
    );
    expect((await repository.list({ divisionId: DIVISION_ONE })).map((row) => row.code)).toEqual([
      'PROMPT',
      'TECH',
    ]);
    expect(
      (await repository.list({ divisionId: DIVISION_ONE, includeInactive: true })).map((row) => row.code),
    ).toEqual(['PROMPT', 'TECH', 'UNUSED']);
    expect((await repository.list()).map((row) => row.code)).toEqual(['PROMPT', 'TECH', 'DLV']);
  });

  it('returns members with effectiveness resolved on the date asked', async () => {
    const members = await repository.members(DEPARTMENT_A, TODAY);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({ employeeId: employee(1), isEffective: true });
    /* Before the placement began it is history, not a current member. */
    expect((await repository.members(DEPARTMENT_A, '2024-06-01'))[0]?.isEffective).toBe(false);
  });

  it('resolves current and historical leadership, and leaves gaps empty', async () => {
    expect((await repository.effectiveLead(DEPARTMENT_A, TODAY))?.leadEmployeeId).toBe(employee(1));
    expect((await repository.effectiveLead(DEPARTMENT_A, '2024-06-01'))?.leadEmployeeId).toBe(employee(2));
    expect(await repository.effectiveLead(DEPARTMENT_A, '2023-01-01')).toBeNull();
    expect((await repository.leadHistory(DEPARTMENT_A)).map((row) => row.id)).toEqual([
      period(1),
      period(2),
    ]);
  });

  it('grants a lead scope only inside the appointment dates', async () => {
    expect((await repository.leadScopes(employee(1), TODAY)).map((row) => row.departmentId)).toEqual([
      DEPARTMENT_A,
    ]);
    expect(await repository.leadScopes(employee(1), '2024-06-01')).toEqual([]);
    expect((await repository.leadScopes(employee(2), '2024-06-01')).map((row) => row.divisionId)).toEqual([
      DIVISION_ONE,
    ]);
    /* An inactive department grants nothing, even inside the dates. */
    await database.connection.query(
      `UPDATE departments SET is_active=FALSE, deactivated_at=NOW(6) WHERE id='${DEPARTMENT_A}'`,
    );
    expect(await repository.leadScopes(employee(1), TODAY)).toEqual([]);
  });

  it('counts every reference, including ended placements and closed appointments', async () => {
    expect(await repository.referenceCounts(DEPARTMENT_A)).toEqual({
      placementCount: 1,
      appointmentCount: 2,
    });
    expect(await repository.referenceCounts(DEPARTMENT_SPARE)).toEqual({
      placementCount: 0,
      appointmentCount: 0,
    });
  });
});

describe('placement (OH-BE-0106)', () => {
  it('places an assignment in a department of its own division', async () => {
    expect(await repository.placeAssignment(assignment(3), DEPARTMENT_B, null, user(1))).toEqual({
      status: 'placed',
    });
    expect((await repository.members(DEPARTMENT_B, TODAY)).map((row) => row.employeeId)).toEqual([
      employee(2),
    ]);
  });

  it('refuses a department from another division with an answer, not a constraint error', async () => {
    expect(await repository.placeAssignment(assignment(2), DEPARTMENT_A, null, user(1))).toEqual({
      status: 'different_division',
      departmentDivisionId: DIVISION_ONE,
    });
  });

  it('refuses an inactive department, a missing department and a missing assignment', async () => {
    await database.connection.query(
      `UPDATE departments SET is_active=FALSE, deactivated_at=NOW(6) WHERE id='${DEPARTMENT_B}'`,
    );
    expect((await repository.placeAssignment(assignment(3), DEPARTMENT_B, null, user(1))).status).toBe(
      'department_inactive',
    );
    expect(
      (await repository.placeAssignment(assignment(3), DEPARTMENT_SPARE.replace('b4', 'bf'), null, user(1)))
        .status,
    ).toBe('department_missing');
    expect(
      (await repository.placeAssignment(assignment(9), DEPARTMENT_B, null, user(1))).status,
    ).toBe('assignment_missing');
  });

  it('refuses a second department for the same employee, division and date', async () => {
    /* A second overlapping active assignment in division one for employee 1. */
    await database.connection.query(
      `INSERT INTO employee_division_assignments(
         id,employee_id,division_id,department_id,effective_from,
         allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active)
       VALUES('${assignment(6)}','${employee(1)}','${DIVISION_ONE}',NULL,'2026-01-01',2000,2100,FALSE,TRUE)`,
    );
    expect(await repository.placeAssignment(assignment(6), DEPARTMENT_B, null, user(1))).toEqual({
      status: 'conflicting_placement',
      assignmentId: assignment(1),
      departmentId: DEPARTMENT_A,
    });
    /* The same department twice is not a conflict. */
    expect((await repository.placeAssignment(assignment(6), DEPARTMENT_A, null, user(1))).status).toBe(
      'placed',
    );
  });

  it('reports a stale version instead of overwriting a concurrent edit', async () => {
    expect((await repository.placeAssignment(assignment(3), DEPARTMENT_B, 99, user(1))).status).toBe(
      'stale_version',
    );
  });

  it('serializes two writers racing to place overlapping assignments', async () => {
    await database.connection.query(
      `INSERT INTO employee_division_assignments(
         id,employee_id,division_id,department_id,effective_from,
         allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active)
       VALUES
         ('${assignment(7)}','${employee(2)}','${DIVISION_ONE}',NULL,'2026-01-01',2000,2100,FALSE,TRUE),
         ('${assignment(8)}','${employee(2)}','${DIVISION_ONE}',NULL,'2026-02-01',2000,2100,FALSE,TRUE)`,
    );
    const [first, second] = await Promise.all([
      repository.placeAssignment(assignment(7), DEPARTMENT_A, null, user(1)),
      repository.placeAssignment(assignment(8), DEPARTMENT_B, null, user(1)),
    ]);
    const outcomes = [first.status, second.status].sort();
    expect(outcomes).toEqual(['conflicting_placement', 'placed']);
  });
});

describe('appointment (OH-BE-0107)', () => {
  it('closes the open period the day before and appends the new one', async () => {
    const outcome = await repository.appointLead(
      {
        id: period(5),
        departmentId: DEPARTMENT_A,
        leadEmployeeId: employee(2),
        effectiveFrom: TODAY,
        reason: 'Handover',
      },
      user(1),
    );
    expect(outcome).toEqual({ status: 'appointed', closedPeriodId: period(1) });

    const history = await repository.leadHistory(DEPARTMENT_A);
    expect(history.map((row) => [row.leadEmployeeId, row.effectiveFrom, row.effectiveTo])).toEqual([
      [employee(2), '2026-09-02', null],
      [employee(1), '2025-01-01', '2026-09-01'],
      [employee(2), '2024-01-01', '2024-12-31'],
    ]);
    expect((await repository.effectiveLead(DEPARTMENT_A, TODAY))?.leadEmployeeId).toBe(employee(2));
    /* The historical answer is unchanged by the new appointment. */
    expect((await repository.effectiveLead(DEPARTMENT_A, '2026-01-01'))?.leadEmployeeId).toBe(employee(1));
  });

  it('schedules a future appointment without disturbing today', async () => {
    expect(
      (
        await repository.appointLead(
          {
            id: period(6),
            departmentId: DEPARTMENT_A,
            leadEmployeeId: employee(2),
            effectiveFrom: '2026-12-01',
            reason: null,
          },
          user(1),
        )
      ).status,
    ).toBe('appointed');
    expect((await repository.effectiveLead(DEPARTMENT_A, TODAY))?.leadEmployeeId).toBe(employee(1));
    expect((await repository.effectiveLead(DEPARTMENT_A, '2026-12-01'))?.leadEmployeeId).toBe(employee(2));
  });

  it('refuses a date an existing appointment already starts on or after', async () => {
    await repository.appointLead(
      { id: period(6), departmentId: DEPARTMENT_A, leadEmployeeId: employee(2), effectiveFrom: '2026-12-01', reason: null },
      user(1),
    );
    expect(
      await repository.appointLead(
        { id: period(7), departmentId: DEPARTMENT_A, leadEmployeeId: employee(1), effectiveFrom: '2026-10-01', reason: null },
        user(1),
      ),
    ).toEqual({ status: 'period_overlap', periodId: period(6) });
  });

  it('refuses reappointing the employee who already holds the open period', async () => {
    expect(
      await repository.appointLead(
        { id: period(8), departmentId: DEPARTMENT_A, leadEmployeeId: employee(1), effectiveFrom: TODAY, reason: null },
        user(1),
      ),
    ).toEqual({ status: 'already_leads', periodId: period(1) });
  });

  it('refuses a lead who is inactive or not assigned to the division', async () => {
    /* Employee 3 is inactive; employee 2 has no division-two assignment. */
    expect(
      (
        await repository.appointLead(
          { id: period(9), departmentId: DEPARTMENT_A, leadEmployeeId: employee(3), effectiveFrom: TODAY, reason: null },
          user(1),
        )
      ).status,
    ).toBe('ineligible_lead');
    expect(
      (
        await repository.appointLead(
          { id: period(9), departmentId: DEPARTMENT_TWO, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: null },
          user(1),
        )
      ).status,
    ).toBe('ineligible_lead');
    /* Employee 1 does work in division two, so that department accepts them. */
    expect(
      (
        await repository.appointLead(
          { id: period(9), departmentId: DEPARTMENT_TWO, leadEmployeeId: employee(1), effectiveFrom: TODAY, reason: null },
          user(1),
        )
      ).status,
    ).toBe('appointed');
  });

  it('refuses an inactive or missing department', async () => {
    await database.connection.query(
      `UPDATE departments SET is_active=FALSE, deactivated_at=NOW(6) WHERE id='${DEPARTMENT_B}'`,
    );
    expect(
      (
        await repository.appointLead(
          { id: period(10), departmentId: DEPARTMENT_B, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: null },
          user(1),
        )
      ).status,
    ).toBe('department_inactive');
    expect(
      (
        await repository.appointLead(
          {
            id: period(10),
            departmentId: DEPARTMENT_SPARE.replace('b4', 'bf'),
            leadEmployeeId: employee(2),
            effectiveFrom: TODAY,
            reason: null,
          },
          user(1),
        )
      ).status,
    ).toBe('department_missing');
  });

  it('lets one employee lead departments in two divisions at once', async () => {
    expect(
      (
        await repository.appointLead(
          { id: period(11), departmentId: DEPARTMENT_TWO, leadEmployeeId: employee(1), effectiveFrom: TODAY, reason: null },
          user(1),
        )
      ).status,
    ).toBe('appointed');
    expect((await repository.leadScopes(employee(1), TODAY)).map((row) => row.departmentId).sort()).toEqual(
      [DEPARTMENT_A, DEPARTMENT_TWO].sort(),
    );
  });

  it('produces one winner when two writers appoint from the same date', async () => {
    const outcomes = await Promise.all([
      repository.appointLead(
        { id: period(12), departmentId: DEPARTMENT_A, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: null },
        user(1),
      ),
      repository.appointLead(
        { id: period(13), departmentId: DEPARTMENT_A, leadEmployeeId: employee(2), effectiveFrom: TODAY, reason: null },
        user(1),
      ),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'appointed')).toHaveLength(1);
    /* The loser is refused, not silently merged into an overlapping period. */
    expect(outcomes.some((outcome) => outcome.status !== 'appointed')).toBe(true);
    const open = (await repository.leadHistory(DEPARTMENT_A)).filter((row) => row.effectiveTo === null);
    expect(open).toHaveLength(1);
  });
});

describe('deletion (OH-BE-0113)', () => {
  it('refuses a referenced department and deletes one nothing has used', async () => {
    expect(await repository.deleteIfUnreferenced(DEPARTMENT_A)).toBe('referenced');
    expect(await repository.deleteIfUnreferenced(DEPARTMENT_SPARE)).toBe('deleted');
    expect(await repository.deleteIfUnreferenced(DEPARTMENT_SPARE)).toBe('missing');
  });

  it('keeps a department that only history references', async () => {
    /* Placement ended long ago; the department still carries that history. */
    await database.connection.query(
      `UPDATE employee_division_assignments SET department_id='${DEPARTMENT_SPARE}' WHERE id='${assignment(4)}'`,
    );
    expect(await repository.deleteIfUnreferenced(DEPARTMENT_SPARE)).toBe('referenced');
  });
});

describe('optimistic concurrency (OH-BE-0113)', () => {
  it('bumps the version on write and refuses a stale one', async () => {
    const before = await repository.findById(DEPARTMENT_SPARE);
    expect(before?.version).toBe(1);
    expect(
      await repository.update(
        {
          id: DEPARTMENT_SPARE,
          divisionId: DIVISION_ONE,
          name: 'Renewals',
          code: 'RENEW',
          description: null,
        },
        1,
        user(1),
      ),
    ).toBe(true);
    const after = await repository.findById(DEPARTMENT_SPARE);
    expect(after).toMatchObject({ name: 'Renewals', code: 'RENEW', version: 2 });
    expect(
      await repository.update(
        {
          id: DEPARTMENT_SPARE,
          divisionId: DIVISION_ONE,
          name: 'Renewals Again',
          code: 'RENEW',
          description: null,
        },
        1,
        user(1),
      ),
    ).toBe(false);
  });

  it('records a deactivation reason and clears it on reactivation', async () => {
    expect(await repository.setActive(DEPARTMENT_SPARE, false, 'Folded into Technical.', 1, user(1))).toBe(true);
    expect(await repository.findById(DEPARTMENT_SPARE)).toMatchObject({
      isActive: false,
      deactivationReason: 'Folded into Technical.',
      version: 2,
    });
    expect(await repository.setActive(DEPARTMENT_SPARE, true, null, 2, user(1))).toBe(true);
    expect(await repository.findById(DEPARTMENT_SPARE)).toMatchObject({
      isActive: true,
      deactivationReason: null,
    });
  });

  it('inserts a department with its audit actor', async () => {
    await repository.insert(
      {
        id: period(20),
        divisionId: DIVISION_TWO,
        name: 'Compliance',
        code: 'COMP',
        description: 'Government reporting.',
      },
      user(1),
    );
    expect(await repository.findById(period(20))).toMatchObject({
      divisionId: DIVISION_TWO,
      name: 'Compliance',
      code: 'COMP',
      version: 1,
    });
  });
});
