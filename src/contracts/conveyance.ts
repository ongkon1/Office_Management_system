/**
 * `FE-0761` — conveyance contracts.
 *
 * A conveyance claim is a travel expense: where someone went, when, how, and
 * what it cost, with an optional receipt.
 *
 * It travels the same chain as a requisition, and that chain is defined once in
 * `src/contracts/approval.ts` rather than restated here. What this module owns
 * is the claim itself — the journey, the money, and the receipt.
 */

import type {
  Approvable,
  ApprovalDecisionInput,
  ApprovalOutcome,
  ApprovalStage,
  ApprovalTimelineView,
} from './approval';
import type { IsoDate, IsoDateTime, Money } from './domain';
import type { Result } from './results';

export {
  PARALLEL_REVIEWER_ROLES,
  REVIEWER_ROLE_LABEL,
  SUBMITTER_ROLES,
  APPROVAL_OUTCOME_LABEL as CONVEYANCE_OUTCOME_LABEL,
} from './approval';

export type {
  ApprovalStage as ConveyanceStage,
  ApprovalOutcome as ConveyanceOutcome,
  ApprovalReview as ConveyanceReview,
  ApprovalReviewView as ConveyanceReviewView,
  PendingReviewerView as ConveyancePendingReviewerView,
  ReviewerRole,
} from './approval';

/* ------------------------------------------------------------------------- */
/* Domain                                                                    */
/* ------------------------------------------------------------------------- */

/**
 * How the journey was made.
 *
 * `other` carries a required description. A mode of "other" with no detail is
 * unusable for the Finance reviewer who has to decide on it, so the type makes
 * the description inseparable from the choice rather than leaving it optional
 * and hoping.
 */
export type TravelMode = 'self' | 'uber' | 'other';

export interface ReceiptFile {
  readonly id: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly uploadedAt: IsoDateTime;
}

/** The stored record: the shared chain state plus the claim's own fields. */
export interface ConveyanceClaim extends Approvable {
  readonly reference: string;
  readonly businessName: string;
  readonly clientName: string;
  /** The journey, as one instant in the business timezone. */
  readonly visitedAt: IsoDateTime;
  readonly visitedDate: IsoDate;
  /** `HH:MM`, 24-hour, as entered. */
  readonly visitedTime: string;
  readonly timezone: string;
  readonly mode: TravelMode;
  /** Required when `mode` is `other`; null otherwise. */
  readonly modeDescription: string | null;
  readonly amount: Money;
  /** Null when no receipt was attached. The upload is optional. */
  readonly receipt: ReceiptFile | null;
}

/* ------------------------------------------------------------------------- */
/* Form input                                                                */
/* ------------------------------------------------------------------------- */

/**
 * What the form sends.
 *
 * There is no `submittedAt`: the submission instant is assigned by the service,
 * never supplied by the client. A claim whose own timestamp the claimant
 * chooses is not evidence of anything.
 */
export interface ConveyanceFormInput {
  readonly businessName: string;
  readonly clientName: string;
  readonly visitedDate: string;
  readonly visitedTime: string;
  readonly mode: TravelMode;
  readonly modeDescription: string;
  readonly amount: string;
  /** Optional. Null when nothing was attached. */
  readonly receipt: ReceiptUploadInput | null;
}

/**
 * A file chosen in the browser.
 *
 * The frontend milestone has no storage provider (`BE-0007`-`BE-0014` are
 * open), so this carries metadata only and is presented as a prototype — never
 * as a stored file.
 */
export interface ReceiptUploadInput {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
}

/** What an upload may be, so "absent" and "failed" are never conflated. */
export type ReceiptSelectionState = 'none' | 'selected' | 'too_large' | 'wrong_type';

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_RECEIPT_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/* ------------------------------------------------------------------------- */
/* View models                                                               */
/* ------------------------------------------------------------------------- */

/**
 * The receipt as a viewer sees it.
 *
 * A receipt is attachment data, which `AGENTS.md` §2 lists as deny-by-default.
 * The `restricted` variant carries **no** file name, size or link, so a viewer
 * who may not see it has nothing to leak — redaction is a property of the type,
 * not of a component remembering to hide something.
 */
export type ReceiptView =
  | { readonly state: 'none' }
  | {
      readonly state: 'attached';
      readonly fileName: string;
      readonly sizeLabel: string;
      readonly typeLabel: string;
      readonly href: string;
    }
  | { readonly state: 'restricted' };

export interface ConveyanceRowView {
  readonly id: string;
  readonly reference: string;
  readonly businessName: string;
  readonly clientName: string;
  readonly visitedLabel: string;
  readonly modeLabel: string;
  readonly amountDisplay: string;
  readonly submitterName: string;
  readonly submittedAtLabel: string;
  readonly hasReceipt: boolean;
  readonly stage: ApprovalStage;
  readonly stageLabel: string;
  readonly outcome: ApprovalOutcome | null;
  readonly nextStep: string;
  readonly awaitingThisViewer: boolean;
  readonly href: string;
}

export interface ConveyanceDetailView extends ApprovalTimelineView {
  readonly id: string;
  readonly reference: string;
  readonly businessName: string;
  readonly clientName: string;
  readonly visitedLabel: string;
  readonly visitedDateLabel: string;
  readonly visitedTimeLabel: string;
  readonly modeLabel: string;
  readonly modeDescription: string | null;
  readonly amountDisplay: string;
  readonly receipt: ReceiptView;
  readonly submitterName: string;
  readonly submitterRoleLabel: string;
  readonly submittedAtLabel: string;
}

export interface ConveyanceListView {
  readonly rows: readonly ConveyanceRowView[];
  readonly awaitingCount: number;
  readonly canSubmit: boolean;
  readonly submitBlockedReason: string | null;
  readonly scopeLabel: string;
}

/** What the form shows in its read-only date/time field before submission. */
export interface ConveyanceFormContextView {
  readonly nowLabel: string;
  readonly timezone: string;
  readonly canSubmit: boolean;
  readonly submitBlockedReason: string | null;
  /** The furthest visited date the service will accept. */
  readonly maxVisitedDate: IsoDate;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export type ConveyanceDecisionInput = ApprovalDecisionInput;

export interface ConveyanceService {
  list(userId: string): Promise<Result<ConveyanceListView>>;
  /** Context for the create form, including the read-only submission instant. */
  formContext(userId: string): Promise<Result<ConveyanceFormContextView>>;
  get(userId: string, claimId: string): Promise<Result<ConveyanceDetailView>>;
  submit(userId: string, input: ConveyanceFormInput): Promise<Result<ConveyanceDetailView>>;
  decide(
    userId: string,
    claimId: string,
    input: ConveyanceDecisionInput,
  ): Promise<Result<ConveyanceDetailView>>;
  withdraw(userId: string, claimId: string): Promise<Result<ConveyanceDetailView>>;
  /**
   * Fetching the receipt on its own.
   *
   * This exists so the access rule is enforced on the path that actually
   * matters. A screen that simply omits a download link is not a control — the
   * file has to be unreachable when requested directly, and that is only
   * testable if there is a direct request to make.
   */
  getReceipt(userId: string, claimId: string): Promise<Result<ReceiptFile>>;
  queue(userId: string): Promise<Result<{ readonly awaitingCount: number; readonly href: string }>>;
}

/* ------------------------------------------------------------------------- */
/* Labels                                                                    */
/* ------------------------------------------------------------------------- */

export const TRAVEL_MODE_LABEL: Readonly<Record<TravelMode, string>> = {
  self: 'Self',
  uber: 'Uber',
  other: 'Other',
};

export const TRAVEL_MODE_OPTIONS: readonly { value: TravelMode; label: string }[] = [
  { value: 'self', label: 'Self' },
  { value: 'uber', label: 'Uber' },
  { value: 'other', label: 'Other' },
];
