import { beforeEach, describe, expect, it } from 'vitest';
import type { WorkLogInput } from '@/contracts/work-log';
import { formatDurationDelta } from '@/lib/format';
import { mockStore } from './store';
import { mockTimesheetService, resetTaskWorkflowState } from './timesheet';
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
  resetTaskWorkflowState();
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

  it('appends repeated logs for one task and date and aggregates their daily actual', async () => {
    const taskId = 'tsk-1';
    const workDate = '2026-09-02';
    const before = mockStore
      .entriesForTask(taskId)
      .filter((entry) => entry.workDate === workDate && entry.state !== 'draft')
      .reduce((sum, entry) => sum + entry.activeMinutes, 0);

    const first = await mockTimesheetService.createWorkLog({
      ...workLogInput(`repeated-first-${Math.random()}`),
      durationMinutes: 20,
      workDescription: 'Reviewed the first benchmark batch.',
      completedWork: 'Recorded findings from the first batch.',
    });
    const second = await mockTimesheetService.createWorkLog({
      ...workLogInput(`repeated-second-${Math.random()}`),
      durationMinutes: 25,
      workDescription: 'Reviewed the second benchmark batch.',
      completedWork: 'Recorded findings from the second batch.',
    });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') return;
    expect(second.data.id).not.toBe(first.data.id);

    const history = await mockTimesheetService.getTaskHistory(taskId);
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    const day = history.data.dailyActuals.find((item) => item.workDate === workDate);
    expect(day?.actual.minutes).toBe(before + 45);
    expect(day?.workLogIds).toEqual(expect.arrayContaining([first.data.id, second.data.id]));
  });

  it('copies a work log into a clean target-date draft and revalidates it on save', async () => {
    const source = await mockTimesheetService.createWorkLog({
      ...workLogInput(`copy-source-${Math.random()}`),
      supportingLink: 'https://example.test/evidence',
      attachmentIds: ['attachment-source'],
      overtimeReason: 'Source-day reason',
      criticalExplanation: 'Source-day explanation',
    });
    expect(source.status).toBe('success');
    if (source.status !== 'success') return;

    const copied = await mockTimesheetService.copyWorkLog({
      sourceWorkLogId: source.data.id,
      targetDate: '2026-09-03',
    });
    expect(copied.status).toBe('success');
    if (copied.status !== 'success') return;

    expect(copied.data).toMatchObject({
      workDate: '2026-09-03',
      taskId: source.data.taskId,
      durationMinutes: source.data.durationMinutes,
      workDescription: source.data.workDescription,
      completedWork: '',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      source: 'manual',
    });
    expect(copied.data).not.toHaveProperty('idempotencyKey');
    expect(copied.data).not.toHaveProperty('state');

    const attemptedSave = await mockTimesheetService.createWorkLog({
      ...copied.data,
      idempotencyKey: `copy-target-${Math.random()}`,
    });
    expect(attemptedSave.status).toBe('validation_failure');
    if (attemptedSave.status !== 'validation_failure') return;
    expect(attemptedSave.fieldErrors.some((error) => error.field === 'completedWork')).toBe(true);
  });

  it('edits a work log without double-counting it and preserves audited before/after history', async () => {
    const baseline = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });
    expect(baseline.status).toBe('success');
    if (baseline.status !== 'success') return;
    const created = await mockTimesheetService.createWorkLog({
      ...workLogInput(`edit-source-${Math.random()}`),
      durationMinutes: 30,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') return;

    const preview = await mockTimesheetService.previewWorkLog(
      { ...created.data, durationMinutes: 45 },
      { excludeWorkLogId: created.data.id },
    );
    const updated = await mockTimesheetService.updateWorkLog(created.data.id, {
      ...created.data,
      durationMinutes: 45,
      expectedVersion: created.data.version ?? 0,
      changeReason: 'Corrected the duration from my notes.',
    });

    expect(preview.status).toBe('success');
    expect(updated.status).toBe('success');
    if (preview.status !== 'success' || updated.status !== 'success') return;
    expect(preview.data.dayActive.minutes).toBe(
      baseline.data.summary.active.minutes + updated.data.durationMinutes,
    );

    const history = await mockTimesheetService.getWorkLogHistory(created.data.id);
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    expect(history.data).toHaveLength(1);
    expect(history.data[0]).toMatchObject({
      reason: 'Corrected the duration from my notes.',
      before: { durationMinutes: 30 },
      after: { durationMinutes: 45 },
    });
  });

  it('requires a reason before changing a saved work log', async () => {
    const created = await mockTimesheetService.createWorkLog(
      workLogInput(`edit-reason-${Math.random()}`),
    );
    expect(created.status).toBe('success');
    if (created.status !== 'success') return;
    const result = await mockTimesheetService.updateWorkLog(created.data.id, {
      ...created.data,
      expectedVersion: created.data.version ?? 0,
      changeReason: ' ',
    });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.focusField).toBe('changeReason');
    }
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

  it('returns the original transition for an idempotent retry and conflicts on a stale move', async () => {
    const idempotencyKey = `transition-retry-${Math.random()}`;
    const input = {
      taskId: 'tsk-1',
      fromStatus: 'in_progress' as const,
      toStatus: 'completed' as const,
      actorRole: 'employee' as const,
      note: 'Complete.',
      idempotencyKey,
    };
    const first = await mockTimesheetService.transitionTask(input);
    const retry = await mockTimesheetService.transitionTask(input);
    const stale = await mockTimesheetService.transitionTask({
      ...input,
      idempotencyKey: `${idempotencyKey}-stale`,
    });

    expect(first.status).toBe('success');
    expect(retry.status).toBe('success');
    if (first.status === 'success' && retry.status === 'success') {
      expect(retry.data.id).toBe(first.data.id);
    }
    expect(stale.status).toBe('conflict');
  });

  it('requires a reopen reason and preserves the original completion event', async () => {
    const withoutReason = await mockTimesheetService.transitionTask({
      taskId: 'tsk-8',
      fromStatus: 'completed',
      toStatus: 'in_progress',
      actorRole: 'employee',
      note: null,
      idempotencyKey: `reopen-missing-${Math.random()}`,
    });
    expect(withoutReason.status).toBe('validation_failure');

    const reopened = await mockTimesheetService.transitionTask({
      taskId: 'tsk-8',
      fromStatus: 'completed',
      toStatus: 'in_progress',
      actorRole: 'employee',
      note: 'Accessibility follow-up is required.',
      idempotencyKey: `reopen-${Math.random()}`,
    });
    expect(reopened.status).toBe('success');

    const history = await mockTimesheetService.getTaskHistory('tsk-8');
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    const transitions = history.data.items.filter((item) => item.kind === 'transition');
    expect(transitions.map((item) => item.transition.toStatus)).toEqual([
      'completed',
      'in_progress',
    ]);
    expect(transitions[1].transition.note).toBe('Accessibility follow-up is required.');
  });

  it('refuses starting an unreviewed employee-raised task and direct completion by an employee', async () => {
    const awaitingReview = await mockTimesheetService.transitionTask({
      taskId: 'tsk-10',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      actorRole: 'employee',
      note: null,
      idempotencyKey: `unreviewed-${Math.random()}`,
    });
    const directComplete = await mockTimesheetService.transitionTask({
      taskId: 'tsk-10',
      fromStatus: 'pending',
      toStatus: 'completed',
      actorRole: 'employee',
      note: 'Done without starting.',
      idempotencyKey: `direct-${Math.random()}`,
    });
    expect(awaitingReview.status).toBe('validation_failure');
    expect(directComplete.status).toBe('permission_denied');
  });

  it('keeps historical clock ranges renderable while new work logs have no range', async () => {
    const historical = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-01',
    });
    expect(historical.status).toBe('success');
    if (historical.status !== 'success') return;
    expect(
      historical.data.entries.every(
        (entry) =>
          entry.recordKind === 'historical_clock_entry' &&
          entry.timeRangeLabel !== null &&
          !entry.canEdit &&
          !entry.canDelete,
      ),
    ).toBe(true);

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
    expect(newRow?.recordKind).toBe('work_log');
    expect(newRow?.timeRangeLabel).toBeNull();
    expect(newRow?.canEdit).toBe(true);
    expect(newRow?.canDelete).toBe(true);
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
