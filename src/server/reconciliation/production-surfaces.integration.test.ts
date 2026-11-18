import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql, { type Pool } from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Result } from '@/contracts/results';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { createHrServices } from '@/server/hr/composition';
import { createOperationsService } from '@/server/operations/composition';
import { createReportingServices } from '@/server/reporting/composition';
import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';
import { createTimeServices } from '@/server/time/composition';

const USER_ID = '30000000-0000-4000-8000-000000000003';
const EMPLOYEE_ID = '40000000-0000-4000-8000-000000000003';
const LEAD_ID = '40000000-0000-4000-8000-000000000002';
const SUPER_ADMIN_ROLE_ID = '20000000-0000-4000-8000-000000000001';
const SEPTEMBER_PERIOD_ID = '90000000-0000-4000-8000-000000000002';
const WORK_DATE = '2026-09-02';

let database: IsolatedDatabase | undefined;
let pool: Pool | undefined;
let sessionToken = '';

function data<T>(result: Result<T>): T {
  expect(result.status, JSON.stringify(result)).toBe('success');
  if (result.status !== 'success') throw new Error(JSON.stringify(result));
  return result.data;
}

beforeAll(async () => {
  database = await createIsolatedDatabase();
  await database.connection.query(
    readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'),
  );
  const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
  url.pathname = `/${database.name}`;
  pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 10 });

  // One actor must be able to open every compared surface, otherwise different
  // authorization scopes would make equal source facts intentionally produce
  // different totals. The underlying employee, assignments, work logs, policy,
  // period and rates remain the deterministic development seed.
  await pool.execute(
    'INSERT INTO user_roles(id,user_id,role_id,effective_from) VALUES(?,?,?,?)',
    [randomUUID(), USER_ID, SUPER_ADMIN_ROLE_ID, '2026-01-01'],
  );
  const authentication = new AuthenticationService(new MysqlAuthenticationStore(pool));
  sessionToken = data(await authentication.issueSession(USER_ID, 'be-0905-reconciliation', null)).token;
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await database?.dispose();
});

describe('BE-0905 production-surface reconciliation', () => {
  it('uses the same seeded active, break, total, policy and cost facts everywhere', async () => {
    if (!pool) throw new Error('Test database was not initialized.');

    const operations = createOperationsService(pool, sessionToken);
    const time = createTimeServices(pool, sessionToken);
    const reporting = createReportingServices(pool, sessionToken);
    const hr = createHrServices(pool, sessionToken);

    const dashboard = data(await operations.getEmployeeDashboard(USER_ID, WORK_DATE));
    const timesheet = data(await time.timesheets.getDay({ employeeId: EMPLOYEE_ID, date: WORK_DATE }));
    const report = data(await reporting.reports.run('employee-hours', {
      dateRange: { from: WORK_DATE, to: WORK_DATE },
      employeeIds: [EMPLOYEE_ID],
      verifiedOnly: false,
    }, true));
    const finance = data(await reporting.financeViews.getHours(USER_ID, {
      periodId: SEPTEMBER_PERIOD_ID,
      employeeIds: [EMPLOYEE_ID],
    }));

    const evaluationPeriod = data(await hr.evaluationApplication.createPeriod({
      name: 'BE-0905 seeded day',
      type: 'monthly',
      startDate: WORK_DATE,
      endDate: WORK_DATE,
      dueDate: '2026-09-03',
      weightingVersion: 1,
      isOpen: true,
    }));
    const evaluation = data(await hr.evaluationApplication.assign(
      evaluationPeriod.id,
      EMPLOYEE_ID,
      LEAD_ID,
    ));

    const activeBySurface = {
      dashboard: dashboard.today.active.minutes,
      timesheet: timesheet.summary.active.minutes,
      report: report.activeMinutes,
      evaluation: evaluation.facts.actualActiveMinutes,
      finance: finance.totals.active.minutes,
    };
    expect(activeBySurface).toEqual({
      dashboard: 420,
      timesheet: 420,
      report: 420,
      evaluation: 420,
      finance: 420,
    });

    expect({
      dashboard: dashboard.today.break.minutes,
      timesheet: timesheet.summary.break.minutes,
      report: report.breakMinutes,
      evaluation: evaluation.facts.breakMinutes,
      finance: finance.totals.break.minutes,
    }).toEqual({ dashboard: 60, timesheet: 60, report: 60, evaluation: 60, finance: 60 });

    expect({
      dashboard: dashboard.today.total.minutes,
      timesheet: timesheet.summary.total.minutes,
      report: report.totalMinutes,
      finance: finance.totals.total.minutes,
    }).toEqual({ dashboard: 480, timesheet: 480, report: 480, finance: 480 });

    expect(timesheet.summary.status.status).toBe('complete');
    expect(dashboard.today.status.status).toBe('complete');
    expect(report.metadata.policyVersions).toEqual([1]);
    expect(timesheet.summary.requiredActive.minutes).toBe(evaluation.facts.requiredActiveMinutes);
    expect(timesheet.divisionContributions.reduce((sum, row) => sum + row.active.minutes, 0)).toBe(420);
    expect(report.rows.reduce((sum, row) => sum + row.activeMinutes, 0)).toBe(420);
    expect(finance.rows.reduce((sum, row) => sum + row.active.minutes, 0)).toBe(420);
    expect(finance.totals.cost).toMatchObject({
      visible: true,
      value: { amount: '8400.00', currency: 'BDT' },
    });
  });
});
