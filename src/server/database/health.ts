import type { Pool, RowDataPacket } from 'mysql2/promise';

/**
 * Must move with every reviewed production migration.
 *
 * It was left at `0011` while `0012` and `0013` shipped, which made readiness
 * report unhealthy on a correctly migrated database — the opposite of what the
 * probe is for. `0013` is the department hierarchy (organization hierarchy
 * Phase B1).
 */
export const EXPECTED_DATABASE_MIGRATION = '0013';

export interface DatabaseHealth {
  readonly status: 'healthy' | 'unhealthy';
  readonly latencyMs: number;
}

export async function checkDatabaseHealth(pool: Pool): Promise<DatabaseHealth> {
  const startedAt = performance.now();
  try {
    await pool.query('SELECT 1');
    return { status: 'healthy', latencyMs: Math.ceil(performance.now() - startedAt) };
  } catch {
    return { status: 'unhealthy', latencyMs: Math.ceil(performance.now() - startedAt) };
  }
}

export interface DatabaseReadiness {
  readonly status: 'healthy' | 'unhealthy';
  readonly latencyMs: number;
  readonly expectedMigration: string;
  readonly appliedMigration: string | null;
}

interface MigrationRow extends RowDataPacket {
  readonly version: string;
}

/**
 * Verifies the runtime connection, core identity tables, and migration level.
 * Error details are deliberately not returned so a public probe cannot expose
 * hosts, credentials, SQL text, or schema internals.
 */
export async function checkDatabaseReadiness(
  pool: Pool,
  expectedMigration = EXPECTED_DATABASE_MIGRATION,
): Promise<DatabaseReadiness> {
  const startedAt = performance.now();
  let appliedMigration: string | null = null;
  try {
    await pool.query('SELECT 1');
    await pool.query(
      'SELECT 1 FROM users u LEFT JOIN employees e ON 1 = 0 LEFT JOIN user_roles ur ON 1 = 0 LIMIT 0',
    );
    const [rows] = await pool.query<MigrationRow[]>(
      'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
    );
    appliedMigration = rows[0]?.version ?? null;
    return {
      status: appliedMigration === expectedMigration ? 'healthy' : 'unhealthy',
      latencyMs: Math.ceil(performance.now() - startedAt),
      expectedMigration,
      appliedMigration,
    };
  } catch {
    return {
      status: 'unhealthy',
      latencyMs: Math.ceil(performance.now() - startedAt),
      expectedMigration,
      appliedMigration,
    };
  }
}
