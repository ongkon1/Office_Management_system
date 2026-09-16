/**
 * Mock Meeting Minutes service.
 *
 * `FE-1110` implements `list`; the other `MeetingMinutesService` operations
 * arrive with the screens that call them (`FE-1113` onward), so the export is
 * typed as exactly what exists rather than pretending to the full interface.
 *
 * What this adapter enforces, and every later operation must keep:
 *
 * - **Authorization before aggregation** (`REQ-MTG-003`, `AC-MTG-009`). A
 *   minute is readable when its project's division is in the viewer's scope,
 *   and a government-project minute additionally needs the government-project
 *   permission. Rows, `totalItems`, client options and the applied filters are
 *   all computed from readable minutes only.
 * - **Filter values reveal nothing.** A project or client the viewer cannot
 *   see is dropped from the applied filters, so filtering by it returns exactly
 *   what filtering by a nonexistent id returns.
 * - **Actions come from here** (`REQ-MTG-002`). Employee and Management/View-Only
 *   get none. A creator role may edit and archive its own minutes; the Super
 *   Administrator may act on any readable one. Nothing is actionable once
 *   archived.
 */

import type { RoleKey } from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';
import type {
  ClientRef,
  MeetingMinute,
  MeetingMinuteFilters,
  MeetingMinuteListQuery,
  MeetingMinuteListView,
  MeetingMinuteProjectFilterOption,
  MeetingMinuteSortField,
  MeetingMinuteSummaryView,
  MeetingMinutesService,
  MinuteActionsView,
} from '@/contracts/meeting-minutes';
import {
  DEFAULT_MEETING_MINUTE_SORT,
  MINUTE_PROCESSING_STATUSES,
} from '@/contracts/meeting-minutes';
import { PAGE_SIZE_OPTIONS } from '@/contracts/query';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { PROJECTS } from '@/fixtures';
import { CLIENTS, MEETING_MINUTES, PROJECT_CLIENT_LINKS } from '@/fixtures/meeting-minutes';
import { formatTimestamp } from '@/lib/format';
import { describeMinuteProcessingStatus } from '@/lib/status';
import { DEMO_TIMEZONE, findAccountByUserId } from './accounts';

const LATENCY_MS = 140;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

/** The roles that may create minutes (amended 2026-09-15: not Employee). */
const CREATOR_ROLES: readonly RoleKey[] = ['team_lead', 'hr_manager', 'super_admin'];

type Account = NonNullable<ReturnType<typeof findAccountByUserId>>;

let minutes: MeetingMinute[] = [...MEETING_MINUTES];

/* ------------------------------------------------------------------------- */
/* Failure simulation (demo and tests only)                                  */
/* ------------------------------------------------------------------------- */

/**
 * `FE-1112` — a way to make `list` fail on purpose.
 *
 * Nothing in the seed data fails, so without this the denied, signed-out and
 * error states could be designed but never shown or tested. Tests set it with
 * `setMeetingMinutesListFault`; a browser session sets the
 * `MEETING_MINUTES_FAULT_STORAGE_KEY` localStorage key. `error-once` fails a
 * single request, which is how a recoverable error is shown recovering.
 *
 * This lives only in the mock adapter. The MySQL adapter has no equivalent.
 */
export type MeetingMinutesListFault = 'error' | 'error-once' | 'fatal' | 'denied' | 'signed-out' | 'invalid';

const LIST_FAULTS: readonly MeetingMinutesListFault[] = ['error', 'error-once', 'fatal', 'denied', 'signed-out', 'invalid'];

export const MEETING_MINUTES_FAULT_STORAGE_KEY = 'oms.mock-fault.meeting-minutes-list';

let listFault: MeetingMinutesListFault | null = null;

/*
 * `error-once` keeps failing for a moment after it fires. In development React
 * runs an effect twice, a few milliseconds apart; without this grace period the
 * first, discarded request would use up the failure and the second would
 * succeed, so the error state could never be seen. A real retry comes later
 * than this — it cannot happen before the first failure has even rendered.
 */
const ERROR_ONCE_GRACE_MS = 100;
let errorOnceUntil = 0;

export function setMeetingMinutesListFault(fault: MeetingMinutesListFault | null): void {
  listFault = fault;
}

function takeListFault(): MeetingMinutesListFault | null {
  if (Date.now() < errorOnceUntil) return 'error-once';
  if (listFault) {
    const fault = listFault;
    if (fault === 'error-once') {
      listFault = null;
      errorOnceUntil = Date.now() + ERROR_ONCE_GRACE_MS;
    }
    return fault;
  }
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(MEETING_MINUTES_FAULT_STORAGE_KEY);
    if (!stored || !(LIST_FAULTS as readonly string[]).includes(stored)) return null;
    if (stored === 'error-once') {
      window.localStorage.removeItem(MEETING_MINUTES_FAULT_STORAGE_KEY);
      errorOnceUntil = Date.now() + ERROR_ONCE_GRACE_MS;
    }
    return stored as MeetingMinutesListFault;
  } catch {
    return null;
  }
}

function simulatedFailure(fault: MeetingMinutesListFault): Result<MeetingMinuteListView> {
  switch (fault) {
    case 'error':
    case 'error-once':
      return {
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        message: 'Meeting minutes are temporarily unavailable.',
        reference: 'MM-DEMO-503',
        retryable: true,
      };
    case 'fatal':
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Meeting minutes could not be loaded.',
        reference: 'MM-DEMO-500',
        retryable: false,
      };
    case 'denied':
      return {
        status: 'permission_denied',
        code: 'FORBIDDEN',
        message: 'You do not have access to meeting minutes.',
      };
    case 'signed-out':
      return {
        status: 'unauthenticated',
        code: 'UNAUTHENTICATED',
        message: 'Your session has ended.',
        reason: 'session_expired',
        returnTo: '/meeting-minutes',
      };
    case 'invalid':
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'The list settings are not valid.',
        focusField: 'pagination',
        fieldErrors: [
          {
            field: 'pagination',
            code: 'INVALID_PAGINATION',
            message: 'The page or page size is not valid.',
            guidance: 'Reset the list to its first page.',
          },
        ],
      };
  }
}

export function resetMeetingMinutesState(): void {
  minutes = [...MEETING_MINUTES];
  listFault = null;
  errorOnceUntil = 0;
}

/* ------------------------------------------------------------------------- */
/* Scope                                                                     */
/* ------------------------------------------------------------------------- */

function canReadDivision(viewer: Account, divisionId: string): boolean {
  if (!viewer.scopedDivisionIds.includes(divisionId)) return false;
  return divisionId !== 'gov' || viewer.permissions.includes(SENSITIVE_PERMISSIONS.governmentProjects);
}

function canRead(viewer: Account, minute: MeetingMinute): boolean {
  return canReadDivision(viewer, minute.divisionId);
}

function isCreatorRole(viewer: Account): boolean {
  return viewer.roles.some((role) => CREATOR_ROLES.includes(role));
}

function actionsFor(viewer: Account, minute: MeetingMinute): MinuteActionsView {
  const mayChange =
    minute.archivedAt === null &&
    isCreatorRole(viewer) &&
    (minute.createdBy.userId === viewer.userId || viewer.roles.includes('super_admin'));

  return {
    canEdit: mayChange,
    canArchive: mayChange,
    canRequestProcessing: mayChange && minute.processingStatus === 'not_processed',
    canRetry:
      mayChange && minute.processingStatus === 'failed' && (minute.processingError?.retryable ?? false),
  };
}

/* ------------------------------------------------------------------------- */
/* Lookups                                                                   */
/* ------------------------------------------------------------------------- */

function clientRef(clientId: string): ClientRef {
  const found = CLIENTS.find((item) => item.id === clientId);
  return { id: clientId, name: found?.name ?? 'Unknown client' };
}

function projectName(projectId: string): string {
  return PROJECTS.find((project) => project.id === projectId)?.name ?? 'Unknown project';
}

function creatorName(minute: MeetingMinute): string {
  return findAccountByUserId(minute.createdBy.userId)?.fullName ?? minute.createdBy.displayName;
}

/**
 * Projects the viewer may see that are linked to an active client, inactive
 * projects included so older minutes stay findable (`FE-1111`).
 */
function visibleProjects(viewer: Account): readonly MeetingMinuteProjectFilterOption[] {
  return PROJECT_CLIENT_LINKS.flatMap((link) => {
    if (link.state !== 'linked') return [];
    const project = PROJECTS.find((item) => item.id === link.projectId);
    const linkedClient = CLIENTS.find((item) => item.id === link.clientId);
    if (!project || linkedClient?.status !== 'active' || !canReadDivision(viewer, project.divisionId)) {
      return [];
    }
    return [
      {
        id: project.id,
        name: project.name,
        code: project.code,
        clientId: link.clientId,
        isActive: project.isActive,
      },
    ];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Clients reachable through at least one project the viewer may see. */
function visibleClients(projects: readonly MeetingMinuteProjectFilterOption[]): readonly ClientRef[] {
  const ids = new Set(projects.map((project) => project.clientId));
  return CLIENTS.filter((item) => ids.has(item.id))
    .map((item) => ({ id: item.id, name: item.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------------- */
/* Query                                                                     */
/* ------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function applicableFilters(
  viewer: Account,
  requested: MeetingMinuteFilters | undefined,
  clients: readonly ClientRef[],
): MeetingMinuteFilters {
  if (!requested) return {};
  const clientIds = new Set(clients.map((item) => item.id));
  const range = requested.createdDateRange;

  return {
    ...(requested.clientIds && {
      clientIds: requested.clientIds.filter((id) => clientIds.has(id)),
    }),
    ...(requested.projectIds && {
      projectIds: requested.projectIds.filter((id) => {
        const project = PROJECTS.find((item) => item.id === id);
        return project !== undefined && canReadDivision(viewer, project.divisionId);
      }),
    }),
    ...(requested.processingStatuses && {
      processingStatuses: requested.processingStatuses.filter((status) =>
        MINUTE_PROCESSING_STATUSES.includes(status),
      ),
    }),
    ...(range &&
      ISO_DATE.test(range.from) &&
      ISO_DATE.test(range.to) &&
      range.from <= range.to && { createdDateRange: range }),
    ...(requested.includeArchived === true && { includeArchived: true }),
  };
}

function matchesFilters(minute: MeetingMinute, filters: MeetingMinuteFilters): boolean {
  if (minute.archivedAt !== null && filters.includeArchived !== true) return false;
  if (filters.clientIds && !filters.clientIds.includes(minute.clientId)) return false;
  if (filters.projectIds && !filters.projectIds.includes(minute.projectId)) return false;
  if (filters.processingStatuses && !filters.processingStatuses.includes(minute.processingStatus)) {
    return false;
  }
  if (filters.createdDateRange) {
    // `createdAt` carries the business-timezone offset, so its first ten
    // characters are the local calendar date.
    const createdDate = minute.createdAt.slice(0, 10);
    if (createdDate < filters.createdDateRange.from || createdDate > filters.createdDateRange.to) {
      return false;
    }
  }
  return true;
}

function matchesSearch(minute: MeetingMinute, term: string | undefined): boolean {
  const needle = term?.trim().toLowerCase();
  if (!needle) return true;
  // Title, client and project only — never the minute's content.
  return [minute.title, clientRef(minute.clientId).name, projectName(minute.projectId)].some((value) =>
    value.toLowerCase().includes(needle),
  );
}

function sortValue(minute: MeetingMinute, field: MeetingMinuteSortField): string | number {
  switch (field) {
    case 'title':
      return minute.title.toLowerCase();
    case 'client':
      return clientRef(minute.clientId).name.toLowerCase();
    case 'project':
      return projectName(minute.projectId).toLowerCase();
    case 'processingStatus':
      return MINUTE_PROCESSING_STATUSES.indexOf(minute.processingStatus);
    case 'createdAt':
      return new Date(minute.createdAt).getTime();
  }
}

function toSummaryView(viewer: Account, minute: MeetingMinute): MeetingMinuteSummaryView {
  return {
    id: minute.id,
    title: minute.title,
    client: clientRef(minute.clientId),
    projectName: projectName(minute.projectId),
    creatorName: creatorName(minute),
    createdAt: minute.createdAt,
    createdAtLabel: formatTimestamp(minute.createdAt, DEMO_TIMEZONE),
    aiRequested: minute.processWithAi,
    aiRequestedLabel: minute.processWithAi ? 'Yes' : 'No',
    processing: {
      status: minute.processingStatus,
      label: describeMinuteProcessingStatus(minute.processingStatus).label,
    },
    isArchived: minute.archivedAt !== null,
    actions: actionsFor(viewer, minute),
    href: `/meeting-minutes/${minute.id}`,
  };
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export const mockMeetingMinutesService: Pick<MeetingMinutesService, 'list'> = {
  async list(userId, query: MeetingMinuteListQuery): Promise<Result<MeetingMinuteListView>> {
    // Taken before the simulated latency, so both calls of a development
    // double-invoke see the same fault.
    const fault = takeListFault();
    await delay();
    if (fault) return simulatedFailure(fault);

    const viewer = findAccountByUserId(userId);
    if (!viewer) {
      return {
        status: 'unauthenticated',
        code: 'UNAUTHENTICATED',
        message: 'Sign in to see meeting minutes.',
        reason: 'no_session',
        returnTo: '/meeting-minutes',
      };
    }

    const { page, pageSize } = query.pagination;
    if (!Number.isInteger(page) || page < 1 || !(PAGE_SIZE_OPTIONS as readonly number[]).includes(pageSize)) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'The page or page size is not valid.',
        focusField: 'pagination',
        fieldErrors: [
          {
            field: 'pagination',
            code: 'INVALID_PAGINATION',
            message: 'The page must be 1 or more and the page size must be 10, 25, 50 or 100.',
            guidance: 'Go back to the first page or choose one of the listed page sizes.',
          },
        ],
      };
    }

    // Authorization first: every later step sees only readable minutes.
    const readable = minutes.filter((minute) => canRead(viewer, minute));
    const projectOptions = visibleProjects(viewer);
    const clientOptions = visibleClients(projectOptions);
    const appliedFilters = applicableFilters(viewer, query.filters, clientOptions);
    const sort = query.sort ?? DEFAULT_MEETING_MINUTE_SORT;
    const direction = sort.direction === 'asc' ? 1 : -1;

    const matching = readable
      .filter((minute) => matchesFilters(minute, appliedFilters))
      .filter((minute) => matchesSearch(minute, query.search?.term))
      .sort((a, b) => {
        const left = sortValue(a, sort.field);
        const right = sortValue(b, sort.field);
        if (left !== right) return (left < right ? -1 : 1) * direction;
        return a.id.localeCompare(b.id);
      });

    const totalItems = matching.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const items = matching
      .slice((page - 1) * pageSize, page * pageSize)
      .map((minute) => toSummaryView(viewer, minute));

    return success({
      page: {
        items,
        pageInfo: {
          page,
          pageSize,
          totalItems,
          totalPages,
          hasPreviousPage: page > 1,
          hasNextPage: page < totalPages,
        },
      },
      appliedFilters,
      clientOptions,
      projectOptions,
      canCreate: isCreatorRole(viewer),
    });
  },
};
