import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2/promise';
import { afterEach, describe, expect, it } from 'vitest';

import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';

let database: IsolatedDatabase | undefined;
afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

const employeeId = '40000000-0000-4000-8000-000000000003';
const userId = '30000000-0000-4000-8000-000000000003';
const divisionId = '10000000-0000-4000-8000-000000000001';
const projectId = '80000000-0000-4000-8000-000000000001';
const taskId = '81000000-0000-4000-8000-000000000001';
const policyId = '60000000-0000-4000-8000-000000000001';
const execFileAsync = promisify(execFile);

async function preCutoverDatabase() {
  database = await createIsolatedDatabase({ throughVersion: '0010' });
  const seed = readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8');
  await database.connection.query(seed.split('INSERT IGNORE INTO task_status_transitions')[0]);
  await database.connection.query(`
    INSERT INTO timesheet_periods(id,label,start_date,end_date,status,policy_version_id,verified_at,verified_by_user_id)
    VALUES('90000000-0000-4000-8000-000000000001','August 2026','2026-08-01','2026-08-31','verified','${policyId}','2026-09-01 04:00:00','30000000-0000-4000-8000-000000000004');
    INSERT INTO period_verifications(id,period_id,verified_by_user_id,verified_at,policy_version_id,snapshot_hash)
    VALUES('90100000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004','2026-09-01 04:00:00','${policyId}',REPEAT('a',64));
    INSERT INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,work_location,start_at_utc,end_at_utc,active_minutes,work_description,completed_work,status,created_by_user_id,created_at)
    VALUES
    ('a0000000-0000-4000-8000-000000000011','${employeeId}','2026-08-15','${divisionId}','${projectId}','${taskId}','${policyId}','Asia/Dhaka','manual_clock','office','2026-08-15 03:00:00','2026-08-15 06:00:00',180,'Historical work','Historical output','locked','${userId}','2026-08-15 06:00:00'),
    ('a0000000-0000-4000-8000-000000000012','${employeeId}','2026-09-02','${divisionId}','${projectId}','${taskId}','${policyId}','Asia/Dhaka','manual_duration','office',NULL,NULL,240,'Duration work','Duration output','saved','${userId}','2026-09-02 10:00:00');
    INSERT INTO timer_sessions(id,employee_id,division_id,project_id,task_id,work_location,started_at_utc,timezone,created_by_user_id,policy_version_id,created_at)
    VALUES('a3000000-0000-4000-8000-000000000001','${employeeId}','${divisionId}','${projectId}','${taskId}','office',UTC_TIMESTAMP(6)-INTERVAL 30 MINUTE,'Asia/Dhaka','${userId}','${policyId}',UTC_TIMESTAMP(6)-INTERVAL 30 MINUTE);
  `);
  return database;
}

async function apply0011(target: IsolatedDatabase) {
  await target.connection.query(
    readFileSync(join(process.cwd(), 'drizzle', '0011_task_work_log_cutover.sql'), 'utf8'),
  );
}

describe('Modify B1 task-based schema migration', () => {
  it('preserves legacy facts, reconciles totals, converts in-flight state and enforces new invariants', async () => {
    const target = await preCutoverDatabase();
    const [before] = await target.connection.query<RowDataPacket[]>(
      `SELECT id,employee_id,work_date,division_id,project_id,task_id,entry_method,start_at_utc,end_at_utc,
       active_minutes,work_description,completed_work,status,created_at,version
       FROM time_entries ORDER BY id`,
    );

    await apply0011(target);

    const [after] = await target.connection.query<RowDataPacket[]>(
      `SELECT id,employee_id,work_date,division_id,project_id,task_id,entry_method,start_at_utc,end_at_utc,
       active_minutes,work_description,completed_work,status,created_at,version
       FROM time_entries WHERE id IN (?,?) ORDER BY id`,
      [before[0].id, before[1].id],
    );
    expect(after).toEqual(before);

    const [classified] = await target.connection.query<RowDataPacket[]>(
      'SELECT id,source,idempotency_key FROM time_entries WHERE id IN (?,?) ORDER BY id',
      [before[0].id, before[1].id],
    );
    expect(classified.map((row) => row.source)).toEqual(['migrated_clock_entry', 'manual']);
    expect(classified.every((row) => String(row.idempotency_key).startsWith('migration:'))).toBe(true);

    const [reconciliation] = await target.connection.query<RowDataPacket[]>(
      `SELECT * FROM task_work_migration_reconciliation
       WHERE before_active_minutes<>after_active_minutes OR before_entry_count<>after_entry_count OR reconciled_at IS NULL`,
    );
    expect(reconciliation).toHaveLength(0);

    const [[timer]] = await target.connection.query<RowDataPacket[]>(
      `SELECT stopped_at_utc,draft_time_entry_id,draft_payload FROM timer_sessions
       WHERE id='a3000000-0000-4000-8000-000000000001'`,
    );
    expect(timer.stopped_at_utc).not.toBeNull();
    const [[draft]] = await target.connection.query<RowDataPacket[]>(
      'SELECT status,source,idempotency_key FROM time_entries WHERE id=?',
      [timer.draft_time_entry_id],
    );
    expect(draft).toMatchObject({
      status: 'draft',
      source: 'migrated_clock_entry',
      idempotency_key: 'cutover-timer:a3000000-0000-4000-8000-000000000001',
    });

    const insertBase = [employeeId, divisionId, projectId, taskId, policyId, userId];
    await expect(target.connection.execute(
      `INSERT INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,source,idempotency_key,work_location,start_at_utc,end_at_utc,active_minutes,work_description,completed_work,status,created_by_user_id)
       VALUES(UUID(),?,'2026-09-10',?,?,?,?,'Asia/Dhaka','manual_clock','manual','bad-new-clock','office','2026-09-10 03:00:00','2026-09-10 04:00:00',60,'Bad','Bad','saved',?)`,
      insertBase,
    )).rejects.toMatchObject({ code: 'ER_CHECK_CONSTRAINT_VIOLATED' });
    await expect(target.connection.execute(
      `INSERT INTO time_entries(id,employee_id,work_date,division_id,project_id,task_id,policy_version_id,timezone,entry_method,source,idempotency_key,work_location,start_at_utc,end_at_utc,active_minutes,work_description,completed_work,status,created_by_user_id)
       VALUES(UUID(),?,'2026-09-10',?,?,?,?,'Asia/Dhaka','manual_clock','migrated_clock_entry','forged-history','office','2026-09-10 03:00:00','2026-09-10 04:00:00',60,'Bad','Bad','saved',?)`,
      insertBase,
    )).rejects.toMatchObject({ code: 'ER_BAD_NULL_ERROR' });

    await expect(target.connection.execute(
      "UPDATE time_entries SET active_minutes=181 WHERE id='a0000000-0000-4000-8000-000000000011'",
    )).rejects.toMatchObject({ code: 'ER_BAD_NULL_ERROR' });

    await target.connection.execute(
      `INSERT INTO task_status_transitions(id,task_id,from_status,to_status,actor_user_id,changed_at_utc,note,idempotency_key,task_version)
       VALUES(UUID(),?,'pending','in_progress',?,UTC_TIMESTAMP(6),'Started','migration-test-transition',2)`,
      [taskId, userId],
    );
    await expect(target.connection.execute(
      "UPDATE task_status_transitions SET note='Changed' WHERE idempotency_key='migration-test-transition'",
    )).rejects.toMatchObject({ sqlState: '45000' });
    await expect(target.connection.execute(
      "DELETE FROM task_status_transitions WHERE idempotency_key='migration-test-transition'",
    )).rejects.toMatchObject({ sqlState: '45000' });

    const [indexes] = await target.connection.query<RowDataPacket[]>(
      `SELECT DISTINCT index_name AS indexName FROM information_schema.statistics
       WHERE table_schema=? AND table_name='time_entries'`,
      [target.name],
    );
    const names = new Set(indexes.map((row) => row.indexName));
    expect(names.has('ix_work_log_employee_date')).toBe(true);
    expect(names.has('ix_work_log_task_date')).toBe(true);
    expect(names.has('ix_time_employee_date')).toBe(false);
  });

  it('reverses safely before post-cutover work or transitions exist', async () => {
    const target = await preCutoverDatabase();
    await apply0011(target);
    await target.connection.query(
      readFileSync(join(process.cwd(), 'drizzle', 'recovery', '0011_task_work_log_cutover.sql'), 'utf8'),
    );

    const [columns] = await target.connection.query<RowDataPacket[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=? AND table_name='time_entries' AND column_name IN ('source','idempotency_key')`,
      [target.name],
    );
    expect(columns).toHaveLength(0);
    const [[timer]] = await target.connection.query<RowDataPacket[]>(
      "SELECT stopped_at_utc,draft_time_entry_id FROM timer_sessions WHERE id='a3000000-0000-4000-8000-000000000001'",
    );
    expect(timer.stopped_at_utc).toBeNull();
    expect(timer.draft_time_entry_id).toBeNull();
  });

  it('hardens runtime grants so transitions are insert-only and timers are read-only', async () => {
    database = await createIsolatedDatabase();
    await database.connection.query(
      readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'),
    );
    const runtimeUser = `b1_runtime_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
    const account = `'${runtimeUser}'@'127.0.0.1'`;
    const adminUrl = process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql';
    const databaseUrl = adminUrl.replace(/\/mysql$/, `/${database.name}`);

    try {
      await database.connection.query(`CREATE USER ${account} IDENTIFIED BY 'B1-test-only!'`);
      await database.connection.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON \`${database.name}\`.* TO ${account}`,
      );

      await execFileAsync(process.execPath, ['scripts/db-harden-task-work-grants.mjs'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_MIGRATION_URL: databaseUrl,
          RUNTIME_DATABASE_ACCOUNTS: `${runtimeUser}@127.0.0.1`,
        },
      });

      const [privileges] = await database.connection.query<RowDataPacket[]>(
        `SELECT table_name AS tableName,privilege_type AS privilegeType
         FROM information_schema.table_privileges
         WHERE grantee=? AND table_schema=? AND table_name IN ('task_status_transitions','timer_sessions')`,
        [`'${runtimeUser}'@'127.0.0.1'`, database.name],
      );
      expect(privileges.filter((row) => row.tableName === 'task_status_transitions').map((row) => row.privilegeType)).toEqual(['INSERT']);
      expect(privileges.filter((row) => row.tableName === 'timer_sessions')).toHaveLength(0);

      const runtimeUrl = new URL(databaseUrl);
      runtimeUrl.username = runtimeUser;
      runtimeUrl.password = 'B1-test-only!';
      const runtime = await mysql.createConnection({ uri: runtimeUrl.toString(), timezone: 'Z' });
      try {
        await runtime.execute(
          `INSERT INTO task_status_transitions(id,task_id,from_status,to_status,actor_user_id,changed_at_utc,note,idempotency_key,task_version)
           VALUES(UUID(),?,'in_progress','completed',?,UTC_TIMESTAMP(6),'Runtime append test',?,2)`,
          [taskId, userId, `runtime-grant-${randomUUID()}`],
        );
        await expect(runtime.execute(
          "UPDATE task_status_transitions SET note='Forbidden mutation' WHERE task_id=?",
          [taskId],
        )).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
        await expect(runtime.execute(
          'INSERT INTO timer_sessions(id) VALUES(UUID())',
        )).rejects.toMatchObject({ code: 'ER_TABLEACCESS_DENIED_ERROR' });
      } finally {
        await runtime.end();
      }
    } finally {
      await database.connection.query(`DROP USER IF EXISTS ${account}`);
    }
  });
});
