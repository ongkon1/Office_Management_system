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
  GeneratedTaskView,
  MinuteProcessingSnapshotView,
  MinuteProcessingStatus,
  OpenTaskTargetView,
  RequestProcessingInput,
  RetryProcessingInput,
  TaskSourceMinuteView,
  TeamMatchBasis,
  TeamMatchOutcome,
} from '@/contracts/meeting-minutes';
import {
  DEFAULT_MEETING_MINUTE_SORT,
  MEETING_MINUTE_LIMITS,
  MINUTE_PROCESSING_STATUSES,
  SAFE_PROCESSING_ERROR_MESSAGE,
  canChangeProcessingStatus,
} from '@/contracts/meeting-minutes';
import { PAGE_SIZE_OPTIONS } from '@/contracts/query';
import type { FieldError, Result, ResultWarning } from '@/contracts/results';
import { success } from '@/contracts/results';
import { DEMO_TODAY, PROJECTS } from '@/fixtures';
import {
  CLIENTS,
  DUPLICATE_PROPOSALS,
  EXTRACTED_DECISIONS,
  GENERATED_TASK_LINKS,
  MEETING_MINUTES,
  MEETING_SUMMARIES,
  PROJECT_CLIENT_LINKS,
} from '@/fixtures/meeting-minutes';
import { formatDate, formatTimestamp } from '@/lib/format';
import { minuteContentToPlainText, sanitizeMinuteContent } from '@/lib/minute-content';
import { PRIORITY_LABEL, TASK_STATUS_LABEL, describeMinuteProcessingStatus } from '@/lib/status';
import { DEMO_ACCOUNTS, DEMO_TIMEZONE, findAccountByUserId } from './accounts';
import { addMockNotification } from './notification-store';
import { mockStore } from './store';
import { teamLeadCanOpenTask } from './team-lead';
import { employeeCanOpenTask } from './work';

const LATENCY_MS = 140;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

/** The roles that may create minutes (amended 2026-09-15: not Employee). */
const CREATOR_ROLES: readonly RoleKey[] = ['team_lead', 'hr_manager', 'super_admin'];

type Account = NonNullable<ReturnType<typeof findAccountByUserId>>;

let minutes: MeetingMinute[] = [...MEETING_MINUTES];

/**
 * `FE-1122` — the minute content each successful run read, by attempt id.
 *
 * Held so an interpretation can say when the minute has been edited since:
 * editing never re-runs AI, so without this a summary would silently describe
 * text that is no longer on the page. Seeded runs read the seeded content.
 */
function seededRunSources(): Map<string, string> {
  return new Map(
    MEETING_SUMMARIES.flatMap((summary) => {
      const source = MEETING_MINUTES.find((minute) => minute.id === summary.minuteId);
      return source ? [[summary.attemptId, source.content] as const] : [];
    }),
  );
}

let runSources = seededRunSources();

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
  runSources = seededRunSources();
  clearWorker();
  retriedByKey.clear();
  requestedByKey.clear();
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

/* ------------------------------------------------------------------------- */
/* Generated tasks and traceability (`FE-1123`, `FE-1124`)                   */
/* ------------------------------------------------------------------------- */

/**
 * Whether the viewer may open a task — by the **same** rule the task page uses.
 *
 * `/tasks/[id]` shows a Team Lead the team-lead view, scoped by division, and
 * everyone else their own tasks only. Both rules are imported from the task
 * services that apply them (`teamLeadCanOpenTask`, `employeeCanOpenTask`), so
 * this list and the task page cannot disagree: re-deriving either here would
 * be a second copy of task authorization, and the day the copies drifted this
 * list would offer an Open task link that lands on "not found".
 *
 * They are called as predicates rather than through the services, so a minute
 * with generated tasks costs no extra round trips to load.
 *
 * It is also why a Super Administrator or an HR Manager sees generated tasks
 * here as restricted rows: the task pages do not open other people's tasks
 * for them either. Widening that belongs to the task module, not to this one.
 */
function canOpenTask(viewer: Account, taskId: string): boolean {
  const task = mockStore.findTask(taskId);
  if (!task) return false;
  return viewer.primaryRole === 'team_lead'
    ? teamLeadCanOpenTask(viewer.userId, task)
    : employeeCanOpenTask(task, viewer.employeeId);
}

const BASIS_LABEL: Readonly<Record<TeamMatchBasis, string>> = {
  project_membership: 'project membership',
  department: 'department',
  role: 'role',
  availability: 'availability',
  workload: 'workload',
  active_status: 'active status',
};

/**
 * How the first assignee was chosen, in words (`REQ-MTG-013`).
 *
 * Worded as matching, never as permission: the outcome says who the task was
 * *proposed for* and on what grounds. Whether anyone may see or work on the
 * task is decided by the task's project and assignment, like any other task
 * (`FE-1124`).
 */
function matchOutcomeLabel(outcome: TeamMatchOutcome): string {
  switch (outcome.kind) {
    case 'mentioned_assignee':
      return 'Named in the minute';
    case 'matched': {
      const words = outcome.basis.map((basis) => BASIS_LABEL[basis]);
      const joined =
        words.length <= 1 ? (words[0] ?? 'team data') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
      return `Matched on ${joined}`;
    }
    case 'unassigned':
      return outcome.reason === 'mentioned_person_ineligible'
        ? 'Named person not eligible, so left unassigned'
        : 'No eligible team member, so left unassigned';
  }
}

function employeeName(employeeId: string): string {
  return DEMO_ACCOUNTS.find((account) => account.employeeId === employeeId)?.fullName ?? 'Unknown employee';
}

/**
 * The tasks a minute's run created, as this viewer may see them.
 *
 * A task the viewer cannot open keeps its place and position — its existence
 * follows from the minute they can already read — but the restricted variant
 * carries no title, assignee, dates or link (`REQ-MTG-016`).
 */
async function generatedTasksFor(
  viewer: Account,
  minute: MeetingMinute,
): Promise<readonly GeneratedTaskView[]> {
  const links = GENERATED_TASK_LINKS.filter((link) => link.minuteId === minute.id).sort(
    (a, b) => a.position - b.position,
  );

  return Promise.all(
    links.map(async (link): Promise<GeneratedTaskView> => {
      const task = mockStore.findTask(link.taskId);
      if (!task || !canOpenTask(viewer, link.taskId)) {
        return { access: 'restricted', linkId: link.id, position: link.position };
      }

      const generatedFor =
        link.matchOutcome.kind === 'unassigned' ? null : link.matchOutcome.employeeId;
      return {
        access: 'visible',
        linkId: link.id,
        taskId: task.id,
        position: link.position,
        title: task.title,
        assigneeName: task.assigneeEmployeeId ? employeeName(task.assigneeEmployeeId) : null,
        priority: task.priority,
        priorityLabel: PRIORITY_LABEL[task.priority],
        dueDate: task.dueDate,
        dueDateLabel: task.dueDate ? formatDate(task.dueDate) : '—',
        status: task.status,
        statusLabel: TASK_STATUS_LABEL[task.status],
        matchOutcome: { kind: link.matchOutcome.kind, label: matchOutcomeLabel(link.matchOutcome) },
        // Any change from the generated assignee counts, including a task that
        // arrived unassigned and was given to someone afterwards.
        reassignedSinceGeneration: task.assigneeEmployeeId !== generatedFor,
        href: `/tasks/${task.id}`,
      };
    }),
  );
}

/* ------------------------------------------------------------------------- */
/* Background processing (`FE-1126`)                                         */
/* ------------------------------------------------------------------------- */

/**
 * A stand-in for the durable worker `BE-1322` builds.
 *
 * Only a run **started in this session** — a save with AI, or a retry — is
 * driven: it moves Pending → Processing → Processed or Failed on timers, the
 * way a queue would, and notifies the minute's creator when it ends
 * (`REQ-MTG-022`). The seeded Pending and Processing minutes are deliberately
 * left where they are, so every state stays on show for demos and gates.
 *
 * A live run cannot read a minute the way a model does, so a successful one
 * produces a short summary taken from the minute's own opening sentence, no
 * decisions and no tasks — "finished, nothing to create" is a real outcome
 * (`REQ-MTG-011`). The full case, with decisions and generated tasks, is the
 * seeded `min-1001`.
 *
 * This lives only in the mock adapter. The MySQL adapter has no equivalent.
 */
export type MeetingMinutesWorkerOutcome = 'succeed' | 'fail';

const WORKER_OUTCOMES: readonly MeetingMinutesWorkerOutcome[] = ['succeed', 'fail'];

export const MEETING_MINUTES_WORKER_OUTCOME_STORAGE_KEY = 'oms.mock-outcome.meeting-minutes-worker';

const DEFAULT_WORKER_TIMING = { startAfterMs: 2500, finishAfterMs: 6500 } as const;

let workerTiming: { startAfterMs: number; finishAfterMs: number } = { ...DEFAULT_WORKER_TIMING };
let workerOutcome: MeetingMinutesWorkerOutcome | null = null;
const workerTimers = new Set<ReturnType<typeof setTimeout>>();

/** Summaries produced by live runs, by attempt id. */
const liveSummaries = new Map<string, string>();

/** Test seam: how long a live run waits before starting and before ending. */
export function setMeetingMinutesWorkerTiming(
  timing: { startAfterMs: number; finishAfterMs: number } | null,
): void {
  workerTiming = timing ? { ...timing } : { ...DEFAULT_WORKER_TIMING };
}

/** Demo and test seam: make live runs fail instead of succeed. */
export function setMeetingMinutesWorkerOutcome(outcome: MeetingMinutesWorkerOutcome | null): void {
  workerOutcome = outcome;
}

function currentWorkerOutcome(): MeetingMinutesWorkerOutcome {
  if (workerOutcome) return workerOutcome;
  if (typeof window === 'undefined') return 'succeed';
  try {
    const stored = window.localStorage.getItem(MEETING_MINUTES_WORKER_OUTCOME_STORAGE_KEY);
    return stored && (WORKER_OUTCOMES as readonly string[]).includes(stored)
      ? (stored as MeetingMinutesWorkerOutcome)
      : 'succeed';
  } catch {
    return 'succeed';
  }
}

function clearWorker(): void {
  for (const timer of workerTimers) clearTimeout(timer);
  workerTimers.clear();
  liveSummaries.clear();
  workerTiming = { ...DEFAULT_WORKER_TIMING };
  workerOutcome = null;
}

/** 1 for a first run; each retry adds one. Parsed from `att-<minute>-<n>`. */
function attemptNumberOf(attemptId: string | null): number {
  if (attemptId === null) return 0;
  const match = /-(\d+)$/.exec(attemptId);
  return match ? Number(match[1]) : 1;
}

/**
 * Moves one run on, only if it is still the minute's current run and the move
 * is legal. A retried, archived or reset minute simply stops being advanced,
 * which is what makes a timer firing late harmless (`REQ-MTG-023`).
 */
function advanceRun(minuteId: string, attemptId: string, to: MinuteProcessingStatus): void {
  const minute = minutes.find((item) => item.id === minuteId);
  if (!minute || minute.latestAttemptId !== attemptId || minute.archivedAt !== null) return;
  if (!canChangeProcessingStatus(minute.processingStatus, to)) return;

  const now = nowTimestamp();
  let next: MeetingMinute = { ...minute, processingStatus: to, updatedAt: now };

  if (to === 'processed') {
    const opening = minuteContentToPlainText(minute.content).split(/(?<=[.!?])\s/)[0] ?? '';
    liveSummaries.set(attemptId, opening);
    runSources.set(attemptId, minute.content);
    next = { ...next, processedAt: now, processingError: null };
  }
  if (to === 'failed') {
    next = {
      ...next,
      processingError: { code: 'provider_unavailable', occurredAt: now, retryable: true },
    };
  }

  minutes = minutes.map((item) => (item.id === minuteId ? next : item));

  if (to === 'processed' || to === 'failed') {
    // `REQ-MTG-022`: the creator is told, wherever they are in the product.
    // The notice names the minute, which they wrote, and carries none of its
    // content.
    addMockNotification({
      recipientUserId: minute.createdBy.userId,
      type: to === 'processed' ? 'meeting_minute_processed' : 'meeting_minute_failed',
      title:
        to === 'processed' ? 'Task generation finished' : 'Task generation failed',
      body:
        to === 'processed'
          ? 'Open the meeting minute to see what task generation produced.'
          : 'Your meeting minute is saved. You can retry task generation from the minute.',
      href: `/meeting-minutes/${minuteId}`,
      relatedLabel: minute.title,
    });
  }
}

function scheduleRun(minuteId: string, attemptId: string): void {
  const outcome = currentWorkerOutcome();
  const start = setTimeout(() => {
    workerTimers.delete(start);
    advanceRun(minuteId, attemptId, 'processing');
  }, workerTiming.startAfterMs);
  const finish = setTimeout(() => {
    workerTimers.delete(finish);
    advanceRun(minuteId, attemptId, outcome === 'fail' ? 'failed' : 'processed');
  }, workerTiming.finishAfterMs);
  workerTimers.add(start);
  workerTimers.add(finish);
}

/** Retry outcomes, so repeating the same request returns the first one. */
const retriedByKey = new Map<string, string>();

/** Later requests to start processing, by idempotency key (`FE-1131`). */
const requestedByKey = new Map<string, string>();

/**
 * The outcome of a save, as the form reads it (`REQ-MTG-007`-`REQ-MTG-009`).
 *
 * `processingStarted` is derived from the stored status rather than from the
 * user's choice, which is the whole point: a minute whose job could not be
 * queued asked for AI and did not get it, and the screen must not report that
 * as started. The warning rides along so a repeat of the same idempotent save
 * tells the same story as the first one.
 */
async function savedView(
  viewer: Account,
  minute: MeetingMinute,
): Promise<{ readonly data: MeetingMinuteSavedView; readonly warnings: readonly ResultWarning[] }> {
  const processingStarted = minute.processWithAi && minute.processingStatus === 'pending';
  return {
    data: { minute: await toDetailView(viewer, minute), processingStarted },
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

/**
 * The AI interpretation for a minute, if a successful run produced one
 * (`FE-1122`, `REQ-MTG-016`).
 *
 * Only a `processed` minute has one, and only from its **latest** attempt: a
 * summary from an earlier run describes a reading that was superseded. It
 * needs no authorization of its own, because it is derived from nothing but
 * the minute content the viewer has already been allowed to read; that is
 * also why it is a plain value and has no restricted variant.
 */
function interpretationFor(minute: MeetingMinute): MeetingMinuteDetailView['interpretation'] {
  if (minute.processingStatus !== 'processed' || minute.latestAttemptId === null) return null;
  const attemptId = minute.latestAttemptId;

  const seeded = MEETING_SUMMARIES.find((item) => item.attemptId === attemptId)?.text;
  const summary = seeded ?? liveSummaries.get(attemptId);
  if (summary === undefined) return null;

  const decisions = EXTRACTED_DECISIONS.filter((item) => item.attemptId === attemptId)
    .sort((a, b) => a.position - b.position)
    .map((item) => ({ id: item.id, position: item.position, text: item.text }));

  // Compared as text, so a formatting-only round trip through the editor is
  // not mistaken for a change of substance.
  const source = runSources.get(attemptId);
  const basedOnEarlierContent =
    source !== undefined &&
    minuteContentToPlainText(source) !== minuteContentToPlainText(minute.content);

  return { summary, decisions, basedOnEarlierContent };
}

function processingView(minute: MeetingMinute): MeetingMinuteDetailView['processing'] {
  return {
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
    attemptCount: attemptNumberOf(minute.latestAttemptId),
    latestAttemptId: minute.latestAttemptId,
  };
}

async function toDetailView(viewer: Account, minute: MeetingMinute): Promise<MeetingMinuteDetailView> {
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
    processing: processingView(minute),
    interpretation: interpretationFor(minute),
    generatedTasks: await generatedTasksFor(viewer, minute),
    // Only for the run whose tasks are shown; a run that has not finished has
    // dropped nothing yet.
    duplicateProposalCount:
      minute.processingStatus === 'processed' && minute.latestAttemptId
        ? (DUPLICATE_PROPOSALS[minute.latestAttemptId] ?? 0)
        : 0,
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
  | 'requestProcessing'
  | 'retryProcessing'
  | 'getProcessingSnapshot'
  | 'openGeneratedTask'
  | 'getTaskSourceMinute'
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
        const repeat = await savedView(viewer, existing);
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
    // Queued, so the background run begins; the save does not wait for it.
    if (queued && saved.latestAttemptId) scheduleRun(saved.id, saved.latestAttemptId);

    const outcome = await savedView(viewer, saved);
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

    return success(await toDetailView(viewer, minute));
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

    return success(await toDetailView(viewer, updated));
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
      if (archived && canRead(viewer, archived)) return success(await toDetailView(viewer, archived));
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

    return success(await toDetailView(viewer, archived));
  },


  /**
   * Starts task generation for a minute saved without it (`FE-1131`).
   *
   * Refused like every change to an existing minute: unreadable is not found,
   * not allowed is denied, and — as conflicts — archived, no longer Not
   * Processed, or a stale version. Only `not_processed → pending` is legal
   * here (`MINUTE_PROCESSING_TRANSITIONS`); a failed run is retried instead.
   */
  async requestProcessing(userId, input: RequestProcessingInput): Promise<Result<MeetingMinuteDetailView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${input.minuteId}`, 'Sign in to start task generation.');

    const already = requestedByKey.get(input.idempotencyKey);
    if (already) {
      const requested = minutes.find((item) => item.id === already);
      if (requested && canRead(viewer, requested)) return success(await toDetailView(viewer, requested));
    }

    const gate = gateChange(viewer, input.minuteId);
    if (gate.kind === 'not_found') return MINUTE_NOT_FOUND;
    if (gate.kind === 'denied') return CHANGE_DENIED;
    if (gate.kind === 'archived') return ARCHIVED_CONFLICT;

    const { minute } = gate;
    if (minute.version !== input.expectedVersion) return STALE_VERSION_CONFLICT;
    if (minute.processingStatus !== 'not_processed') {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'Task generation has already been requested for this minute.',
        guidance: 'Reload the minute to see where it stands. A failed run is retried, not requested again.',
      };
    }

    const attemptId = `att-${minute.id.slice(4)}-1`;
    const now = nowTimestamp();
    const requested: MeetingMinute = {
      ...minute,
      processWithAi: true,
      processingStatus: 'pending',
      latestAttemptId: attemptId,
      version: minute.version + 1,
      updatedAt: now,
      updatedBy: { userId: viewer.userId, displayName: viewer.fullName },
    };
    minutes = minutes.map((item) => (item.id === requested.id ? requested : item));
    requestedByKey.set(input.idempotencyKey, requested.id);
    scheduleRun(requested.id, attemptId);

    return success(await toDetailView(viewer, requested));
  },

  /**
   * Retries a failed run (`FE-1125`, `REQ-MTG-017`).
   *
   * Refused, in this order: a minute the viewer cannot read is not found; one
   * they may not change is denied; and each of these is a conflict, because
   * the minute is readable and the viewer entitled, but its state does not
   * allow the move — archived, not currently failed, a failure a retry cannot
   * fix, or a `failedAttemptId` that is no longer the latest run. That last
   * one is what stops a stale page, or a second tab, starting a second run
   * (`REQ-MTG-023`).
   */
  async retryProcessing(userId, input: RetryProcessingInput): Promise<Result<MeetingMinuteDetailView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${input.minuteId}`, 'Sign in to retry task generation.');

    // A repeat of the same request returns the first outcome.
    const already = retriedByKey.get(input.idempotencyKey);
    if (already) {
      const retried = minutes.find((item) => item.id === already);
      if (retried && canRead(viewer, retried)) return success(await toDetailView(viewer, retried));
    }

    const gate = gateChange(viewer, input.minuteId);
    if (gate.kind === 'not_found') return MINUTE_NOT_FOUND;
    if (gate.kind === 'denied') return CHANGE_DENIED;
    if (gate.kind === 'archived') return ARCHIVED_CONFLICT;

    const { minute } = gate;
    if (minute.processingStatus !== 'failed') {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'Task generation is not in a failed state.',
        guidance: 'Reload the minute to see its current status. A run that is queued, running or finished does not need a retry.',
      };
    }
    if (!minute.processingError?.retryable) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'Retrying would not fix this failure.',
        guidance: 'The minute is saved. Ask an administrator to look into the failure before trying again.',
      };
    }
    if (minute.latestAttemptId !== input.failedAttemptId) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'This run has already been retried.',
        guidance: 'Reload the minute to see the current run.',
      };
    }

    const attemptId = `att-${minute.id.slice(4)}-${attemptNumberOf(minute.latestAttemptId) + 1}`;
    const now = nowTimestamp();
    const retried: MeetingMinute = {
      ...minute,
      processingStatus: 'pending',
      processingError: null,
      latestAttemptId: attemptId,
      version: minute.version + 1,
      updatedAt: now,
      updatedBy: { userId: viewer.userId, displayName: viewer.fullName },
    };
    minutes = minutes.map((item) => (item.id === retried.id ? retried : item));
    retriedByKey.set(input.idempotencyKey, retried.id);
    scheduleRun(retried.id, attemptId);

    return success(await toDetailView(viewer, retried));
  },

  /**
   * A light read of where processing stands (`FE-1126`), for polling while a
   * run is queued or running. Same scope as `get`: not found hides existence.
   */
  async getProcessingSnapshot(userId, minuteId): Promise<Result<MinuteProcessingSnapshotView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${minuteId}`, 'Sign in to see this meeting minute.');

    const minute = minutes.find((item) => item.id === minuteId);
    if (!minute || !canRead(viewer, minute)) return MINUTE_NOT_FOUND;

    return success({
      minuteId: minute.id,
      processing: processingView(minute),
      // About a minute the viewer can read, so an authorized count
      // (`AUTHORIZED_COUNT_FIELDS`); restricted tasks are counted, not named.
      generatedTaskCount: GENERATED_TASK_LINKS.filter((link) => link.minuteId === minute.id).length,
      actions: actionsFor(viewer, minute),
    });
  },

  /**
   * Resolves a generated task from its minute (`FE-1123`).
   *
   * Not found unless the viewer can read the minute, the link belongs to it,
   * **and** the task page would open the task for them — so following the
   * link never lands anywhere this answer did not promise.
   */
  async openGeneratedTask(userId, minuteId, linkId): Promise<Result<OpenTaskTargetView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/meeting-minutes/${minuteId}`, 'Sign in to open this task.');

    const minute = minutes.find((item) => item.id === minuteId);
    const link = GENERATED_TASK_LINKS.find((item) => item.id === linkId && item.minuteId === minuteId);
    if (!minute || !canRead(viewer, minute) || !link || !canOpenTask(viewer, link.taskId)) {
      return { status: 'not_found', code: 'NOT_FOUND', message: 'That task could not be found.', resource: 'task' };
    }
    return success({ taskId: link.taskId, href: `/tasks/${link.taskId}` });
  },

  /**
   * The reverse link, for a task's own page (`FE-1124`, `AC-MTG-010`).
   *
   * Not found when the viewer cannot open the task — its origin is not news
   * about a task they cannot see — and when the task has no source minute,
   * which is how an ordinary task is recognised. When they can open the task
   * but not its minute, the answer is `restricted`: it says a minute exists
   * and names nothing about it.
   */
  async getTaskSourceMinute(userId, taskId): Promise<Result<TaskSourceMinuteView>> {
    await delay();
    const viewer = findAccountByUserId(userId);
    if (!viewer) return notSignedIn(`/tasks/${taskId}`, 'Sign in to see this task.');

    const notFound = {
      status: 'not_found',
      code: 'NOT_FOUND',
      message: 'This task has no source meeting minute.',
      resource: 'task_source',
    } as const;

    if (!canOpenTask(viewer, taskId)) return notFound;
    const link = GENERATED_TASK_LINKS.find((item) => item.taskId === taskId);
    if (!link) return notFound;

    const minute = minutes.find((item) => item.id === link.minuteId);
    if (!minute || !canRead(viewer, minute)) return success({ access: 'restricted' });

    return success({
      access: 'visible',
      minuteId: minute.id,
      title: minute.title,
      isArchived: minute.archivedAt !== null,
      href: `/meeting-minutes/${minute.id}`,
    });
  },
};
