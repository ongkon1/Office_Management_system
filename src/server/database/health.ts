import type { Pool } from 'mysql2/promise';

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
