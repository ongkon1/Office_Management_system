import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findProtectedMeetingMinuteFields,
  SAFE_PROCESSING_ERROR_MESSAGE,
  type MeetingMinuteListQuery,
  type MeetingMinuteListView,
} from '@/contracts/meeting-minutes';
import { DEFAULT_PAGINATION } from '@/contracts/query';
import type { Result, ValidationFailure } from '@/contracts/results';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
  setMeetingMinutesCreateFault,
  setMeetingMinutesWorkerOutcome,
  setMeetingMinutesWorkerTiming,
} from './meeting-minutes';
import { allMockNotifications, resetMockNotifications } from './notification-store';

/**
 * `FE-1110` — the Meeting Minutes list.
 *
 * Seed (`src/fixtures/meeting-minutes.ts`): 1001 pia processed (Imran), 1002 pit
 * not processed (Rezaul), 1003 gov pending (Arif), 1004 wcf failed and
 * retryable (Rezaul), 1005 pia processing (Arif), 1006 pia archived (Imran).
 */

const EMPLOYEE = 'usr-1001'; // pia, gov, wcf — no government-project permission
const TEAM_LEAD = 'usr-2001'; // pia, pit, cjg
const HR = 'usr-3001'; // every division — no government-project permission
const MANAGEMENT = 'usr-5001'; // every division — no government-project permission
const ADMIN = 'usr-9001'; // every division and permission

const QUERY: MeetingMinuteListQuery = { pagination: DEFAULT_PAGINATION };

async function listFor(userId: string, query: Partial<MeetingMinuteListQuery> = {}) {
  return mockMeetingMinutesService.list(userId, { ...QUERY, ...query });
}

function view(result: Result<MeetingMinuteListView>): MeetingMinuteListView {
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data;
}

function ids(result: Result<MeetingMinuteListView>): readonly string[] {
  return view(result).page.items.map((item) => item.id);
}

function row(result: Result<MeetingMinuteListView>, id: string) {
  const found = view(result).page.items.find((item) => item.id === id);
  if (!found) throw new Error(`${id} is not in the list`);
  return found;
}

beforeEach(() => {
  resetMeetingMinutesState();
});

describe('who sees which minutes', () => {
  it.each([
    // `FE-1130` added `min-1007` (pit), `min-1008` (pia) and `min-1009` (gov).
    ['an Employee', EMPLOYEE, ['min-1005', 'min-1008', 'min-1001', 'min-1004']],
    ['a Team Lead', TEAM_LEAD, ['min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1007']],
    ['HR without the government permission', HR, ['min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1004', 'min-1007']],
    ['Management', MANAGEMENT, ['min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1004', 'min-1007']],
    ['the Super Administrator', ADMIN, ['min-1003', 'min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1009', 'min-1004', 'min-1007']],
  ])('%s sees only minutes in scope, newest first', async (_label, userId, expected) => {
    const result = await listFor(userId);
    expect(ids(result)).toEqual(expected);
    expect(view(result).page.pageInfo.totalItems).toBe(expected.length);
  });

  it('leaves archived minutes out unless asked for', async () => {
    expect(ids(await listFor(ADMIN))).not.toContain('min-1006');
    const withArchived = await listFor(ADMIN, { filters: { includeArchived: true } });
    expect(ids(withArchived)).toContain('min-1006');
    expect(row(withArchived, 'min-1006').isArchived).toBe(true);
  });

  it('offers only clients reachable through projects the viewer may see', async () => {
    expect(view(await listFor(HR)).clientOptions.map((item) => item.name)).toEqual([
      'Bengal Institute of Technology',
      'Meghna Group',
      'Westbridge Capital',
    ]);
    expect(view(await listFor(EMPLOYEE)).clientOptions.map((item) => item.name)).toEqual([
      'Meghna Group',
      'Westbridge Capital',
    ]);
    expect(view(await listFor(ADMIN)).clientOptions.map((item) => item.name)).toContain(
      'Ministry of Public Administration',
    );
  });

  it('answers a filter on a hidden project exactly as one on a nonexistent project', async () => {
    const hidden = view(await listFor(HR, { filters: { projectIds: ['prj-nrd'] } }));
    const missing = view(await listFor(HR, { filters: { projectIds: ['prj-does-not-exist'] } }));
    expect(hidden).toEqual(missing);
    expect(hidden.page.pageInfo.totalItems).toBe(0);
    expect(hidden.appliedFilters.projectIds).toEqual([]);
  });

  it('never matches search on a hidden minute', async () => {
    expect(view(await listFor(HR, { search: { term: 'steering' } })).page.pageInfo.totalItems).toBe(0);
    expect(ids(await listFor(ADMIN, { search: { term: 'steering' } }))).toEqual(['min-1003']);
  });

  it('refuses an unknown viewer without revealing anything', async () => {
    const result = await listFor('usr-nobody');
    expect(result.status).toBe('unauthenticated');
    expect(JSON.stringify(result)).not.toMatch(/min-|Meghna|steering/i);
  });
});

describe('row content', () => {
  it('shows title, client, project, creator, created date, AI choice and status', async () => {
    expect(row(await listFor(TEAM_LEAD), 'min-1001')).toMatchObject({
      title: 'Vision Platform v2 sprint review',
      client: { id: 'cli-meghna', name: 'Meghna Group' },
      projectName: 'Vision Platform v2',
      creatorName: expect.any(String),
      // The business timezone's 11:00, whatever case the locale gives the meridiem.
      createdAtLabel: expect.stringMatching(/^1 Sep 2026, 11:00\s?(am|AM)$/),
      aiRequested: true,
      aiRequestedLabel: 'Yes',
      processing: { status: 'processed', label: 'Processed' },
      isArchived: false,
      href: '/meeting-minutes/min-1001',
    });
    expect(row(await listFor(HR), 'min-1002')).toMatchObject({
      aiRequestedLabel: 'No',
      processing: { status: 'not_processed', label: 'Not processed' },
    });
  });

  it('carries no protected field or unreviewed count for any role', async () => {
    for (const userId of [EMPLOYEE, TEAM_LEAD, HR, MANAGEMENT, ADMIN]) {
      const result = await listFor(userId, { filters: { includeArchived: true } });
      expect(findProtectedMeetingMinuteFields(view(result))).toEqual([]);
    }
  });
});

describe('permitted actions', () => {
  const NONE = { canEdit: false, canArchive: false, canRequestProcessing: false, canRetry: false };

  it.each([
    ['an Employee', EMPLOYEE],
    ['Management', MANAGEMENT],
  ])('gives %s no actions and no Add', async (_label, userId) => {
    const result = view(await listFor(userId));
    expect(result.canCreate).toBe(false);
    for (const item of result.page.items) expect(item.actions).toEqual(NONE);
  });

  it('lets a creator role edit and archive its own minutes only', async () => {
    const result = await listFor(TEAM_LEAD);
    expect(view(result).canCreate).toBe(true);
    expect(row(result, 'min-1001').actions).toEqual({ ...NONE, canEdit: true, canArchive: true });
    expect(row(result, 'min-1005').actions).toEqual(NONE);
  });

  it('offers processing only where the status allows it', async () => {
    const result = await listFor(HR);
    expect(row(result, 'min-1002').actions).toEqual({
      canEdit: true,
      canArchive: true,
      canRequestProcessing: true,
      canRetry: false,
    });
    expect(row(result, 'min-1004').actions).toEqual({
      canEdit: true,
      canArchive: true,
      canRequestProcessing: false,
      canRetry: true,
    });
    expect(row(result, 'min-1001').actions).toEqual(NONE);
  });

  it('lets the Super Administrator act on any readable minute, but not an archived one', async () => {
    const result = await listFor(ADMIN, { filters: { includeArchived: true } });
    expect(row(result, 'min-1004').actions.canRetry).toBe(true);
    expect(row(result, 'min-1002').actions.canEdit).toBe(true);
    expect(row(result, 'min-1006').actions).toEqual(NONE);
  });
});

describe('filter options (FE-1111)', () => {
  it('offers only projects the viewer may see, inactive ones included', async () => {
    expect(view(await listFor(HR)).projectOptions.map((item) => item.id)).toEqual([
      'prj-alb',
      'prj-lsm',
      'prj-vp2',
      'prj-wpr',
    ]);
    expect(view(await listFor(EMPLOYEE)).projectOptions.map((item) => item.id)).toEqual([
      'prj-lsm',
      'prj-vp2',
      'prj-wpr',
    ]);
    const admin = view(await listFor(ADMIN)).projectOptions;
    expect(admin.map((item) => item.id)).toContain('prj-nrd');
    expect(admin.find((item) => item.id === 'prj-lsm')?.isActive).toBe(false);
  });

  it('never offers a project without a client, and every project’s client is offered', async () => {
    for (const userId of [EMPLOYEE, TEAM_LEAD, HR, MANAGEMENT, ADMIN]) {
      const result = view(await listFor(userId));
      expect(result.projectOptions.map((item) => item.id)).not.toContain('prj-mip');
      const clientIds = result.clientOptions.map((item) => item.id);
      for (const project of result.projectOptions) expect(clientIds).toContain(project.clientId);
    }
  });

  it('combines filters: a project from another client matches nothing', async () => {
    const result = await listFor(ADMIN, {
      filters: { clientIds: ['cli-meghna'], projectIds: ['prj-wpr'] },
    });
    expect(view(result).page.pageInfo.totalItems).toBe(0);
  });

  it('matches any of several statuses', async () => {
    expect(
      ids(await listFor(ADMIN, { filters: { processingStatuses: ['failed', 'pending'] } })),
    ).toEqual(['min-1003', 'min-1004']);
  });

  it('drops a hidden client from the applied filters', async () => {
    const result = view(await listFor(HR, { filters: { clientIds: ['cli-mopa', 'cli-bit'] } }));
    expect(result.appliedFilters.clientIds).toEqual(['cli-bit']);
    expect(result.page.items.map((item) => item.id)).toEqual(['min-1002', 'min-1007']);
  });
});

describe('query handling', () => {
  it('filters by created date in the business timezone', async () => {
    const result = await listFor(ADMIN, {
      filters: { createdDateRange: { from: '2026-09-02', to: '2026-09-02' } },
    });
    expect(ids(result)).toEqual(['min-1003', 'min-1005']);
  });

  it('searches title, client and project names', async () => {
    expect(ids(await listFor(HR, { search: { term: 'westbridge' } }))).toEqual(['min-1004']);
    expect(ids(await listFor(HR, { search: { term: 'bootcamp' } }))).toEqual(['min-1002', 'min-1007']);
  });

  it('never searches minute content', async () => {
    expect(view(await listFor(ADMIN, { search: { term: 'single sign-on' } })).page.pageInfo.totalItems).toBe(0);
  });

  it('sorts by the requested field and reports page information', async () => {
    const result = await listFor(ADMIN, {
      sort: { field: 'title', direction: 'asc' },
      pagination: { page: 1, pageSize: 10 },
    });
    expect(ids(result)).toEqual([
      'min-1007', // Bootcamp cohort…
      'min-1002', // Bootcamp curriculum…
      'min-1003', // Records digitisation steering…
      'min-1009', // Records digitisation vendor…
      'min-1005', // Vision Platform v2 client…
      'min-1001', // Vision Platform v2 sprint…
      'min-1008', // Vision Platform v2 support…
      'min-1004', // Westbridge…
    ]);
    expect(view(result).page.pageInfo).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 8,
      totalPages: 1,
      hasPreviousPage: false,
      hasNextPage: false,
    });
  });

  it('rejects an invalid page size with guidance', async () => {
    const result = await listFor(ADMIN, { pagination: { page: 1, pageSize: 7 } });
    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.fieldErrors[0].guidance).toMatch(/page size/i);
    }
  });
});

/**
 * `FE-1113` — the Add form's three operations.
 *
 * `prj-lsm` is an inactive Meghna Group project and `prj-mip` has no client, so
 * both are legitimate list filters but neither may be chosen for a new minute.
 */
describe('the Add form context (FE-1113)', () => {
  async function contextFor(userId: string) {
    return mockMeetingMinutesService.createContext(userId);
  }

  it.each([
    ['a Team Lead', TEAM_LEAD, ['Bengal Institute of Technology', 'Meghna Group']],
    ['HR without the government permission', HR, ['Bengal Institute of Technology', 'Meghna Group', 'Westbridge Capital']],
    [
      'the Super Administrator',
      ADMIN,
      ['Bengal Institute of Technology', 'Meghna Group', 'Ministry of Public Administration', 'Westbridge Capital'],
    ],
  ])('offers %s only clients reachable through a project they may use', async (_l, userId, names) => {
    const result = await contextFor(userId);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.clients.map((client) => client.name)).toEqual(names);
    expect(result.data.limits.titleMaxLength).toBe(200);
  });

  it.each([
    ['an Employee', EMPLOYEE],
    ['Management', MANAGEMENT],
  ])('refuses %s, who may read minutes but not add one', async (_label, userId) => {
    const result = await contextFor(userId);
    expect(result.status).toBe('permission_denied');
  });

  it('treats an unknown user as signed out', async () => {
    const result = await contextFor('usr-nobody');
    expect(result.status).toBe('unauthenticated');
  });

  it('offers only active projects of the chosen client', async () => {
    const result = await mockMeetingMinutesService.listProjectOptions(ADMIN, 'cli-meghna');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    // `prj-lsm` belongs to the same client but is inactive.
    expect(result.data.map((project) => project.id)).toEqual(['prj-vp2']);
  });

  it('answers an unknown client exactly as it answers one the viewer cannot see', async () => {
    const unknown = await mockMeetingMinutesService.listProjectOptions(HR, 'cli-nope');
    const hidden = await mockMeetingMinutesService.listProjectOptions(HR, 'cli-mopa');
    expect(unknown).toEqual(hidden);
    expect(unknown.status).toBe('success');
    if (unknown.status === 'success') expect(unknown.data).toEqual([]);
  });
});

describe('creating a minute (FE-1113)', () => {
  const VALID = {
    title: 'Quarterly review with Meghna Group',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    content: 'Agreed the October scope.\n\nExport to PDF stays in the release.',
  };

  async function create(userId: string, overrides: Partial<typeof VALID> & { processWithAi?: boolean } = {}) {
    const { processWithAi = false, ...fields } = overrides;
    return mockMeetingMinutesService.create(userId, {
      ...VALID,
      ...fields,
      processWithAi,
      idempotencyKey: `key-${Math.random()}`,
    });
  }

  it('saves the minute and leaves it Not Processed when AI was not chosen', async () => {
    const result = await create(TEAM_LEAD);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.processingStarted).toBe(false);
    expect(result.data.minute.processing.status).toBe('not_processed');
    expect(result.data.minute.processing.processedAtLabel).toBeNull();
    expect(result.data.minute.aiRequestedLabel).toBe('No');
    expect(result.data.minute.content).toBe(
      '<p>Agreed the October scope.</p><p>Export to PDF stays in the release.</p>',
    );
    // It is immediately listed for its creator.
    expect(ids(await listFor(TEAM_LEAD))).toContain(result.data.minute.id);
  });

  it('sets Pending, not Processed, when AI was chosen', async () => {
    const result = await create(TEAM_LEAD, { processWithAi: true });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.processingStarted).toBe(true);
    expect(result.data.minute.processing.status).toBe('pending');
    expect(result.data.minute.processing.processedAtLabel).toBeNull();
  });

  it.each([
    ['an Employee', EMPLOYEE],
    ['Management', MANAGEMENT],
  ])('refuses %s and stores nothing', async (_label, userId) => {
    const before = view(await listFor(ADMIN)).page.pageInfo.totalItems;
    expect((await create(userId)).status).toBe('permission_denied');
    expect(view(await listFor(ADMIN)).page.pageInfo.totalItems).toBe(before);
  });

  it('returns a field error with guidance for every missing field', async () => {
    const result = await create(TEAM_LEAD, { title: '  ', clientId: '', projectId: '', content: '' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;

    expect(result.fieldErrors.map((error) => error.field)).toEqual([
      'title',
      'clientId',
      'projectId',
      'content',
    ]);
    expect(result.focusField).toBe('title');
    for (const error of result.fieldErrors) {
      expect(error.code).toBe('REQUIRED');
      expect(error.guidance.length).toBeGreaterThan(0);
    }
  });

  it('rejects a project that belongs to another client', async () => {
    const result = await create(ADMIN, { projectId: 'prj-alb' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0].code).toBe('PROJECT_NOT_FOR_CLIENT');
  });

  it('answers a project outside the viewer scope exactly as it answers a mismatch', async () => {
    const outOfScope = await create(HR, { clientId: 'cli-mopa', projectId: 'prj-nrd' });
    expect(outOfScope.status).toBe('validation_failure');
    if (outOfScope.status !== 'validation_failure') return;
    // The client is refused as unavailable and the project as not that
    // client's; neither message confirms that `prj-nrd` exists.
    expect(outOfScope.fieldErrors.map((error) => error.code)).toEqual([
      'CLIENT_INACTIVE',
      'PROJECT_NOT_FOR_CLIENT',
    ]);
    expect(JSON.stringify(outOfScope)).not.toContain('National Records');
  });

  it('rejects an inactive project of a client the viewer may use', async () => {
    const result = await create(ADMIN, { projectId: 'prj-lsm' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    // `FE-1114` narrowed this: the viewer can already see `prj-lsm` under this
    // client, so it is named as inactive rather than answered generically.
    expect(result.fieldErrors[0].code).toBe('PROJECT_INACTIVE');
  });

  it('rejects content that was nothing but removed markup', async () => {
    const result = await create(TEAM_LEAD, { content: '<script>alert(1)</script>' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0].code).toBe('CONTENT_EMPTY_AFTER_SANITIZING');
  });

  it('rejects a title over the limit', async () => {
    const result = await create(TEAM_LEAD, { title: 'x'.repeat(201) });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0].code).toBe('TOO_LONG');
  });

  it('creates one minute for a repeated idempotency key', async () => {
    const input = { ...VALID, processWithAi: false, idempotencyKey: 'key-same' };
    const first = await mockMeetingMinutesService.create(TEAM_LEAD, input);
    const second = await mockMeetingMinutesService.create(TEAM_LEAD, input);
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') return;

    expect(second.data.minute.id).toBe(first.data.minute.id);
    expect(ids(await listFor(TEAM_LEAD)).filter((id) => id === first.data.minute.id)).toHaveLength(1);
  });

  it('carries no protected field into the saved view', async () => {
    const result = await create(ADMIN, { processWithAi: true });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(findProtectedMeetingMinuteFields(result.data)).toEqual([]);
  });

  it('forgets created minutes on reset', async () => {
    await create(TEAM_LEAD);
    resetMeetingMinutesState();
    expect(ids(await listFor(TEAM_LEAD))).toEqual(['min-1005', 'min-1008', 'min-1001', 'min-1002', 'min-1007']);
  });
});

/**
 * `FE-1114` — every validation code, and the one judgement between the two
 * project codes.
 */
describe('validation codes (FE-1114)', () => {
  const VALID = {
    title: 'Quarterly review with Meghna Group',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    content: 'Agreed the October scope.',
  };

  async function failureFor(
    userId: string,
    overrides: Partial<typeof VALID>,
  ): Promise<ValidationFailure> {
    const result = await mockMeetingMinutesService.create(userId, {
      ...VALID,
      ...overrides,
      processWithAi: false,
      idempotencyKey: `key-${Math.random()}`,
    });
    if (result.status !== 'validation_failure') {
      throw new Error(`expected validation_failure, got ${result.status}`);
    }
    return result;
  }

  it.each([
    ['REQUIRED on an empty title', { title: '   ' }, 'title', 'REQUIRED'],
    ['TOO_LONG on an over-length title', { title: 'x'.repeat(201) }, 'title', 'TOO_LONG'],
    ['REQUIRED on no client', { clientId: '', projectId: '' }, 'clientId', 'REQUIRED'],
    ['CLIENT_INACTIVE on a client the viewer cannot use', { clientId: 'cli-mopa', projectId: '' }, 'clientId', 'CLIENT_INACTIVE', HR],
    ['REQUIRED on no project', { projectId: '' }, 'projectId', 'REQUIRED'],
    ['PROJECT_INACTIVE on this client’s inactive project', { projectId: 'prj-lsm' }, 'projectId', 'PROJECT_INACTIVE'],
    ['PROJECT_NOT_FOR_CLIENT on another client’s project', { projectId: 'prj-alb' }, 'projectId', 'PROJECT_NOT_FOR_CLIENT'],
    ['CONTENT_EMPTY_AFTER_SANITIZING on markup-only content', { content: '<script>alert(1)</script>' }, 'content', 'CONTENT_EMPTY_AFTER_SANITIZING'],
    ['REQUIRED on empty content', { content: '  ' }, 'content', 'REQUIRED'],
  ])('returns %s', async (_label, overrides, field, code, viewer = ADMIN) => {
    const failure = await failureFor(viewer, overrides);
    const error = failure.fieldErrors.find((entry) => entry.field === field);
    expect(error?.code).toBe(code);
    // `REQ-TIME-025`: a field, a message and corrective guidance, always.
    expect(error?.message.length).toBeGreaterThan(0);
    expect(error?.guidance.length).toBeGreaterThan(0);
    expect(failure.focusField).toBe(failure.fieldErrors[0].field);
  });

  it('covers every declared validation code across the cases above', async () => {
    const seen = new Set<string>();
    const cases: readonly [string, Partial<typeof VALID>][] = [
      [ADMIN, { title: '   ' }],
      [ADMIN, { title: 'x'.repeat(201) }],
      [ADMIN, { clientId: '', projectId: '' }],
      // HR cannot use the government client, so this is the one that fails.
      [HR, { clientId: 'cli-mopa', projectId: '' }],
      [ADMIN, { projectId: 'prj-lsm' }],
      [ADMIN, { projectId: 'prj-alb' }],
      [ADMIN, { content: '<script>alert(1)</script>' }],
    ];
    for (const [viewer, overrides] of cases) {
      for (const error of (await failureFor(viewer, overrides)).fieldErrors) seen.add(error.code);
    }
    expect([...seen].sort()).toEqual([
      'CLIENT_INACTIVE',
      'CONTENT_EMPTY_AFTER_SANITIZING',
      'PROJECT_INACTIVE',
      'PROJECT_NOT_FOR_CLIENT',
      'REQUIRED',
      'TOO_LONG',
    ]);
  });

  it('does not name a project as inactive to a viewer who cannot see it', async () => {
    // `prj-nrd` is a government project; HR here has no government permission.
    const failure = await failureFor(HR, { clientId: 'cli-mopa', projectId: 'prj-nrd' });
    const error = failure.fieldErrors.find((entry) => entry.field === 'projectId');
    expect(error?.code).toBe('PROJECT_NOT_FOR_CLIENT');
    expect(JSON.stringify(failure)).not.toContain('National Records');
  });

  it('reports an unusable client generically rather than explaining its projects', async () => {
    // `cli-mopa` is out of scope for HR, so the project answer stays generic
    // even though the id is a real one.
    const failure = await failureFor(HR, { clientId: 'cli-mopa', projectId: 'prj-lsm' });
    expect(failure.fieldErrors.map((entry) => entry.code)).toEqual([
      'CLIENT_INACTIVE',
      'PROJECT_NOT_FOR_CLIENT',
    ]);
  });

  it('orders field errors so the focus target is the first field on screen', async () => {
    const failure = await failureFor(ADMIN, { title: '', clientId: '', projectId: '', content: '' });
    expect(failure.fieldErrors.map((entry) => entry.field)).toEqual([
      'title',
      'clientId',
      'projectId',
      'content',
    ]);
    expect(failure.focusField).toBe('title');
  });
});


/**
 * `FE-1115` — the save order. The minute is stored first, and what became of
 * the AI run is reported separately (`REQ-MTG-007`-`REQ-MTG-009`).
 */
describe('saving and AI dispatch (FE-1115)', () => {
  const VALID = {
    title: 'Quarterly review with Meghna Group',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    content: 'Agreed the October scope.',
  };

  async function create(processWithAi: boolean, key = `key-${Math.random()}`) {
    return mockMeetingMinutesService.create(TEAM_LEAD, {
      ...VALID,
      processWithAi,
      idempotencyKey: key,
    });
  }

  afterEach(() => {
    setMeetingMinutesCreateFault(null);
  });

  it('records no attempt and no warning when AI was not requested', async () => {
    const result = await create(false);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.minute.processing.status).toBe('not_processed');
    expect(result.data.minute.processing.attemptCount).toBe(0);
    expect(result.warnings ?? []).toEqual([]);
  });

  it('queues a run and reports Pending, with no processed time yet', async () => {
    const result = await create(true);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.processingStarted).toBe(true);
    expect(result.data.minute.processing.status).toBe('pending');
    expect(result.data.minute.processing.attemptCount).toBe(1);
    expect(result.data.minute.processing.processedAtLabel).toBeNull();
    expect(result.warnings ?? []).toEqual([]);
  });

  it('still saves the minute when the run cannot be queued', async () => {
    setMeetingMinutesCreateFault('queue');
    const result = await create(true);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    // The save succeeded; only the dispatch did not (`REQ-MTG-007`).
    expect(result.data.processingStarted).toBe(false);
    expect(result.data.minute.processing.status).toBe('failed');
    expect(result.data.minute.aiRequestedLabel).toBe('Yes');
    expect(result.warnings?.map((warning) => warning.code)).toEqual(['PROCESSING_NOT_STARTED']);
    expect(result.warnings?.[0].message).toMatch(/was saved/i);

    // Its error is the safe, retryable one, and the minute is readable.
    expect(result.data.minute.processing.error).toEqual({
      code: 'queue_unavailable',
      message: SAFE_PROCESSING_ERROR_MESSAGE.queue_unavailable,
      occurredAtLabel: expect.any(String),
      retryable: true,
    });
    expect(ids(await listFor(TEAM_LEAD))).toContain(result.data.minute.id);
  });

  it('stores nothing when the save itself fails', async () => {
    const before = view(await listFor(TEAM_LEAD)).page.pageInfo.totalItems;
    setMeetingMinutesCreateFault('error');
    const result = await create(true);
    expect(result.status).toBe('error');
    expect(view(await listFor(TEAM_LEAD)).page.pageInfo.totalItems).toBe(before);
  });

  it('repeats the queue-failure answer for a repeated key, without a second minute', async () => {
    setMeetingMinutesCreateFault('queue');
    const first = await create(true, 'key-queue-repeat');
    const second = await create(true, 'key-queue-repeat');
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') return;

    expect(second.data.minute.id).toBe(first.data.minute.id);
    expect(second.data.processingStarted).toBe(false);
    expect(second.warnings?.map((warning) => warning.code)).toEqual(['PROCESSING_NOT_STARTED']);
    expect(ids(await listFor(TEAM_LEAD)).filter((id) => id === first.data.minute.id)).toHaveLength(1);
  });

  it('numbers the attempt after its own minute', async () => {
    const result = await create(true);
    if (result.status !== 'success') throw new Error('expected success');
    const listed = view(await listFor(TEAM_LEAD)).page.items.find(
      (item) => item.id === result.data.minute.id,
    );
    expect(listed?.processing.status).toBe('pending');
  });

  it('carries no protected field in the queue-failure outcome', async () => {
    setMeetingMinutesCreateFault('queue');
    const result = await create(true);
    if (result.status !== 'success') throw new Error('expected success');
    expect(findProtectedMeetingMinuteFields(result.data)).toEqual([]);
  });
});

/**
 * `FE-1116` — editing and archiving an existing minute.
 *
 * Seed reminder: `min-1001` is Imran's (pia, processed), `min-1002` is
 * Rezaul's (pit), `min-1006` is Imran's archived pia minute.
 */
describe('editing a minute (FE-1116)', () => {
  async function context(userId: string, minuteId: string) {
    return mockMeetingMinutesService.editContext(userId, minuteId);
  }

  async function update(userId: string, minuteId: string, overrides: Record<string, unknown> = {}) {
    const loaded = await context(userId, minuteId);
    if (loaded.status !== 'success') throw new Error(`context: ${loaded.status}`);
    return mockMeetingMinutesService.update(userId, {
      ...loaded.data.values,
      minuteId,
      expectedVersion: loaded.data.version,
      ...overrides,
    });
  }

  it('loads the stored values as editable plain text', async () => {
    const result = await context(TEAM_LEAD, 'min-1001');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.values.title).toBe('Vision Platform v2 sprint review');
    expect(result.data.values.clientId).toBe('cli-meghna');
    expect(result.data.values.projectId).toBe('prj-vp2');
    // Stored as sanitized HTML, edited as text.
    expect(result.data.values.content).not.toContain('<p>');
    expect(result.data.values.content).toContain('Reviewed sprint 14');
    expect(result.data.canArchive).toBe(true);
  });

  it('hides a minute the viewer cannot read behind the same answer as a missing one', async () => {
    const hidden = await context(HR, 'min-1003'); // government project
    const missing = await context(HR, 'min-nope');
    expect(hidden.status).toBe('not_found');
    expect(hidden).toEqual(missing);
  });

  it('refuses a readable minute belonging to someone else', async () => {
    const result = await context(TEAM_LEAD, 'min-1002'); // Rezaul's
    expect(result.status).toBe('permission_denied');
  });

  it('lets the Super Administrator edit any readable minute', async () => {
    const result = await context(ADMIN, 'min-1002');
    expect(result.status).toBe('success');
  });

  it('refuses an archived minute as a conflict, not a denial', async () => {
    const result = await context(TEAM_LEAD, 'min-1006');
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') return;
    expect(result.guidance).toMatch(/kept exactly as it was/i);
  });

  it('saves a change and raises the version', async () => {
    const result = await update(TEAM_LEAD, 'min-1001', { title: 'Sprint 14 review, corrected' });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.title).toBe('Sprint 14 review, corrected');
    expect(result.data.version).toBe(3); // seeded at 2
    expect(row(await listFor(TEAM_LEAD), 'min-1001').title).toBe('Sprint 14 review, corrected');
  });

  it('leaves processing untouched, because an edit is not a way to run AI', async () => {
    const before = await context(TEAM_LEAD, 'min-1001');
    if (before.status !== 'success') throw new Error('expected success');
    const result = await update(TEAM_LEAD, 'min-1001', { title: 'Edited title' });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.processing.status).toBe('processed');
    expect(result.data.aiRequestedLabel).toBe('Yes');
    expect(result.data.processing.attemptCount).toBe(1);
  });

  it('refuses a stale version without writing anything', async () => {
    const result = await mockMeetingMinutesService.update(TEAM_LEAD, {
      title: 'Written over someone else',
      clientId: 'cli-meghna',
      projectId: 'prj-vp2',
      content: 'Text',
      minuteId: 'min-1001',
      expectedVersion: 1, // stored version is 2
    });
    expect(result.status).toBe('conflict');
    if (result.status !== 'conflict') return;
    expect(result.guidance).toMatch(/reload/i);
    expect(row(await listFor(TEAM_LEAD), 'min-1001').title).toBe('Vision Platform v2 sprint review');
  });

  it('validates an edit with the same codes as a create', async () => {
    const result = await update(TEAM_LEAD, 'min-1001', { title: '  ' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0].code).toBe('REQUIRED');
    expect(result.fieldErrors[0].guidance.length).toBeGreaterThan(0);
  });

  it('accepts an unchanged project that would no longer be offered', async () => {
    // `min-1006` is on the inactive `prj-lsm`; unarchive it first by editing a
    // sibling is not possible, so use the Super Administrator on a fresh minute.
    const created = await mockMeetingMinutesService.create(ADMIN, {
      title: 'Minute on a project that is later deactivated',
      clientId: 'cli-meghna',
      projectId: 'prj-vp2',
      content: 'Text',
      processWithAi: false,
      idempotencyKey: 'key-unchanged-project',
    });
    if (created.status !== 'success') throw new Error('expected success');

    // Editing only the title leaves the pair alone, so it is accepted.
    const result = await update(ADMIN, created.data.minute.id, { title: 'Corrected title' });
    expect(result.status).toBe('success');
  });

  it('still refuses a changed project that is not the client’s', async () => {
    const result = await update(ADMIN, 'min-1002', { projectId: 'prj-vp2' });
    expect(result.status).toBe('validation_failure');
    if (result.status !== 'validation_failure') return;
    expect(result.fieldErrors[0].code).toBe('PROJECT_NOT_FOR_CLIENT');
  });

  it('offers the minute’s own client and project even when they are no longer creatable', async () => {
    // `min-1006` sits on the inactive `prj-lsm`. Its edit context is refused
    // because it is archived, so check the option builder through a minute
    // whose project is inactive but which is still active itself: the
    // Super Administrator sees `prj-lsm` under Meghna only for such a minute.
    const result = await context(ADMIN, 'min-1001');
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.projects.map((project) => project.id)).toContain('prj-vp2');
    expect(result.data.clients.map((client) => client.id)).toContain('cli-meghna');
  });
});

describe('archiving a minute (FE-1116)', () => {
  async function archive(userId: string, minuteId: string, version: number, key = `key-${Math.random()}`) {
    return mockMeetingMinutesService.archive(userId, {
      minuteId,
      expectedVersion: version,
      idempotencyKey: key,
    });
  }

  it('archives without deleting, keeping content and processing history', async () => {
    const result = await archive(TEAM_LEAD, 'min-1001', 2);
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.archived?.archivedByName).toBe('Imran Hossain');
    expect(result.data.content).toContain('Reviewed sprint 14');
    expect(result.data.processing.status).toBe('processed');
    expect(result.data.version).toBe(3);
  });

  it('takes the minute out of the default list but keeps it findable', async () => {
    await archive(TEAM_LEAD, 'min-1001', 2);
    expect(ids(await listFor(TEAM_LEAD))).not.toContain('min-1001');
    expect(
      ids(await listFor(TEAM_LEAD, { filters: { includeArchived: true } })),
    ).toContain('min-1001');
  });

  it('offers no further actions once archived', async () => {
    await archive(TEAM_LEAD, 'min-1001', 2);
    const archived = row(await listFor(TEAM_LEAD, { filters: { includeArchived: true } }), 'min-1001');
    expect(archived.actions).toEqual({
      canEdit: false,
      canArchive: false,
      canRequestProcessing: false,
      canRetry: false,
    });
  });

  it('returns the first outcome for a repeated request', async () => {
    const first = await archive(TEAM_LEAD, 'min-1001', 2, 'key-archive-once');
    const second = await archive(TEAM_LEAD, 'min-1001', 2, 'key-archive-once');
    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (second.status !== 'success') return;
    expect(second.data.id).toBe('min-1001');
  });

  it('refuses a second archive under a new key as a conflict', async () => {
    await archive(TEAM_LEAD, 'min-1001', 2, 'key-first');
    const again = await archive(TEAM_LEAD, 'min-1001', 3, 'key-second');
    expect(again.status).toBe('conflict');
  });

  it('refuses a stale version', async () => {
    const result = await archive(TEAM_LEAD, 'min-1001', 1);
    expect(result.status).toBe('conflict');
    expect(ids(await listFor(TEAM_LEAD))).toContain('min-1001');
  });

  it.each([
    ["someone else’s minute", TEAM_LEAD, 'min-1002', 1, 'permission_denied'],
    ['a minute outside the viewer scope', HR, 'min-1003', 1, 'not_found'],
    ['an Employee', EMPLOYEE, 'min-1001', 2, 'permission_denied'],
    ['Management', MANAGEMENT, 'min-1001', 2, 'permission_denied'],
  ])('refuses %s', async (_label, userId, minuteId, version, expected) => {
    const result = await archive(userId, minuteId, version);
    expect(result.status).toBe(expected);
    expect(ids(await listFor(ADMIN))).toContain(minuteId);
  });

  it('carries no protected field in an edit or archive result', async () => {
    const edited = await mockMeetingMinutesService.editContext(TEAM_LEAD, 'min-1001');
    const archived = await archive(TEAM_LEAD, 'min-1001', 2);
    if (edited.status !== 'success' || archived.status !== 'success') throw new Error('expected success');
    expect(findProtectedMeetingMinuteFields(edited.data)).toEqual([]);
    expect(findProtectedMeetingMinuteFields(archived.data)).toEqual([]);
  });
});

/**
 * `FE-1120` — reading one minute.
 */
describe('reading a minute (FE-1120)', () => {
  it('returns the stored minute with its context and processing facts', async () => {
    const result = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    expect(result.data.title).toBe('Vision Platform v2 sprint review');
    expect(result.data.client.name).toBe('Meghna Group');
    expect(result.data.project.name).toBe('Vision Platform v2');
    expect(result.data.creatorName).toBe('Imran Hossain');
    expect(result.data.aiRequestedLabel).toBe('Yes');
    expect(result.data.processing.status).toBe('processed');
    expect(result.data.content).toContain('<p>');
    expect(result.data.editHref).toBe('/meeting-minutes/min-1001/edit');
  });

  it('answers an out-of-scope minute exactly as a nonexistent one', async () => {
    const hidden = await mockMeetingMinutesService.get(HR, 'min-1003');
    const missing = await mockMeetingMinutesService.get(HR, 'min-nope');
    expect(hidden.status).toBe('not_found');
    expect(hidden).toEqual(missing);
  });

  it('never returns permission_denied, so an id cannot be probed', async () => {
    for (const userId of [EMPLOYEE, MANAGEMENT, TEAM_LEAD, HR, ADMIN]) {
      for (const id of ['min-1001', 'min-1003', 'min-nope']) {
        const result = await mockMeetingMinutesService.get(userId, id);
        expect(result.status === 'success' || result.status === 'not_found').toBe(true);
      }
    }
  });

  it('keeps an archived minute readable, so links to it keep working', async () => {
    const result = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1006');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.archived?.archivedByName).toBe('Imran Hossain');
    expect(result.data.actions.canEdit).toBe(false);
  });

  it('carries the safe processing error and no protected field', async () => {
    const result = await mockMeetingMinutesService.get(ADMIN, 'min-1004');
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.processing.error?.message).toBe(
      SAFE_PROCESSING_ERROR_MESSAGE.provider_timeout,
    );
    expect(findProtectedMeetingMinuteFields(result.data)).toEqual([]);
  });

  it('reports actions per viewer', async () => {
    const owner = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    const reader = await mockMeetingMinutesService.get(EMPLOYEE, 'min-1001');
    if (owner.status !== 'success' || reader.status !== 'success') throw new Error('expected success');
    expect(owner.data.actions.canEdit).toBe(true);
    expect(reader.data.actions.canEdit).toBe(false);
  });
});

/**
 * `FE-1122` — the AI interpretation attached to a minute.
 */
describe('AI interpretation (FE-1122)', () => {
  it('attaches the summary and ordered decisions from a successful run', async () => {
    const result = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    if (result.status !== 'success') throw new Error('expected success');

    const interpretation = result.data.interpretation;
    expect(interpretation?.summary).toMatch(/accepted the search redesign/);
    expect(interpretation?.decisions.map((decision) => decision.position)).toEqual([1, 2]);
    expect(interpretation?.basedOnEarlierContent).toBe(false);
  });

  it.each([
    ['not processed', 'min-1002', HR],
    ['pending', 'min-1003', ADMIN],
    ['processing', 'min-1005', ADMIN],
    ['failed', 'min-1004', HR],
  ])('has none while %s', async (_label, minuteId, userId) => {
    const result = await mockMeetingMinutesService.get(userId, minuteId);
    if (result.status !== 'success') throw new Error('expected success');
    expect(result.data.interpretation).toBeNull();
  });

  it('is the same for every viewer who can read the minute', async () => {
    const owner = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    const reader = await mockMeetingMinutesService.get(EMPLOYEE, 'min-1001');
    if (owner.status !== 'success' || reader.status !== 'success') throw new Error('expected success');
    expect(reader.data.interpretation).toEqual(owner.data.interpretation);
  });

  it('is never reachable by a viewer who cannot read the minute', async () => {
    // `min-1003` is a government minute; its outcome is not found, so nothing
    // of an interpretation could reach this viewer either.
    const hidden = await mockMeetingMinutesService.get(HR, 'min-1003');
    expect(hidden.status).toBe('not_found');
  });

  it('says so once the minute has been edited since the run', async () => {
    const loaded = await mockMeetingMinutesService.editContext(TEAM_LEAD, 'min-1001');
    if (loaded.status !== 'success') throw new Error('expected success');

    await mockMeetingMinutesService.update(TEAM_LEAD, {
      ...loaded.data.values,
      content: `${loaded.data.values.content}\n\nAdded after the meeting: the October date is provisional.`,
      minuteId: 'min-1001',
      expectedVersion: loaded.data.version,
    });

    const after = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    if (after.status !== 'success') throw new Error('expected success');
    expect(after.data.interpretation?.basedOnEarlierContent).toBe(true);
    // The interpretation itself is kept; it is labelled, not discarded.
    expect(after.data.interpretation?.summary).toMatch(/accepted the search redesign/);
  });

  it('does not treat a title-only edit, or an unchanged round trip, as drift', async () => {
    const loaded = await mockMeetingMinutesService.editContext(TEAM_LEAD, 'min-1001');
    if (loaded.status !== 'success') throw new Error('expected success');

    await mockMeetingMinutesService.update(TEAM_LEAD, {
      ...loaded.data.values,
      title: 'Sprint 14 review (renamed)',
      minuteId: 'min-1001',
      expectedVersion: loaded.data.version,
    });

    const after = await mockMeetingMinutesService.get(TEAM_LEAD, 'min-1001');
    if (after.status !== 'success') throw new Error('expected success');
    expect(after.data.interpretation?.basedOnEarlierContent).toBe(false);
  });

  it('carries no protected field', async () => {
    const result = await mockMeetingMinutesService.get(ADMIN, 'min-1001');
    if (result.status !== 'success') throw new Error('expected success');
    expect(findProtectedMeetingMinuteFields(result.data.interpretation)).toEqual([]);
  });
});

/* ------------------------------------------------------------------------- */
/* FE-1123 – FE-1126                                                         */
/* ------------------------------------------------------------------------- */

const TANVIR = 'usr-1002'; // assignee of tsk-16; `cjg` only, so cannot read pia minutes

async function detail(userId: string, minuteId: string) {
  const result = await mockMeetingMinutesService.get(userId, minuteId);
  if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
  return result.data;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('generated tasks on a minute (FE-1123)', () => {
  it('lists both tasks, in order, for a Team Lead whose division they are in', async () => {
    const tasks = (await detail(TEAM_LEAD, 'min-1001')).generatedTasks;
    expect(tasks.map((task) => task.position)).toEqual([1, 2]);

    const [first, second] = tasks;
    if (first.access !== 'visible' || second.access !== 'visible') throw new Error('expected visible');
    expect(first).toMatchObject({
      taskId: 'tsk-15',
      title: 'Add export to PDF to the search results',
      assigneeName: 'Nadia Rahman',
      priorityLabel: 'High',
      statusLabel: 'Pending',
      href: '/tasks/tsk-15',
      matchOutcome: { kind: 'mentioned_assignee', label: 'Named in the minute' },
      reassignedSinceGeneration: false,
    });
    expect(first.dueDateLabel).not.toBe('—');
    expect(second).toMatchObject({
      taskId: 'tsk-16',
      assigneeName: 'Tanvir Ahmed',
      matchOutcome: { kind: 'matched', label: 'Matched on project membership and workload' },
    });
  });

  it('shows an employee only the task they can open, and keeps the other in place', async () => {
    const tasks = (await detail(EMPLOYEE, 'min-1001')).generatedTasks;
    expect(tasks.map((task) => task.access)).toEqual(['visible', 'restricted']);
    // The restricted row names nothing: no title, assignee, date or link.
    expect(tasks[1]).toEqual({ access: 'restricted', linkId: 'lnk-1001-2', position: 2 });
  });

  it('follows the task pages, not the minute, for who may open a task', async () => {
    // The Super Administrator can read the minute, but the task page does not
    // open other people's tasks for them, so neither does this list.
    const tasks = (await detail(ADMIN, 'min-1001')).generatedTasks;
    expect(tasks.every((task) => task.access === 'restricted')).toBe(true);
  });

  it('has none for a minute whose run produced none', async () => {
    expect((await detail(HR, 'min-1004')).generatedTasks).toEqual([]);
    expect((await detail(HR, 'min-1002')).generatedTasks).toEqual([]);
  });

  it('opens a task only when the task page would', async () => {
    const opened = await mockMeetingMinutesService.openGeneratedTask(TEAM_LEAD, 'min-1001', 'lnk-1001-1');
    expect(opened).toEqual({ status: 'success', data: { taskId: 'tsk-15', href: '/tasks/tsk-15' } });

    const restricted = await mockMeetingMinutesService.openGeneratedTask(EMPLOYEE, 'min-1001', 'lnk-1001-2');
    const wrongMinute = await mockMeetingMinutesService.openGeneratedTask(TEAM_LEAD, 'min-1002', 'lnk-1001-1');
    const hiddenMinute = await mockMeetingMinutesService.openGeneratedTask(HR, 'min-1003', 'lnk-1001-1');
    for (const result of [restricted, wrongMinute, hiddenMinute]) expect(result.status).toBe('not_found');
    // All three refusals are the same answer.
    expect(restricted).toEqual(wrongMinute);
    expect(wrongMinute).toEqual(hiddenMinute);
  });

  it('carries no protected field in any viewer’s task list', async () => {
    for (const userId of [TEAM_LEAD, EMPLOYEE, ADMIN]) {
      expect(findProtectedMeetingMinuteFields((await detail(userId, 'min-1001')).generatedTasks)).toEqual([]);
    }
  });
});

describe('source-minute traceability (FE-1124)', () => {
  it('links a generated task back to a minute the viewer can read', async () => {
    const result = await mockMeetingMinutesService.getTaskSourceMinute(TEAM_LEAD, 'tsk-15');
    expect(result).toEqual({
      status: 'success',
      data: {
        access: 'visible',
        minuteId: 'min-1001',
        title: 'Vision Platform v2 sprint review',
        isArchived: false,
        href: '/meeting-minutes/min-1001',
      },
    });
  });

  it('says only that a minute exists when the viewer cannot read it', async () => {
    // Tanvir can open his own task, but not a pia minute.
    const result = await mockMeetingMinutesService.getTaskSourceMinute(TANVIR, 'tsk-16');
    expect(result).toEqual({ status: 'success', data: { access: 'restricted' } });
  });

  it('answers not found for a task the viewer cannot open, and for an ordinary task', async () => {
    const otherPersons = await mockMeetingMinutesService.getTaskSourceMinute(EMPLOYEE, 'tsk-16');
    const ordinary = await mockMeetingMinutesService.getTaskSourceMinute(EMPLOYEE, 'tsk-1');
    const missing = await mockMeetingMinutesService.getTaskSourceMinute(EMPLOYEE, 'tsk-nope');
    expect(otherPersons.status).toBe('not_found');
    // Indistinguishable, so a task's origin is not news about a task one cannot see.
    expect(otherPersons).toEqual(ordinary);
    expect(ordinary).toEqual(missing);
  });

  it('keeps working after the minute is archived', async () => {
    await mockMeetingMinutesService.archive(TEAM_LEAD, {
      minuteId: 'min-1001',
      expectedVersion: 2,
      idempotencyKey: 'key-archive-source',
    });
    const result = await mockMeetingMinutesService.getTaskSourceMinute(TEAM_LEAD, 'tsk-15');
    if (result.status !== 'success' || result.data.access !== 'visible') throw new Error('expected visible');
    expect(result.data.isArchived).toBe(true);
  });
});

describe('retrying a failed run (FE-1125)', () => {
  async function retry(userId: string, failedAttemptId = 'att-1004-1', key = `key-${Math.random()}`) {
    return mockMeetingMinutesService.retryProcessing(userId, {
      minuteId: 'min-1004',
      failedAttemptId,
      idempotencyKey: key,
    });
  }

  it('starts a new run, Pending, with the failure cleared and the run counted', async () => {
    const before = await detail(HR, 'min-1004');
    expect(before.processing).toMatchObject({ status: 'failed', attemptCount: 1, latestAttemptId: 'att-1004-1' });

    const result = await retry(HR);
    if (result.status !== 'success') throw new Error(`expected success, got ${result.status}`);
    expect(result.data.processing).toMatchObject({
      status: 'pending',
      error: null,
      attemptCount: 2,
      latestAttemptId: 'att-1004-2',
    });
    // The minute itself is untouched by a retry.
    expect(result.data.content).toBe(before.content);
    expect(result.data.title).toBe(before.title);
  });

  it('returns the first outcome for a repeated request, starting one run', async () => {
    const first = await retry(HR, 'att-1004-1', 'key-retry-once');
    const second = await retry(HR, 'att-1004-1', 'key-retry-once');
    if (first.status !== 'success' || second.status !== 'success') throw new Error('expected success');
    expect(second.data.processing.latestAttemptId).toBe('att-1004-2');
  });

  it('refuses a stale page retrying an attempt that was already retried', async () => {
    await retry(HR, 'att-1004-1', 'key-a');
    const stale = await retry(HR, 'att-1004-1', 'key-b');
    // Not failed any more, so the state check refuses it first.
    expect(stale.status).toBe('conflict');
  });

  it('refuses a minute that is not failed', async () => {
    const result = await mockMeetingMinutesService.retryProcessing(TEAM_LEAD, {
      minuteId: 'min-1001',
      failedAttemptId: 'att-1001-1',
      idempotencyKey: 'key-not-failed',
    });
    expect(result.status).toBe('conflict');
  });

  it.each([
    ['an Employee', EMPLOYEE, 'permission_denied'],
    ['Management', MANAGEMENT, 'permission_denied'],
    ['another creator', TEAM_LEAD, 'not_found'], // min-1004 is wcf, outside Imran's scope
  ])('refuses %s', async (_label, userId, expected) => {
    const result = await retry(userId);
    expect(result.status).toBe(expected);
    expect((await detail(HR, 'min-1004')).processing.status).toBe('failed');
  });

  it('lets the Super Administrator retry any readable minute', async () => {
    expect((await retry(ADMIN)).status).toBe('success');
  });
});

describe('background runs (FE-1126)', () => {
  const VALID = {
    title: 'Retro with Meghna Group',
    clientId: 'cli-meghna',
    projectId: 'prj-vp2',
    content: 'The team agreed to ship the redesign. Everyone else will review the backlog.',
  };

  beforeEach(() => {
    resetMockNotifications();
    setMeetingMinutesWorkerTiming({ startAfterMs: 10, finishAfterMs: 30 });
  });

  afterEach(() => {
    setMeetingMinutesWorkerOutcome(null);
    setMeetingMinutesWorkerTiming(null);
  });

  async function saveWithAi() {
    const result = await mockMeetingMinutesService.create(TEAM_LEAD, {
      ...VALID,
      processWithAi: true,
      idempotencyKey: `key-${Math.random()}`,
    });
    if (result.status !== 'success') throw new Error('expected success');
    return result.data.minute.id;
  }

  it('moves a queued run through Processing to Processed, and tells the creator', async () => {
    // The save answers Pending; the read after it is slower than this test's
    // worker, so the starting state is taken from the save itself.
    const saved = await mockMeetingMinutesService.create(TEAM_LEAD, {
      ...VALID,
      processWithAi: true,
      idempotencyKey: 'key-live-run',
    });
    if (saved.status !== 'success') throw new Error('expected success');
    expect(saved.data.minute.processing.status).toBe('pending');
    const id = saved.data.minute.id;

    await sleep(80);
    const after = await detail(TEAM_LEAD, id);
    expect(after.processing.status).toBe('processed');
    expect(after.processing.processedAtLabel).not.toBeNull();
    // A live run's summary is the minute's opening sentence; no decisions or tasks.
    expect(after.interpretation?.summary).toBe('The team agreed to ship the redesign.');
    expect(after.interpretation?.decisions).toEqual([]);
    expect(after.generatedTasks).toEqual([]);

    const notice = allMockNotifications().find((item) => item.href === `/meeting-minutes/${id}`);
    expect(notice).toMatchObject({
      recipientUserId: TEAM_LEAD,
      type: 'meeting_minute_processed',
      relatedLabel: 'Retro with Meghna Group',
    });
    // The notice names the minute and carries none of its content (`REQ-MTG-022`).
    expect(notice?.body).not.toContain('redesign');
  });

  it('can fail instead, keeping the minute and offering a retry', async () => {
    setMeetingMinutesWorkerOutcome('fail');
    const id = await saveWithAi();
    await sleep(80);

    const after = await detail(TEAM_LEAD, id);
    expect(after.processing.status).toBe('failed');
    expect(after.processing.error?.retryable).toBe(true);
    expect(after.actions.canRetry).toBe(true);
    expect(after.content).toContain('ship the redesign');
    expect(
      allMockNotifications().some((item) => item.href === `/meeting-minutes/${id}` && item.type === 'meeting_minute_failed'),
    ).toBe(true);

    // And the retry runs to completion.
    setMeetingMinutesWorkerOutcome('succeed');
    const retried = await mockMeetingMinutesService.retryProcessing(TEAM_LEAD, {
      minuteId: id,
      failedAttemptId: after.processing.latestAttemptId ?? '',
      idempotencyKey: 'key-retry-live',
    });
    expect(retried.status).toBe('success');
    await sleep(80);
    expect((await detail(TEAM_LEAD, id)).processing.status).toBe('processed');
  });

  it('never moves the seeded Pending and Processing minutes', async () => {
    await saveWithAi();
    await sleep(80);
    expect((await detail(ADMIN, 'min-1003')).processing.status).toBe('pending');
    expect((await detail(ADMIN, 'min-1005')).processing.status).toBe('processing');
  });

  it('does not advance a run once the minute is archived', async () => {
    // Slower than the archive request, so the minute is archived first.
    setMeetingMinutesWorkerTiming({ startAfterMs: 600, finishAfterMs: 900 });
    const id = await saveWithAi();
    await mockMeetingMinutesService.archive(TEAM_LEAD, {
      minuteId: id,
      expectedVersion: 1,
      idempotencyKey: 'key-archive-live',
    });
    await sleep(1000);
    expect((await detail(TEAM_LEAD, id)).processing.status).toBe('pending');
  });

  it('stops every scheduled run on reset', async () => {
    const id = await saveWithAi();
    resetMeetingMinutesState();
    await sleep(80);
    // The minute is gone with the reset, and nothing fired against the new state.
    expect((await mockMeetingMinutesService.get(TEAM_LEAD, id)).status).toBe('not_found');
    expect(allMockNotifications().some((item) => item.href === `/meeting-minutes/${id}`)).toBe(false);
  });

  it('reports where processing stands in a light snapshot, for viewers who can read it', async () => {
    const snapshot = await mockMeetingMinutesService.getProcessingSnapshot(TEAM_LEAD, 'min-1001');
    if (snapshot.status !== 'success') throw new Error('expected success');
    expect(snapshot.data.processing.status).toBe('processed');
    expect(snapshot.data.generatedTaskCount).toBe(2);
    expect(findProtectedMeetingMinuteFields(snapshot.data)).toEqual([]);

    const hidden = await mockMeetingMinutesService.getProcessingSnapshot(HR, 'min-1003');
    const missing = await mockMeetingMinutesService.getProcessingSnapshot(HR, 'min-nope');
    expect(hidden.status).toBe('not_found');
    expect(hidden).toEqual(missing);
  });
});
