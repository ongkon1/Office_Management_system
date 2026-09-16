/**
 * `FE-1111` — Meeting Minutes list state in the URL.
 *
 * The URL is the list's single source of truth, so a filtered list can be
 * bookmarked, shared, reloaded or restored after sign-in without losing its
 * place (`docs/frontend/phase-0/information-architecture.md` §3.4, §3.6).
 *
 * Parameter names come only from `QUERY_PARAM_KEYS`. Multi-valued filters are
 * comma-separated (`client=cli-a,cli-b`). Anything malformed is dropped rather
 * than reported: a hand-edited URL should fall back to a sensible list, and an
 * error that echoes an id back would confirm the id means something.
 *
 * These are pure functions so the rules are unit-tested apart from the screen.
 */

import type {
  MeetingMinuteFilters,
  MeetingMinuteListQuery,
  MeetingMinuteProjectFilterOption,
  MinuteProcessingStatus,
} from '@/contracts/meeting-minutes';
import { DEFAULT_MEETING_MINUTE_SORT, MINUTE_PROCESSING_STATUSES } from '@/contracts/meeting-minutes';
import { DEFAULT_PAGINATION, PAGE_SIZE_OPTIONS, QUERY_PARAM_KEYS } from '@/contracts/query';

export interface MinuteListUrlState {
  readonly search: string;
  readonly clientIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly statuses: readonly MinuteProcessingStatus[];
  /** `YYYY-MM-DD`, or empty when unset. */
  readonly createdFrom: string;
  readonly createdTo: string;
  readonly includeArchived: boolean;
  readonly page: number;
  readonly pageSize: number;
}

export const EMPTY_MINUTE_LIST_STATE: MinuteListUrlState = {
  search: '',
  clientIds: [],
  projectIds: [],
  statuses: [],
  createdFrom: '',
  createdTo: '',
  includeArchived: false,
  page: DEFAULT_PAGINATION.page,
  pageSize: DEFAULT_PAGINATION.pageSize,
};

const MAX_SEARCH_LENGTH = 200;
const MAX_VALUES_PER_FILTER = 50;
/** Open ends of a one-sided date range, which `DateRange` cannot omit. */
const EARLIEST_DATE = '0001-01-01';
const LATEST_DATE = '9999-12-31';

type ParamSource = Pick<URLSearchParams, 'get'>;

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function listParam(params: ParamSource, key: string): readonly string[] {
  const raw = params.get(key);
  if (!raw) return [];
  const values = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(values)].slice(0, MAX_VALUES_PER_FILTER);
}

export function parseMinuteListParams(params: ParamSource): MinuteListUrlState {
  const search = (params.get(QUERY_PARAM_KEYS.search) ?? '').trim().slice(0, MAX_SEARCH_LENGTH);

  let createdFrom = params.get(QUERY_PARAM_KEYS.dateFrom) ?? '';
  let createdTo = params.get(QUERY_PARAM_KEYS.dateTo) ?? '';
  if (!isIsoDate(createdFrom)) createdFrom = '';
  if (!isIsoDate(createdTo)) createdTo = '';
  if (createdFrom && createdTo && createdFrom > createdTo) {
    createdFrom = '';
    createdTo = '';
  }

  const page = Number(params.get(QUERY_PARAM_KEYS.page));
  const pageSize = Number(params.get(QUERY_PARAM_KEYS.pageSize));
  const archived = params.get(QUERY_PARAM_KEYS.includeArchived);

  return {
    search,
    clientIds: listParam(params, QUERY_PARAM_KEYS.client),
    projectIds: listParam(params, QUERY_PARAM_KEYS.project),
    statuses: listParam(params, QUERY_PARAM_KEYS.processingStatus).filter(
      (value): value is MinuteProcessingStatus =>
        (MINUTE_PROCESSING_STATUSES as readonly string[]).includes(value),
    ),
    createdFrom,
    createdTo,
    includeArchived: archived === '1' || archived === 'true',
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_PAGINATION.page,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)
      ? pageSize
      : DEFAULT_PAGINATION.pageSize,
  };
}

/** A query string without `?`, omitting defaults, in a stable key order. */
export function serializeMinuteListParams(state: MinuteListUrlState): string {
  const params = new URLSearchParams();
  if (state.search) params.set(QUERY_PARAM_KEYS.search, state.search);
  if (state.clientIds.length > 0) params.set(QUERY_PARAM_KEYS.client, state.clientIds.join(','));
  if (state.projectIds.length > 0) params.set(QUERY_PARAM_KEYS.project, state.projectIds.join(','));
  if (state.statuses.length > 0) {
    params.set(QUERY_PARAM_KEYS.processingStatus, state.statuses.join(','));
  }
  if (state.createdFrom) params.set(QUERY_PARAM_KEYS.dateFrom, state.createdFrom);
  if (state.createdTo) params.set(QUERY_PARAM_KEYS.dateTo, state.createdTo);
  if (state.includeArchived) params.set(QUERY_PARAM_KEYS.includeArchived, '1');
  if (state.page !== DEFAULT_PAGINATION.page) params.set(QUERY_PARAM_KEYS.page, String(state.page));
  if (state.pageSize !== DEFAULT_PAGINATION.pageSize) {
    params.set(QUERY_PARAM_KEYS.pageSize, String(state.pageSize));
  }
  return params.toString();
}

export function toMinuteListQuery(state: MinuteListUrlState): MeetingMinuteListQuery {
  const filters: MeetingMinuteFilters = {
    ...(state.clientIds.length > 0 && { clientIds: state.clientIds }),
    ...(state.projectIds.length > 0 && { projectIds: state.projectIds }),
    ...(state.statuses.length > 0 && { processingStatuses: state.statuses }),
    ...((state.createdFrom || state.createdTo) && {
      createdDateRange: {
        from: state.createdFrom || EARLIEST_DATE,
        to: state.createdTo || LATEST_DATE,
      },
    }),
    ...(state.includeArchived && { includeArchived: true }),
  };
  return {
    pagination: { page: state.page, pageSize: state.pageSize },
    sort: DEFAULT_MEETING_MINUTE_SORT,
    ...(state.search && { search: { term: state.search } }),
    ...(Object.keys(filters).length > 0 && { filters }),
  };
}

/**
 * The URL state after the service has said which filters it applied.
 *
 * A value the viewer may not use disappears from the URL without comment, so
 * the address bar never keeps advertising a filter that is not in effect.
 */
export function reconcileWithAppliedFilters(
  state: MinuteListUrlState,
  applied: MeetingMinuteFilters,
): MinuteListUrlState {
  const keep = <T extends string>(requested: readonly T[], used: readonly T[] | undefined) =>
    requested.filter((value) => (used ?? []).includes(value));
  const dateApplied = applied.createdDateRange !== undefined;
  return {
    ...state,
    clientIds: keep(state.clientIds, applied.clientIds),
    projectIds: keep(state.projectIds, applied.projectIds),
    statuses: keep(state.statuses, applied.processingStatuses),
    createdFrom: dateApplied ? state.createdFrom : '',
    createdTo: dateApplied ? state.createdTo : '',
    includeArchived: state.includeArchived && applied.includeArchived === true,
  };
}

/**
 * The project filter depends on the client filter: with clients chosen, a
 * project belonging to another client is removed. An id the options do not
 * know is left for the service to drop, so this never reveals anything either.
 */
export function withoutIncompatibleProjects(
  projectIds: readonly string[],
  clientIds: readonly string[],
  options: readonly MeetingMinuteProjectFilterOption[],
): readonly string[] {
  if (clientIds.length === 0) return projectIds;
  return projectIds.filter((id) => {
    const option = options.find((item) => item.id === id);
    return option === undefined || clientIds.includes(option.clientId);
  });
}

export function projectOptionsForClients(
  clientIds: readonly string[],
  options: readonly MeetingMinuteProjectFilterOption[],
): readonly MeetingMinuteProjectFilterOption[] {
  return clientIds.length === 0 ? options : options.filter((item) => clientIds.includes(item.clientId));
}

export function hasActiveFilters(state: MinuteListUrlState): boolean {
  return (
    state.search.length > 0 ||
    state.clientIds.length > 0 ||
    state.projectIds.length > 0 ||
    state.statuses.length > 0 ||
    state.createdFrom.length > 0 ||
    state.createdTo.length > 0 ||
    state.includeArchived
  );
}
