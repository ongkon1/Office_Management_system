import type { TaskReviewState } from '@/contracts/domain';
import type { Result } from '@/contracts/results';
import { businessToday } from '@/lib/business-date';

export interface RaisedTask {
  readonly id: string;
  readonly creatorEmployeeId: string;
  readonly reviewState: TaskReviewState;
  readonly version: number;
}

export interface TaskReviewRepository {
  employeeForUser(userId: string): Promise<{
    id: string;
    leadEmployeeId: string | null;
    divisionIds: readonly string[];
    isTeamLead: boolean;
  } | null>;
  reviewActorForUser(userId: string): Promise<{
    employeeId: string | null;
    isSuperAdministrator: boolean;
  } | null>;
  currentLeadForEmployee(employeeId: string): Promise<string | null>;
  projectAvailable(projectId: string, employeeId: string, divisionIds: readonly string[]): Promise<boolean>;
  insertSelfTask(input: {
    employeeId: string;
    projectId: string;
    title: string;
    priority: string;
    dueDate: string;
    estimatedMinutes: number;
    description: string;
    requiresReview: boolean;
  }): Promise<string>;
  find(taskId: string): Promise<RaisedTask | null>;
  decideAtomic(input: {
    taskId: string;
    expectedVersion: number;
    reviewerEmployeeId: string;
    outcome: 'approved' | 'rejected';
    note: string | null;
    idempotencyKey: string;
  }): Promise<'applied' | 'replayed' | 'conflict'>;
  reopenRejected(input: {
    taskId: string;
    expectedVersion: number;
  }): Promise<boolean>;
}

export interface TaskReviewEffects {
  audit(input: {
    action: string;
    actorUserId: string;
    taskId: string;
    before: unknown;
    after: unknown;
    reason: string | null;
  }): Promise<void>;
  notify(input: { recipientEmployeeId: string; type: string; taskId: string; occurrenceKey?: string }): Promise<void>;
}

const validation = (field: string, code: string, message: string, guidance: string) => ({
  status: 'validation_failure' as const,
  code: 'VALIDATION_FAILED' as const,
  message: 'Review the highlighted fields.',
  fieldErrors: [{ field, code, message, guidance }],
  focusField: field,
});

const notFound = () => ({
  status: 'not_found' as const,
  code: 'NOT_FOUND' as const,
  message: 'Task was not found.',
  resource: 'task',
});

export class TaskReviewApplicationService {
  constructor(
    private repo: TaskReviewRepository,
    private effects: TaskReviewEffects,
    private readonly currentDate = businessToday,
  ) {}

  async raise(
    userId: string,
    input: {
      projectId: string;
      title: string;
      priority: string;
      dueDate: string;
      estimatedHours: string;
      description: string;
    },
  ): Promise<Result<{ id: string }>> {
    const employee = await this.repo.employeeForUser(userId);
    if (!employee) {
      return {
        status: 'permission_denied',
        code: 'FORBIDDEN',
        message: 'Only an active employee or Team Lead can create a task for themselves.',
      };
    }

    const title = input.title.trim();
    if (!title || title.length > 240) {
      return validation('title', 'INVALID_TITLE', 'Enter a task title of up to 240 characters.', 'Name the outcome this task should deliver.');
    }
    if (!['low', 'medium', 'high', 'urgent'].includes(input.priority)) {
      return validation('priority', 'INVALID_PRIORITY', 'Choose a valid priority.', 'Select Low, Medium, High, or Urgent.');
    }
    // The due date is optional (the form says so); when given, it is today or later.
    if (input.dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate) || input.dueDate < this.currentDate())) {
      return validation('dueDate', 'INVALID_DUE_DATE', 'Choose today or a later due date.', 'Use the date picker to choose a valid business date.');
    }
    const description = input.description.trim();
    if (description.length > 5000) {
      return validation('description', 'DESCRIPTION_TOO_LONG', 'Keep the description under 5,000 characters.', 'Move long supporting material into a document.');
    }

    const requiresReview = !employee.isTeamLead;
    if (requiresReview && !employee.leadEmployeeId) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'No current Team Lead is assigned.',
        guidance: 'Ask HR to assign a Team Lead before raising this task.',
      };
    }
    if (!(await this.repo.projectAvailable(input.projectId, employee.id, employee.divisionIds))) {
      return validation(
        'projectId',
        'PROJECT_NOT_AVAILABLE',
        'That project is not available in your assigned divisions.',
        'Choose an active project from the list.',
      );
    }

    const hours = Number(input.estimatedHours);
    if (!Number.isFinite(hours) || hours <= 0 || (hours * 60) % 1 !== 0) {
      return validation(
        'estimatedHours',
        'INVALID_DURATION',
        'Estimated hours must resolve to whole minutes.',
        'Enter a positive value that resolves to whole minutes.',
      );
    }
    if (hours * 60 > 10_000_000) {
      return validation('estimatedHours', 'DURATION_TOO_LARGE', 'The estimate is too large.', 'Enter an estimate below 10,000,000 minutes.');
    }

    const id = await this.repo.insertSelfTask({
      employeeId: employee.id,
      projectId: input.projectId,
      title,
      priority: input.priority,
      dueDate: input.dueDate,
      estimatedMinutes: hours * 60,
      description,
      requiresReview,
    });
    const reviewState = requiresReview ? 'pending_review' : 'not_required';
    await this.effects.audit({
      action: requiresReview ? 'task.raised' : 'task.self_created',
      actorUserId: userId,
      taskId: id,
      before: null,
      after: { reviewState },
      reason: null,
    });
    if (requiresReview && employee.leadEmployeeId) {
      await this.effects.notify({
        recipientEmployeeId: employee.leadEmployeeId,
        type: 'task_review_requested',
        taskId: id,
      });
    }
    return { status: 'success', data: { id } };
  }

  async decide(
    userId: string,
    taskId: string,
    input: { decision: 'approved' | 'rejected'; note: string; idempotencyKey: string },
  ) {
    const reviewer = await this.repo.employeeForUser(userId);
    const task = await this.repo.find(taskId);
    if (!reviewer || !task || task.reviewState !== 'pending_review') return notFound();
    const currentLead = await this.repo.currentLeadForEmployee(task.creatorEmployeeId);
    if (reviewer.id !== currentLead || reviewer.id === task.creatorEmployeeId) return notFound();
    if (input.decision === 'rejected' && !input.note.trim()) {
      return validation(
        'note',
        'REJECTION_NOTE_REQUIRED',
        'Explain why the task is not approved.',
        'Enter a useful reason so the employee can raise a corrected task.',
      );
    }
    const outcome = await this.repo.decideAtomic({
      taskId,
      expectedVersion: task.version,
      reviewerEmployeeId: reviewer.id,
      outcome: input.decision,
      note: input.note.trim() || null,
      idempotencyKey: input.idempotencyKey,
    });
    if (outcome === 'conflict') {
      return {
        status: 'conflict' as const,
        code: 'CONFLICT' as const,
        message: 'This task has already been reviewed.',
        guidance: 'Refresh to see the recorded decision.',
      };
    }
    if (outcome === 'applied') {
      await this.effects.audit({
        action: input.decision === 'approved' ? 'task.approved' : 'task.refused',
        actorUserId: userId,
        taskId,
        before: { reviewState: 'pending_review' },
        after: { reviewState: input.decision },
        reason: input.note.trim() || null,
      });
      await this.effects.notify({
        recipientEmployeeId: task.creatorEmployeeId,
        type: 'task_review_decided',
        taskId,
      });
    }
    return { status: 'success' as const, data: { state: input.decision } };
  }

  async reopen(
    userId: string,
    taskId: string,
    input: { expectedVersion: number; reason: string },
  ): Promise<Result<{ state: 'pending_review' }>> {
    const actor = await this.repo.reviewActorForUser(userId);
    const task = await this.repo.find(taskId);
    if (!actor || !task) return notFound();

    const currentLead = await this.repo.currentLeadForEmployee(task.creatorEmployeeId);
    const isCurrentLead = Boolean(actor.employeeId && actor.employeeId === currentLead);
    if (!actor.isSuperAdministrator && !isCurrentLead) return notFound();
    if (task.reviewState !== 'rejected') {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'This task is no longer rejected.',
        guidance: 'Reload the task to see its current review state.',
      };
    }

    const reason = input.reason.trim();
    if (!reason || reason.length > 2_000) {
      return validation(
        'reason',
        'REOPEN_REASON_REQUIRED',
        'Enter a reason of up to 2,000 characters.',
        'Explain what changed and why this task should return to review.',
      );
    }
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'This task view is out of date.',
        guidance: 'Reload the task before reopening it.',
      };
    }

    const applied = await this.repo.reopenRejected({ taskId, expectedVersion: input.expectedVersion });
    if (!applied) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'This task changed before it could be reopened.',
        guidance: 'Reload the task and try again.',
      };
    }

    await this.effects.audit({
      action: 'task.review_reopened',
      actorUserId: userId,
      taskId,
      before: { reviewState: 'rejected', version: input.expectedVersion },
      after: { reviewState: 'pending_review', version: input.expectedVersion + 1 },
      reason,
    });
    if (currentLead && actor.employeeId !== currentLead) {
      await this.effects.notify({
        recipientEmployeeId: currentLead,
        type: 'task_review_requested',
        taskId,
        occurrenceKey: `task-review-reopened:${taskId}:${input.expectedVersion + 1}`,
      });
    }
    return { status: 'success', data: { state: 'pending_review' } };
  }
}
