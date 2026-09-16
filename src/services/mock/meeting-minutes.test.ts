import { beforeEach, describe, expect, it } from 'vitest';
import {
  findProtectedMeetingMinuteFields,
  type MeetingMinuteListQuery,
  type MeetingMinuteListView,
} from '@/contracts/meeting-minutes';
import { DEFAULT_PAGINATION } from '@/contracts/query';
import type { Result } from '@/contracts/results';
import { mockMeetingMinutesService, resetMeetingMinutesState } from './meeting-minutes';

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
    ['an Employee', EMPLOYEE, ['min-1005', 'min-1001', 'min-1004']],
    ['a Team Lead', TEAM_LEAD, ['min-1005', 'min-1001', 'min-1002']],
    ['HR without the government permission', HR, ['min-1005', 'min-1001', 'min-1002', 'min-1004']],
    ['Management', MANAGEMENT, ['min-1005', 'min-1001', 'min-1002', 'min-1004']],
    ['the Super Administrator', ADMIN, ['min-1003', 'min-1005', 'min-1001', 'min-1002', 'min-1004']],
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
    expect(result.page.items.map((item) => item.id)).toEqual(['min-1002']);
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
    expect(ids(await listFor(HR, { search: { term: 'bootcamp' } }))).toEqual(['min-1002']);
  });

  it('never searches minute content', async () => {
    expect(view(await listFor(ADMIN, { search: { term: 'single sign-on' } })).page.pageInfo.totalItems).toBe(0);
  });

  it('sorts by the requested field and reports page information', async () => {
    const result = await listFor(ADMIN, {
      sort: { field: 'title', direction: 'asc' },
      pagination: { page: 1, pageSize: 10 },
    });
    expect(ids(result)).toEqual(['min-1002', 'min-1003', 'min-1005', 'min-1001', 'min-1004']);
    expect(view(result).page.pageInfo).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 5,
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
