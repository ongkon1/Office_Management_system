'use client';

import type {
  ApprovalReviewView,
  PendingReviewerView,
} from '@/contracts/approval';
import { Card, CardHeader } from '@/components/feedback/card';
import { Badge } from '@/components/ui/badge';

export interface ApprovalTimelineProps {
  reviews: readonly ApprovalReviewView[];
  pendingReviewers: readonly PendingReviewerView[];
  title?: string;
  description?: string;
  className?: string;
}

/**
 * The review chain, rendered once for every workflow that has one.
 *
 * Requisition and conveyance both show it, and both audiences read it for the
 * same two things: what has already been decided, and who is still holding it.
 * Reviewers who have not decided are listed explicitly rather than left as an
 * absence — "three reviewers, one has approved" is only legible if the other
 * two are on screen.
 *
 * Decision is never colour alone: each row carries the word as well as the
 * tone, matching the status rule the rest of the product follows.
 */
export function ApprovalTimeline({
  reviews,
  pendingReviewers,
  title = 'Review chain',
  description,
  className,
}: ApprovalTimelineProps) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} />

      {reviews.length === 0 && pendingReviewers.length === 0 ? (
        <p className="mt-4 text-body-sm text-ink-muted">
          No decision has been recorded yet.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="min-w-0 text-body-sm font-medium text-ink">
                  {review.reviewerRoleLabel} · {review.reviewerName}
                </p>
                <Badge tone={review.decision === 'approved' ? 'success' : 'danger'}>
                  {review.decisionLabel}
                </Badge>
              </div>
              <p className="mt-1 text-caption text-ink-subtle">{review.decidedAtLabel}</p>
              {review.reason && (
                <p className="mt-2 text-caption text-ink-muted">{review.reason}</p>
              )}
            </li>
          ))}

          {pendingReviewers.map((pending) => (
            <li
              key={pending.roleLabel}
              className="rounded-md border border-dashed border-border p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-body-sm text-ink-muted">{pending.roleLabel}</p>
                <Badge tone="neutral">Not yet decided</Badge>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
