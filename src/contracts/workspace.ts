/**
 * Phase 7 — notifications, search, documents, messages, and employee
 * self-service contracts.
 *
 * Two rules run through all of it.
 *
 * **A notification body never contains restricted content** (`REQ-NOT-004`).
 * The type carries `href` so the recipient can open the record and be checked
 * there, rather than being told something in a message they were not cleared
 * to read.
 *
 * **Search is authorization-filtered before it is counted.** `totalCount` is
 * the number of results the viewer may see. Returning a total that includes
 * hidden records would leak their existence, which is the same defect as
 * showing them (`REQ-NFR-SEC-004`).
 */

import type {
  AttendanceState,
  DayPortion,
  IsoDate,
  LeaveTypeKey,
  NotificationType,
  RequestWorkflowState,
} from './domain';
import type { Result } from './results';
import type { DurationView, LeaveBalanceView } from './view-models';

/* ------------------------------------------------------------------------- */
/* Notifications (`FE-0710`)                                                 */
/* ------------------------------------------------------------------------- */

export type NotificationGroupKey =
  | 'action_required'
  | 'time'
  | 'work'
  | 'requests'
  | 'evaluation'
  | 'periods'
  | 'exports';

export interface NotificationItemView {
  readonly id: string;
  readonly type: NotificationType;
  readonly title: string;
  /** Must never contain restricted content. */
  readonly body: string;
  readonly createdAtLabel: string;
  readonly isRead: boolean;
  readonly href: string | null;
  readonly relatedLabel: string | null;
  readonly group: NotificationGroupKey;
  readonly groupLabel: string;
  /** Needs the recipient to do something, not merely to know it. */
  readonly requiresAction: boolean;
}

export interface NotificationCentreView {
  readonly unreadCount: number;
  readonly groups: readonly {
    readonly key: NotificationGroupKey;
    readonly label: string;
    readonly items: readonly NotificationItemView[];
  }[];
}

/* ------------------------------------------------------------------------- */
/* Search (`FE-0711`, `FE-0712`)                                             */
/* ------------------------------------------------------------------------- */

export type SearchEntityKind =
  | 'employee'
  | 'division'
  | 'project'
  | 'task'
  | 'timesheet'
  | 'remark'
  | 'document';

export interface SearchResultView {
  readonly id: string;
  readonly kind: SearchEntityKind;
  readonly kindLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  /** Matched text, already trimmed to a snippet by the service. */
  readonly snippet: string | null;
  /**
   * The record exists and is named, but its detail needs a permission the
   * viewer lacks. Only set where the *existence* is already known to them —
   * never used to advertise a record they cannot otherwise see.
   */
  readonly isRestricted: boolean;
}

export interface SearchResultsView {
  readonly term: string;
  /** Count of results this viewer may see, never the unfiltered total. */
  readonly totalCount: number;
  readonly groups: readonly {
    readonly kind: SearchEntityKind;
    readonly label: string;
    readonly results: readonly SearchResultView[];
  }[];
  readonly guidance: string | null;
}

/* ------------------------------------------------------------------------- */
/* Documents (`FE-0723`)                                                     */
/* ------------------------------------------------------------------------- */

export interface DocumentItemView {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly scope: 'company' | 'division' | 'project';
  readonly scopeLabel: string;
  readonly groupLabel: string;
  readonly version: string;
  readonly fileName: string;
  readonly mediaTypeLabel: string;
  readonly sizeLabel: string;
  readonly uploadedAtLabel: string;
  readonly uploadedByLabel: string;
  readonly isRestricted: boolean;
  /** Why it is restricted, when it is. */
  readonly restrictionReason: string | null;
  readonly canDownload: boolean;
  /** No real preview exists in this milestone; this states what it would be. */
  readonly previewPlaceholder: string;
}

export interface DocumentLibraryView {
  readonly groups: readonly {
    readonly key: string;
    readonly label: string;
    readonly scope: 'company' | 'division' | 'project';
    readonly documents: readonly DocumentItemView[];
  }[];
  readonly totalCount: number;
  readonly restrictedCount: number;
}

/* ------------------------------------------------------------------------- */
/* Messages (`FE-0724`)                                                      */
/* ------------------------------------------------------------------------- */

export interface MessageThreadView {
  readonly id: string;
  readonly kind: 'division' | 'project' | 'direct' | 'task_comment';
  readonly kindLabel: string;
  readonly title: string;
  readonly subtitle: string;
  readonly lastMessageAtLabel: string;
  readonly unreadCount: number;
  readonly messages: readonly {
    readonly id: string;
    readonly authorName: string;
    readonly body: string;
    readonly atLabel: string;
    readonly isOwn: boolean;
  }[];
}

export interface MessagePrototypeView {
  readonly threads: readonly MessageThreadView[];
  /** States plainly that this is a prototype, not a delivered module. */
  readonly prototypeNote: string;
  readonly deliveryPhaseLabel: string;
}

/* ------------------------------------------------------------------------- */
/* Employee self-service (`FE-0720`, `FE-0721`, `FE-0722`)                   */
/* ------------------------------------------------------------------------- */

export interface SelfRequestView {
  readonly id: string;
  readonly kind: 'wfh' | 'leave';
  readonly dateLabel: string;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly portion: DayPortion;
  readonly portionLabel: string;
  readonly leaveType: LeaveTypeKey | null;
  readonly leaveTypeLabel: string | null;
  readonly reason: string;
  readonly detail: string;
  readonly state: RequestWorkflowState;
  readonly stateLabel: string;
  readonly decisionLabel: string | null;
  readonly decisionComment: string | null;
  readonly overrideNote: string | null;
  /** What the employee should do next, when anything. */
  readonly nextStep: string | null;
  readonly canCancel: boolean;
  readonly canRespond: boolean;
  readonly conflictNote: string | null;
}

export interface WfhSelfServiceView {
  readonly requests: readonly SelfRequestView[];
  readonly approvedUpcoming: readonly SelfRequestView[];
  readonly divisionOptions: readonly { readonly value: string; readonly label: string }[];
  readonly canRequest: boolean;
  readonly disabledReason: string | null;
}

export interface WfhRequestInput {
  readonly wfhDate: IsoDate;
  readonly portion: DayPortion;
  readonly divisionId: string;
  readonly reason: string;
  readonly plannedTasks: string;
  readonly contactAvailability: string;
}

export interface LeaveSelfServiceView {
  readonly balances: readonly LeaveBalanceView[];
  readonly requests: readonly SelfRequestView[];
  readonly leaveTypeOptions: readonly {
    readonly value: LeaveTypeKey;
    readonly label: string;
    readonly allowsHalfDay: boolean;
    readonly remainingDays: number;
  }[];
  readonly canRequest: boolean;
  readonly disabledReason: string | null;
}

export interface LeaveRequestInput {
  readonly leaveType: LeaveTypeKey;
  readonly startDate: IsoDate;
  readonly endDate: IsoDate;
  readonly portion: DayPortion;
  readonly reason: string;
}

export type SelfEvaluationStatus =
  | 'not_open'
  | 'awaiting_self_evaluation'
  | 'self_evaluation_draft'
  | 'submitted'
  | 'with_reviewer'
  | 'published';

export interface SelfEvaluationFormValues {
  readonly achievements: string;
  readonly completedProjects: string;
  readonly challenges: string;
  readonly skills: string;
  readonly trainingNeeds: string;
  readonly goals: string;
  readonly supportRequired: string;
}

export interface SelfEvaluationView {
  readonly id: string;
  readonly periodLabel: string;
  readonly rangeLabel: string;
  readonly dueDateLabel: string;
  readonly status: SelfEvaluationStatus;
  readonly statusLabel: string;
  readonly statusExplanation: string;
  readonly values: SelfEvaluationFormValues;
  readonly submittedAtLabel: string | null;
  readonly isEditable: boolean;
  /** Only populated once HR publishes (`REQ-EVAL-010`). */
  readonly published: {
    readonly weightedScore: number;
    readonly reviewerSummary: string;
    readonly publishedAtLabel: string;
    readonly areas: readonly {
      readonly label: string;
      readonly weightPercent: number;
      readonly score: number;
      readonly comment: string;
    }[];
  } | null;
  /** Automatic facts the employee can see about their own period. */
  readonly facts: readonly { readonly label: string; readonly value: string }[];
}

export interface AttendanceSelfView {
  readonly date: IsoDate;
  readonly dateLabel: string;
  readonly state: AttendanceState;
  readonly stateLabel: string;
  readonly active: DurationView;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export interface WorkspaceService {
  getNotifications(userId: string): Promise<Result<NotificationCentreView>>;
  markNotificationRead(userId: string, id: string, isRead: boolean): Promise<Result<NotificationCentreView>>;
  markAllNotificationsRead(userId: string): Promise<Result<NotificationCentreView>>;

  search(
    userId: string,
    term: string,
    kinds?: readonly SearchEntityKind[],
  ): Promise<Result<SearchResultsView>>;

  getDocuments(
    userId: string,
    filters?: { readonly term?: string; readonly scopes?: readonly string[] },
  ): Promise<Result<DocumentLibraryView>>;
  downloadDocument(userId: string, id: string): Promise<Result<{ readonly note: string }>>;

  getMessages(userId: string): Promise<Result<MessagePrototypeView>>;

  getWfhSelfService(userId: string): Promise<Result<WfhSelfServiceView>>;
  submitWfhRequest(userId: string, input: WfhRequestInput): Promise<Result<SelfRequestView>>;
  cancelRequest(userId: string, kind: 'wfh' | 'leave', id: string): Promise<Result<SelfRequestView>>;

  getLeaveSelfService(userId: string): Promise<Result<LeaveSelfServiceView>>;
  submitLeaveRequest(userId: string, input: LeaveRequestInput): Promise<Result<SelfRequestView>>;

  getSelfEvaluation(userId: string): Promise<Result<SelfEvaluationView>>;
  saveSelfEvaluation(
    userId: string,
    values: SelfEvaluationFormValues,
    submit: boolean,
  ): Promise<Result<SelfEvaluationView>>;

  /** Employee-visible recent search terms. Local to the demo (`FE-0712`). */
  listRecentSearches(userId: string): Promise<Result<readonly string[]>>;
}
