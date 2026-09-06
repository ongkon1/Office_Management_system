/**
 * Mock task-review service (`FE-0780`–`FE-0784`).
 *
 * Two operations with one rule between them: an employee may raise a task for
 * themselves, and it accepts no time until their own Team Lead endorses it.
 *
 * The endorsement is enforced in three places on purpose, because each covers a
 * gap the others leave:
 *
 * - `selectableTasks` keeps it out of the dropdown — convenience.
 * - `validation.ts` refuses a submitted `taskId` — the control, since a task id
 *   can be posted without ever opening the dropdown.
 * - `decide` here refuses a Team Lead who is not *this* employee's Team Lead —
 *   so endorsement cannot be obtained from someone with no authority over them.
 */

import type {
  EmployeeTaskFormInput,
  EmployeeTaskOptionsView,
  TaskReviewQueueView,
  TaskReviewRowView,
  TaskReviewService,
  TaskReviewStateView,
} from '@/contracts/task-review';
import { TASK_REVIEW_LABEL } from '@/contracts/task-review';
import type { Task, TaskReviewState } from '@/contracts/domain';
import type { FieldError } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatDate, formatTimestamp, parseIsoDate } from '@/lib/format';
import { toDurationView } from '@/lib/status';
import { DEMO_TODAY, PROJECTS } from '@/fixtures';
import { mockStore } from './store';
import { DIVISIONS } from './accounts';
import { effectiveDivisionIds } from './organization';
import { employeeName, teamLeadOf, viewerOf } from './approval-chain';

const LATENCY_MS = 140;
const delay = () => new Promise((resolve) => setTimeout(resolve, LATENCY_MS));

function notFound() {
  return {
    status: 'not_found' as const,
    code: 'NOT_FOUND' as const,
    message: 'Task not found.',
    resource: 'task',
  };
}

function denied(message: string, guidance: string) {
  return { status: 'permission_denied' as const, code: 'FORBIDDEN' as const, message, guidance };
}

function conflict(message: string, guidance: string) {
  return { status: 'conflict' as const, code: 'CONFLICT' as const, message, guidance };
}

function invalid(fieldErrors: readonly FieldError[]) {
  return {
    status: 'validation_failure' as const,
    code: 'VALIDATION_FAILED' as const,
    message:
      fieldErrors.length === 1
        ? fieldErrors[0].message
        : `${fieldErrors.length} fields need attention before this can be submitted.`,
    focusField: fieldErrors[0]?.field,
    fieldErrors,
  };
}

/**
 * The review state as the person reading it needs to understand it.
 *
 * `detail` exists because the state word alone does not answer the question an
 * employee actually has, which is "can I record time against this yet".
 */
export function toReviewStateView(task: Task): TaskReviewStateView {
  const reviewerName = task.reviewerEmployeeId ? employeeName(task.reviewerEmployeeId) : null;
  const reviewedAtLabel = task.reviewedAt ? formatTimestamp(task.reviewedAt) : null;

  const detail: Record<TaskReviewState, string> = {
    not_required: 'Assigned by your Team Lead.',
    pending_review:
      'You raised this. Your Team Lead reviews it before you can record time against it.',
    approved: 'Your Team Lead approved this. You can record time against it.',
    rejected: 'Your Team Lead did not approve this, so it cannot receive time.',
  };

  return {
    state: task.reviewState,
    label: TASK_REVIEW_LABEL[task.reviewState],
    detail: detail[task.reviewState],
    blocksTimeEntry: task.reviewState === 'pending_review' || task.reviewState === 'rejected',
    reviewerName,
    reviewedAtLabel,
    note: task.reviewNote,
  };
}

function projectRef(projectId: string) {
  return PROJECTS.find((project) => project.id === projectId);
}

function divisionCode(divisionId: string): string {
  const division = DIVISIONS[divisionId as keyof typeof DIVISIONS];
  return division ? division.code : divisionId.toUpperCase();
}

function toReviewRow(task: Task): TaskReviewRowView {
  const project = projectRef(task.projectId);
  return {
    id: task.id,
    title: task.title,
    projectLabel: project ? `${project.code} · ${project.name}` : task.projectId,
    divisionCode: divisionCode(task.divisionId),
    requestedByName: employeeName(task.creatorEmployeeId),
    priority: task.priority,
    dueDateLabel: task.dueDate ? formatDate(task.dueDate) : null,
    estimated: toDurationView(task.estimatedMinutes),
    description: task.description,
    requestedAtLabel: formatTimestamp(task.createdAt),
    href: `/tasks/${task.id}`,
  };
}

/** Tasks this Team Lead is the reviewer for and that are still undecided. */
function pendingFor(leadEmployeeId: string): readonly Task[] {
  return mockStore
    .tasks()
    .filter(
      (task) =>
        task.reviewState === 'pending_review' &&
        teamLeadOf(task.creatorEmployeeId) === leadEmployeeId,
    );
}

function validate(input: EmployeeTaskFormInput, allowedProjectIds: readonly string[]): FieldError[] {
  const errors: FieldError[] = [];

  if (!input.title.trim()) {
    errors.push({
      field: 'title',
      code: 'REQUIRED',
      message: 'Task title is required.',
      guidance: 'Enter a short, specific title, for example "Refactor the import script".',
    });
  }

  if (!input.projectId.trim()) {
    errors.push({
      field: 'projectId',
      code: 'REQUIRED',
      message: 'Project is required.',
      guidance: 'Choose the project this work belongs to.',
    });
  } else if (!allowedProjectIds.includes(input.projectId)) {
    // Chosen from outside the employee's own divisions. Refused here rather
    // than trusted from the form, which is what makes the option list a
    // convenience instead of the control.
    errors.push({
      field: 'projectId',
      code: 'PROJECT_NOT_AVAILABLE',
      message: 'That project is not available to you.',
      guidance: 'Choose a project in a division you are assigned to.',
    });
  }

  const due = input.dueDate.trim();
  if (due && !parseIsoDate(due)) {
    errors.push({
      field: 'dueDate',
      code: 'INVALID_DATE',
      message: 'Due date is not a date.',
      guidance: 'Use the format YYYY-MM-DD, for example 2026-09-30.',
    });
  } else if (due && due < DEMO_TODAY) {
    errors.push({
      field: 'dueDate',
      code: 'PAST_DUE_DATE',
      message: 'The due date is in the past.',
      guidance: 'Choose today or a later date, or leave it empty.',
    });
  }

  const hours = input.estimatedHours.trim();
  if (!hours) {
    errors.push({
      field: 'estimatedHours',
      code: 'REQUIRED',
      message: 'Estimate is required.',
      guidance: 'Enter roughly how many hours you expect this to take, for example 6.',
    });
  } else if (!/^\d+(\.\d+)?$/.test(hours) || Number(hours) <= 0) {
    errors.push({
      field: 'estimatedHours',
      code: 'INVALID_ESTIMATE',
      message: 'Estimate must be a positive number of hours.',
      guidance: 'Enter digits only, for example 6 or 6.5.',
    });
  } else if (Number(hours) > 500) {
    errors.push({
      field: 'estimatedHours',
      code: 'ESTIMATE_TOO_LARGE',
      message: 'That estimate is larger than any single task should be.',
      guidance: 'Split the work into smaller tasks, each under 500 hours.',
    });
  }

  return errors;
}

let sequence = 500;
const nextId = () => `tsk-${(sequence += 1)}`;

export const mockTaskReviewService: TaskReviewService = {
  async options(userId) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    const role = viewer.primaryRole;
    if (role !== 'employee') {
      return success({
        projects: [],
        canCreate: false,
        createBlockedReason:
          role === 'team_lead'
            ? 'You create tasks directly from the team task board, without review.'
            : 'Only an employee raises a task for review.',
        reviewerName: null,
        maxDueDateHint: DEMO_TODAY,
      } satisfies EmployeeTaskOptionsView);
    }

    // Only projects in divisions the employee is assigned to today, and only
    // ones still accepting time (`REQ-WORK-008`).
    const divisions = effectiveDivisionIds(viewer.employeeId, DEMO_TODAY);
    const projects = PROJECTS.filter(
      (project) =>
        divisions.includes(project.divisionId) && project.isActive && project.acceptsTimeEntries,
    );

    const leadId = teamLeadOf(viewer.employeeId);
    return success({
      projects: projects.map((project) => ({
        value: project.id,
        label: `${project.code} · ${project.name}`,
      })),
      canCreate: leadId !== null && projects.length > 0,
      createBlockedReason:
        leadId === null
          ? 'You have no Team Lead assigned, so a task you raise has nobody to review it. Contact HR.'
          : projects.length === 0
            ? 'You are not assigned to a division with an active project.'
            : null,
      reviewerName: leadId ? employeeName(leadId) : null,
      maxDueDateHint: DEMO_TODAY,
    } satisfies EmployeeTaskOptionsView);
  },

  async create(userId, input) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    if (viewer.primaryRole !== 'employee') {
      return denied(
        'Only an employee raises a task for review.',
        'A Team Lead creates tasks directly from the team task board.',
      );
    }

    const leadId = teamLeadOf(viewer.employeeId);
    if (!leadId) {
      return conflict(
        'You have no Team Lead assigned, so this task has nobody to review it.',
        'Ask HR to record your Team Lead, then raise the task again.',
      );
    }

    const divisions = effectiveDivisionIds(viewer.employeeId, DEMO_TODAY);
    const allowed = PROJECTS.filter(
      (project) =>
        divisions.includes(project.divisionId) && project.isActive && project.acceptsTimeEntries,
    ).map((project) => project.id);

    const errors = validate(input, allowed);
    if (errors.length > 0) return invalid(errors);

    const project = projectRef(input.projectId);
    if (!project) return notFound();

    const now = `${DEMO_TODAY}T09:00:00+06:00`;
    const task: Task = {
      id: nextId(),
      title: input.title.trim(),
      divisionId: project.divisionId,
      projectId: project.id,
      // An employee raises a task for themselves; there is no assignee to pick.
      assigneeEmployeeId: viewer.employeeId,
      supportingMemberIds: [],
      creatorEmployeeId: viewer.employeeId,
      priority: input.priority,
      startDate: null,
      dueDate: input.dueDate.trim() || null,
      completedDate: null,
      estimatedMinutes: Math.round(Number(input.estimatedHours.trim()) * 60),
      description: input.description.trim() || null,
      status: 'pending',
      reviewState: 'pending_review',
      reviewerEmployeeId: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      createdBy: { userId, displayName: viewer.fullName },
      updatedAt: now,
      updatedBy: { userId, displayName: viewer.fullName },
    };

    mockStore.addTask(task as ReturnType<typeof mockStore.tasks>[number]);
    return success({ id: task.id });
  },

  async queue(userId) {
    await delay();
    const viewer = viewerOf(userId);
    if (!viewer) return notFound();

    // Only a Team Lead has a queue. Everyone else gets an empty one rather
    // than an error, so a shared dashboard tile needs no role branch.
    const rows =
      viewer.primaryRole === 'team_lead'
        ? pendingFor(viewer.employeeId).map(toReviewRow)
        : [];

    const view: TaskReviewQueueView = {
      rows,
      awaitingCount: rows.length,
      href: '/tasks',
    };
    return success(view);
  },

  async decide(userId, taskId, input) {
    await delay();
    const viewer = viewerOf(userId);
    const task = mockStore.findTask(taskId);
    if (!viewer || !task) return notFound();

    if (task.reviewState !== 'pending_review') {
      return conflict(
        task.reviewState === 'not_required'
          ? 'This task was assigned, not raised for review.'
          : `This task has already been ${task.reviewState === 'approved' ? 'approved' : 'reviewed'}.`,
        'Reload the page to see the recorded decision.',
      );
    }

    // The reviewer must be this employee's own Team Lead. Any other Team Lead
    // has no authority over them, and endorsement obtained elsewhere would be
    // worth nothing.
    if (
      viewer.primaryRole !== 'team_lead' ||
      teamLeadOf(task.creatorEmployeeId) !== viewer.employeeId
    ) {
      return denied(
        'This task is not waiting for your review.',
        'Only the Team Lead the person reports to can approve a task they raised.',
      );
    }

    if (input.decision === 'rejected' && !input.note.trim()) {
      return invalid([
        {
          field: 'note',
          code: 'REQUIRED',
          message: 'A note is required when not approving.',
          guidance: 'Say why, so the person who raised it knows what to do instead.',
        },
      ]);
    }

    const next: Task = {
      ...task,
      reviewState: input.decision,
      reviewerEmployeeId: viewer.employeeId,
      reviewedAt: `${DEMO_TODAY}T11:30:00+06:00`,
      reviewNote: input.note.trim() || null,
      updatedAt: `${DEMO_TODAY}T11:30:00+06:00`,
      updatedBy: { userId, displayName: viewer.fullName },
    };

    mockStore.updateTask(task.id, next as ReturnType<typeof mockStore.tasks>[number]);
    return success(toReviewStateView(next));
  },
};

/** Test seam mirroring the other mock services. */
export function resetTaskReviewState(): void {
  sequence = 500;
}
