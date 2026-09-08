/**
 * `FE-0760` — the one implementation of the approval chain.
 *
 * Extracted from the requisition service so conveyance can travel the same path
 * without a second copy of it. Everything here is about *the chain*: who can
 * see a record, who can decide on it now, and what a decision does. Nothing
 * here knows what the record is.
 *
 * The functions are pure and take the record, so both mock services and the
 * later MySQL implementation can use the same rules unchanged.
 */

import type {
  Approvable,
  ApprovalOutcome,
  ApprovalReview,
  ApprovalReviewView,
  PendingReviewerView,
  ReviewerRole,
} from '@/contracts/approval';
import {
  APPROVAL_OUTCOME_LABEL,
  PARALLEL_REVIEWER_ROLES,
  REVIEWER_ROLE_LABEL,
} from '@/contracts/approval';
import { formatTimestamp } from '@/lib/format';
import { EMPLOYEES } from '@/fixtures/hr';
import { findAccountByUserId } from './accounts';

export function viewerOf(userId: string) {
  return findAccountByUserId(userId);
}

export function employeeName(employeeId: string): string {
  return EMPLOYEES.find((employee) => employee.id === employeeId)?.fullName ?? employeeId;
}

/** The Team Lead recorded against an employee, or null when none is assigned. */
export function teamLeadOf(employeeId: string): string | null {
  return EMPLOYEES.find((employee) => employee.id === employeeId)?.teamLeadEmployeeId ?? null;
}

/**
 * The reviewer role this account decides as, or null when it never reviews.
 *
 * `finance_manager` is absent by construction: no account can hold a retired
 * role, so no new decision can be recorded against one. Rows that already
 * carry it still render — see `REVIEWER_ROLE_LABEL`.
 */
export function reviewerRoleOf(userId: string): ReviewerRole | null {
  const role = viewerOf(userId)?.primaryRole;
  if (role === 'team_lead' || role === 'hr_manager') return role;
  if (role === 'super_admin') return 'super_admin';
  return null;
}

/** Parallel reviewer roles that have not yet decided. */
export function pendingReviewerRoles(record: Approvable): readonly ReviewerRole[] {
  if (record.stage !== 'reviewer_review') return [];
  const decided = new Set(
    record.reviews
      .filter((review) => review.reviewerRole !== 'team_lead')
      .map((review) => review.reviewerRole),
  );
  return PARALLEL_REVIEWER_ROLES.filter((role) => !decided.has(role));
}

/**
 * Whether this viewer has a decision to make right now.
 *
 * Deliberately strict about *when*: a Super Administrator cannot decide on a
 * record still sitting with the Team Lead, because it has not reached them.
 * Being able to see everything eventually is not the same as being able to act
 * before the chain gets there.
 */
export function canDecide(userId: string, record: Approvable): boolean {
  const role = reviewerRoleOf(userId);
  if (!role || record.stage === 'decided') return false;

  if (record.stage === 'team_lead_review') {
    return (
      role === 'team_lead' &&
      record.teamLeadEmployeeId !== null &&
      record.teamLeadEmployeeId === viewerOf(userId)?.employeeId
    );
  }

  return PARALLEL_REVIEWER_ROLES.includes(role) && pendingReviewerRoles(record).includes(role);
}

/**
 * Whether this viewer may see the record at all.
 *
 * The reviewer clause is `stage === 'reviewer_review' || decided` rather than
 * "is a reviewer": before the Team Lead has approved it, the record has not
 * reached HR, Finance or the administrator and must stay invisible to them.
 */
export function canView(userId: string, record: Approvable): boolean {
  const viewer = viewerOf(userId);
  if (!viewer) return false;

  if (record.submitterUserId === userId) return true;

  if (record.teamLeadEmployeeId !== null && record.teamLeadEmployeeId === viewer.employeeId) {
    return true;
  }

  const role = reviewerRoleOf(userId);
  if (role && PARALLEL_REVIEWER_ROLES.includes(role)) {
    return record.stage === 'reviewer_review' || record.stage === 'decided';
  }

  return false;
}

export function canWithdraw(userId: string, record: Approvable): boolean {
  return record.submitterUserId === userId && record.stage !== 'decided';
}

/** The chain fields a decision produces. Pure: the caller merges them in. */
export interface ChainTransition {
  readonly reviews: readonly ApprovalReview[];
  readonly stage: Approvable['stage'];
  readonly outcome: ApprovalOutcome | null;
  readonly decidedAt: string | null;
}

/**
 * Applies a decision and advances the chain.
 *
 * Three rules, and each has a plausible wrong version:
 * a rejection is terminal at any stage; a Team Lead approval advances to the
 * parallel stage rather than deciding; and the parallel stage is decided only
 * when *every* reviewer has approved.
 */
export function applyDecision(record: Approvable, review: ApprovalReview): ChainTransition {
  const reviews = [...record.reviews, review];

  if (review.decision === 'rejected') {
    return { reviews, stage: 'decided', outcome: 'rejected', decidedAt: review.decidedAt };
  }

  if (review.reviewerRole === 'team_lead') {
    return { reviews, stage: 'reviewer_review', outcome: null, decidedAt: null };
  }

  const advanced: Approvable = { ...record, reviews, stage: 'reviewer_review' };
  return pendingReviewerRoles(advanced).length === 0
    ? { reviews, stage: 'decided', outcome: 'approved', decidedAt: review.decidedAt }
    : { reviews, stage: 'reviewer_review', outcome: null, decidedAt: null };
}

/** The stage a record enters on submission. */
export function initialStage(submitterRole: 'employee' | 'team_lead'): Approvable['stage'] {
  // A Team Lead's own request skips the Team Lead stage rather than being
  // auto-approved through it: no decision was made, so none is recorded.
  return submitterRole === 'team_lead' ? 'reviewer_review' : 'team_lead_review';
}

/* -------------------------------------------------------------------------- */
/* Presentation                                                               */
/* -------------------------------------------------------------------------- */

export function stageLabel(record: Approvable): string {
  if (record.stage === 'team_lead_review') return 'Waiting for Team Lead';
  if (record.stage === 'reviewer_review') {
    const pending = pendingReviewerRoles(record);
    return pending.length === PARALLEL_REVIEWER_ROLES.length
      ? 'Waiting for HR and the Super Administrator'
      : `Waiting for ${pending.map((role) => REVIEWER_ROLE_LABEL[role]).join(' and ')}`;
  }
  return record.outcome ? APPROVAL_OUTCOME_LABEL[record.outcome] : 'Decided';
}

/**
 * What happens next, in a sentence.
 *
 * A stage word on its own tells a submitter nothing actionable; this says who
 * holds it and what they will do, which is the question actually being asked.
 * `subject` keeps the sentence natural for each workflow.
 */
export function nextStep(record: Approvable, subject: string): string {
  if (record.stage === 'team_lead_review') {
    return record.teamLeadEmployeeId
      ? `${employeeName(record.teamLeadEmployeeId)} reviews this first. It reaches HR and the Super Administrator only after that.`
      : 'No Team Lead is currently assigned, so this cannot move forward. Contact HR.';
  }

  if (record.stage === 'reviewer_review') {
    const pending = pendingReviewerRoles(record);
    return `HR and the Super Administrator each review this. ${pending
      .map((role) => REVIEWER_ROLE_LABEL[role])
      .join(', ')} still to decide.`;
  }

  if (record.outcome === 'rejected') {
    const rejection = record.reviews.find((review) => review.decision === 'rejected');
    return rejection
      ? `Rejected by ${REVIEWER_ROLE_LABEL[rejection.reviewerRole]}. ${rejection.reason ?? ''}`.trim()
      : 'Rejected.';
  }

  if (record.outcome === 'withdrawn') {
    return `Withdrawn by the person who raised it. Raise a new ${subject} if it is still needed.`;
  }

  return 'Approved by HR and the Super Administrator.';
}

export function toReviewView(review: ApprovalReview): ApprovalReviewView {
  return {
    id: review.id,
    reviewerName: employeeName(review.reviewerEmployeeId),
    reviewerRoleLabel: REVIEWER_ROLE_LABEL[review.reviewerRole],
    decision: review.decision,
    decisionLabel: review.decision === 'approved' ? 'Approved' : 'Rejected',
    reason: review.reason,
    decidedAtLabel: formatTimestamp(review.decidedAt),
  };
}

export function toPendingReviewerViews(record: Approvable): readonly PendingReviewerView[] {
  return pendingReviewerRoles(record).map((role) => ({
    roleLabel: REVIEWER_ROLE_LABEL[role],
  }));
}

/** The whole timeline block both detail view models embed. */
export function toTimelineView(userId: string, record: Approvable, subject: string) {
  return {
    stage: record.stage,
    stageLabel: stageLabel(record),
    outcome: record.outcome,
    outcomeLabel: record.outcome ? APPROVAL_OUTCOME_LABEL[record.outcome] : null,
    nextStep: nextStep(record, subject),
    reviews: record.reviews.map(toReviewView),
    pendingReviewers: toPendingReviewerViews(record),
    canDecide: canDecide(userId, record),
    canWithdraw: canWithdraw(userId, record),
  };
}

/* -------------------------------------------------------------------------- */
/* Shared result shapes                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The single not-found response.
 *
 * Used both for a record that does not exist and for one the viewer may not
 * see, so an id cannot be probed by comparing responses.
 */
export function chainNotFound(resource: string, label: string) {
  return {
    status: 'not_found' as const,
    code: 'NOT_FOUND' as const,
    message: `${label} not found.`,
    resource,
  };
}

export function chainDenied(message: string, guidance: string) {
  return { status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message, guidance };
}

export function chainConflict(message: string, guidance: string) {
  return { status: 'conflict' as const, code: 'CONFLICT' as const, message, guidance };
}

/** The reason a role may not submit, or null when it may. */
export function submitBlockedReason(userId: string, subject: string): string | null {
  const role = viewerOf(userId)?.primaryRole;
  if (role === 'employee' || role === 'team_lead') return null;
  return `Only an Employee or a Team Lead can raise a ${subject}. You can review the ones that reach you.`;
}

/** Heading that states whose records a list is showing. */
export function scopeLabel(userId: string, plural: string): string {
  const role = viewerOf(userId)?.primaryRole;
  if (role === 'employee') return `${plural} you have raised`;
  if (role === 'team_lead') return `Your ${plural.toLowerCase()} and those from your team`;
  return `${plural} that have reached you for review`;
}
