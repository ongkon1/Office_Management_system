/**
 * `FE-0780` — an employee raising a task for themselves.
 *
 * Until now every task was created by a Team Lead. An employee can now raise
 * one, and their Team Lead endorses it before it becomes ordinary work.
 *
 * **This is not the shared approval chain** in `./approval.ts`. That chain
 * models a request going to a Team Lead and then to three parallel reviewers.
 * A task is endorsed by one person and then stops being a request at all — it
 * becomes a work item that time is recorded against. Bending it into the chain
 * would put a `reviewer_review` stage and three reviewer roles into a shape
 * that has neither. `docs/frontend/phase-7/task-review-verification.md` records
 * the reasoning.
 *
 * **Approval wording is correct here**, for the same reason it is on
 * requisition and conveyance: a genuine decision exists. It must never appear
 * on a daily time record (`AGENTS.md` §2).
 */

import type { IsoDate, Priority, TaskReviewState } from './domain';
import type { Result } from './results';
import type { DurationView } from './view-models';

/* ------------------------------------------------------------------------- */
/* Form input                                                                */
/* ------------------------------------------------------------------------- */

/**
 * What an employee supplies.
 *
 * Deliberately narrower than the Team Lead's task form: an employee proposes
 * work for themselves, so there is no assignee to choose and no supporting
 * members to appoint. Widening it later is easy; taking a granted power back is
 * not.
 */
export interface EmployeeTaskFormInput {
  readonly title: string;
  readonly projectId: string;
  readonly priority: Priority;
  readonly dueDate: string;
  readonly estimatedHours: string;
  readonly description: string;
}

/* ------------------------------------------------------------------------- */
/* View models                                                               */
/* ------------------------------------------------------------------------- */

export interface TaskReviewStateView {
  readonly state: TaskReviewState;
  /** `Awaiting review`, `Approved`, `Not approved`. Never colour alone. */
  readonly label: string;
  /** What it means for the person reading it, in a sentence. */
  readonly detail: string;
  /** True while the task exists but may not receive time. */
  readonly blocksTimeEntry: boolean;
  readonly reviewerName: string | null;
  readonly reviewedAtLabel: string | null;
  readonly note: string | null;
}

/** A task waiting for this Team Lead, on their review queue. */
export interface TaskReviewRowView {
  readonly id: string;
  readonly title: string;
  readonly projectLabel: string;
  readonly divisionCode: string;
  readonly requestedByName: string;
  readonly priority: Priority;
  readonly dueDateLabel: string | null;
  readonly estimated: DurationView;
  readonly description: string | null;
  readonly requestedAtLabel: string;
  readonly href: string;
}

export interface TaskReviewQueueView {
  readonly rows: readonly TaskReviewRowView[];
  readonly awaitingCount: number;
  readonly href: string;
}

/** Options an employee may raise a task against. */
export interface EmployeeTaskOptionsView {
  readonly projects: readonly { readonly value: string; readonly label: string }[];
  readonly canCreate: boolean;
  readonly createBlockedReason: string | null;
  /** The Team Lead who will review it, named up front. */
  readonly reviewerName: string | null;
  readonly maxDueDateHint: IsoDate;
}

/* ------------------------------------------------------------------------- */
/* Service                                                                   */
/* ------------------------------------------------------------------------- */

export interface TaskReviewDecisionInput {
  readonly decision: 'approved' | 'rejected';
  /** Required when rejecting. */
  readonly note: string;
}

export interface TaskReviewService {
  /** Projects and reviewer for the employee's create form. */
  options(userId: string): Promise<Result<EmployeeTaskOptionsView>>;
  /** Raises a task for the signed-in employee, pending their Team Lead. */
  create(userId: string, input: EmployeeTaskFormInput): Promise<Result<{ readonly id: string }>>;
  /** Tasks awaiting this Team Lead's endorsement. */
  queue(userId: string): Promise<Result<TaskReviewQueueView>>;
  decide(
    userId: string,
    taskId: string,
    input: TaskReviewDecisionInput,
  ): Promise<Result<TaskReviewStateView>>;
}

/* ------------------------------------------------------------------------- */
/* Labels                                                                    */
/* ------------------------------------------------------------------------- */

export const TASK_REVIEW_LABEL: Readonly<Record<TaskReviewState, string>> = {
  not_required: 'Assigned',
  pending_review: 'Awaiting review',
  approved: 'Approved',
  rejected: 'Not approved',
};
