import { describe, expect, it } from 'vitest';
import type { Project, Task, TimeEntry, WorkPolicy } from '@/contracts/domain';
import type { WorkLog, WorkLogInput } from '@/contracts/work-log';
import { validateWorkLog, type WorkLogValidationContext } from './validation';

const actor = { userId: 'usr-1', displayName: 'Nadia Rahman' };
const stamp = '2026-09-02T09:00:00+06:00';

const policy: WorkPolicy = {
  id: 'policy', version: 3, name: 'Standard', effectiveFrom: '2026-01-01', effectiveTo: null,
  requiredActiveMinutes: 420, recognizedBreakMinutes: 60, requiredTotalMinutes: 480,
  overtimeThresholdMinutes: 480, criticalThresholdMinutes: 720,
  workingWeekdays: [1, 2, 3, 4, 5], businessTimezone: 'Asia/Dhaka',
  createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
};

const project: Project = {
  id: 'project', name: 'Portal', code: 'PORTAL', divisionId: 'pia', managerEmployeeId: 'lead',
  client: null, startDate: '2026-01-01', endDate: null, priority: 'high', description: null,
  estimatedMinutes: 480, budget: null, completionPercent: 20, status: 'active', isActive: true,
  acceptsTimeEntries: true, notes: null, createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
};

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task', title: 'Onboarding checklist', divisionId: 'pia', projectId: 'project',
    assigneeEmployeeId: 'employee', supportingMemberIds: [], creatorEmployeeId: 'lead',
    priority: 'medium', startDate: '2026-09-01', dueDate: '2026-09-30', completedDate: null,
    estimatedMinutes: 480, description: null, status: 'in_progress', reviewState: 'not_required',
    reviewerEmployeeId: null, reviewedAt: null, reviewNote: null,
    createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
    ...overrides,
  };
}

function input(overrides: Partial<WorkLogInput> = {}): WorkLogInput {
  return {
    employeeId: 'employee', workDate: '2026-09-02', divisionId: 'pia', projectId: 'project',
    taskId: 'task', durationMinutes: 120, workLocation: 'office', workDescription: 'Prepared access',
    completedWork: 'Accounts configured', supportingLink: null, attachmentIds: [], overtimeReason: null,
    criticalExplanation: null, source: 'manual', idempotencyKey: 'key-1', ...overrides,
  };
}

function stored(overrides: Partial<WorkLog> = {}): WorkLog {
  return {
    ...input(), id: 'work-log-1', state: 'saved', policyVersion: 3,
    createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor, ...overrides,
  };
}

function context(overrides: Partial<WorkLogValidationContext> = {}): WorkLogValidationContext {
  return {
    policy, existingWorkLogs: [], historicalEntries: [], effectiveDivisionIds: ['pia'],
    projects: [project], tasks: [task()], ...overrides,
  };
}

const codes = (errors: readonly { code: string }[]) => errors.map((error) => error.code);

describe('task-based work-log validation', () => {
  it('accepts a positive duration on an assigned, approved In Progress task', () => {
    expect(validateWorkLog(input(), context())).toEqual([]);
  });

  it('refuses a completed task submitted directly by id', () => {
    expect(codes(validateWorkLog(input(), context({ tasks: [task({ status: 'completed' })] })))).toContain('TASK_COMPLETED');
  });

  it('refuses Pending, unapproved and unassigned tasks', () => {
    expect(codes(validateWorkLog(input(), context({ tasks: [task({ status: 'pending' })] })))).toContain('TASK_NOT_STARTED');
    expect(codes(validateWorkLog(input(), context({ tasks: [task({ reviewState: 'pending_review' })] })))).toContain('TASK_AWAITING_REVIEW');
    expect(codes(validateWorkLog(input(), context({ tasks: [task({ assigneeEmployeeId: 'someone-else' })] })))).toContain('TASK_NOT_ASSIGNED');
  });

  it('allows an explicitly available supporting task', () => {
    expect(validateWorkLog(input(), context({ tasks: [task({ assigneeEmployeeId: 'someone-else' })], availableTaskIds: ['task'] }))).toEqual([]);
  });

  it('deduplicates by idempotency key rather than matching clock ranges', () => {
    const errors = validateWorkLog(input(), context({ existingWorkLogs: [stored()] }));
    expect(codes(errors)).toContain('DUPLICATE_SUBMISSION');
    expect(codes(errors)).not.toContain('OVERLAPPING_ENTRY');
  });

  it('rejects a duration that raises active work above 24:00', () => {
    const errors = validateWorkLog(
      input({ durationMinutes: 2, idempotencyKey: 'next' }),
      context({ existingWorkLogs: [stored({ durationMinutes: 1439, idempotencyKey: 'first' })] }),
    );
    expect(codes(errors)).toContain('DAILY_ACTIVE_LIMIT');
  });

  it('counts historical active minutes toward the daily cap without reading ranges', () => {
    const historical = {
      id: 'history', employeeId: 'employee', workDate: '2026-09-02', divisionId: 'pia',
      projectId: 'project', taskId: 'task', entryMethod: 'manual_clock', workLocation: 'office',
      startTime: '2026-09-02T09:00:00+06:00', endTime: '2026-09-02T10:00:00+06:00',
      activeMinutes: 1439, workDescription: 'Historical', completedWork: 'Historical', supportingLink: null,
      attachmentIds: [], state: 'saved', crossMidnightGroupId: null, policyVersion: 2,
      createdAt: stamp, createdBy: actor, updatedAt: stamp, updatedBy: actor,
    } satisfies TimeEntry;
    expect(codes(validateWorkLog(input({ durationMinutes: 2 }), context({ historicalEntries: [historical] })))).toContain('DAILY_ACTIVE_LIMIT');
  });

  it('returns field, message and corrective guidance for every error', () => {
    const errors = validateWorkLog(input({ durationMinutes: 0, workDescription: '', completedWork: '' }), context());
    expect(errors.length).toBeGreaterThan(0);
    for (const error of errors) {
      expect(error.field).toBeTruthy();
      expect(error.message).toBeTruthy();
      expect(error.guidance).toBeTruthy();
    }
  });
});
