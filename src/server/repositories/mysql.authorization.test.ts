import { describe, expect, it, vi } from 'vitest';

import { MysqlDailySummaryRepository, MysqlDivisionRepository } from './mysql';

const baseScope = {
  actorUserId: 'viewer',
  allowedDivisionIds: ['division-a'],
  allowedEmployeeIds: ['employee-a'],
  canAccessGovernmentProjects: false,
} as const;

describe('BE-0143 repository authorization boundaries', () => {
  it('does not query summaries for an employee outside the authorized scope', async () => {
    const execute = vi.fn();
    const repository = new MysqlDailySummaryRepository({ execute } as never);
    await expect(repository.listForEmployee('employee-b', { from: '2026-09-01', to: '2026-09-02' }, baseScope)).resolves.toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });

  it('places division and government authorization in the SQL predicate', async () => {
    const execute = vi.fn().mockResolvedValue([[]]);
    const repository = new MysqlDivisionRepository({ execute } as never);
    await repository.listVisible(baseScope);
    const [sql, values] = execute.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('id IN (?)');
    expect(sql).toContain('is_government = FALSE');
    expect(values).toEqual(['division-a', false]);
  });
});
