import { describe, expect, it, vi } from 'vitest';
import { TaskReviewApplicationService, type TaskReviewRepository } from './task-review';

const repo = (): TaskReviewRepository => ({
  employeeForUser: vi.fn().mockResolvedValue({
    id: 'e1', leadEmployeeId: 'lead', divisionIds: ['d1'], isTeamLead: false,
  }),
  reviewActorForUser: vi.fn().mockResolvedValue({
    employeeId: 'lead', isSuperAdministrator: false,
  }),
  currentLeadForEmployee: vi.fn().mockResolvedValue('lead'),
  projectAvailable: vi.fn().mockResolvedValue(true),
  categoryAvailable: vi.fn().mockResolvedValue(true),
  insertSelfTask: vi.fn().mockResolvedValue('t1'),
  find: vi.fn().mockResolvedValue({
    id: 't1', creatorEmployeeId: 'e1', reviewState: 'pending_review', version: 1,
  }),
  decideAtomic: vi.fn().mockResolvedValue('applied'),
  reopenRejected: vi.fn().mockResolvedValue(true),
});

const effects = () => ({ audit: vi.fn(), notify: vi.fn() });
const service = (repository: TaskReviewRepository, sideEffects = effects()) =>
  new TaskReviewApplicationService(repository, sideEffects, () => '2026-09-02');
const input = {
  projectId: 'p1',
  title: 'Work',
  priority: 'high',
  dueDate: '2026-09-20',
  estimatedMinutes: '90',
  description: 'Deliver',
};

describe('self-created task application boundary', () => {
  it('forces employee self-assignment and current-lead review', async () => {
    const repository = repo();
    const sideEffects = effects();
    const result = await service(repository, sideEffects).raise('u', input);
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
    const result = await service(repository, sideEffects).raise('u', input);
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
    expect((await service(repository).decide(
      'u', 't1', { decision: 'approved', note: '', idempotencyKey: 'k' },
    )).status).toBe('not_found');
  });

  it('uses a reassigned current lead and maps concurrent loss to conflict', async () => {
    const repository = repo();
    vi.mocked(repository.employeeForUser).mockResolvedValue({
      id: 'new-lead', leadEmployeeId: null, divisionIds: ['d1'], isTeamLead: true,
    });
    vi.mocked(repository.currentLeadForEmployee).mockResolvedValue('new-lead');
    const application = service(repository);
    expect((await application.decide(
      'u', 't1', { decision: 'rejected', note: '', idempotencyKey: 'k' },
    )).status).toBe('validation_failure');
    vi.mocked(repository.decideAtomic).mockResolvedValue('conflict');
    expect((await application.decide(
      'u', 't1', { decision: 'approved', note: '', idempotencyKey: 'k' },
    )).status).toBe('conflict');
  });

  it('reopens a rejected task only for its current Team Lead and records the reason', async () => {
    const repository = repo();
    vi.mocked(repository.find).mockResolvedValue({
      id: 't1', creatorEmployeeId: 'e1', reviewState: 'rejected', version: 3,
    });
    const sideEffects = effects();
    const result = await service(repository, sideEffects).reopen(
      'lead-user', 't1', { expectedVersion: 3, reason: 'The requested changes are ready.' },
    );
    expect(result).toEqual({ status: 'success', data: { state: 'pending_review' } });
    expect(repository.reopenRejected).toHaveBeenCalledWith({ taskId: 't1', expectedVersion: 3 });
    expect(sideEffects.audit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'task.review_reopened', reason: 'The requested changes are ready.',
    }));
  });

  it('hides rejected tasks from employees trying to reopen them', async () => {
    const repository = repo();
    vi.mocked(repository.find).mockResolvedValue({
      id: 't1', creatorEmployeeId: 'e1', reviewState: 'rejected', version: 3,
    });
    vi.mocked(repository.reviewActorForUser).mockResolvedValue({
      employeeId: 'e1', isSuperAdministrator: false,
    });
    expect((await service(repository).reopen(
      'employee-user', 't1', { expectedVersion: 3, reason: 'Try again' },
    )).status).toBe('not_found');
    expect(repository.reopenRejected).not.toHaveBeenCalled();
  });

  it.each([
    [{ title: '   ' }, 'title'],
    [{ priority: 'immediate' }, 'priority'],
    [{ dueDate: '2026-09-01' }, 'dueDate'],
    [{ dueDate: 'not-a-date' }, 'dueDate'],
    [{ estimatedMinutes: '0' }, 'estimatedMinutes'],
    [{ description: 'x'.repeat(5001) }, 'description'],
  ])('rejects invalid create input %o', async (override, field) => {
    const result = await service(repo()).raise('u', { ...input, ...override });
    expect(result).toMatchObject({ status: 'validation_failure', focusField: field });
  });
});
