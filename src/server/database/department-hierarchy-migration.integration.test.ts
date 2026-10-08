import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterEach, describe, expect, it } from 'vitest';

import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';

/**
 * `OH-BE-0108`–`OH-BE-0111`, `OH-BE-0114` — migration 0013 rehearsed.
 *
 * Two runs are required by the phase's exit criteria and both are here: an
 * empty database, and a representative upgrade carrying the legacy
 * employee-level department string with every shape the backfill has to decide
 * about — a clean mapping, a casing variant, two divisions sharing a name, a
 * name that exists only in another division, a missing value, a department
 * whose members disagree about their lead, and a lead who is no longer
 * eligible. The run ends by exercising the recovery script, because a migration
 * that cannot be reversed is not finished.
 */

let database: IsolatedDatabase | undefined;
afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

const FORWARD = join(process.cwd(), 'drizzle', '0013_department_hierarchy.sql');
const RECOVERY = join(process.cwd(), 'drizzle', 'recovery', '0013_department_hierarchy.sql');

const DIVISION_ONE = '10000000-0000-4000-8000-0000000000a1';
const DIVISION_TWO = '10000000-0000-4000-8000-0000000000a2';
const employee = (n: number) => `40000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const user = (n: number) => `30000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;
const assignment = (n: number) => `70000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`;

/** MySQL hands a DATE back as a Date or a string depending on driver flags. */
function isoOf(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

/** The id migration 0013 derives, recomputed independently (`OH-BE-0108`). */
function derivedId(key: string): string {
  const hash = createHash('md5').update(key).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `4${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

async function rows<T extends RowDataPacket>(target: IsolatedDatabase, sql: string, values: unknown[] = []) {
  const [result] = await target.connection.query<T[]>(sql, values);
  return result;
}

async function errorCodeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
  } catch (error) {
    return String((error as { code?: string }).code ?? 'UNKNOWN');
  }
  return 'NO_ERROR';
}

/**
 * A pre-0013 database holding the legacy shapes.
 *
 * Employees 1–11 cover: Technical in division one with a single legacy lead
 * (1, 2), a casing and padding variant of the same name (10), Prompt
 * Engineering whose members name two different legacy leads (3, 5), Delivery in
 * division two whose legacy lead is inactive (4), Sales in both divisions
 * (8, 9), a multi-division employee carrying one legacy name into two divisions
 * (1's second assignment), an employee with no legacy value (7), and an
 * employee whose legacy value holds no usable name (11).
 */
async function legacyDatabase(): Promise<IsolatedDatabase> {
  const target = await createIsolatedDatabase({ throughVersion: '0012' });
  await target.connection.query(`
    INSERT INTO divisions(id,division_key,name,is_government) VALUES
      ('${DIVISION_ONE}','rehearsal-one','Rehearsal One',FALSE),
      ('${DIVISION_TWO}','rehearsal-two','Rehearsal Two',FALSE);

    INSERT INTO users(id,name,email,email_normalized,employee_identifier,status) VALUES
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
        .map(
          (n) =>
            `('${user(n)}','Person ${n}','person${n}@example.test','person${n}@example.test','REH-${n}','active')`,
        )
        .join(',')};

    INSERT INTO employees(id,user_id,employee_code,display_name,status,department) VALUES
      ('${employee(1)}','${user(1)}','REH-1','Person 1','active','Technical'),
      ('${employee(2)}','${user(2)}','REH-2','Person 2','active','Technical'),
      ('${employee(3)}','${user(3)}','REH-3','Person 3','active','Prompt Engineering'),
      ('${employee(4)}','${user(4)}','REH-4','Person 4','active','Delivery'),
      ('${employee(5)}','${user(5)}','REH-5','Person 5','active','Prompt Engineering'),
      ('${employee(6)}','${user(6)}','REH-6','Person 6','inactive','Delivery'),
      ('${employee(7)}','${user(7)}','REH-7','Person 7','active',NULL),
      ('${employee(8)}','${user(8)}','REH-8','Person 8','active','Sales'),
      ('${employee(9)}','${user(9)}','REH-9','Person 9','active','Sales'),
      ('${employee(10)}','${user(10)}','REH-10','Person 10','active','  technical '),
      ('${employee(11)}','${user(11)}','REH-11','Person 11','active','---');

    INSERT INTO employee_division_assignments(
      id,employee_id,division_id,lead_employee_id,effective_from,
      allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active) VALUES
      ('${assignment(1)}','${employee(1)}','${DIVISION_ONE}','${employee(2)}','2025-03-01',6000,2100,TRUE,TRUE),
      ('${assignment(2)}','${employee(2)}','${DIVISION_ONE}',NULL,'2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(3)}','${employee(3)}','${DIVISION_ONE}','${employee(2)}','2025-02-01',10000,2100,TRUE,TRUE),
      ('${assignment(4)}','${employee(5)}','${DIVISION_ONE}','${employee(4)}','2025-02-01',10000,2100,TRUE,TRUE),
      ('${assignment(5)}','${employee(4)}','${DIVISION_TWO}','${employee(6)}','2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(6)}','${employee(1)}','${DIVISION_TWO}','${employee(4)}','2025-06-01',4000,2100,FALSE,TRUE),
      ('${assignment(7)}','${employee(7)}','${DIVISION_ONE}','${employee(2)}','2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(8)}','${employee(8)}','${DIVISION_ONE}',NULL,'2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(9)}','${employee(9)}','${DIVISION_TWO}',NULL,'2025-01-01',10000,2100,TRUE,TRUE),
      ('${assignment(10)}','${employee(10)}','${DIVISION_ONE}','${employee(2)}','2025-04-01',10000,2100,TRUE,TRUE),
      ('${assignment(11)}','${employee(11)}','${DIVISION_ONE}',NULL,'2025-05-01',10000,2100,TRUE,TRUE);
  `);
  return target;
}

describe('OH-BE-0114 empty-database migration', () => {
  it('applies every migration including 0013 on an empty schema', async () => {
    database = await createIsolatedDatabase();
    const tables = (
      await rows<RowDataPacket & { t: string }>(
        database,
        'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
      )
    ).map((row) => row.t);
    expect(tables).toContain('departments');
    expect(tables).toContain('department_lead_assignments');
    expect(tables).toContain('department_migration_review');
    expect(tables).toContain('department_migration_reconciliation');

    /* Nothing to backfill, and the reconciliation still has to add up. */
    const [reconciliation] = await rows<RowDataPacket & {
      department_count: number;
      active_assignment_count: number;
      mapped_assignment_count: number;
      unmapped_assignment_count: number;
      review_row_count: number;
    }>(database, 'SELECT * FROM department_migration_reconciliation');
    expect(reconciliation).toMatchObject({
      department_count: 0,
      active_assignment_count: 0,
      mapped_assignment_count: 0,
      unmapped_assignment_count: 0,
      review_row_count: 0,
    });
  });
});

describe('OH-BE-0108 … OH-BE-0111 representative upgrade', () => {
  it('backfills what the legacy data settles, reports the rest, freezes the legacy columns, and reverses cleanly', async () => {
    database = await legacyDatabase();
    const legacyAssignments = await rows<RowDataPacket>(
      database,
      'SELECT id,employee_id,division_id,lead_employee_id,effective_from FROM employee_division_assignments ORDER BY id',
    );
    const legacyDepartments = await rows<RowDataPacket>(
      database,
      'SELECT id,department FROM employees ORDER BY id',
    );

    await database.connection.query(readFileSync(FORWARD, 'utf8'));

    /* -- OH-BE-0108: one department per (division, normalized name) --------- */
    const departments = await rows<RowDataPacket & {
      id: string;
      division_id: string;
      name: string;
      code: string;
      normalized_name: string;
    }>(database, 'SELECT id,division_id,name,code,normalized_name FROM departments ORDER BY division_id,normalized_name');
    expect(departments.map((row) => `${row.division_id === DIVISION_ONE ? 'one' : 'two'}:${row.normalized_name}`)).toEqual([
      'one:prompt engineering',
      'one:sales',
      'one:technical',
      'two:delivery',
      'two:sales',
      /*
       * Person 1 works in both divisions and carries one legacy department
       * string, so the combination exists in both. `OH-BE-0108` backfills the
       * combination; the duplicate name is reported for confirmation rather
       * than resolved by guessing which division really owns it.
       */
      'two:technical',
    ]);

    /* The casing-and-padding variant joined division one's department. */
    expect(
      departments.filter((row) => row.normalized_name === 'technical' && row.division_id === DIVISION_ONE),
    ).toHaveLength(1);

    /* Duplicate names across divisions are the point, not an accident. */
    expect(departments.filter((row) => row.normalized_name === 'sales').map((row) => row.division_id).sort()).toEqual(
      [DIVISION_ONE, DIVISION_TWO].sort(),
    );

    /* Ids are derived, so a rehearsal can be compared to the real run. */
    const technical = departments.find(
      (row) => row.normalized_name === 'technical' && row.division_id === DIVISION_ONE,
    );
    expect(technical?.id).toBe(derivedId(`${DIVISION_ONE}:technical`));
    expect(technical?.code).toMatch(/^TECHNICA-[0-9A-F]{3}$/);

    /* -- OH-BE-0109: mapping, and only where the division agrees ----------- */
    const mapped = await rows<RowDataPacket & { id: string; department_id: string | null }>(
      database,
      'SELECT id,department_id FROM employee_division_assignments ORDER BY id',
    );
    const placement = new Map(mapped.map((row) => [row.id, row.department_id]));
    expect(placement.get(assignment(1))).toBe(technical?.id);
    expect(placement.get(assignment(2))).toBe(technical?.id);
    expect(placement.get(assignment(10))).toBe(technical?.id);
    /* Person 1's division-two assignment is placed in that division's own
       Technical, never in division one's. */
    const technicalTwo = departments.find(
      (row) => row.normalized_name === 'technical' && row.division_id === DIVISION_TWO,
    );
    expect(placement.get(assignment(6))).toBe(technicalTwo?.id);
    /* Person 7 has no legacy value, and person 11's holds no usable name. */
    expect(placement.get(assignment(7))).toBeNull();
    expect(placement.get(assignment(11))).toBeNull();

    /* -- OH-BE-0109: an appointment only where the legacy data says one thing */
    const appointments = await rows<RowDataPacket & {
      department_id: string;
      lead_employee_id: string;
      effective_from: string | Date;
      effective_to: string | null;
    }>(database, 'SELECT department_id,lead_employee_id,effective_from,effective_to FROM department_lead_assignments');
    /*
     * Two: division one's Technical, whose members name one legacy lead, and
     * division two's Technical, whose single member names another. Prompt
     * Engineering and Delivery get none — their legacy data does not settle the
     * question, so it is reported instead.
     */
    expect(appointments).toHaveLength(2);
    const appointmentFor = (departmentId: string | undefined) =>
      appointments.find((row) => row.department_id === departmentId);
    expect(appointmentFor(technical?.id)).toMatchObject({
      lead_employee_id: employee(2),
      effective_to: null,
    });
    expect(appointmentFor(technicalTwo?.id)).toMatchObject({
      lead_employee_id: employee(4),
      effective_to: null,
    });
    /*
     * It starts on the earliest date the legacy data attests this leadership —
     * 1 March, when person 1's assignment first recorded person 2 as lead — not
     * on the migration date, and not on 1 January, when person 2's own
     * assignment began while naming nobody.
     */
    expect(isoOf(appointmentFor(technical?.id)?.effective_from)).toBe('2025-03-01');

    /* -- OH-BE-0110: the review record ------------------------------------- */
    const review = await rows<RowDataPacket & { issue_type: string; count: number }>(
      database,
      'SELECT issue_type,COUNT(*) AS count FROM department_migration_review GROUP BY issue_type',
    );
    const counts = new Map(review.map((row) => [row.issue_type, Number(row.count)]));
    expect(counts.get('legacy_department_missing')).toBe(1);
    expect(counts.get('unmapped_assignment')).toBe(1);
    /* Technical and Sales each exist in two divisions: one row per side. */
    expect(counts.get('cross_division_department')).toBe(4);
    expect(counts.get('conflicting_legacy_lead')).toBe(1);
    expect(counts.get('ineligible_legacy_lead')).toBe(1);
    expect(counts.get('generated_code_needs_review')).toBe(6);
    /*
     * Empty by construction after a backfill: a department with one legacy lead
     * has no member naming a different one. The check exists to catch drift
     * once Phase B2 starts changing appointments while routing still reads the
     * frozen legacy column.
     */
    expect(counts.get('legacy_lead_disagrees') ?? 0).toBe(0);

    const unmapped = await rows<RowDataPacket & { assignment_id: string; legacy_value: string }>(
      database,
      "SELECT assignment_id,legacy_value FROM department_migration_review WHERE issue_type='unmapped_assignment'",
    );
    expect(unmapped[0]).toMatchObject({ assignment_id: assignment(11), legacy_value: '---' });

    const [reconciliation] = await rows<RowDataPacket & {
      legacy_combination_count: number;
      department_count: number;
      active_assignment_count: number;
      mapped_assignment_count: number;
      unmapped_assignment_count: number;
      lead_period_count: number;
    }>(database, 'SELECT * FROM department_migration_reconciliation');
    expect(reconciliation).toMatchObject({
      legacy_combination_count: 7,
      department_count: 6,
      active_assignment_count: 11,
      mapped_assignment_count: 9,
      unmapped_assignment_count: 2,
      lead_period_count: 2,
    });

    /* -- OH-BE-0102, OH-BE-0105, OH-BE-0107: the invariants hold ----------- */
    const sales = departments.find(
      (row) => row.normalized_name === 'sales' && row.division_id === DIVISION_ONE,
    );
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `INSERT INTO departments(id,division_id,name,code) VALUES(UUID(),'${DIVISION_ONE}','  SALES ','SALES2')`,
        ),
      ),
    ).toBe('ER_DUP_ENTRY');
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `INSERT INTO departments(id,division_id,name,code) VALUES(UUID(),'${DIVISION_ONE}','Renewals','${sales?.code}')`,
        ),
      ),
    ).toBe('ER_DUP_ENTRY');
    /* The same name in another division is accepted. */
    await database.connection.query(
      `INSERT INTO departments(id,division_id,name,code) VALUES('${derivedId('spare')}','${DIVISION_TWO}','Prompt Engineering','PROMPT2')`,
    );

    /* A cross-division placement is unrepresentable, not merely validated:
       assignment 9 is in division two, and this department belongs to one. */
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `UPDATE employee_division_assignments SET department_id='${technical?.id}' WHERE id='${assignment(9)}'`,
        ),
      ),
    ).toBe('ER_NO_REFERENCED_ROW_2');

    /* One open appointment per department, and one appointment per start date. */
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from)
           VALUES(UUID(),'${technical?.id}','${employee(1)}','2026-01-01')`,
        ),
      ),
    ).toBe('ER_DUP_ENTRY');
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,effective_to)
           VALUES(UUID(),'${technical?.id}','${employee(1)}','2025-03-01','2025-06-30')`,
        ),
      ),
    ).toBe('ER_DUP_ENTRY');
    expect(
      await errorCodeOf(() =>
        database!.connection.query(
          `INSERT INTO department_lead_assignments(id,department_id,lead_employee_id,effective_from,effective_to)
           VALUES(UUID(),'${technical?.id}','${employee(1)}','2025-09-01','2025-06-30')`,
        ),
      ),
    ).toBe('ER_CHECK_CONSTRAINT_VIOLATED');

    /* A referenced department cannot be deleted away from its history. */
    expect(
      await errorCodeOf(() =>
        database!.connection.query(`DELETE FROM departments WHERE id='${technical?.id}'`),
      ),
    ).toBe('ER_ROW_IS_REFERENCED_2');

    /* -- OH-BE-0111: the legacy columns are frozen ------------------------- */
    await database.connection.query(
      `UPDATE employees SET department='Rewritten' WHERE id='${employee(1)}'`,
    );
    await database.connection.query(
      `UPDATE employee_division_assignments SET lead_employee_id='${employee(3)}' WHERE id='${assignment(1)}'`,
    );
    const frozenEmployee = await rows<RowDataPacket & { department: string }>(
      database,
      `SELECT department FROM employees WHERE id='${employee(1)}'`,
    );
    const frozenAssignment = await rows<RowDataPacket & { lead_employee_id: string }>(
      database,
      `SELECT lead_employee_id FROM employee_division_assignments WHERE id='${assignment(1)}'`,
    );
    expect(frozenEmployee[0]?.department).toBe('Technical');
    expect(frozenAssignment[0]?.lead_employee_id).toBe(employee(2));

    /* A write to a non-legacy column on the same row still works. */
    await database.connection.query(
      `UPDATE employees SET job_title='Engineer' WHERE id='${employee(1)}'`,
    );
    expect(
      (
        await rows<RowDataPacket & { job_title: string }>(
          database,
          `SELECT job_title FROM employees WHERE id='${employee(1)}'`,
        )
      )[0]?.job_title,
    ).toBe('Engineer');

    /* -- OH-BE-0114: recovery restores the pre-change schema --------------- */
    await database.connection.query(readFileSync(RECOVERY, 'utf8'));
    const afterRecovery = (
      await rows<RowDataPacket & { t: string }>(
        database,
        'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
      )
    ).map((row) => row.t);
    expect(afterRecovery).not.toContain('departments');
    expect(afterRecovery).not.toContain('department_lead_assignments');
    expect(afterRecovery).not.toContain('department_migration_review');

    const columns = (
      await rows<RowDataPacket & { c: string }>(
        database,
        `SELECT column_name AS c FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name='employee_division_assignments'`,
      )
    ).map((row) => row.c);
    expect(columns).not.toContain('department_id');
    expect(columns).toContain('lead_employee_id');

    const triggers = (
      await rows<RowDataPacket & { trigger_name: string }>(
        database,
        `SELECT trigger_name FROM information_schema.triggers WHERE trigger_schema = DATABASE()`,
      )
    ).map((row) => row.trigger_name);
    expect(triggers).not.toContain('employees_legacy_department_read_only');
    expect(triggers).not.toContain('assignment_legacy_lead_read_only');

    /* Every legacy fact survived the round trip unchanged. */
    expect(
      await rows<RowDataPacket>(
        database,
        'SELECT id,employee_id,division_id,lead_employee_id,effective_from FROM employee_division_assignments ORDER BY id',
      ),
    ).toEqual(legacyAssignments);
    expect(await rows<RowDataPacket>(database, 'SELECT id,department FROM employees ORDER BY id')).toEqual(
      legacyDepartments,
    );
  });
});
