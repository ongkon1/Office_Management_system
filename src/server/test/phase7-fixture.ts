import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql, { type Pool, type RowDataPacket } from 'mysql2/promise';
import { expect } from 'vitest';
import type { Result } from '@/contracts/results';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { createIsolatedDatabase } from './database-builder';

/**
 * A seeded, isolated database for the Phase 7 integration suites, with the
 * actors loaded the way production loads them — from their real grants and
 * placements — so authorization is exercised end to end, not stubbed.
 *
 * Seed facts the suites rely on: user/employee 2 leads PowerInAI and is the
 * frozen legacy lead of employee 3 in Government and WesternCF, without the
 * government permission; employee 3 works in all three; user 7 has no
 * placement; the Super Administrator (1) holds every permission.
 */
export const USER = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const EMPLOYEE = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const POWERINAI = '10000000-0000-4000-8000-000000000001';
export const GOVERNMENT = '10000000-0000-4000-8000-000000000003';
export const CRM = '80000000-0000-4000-8000-000000000001';
export const GOV_PORTAL = '80000000-0000-4000-8000-000000000002';
export const CRM_TASK = '81000000-0000-4000-8000-000000000001';
export const GOV_TASK = '81000000-0000-4000-8000-000000000002';
export const WORK_DATE = '2026-10-04';

export async function phase7Database() {
  const db = await createIsolatedDatabase();
  await db.connection.query(readFileSync(join(process.cwd(), 'scripts/seed-development.sql'), 'utf8'));
  const url = new URL(process.env.DATABASE_ADMIN_URL ?? 'mysql://root@127.0.0.1:3306/mysql');
  url.pathname = `/${db.name}`;
  const pool: Pool = mysql.createPool({ uri: url.toString(), timezone: 'Z', connectionLimit: 10 });
  // Employee 3 is a member of the CRM project, so CRM work logs are valid.
  await pool.execute("INSERT INTO project_members(id,project_id,employee_id,effective_from) VALUES(UUID(),?,?,'2026-01-01')", [CRM, EMPLOYEE(3)]);
  const actor = async (n: number): Promise<ActorPolicyContext> => {
    const context = await loadActorPolicyContext(pool, USER(n), WORK_DATE);
    if (!context) throw new Error(`No actor ${n}`);
    return context;
  };
  const rows = async (sql: string, values: (string | number | boolean | null | Date)[] = []) => (await pool.execute<RowDataPacket[]>(sql, values))[0];
  const enableModule = (key: 'messages' | 'integrations', enabled = true) =>
    pool.execute('UPDATE module_settings SET is_enabled=?,version=version+1 WHERE module_key=?', [enabled, key]);
  /** A per-user grant, the way `integration.manage` or `finance.cost.view` is given in production. */
  const grant = (n: number, permission: string) => pool.execute(
    "INSERT INTO scoped_grants(id,user_id,permission_id,effective_from) SELECT UUID(),?,id,'2026-01-01' FROM permissions WHERE permission_key=?", [USER(n), permission]);
  return {
    pool, actor, rows, enableModule, grant,
    async close() { await pool.end(); await db.dispose(); },
  };
}

export function data<T>(result: Result<T>): T {
  expect(result.status, JSON.stringify(result)).toBe('success');
  if (result.status !== 'success') throw new Error(JSON.stringify(result));
  return result.data;
}

/** A work log for employee 3 on the CRM task, valid under every work-log rule. */
export const workLog = (overrides: Record<string, unknown> = {}) => ({
  employeeId: EMPLOYEE(3), workDate: WORK_DATE, divisionId: POWERINAI, projectId: CRM, taskId: CRM_TASK, durationMinutes: 120,
  workLocation: 'office' as const, workDescription: 'Built the dashboard filters', completedWork: 'Filters merged',
  supportingLink: null, attachmentIds: [] as string[], overtimeReason: null, criticalExplanation: null,
  source: 'manual' as const, idempotencyKey: `test-${Math.random().toString(36).slice(2)}`, ...overrides,
});
