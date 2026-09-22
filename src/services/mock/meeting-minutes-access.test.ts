import { beforeEach, describe, expect, it } from 'vitest';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { findProtectedMeetingMinuteFields } from '@/contracts/meeting-minutes';
import { DEFAULT_PAGINATION } from '@/contracts/query';
import { taskAcceptsTime } from '@/contracts/domain';
import { mockMeetingMinutesService, resetMeetingMinutesState } from './meeting-minutes';
import { resetDemoData } from './reset';
import { mockStore } from './store';
import { mockTeamLeadService } from './team-lead';
import { mockTimesheetService } from './timesheet';
import { mockTaskService } from './work';

/**
 * `FE-1130` — every seeded case, `FE-1131` — who may use the module and who
 * may change it, `FE-1132` — creator versus non-creator, scope, government
 * projects, and direct links that must not reveal anything.
 *
 * Driven only through the service, the way the MySQL adapter will be held to
 * the same promises (`BE-1343`).
 */

const EMPLOYEE = 'usr-1001'; // Nadia: pia, gov, wcf — no government permission
const TEAM_LEAD = 'usr-2001'; // Imran: pia, pit, cjg — creator of min-1001, min-1008
const GOV_LEAD = 'usr-2002'; // Farhana: gov, wcf — has the government permission
const HR = 'usr-3001'; // Rezaul: every division — no government permission
const MANAGEMENT = 'usr-5001'; // view-only, every division
const ADMIN = 'usr-9001'; // every division and permission

const ALL_ROLES = [EMPLOYEE, TEAM_LEAD, GOV_LEAD, HR, MANAGEMENT, ADMIN];
const READ_ONLY = [
  ['an Employee', EMPLOYEE],
  ['Management/View-Only', MANAGEMENT],
] as const;

async function detail(userId: string, minuteId: string): Promise<MeetingMinuteDetailView> {
  const result = await mockMeetingMinutesService.get(userId, minuteId);
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data;
}

async function ids(userId: string, includeArchived = false): Promise<readonly string[]> {
  const result = await mockMeetingMinutesService.list(userId, {
    pagination: DEFAULT_PAGINATION,
    filters: includeArchived ? { includeArchived: true } : undefined,
  });
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data.page.items.map((item) => item.id);
}

beforeEach(() => {
  resetDemoData();
  resetMeetingMinutesState();
});

/* ========================================================================= */
/* FE-1130                                                                    */
/* ========================================================================= */

describe('every seeded case (FE-1130)', () => {
  it('no AI: saved without it, Not Processed, nothing generated', async () => {
    const minute = await detail(HR, 'min-1002');
    expect(minute.aiRequested).toBe(false);
    expect(minute.processing).toMatchObject({ status: 'not_processed', attemptCount: 0, processedAtLabel: null });
    expect(minute.interpretation).toBeNull();
    expect(minute.generatedTasks).toEqual([]);
  });

  it('pending and processing: queued or running, nothing generated yet', async () => {
    expect((await detail(ADMIN, 'min-1003')).processing.status).toBe('pending');
    expect((await detail(ADMIN, 'min-1005')).processing.status).toBe('processing');
    expect((await detail(ADMIN, 'min-1005')).interpretation).toBeNull();
  });

  it('processed with a mentioned assignee', async () => {
    const minute = await detail(TEAM_LEAD, 'min-1001');
    expect(minute.processing.status).toBe('processed');
    const first = minute.generatedTasks[0];
    if (first.access !== 'visible') throw new Error('expected visible');
    expect(first.matchOutcome.kind).toBe('mentioned_assignee');
    expect(first.assigneeName).toBe('Nadia Rahman');
  });

  it('failed and retryable', async () => {
    const minute = await detail(HR, 'min-1004');
    expect(minute.processing.status).toBe('failed');
    expect(minute.processing.error?.retryable).toBe(true);
    expect(minute.actions.canRetry).toBe(true);
  });

  it('processed with no valid tasks', async () => {
    const minute = await detail(HR, 'min-1007');
    expect(minute.processing.status).toBe('processed');
    expect(minute.interpretation?.decisions).toHaveLength(2);
    expect(minute.generatedTasks).toEqual([]);
    expect(minute.duplicateProposalCount).toBe(0);
  });

  it('long content: a long title and an unbroken address in the minute', async () => {
    const minute = await detail(HR, 'min-1007');
    expect(minute.title.length).toBeGreaterThan(120);
    expect(minute.content).toMatch(/https:\/\/\S{80,}/);
  });

  it('unassigned tasks, for both reasons, beside a matched one', async () => {
    const tasks = (await detail(TEAM_LEAD, 'min-1008')).generatedTasks;
    expect(tasks.map((task) => task.access)).toEqual(['visible', 'visible', 'visible']);
    const [first, second, third] = tasks as Extract<(typeof tasks)[number], { access: 'visible' }>[];
    expect(first).toMatchObject({
      assigneeName: null,
      matchOutcome: { kind: 'unassigned', label: 'No eligible team member, so left unassigned' },
    });
    expect(second).toMatchObject({
      assigneeName: null,
      matchOutcome: { kind: 'unassigned', label: 'Named person not eligible, so left unassigned' },
    });
    expect(third).toMatchObject({ assigneeName: 'Sadia Karim', matchOutcome: { kind: 'matched' } });
  });

  it('a duplicate proposal is dropped and said so', async () => {
    const minute = await detail(TEAM_LEAD, 'min-1008');
    expect(minute.generatedTasks).toHaveLength(3);
    expect(minute.duplicateProposalCount).toBe(1);
  });

  it('an inaccessible sensitive-project minute', async () => {
    // Readable only with the government-project permission.
    expect((await detail(GOV_LEAD, 'min-1009')).processing.status).toBe('processed');
    expect((await detail(ADMIN, 'min-1009')).generatedTasks).toHaveLength(1);
    for (const userId of [EMPLOYEE, TEAM_LEAD, HR, MANAGEMENT]) {
      expect((await mockMeetingMinutesService.get(userId, 'min-1009')).status).toBe('not_found');
      expect(await ids(userId)).not.toContain('min-1009');
    }
    // Its task's assignee can open the task, but not the minute it came from.
    const source = await mockMeetingMinutesService.getTaskSourceMinute(EMPLOYEE, 'tsk-20');
    expect(source).toEqual({ status: 'success', data: { access: 'restricted' } });
  });

  it('archived, readable only with Include archived', async () => {
    expect(await ids(TEAM_LEAD)).not.toContain('min-1006');
    expect(await ids(TEAM_LEAD, true)).toContain('min-1006');
  });

  it('no seeded view carries a protected field', async () => {
    for (const id of ['min-1001', 'min-1002', 'min-1003', 'min-1004', 'min-1005', 'min-1006', 'min-1007', 'min-1008', 'min-1009']) {
      expect(findProtectedMeetingMinuteFields(await detail(ADMIN, id))).toEqual([]);
    }
  });
});

describe('an unassigned task in the task module (FE-1130)', () => {
  it('accepts no time, even In Progress', () => {
    expect(taskAcceptsTime({ status: 'in_progress', reviewState: 'not_required', assigneeEmployeeId: null })).toBe(false);
    expect(taskAcceptsTime({ status: 'in_progress', reviewState: 'not_required', assigneeEmployeeId: 'emp-1001' })).toBe(true);
  });

  it('is nobody’s task, and waits on the Team Lead’s board as Unassigned', async () => {
    for (const employeeId of ['emp-1001', 'emp-1002', 'emp-1003']) {
      const mine = await mockTaskService.listForEmployee(employeeId);
      if (mine.status !== 'success') throw new Error('expected success');
      expect(mine.data.map((task) => task.id)).not.toContain('tsk-17');
    }
    const board = await mockTeamLeadService.listTasks(TEAM_LEAD);
    if (board.status !== 'success') throw new Error('expected success');
    expect(board.data.find((task) => task.id === 'tsk-17')?.assignee).toBeNull();
  });

  it('cannot be started until someone is assigned', async () => {
    const result = await mockTimesheetService.transitionTask({
      taskId: 'tsk-17',
      fromStatus: 'pending',
      toStatus: 'in_progress',
      actorRole: 'team_lead',
      note: null,
      idempotencyKey: 'key-start-unassigned',
    });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0]).toMatchObject({ code: 'TASK_UNASSIGNED' });
    expect(result.fieldErrors[0].guidance).toMatch(/Assign it/);
  });

  it('is assigned by a Team Lead through the ordinary save, which then shows on the minute', async () => {
    const task = mockStore.findTask('tsk-17');
    if (!task) throw new Error('missing seed');
    const base = {
      title: task.title,
      projectId: task.projectId,
      supportingMemberIds: [],
      startDate: null,
      dueDate: task.dueDate,
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      description: task.description ?? '',
      checklist: [],
    };

    const refused = await mockTeamLeadService.saveTask(TEAM_LEAD, { ...base, assigneeEmployeeId: '' }, 'tsk-17');
    expect(refused.status).toBe('validation_failure');
    if (refused.status === 'validation_failure') expect(refused.fieldErrors[0].field).toBe('assigneeEmployeeId');

    const saved = await mockTeamLeadService.saveTask(TEAM_LEAD, { ...base, assigneeEmployeeId: 'emp-1001' }, 'tsk-17');
    expect(saved.status).toBe('success');

    const [first] = (await detail(TEAM_LEAD, 'min-1008')).generatedTasks;
    if (first.access !== 'visible') throw new Error('expected visible');
    // Now assigned, and marked as changed since generation; the original
    // outcome is kept, not rewritten.
    expect(first.assigneeName).toBe('Nadia Rahman');
    expect(first.reassignedSinceGeneration).toBe(true);
    expect(first.matchOutcome.kind).toBe('unassigned');
  });
});

/* ========================================================================= */
/* FE-1131                                                                    */
/* ========================================================================= */

describe('every active role can use the module (FE-1131)', () => {
  it.each(ALL_ROLES)('%s can list and read minutes in scope', async (userId) => {
    const listed = await ids(userId);
    expect(listed.length).toBeGreaterThan(0);
    for (const id of listed) expect((await mockMeetingMinutesService.get(userId, id)).status).toBe('success');
  });

  it.each([
    [EMPLOYEE, ['min-1005', 'min-1008', 'min-1001', 'min-1004']],
    [MANAGEMENT, ['min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1004', 'min-1007']],
    [GOV_LEAD, ['min-1003', 'min-1009', 'min-1004']],
  ])('%s reads exactly the minutes in scope', async (userId, expected) => {
    expect(await ids(userId)).toEqual(expected);
  });
});

describe('Employee and Management/View-Only change nothing (FE-1131)', () => {
  it.each(READ_ONLY)('%s is offered no action on any minute it can read', async (_label, userId) => {
    for (const id of await ids(userId, true)) {
      expect((await detail(userId, id)).actions).toEqual({
        canEdit: false,
        canArchive: false,
        canRequestProcessing: false,
        canRetry: false,
      });
    }
  });

  it.each(READ_ONLY)('%s is refused every write through a direct service call', async (_label, userId) => {
    // Pick minutes this viewer can read, so the refusal is a denial, not a
    // not-found that would hide the rule being tested.
    const readable = await ids(userId);
    const minuteId = readable[0];
    const failed = readable.includes('min-1004') ? 'min-1004' : minuteId;
    const version = (await detail(userId, minuteId)).version;

    const results = await Promise.all([
      mockMeetingMinutesService.createContext(userId),
      mockMeetingMinutesService.listProjectOptions(userId, 'cli-meghna'),
      mockMeetingMinutesService.create(userId, {
        title: 'Should not be saved',
        clientId: 'cli-meghna',
        projectId: 'prj-vp2',
        content: 'Text',
        processWithAi: true,
        idempotencyKey: `key-create-${userId}`,
      }),
      mockMeetingMinutesService.editContext(userId, minuteId),
      mockMeetingMinutesService.update(userId, {
        minuteId,
        expectedVersion: version,
        title: 'Changed',
        clientId: 'cli-meghna',
        projectId: 'prj-vp2',
        content: 'Changed',
      }),
      mockMeetingMinutesService.archive(userId, { minuteId, expectedVersion: version, idempotencyKey: `key-archive-${userId}` }),
      mockMeetingMinutesService.requestProcessing(userId, {
        minuteId,
        expectedVersion: version,
        idempotencyKey: `key-request-${userId}`,
      }),
      mockMeetingMinutesService.retryProcessing(userId, {
        minuteId: failed,
        failedAttemptId: 'att-1004-1',
        idempotencyKey: `key-retry-${userId}`,
      }),
    ]);
    for (const result of results) expect(result.status).toBe('permission_denied');

    // And nothing changed.
    expect(await ids(userId)).toEqual(readable);
    expect((await detail(ADMIN, 'min-1004')).processing.status).toBe('failed');
  });
});

/* ========================================================================= */
/* FE-1132                                                                    */
/* ========================================================================= */

describe('creator versus non-creator (FE-1132)', () => {
  it('the creator may change their own minute, another creator may not', async () => {
    expect((await detail(TEAM_LEAD, 'min-1001')).actions.canEdit).toBe(true); // Imran's
    expect((await detail(HR, 'min-1001')).actions.canEdit).toBe(false); // Rezaul is a creator role, not the creator
    expect((await mockMeetingMinutesService.editContext(HR, 'min-1001')).status).toBe('permission_denied');
  });

  it('the Super Administrator may change any minute they can read', async () => {
    for (const id of await ids(ADMIN)) {
      expect((await detail(ADMIN, id)).actions.canEdit).toBe(true);
    }
  });

  it('offers processing actions only where the status allows them', async () => {
    expect((await detail(HR, 'min-1002')).actions.canRequestProcessing).toBe(true); // Rezaul's, Not Processed
    expect((await detail(HR, 'min-1004')).actions.canRetry).toBe(true); // Rezaul's, Failed
    expect((await detail(TEAM_LEAD, 'min-1001')).actions).toMatchObject({ canRequestProcessing: false, canRetry: false });
  });

  it('requests processing for a Not Processed minute, once', async () => {
    const version = (await detail(HR, 'min-1002')).version;
    const input = { minuteId: 'min-1002', expectedVersion: version, idempotencyKey: 'key-request-once' };
    const first = await mockMeetingMinutesService.requestProcessing(HR, input);
    const repeat = await mockMeetingMinutesService.requestProcessing(HR, input);
    if (first.status !== 'success' || repeat.status !== 'success') throw new Error('expected success');
    expect(first.data.processing).toMatchObject({ status: 'pending', attemptCount: 1 });
    expect(first.data.aiRequested).toBe(true);
    expect(repeat.data.processing.latestAttemptId).toBe(first.data.processing.latestAttemptId);

    // A second, different request is a conflict: it is no longer Not Processed.
    const again = await mockMeetingMinutesService.requestProcessing(HR, {
      minuteId: 'min-1002',
      expectedVersion: first.data.version,
      idempotencyKey: 'key-request-twice',
    });
    expect(again.status).toBe('conflict');
  });

  it('refuses a request against a stale version', async () => {
    const result = await mockMeetingMinutesService.requestProcessing(HR, {
      minuteId: 'min-1002',
      expectedVersion: 99,
      idempotencyKey: 'key-request-stale',
    });
    expect(result.status).toBe('conflict');
  });
});

describe('client and project scope (FE-1132)', () => {
  it('offers only clients reachable through a project the creator may use', async () => {
    const lead = await mockMeetingMinutesService.createContext(TEAM_LEAD);
    const gov = await mockMeetingMinutesService.createContext(GOV_LEAD);
    if (lead.status !== 'success' || gov.status !== 'success') throw new Error('expected success');
    expect(lead.data.clients.map((client) => client.id)).toEqual(['cli-bit', 'cli-meghna']);
    expect(gov.data.clients.map((client) => client.id)).toEqual(['cli-mopa', 'cli-westbridge']);
  });

  it('refuses a project from another client, and one outside scope, with the same answer', async () => {
    const base = { title: 'T', content: 'C', processWithAi: false };
    const wrongClient = await mockMeetingMinutesService.create(TEAM_LEAD, {
      ...base,
      clientId: 'cli-meghna',
      projectId: 'prj-alb',
      idempotencyKey: 'key-wrong-client',
    });
    const outOfScope = await mockMeetingMinutesService.create(TEAM_LEAD, {
      ...base,
      clientId: 'cli-meghna',
      projectId: 'prj-wpr',
      idempotencyKey: 'key-out-of-scope',
    });
    for (const result of [wrongClient, outOfScope]) {
      expect(result.status).toBe('validation_failure');
      if (result.status === 'validation_failure') expect(result.fieldErrors[0].code).toBe('PROJECT_NOT_FOR_CLIENT');
    }
  });
});

describe('government projects and direct links (FE-1132)', () => {
  const WITHOUT_PERMISSION = [
    ['an Employee in the gov division', EMPLOYEE],
    ['HR', HR],
    ['Management', MANAGEMENT],
  ] as const;

  it.each(WITHOUT_PERMISSION)(
    '%s gets the same not-found for a government minute as for a nonexistent one, on every route',
    async (_label, userId) => {
      const calls = (id: string) => [
        mockMeetingMinutesService.get(userId, id),
        mockMeetingMinutesService.editContext(userId, id),
        mockMeetingMinutesService.getProcessingSnapshot(userId, id),
        mockMeetingMinutesService.openGeneratedTask(userId, id, 'lnk-1009-1'),
      ];
      const hidden = await Promise.all(calls('min-1009'));
      const missing = await Promise.all(calls('min-nope'));
      hidden.forEach((result, index) => {
        // Management and Employee are refused writes before lookup, so their
        // edit route is a denial for both ids alike — still indistinguishable.
        expect(result).toEqual(missing[index]);
      });
    },
  );

  it('keeps government minutes out of search, counts and client options for those without the permission', async () => {
    const result = await mockMeetingMinutesService.list(HR, {
      pagination: DEFAULT_PAGINATION,
      search: { term: 'records' },
    });
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.page.pageInfo.totalItems).toBe(0);
    expect(result.data.clientOptions.map((client) => client.id)).not.toContain('cli-mopa');
  });

  it('never answers with a denial for a record lookup, so an id cannot be probed', async () => {
    const lookups = ALL_ROLES.flatMap((userId) =>
      ['min-1001', 'min-1003', 'min-1009', 'min-nope'].flatMap((id) => [
        mockMeetingMinutesService.get(userId, id),
        mockMeetingMinutesService.getProcessingSnapshot(userId, id),
      ]),
    );
    for (const result of await Promise.all(lookups)) {
      expect(['success', 'not_found']).toContain(result.status);
    }
  });
});
