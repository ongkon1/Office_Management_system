import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EmployeeFormInput } from '@/contracts/hr';
import { createIsolatedDatabase } from '@/server/test/database-builder';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { BackendUserRoleAdmin } from '@/server/admin/user-role-views';
import { createOperationsService } from './composition';

/**
 * Regression cover for two defects reported against the database-backed
 * screens: a new employee was created with no division placement, and a
 * division could not be created at all because the form named a Team Lead id
 * that exists only in the demo fixtures.
 */

const ADMIN = '30000000-0000-4000-8000-000000000001';
const HR = '30000000-0000-4000-8000-000000000004';
const POWERINAI = '10000000-0000-4000-8000-000000000001';
const WESTERNCF = '10000000-0000-4000-8000-000000000005';
const TECHNICAL = '22000000-0000-4000-8000-000000000001';
const LEAD_EMPLOYEE = '40000000-0000-4000-8000-000000000002';

let db: Awaited<ReturnType<typeof createIsolatedDatabase>>;
let pool: Pool;
const tokens: Record<string, string> = {};

const form = (overrides: Partial<EmployeeFormInput> = {}): EmployeeFormInput => ({
  fullName: 'New Starter', designation: 'Engineer', employmentType: 'full_time',
  joiningDate: '2026-10-01', email: 'starter@powerin.ai', phone: '', officeLocation: '',
  primaryDivisionId: POWERINAI, primaryDepartmentId: TECHNICAL, normalWorkMode: 'office',
  standardDailyActiveMinutes: 420, standardWeeklyActiveMinutes: 2100, skills: [], status: 'active',
  userRole: 'employee', initialPassword: 'Initial-Password-1', ...overrides,
});

beforeAll(async () => {
  db = await createIsolatedDatabase();
  await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8'));
  const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
  url.pathname = `/${db.name}`;
  pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 6 });
  const auth = new AuthenticationService(new MysqlAuthenticationStore(pool));
  for (const userId of [ADMIN, HR]) {
    const session = await auth.issueSession(userId, 'placement-test', null);
    if (session.status !== 'success') throw new Error('session');
    tokens[userId] = session.data.token;
  }
});

afterAll(async () => {
  await pool?.end();
  await db?.dispose();
});

describe('creating an employee places them in their primary division', () => {
  it('lists real divisions and departments in the shape the form reads', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    const divisions = await service.listDivisionOptions(HR);
    expect(divisions.status).toBe('success');
    if (divisions.status !== 'success') return;
    expect(divisions.data.map((option) => option.value)).toContain(POWERINAI);

    const departments = await service.listDepartmentOptions(HR, POWERINAI);
    expect(departments.status).toBe('success');
    if (departments.status !== 'success') return;
    expect(departments.data.find((option) => option.value === TECHNICAL))
      .toMatchObject({ label: 'Technical', divisionId: POWERINAI, isActive: true });
  });

  it('creates the account and its primary assignment in one save', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    const created = await service.saveEmployee(HR, form());
    expect(created.status, JSON.stringify(created)).toBe('success');
    if (created.status !== 'success') return;

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT division_id,department_id,effective_from,is_primary,is_active,allocation_percent_basis_points FROM employee_division_assignments WHERE employee_id=?',
      [created.data.employee.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ division_id: POWERINAI, department_id: TECHNICAL, is_primary: 1, is_active: 1, allocation_percent_basis_points: 10000 });

    const listed = await service.listEmployees(HR, { divisionIds: [POWERINAI] });
    expect(listed.status === 'success' && listed.data.some((row) => row.employee.id === created.data.employee.id)).toBe(true);
  });

  it('refuses a missing or mismatched placement without creating the account', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    const noDivision = await service.saveEmployee(HR, form({ email: 'a@powerin.ai', primaryDivisionId: 'pia' }));
    expect(noDivision).toMatchObject({ status: 'validation_failure', focusField: 'primaryDivisionId' });

    // Technical belongs to PowerInAI, not WesternCF.
    const wrongDepartment = await service.saveEmployee(HR, form({ email: 'b@powerin.ai', primaryDivisionId: WESTERNCF }));
    expect(wrongDepartment).toMatchObject({ status: 'validation_failure', focusField: 'primaryDepartmentId' });

    const [users] = await pool.execute<RowDataPacket[]>("SELECT id FROM users WHERE email_normalized IN ('a@powerin.ai','b@powerin.ai')");
    expect(users).toHaveLength(0);
  });

  it('reports a duplicate work email as a conflict rather than a failure', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    const duplicate = await service.saveEmployee(HR, form({ email: 'starter@powerin.ai' }));
    expect(duplicate.status).toBe('conflict');
  });
});

describe('a Super Administrator can create divisions', () => {
  it('creates a division with no Team Lead', async () => {
    const admin = new BackendUserRoleAdmin(pool, tokens[ADMIN]);
    const result = await admin.saveDivision(ADMIN, { name: 'Research', description: '', teamLeadEmployeeId: '', isRestricted: false });
    expect(result.status, JSON.stringify(result)).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.find((division) => division.name === 'Research')).toMatchObject({ code: 'DIV-0001', teamLead: null });
  });

  it('creates a division led by a real employee', async () => {
    const admin = new BackendUserRoleAdmin(pool, tokens[ADMIN]);
    const result = await admin.saveDivision(ADMIN, { name: 'Analytics', description: '', teamLeadEmployeeId: LEAD_EMPLOYEE, isRestricted: false });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.find((division) => division.name === 'Analytics')).toMatchObject({ code: 'DIV-0002', teamLead: { id: LEAD_EMPLOYEE } });
  });

  it('names the field when the Team Lead does not exist, instead of failing', async () => {
    const admin = new BackendUserRoleAdmin(pool, tokens[ADMIN]);
    const result = await admin.saveDivision(ADMIN, { name: 'Operations', description: '', teamLeadEmployeeId: 'emp-2001', isRestricted: false });
    expect(result).toMatchObject({ status: 'validation_failure', focusField: 'teamLeadEmployeeId' });
  });
});

describe('employee, division and project codes are assigned by the system', () => {
  it('numbers employees in sequence after the highest generated code, ignoring legacy codes', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    // The seed holds EMP-001…EMP-006 plus ADM-001/TL-001/HR-001. Those keep
    // their codes; numbering continues from the highest EMP-number, and the
    // employee created earlier in this file already took EMP-0007.
    const first = await service.saveEmployee(HR, form({ email: 'seq1@powerin.ai' }));
    const second = await service.saveEmployee(HR, form({ email: 'seq2@powerin.ai' }));
    if (first.status !== 'success' || second.status !== 'success') throw new Error(JSON.stringify([first, second]));
    expect(first.data.employee.employeeCode).toBe('EMP-0008');
    expect(second.data.employee.employeeCode).toBe('EMP-0009');
    const [legacy] = await pool.execute<RowDataPacket[]>("SELECT employee_code FROM employees WHERE employee_code IN ('EMP-001','ADM-001')");
    expect(legacy).toHaveLength(2);
  });

  it('keeps the employee code when the record is edited', async () => {
    const service = createOperationsService(pool, tokens[HR]);
    const created = await service.saveEmployee(HR, form({ email: 'keep@powerin.ai' }));
    if (created.status !== 'success') throw new Error(JSON.stringify(created));
    const edited = await service.saveEmployee(HR, form({ email: 'keep@powerin.ai', fullName: 'Renamed Starter' }), created.data.employee.id);
    if (edited.status !== 'success') throw new Error(JSON.stringify(edited));
    expect(edited.data.employee).toMatchObject({ fullName: 'Renamed Starter', employeeCode: created.data.employee.employeeCode });
    const [login] = await pool.execute<RowDataPacket[]>('SELECT u.employee_identifier FROM users u JOIN employees e ON e.user_id=u.id WHERE e.id=?', [created.data.employee.id]);
    expect(login[0].employee_identifier).toBe(created.data.employee.employeeCode);
  });

  it('keeps the division code when the division is renamed', async () => {
    const admin = new BackendUserRoleAdmin(pool, tokens[ADMIN]);
    const list = await admin.listDivisions(ADMIN);
    if (list.status !== 'success') throw new Error('list');
    const research = list.data.find((division) => division.name === 'Research')!;
    const renamed = await admin.saveDivision(ADMIN, { name: 'Research Lab', description: '', teamLeadEmployeeId: '', isRestricted: false }, research.id);
    if (renamed.status !== 'success') throw new Error(JSON.stringify(renamed));
    expect(renamed.data.find((division) => division.id === research.id)).toMatchObject({ name: 'Research Lab', code: research.code });
  });

  it('assigns PRJ codes to new projects and keeps them on edit', async () => {
    const LEAD_USER = '30000000-0000-4000-8000-000000000002';
    const session = await new AuthenticationService(new MysqlAuthenticationStore(pool)).issueSession(LEAD_USER, 'placement-test', null);
    if (session.status !== 'success') throw new Error('session');
    const service = createOperationsService(pool, session.data.token);
    const project = {
      name: 'Client Portal', divisionId: POWERINAI, managerEmployeeId: LEAD_EMPLOYEE, memberIds: [], client: '',
      startDate: '2026-10-01', endDate: null, priority: 'medium' as const, estimatedMinutes: 600, budgetAmount: '',
      completionPercent: 0, notes: '',
    };
    const first = await service.saveProject(LEAD_USER, project);
    const second = await service.saveProject(LEAD_USER, { ...project, name: 'Mobile App' });
    if (first.status !== 'success' || second.status !== 'success') throw new Error(JSON.stringify([first, second]));
    expect(first.data.code).toBe('PRJ-0001');
    expect(second.data.code).toBe('PRJ-0002');
    const edited = await service.saveProject(LEAD_USER, { ...project, name: 'Client Portal v2' }, first.data.id);
    if (edited.status !== 'success') throw new Error(JSON.stringify(edited));
    expect(edited.data).toMatchObject({ name: 'Client Portal v2', code: 'PRJ-0001' });
  });
});
