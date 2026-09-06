/**
 * `FE-0760` — the shared approval chain.
 *
 * Requisition and conveyance travel the same path:
 *
 *     Employee submits    → Team Lead review → HR + Finance + Super Admin
 *     Team Lead submits   →                    HR + Finance + Super Admin
 *
 * This module exists because that sentence is true of both, and two
 * hand-written copies of one workflow drift. The drift would not show up as a
 * failing build — it would show up as a record reaching a reviewer it should
 * not have, which is the kind of defect this product can least afford.
 *
 * So the stage model, the visibility rule and the transition rules live here
 * once, and each workflow supplies only what is genuinely its own: its fields,
 * its validation, and its presentation.
 *
 * **Approval wording is correct on both.** The prohibition in `AGENTS.md` §2 is
 * on daily *time records*, where no decision exists. These are real decisions,
 * like a WFH request, a leave request, or HR period verification.
 */

import type { IsoDateTime, RoleKey } from './domain';

/**
 * Where a record sits. `decided` is terminal; `outcome` says how it ended, so
 * an approved and a rejected record are never distinguished by stage alone.
 */
export type ApprovalStage = 'team_lead_review' | 'reviewer_review' | 'decided';

export type ApprovalOutcome = 'approved' | 'rejected' | 'withdrawn';

/** The roles that decide, in chain order. */
export type ReviewerRole = 'team_lead' | 'hr_manager' | 'finance_manager' | 'super_admin';

/** The three parallel reviewers a record reaches after the Team Lead. */
export const PARALLEL_REVIEWER_ROLES: readonly ReviewerRole[] = [
  'hr_manager',
  'finance_manager',
  'super_admin',
];

/** Roles permitted to raise either kind of request. Enforced in the service. */
export const SUBMITTER_ROLES: readonly RoleKey[] = ['employee', 'team_lead'];

export type SubmitterRole = 'employee' | 'team_lead';

/**
 * One recorded decision.
 *
 * Appended, never updated in place, so the path a record travelled stays
 * reproducible after the fact.
 */
export interface ApprovalReview {
  readonly id: string;
  readonly reviewerUserId: string;
  readonly reviewerEmployeeId: string;
  readonly reviewerRole: ReviewerRole;
  readonly decision: 'approved' | 'rejected';
  /** Required on a rejection so the submitter learns why. */
  readonly reason: string | null;
  readonly decidedAt: IsoDateTime;
}

/**
 * The chain state every approvable record carries.
 *
 * `submitterRole` is captured at submission rather than read back from the
 * account, because a person's role can change and the chain a record travelled
 * must stay reproducible — the same reason a verified timesheet stores its
 * applied policy version.
 */
export interface Approvable {
  readonly id: string;
  readonly submitterUserId: string;
  readonly submitterEmployeeId: string;
  readonly submitterRole: SubmitterRole;
  /** Null when the submitter is a Team Lead, or has no Team Lead assigned. */
  readonly teamLeadEmployeeId: string | null;
  readonly stage: ApprovalStage;
  readonly outcome: ApprovalOutcome | null;
  readonly submittedAt: IsoDateTime;
  readonly decidedAt: IsoDateTime | null;
  readonly reviews: readonly ApprovalReview[];
}

/* ------------------------------------------------------------------------- */
/* View models                                                               */
/* ------------------------------------------------------------------------- */

export interface ApprovalReviewView {
  readonly id: string;
  readonly reviewerName: string;
  readonly reviewerRoleLabel: string;
  readonly decision: 'approved' | 'rejected';
  readonly decisionLabel: string;
  readonly reason: string | null;
  readonly decidedAtLabel: string;
}

/** One outstanding reviewer, so a timeline shows who is still to decide. */
export interface PendingReviewerView {
  readonly roleLabel: string;
}

/** The chain fields both detail screens render identically. */
export interface ApprovalTimelineView {
  readonly stage: ApprovalStage;
  readonly stageLabel: string;
  readonly outcome: ApprovalOutcome | null;
  readonly outcomeLabel: string | null;
  /** What happens next, or what happened. Never only the stage word. */
  readonly nextStep: string;
  readonly reviews: readonly ApprovalReviewView[];
  readonly pendingReviewers: readonly PendingReviewerView[];
  /** True when this viewer may record a decision on it now. */
  readonly canDecide: boolean;
  /** True when this viewer is the submitter and it is still undecided. */
  readonly canWithdraw: boolean;
}

export interface ApprovalDecisionInput {
  readonly decision: 'approved' | 'rejected';
  /** Required when rejecting. */
  readonly reason: string;
}

/* ------------------------------------------------------------------------- */
/* Labels                                                                    */
/* ------------------------------------------------------------------------- */

export const REVIEWER_ROLE_LABEL: Readonly<Record<ReviewerRole, string>> = {
  team_lead: 'Team Lead',
  hr_manager: 'HR',
  finance_manager: 'Finance',
  super_admin: 'Super Administrator',
};

export const APPROVAL_OUTCOME_LABEL: Readonly<Record<ApprovalOutcome, string>> = {
  approved: 'Approved',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};
