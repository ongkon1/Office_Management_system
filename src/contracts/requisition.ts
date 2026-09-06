/**
 * `FE-0740` — requisition contracts.
 *
 * A requisition is a request to repair, replace or buy an item.
 *
 * The chain it travels is **not defined here**. It lives once in
 * `src/contracts/approval.ts`, which conveyance uses too — see the reasoning in
 * that file. This module carries only what is genuinely a requisition: its two
 * forms, its fields, and how they are presented.
 */

import type {
  Approvable,
  ApprovalDecisionInput,
  ApprovalOutcome,
  ApprovalStage,
  ApprovalTimelineView,
} from './approval';
import type { IsoDate, Money } from './domain';
import type { Result } from './results';

export {
  PARALLEL_REVIEWER_ROLES,
  REVIEWER_ROLE_LABEL,
  SUBMITTER_ROLES,
  APPROVAL_OUTCOME_LABEL as REQUISITION_OUTCOME_LABEL,
} from './approval';

export type {
  ApprovalStage as RequisitionStage,
  ApprovalOutcome as RequisitionOutcome,
  ApprovalReview as RequisitionReview,
  ApprovalReviewView as RequisitionReviewView,
  PendingReviewerView as RequisitionPendingReviewerView,
  ReviewerRole,
} from './approval';

/* ------------------------------------------------------------------------- */
/* Domain                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * Which form raised the requisition.
 *
 * `in_house` is an existing item that needs repair or replacement, so it
 * carries the item's history — when it was last recovered and which model it
 * is. `new` is a fresh purchase, which has no history to record.
 */
export type RequisitionKind = 'in_house' | 'new';

/** The stored record: the shared chain state plus the requisition's own fields. */
export interface Requisition extends Approvable {
  readonly reference: string;
  readonly kind: RequisitionKind;

  readonly itemName: string;
  readonly purpose: string;
  readonly urgency: string;
  /**
   * Entered as text and normalised at the service boundary. Money is never a
   * bare number and never a float (`AGENTS.md` §2).
   */
  readonly approxAmount: Money;
  readonly modelName: string;
  /** In-house only: when the item was last recovered. */
  readonly lastRecoverDate: IsoDate | null;
}

/* ------------------------------------------------------------------------- */
/* Form input                                                                */
/* ------------------------------------------------------------------------- */

/**
 * Both forms as one shape.
 *
 * Every value is a string because every field is a text field, as specified.
 * The service is what turns `approxAmount` into `Money` and `lastRecoverDate`
 * into an `IsoDate` — a component never does either.
 */
export interface RequisitionFormInput {
  readonly kind: RequisitionKind;
  readonly itemName: string;
  readonly purpose: string;
  readonly urgency: string;
  readonly approxAmount: string;
  readonly modelName: string;
  /** In-house only; ignored for a `new` requisition. */
  readonly lastRecoverDate: string;
}

/** The fields each form shows, in the order specified. */
export const IN_HOUSE_FIELDS = [
  'itemName',
  'purpose',
  'lastRecoverDate',
  'modelName',
  'approxAmount',
  'urgency',
] as const;

export const NEW_FIELDS = [
  'itemName',
  'purpose',
  'urgency',
  'approxAmount',
  'modelName',
] as const;

/* ------------------------------------------------------------------------- */
/* View models                                                               */
/* ------------------------------------------------------------------------- */

export interface RequisitionRowView {
  readonly id: string;
  readonly reference: string;
  readonly kind: RequisitionKind;
  readonly kindLabel: string;
  readonly itemName: string;
  readonly purpose: string;
  readonly urgency: string;
  readonly submitterName: string;
  readonly submittedAtLabel: string;
  readonly amountDisplay: string;
  readonly stage: ApprovalStage;
  /** Plain-language stage, e.g. `Waiting for Team Lead`. */
  readonly stageLabel: string;
  readonly outcome: ApprovalOutcome | null;
  /** What happens next, or what happened. Never only the stage word. */
  readonly nextStep: string;
  /** True when this viewer has a decision to make right now. */
  readonly awaitingThisViewer: boolean;
  readonly href: string;
}

export interface RequisitionDetailView extends ApprovalTimelineView {
  readonly id: string;
  readonly reference: string;
  readonly kind: RequisitionKind;
  readonly kindLabel: string;
  readonly itemName: string;
  readonly purpose: string;
  readonly urgency: string;
  readonly modelName: string;
  readonly amountDisplay: string;
  readonly lastRecoverDateLabel: string | null;
  readonly submitterName: string;
  readonly submitterRoleLabel: string;
  readonly submittedAtLabel: string;
}

export interface RequisitionListView {
  readonly rows: readonly RequisitionRowView[];
  /** Rows awaiting this viewer's decision. Already authorization-filtered. */
  readonly awaitingCount: number;
  /** False for every role that may review but not raise a requisition. */
  readonly canSubmit: boolean;
  /** Explains an absent submit action rather than leaving a gap. */
  readonly submitBlockedReason: string | null;
  /** Heading that states whose requisitions these are. */
  readonly scopeLabel: string;
}

/** The Team Lead dashboard tile (`FE-0749`). */
export interface RequisitionQueueView {
  readonly awaitingCount: number;
  readonly href: string;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export type RequisitionDecisionInput = ApprovalDecisionInput;

export interface RequisitionService {
  /** Everything this viewer is authorized to see, already filtered. */
  list(userId: string): Promise<Result<RequisitionListView>>;
  /**
   * A requisition this viewer may not see returns `not_found`, never
   * `permission_denied` — an id must not be probeable (`AC-AUTH-004`).
   */
  get(userId: string, requisitionId: string): Promise<Result<RequisitionDetailView>>;
  submit(userId: string, input: RequisitionFormInput): Promise<Result<RequisitionDetailView>>;
  decide(
    userId: string,
    requisitionId: string,
    input: RequisitionDecisionInput,
  ): Promise<Result<RequisitionDetailView>>;
  withdraw(userId: string, requisitionId: string): Promise<Result<RequisitionDetailView>>;
  /** Count for the Team Lead dashboard tile. */
  queue(userId: string): Promise<Result<RequisitionQueueView>>;
}

/* ------------------------------------------------------------------------- */
/* Labels                                                                    */
/* ------------------------------------------------------------------------- */

export const REQUISITION_KIND_LABEL: Readonly<Record<RequisitionKind, string>> = {
  in_house: 'In-house',
  new: 'New',
};
