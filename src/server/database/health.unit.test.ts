import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'mysql2/promise';
import { checkDatabaseReadiness } from './health';

function poolWith(query: ReturnType<typeof vi.fn>): Pool {
  return { query } as unknown as Pool;
}

describe('database readiness', () => {
  it('is healthy only when the connection, core tables, and migration match', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ version: '0011' }]]);

    const result = await checkDatabaseReadiness(poolWith(query));

    expect(result).toMatchObject({
      status: 'healthy',
      expectedMigration: '0011',
      appliedMigration: '0011',
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('is unhealthy when the deployed database is behind the application', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[{ version: '0010' }]]);

    const result = await checkDatabaseReadiness(poolWith(query));

    expect(result).toMatchObject({
      status: 'unhealthy',
      expectedMigration: '0011',
      appliedMigration: '0010',
    });
  });

  it('returns a safe unhealthy result when MySQL cannot be reached', async () => {
    const query = vi.fn().mockRejectedValue(new Error('secret connection details'));

    const result = await checkDatabaseReadiness(poolWith(query));

    expect(result.status).toBe('unhealthy');
    expect(result.appliedMigration).toBeNull();
    expect(result).not.toHaveProperty('error');
  });
});
