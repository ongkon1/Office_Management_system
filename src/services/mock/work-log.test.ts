import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkLogInput } from '@/contracts/work-log';
import { formatDurationDelta } from '@/lib/format';
import { mockStore } from './store';
import { mockTimesheetService } from './timesheet';
import { toTaskSummary } from './work';

const workLogInput = (idempotencyKey: string): WorkLogInput => ({
  employeeId: 'emp-1001',
  workDate: '2026-09-02',
  divisionId: 'pia',
  projectId: 'prj-vp2',
  taskId: 'tsk-1',
  durationMinutes: 30,
  workLocation: 'office',
  workDescription: 'Reviewed benchmark output.',
  completedWork: 'Recorded the confirmed findings.',
  supportingLink: null,
  attachmentIds: [],
  overtimeReason: null,
  criticalExplanation: null,
  source: 'manual',
  idempotencyKey,
});

beforeEach(() => {
  mockStore.reset();
});

describe('task-based mock service boundary', () => {
  it('deduplicates a retried work-log save by idempotency key', async () => {
    const input = workLogInput(`work-log-retry-${Math.random()}`);
    const first = await mockTimesheetService.createWorkLog(input);
    const retry = await mockTimesheetService.createWorkLog(input);

    expect(first.status).toBe('success');
    expect(retry.status).toBe('success');
    if (first.status !== 'success' || retry.status !== 'success') return;
    expect(retry.data.id).toBe(first.data.id);
    expect(retry.data.durationMinutes).toBe(30);
  });

  it('records a status transition without changing the day active minutes', async () => {
    const before = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });
    const moved = await mockTimesheetService.transitionTask({
      taskId: 'tsk-1',
      fromStatus: 'in_progress',
      toStatus: 'completed',
      actorRole: 'employee',
      note: 'Benchmark complete.',
      idempotencyKey: `task-complete-${Math.random()}`,
    });
    const after = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });

    expect(moved.status).toBe('success');
    expect(before.status).toBe('success');
    expect(after.status).toBe('success');
    if (before.status !== 'success' || after.status !== 'success') return;
    expect(after.data.summary.active.minutes).toBe(before.data.summary.active.minutes);
  });

  it('keeps historical clock ranges renderable while new work logs have no range', async () => {
    const historical = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-01',
    });
    expect(historical.status).toBe('success');
    if (historical.status !== 'success') return;
    expect(historical.data.entries.every((entry) => entry.timeRangeLabel !== null)).toBe(true);

    const saved = await mockTimesheetService.createWorkLog(
      workLogInput(`duration-only-${Math.random()}`),
    );
    expect(saved.status).toBe('success');
    if (saved.status !== 'success') return;
    const current = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });
    expect(current.status).toBe('success');
    if (current.status !== 'success') return;
    const newRow = current.data.entries.find((entry) => entry.id === saved.data.id);
    expect(newRow?.timeRangeLabel).toBeNull();
  });

  it('derives task actuals, signed variance and dated breakdown from saved rows', () => {
    const task = mockStore.findTask('tsk-1');
    if (!task) throw new Error('fixture task missing');
    const view = toTaskSummary(task);
    const expectedActual = mockStore
      .entriesForTask(task.id)
      .filter((entry) => entry.state !== 'draft')
      .reduce((sum, entry) => sum + entry.activeMinutes, 0);

    expect(view.actual.minutes).toBe(expectedActual);
    expect(view.variance.minutes).toBe(expectedActual - task.estimatedMinutes);
    expect(view.variance.label).toBe(
      formatDurationDelta(expectedActual - task.estimatedMinutes),
    );
    expect(view.dailyActuals.length).toBeGreaterThan(0);
    expect(
      view.dailyActuals.reduce((sum, day) => sum + day.actual.minutes, 0),
    ).toBe(expectedActual);
  });
});
