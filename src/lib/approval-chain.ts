import type {
  Approvable,
  ApprovalOutcome,
  ApprovalReview,
  ReviewerRole,
  SubmitterRole,
} from '@/contracts/approval';
import { PARALLEL_REVIEWER_ROLES } from '@/contracts/approval';

export interface ApprovalTransition {
  readonly reviews: readonly ApprovalReview[];
  readonly stage: Approvable['stage'];
  readonly outcome: ApprovalOutcome | null;
  readonly decidedAt: string | null;
}

export interface ApprovalViewer {
  readonly userId: string;
  readonly employeeId: string | null;
  readonly reviewerRole: ReviewerRole | null;
}

/** Shared record visibility for every workflow using this approval chain. */
export function canViewApproval(record: Approvable, viewer: ApprovalViewer): boolean {
  if (record.submitterUserId === viewer.userId) return true;
  if (record.teamLeadEmployeeId && record.teamLeadEmployeeId === viewer.employeeId) return true;
  return record.stage !== 'team_lead_review'
    && (viewer.reviewerRole === 'hr_manager' || viewer.reviewerRole === 'super_admin');
}

/** Shared stage/role decision rule. A duplicate role decision is never pending. */
export function canDecideApproval(record: Approvable, viewer: ApprovalViewer): boolean {
  if (record.stage === 'decided' || !viewer.reviewerRole) return false;
  if (record.reviews.some((review) => review.reviewerRole === viewer.reviewerRole)) return false;
  if (record.stage === 'team_lead_review') {
    return viewer.reviewerRole === 'team_lead' && record.teamLeadEmployeeId === viewer.employeeId;
  }
  return viewer.reviewerRole !== 'team_lead'
    && pendingApprovalRoles(record).includes(viewer.reviewerRole);
}

export function approvalDecisionAudit(
  before: Pick<Approvable, 'stage' | 'outcome'>,
  transition: ApprovalTransition,
  review: ApprovalReview,
) {
  return {
    before: { stage: before.stage, outcome: before.outcome },
    after: {
      stage: transition.stage,
      outcome: transition.outcome,
      reviewerRole: review.reviewerRole,
      decision: review.decision,
    },
  } as const;
}

/** The single pure state machine shared by requisition and conveyance. */
export function pendingApprovalRoles(record: Approvable): readonly ReviewerRole[] {
  if (record.stage !== 'reviewer_review') return [];
  const decided = new Set(
    record.reviews
      .filter((review) => review.reviewerRole !== 'team_lead')
      .map((review) => review.reviewerRole),
  );
  return PARALLEL_REVIEWER_ROLES.filter((role) => !decided.has(role));
}

export function transitionApproval(record: Approvable, review: ApprovalReview): ApprovalTransition {
  const reviews = [...record.reviews, review];
  if (review.decision === 'rejected') {
    return { reviews, stage: 'decided', outcome: 'rejected', decidedAt: review.decidedAt };
  }
  if (review.reviewerRole === 'team_lead') {
    return { reviews, stage: 'reviewer_review', outcome: null, decidedAt: null };
  }
  const advanced: Approvable = { ...record, reviews, stage: 'reviewer_review' };
  return pendingApprovalRoles(advanced).length === 0
    ? { reviews, stage: 'decided', outcome: 'approved', decidedAt: review.decidedAt }
    : { reviews, stage: 'reviewer_review', outcome: null, decidedAt: null };
}

export function initialApprovalStage(role: SubmitterRole): Approvable['stage'] {
  return role === 'team_lead' ? 'reviewer_review' : 'team_lead_review';
}

