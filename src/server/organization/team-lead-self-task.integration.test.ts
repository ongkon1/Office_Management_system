import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIsolatedDatabase, type IsolatedDatabase } from '@/server/test/database-builder';
import { MysqlTaskReviewRepository } from './mysql-task-review';
import { TaskReviewApplicationService } from './task-review';

let database: IsolatedDatabase | undefined;

afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

describe('Team Lead self-created task persistence', () => {
  it('stores an immediately usable self-assigned task without approval or notification', async () => {
    database = await createIsolatedDatabase();
    await database.connection.query(
      readFileSync(join(process.cwd(), 'scripts', 'seed-development.sql'), 'utf8'),
    );
    const effects = { audit: vi.fn().mockResolvedValue(undefined), notify: vi.fn().mockResolvedValue(undefined) };
    const service = new TaskReviewApplicationService(
      new MysqlTaskReviewRepository(database.connection as unknown as Pool, () => '2026-09-02'),
      effects,
    );

    const result = await service.raise('30000000-0000-4000-8000-000000000002', {
      projectId: '80000000-0000-4000-8000-000000000001',
      title: 'Prepare technical review',
      priority: 'high',
      dueDate: '2026-09-30',
      estimatedHours: '2.5',
      description: 'Review the technical delivery.',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    const [[task]] = await database.connection.query<RowDataPacket[]>(
      `SELECT creator_employee_id,assignee_employee_id,creator_role,review_state,
       reviewer_employee_id,reviewed_at,estimated_minutes,status
       FROM tasks WHERE id=?`,
      [result.data.id],
    );
    expect(task).toMatchObject({
      creator_employee_id: '40000000-0000-4000-8000-000000000002',
      assignee_employee_id: '40000000-0000-4000-8000-000000000002',
      creator_role: 'team_lead',
      review_state: 'not_required',
      reviewer_employee_id: null,
      reviewed_at: null,
      estimated_minutes: 150,
      status: 'pending',
    });
    expect(effects.notify).not.toHaveBeenCalled();
    expect(effects.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.self_created',
      after: { reviewState: 'not_required' },
    }));
  });
});
