/**
 * Mock Meeting Minutes service.
 *
 * `FE-1110`–`FE-1112` implement `list`; `FE-1113` adds `createContext`,
 * `listProjectOptions` and `create` for the Add form. The remaining
 * `MeetingMinutesService` operations arrive with the screens that call them,
 * so the export is typed as exactly what exists rather than pretending to the
 * full interface.
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
  CreateMeetingMinuteInput,
  MeetingMinute,
  MeetingMinuteCreateContextView,
  MeetingMinuteDetailView,
  MeetingMinuteEditContextView,
  MeetingMinuteField,
  MeetingMinuteFields,
  MeetingMinuteFilters,
  MeetingMinuteListQuery,
  MeetingMinuteListView,
  MeetingMinuteProjectFilterOption,
  MeetingMinuteProjectOption,
  MeetingMinuteSavedView,
  MeetingMinuteSortField,
  MeetingMinuteSummaryView,
  MeetingMinuteValidationCode,
  MeetingMinuteWarningCode,
  MeetingMinutesService,
  MinuteActionsView,
  UpdateMeetingMinuteInput,
  ArchiveMeetingMinuteInput,
} from '@/contracts/meeting-minutes';
import {
  DEFAULT_MEETING_MINUTE_SORT,
  MEETING_MINUTE_LIMITS,
  MINUTE_PROCESSING_STATUSES,
  SAFE_PROCESSING_ERROR_MESSAGE,
} from '@/contracts/meeting-minutes';
import { PAGE_SIZE_OPTIONS } from '@/contracts/query';
import type { FieldError, Result, ResultWarning } from '@/contracts/results';
import { success } from '@/contracts/results';
import { DEMO_TODAY, PROJECTS } from '@/fixtures';
import { CLIENTS, MEETING_MINUTES, PROJECT_CLIENT_LINKS } from '@/fixtures/meeting-minutes';
import { formatTimestamp } from '@/lib/format';
import { minuteContentToPlainText, sanitizeMinuteContent } from '@/lib/minute-content';
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

/**
 * `FE-1115` — a way to make a save, or only its queueing, fail on purpose.
 *
 * `REQ-MTG-007` is most visible when enqueueing fails: the minute must still
 * be saved, and the screen must say so. Nothing in the seed data fails, so
 * without this the most important state on this form could be designed but
 * never shown. `queue` saves the minute and fails only the dispatch; `error`
 * fails the save itself, storing nothing.
 *
 * This lives only in the mock adapter. The MySQL adapter has no equivalent.
 */
export type MeetingMinutesCreateFault = 'queue' | 'error';

const CREATE_FAULTS: readonly MeetingMinutesCreateFault[] = ['queue', 'error'];

export const MEETING_MINUTES_CREATE_FAULT_STORAGE_KEY = 'oms.mock-fault.meeting-minutes-create';

let createFault: MeetingMinutesCreateFault | null = null;

export function setMeetingMinutesCreateFault(fault: MeetingMinutesCreateFault | null): void {
  createFault = fault;
}

/** Read, never consumed: a save is deliberate, so it is not a fail-once switch. */
function currentCreateFault(): MeetingMinutesCreateFault | null {
  if (createFault) return createFault;
  if (typeof window === 'undefined') return null;
  try {
    const stored = window.localStorage.getItem(MEETING_MINUTES_CREATE_FAULT_STORAGE_KEY);
    return stored && (CREATE_FAULTS as readonly string[]).includes(stored)
      ? (stored as MeetingMinutesCreateFault)
      : null;
  } catch {
    return null;
  }
}

export function resetMeetingMinutesState(): void {
  minutes = [...MEETING_MINUTES];
  createdByKey.clear();
  archivedByKey.clear();
  nextMinuteNumber = 2001;
  listFault = null;
  createFault = null;
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
/* Create (`FE-1113`)                                                        */
/* ------------------------------------------------------------------------- */

/**
 * The form's project list, unlike the filter's, offers only **active**
 * projects of one active client that the viewer may see (`REQ-MTG-005`). An
 * inactive or invisible client yields an empty list rather than an error, so
 * choosing a client nobody may use looks exactly like choosing one that does
 * not exist.
 */
function creatableProjects(
  viewer: Account,
  clientId: string,
): readonly MeetingMinuteProjectOption[] {
  if (CLIENTS.find((item) => item.id === clientId)?.status !== 'active') return [];

  return PROJECT_CLIENT_LINKS.flatMap((link) => {
    if (link.state !== 'linked' || link.clientId !== clientId) return [];
    const project = PROJECTS.find((item) => item.id === link.projectId);
    if (!project || !project.isActive || !canReadDivision(viewer, project.divisionId)) return [];
    return [{ id: project.id, name: project.name, code: project.code }];
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Active clients with at least one project the viewer could actually choose. */
function creatableClients(viewer: Account): readonly ClientRef[] {
  return CLIENTS.filter((client) => client.status === 'active')
    .filter((client) => creatableProjects(viewer, client.id).length > 0)
    .map((client) => ({ id: client.id, name: client.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CREATE_DENIED = {
  status: 'permission_denied',
  code: 'FORBIDDEN',
  message: 'You cannot add meeting minutes.',
  guidance:
    'A Team Lead, HR Manager or Super Administrator records a meeting minute. You can still read the minutes in your scope.',
} as const;

function notSignedIn(returnTo: string, message = 'Sign in to add a meeting minute.') {
  return {
    status: 'unauthenticated',
    code: 'UNAUTHENTICATED',
    message,
    reason: 'no_session',
    returnTo,
  } as const;
}

const VALIDATION_GUIDANCE: Readonly<Record<MeetingMinuteValidationCode, string>> = {
  REQUIRED: 'Fill this in before saving.',
  TOO_LONG: 'Shorten it and save again.',
  CLIENT_INACTIVE: 'Choose a client from the list.',
  PROJECT_INACTIVE: 'Choose an active project for this client.',
  PROJECT_NOT_FOR_CLIENT: 'Choose a project from the list for the client you selected.',
  CONTENT_EMPTY_AFTER_SANITIZING:
    'Type the minute as text. Formatting that cannot be stored safely is removed.',
};

function fieldError(
  field: MeetingMinuteField,
  code: MeetingMinuteValidationCode,
  message: string,
): FieldError {
  return { field, code, message, guidance: VALIDATION_GUIDANCE[code] };
}

/**
 * Validates the submitted fields (`FE-1114`).
 *
 * The client and project are re-checked here rather than trusted from the
 * picker: a stale page, a slow option list or a hand-built request can each
 * submit a project that belongs to another client, is no longer active, or is
 * outside the viewer's scope.
 *
 * Which of the two project codes comes back is the one judgement in here.
 * `PROJECT_INACTIVE` is returned only when the viewer can already see that
 * project under the client they chose — it tells them nothing they could not
 * read in the list's own filters, and it is the difference between "pick
 * another project" and "that is not this client's project". Everything else —
 * a project of another client, one outside the viewer's scope, one that does
 * not exist — returns `PROJECT_NOT_FOR_CLIENT`, so the failure cannot be used
 * to probe for projects.
 */
function validateFields(
  viewer: Account,
  fields: MeetingMinuteFields,
  /**
   * The minute being edited, when there is one (`FE-1116`).
   *
   * An unchanged client and project are accepted even if they would no longer
   * be offered today. A project deactivated after the minute was written is
   * not a reason to refuse a correction to its title, and forcing a different
   * project onto an existing minute would rewrite what the meeting was about.
   * Changing either still has to land on something currently valid.
   */
  existing?: MeetingMinute,
): { readonly errors: readonly FieldError[]; readonly content: string } {
  const errors: FieldError[] = [];
  const title = fields.title.trim();

  if (title.length === 0) {
    errors.push(fieldError('title', 'REQUIRED', 'Enter a title for this meeting minute.'));
  } else if (title.length > MEETING_MINUTE_LIMITS.titleMaxLength) {
    errors.push(
      fieldError(
        'title',
        'TOO_LONG',
        `The title must be ${MEETING_MINUTE_LIMITS.titleMaxLength} characters or fewer.`,
      ),
    );
  }

  const clients = creatableClients(viewer);
  const clientUnchanged = existing !== undefined && fields.clientId === existing.clientId;
  const projectUnchanged =
    existing !== undefined && clientUnchanged && fields.projectId === existing.projectId;

  if (fields.clientId.length === 0) {
    errors.push(fieldError('clientId', 'REQUIRED', 'Choose the client this meeting was with.'));
  } else if (!clientUnchanged && !clients.some((client) => client.id === fields.clientId)) {
    errors.push(
      fieldError('clientId', 'CLIENT_INACTIVE', 'That client is not available for a new minute.'),
    );
  }

  const clientIsUsable =
    fields.clientId.length > 0 &&
    (clientUnchanged || clients.some((client) => client.id === fields.clientId));
  const projects = clientIsUsable ? creatableProjects(viewer, fields.clientId) : [];
  if (fields.projectId.length === 0) {
    errors.push(fieldError('projectId', 'REQUIRED', 'Choose the project this meeting was about.'));
  } else if (!projectUnchanged && !projects.some((project) => project.id === fields.projectId)) {
    /*
     * Inactive is only worth naming when the viewer can already see that
     * project under this client; otherwise the answer stays the generic one.
     * An unusable client is not a place to report an inactive project either,
     * because the client's own error is what the user has to fix first.
     */
    const seen = clientIsUsable
      ? visibleProjects(viewer).find((project) => project.id === fields.projectId)
      : undefined;
    const inactiveForThisClient =
      seen !== undefined && seen.clientId === fields.clientId && !seen.isActive;

    errors.push(
      inactiveForThisClient
        ? fieldError('projectId', 'PROJECT_INACTIVE', 'That project is no longer active.')
        : fieldError(
            'projectId',
            'PROJECT_NOT_FOR_CLIENT',
            'That project does not belong to the selected client.',
          ),
    );
  }

  const content = sanitizeMinuteContent(fields.content);
  if (fields.content.trim().length === 0) {
    errors.push(fieldError('content', 'REQUIRED', 'Write what the meeting covered.'));
  } else if (content.length === 0) {
    errors.push(
      fieldError(
        'content',
        'CONTENT_EMPTY_AFTER_SANITIZING',
        'Nothing could be stored from what you pasted.',
      ),
    );
  } else if (content.length > MEETING_MINUTE_LIMITS.contentMaxLength) {
    errors.push(
      fieldError(
        'content',
        'TOO_LONG',
        `The minute must be ${MEETING_MINUTE_LIMITS.contentMaxLength.toLocaleString('en-US')} characters or fewer.`,
      ),
    );
  }

  return { errors, content };
}

/**
 * Demo "now": the pinned demo date with the real clock's time of day in the
 * business timezone, so a minute saved during a demo sorts above the seeded
 * ones instead of jumping to the real calendar year.
 */
function nowTimestamp(): string {
  const dhaka = new Date(Date.now() + 6 * 60 * 60 * 1000);
  return `${DEMO_TODAY}T${dhaka.toISOString().slice(11, 19)}+06:00`;
}

let nextMinuteNumber = 2001;

/** First outcome per idempotency key, so a repeated save creates no second minute. */
const createdByKey = new Map<string, string>();

/**
 * The outcome of a save, as the form reads it (`REQ-MTG-007`-`REQ-MTG-009`).
 *
 * `processingStarted` is derived from the stored status rather than from the
 * user's choice, which is the whole point: a minute whose job could not be
 * queued asked for AI and did not get it, and the screen must not report that
 * as started. The warning rides along so a repeat of the same idempotent save
 * tells the same story as the first one.
 */
function savedView(
  viewer: Account,
  minute: MeetingMinute,
): { readonly data: MeetingMinuteSavedView; readonly warnings: readonly ResultWarning[] } {
  const processingStarted = minute.processWithAi && minute.processingStatus === 'pending';
  return {
    data: { minute: toDetailView(viewer, minute), processingStarted },
    warnings:
      minute.processWithAi && !processingStarted
        ? [
            {
              code: 'PROCESSING_NOT_STARTED' satisfies MeetingMinuteWarningCode,
              message: SAFE_PROCESSING_ERROR_MESSAGE.queue_unavailable,
            },
          ]
        : [],
  };
}

function toDetailView(viewer: Account, minute: MeetingMinute): MeetingMinuteDetailView {
  return {
    id: minute.id,
    title: minute.title,
    client: clientRef(minute.clientId),
    project: { id: minute.projectId, name: projectName(minute.projectId) },
    content: minute.content,
    creatorName: creatorName(minute),
    createdAt: minute.createdAt,
    createdAtLabel: formatTimestamp(minute.createdAt, DEMO_TIMEZONE),
    updatedAtLabel: formatTimestamp(minute.updatedAt, DEMO_TIMEZONE),
    aiRequested: minute.processWithAi,
    aiRequestedLabel: minute.processWithAi ? 'Yes' : 'No',
    processing: {
      status: minute.processingStatus,
      label: describeMinuteProcessingStatus(minute.processingStatus).label,
      processedAtLabel:
        minute.processedAt === null ? null : formatTimestamp(minute.processedAt, DEMO_TIMEZONE),
      error:
        minute.processingError === null
          ? null
          : {
              code: minute.processingError.code,
              message: SAFE_PROCESSING_ERROR_MESSAGE[minute.processingError.code],
              occurredAtLabel: formatTimestamp(minute.processingError.occurredAt, DEMO_TIMEZONE),
              retryable: minute.processingError.retryable,
            },
      attemptCount: minute.latestAttemptId === null ? 0 : 1,
    },
    /*
     * A minute this operation returns has just been created, so it carries no
     * AI interpretation and no generated tasks yet. `FE-1120` reads stored
     * attempts, summaries and links for the detail page.
     */
    interpretation: null,
    generatedTasks: [],
    archived:
      minute.archivedAt === null || minute.archivedBy === null
        ? null
        : {
            archivedAtLabel: formatTimestamp(minute.archivedAt, DEMO_TIMEZONE),
            archivedByName: minute.archivedBy.displayName,
          },
    version: minute.version,
    actions: actionsFor(viewer, minute),
    editHref: `/meeting-minutes/${minute.id}/edit`,
  };
}

/* ------------------------------------------------------------------------- */
/* Edit and archive (`FE-1116`)                                              */
/* ------------------------------------------------------------------------- */

/**
 * Why a change to an existing minute is refused, in the order the rules apply.
 *
 * `not_found` comes first and covers everything the viewer may not read, so a
 * minute outside their scope answers exactly as a nonexistent id does
 * (`AC-MTG-009`). `permission_denied` is only ever reached for a minute they
 * can already read, which is why saying "you may not change this one" reveals
 * nothing new. `archived` is a conflict rather than a denial: the record is
 * readable and the viewer is entitled to it, but its state no longer accepts
 * changes (`REQ-MTG-018`).
 */
type ChangeGate =
  | { readonly kind: 'ok'; readonly minute: MeetingMinute }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'archived'; readonly minute: MeetingMinute };

function gateChange(viewer: Account, minuteId: string): ChangeGate {
  const minute = minutes.find((item) => item.id === minuteId);
  if (!minute || !canRead(viewer, minute)) return { kind: 'not_found' };

  const mayChange =
    isCreatorRole(viewer) &&
    (minute.createdBy.userId === viewer.userId || viewer.roles.includes('super_admin'));
  if (!mayChange) return { kind: 'denied' };

  return minute.archivedAt === null ? { kind: 'ok', minute } : { kind: 'archived', minute };
}

const MINUTE_NOT_FOUND = {
  status: 'not_found',
  code: 'NOT_FOUND',
  message: 'That meeting minute could not be found.',
  resource: 'meeting_minute',
} as const;

const CHANGE_DENIED = {
  status: 'permission_denied',
  code: 'FORBIDDEN',
  message: 'You cannot change this meeting minute.',
  guidance: 'Its creator, or a Super Administrator, can edit or archive it. You can still read it.',
} as const;

const ARCHIVED_CONFLICT = {
  status: 'conflict',
  code: 'CONFLICT',
  message: 'This meeting minute is archived.',
  guidance: 'An archived minute is kept exactly as it was and no longer accepts changes.',
} as const;

const STALE_VERSION_CONFLICT = {
  status: 'conflict',
  code: 'CONFLICT',
  message: 'This meeting minute changed while you were editing it.',
  guidance: 'Reload the minute to see the current version, then apply your changes again.',
} as const;

/** Archive outcomes, so repeating the same request returns the first one. */
const archivedByKey = new Map<string, string>();

/**
 * Options for the edit form's project picker.
 *
 * It is `creatableProjects` plus, when needed, the minute's **own** project
 * even if that project has since been deactivated. Leaving it out would show
 * an empty selection for a minute that has a perfectly good project, and would
 * push the user into re-picking one just to fix a typo in the title.
 */
function editProjectOptions(
  viewer: Account,
  clientId: string,
  minute: MeetingMinute,
): readonly MeetingMinuteProjectOption[] {
  const options = creatableProjects(viewer, clientId);
  if (clientId !== minute.clientId || options.some((option) => option.id === minute.projectId)) {
    return options;
  }
  const current = PROJECTS.find((project) => project.id === minute.projectId);
  if (!current || !canReadDivision(viewer, current.divisionId)) return options;
  return [...options, { id: current.id, name: current.name, code: current.code }].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/** The same for clients: the minute's own client stays selectable. */
function editClientOptions(viewer: Account, minute: MeetingMinute): readonly ClientRef[] {
  const options = creatableClients(viewer);
  if (options.some((client) => client.id === minute.clientId)) return options;
  return [...options, clientRef(minute.clientId)].sort((a, b) => a.name.localeCompare(b.name));
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export const mockMeetingMinutesService: Pick<
  MeetingMinutesService,
  | 'list'
  | 'createContext'
  | 'listProjectOptions'
  | 'create'
  | 'get'
  | 'editContext'
  | 'update'
  | 'archive'
> = {
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

  /**
   * What the Add form needs before the user types (`FE-1113`).
   *
   * Offering a client is itself information, so the list is built from the
   * projects this viewer may actually use: a client reachable only through a
   * government project never appears to a viewer without that permission.
   */
  async createContext(userId): Promise<Result<MeetingMinuteCreateContextView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn('/meeting-minutes/new');
    if (!isCreatorRole(viewer)) return CREATE_DENIED;

    return success({ clients: creatableClients(viewer), limits: MEETING_MINUTE_LIMITS });
  },

  async listProjectOptions(
    userId,
    clientId,
  ): Promise<Result<readonly MeetingMinuteProjectOption[]>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn('/meeting-minutes/new');
    if (!isCreatorRole(viewer)) return CREATE_DENIED;

    // An unknown, inactive or invisible client is an empty list, never an
    // error: the difference between them must not be observable.
    return success(creatableProjects(viewer, clientId));
  },

  /**
   * Saves the minute, then considers AI (`REQ-MTG-007`–`REQ-MTG-009`).
   *
   * The order is the requirement: the record is committed first and a
   * processing decision never rolls it back. `processingStarted` reports
   * whether a run was queued; the refined save messaging is `FE-1115`.
   */
  async create(userId, input: CreateMeetingMinuteInput): Promise<Result<MeetingMinuteSavedView>> {
    const fault = currentCreateFault();
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn('/meeting-minutes/new');
    if (!isCreatorRole(viewer)) return CREATE_DENIED;

    // A repeat of the same save returns the first outcome (`REQ-MTG-023`).
    const alreadyCreated = createdByKey.get(input.idempotencyKey);
    if (alreadyCreated) {
      const existing = minutes.find((minute) => minute.id === alreadyCreated);
      if (existing) {
        const repeat = savedView(viewer, existing);
        return success(repeat.data, repeat.warnings);
      }
    }

    const { errors, content } = validateFields(viewer, input);
    if (errors.length > 0) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'This meeting minute could not be saved.',
        focusField: errors[0].field,
        fieldErrors: errors,
      };
    }

    // A save that fails outright stores nothing; the form keeps the user's
    // input so they can try again.
    if (fault === 'error') {
      return {
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        message: 'The meeting minute could not be saved.',
        reference: 'MM-DEMO-503',
        retryable: true,
      };
    }

    const project = PROJECTS.find((item) => item.id === input.projectId);
    /* istanbul ignore next -- validation already proved the project exists. */
    if (!project) {
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'The meeting minute could not be saved.',
        reference: 'MM-CREATE-500',
        retryable: true,
      };
    }

    const createdAt = nowTimestamp();
    const actor = { userId: viewer.userId, displayName: viewer.fullName };
    // Queueing is considered only after the minute is known to be storable,
    // and its outcome never prevents the save (`REQ-MTG-007`).
    const queueRefused = input.processWithAi && fault === 'queue';
    const queued = input.processWithAi && !queueRefused;
    // Taken once: `nextMinuteNumber++` inside the literal below would leave the
    // attempt id pointing at the *next* minute.
    const minuteId = `min-${nextMinuteNumber++}`;
    const saved: MeetingMinute = {
      id: minuteId,
      title: input.title.trim(),
      clientId: input.clientId,
      projectId: input.projectId,
      divisionId: project.divisionId,
      content,
      processWithAi: input.processWithAi,
      /*
       * The choice alone decides this. A minute saved without AI is
       * `not_processed` for good, never "waiting" (`REQ-MTG-008`). One saved
       * with AI is `pending` once its job is queued, and `failed` when the
       * queue refused it — the minute is stored either way, which is the rule
       * `REQ-MTG-007` exists to protect.
       */
      processingStatus: !input.processWithAi ? 'not_processed' : queued ? 'pending' : 'failed',
      processingError: queueRefused
        ? { code: 'queue_unavailable', occurredAt: createdAt, retryable: true }
        : null,
      processedAt: null,
      // An attempt exists as soon as AI was asked for, including the refused
      // one, so a later retry has something to count from.
      latestAttemptId: input.processWithAi ? `att-${minuteId.slice(4)}-1` : null,
      archivedAt: null,
      archivedBy: null,
      version: 1,
      createdAt,
      createdBy: actor,
      updatedAt: createdAt,
      updatedBy: actor,
    };

    minutes = [...minutes, saved];
    createdByKey.set(input.idempotencyKey, saved.id);

    const outcome = savedView(viewer, saved);
    return success(outcome.data, outcome.warnings);
  },


  /**
   * One minute, as its detail page reads it (`REQ-MTG-016`, `FE-1120`).
   *
   * There is no `permission_denied` here, and there must not be: a minute the
   * viewer cannot read answers exactly as a nonexistent id does, so an id
   * cannot be probed for existence (`AC-MTG-009`, `AC-AUTH-004`). An archived
   * minute stays readable to anyone still in scope, because links from
   * generated tasks and notifications have to keep working (`REQ-MTG-018`).
   */
  async get(userId, minuteId): Promise<Result<MeetingMinuteDetailView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) {
      return notSignedIn(`/meeting-minutes/${minuteId}`, 'Sign in to see this meeting minute.');
    }

    const minute = minutes.find((item) => item.id === minuteId);
    if (!minute || !canRead(viewer, minute)) return MINUTE_NOT_FOUND;

    return success(toDetailView(viewer, minute));
  },
  /**
   * What the Edit form loads (`FE-1116`).
   *
   * The stored content is sanitized HTML; the form edits plain text, so it is
   * converted back through the same module that produced it. Round-tripping
   * anywhere else would be a second opinion about what the markup means.
   */
  async editContext(userId, minuteId): Promise<Result<MeetingMinuteEditContextView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${minuteId}/edit`);

    const gate = gateChange(viewer, minuteId);
    if (gate.kind === 'not_found') return MINUTE_NOT_FOUND;
    if (gate.kind === 'denied') return CHANGE_DENIED;
    if (gate.kind === 'archived') return ARCHIVED_CONFLICT;

    const { minute } = gate;
    return success({
      minuteId: minute.id,
      version: minute.version,
      values: {
        title: minute.title,
        clientId: minute.clientId,
        projectId: minute.projectId,
        content: minuteContentToPlainText(minute.content),
      },
      clients: editClientOptions(viewer, minute),
      projects: editProjectOptions(viewer, minute.clientId, minute),
      limits: MEETING_MINUTE_LIMITS,
      canArchive: true,
    });
  },

  /**
   * Saves an edit (`REQ-MTG-018`, `AC-MTG-009`).
   *
   * An edit touches the human record only. Processing status, the attempt
   * link, the processed time and `processWithAi` are all left exactly as they
   * were: editing is not a way to start, repeat or cancel an AI run, which is
   * why `UpdateMeetingMinuteInput` has no `processWithAi` field at all.
   */
  async update(userId, input: UpdateMeetingMinuteInput): Promise<Result<MeetingMinuteDetailView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${input.minuteId}/edit`);

    const gate = gateChange(viewer, input.minuteId);
    if (gate.kind === 'not_found') return MINUTE_NOT_FOUND;
    if (gate.kind === 'denied') return CHANGE_DENIED;
    if (gate.kind === 'archived') return ARCHIVED_CONFLICT;

    const { minute } = gate;
    // Checked before validation: re-reporting field errors against a version
    // the user has not seen would send them to fix the wrong text.
    if (minute.version !== input.expectedVersion) return STALE_VERSION_CONFLICT;

    const { errors, content } = validateFields(viewer, input, minute);
    if (errors.length > 0) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'This meeting minute could not be saved.',
        focusField: errors[0].field,
        fieldErrors: errors,
      };
    }

    const project = PROJECTS.find((item) => item.id === input.projectId);
    if (!project) {
      return {
        status: 'error',
        code: 'INTERNAL_ERROR',
        message: 'The meeting minute could not be saved.',
        reference: 'MM-UPDATE-500',
        retryable: true,
      };
    }

    const updated: MeetingMinute = {
      ...minute,
      title: input.title.trim(),
      clientId: input.clientId,
      projectId: input.projectId,
      divisionId: project.divisionId,
      content,
      version: minute.version + 1,
      updatedAt: nowTimestamp(),
      updatedBy: { userId: viewer.userId, displayName: viewer.fullName },
    };
    minutes = minutes.map((item) => (item.id === updated.id ? updated : item));

    return success(toDetailView(viewer, updated));
  },

  /**
   * Archives, and never deletes (`REQ-MTG-018`).
   *
   * Everything the minute holds is kept: its content, its processing history
   * and its generated-task links all stay, so a task raised from this meeting
   * can still name where it came from. Archiving only stops further changes
   * and takes the minute out of the default list.
   */
  async archive(userId, input: ArchiveMeetingMinuteInput): Promise<Result<MeetingMinuteDetailView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${input.minuteId}`);

    // A repeat of the same request returns the first outcome, so a double
    // submission cannot turn into a conflict the user has to make sense of.
    const already = archivedByKey.get(input.idempotencyKey);
    if (already) {
      const archived = minutes.find((item) => item.id === already);
      if (archived && canRead(viewer, archived)) return success(toDetailView(viewer, archived));
    }

    const gate = gateChange(viewer, input.minuteId);
    if (gate.kind === 'not_found') return MINUTE_NOT_FOUND;
    if (gate.kind === 'denied') return CHANGE_DENIED;
    if (gate.kind === 'archived') return ARCHIVED_CONFLICT;

    const { minute } = gate;
    if (minute.version !== input.expectedVersion) return STALE_VERSION_CONFLICT;

    const now = nowTimestamp();
    const actor = { userId: viewer.userId, displayName: viewer.fullName };
    const archived: MeetingMinute = {
      ...minute,
      archivedAt: now,
      archivedBy: actor,
      version: minute.version + 1,
      updatedAt: now,
      updatedBy: actor,
    };
    minutes = minutes.map((item) => (item.id === archived.id ? archived : item));
    archivedByKey.set(input.idempotencyKey, archived.id);

    return success(toDetailView(viewer, archived));
  },
};
