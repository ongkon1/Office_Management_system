/**
 * `FE-1103` — Meeting Minutes and AI task generation contracts.
 *
 * A meeting minute is a human record of a client meeting. Optionally, a
 * background job reads it and proposes tasks. Three things are kept apart on
 * purpose, because blurring them is how the module would go wrong:
 *
 * - **The human minute** is the record of truth. It is saved before AI is ever
 *   considered and is never rolled back by a processing failure
 *   (`REQ-MTG-007`).
 * - **The AI interpretation** — summary, decisions, proposed tasks — belongs to
 *   one processing attempt and is shown separately from the minute
 *   (`REQ-MTG-016`, `FE-1122`).
 * - **Protected diagnostics** — prompts, raw responses, provider and model
 *   identifiers, idempotency keys, match scores — are not modelled here at all.
 *   They live only behind separately authorized, audited diagnostics
 *   (`REQ-MTG-019`, `BE-1304`), so no view model in this file can carry them.
 *
 * Models are `FE-1103`; service operations (`MeetingMinutesService`) are
 * `FE-1104`; the guards proving nothing protected reaches an ordinary model
 * (`ProtectedKeysIn`, `findProtectedMeetingMinuteFields`) are `FE-1105`.
 */

import type {
  ActorRef,
  AuditableRecord,
  IsoDate,
  IsoDateTime,
  Priority,
  TaskStatus,
} from './domain';
import type { DateRange, ListQuery, Paginated, SortParams } from './query';
import type { Failure, Result } from './results';
import type { IdempotentInput } from './services';

/* ------------------------------------------------------------------------- */
/* Client                                                                    */
/* ------------------------------------------------------------------------- */

export type ClientStatus = 'active' | 'inactive';

/**
 * A first-class client (`REQ-MTG-005`, `BE-1301`).
 *
 * Until now a client was only a free-text label on a project
 * (`Project.client`), and `src/lib/client-time.ts` still reads that label.
 * Meeting Minutes needs a stable identity to filter by and to constrain the
 * project picker, so the record is introduced here without removing the label:
 * historical projects and reports keep reading `Project.client` until the
 * backend migration maps every label (`BE-1302`).
 *
 * A client carries no scope of its own. Whether a viewer may see it is derived
 * from the projects they may see, so a client whose only projects are
 * government projects never appears — not as an option, a filter chip, or a
 * count — to a viewer without that permission.
 */
export interface Client extends AuditableRecord {
  readonly id: string;
  readonly name: string;
  readonly status: ClientStatus;
  /**
   * Free-text project labels this client was matched from during migration.
   * Kept so a report grouped by the old label can still be reconciled.
   */
  readonly legacyLabels: readonly string[];
}

/** A client as another record points at it. */
export interface ClientRef {
  readonly id: string;
  readonly name: string;
}

/**
 * How a project relates to a client during the migration (`BE-1302`).
 *
 * `unresolved` is a legacy label nobody has mapped yet. Such a project cannot
 * be chosen for a new minute — the client-to-project rule has nothing to check
 * against — but its label is preserved for review rather than discarded.
 */
export type ProjectClientLink =
  | { readonly state: 'linked'; readonly projectId: string; readonly clientId: string }
  | { readonly state: 'unresolved'; readonly projectId: string; readonly legacyLabel: string }
  | { readonly state: 'none'; readonly projectId: string };

/* ------------------------------------------------------------------------- */
/* Processing status                                                         */
/* ------------------------------------------------------------------------- */

/**
 * Where a minute's AI processing stands (`REQ-MTG-008`–`REQ-MTG-010`,
 * `REQ-MTG-017`).
 *
 * `not_processed` means AI was never requested — not "waiting". A minute saved
 * without AI stays here permanently unless someone later requests processing.
 */
export type MinuteProcessingStatus =
  | 'not_processed'
  | 'pending'
  | 'processing'
  | 'processed'
  | 'failed';

export const MINUTE_PROCESSING_STATUSES: readonly MinuteProcessingStatus[] = [
  'not_processed',
  'pending',
  'processing',
  'processed',
  'failed',
];

/**
 * Every legal status move, as data.
 *
 * - `not_processed → pending`: processing requested after saving without it.
 * - `pending → failed`: the job could not even be enqueued (`REQ-MTG-007`).
 * - `failed → pending`: an authorized retry (`REQ-MTG-017`).
 *
 * `processed` is terminal. Re-running a successful minute would propose a
 * second set of tasks against the same meeting, which is exactly the duplicate
 * `REQ-MTG-023` forbids; no requirement asks for it.
 */
export const MINUTE_PROCESSING_TRANSITIONS: readonly {
  readonly from: MinuteProcessingStatus;
  readonly to: MinuteProcessingStatus;
}[] = [
  { from: 'not_processed', to: 'pending' },
  { from: 'pending', to: 'processing' },
  { from: 'pending', to: 'failed' },
  { from: 'processing', to: 'processed' },
  { from: 'processing', to: 'failed' },
  { from: 'failed', to: 'pending' },
];

export function canChangeProcessingStatus(
  from: MinuteProcessingStatus,
  to: MinuteProcessingStatus,
): boolean {
  return MINUTE_PROCESSING_TRANSITIONS.some((rule) => rule.from === from && rule.to === to);
}

/** Work is queued or running, so the view should expect a later change. */
export function isProcessingInFlight(status: MinuteProcessingStatus): boolean {
  return status === 'pending' || status === 'processing';
}

/* ------------------------------------------------------------------------- */
/* Safe processing error                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Why processing failed, as a closed set (`REQ-MTG-017`).
 *
 * There is deliberately **no free-text message field**. A provider's own error
 * text can echo the prompt, the minute's content or internal identifiers; if
 * the type had a `message: string`, something would eventually copy that text
 * into it. The user-facing wording comes only from
 * `SAFE_PROCESSING_ERROR_MESSAGE`, keyed by code.
 */
export type SafeProcessingErrorCode =
  | 'queue_unavailable'
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'invalid_response'
  | 'assignment_failed'
  | 'save_failed';

export interface SafeProcessingError {
  readonly code: SafeProcessingErrorCode;
  readonly occurredAt: IsoDateTime;
  /**
   * Whether the failure is of a kind a retry can fix. Whether *this viewer*
   * may retry is a separate, service-decided action flag.
   */
  readonly retryable: boolean;
}

export const SAFE_PROCESSING_ERROR_MESSAGE: Readonly<Record<SafeProcessingErrorCode, string>> = {
  queue_unavailable: 'Processing could not be started. Your meeting minute was saved.',
  provider_unavailable: 'The AI service was unavailable. Your meeting minute was saved.',
  provider_timeout: 'The AI service took too long to respond. Your meeting minute was saved.',
  invalid_response: 'The AI response could not be used, so no tasks were created. Your meeting minute was saved.',
  assignment_failed: 'Tasks could not be matched to the team, so none were created. Your meeting minute was saved.',
  save_failed: 'Generated tasks could not be saved, so none were created. Your meeting minute was saved.',
};

/* ------------------------------------------------------------------------- */
/* Meeting minute                                                            */
/* ------------------------------------------------------------------------- */

/**
 * Minute content after sanitization (`REQ-MTG-006`).
 *
 * Only the service produces this value, and only from content it has
 * sanitized; the UI renders it and never builds it from raw input.
 */
export type SanitizedMinuteContent = string;

/** The stored minute (`BE-1303`). */
export interface MeetingMinute extends AuditableRecord {
  readonly id: string;
  readonly title: string;
  readonly clientId: string;
  readonly projectId: string;
  /** The project's division, held for record-level scope (`REQ-MTG-001`). */
  readonly divisionId: string;
  readonly content: SanitizedMinuteContent;
  /** The creator's choice at save time. */
  readonly processWithAi: boolean;
  readonly processingStatus: MinuteProcessingStatus;
  /** Set only while `processingStatus` is `failed`. */
  readonly processingError: SafeProcessingError | null;
  /** Set only once processing has succeeded; never for a minute without AI. */
  readonly processedAt: IsoDateTime | null;
  readonly latestAttemptId: string | null;
  /** Archive, never delete, once anything references the minute (`REQ-MTG-018`). */
  readonly archivedAt: IsoDateTime | null;
  readonly archivedBy: ActorRef | null;
  /** Optimistic-concurrency version; an edit against a stale one conflicts. */
  readonly version: number;
}

/* ------------------------------------------------------------------------- */
/* Processing attempt                                                        */
/* ------------------------------------------------------------------------- */

export type ProcessingAttemptStatus = Exclude<MinuteProcessingStatus, 'not_processed'>;

export type ProcessingAttemptTrigger = 'on_save' | 'requested_later' | 'retry';

/**
 * One independently identifiable run (`REQ-MTG-023`, `BE-1304`).
 *
 * The frontend sees an attempt's outcome, not its machinery: the idempotency
 * key, correlation id, provider, schema and model identifiers and the raw
 * response reference are protected diagnostics and are absent here.
 */
export interface ProcessingAttempt {
  readonly id: string;
  readonly minuteId: string;
  /** 1 for the first run; each retry adds one. */
  readonly attemptNumber: number;
  readonly trigger: ProcessingAttemptTrigger;
  readonly status: ProcessingAttemptStatus;
  readonly requestedAt: IsoDateTime;
  readonly requestedBy: ActorRef;
  readonly startedAt: IsoDateTime | null;
  readonly finishedAt: IsoDateTime | null;
  readonly error: SafeProcessingError | null;
}

/* ------------------------------------------------------------------------- */
/* AI interpretation                                                         */
/* ------------------------------------------------------------------------- */

/** The meeting summary one successful attempt produced. */
export interface MeetingSummary {
  readonly minuteId: string;
  readonly attemptId: string;
  readonly text: string;
}

/** A decision the AI extracted — an interpretation, not part of the minute. */
export interface ExtractedDecision {
  readonly id: string;
  readonly minuteId: string;
  readonly attemptId: string;
  /** Order as extracted, starting at 1. */
  readonly position: number;
  readonly text: string;
}

/* ------------------------------------------------------------------------- */
/* Team match outcome                                                        */
/* ------------------------------------------------------------------------- */

/**
 * The criteria matching may rely on, in the order `REQ-MTG-013` applies them.
 * Named so the outcome is explainable; the scores behind them are protected
 * (`REQ-MTG-019`) and never appear here.
 */
export type TeamMatchBasis =
  | 'project_membership'
  | 'department'
  | 'role'
  | 'availability'
  | 'workload'
  | 'active_status';

export const TEAM_MATCH_BASIS_ORDER: readonly TeamMatchBasis[] = [
  'project_membership',
  'department',
  'role',
  'availability',
  'workload',
  'active_status',
];

/**
 * Why nobody was assigned (`REQ-MTG-014`, `AC-MTG-006`).
 *
 * `mentioned_person_ineligible` covers a name the minute mentioned that is
 * inactive, unavailable, unauthorized or outside the project. It deliberately
 * does not say which, and carries no employee reference: the viewer may not be
 * entitled to learn anything about that person.
 */
export type UnassignedReason = 'no_eligible_candidate' | 'mentioned_person_ineligible';

/**
 * How a generated task's first assignee was chosen, fixed at generation.
 *
 * Reassigning the task later does not rewrite this. The current assignee lives
 * on the task; comparing the two is how a reader tells an automatic assignment
 * from a later human decision (`BE-1306`).
 */
export type TeamMatchOutcome =
  | { readonly kind: 'mentioned_assignee'; readonly employeeId: string }
  | {
      readonly kind: 'matched';
      readonly employeeId: string;
      /** The criteria that decided it, in `TEAM_MATCH_BASIS_ORDER`. */
      readonly basis: readonly TeamMatchBasis[];
    }
  | { readonly kind: 'unassigned'; readonly reason: UnassignedReason };

/* ------------------------------------------------------------------------- */
/* Generated-task link                                                       */
/* ------------------------------------------------------------------------- */

/** Where a task came from. Absent means an ordinary, human-created task. */
export type TaskOrigin = 'meeting_minute_ai';

/**
 * The status a generated task starts in.
 *
 * `REQ-MTG-015` says "Todo"; this product's stored status for work not yet
 * started is Pending (`TaskStatus`). A generated task is ordinary work and
 * follows the ordinary workflow, so there is no separate AI status.
 */
export const GENERATED_TASK_INITIAL_STATUS: TaskStatus = 'pending';

/**
 * The immutable link from a task to the minute and attempt that produced it
 * (`REQ-MTG-015`, `AC-MTG-010`).
 *
 * It survives reassignment of the task and archival of the minute, so both
 * directions of traceability keep working.
 */
export interface GeneratedTaskLink {
  readonly id: string;
  readonly taskId: string;
  readonly minuteId: string;
  readonly attemptId: string;
  readonly origin: TaskOrigin;
  /** The system generated the task; the minute's creator stays accountable. */
  readonly generatedBy: 'system';
  readonly minuteCreator: ActorRef;
  readonly matchOutcome: TeamMatchOutcome;
  /** Order as proposed, starting at 1. */
  readonly position: number;
  readonly createdAt: IsoDateTime;
}

/* ------------------------------------------------------------------------- */
/* View models                                                               */
/* ------------------------------------------------------------------------- */

/**
 * What the viewer may do to a minute, decided by the service.
 *
 * Employee and Management/View-Only receive all four as `false`
 * (`AC-MTG-001`). The UI
 * renders a control only when its flag is true and never re-derives the rule.
 */
export interface MinuteActionsView {
  readonly canEdit: boolean;
  readonly canArchive: boolean;
  readonly canRequestProcessing: boolean;
  readonly canRetry: boolean;
}

export interface ProcessingStatusView {
  readonly status: MinuteProcessingStatus;
  readonly label: string;
}

/**
 * One row of the list (`REQ-MTG-002`, `FE-1110`).
 *
 * A row exists only for a minute the viewer may read, so nothing on it is
 * redactable — an unauthorized minute is simply not a row. There is no content
 * and no task count on a row.
 */
export interface MeetingMinuteSummaryView {
  readonly id: string;
  readonly title: string;
  readonly client: ClientRef;
  readonly projectName: string;
  readonly creatorName: string;
  readonly createdAt: IsoDateTime;
  readonly createdAtLabel: string;
  readonly aiRequested: boolean;
  /** `Yes` or `No`. */
  readonly aiRequestedLabel: string;
  readonly processing: ProcessingStatusView;
  readonly isArchived: boolean;
  readonly actions: MinuteActionsView;
  readonly href: string;
}

export interface SafeProcessingErrorView {
  readonly code: SafeProcessingErrorCode;
  /** Always taken from `SAFE_PROCESSING_ERROR_MESSAGE`. */
  readonly message: string;
  readonly occurredAtLabel: string;
  readonly retryable: boolean;
}

export interface ExtractedDecisionView {
  readonly id: string;
  readonly position: number;
  readonly text: string;
}

export interface TeamMatchOutcomeView {
  readonly kind: TeamMatchOutcome['kind'];
  /** e.g. `Mentioned in the minute`, `Matched on project membership`, `No eligible team member`. */
  readonly label: string;
}

/**
 * A generated task as the minute's detail page lists it (`REQ-MTG-016`,
 * `FE-1123`).
 *
 * The viewer can read the minute but may still be outside a particular task's
 * scope. That task keeps its place in the list — its existence follows from
 * the minute the viewer can already read — but the `restricted` variant
 * carries no title, assignee, dates or link.
 */
export type GeneratedTaskView =
  | {
      readonly access: 'visible';
      readonly linkId: string;
      readonly taskId: string;
      readonly position: number;
      readonly title: string;
      /** Null means unassigned; the UI shows `Unassigned`, never a blank. */
      readonly assigneeName: string | null;
      readonly priority: Priority;
      readonly priorityLabel: string;
      readonly dueDate: IsoDate | null;
      readonly dueDateLabel: string;
      readonly status: TaskStatus;
      readonly statusLabel: string;
      readonly matchOutcome: TeamMatchOutcomeView;
      /** True when the current assignee is no longer the generated one. */
      readonly reassignedSinceGeneration: boolean;
      readonly href: string;
    }
  | {
      readonly access: 'restricted';
      readonly linkId: string;
      readonly position: number;
    };

/** The minute's detail page (`REQ-MTG-016`, `FE-1120`). */
export interface MeetingMinuteDetailView {
  readonly id: string;
  readonly title: string;
  readonly client: ClientRef;
  readonly project: { readonly id: string; readonly name: string };
  readonly content: SanitizedMinuteContent;
  readonly creatorName: string;
  readonly createdAt: IsoDateTime;
  readonly createdAtLabel: string;
  readonly updatedAtLabel: string;
  readonly aiRequested: boolean;
  readonly aiRequestedLabel: string;
  readonly processing: ProcessingStatusView & {
    readonly processedAtLabel: string | null;
    readonly error: SafeProcessingErrorView | null;
    /** How many runs there have been; 0 when AI was never requested. */
    readonly attemptCount: number;
  };
  /**
   * The AI interpretation from the latest successful attempt. Null when there
   * is none, and shown apart from the human content (`FE-1122`).
   */
  readonly interpretation: {
    readonly summary: string;
    readonly decisions: readonly ExtractedDecisionView[];
  } | null;
  readonly generatedTasks: readonly GeneratedTaskView[];
  readonly archived: { readonly archivedAtLabel: string; readonly archivedByName: string } | null;
  readonly version: number;
  readonly actions: MinuteActionsView;
  readonly editHref: string;
}

/**
 * The source minute as a generated task's detail page shows it (`FE-1124`,
 * `AC-MTG-010`). `restricted` names no title, client or project.
 */
export type TaskSourceMinuteView =
  | { readonly access: 'visible'; readonly minuteId: string; readonly title: string; readonly isArchived: boolean; readonly href: string }
  | { readonly access: 'restricted' };

/* ------------------------------------------------------------------------- */
/* List query                                                                */
/* ------------------------------------------------------------------------- */

/**
 * List filters (`REQ-MTG-003`, `FE-1111`).
 *
 * As in `CommonFilters`, an absent field means "no constraint" and an empty
 * array means "no match". URL names are `client`, `project`, `processing`,
 * `from`/`to` and `archived` in `QUERY_PARAM_KEYS`.
 */
export interface MeetingMinuteFilters {
  readonly clientIds?: readonly string[];
  readonly projectIds?: readonly string[];
  readonly processingStatuses?: readonly MinuteProcessingStatus[];
  /** Created date in the business timezone, inclusive. */
  readonly createdDateRange?: DateRange;
  /** Archived minutes are left out unless this is `true`. */
  readonly includeArchived?: boolean;
}

export type MeetingMinuteSortField = 'createdAt' | 'title' | 'client' | 'project' | 'processingStatus';

export const DEFAULT_MEETING_MINUTE_SORT: SortParams<MeetingMinuteSortField> = {
  field: 'createdAt',
  direction: 'desc',
};

/** `search.term` matches title, client and project names — never content. */
export type MeetingMinuteListQuery = ListQuery<MeetingMinuteFilters, MeetingMinuteSortField>;

/**
 * One page of the list.
 *
 * Every number and option in it is computed **after** authorization
 * (`REQ-MTG-003`, `AC-MTG-009`): `pageInfo.totalItems`, the client options and
 * the project options cover only what the viewer may see.
 */
export interface MeetingMinuteListView {
  readonly page: Paginated<MeetingMinuteSummaryView>;
  /**
   * The filters actually applied. A value the viewer cannot use — a project
   * outside their scope, an unknown client — is dropped here without comment,
   * so the screen rewrites its URL from this rather than from what it sent.
   */
  readonly appliedFilters: MeetingMinuteFilters;
  readonly clientOptions: readonly ClientRef[];
  /** Every project the viewer may see that is linked to a client (`FE-1111`). */
  readonly projectOptions: readonly MeetingMinuteProjectFilterOption[];
  readonly canCreate: boolean;
}

/* ------------------------------------------------------------------------- */
/* Form input and context                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Field limits, provisional until the backend fixes them (`BE-1311`). Held here
 * so the form, the mock service and the future server validate against one
 * number.
 */
export const MEETING_MINUTE_LIMITS = {
  titleMaxLength: 200,
  contentMaxLength: 50_000,
} as const;

/** Field paths used in `FieldError.field` and for focus. */
export type MeetingMinuteField = 'title' | 'clientId' | 'projectId' | 'content';

/**
 * Validation codes (`FE-1114`). Every one reaches the form as a `FieldError`
 * with a message and corrective guidance (`REQ-TIME-025`).
 *
 * There is no "unsafe content" code: markup is sanitized, not rejected
 * (`REQ-MTG-006`). `CONTENT_EMPTY_AFTER_SANITIZING` covers content that was
 * nothing but removed markup.
 */
export type MeetingMinuteValidationCode =
  | 'REQUIRED'
  | 'TOO_LONG'
  | 'CLIENT_INACTIVE'
  | 'PROJECT_INACTIVE'
  | 'PROJECT_NOT_FOR_CLIENT'
  | 'CONTENT_EMPTY_AFTER_SANITIZING';

/**
 * The editable fields, as the form holds them.
 *
 * `content` is the user's raw input. It becomes `SanitizedMinuteContent` only
 * inside the service.
 */
export interface MeetingMinuteFields {
  readonly title: string;
  readonly clientId: string;
  readonly projectId: string;
  readonly content: string;
}

export interface CreateMeetingMinuteInput extends MeetingMinuteFields, IdempotentInput {
  readonly processWithAi: boolean;
}

/**
 * An edit. There is no `processWithAi`: editing never starts, repeats or
 * cancels processing — `requestProcessing` and `retryProcessing` do.
 */
export interface UpdateMeetingMinuteInput extends MeetingMinuteFields {
  readonly minuteId: string;
  /** The version the form loaded; a newer stored version is a conflict. */
  readonly expectedVersion: number;
}

export interface ArchiveMeetingMinuteInput extends IdempotentInput {
  readonly minuteId: string;
  readonly expectedVersion: number;
}

export interface RequestProcessingInput extends IdempotentInput {
  readonly minuteId: string;
  readonly expectedVersion: number;
}

export interface RetryProcessingInput extends IdempotentInput {
  readonly minuteId: string;
  /** The failed attempt being retried; a stale id is a conflict. */
  readonly failedAttemptId: string;
}

/** An active, authorized project offered for the chosen client. */
export interface MeetingMinuteProjectOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
}

/**
 * A project offered as a list filter (`FE-1111`).
 *
 * Unlike `MeetingMinuteProjectOption`, which the form restricts to active
 * projects, a filter also offers inactive ones: older minutes still belong to
 * them and must stay findable. `clientId` is what makes the project filter
 * depend on the client filter.
 */
export interface MeetingMinuteProjectFilterOption {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly clientId: string;
  readonly isActive: boolean;
}

/** What the Add form needs before the user types (`FE-1113`). */
export interface MeetingMinuteCreateContextView {
  /** Active clients with at least one active project the viewer may use. */
  readonly clients: readonly ClientRef[];
  readonly limits: typeof MEETING_MINUTE_LIMITS;
}

/** What the Edit form loads (`FE-1116`). */
export interface MeetingMinuteEditContextView {
  readonly minuteId: string;
  readonly version: number;
  readonly values: MeetingMinuteFields;
  readonly clients: readonly ClientRef[];
  /** Projects for `values.clientId`, so the form opens already populated. */
  readonly projects: readonly MeetingMinuteProjectOption[];
  readonly limits: typeof MEETING_MINUTE_LIMITS;
  readonly canArchive: boolean;
}

/**
 * The outcome of a save. `processingStarted` is false when AI was not
 * requested, and also when it was requested but could not be queued — the
 * minute is saved either way (`REQ-MTG-007`) and the detail's status says which.
 */
export interface MeetingMinuteSavedView {
  readonly minute: MeetingMinuteDetailView;
  readonly processingStarted: boolean;
}

/** A light read for refreshing status without reloading the whole page (`FE-1126`). */
export interface MinuteProcessingSnapshotView {
  readonly minuteId: string;
  readonly processing: MeetingMinuteDetailView['processing'];
  readonly generatedTaskCount: number;
  readonly actions: MinuteActionsView;
}

/** Where to go to open a generated task, after the service checked scope. */
export interface OpenTaskTargetView {
  readonly taskId: string;
  readonly href: string;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

/**
 * Meeting Minutes operations (`FE-1104`).
 *
 * Every call names the viewer and returns a `Result`; nothing throws. The rules
 * each implementation — mock or MySQL — must keep:
 *
 * - **Not found hides existence.** A minute, attempt, link or task the viewer
 *   cannot read returns `not_found`, exactly as a nonexistent one does
 *   (`AC-MTG-009`, `AC-AUTH-004`). `permission_denied` is returned only when
 *   the viewer can already read the record, or for the create operations,
 *   which reveal nothing.
 * - **Employee and Management/View-Only mutate nothing.** Every write, and
 *   `createContext`, returns `permission_denied` for those roles
 *   (`AC-MTG-001`).
 * - **Concurrency is a conflict.** A stale `expectedVersion` or
 *   `failedAttemptId`, an archived minute, or a processing status that does not
 *   allow the move returns `conflict` with guidance.
 * - **Idempotent writes.** Repeating a call with the same `idempotencyKey`
 *   returns the first outcome and creates no second minute, attempt or task
 *   set (`REQ-MTG-023`).
 * - **No protected data.** No result carries prompts, raw AI output, provider
 *   or model identifiers, match scores or diagnostics (`REQ-MTG-019`,
 *   `FE-1105`).
 */
export interface MeetingMinutesService {
  /** Authorized list, search and filters (`REQ-MTG-002`, `REQ-MTG-003`). */
  list(userId: string, query: MeetingMinuteListQuery): Promise<Result<MeetingMinuteListView>>;
  /** Detail, including processing status and generated tasks (`REQ-MTG-016`). */
  get(userId: string, minuteId: string): Promise<Result<MeetingMinuteDetailView>>;

  createContext(userId: string): Promise<Result<MeetingMinuteCreateContextView>>;
  /**
   * Active, authorized projects for one client (`REQ-MTG-005`). An inactive or
   * invisible client returns an empty list, not an error.
   */
  listProjectOptions(
    userId: string,
    clientId: string,
  ): Promise<Result<readonly MeetingMinuteProjectOption[]>>;
  /**
   * Saves the minute first, then — only if `processWithAi` — records a Pending
   * attempt and queues it, without waiting for AI (`REQ-MTG-007`–`REQ-MTG-009`).
   * A queueing failure still succeeds, with a `PROCESSING_NOT_STARTED` warning.
   */
  create(userId: string, input: CreateMeetingMinuteInput): Promise<Result<MeetingMinuteSavedView>>;

  editContext(userId: string, minuteId: string): Promise<Result<MeetingMinuteEditContextView>>;
  update(userId: string, input: UpdateMeetingMinuteInput): Promise<Result<MeetingMinuteDetailView>>;
  /** Archives; never deletes, and generated tasks keep their link (`REQ-MTG-018`). */
  archive(userId: string, input: ArchiveMeetingMinuteInput): Promise<Result<MeetingMinuteDetailView>>;

  /** Starts processing for a minute saved without AI; only from `not_processed`. */
  requestProcessing(userId: string, input: RequestProcessingInput): Promise<Result<MeetingMinuteDetailView>>;
  /** Retries a failed attempt; only from `failed` and only when `retryable` (`REQ-MTG-017`). */
  retryProcessing(userId: string, input: RetryProcessingInput): Promise<Result<MeetingMinuteDetailView>>;
  getProcessingSnapshot(userId: string, minuteId: string): Promise<Result<MinuteProcessingSnapshotView>>;

  /** Resolves a generated task from its minute, checking task scope (`REQ-MTG-016`). */
  openGeneratedTask(userId: string, minuteId: string, linkId: string): Promise<Result<OpenTaskTargetView>>;
  /**
   * The reverse link, for a task's detail page (`FE-1124`, `AC-MTG-010`).
   * A task with no source minute returns `not_found`; a source minute outside
   * the viewer's scope returns the `restricted` view.
   */
  getTaskSourceMinute(userId: string, taskId: string): Promise<Result<TaskSourceMinuteView>>;
}

export type MeetingMinutesOperation = keyof MeetingMinutesService;

/** Warning codes a successful Meeting Minutes result may carry. */
export type MeetingMinuteWarningCode = 'PROCESSING_NOT_STARTED';

/**
 * The failures each operation may return, as data, so a mock, the MySQL
 * adapter and their tests are held to the same promise. `unauthenticated` and
 * `error` are possible everywhere and are listed once in
 * `MEETING_MINUTE_UNIVERSAL_FAILURES`.
 *
 * The rule the table exists to enforce: an operation that looks up a record by
 * id before the viewer is known to be able to read it lists `not_found`, and
 * the read-only lookups never list `permission_denied`.
 */
export const MEETING_MINUTE_UNIVERSAL_FAILURES: readonly Failure['status'][] = ['unauthenticated', 'error'];

export const MEETING_MINUTE_OPERATION_FAILURES: Readonly<
  Record<MeetingMinutesOperation, readonly Failure['status'][]>
> = {
  list: ['validation_failure'],
  get: ['not_found'],
  createContext: ['permission_denied'],
  listProjectOptions: ['permission_denied'],
  create: ['validation_failure', 'permission_denied'],
  editContext: ['not_found', 'permission_denied', 'conflict'],
  update: ['validation_failure', 'not_found', 'permission_denied', 'conflict'],
  archive: ['not_found', 'permission_denied', 'conflict'],
  requestProcessing: ['not_found', 'permission_denied', 'conflict'],
  retryProcessing: ['not_found', 'permission_denied', 'conflict'],
  getProcessingSnapshot: ['not_found'],
  openGeneratedTask: ['not_found'],
  getTaskSourceMinute: ['not_found'],
};

/* ------------------------------------------------------------------------- */
/* Protected-field guards                                                    */
/* ------------------------------------------------------------------------- */

/*
 * `FE-1105` — nothing protected in an ordinary model.
 *
 * `REQ-MTG-019` makes prompts, raw AI output, provider diagnostics and match
 * internals sensitive operational data, and `AC-MTG-009` forbids revealing
 * minutes through counts. Leaving those fields out of the types above is the
 * first control. The two guards below keep it that way as the module grows:
 *
 * - `ProtectedKeysIn<T>` fails at **compile time**. It walks every property
 *   name in a view model, however deeply nested, and resolves to the offending
 *   names. `meeting-minutes.test.ts` asserts it is `never` for every view model
 *   and for the success data of every `MeetingMinutesService` operation.
 * - `findProtectedMeetingMinuteFields` fails at **run time**. Types say nothing
 *   about what an implementation actually puts in an object, and a spread of a
 *   stored record or a provider response adds keys the type never declared. The
 *   mock service tests (`FE-1131`) and the backend contract tests (`BE-1343`)
 *   run it over real payloads.
 *
 * Both match on names, so they catch the field, not the intent: a protected
 * value copied into an innocently named string is caught only by the review
 * and redaction tests that own that path.
 */

/**
 * Name fragments that mark a protected field, lower-cased. A key matches when
 * its lower-cased form starts with a `prefix`, contains a `fragment`, or equals
 * an `exact` name.
 */
export const PROTECTED_FIELD_PATTERNS = {
  prefixes: ['raw'],
  fragments: [
    'prompt',
    'diagnostic',
    'provider',
    'score',
    'confidence',
    'candidate',
    'idempotency',
    'correlation',
    'stacktrace',
    'fingerprint',
    'matchevidence',
  ],
  exact: ['model', 'modelid', 'modelname', 'modelversion', 'schemaversion'],
} as const;

/**
 * The only count fields an ordinary Meeting Minutes model may carry, each
 * computed after authorization:
 *
 * - `totalItems`, `totalPages`: the viewer's own filtered list (`Paginated`).
 * - `attemptCount`, `generatedTaskCount`: about a minute the viewer can read.
 *
 * Any other `…Count` or `total…` field is treated as a potential leak until it
 * is reviewed and added here.
 */
export const AUTHORIZED_COUNT_FIELDS = [
  'totalItems',
  'totalPages',
  'attemptCount',
  'generatedTaskCount',
] as const;

/*
 * Checked one key at a time. `K extends string ? … : never` distributes over a
 * union of keys; testing `Lowercase<K>` directly would test the whole union at
 * once, which no pattern matches, and silently report every model as clean.
 */
type ProtectedName<K> = K extends string
  ? Lowercase<K> extends
      | `${(typeof PROTECTED_FIELD_PATTERNS.prefixes)[number]}${string}`
      | `${string}${(typeof PROTECTED_FIELD_PATTERNS.fragments)[number]}${string}`
      | (typeof PROTECTED_FIELD_PATTERNS.exact)[number]
    ? K
    : K extends (typeof AUTHORIZED_COUNT_FIELDS)[number]
      ? never
      : Lowercase<K> extends `${string}count` | `total${string}`
        ? K
        : never
  : never;

/** Every property name in `T`, through nested objects, arrays and unions. */
type DeepKeys<T> = T extends readonly (infer Item)[]
  ? DeepKeys<Item>
  : T extends object
    ? { [K in keyof T & string]: K | DeepKeys<T[K]> }[keyof T & string]
    : never;

/**
 * The protected property names found anywhere in `T`; `never` when `T` is
 * clean. Use as `expectTypeOf<ProtectedKeysIn<View>>().toBeNever()`.
 */
export type ProtectedKeysIn<T> = ProtectedName<DeepKeys<T>>;

/** The data a service operation resolves to on success. */
export type MeetingMinutesSuccessData<Operation extends MeetingMinutesOperation> = Extract<
  Awaited<ReturnType<MeetingMinutesService[Operation]>>,
  { readonly status: 'success' }
>['data'];

function isProtectedFieldName(key: string): boolean {
  const name = key.toLowerCase().replace(/[_\-.\s]/g, '');
  if (PROTECTED_FIELD_PATTERNS.prefixes.some((prefix) => name.startsWith(prefix))) return true;
  if (PROTECTED_FIELD_PATTERNS.fragments.some((fragment) => name.includes(fragment))) return true;
  if ((PROTECTED_FIELD_PATTERNS.exact as readonly string[]).includes(name)) return true;

  const authorizedCount = AUTHORIZED_COUNT_FIELDS.some(
    (field) => field.toLowerCase() === name,
  );
  return !authorizedCount && (name.endsWith('count') || name.startsWith('total'));
}

/**
 * Scans a payload for protected fields and unreviewed counts.
 *
 * Returns the path of every offending key (`page.items[0].rawResponse`), or an
 * empty array when the payload is clean. Handles nested objects, arrays and
 * cycles; values are never read beyond deciding whether to descend, so the
 * report itself cannot echo protected content.
 */
export function findProtectedMeetingMinuteFields(payload: unknown): readonly string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = path ? `${path}.${key}` : key;
      if (isProtectedFieldName(key)) found.push(childPath);
      visit(child, childPath);
    }
  };

  visit(payload, '');
  return found;
}
