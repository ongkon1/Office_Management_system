import { describe, expect, it, vi } from 'vitest';
import { TaskReviewApplicationService, type TaskReviewRepository } from './task-review';

const repo = (): TaskReviewRepository => ({
  employeeForUser: vi.fn().mockResolvedValue({
    id: 'e1', leadEmployeeId: 'lead', divisionIds: ['d1'], isTeamLead: false,
  }),
  currentLeadForEmployee: vi.fn().mockResolvedValue('lead'),
  projectAvailable: vi.fn().mockResolvedValue(true),
  insertSelfTask: vi.fn().mockResolvedValue('t1'),
  find: vi.fn().mockResolvedValue({
    id: 't1', creatorEmployeeId: 'e1', reviewState: 'pending_review', version: 1,
  }),
  decideAtomic: vi.fn().mockResolvedValue('applied'),
});

const effects = () => ({ audit: vi.fn(), notify: vi.fn() });
const input = {
  projectId: 'p1',
  title: 'Work',
  priority: 'high',
  dueDate: '2026-09-20',
  estimatedHours: '1.5',
  description: 'Deliver',
};

describe('self-created task application boundary', () => {
  it('forces employee self-assignment and current-lead review', async () => {
    const repository = repo();
    const sideEffects = effects();
    const result = await new TaskReviewApplicationService(repository, sideEffects).raise('u', input);
    expect(result.status).toBe('success');
    expect(repository.insertSelfTask).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'e1', requiresReview: true, estimatedMinutes: 90,
    }));
    expect(sideEffects.notify).toHaveBeenCalledWith(expect.objectContaining({
      recipientEmployeeId: 'lead',
    }));
  });

  it('creates a Team Lead self-task with no review or reviewer notification', async () => {
    const repository = repo();
    vi.mocked(repository.employeeForUser).mockResolvedValue({
      id: 'lead', leadEmployeeId: null, divisionIds: ['d1'], isTeamLead: true,
    });
    const sideEffects = effects();
    const result = await new TaskReviewApplicationService(repository, sideEffects).raise('u', input);
    expect(result.status).toBe('success');
    expect(repository.insertSelfTask).toHaveBeenCalledWith(expect.objectContaining({
      employeeId: 'lead', requiresReview: false,
    }));
    expect(sideEffects.notify).not.toHaveBeenCalled();
    expect(sideEffects.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.self_created', after: { reviewState: 'not_required' },
    }));
  });

  it('rejects wrong and self reviewers without revealing the task', async () => {
    const repository = repo();
    vi.mocked(repository.currentLeadForEmployee).mockResolvedValue('someone-else');
    expect((await new TaskReviewApplicationService(repository, effects()).decide(
      'u', 't1', { decision: 'approved', note: '', idempotencyKey: 'k' },
    )).status).toBe('not_found');
  });

  it('uses a reassigned current lead and maps concurrent loss to conflict', async () => {
    const repository = repo();
    vi.mocked(repository.employeeForUser).mockResolvedValue({
      id: 'new-lead', leadEmployeeId: null, divisionIds: ['d1'], isTeamLead: true,
    });
    vi.mocked(repository.currentLeadForEmployee).mockResolvedValue('new-lead');
    const service = new TaskReviewApplicationService(repository, effects());
    expect((await service.decide(
      'u', 't1', { decision: 'rejected', note: '', idempotencyKey: 'k' },
    )).status).toBe('validation_failure');
    vi.mocked(repository.decideAtomic).mockResolvedValue('conflict');
    expect((await service.decide(
      'u', 't1', { decision: 'approved', note: '', idempotencyKey: 'k' },
    )).status).toBe('conflict');
  });
});
