import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeTaskFormInput } from '@/contracts/task-review';
import { mockStore } from './store';
import { mockTaskReviewService, resetTaskReviewState } from './task-review';
import { mockTimesheetService } from './timesheet';
import { selectableTasks } from './organization';

/**
 * `FE-0784` — an employee raising a task, and their Team Lead endorsing it.
 *
 * The rule worth the most tests is the one connecting this feature to payroll:
 * a task nobody has approved must not receive time. Everything else here is
 * ordinary scope and validation.
 */

const EMPLOYEE = 'usr-1001'; // Nadia Rahman, Team Lead emp-2001
const OTHER_EMPLOYEE = 'usr-1004'; // Sumaiya Noor, Team Lead emp-2002
const TEAM_LEAD = 'usr-2001'; // Imran Hossain
const OTHER_TEAM_LEAD = 'usr-2002'; // Farhana Islam
const HR = 'usr-3001';
const FINANCE = 'usr-4001';
const ADMIN = 'usr-9001';
const MANAGEMENT = 'usr-5001';

const FORM: EmployeeTaskFormInput = {
  title: 'Rewrite the ingest tests',
  projectId: 'prj-vp2',
  priority: 'medium',
  dueDate: '2026-09-30',
  estimatedHours: '6',
  description: 'The current tests do not cover the malformed-row path.',
};

beforeEach(() => {
  mockStore.reset();
  resetTaskReviewState();
});

describe('who may raise a task', () => {
  it('accepts an employee', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, FORM);
    expect(result.status).toBe('success');
  });

  it.each([
    ['a Team Lead', TEAM_LEAD],
    ['HR', HR],
    ['Finance', FINANCE],
    ['the Super Administrator', ADMIN],
    ['Management', MANAGEMENT],
  ])('refuses %s at the service', async (_label, userId) => {
    const result = await mockTaskReviewService.create(userId, FORM);
    expect(result.status).toBe('permission_denied');
  });

  it('tells a Team Lead why the raise form is not for them', async () => {
    const options = await mockTaskReviewService.options(TEAM_LEAD);
    if (options.status !== 'success') throw new Error('expected success');
    expect(options.data.canCreate).toBe(false);
    expect(options.data.createBlockedReason).toBeTruthy();
  });

  it('names the reviewer before anything is typed', async () => {
    const options = await mockTaskReviewService.options(EMPLOYEE);
    if (options.status !== 'success') throw new Error('expected success');
    expect(options.data.reviewerName).toBe('Imran Hossain');
    expect(options.data.canCreate).toBe(true);
  });

  it('offers only projects in divisions the employee is assigned to', async () => {
    const options = await mockTaskReviewService.options(EMPLOYEE);
    if (options.status !== 'success') throw new Error('expected success');
    // Nadia is assigned to PowerInAI, Government Projects and WesternCF.
    const ids = options.data.projects.map((project) => project.value);
    expect(ids).toContain('prj-vp2');
    expect(ids).not.toContain('prj-alb'); // PowerInAI Training — not hers
    expect(ids).not.toContain('prj-lsm'); // inactive
  });

  it('refuses a project outside those divisions even when posted directly', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, {
      ...FORM,
      projectId: 'prj-alb',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('projectId');
    expect(result.fieldErrors[0].guidance).toBeTruthy();
  });
});

describe('a raised task starts unapproved', () => {
  it('is pending review, assigned to the person who raised it', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, FORM);
    if (result.status !== 'success') throw new Error('expected success');

    const task = mockStore.findTask(result.data.id);
    expect(task?.reviewState).toBe('pending_review');
    expect(task?.creatorEmployeeId).toBe('emp-1001');
    expect(task?.assigneeEmployeeId).toBe('emp-1001');
    expect(task?.reviewerEmployeeId).toBeNull();
  });

  it('records the estimate in minutes, not hours', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, {
      ...FORM,
      estimatedHours: '6.5',
    });
    if (result.status !== 'success') throw new Error('expected success');
    expect(mockStore.findTask(result.data.id)?.estimatedMinutes).toBe(390);
  });

  it('leaves a task a Team Lead assigned untouched', () => {
    // `tsk-1` was assigned, not raised, so it needs no endorsement.
    expect(mockStore.findTask('tsk-1')?.reviewState).toBe('not_required');
  });
});

describe('an unapproved task cannot receive time', () => {
  it('is absent from the selectable list', async () => {
    const created = await mockTaskReviewService.create(EMPLOYEE, FORM);
    if (created.status !== 'success') throw new Error('expected success');

    const ids = selectableTasks('prj-vp2').map((task) => task.id);
    expect(ids).not.toContain(created.data.id);
    expect(ids).not.toContain('tsk-10'); // fixture, pending review
    expect(ids).not.toContain('tsk-13'); // fixture, rejected
    expect(ids).toContain('tsk-12'); // fixture, approved
  });

  it('is refused when its id is submitted directly, which the dropdown cannot prevent', async () => {
    const created = await mockTaskReviewService.create(EMPLOYEE, FORM);
    if (created.status !== 'success') throw new Error('expected success');

    const result = await mockTimesheetService.createEntry({
      employeeId: 'emp-1001',
      workDate: '2026-09-02',
      divisionId: 'pia',
      projectId: 'prj-vp2',
      taskId: created.data.id,
      entryMethod: 'manual_duration',
      workLocation: 'office',
      startTime: null,
      endTime: null,
      activeMinutes: 120,
      workDescription: 'Rewriting the ingest tests.',
      completedWork: 'Covered the malformed-row path.',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      idempotencyKey: `test-${Math.random()}`,
    });

    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    const error = result.fieldErrors.find((item) => item.field === 'taskId');
    expect(error?.code).toBe('TASK_AWAITING_REVIEW');
    expect(error?.guidance).toBeTruthy();
  });

  it('is refused after rejection, with a different message', async () => {
    const result = await mockTimesheetService.createEntry({
      employeeId: 'emp-1001',
      workDate: '2026-09-02',
      divisionId: 'pia',
      projectId: 'prj-vp2',
      taskId: 'tsk-13', // rejected in the fixtures
      entryMethod: 'manual_duration',
      workLocation: 'office',
      startTime: null,
      endTime: null,
      activeMinutes: 60,
      workDescription: 'Rebuilding the image.',
      completedWork: 'Base image done.',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      idempotencyKey: `test-${Math.random()}`,
    });

    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors.find((item) => item.field === 'taskId')?.code).toBe(
      'TASK_REVIEW_REJECTED',
    );
  });

  it('accepts time once the Team Lead approves it', async () => {
    const created = await mockTaskReviewService.create(EMPLOYEE, FORM);
    if (created.status !== 'success') throw new Error('expected success');

    await mockTaskReviewService.decide(TEAM_LEAD, created.data.id, {
      decision: 'approved',
      note: '',
    });

    expect(selectableTasks('prj-vp2').map((task) => task.id)).toContain(created.data.id);

    const result = await mockTimesheetService.createEntry({
      employeeId: 'emp-1001',
      workDate: '2026-09-02',
      divisionId: 'pia',
      projectId: 'prj-vp2',
      taskId: created.data.id,
      entryMethod: 'manual_duration',
      workLocation: 'office',
      startTime: null,
      endTime: null,
      activeMinutes: 120,
      workDescription: 'Rewriting the ingest tests.',
      completedWork: 'Covered the malformed-row path.',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      idempotencyKey: `test-${Math.random()}`,
    });
    expect(result.status).toBe('success');
  });
});

describe('who may review', () => {
  it('queues the task for the raiser’s own Team Lead', async () => {
    const queue = await mockTaskReviewService.queue(TEAM_LEAD);
    if (queue.status !== 'success') throw new Error('expected success');
    // `tsk-10` and `tsk-11` were raised by emp-1001 and emp-1002, both his.
    expect(queue.data.rows.map((row) => row.id).sort()).toEqual(['tsk-10', 'tsk-11']);
  });

  it('does not queue it for a different Team Lead', async () => {
    const queue = await mockTaskReviewService.queue(OTHER_TEAM_LEAD);
    if (queue.status !== 'success') throw new Error('expected success');
    expect(queue.data.rows.map((row) => row.id)).not.toContain('tsk-10');
  });

  it('gives a non-Team-Lead an empty queue rather than an error', async () => {
    for (const userId of [EMPLOYEE, HR, FINANCE, ADMIN, MANAGEMENT]) {
      const queue = await mockTaskReviewService.queue(userId);
      if (queue.status !== 'success') throw new Error('expected success');
      expect(queue.data.awaitingCount).toBe(0);
    }
  });

  it('refuses a Team Lead the person does not report to', async () => {
    // `tsk-10` was raised by emp-1001, whose Team Lead is emp-2001.
    const result = await mockTaskReviewService.decide(OTHER_TEAM_LEAD, 'tsk-10', {
      decision: 'approved',
      note: '',
    });
    expect(result.status).toBe('permission_denied');
  });

  it.each([
    ['an employee', EMPLOYEE],
    ['HR', HR],
    ['Finance', FINANCE],
    ['the Super Administrator', ADMIN],
  ])('refuses %s, who has no authority over the task', async (_label, userId) => {
    const result = await mockTaskReviewService.decide(userId, 'tsk-10', {
      decision: 'approved',
      note: '',
    });
    expect(result.status).toBe('permission_denied');
  });

  it('refuses the person who raised it, so nobody endorses their own work', async () => {
    const created = await mockTaskReviewService.create(EMPLOYEE, FORM);
    if (created.status !== 'success') throw new Error('expected success');

    const result = await mockTaskReviewService.decide(EMPLOYEE, created.data.id, {
      decision: 'approved',
      note: '',
    });
    expect(result.status).toBe('permission_denied');
  });
});

describe('the decision', () => {
  it('records who decided and when', async () => {
    const result = await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'approved',
      note: '',
    });
    if (result.status !== 'success') throw new Error('expected success');

    const task = mockStore.findTask('tsk-10');
    expect(task?.reviewState).toBe('approved');
    expect(task?.reviewerEmployeeId).toBe('emp-2001');
    expect(task?.reviewedAt).toBeTruthy();
    expect(result.data.blocksTimeEntry).toBe(false);
  });

  it('requires a note when not approving, with guidance', async () => {
    const result = await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'rejected',
      note: '   ',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('note');
    expect(result.fieldErrors[0].guidance).toBeTruthy();
  });

  it('carries the note back to the person who raised it', async () => {
    await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'rejected',
      note: 'Fold this into the existing harness task.',
    });
    const task = mockStore.findTask('tsk-10');
    expect(task?.reviewNote).toBe('Fold this into the existing harness task.');
  });

  it('returns a conflict rather than a second decision', async () => {
    await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'approved',
      note: '',
    });
    const second = await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'rejected',
      note: 'Changed my mind.',
    });
    expect(second.status).toBe('conflict');
  });

  it('refuses to review a task that was assigned rather than raised', async () => {
    const result = await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-1', {
      decision: 'approved',
      note: '',
    });
    expect(result.status).toBe('conflict');
  });

  it('is not found for a task that does not exist', async () => {
    const result = await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-nope', {
      decision: 'approved',
      note: '',
    });
    expect(result.status).toBe('not_found');
  });

  it('leaves the queue shorter afterwards', async () => {
    const before = await mockTaskReviewService.queue(TEAM_LEAD);
    if (before.status !== 'success') throw new Error('expected success');

    await mockTaskReviewService.decide(TEAM_LEAD, 'tsk-10', {
      decision: 'approved',
      note: '',
    });

    const after = await mockTaskReviewService.queue(TEAM_LEAD);
    if (after.status !== 'success') throw new Error('expected success');
    expect(after.data.awaitingCount).toBe(before.data.awaitingCount - 1);
  });
});

describe('validation carries field, message and guidance', () => {
  it('reports every empty required field at once', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, {
      title: '',
      projectId: '',
      priority: 'medium',
      dueDate: '',
      estimatedHours: '',
      description: '',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');

    expect(result.fieldErrors.map((error) => error.field).sort()).toEqual([
      'estimatedHours',
      'projectId',
      'title',
    ]);
    for (const error of result.fieldErrors) {
      expect(error.message).toBeTruthy();
      expect(error.guidance).toBeTruthy();
    }
  });

  it('rejects a due date in the past', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, {
      ...FORM,
      dueDate: '2026-01-01',
    });
    if (result.status !== 'validation_failure') throw new Error('expected validation failure');
    expect(result.fieldErrors[0].field).toBe('dueDate');
  });

  it('accepts an empty due date, because it is optional', async () => {
    const result = await mockTaskReviewService.create(EMPLOYEE, { ...FORM, dueDate: '' });
    expect(result.status).toBe('success');
  });

  it.each([['abc'], ['0'], ['-3'], ['600']])('rejects the estimate %s', async (estimatedHours) => {
    const result = await mockTaskReviewService.create(EMPLOYEE, { ...FORM, estimatedHours });
    expect(result.status).toBe('validation_failure');
  });
});

describe('the employee sees why a task is blocked', () => {
  it('explains a pending task rather than only labelling it', async () => {
    const created = await mockTaskReviewService.create(OTHER_EMPLOYEE, {
      ...FORM,
      projectId: 'prj-wpr',
    });
    if (created.status !== 'success') throw new Error('expected success');

    const task = mockStore.findTask(created.data.id);
    expect(task?.reviewState).toBe('pending_review');

    const decided = await mockTaskReviewService.decide(OTHER_TEAM_LEAD, created.data.id, {
      decision: 'rejected',
      note: 'Already covered by the intake schema task.',
    });
    if (decided.status !== 'success') throw new Error('expected success');
    expect(decided.data.label).toBe('Not approved');
    expect(decided.data.blocksTimeEntry).toBe(true);
    expect(decided.data.note).toBe('Already covered by the intake schema task.');
    expect(decided.data.reviewerName).toBe('Farhana Islam');
  });
});
