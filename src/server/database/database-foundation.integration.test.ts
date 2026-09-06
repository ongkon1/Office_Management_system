import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RowDataPacket } from 'mysql2/promise';
import { afterEach, describe, expect, it } from 'vitest';

import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';

let database: IsolatedDatabase | undefined;
afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

describe('BE-0145 MySQL foundation', () => {
  it('migrates a clean schema and contains the required table families', async () => {
    database = await createIsolatedDatabase();
    const [rows] = await database.connection.query<(RowDataPacket & { tableName: string })[]>(
      `SELECT table_name AS tableName FROM information_schema.tables WHERE table_schema = ?`, [database.name],
    );
    const names = new Set(rows.map((row) => row.tableName));
    for (const required of ['users','employee_division_assignments','projects','time_entries','daily_breaks','daily_summaries','leave_requests','evaluations','cost_rates','notifications','documents','integration_connections','audit_events']) {
      expect(names.has(required), required).toBe(true);
    }
    const [floatingColumns] = await database.connection.query<RowDataPacket[]>(
      `SELECT table_name FROM information_schema.columns WHERE table_schema = ? AND data_type IN ('float','double','real')`,
      [database.name],
    );
    expect(floatingColumns).toHaveLength(0);
  });

  it('applies the deterministic seed twice without changing cardinality', async () => {
    database = await createIsolatedDatabase();
    const seed = readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8');
    await database.connection.query(seed);
    await database.connection.query(seed);
    const [[counts]] = await database.connection.query<(RowDataPacket & { divisions: number; users: number; breaks: number })[]>(
      'SELECT (SELECT COUNT(*) FROM divisions) divisions, (SELECT COUNT(*) FROM users) users, (SELECT COUNT(*) FROM daily_breaks) breaks',
    );
    expect(counts).toEqual({ divisions: 5, users: 11, breaks: 1 });
  });

  it('enforces one daily break, one running timer, history protection, and append-only audit', async () => {
    database = await createIsolatedDatabase();
    const seed = readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8');
    await database.connection.query(seed);
    await expect(database.connection.execute("INSERT INTO daily_breaks(id,employee_id,work_date,minutes,source,policy_version_id) VALUES(UUID(),'40000000-0000-4000-8000-000000000003','2026-09-02',60,'policy','60000000-0000-4000-8000-000000000001')")).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    const timer = "INSERT INTO timer_sessions(id,employee_id,division_id,work_location,started_at_utc,timezone,created_by_user_id) VALUES(?, '40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','office',UTC_TIMESTAMP(6),'Asia/Dhaka','30000000-0000-4000-8000-000000000003')";
    await database.connection.execute(timer, [crypto.randomUUID()]);
    await expect(database.connection.execute(timer, [crypto.randomUUID()])).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await expect(database.connection.execute("DELETE FROM divisions WHERE id='10000000-0000-4000-8000-000000000001'")).rejects.toMatchObject({ code: 'ER_ROW_IS_REFERENCED_2' });
    await expect(database.connection.execute(
      "INSERT INTO employee_division_assignments(id,employee_id,division_id,effective_from,allocation_percent_basis_points,expected_weekly_minutes,is_primary,is_active) VALUES(UUID(),'40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','2026-09-02',1000,300,TRUE,TRUE)",
    )).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await database.connection.execute("INSERT INTO audit_events(event_id,action,resource_type,scope_json,correlation_id) VALUES(UUID(),'test.created','test',JSON_OBJECT(),UUID())");
    await expect(database.connection.execute("UPDATE audit_events SET action='changed' LIMIT 1")).rejects.toMatchObject({ sqlState: '45000' });
  });

  it('uses the employee/date index for daily time queries', async () => {
    database = await createIsolatedDatabase();
    const [rows] = await database.connection.query<(RowDataPacket & { keyName: string })[]>("EXPLAIN SELECT * FROM time_entries WHERE employee_id='40000000-0000-4000-8000-000000000003' AND work_date='2026-09-02'");
    const keyName = rows[0].keyName ?? rows[0].key;
    expect(keyName).toBe('ix_time_employee_date');
  });
});
