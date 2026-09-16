import { describe, expect, it } from 'vitest';
import type { MeetingMinuteProjectFilterOption } from '@/contracts/meeting-minutes';
import {
  EMPTY_MINUTE_LIST_STATE,
  hasActiveFilters,
  parseMinuteListParams,
  projectOptionsForClients,
  reconcileWithAppliedFilters,
  serializeMinuteListParams,
  toMinuteListQuery,
  withoutIncompatibleProjects,
  type MinuteListUrlState,
} from './list-url-state';

const parse = (query: string) => parseMinuteListParams(new URLSearchParams(query));

const FULL: MinuteListUrlState = {
  search: 'sprint review',
  clientIds: ['cli-meghna', 'cli-bit'],
  projectIds: ['prj-vp2'],
  statuses: ['failed', 'pending'],
  createdFrom: '2026-08-01',
  createdTo: '2026-09-02',
  includeArchived: true,
  page: 3,
  pageSize: 50,
};

const OPTIONS: readonly MeetingMinuteProjectFilterOption[] = [
  { id: 'prj-vp2', name: 'Vision Platform v2', code: 'PIA-VP2', clientId: 'cli-meghna', isActive: true },
  { id: 'prj-lsm', name: 'Legacy Site Maintenance', code: 'PIA-LSM', clientId: 'cli-meghna', isActive: false },
  { id: 'prj-alb', name: 'AI Literacy Bootcamp', code: 'PIT-ALB', clientId: 'cli-bit', isActive: true },
];

describe('Meeting Minutes URL state (FE-1111)', () => {
  it('round-trips every filter through the URL', () => {
    const query = serializeMinuteListParams(FULL);
    expect(query).toBe(
      'q=sprint+review&client=cli-meghna%2Ccli-bit&project=prj-vp2&processing=failed%2Cpending' +
        '&from=2026-08-01&to=2026-09-02&archived=1&page=3&size=50',
    );
    expect(parse(query)).toEqual(FULL);
  });

  it('writes nothing for the default list', () => {
    expect(serializeMinuteListParams(EMPTY_MINUTE_LIST_STATE)).toBe('');
    expect(parse('')).toEqual(EMPTY_MINUTE_LIST_STATE);
  });

  it('drops malformed values instead of failing', () => {
    expect(
      parse('processing=failed,bogus&from=2026-02-30&to=yesterday&page=-2&size=7&archived=yes&client=,,a,a'),
    ).toEqual({ ...EMPTY_MINUTE_LIST_STATE, statuses: ['failed'], clientIds: ['a'] });
  });

  it('drops a reversed date range', () => {
    const state = parse('from=2026-09-10&to=2026-09-01');
    expect(state.createdFrom).toBe('');
    expect(state.createdTo).toBe('');
  });

  it('builds the service query, leaving out what is unset', () => {
    expect(toMinuteListQuery(EMPTY_MINUTE_LIST_STATE)).toEqual({
      pagination: { page: 1, pageSize: 25 },
      sort: { field: 'createdAt', direction: 'desc' },
    });
    expect(toMinuteListQuery(FULL)).toEqual({
      pagination: { page: 3, pageSize: 50 },
      sort: { field: 'createdAt', direction: 'desc' },
      search: { term: 'sprint review' },
      filters: {
        clientIds: ['cli-meghna', 'cli-bit'],
        projectIds: ['prj-vp2'],
        processingStatuses: ['failed', 'pending'],
        createdDateRange: { from: '2026-08-01', to: '2026-09-02' },
        includeArchived: true,
      },
    });
  });

  it('keeps a one-sided date range open at the other end', () => {
    expect(toMinuteListQuery({ ...EMPTY_MINUTE_LIST_STATE, createdFrom: '2026-09-01' }).filters).toEqual({
      createdDateRange: { from: '2026-09-01', to: '9999-12-31' },
    });
  });

  it('removes from the URL whatever the service did not apply', () => {
    const reconciled = reconcileWithAppliedFilters(FULL, {
      clientIds: ['cli-meghna'],
      projectIds: [],
      processingStatuses: ['failed', 'pending'],
    });
    expect(reconciled).toEqual({
      ...FULL,
      clientIds: ['cli-meghna'],
      projectIds: [],
      createdFrom: '',
      createdTo: '',
      includeArchived: false,
    });
  });

  it('clears a project that does not belong to the chosen clients', () => {
    expect(withoutIncompatibleProjects(['prj-vp2', 'prj-alb'], ['cli-bit'], OPTIONS)).toEqual(['prj-alb']);
    expect(withoutIncompatibleProjects(['prj-vp2', 'prj-alb'], [], OPTIONS)).toEqual(['prj-vp2', 'prj-alb']);
    // Unknown to the options: left for the service to drop, so nothing is inferred here.
    expect(withoutIncompatibleProjects(['prj-hidden'], ['cli-bit'], OPTIONS)).toEqual(['prj-hidden']);
  });

  it('offers only the chosen clients’ projects', () => {
    expect(projectOptionsForClients(['cli-meghna'], OPTIONS).map((item) => item.id)).toEqual(['prj-vp2', 'prj-lsm']);
    expect(projectOptionsForClients([], OPTIONS)).toHaveLength(3);
  });

  it('knows when anything is filtered, ignoring paging', () => {
    expect(hasActiveFilters({ ...EMPTY_MINUTE_LIST_STATE, page: 4, pageSize: 100 })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_MINUTE_LIST_STATE, includeArchived: true })).toBe(true);
    expect(hasActiveFilters({ ...EMPTY_MINUTE_LIST_STATE, search: 'x' })).toBe(true);
  });
});
