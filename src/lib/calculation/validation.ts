/**
 * Time-entry validation.
 *
 * Every rule here returns a field path, a message, and corrective guidance,
 * because `REQ-TIME-025` requires a validation response to identify the
 * affected field *and* state how to fix it. A message without guidance is an
 * incomplete implementation of that requirement, not a style choice.
 */

import { taskAcceptsTime } from '@/contracts/domain';
import type {
  DurationMinutes,
  IsoDate,
  Project,
  Task,
  TimeEntry,
  WorkPolicy,
} from '@/contracts/domain';
import type { FieldError } from '@/contracts/results';
import type { WorkLog, WorkLogInput } from '@/contracts/work-log';
import { formatTimeRange, formatDuration } from '@/lib/format';
import type { LeaveContext } from './engine';
import { calculateDay, requiresCriticalExplanation, requiresOvertimeReason } from './engine';
import { clockInstant, elapsedMinutes, localParts } from './instants';

export interface EntryDraft {
  readonly id?: string;
  readonly employeeId: string;
  readonly workDate: IsoDate;
  readonly divisionId: string;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly entryMethod: 'manual_clock' | 'manual_duration';
  readonly workLocation: string;
  /** `HH:mm` local clock values for clock-based entries. */
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly activeMinutes: DurationMinutes | null;
  readonly workDescription: string;
  readonly completedWork: string;
  readonly overtimeReason: string | null;
  readonly criticalExplanation: string | null;
}

export interface ValidationContext {
  readonly policy: WorkPolicy;
  /** Entries already saved for this employee and date. */
  readonly existingEntries: readonly TimeEntry[];
  /** Divisions the employee is assigned to, effective on the work date. */
  readonly effectiveDivisionIds: readonly string[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  readonly leave?: LeaveContext | null;
  readonly holidayName?: string | null;
  readonly isPeriodLocked?: boolean;
  readonly breakOverrideMinutes?: DurationMinutes | null;
}

/** Converts `HH:mm` into minutes past midnight, or null when unparseable. */
export function parseClock(value: string | null): number | null {
  if (!value) return null;
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23) return null;
  return hours * 60 + minutes;
}

/**
 * Duration implied by the draft.
 *
 * A clock range that ends before it starts is treated as zero rather than
 * silently wrapping past midnight — cross-midnight work is a policy decision
 * (`REQ-TIME-028`), not something to infer from a typo.
 */
export function draftMinutes(draft: EntryDraft, timezone = 'Asia/Dhaka'): DurationMinutes {
  if (draft.entryMethod === 'manual_duration') {
    return draft.activeMinutes ?? 0;
  }
  const start = parseClock(draft.startTime);
  const end = parseClock(draft.endTime);
  if (start === null || end === null || end <= start) return 0;
  const from = clockInstant(draft.workDate, draft.startTime!, timezone);
  const to = clockInstant(draft.workDate, draft.endTime!, timezone);
  return from && to ? elapsedMinutes(from, to) : 0;
}

function overlaps(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean {
  // Touching ranges do not overlap: 09:00-11:00 and 11:00-12:00 are fine.
  return aStart < bEnd && bStart < aEnd;
}

function entryClockRange(entry: TimeEntry, timezone: string): { start: number; end: number } | null {
  if (!entry.startTime || !entry.endTime) return null;
  const start = new Date(entry.startTime);
  const end = new Date(entry.endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return {
    start: localParts(entry.startTime, timezone).minutes,
    end: localParts(entry.endTime, timezone).minutes,
  };
}

/**
 * Validates a draft entry against every rule in `REQ-TIME-020` to `-025`.
 *
 * Returns field errors in the order the fields appear in the form, so focus
 * moves top-down when the user activates an error summary.
 */
export function validateEntry(
  draft: EntryDraft,
  context: ValidationContext,
): readonly FieldError[] {
  const errors: FieldError[] = [];
  const {
    policy,
    existingEntries,
    effectiveDivisionIds,
    projects,
    tasks,
    leave,
    holidayName,
    isPeriodLocked,
    breakOverrideMinutes,
  } = context;

  // --- Locked period (`REQ-TIME-027`) ------------------------------------
  if (isPeriodLocked) {
    errors.push({
      field: 'workDate',
      code: 'PERIOD_LOCKED',
      message: 'This period has been verified by HR and is locked.',
      guidance: 'Request an amendment with a reason instead of editing directly.',
    });
    return errors;
  }

  // --- Division (`REQ-TIME-023`, `REQ-DATA-002`) --------------------------
  if (!draft.divisionId) {
    errors.push({
      field: 'divisionId',
      code: 'DIVISION_REQUIRED',
      message: 'A division is required.',
      guidance: 'Choose the division this work belongs to.',
    });
  } else if (!effectiveDivisionIds.includes(draft.divisionId)) {
    errors.push({
      field: 'divisionId',
      code: 'DIVISION_NOT_EFFECTIVE',
      message: 'You were not assigned to this division on this date.',
      guidance:
        'Pick a division your assignment covers on this date, or ask HR to extend the assignment.',
    });
  }

  // --- Project (`REQ-WORK-008`) ------------------------------------------
  const project = draft.projectId
    ? projects.find((item) => item.id === draft.projectId)
    : null;

  if (draft.projectId && !project) {
    errors.push({
      field: 'projectId',
      code: 'PROJECT_NOT_FOUND',
      message: 'That project is not available to you.',
      guidance: 'Choose a project from the list for the selected division.',
    });
  } else if (project) {
    if (!project.acceptsTimeEntries || !project.isActive) {
      errors.push({
        field: 'projectId',
        code: 'PROJECT_INACTIVE',
        message: `${project.name} is not accepting new time.`,
        guidance: 'Choose an active project, or ask your Team Lead to reopen it.',
      });
    }
    if (project.divisionId !== draft.divisionId) {
      errors.push({
        field: 'projectId',
        code: 'PROJECT_DIVISION_MISMATCH',
        message: 'That project belongs to a different division.',
        guidance: 'Choose a project from the selected division.',
      });
    }
  }

  // --- Task (`REQ-DATA-003`) ---------------------------------------------
  if (draft.taskId) {
    const task = tasks.find((item) => item.id === draft.taskId);
    if (!task) {
      errors.push({
        field: 'taskId',
        code: 'TASK_NOT_FOUND',
        message: 'That task is not available to you.',
        guidance: 'Choose a task from the selected project.',
      });
    } else if (draft.projectId && task.projectId !== draft.projectId) {
      errors.push({
        field: 'taskId',
        code: 'TASK_PROJECT_MISMATCH',
        message: 'That task belongs to a different project.',
        guidance: 'Choose a task from the selected project.',
      });
    } else if (!taskAcceptsTime(task)) {
      /*
       * A task an employee raised for themselves accepts no time until their
       * Team Lead has endorsed it. Without this, someone could invent a task,
       * record a full day against it, and have the review happen after the
       * hours already exist — the same reason an inactive project refuses time
       * (`REQ-WORK-008`). Filtering the dropdown is not the control; this is.
       */
      errors.push({
        field: 'taskId',
        code:
          task.reviewState === 'rejected' ? 'TASK_REVIEW_REJECTED' : 'TASK_AWAITING_REVIEW',
        message:
          task.reviewState === 'rejected'
            ? 'That task was not approved by your Team Lead.'
            : 'That task is still waiting for your Team Lead to review it.',
        guidance:
          task.reviewState === 'rejected'
            ? 'Choose a different task, or raise a new one.'
            : 'Record this time once the task is approved, or choose another task.',
      });
    }
  }

  // --- Leave and holiday conflicts (`REQ-TIME-024`) ----------------------
  if (leave?.portion === 'full_day') {
    errors.push({
      field: 'workDate',
      code: 'LEAVE_CONFLICT',
      message: 'You have approved full-day leave on this date.',
      guidance:
        'Pick a different date, or ask HR to amend the leave record if you did work.',
    });
  }
  if (holidayName) {
    errors.push({
      field: 'workDate',
      code: 'HOLIDAY_CONFLICT',
      message: `${holidayName} is a holiday.`,
      guidance:
        'Recording time on a holiday needs HR confirmation. Add a note explaining the work.',
    });
  }

  // --- Times and duration (`REQ-TIME-021`) --------------------------------
  const minutes = draftMinutes(draft, policy.businessTimezone);

  if (draft.entryMethod === 'manual_clock') {
    const start = parseClock(draft.startTime);
    const end = parseClock(draft.endTime);

    if (start === null) {
      errors.push({
        field: 'startTime',
        code: 'START_REQUIRED',
        message: 'A start time is required.',
        guidance: 'Enter the time you began, for example 09:00.',
      });
    }
    if (end === null) {
      errors.push({
        field: 'endTime',
        code: 'END_REQUIRED',
        message: 'An end time is required.',
        guidance: 'Enter the time you finished, for example 12:30.',
      });
    }
    if (start !== null && end !== null && end <= start) {
      errors.push({
        field: 'endTime',
        code: 'END_BEFORE_START',
        message: 'The end time must be after the start time.',
        guidance: `Change it to a time after ${draft.startTime}.`,
      });
    }
  } else if (minutes <= 0) {
    errors.push({
      field: 'activeMinutes',
      code: 'DURATION_REQUIRED',
      message: 'A duration is required.',
      guidance: 'Enter how long you worked, for example 3:00.',
    });
  }

  // --- Overlap, across divisions too (`REQ-TIME-020`, `AC-CALC-005`) ------
  if (draft.entryMethod === 'manual_clock') {
    const start = parseClock(draft.startTime);
    const end = parseClock(draft.endTime);

    if (start !== null && end !== null && end > start) {
      for (const existing of existingEntries) {
        if (existing.id === draft.id) continue;
        const range = entryClockRange(existing, policy.businessTimezone);
        if (!range) continue;

        if (overlaps(start, end, range.start, range.end)) {
          errors.push({
            field: 'startTime',
            code: 'OVERLAPPING_ENTRY',
            message: `This overlaps an existing entry, ${formatTimeRange(
              existing.startTime ?? '',
              existing.endTime ?? '',
            )}.`,
            // An employee cannot be in two places at once, so the conflict
            // stands even when the divisions differ.
            guidance:
              'Adjust the times so they do not overlap. Entries in different divisions still cannot overlap.',
            relatedRecordId: existing.id,
          });
          break;
        }
      }
    }
  }

  // --- Duplicates (`REQ-TIME-021`) ---------------------------------------
  const duplicate = existingEntries.find(
    (existing) =>
      existing.id !== draft.id &&
      existing.divisionId === draft.divisionId &&
      existing.projectId === draft.projectId &&
      existing.taskId === draft.taskId &&
      existing.activeMinutes === minutes &&
      existing.workDescription.trim() === draft.workDescription.trim(),
  );
  if (duplicate) {
    errors.push({
      field: 'workDescription',
      code: 'DUPLICATE_ENTRY',
      message: 'An identical entry already exists for this date.',
      guidance: 'Edit the existing entry instead, or describe what was different.',
      relatedRecordId: duplicate.id,
    });
  }

  // --- Required content (`REQ-TIME-022`) ---------------------------------
  if (draft.workDescription.trim().length === 0) {
    errors.push({
      field: 'workDescription',
      code: 'DESCRIPTION_REQUIRED',
      message: 'A work description is required.',
      guidance: 'Describe what you worked on.',
    });
  }
  if (draft.completedWork.trim().length === 0) {
    errors.push({
      field: 'completedWork',
      code: 'COMPLETED_WORK_REQUIRED',
      message: 'Completed work is required.',
      guidance: 'Describe the outcome, not only the activity.',
    });
  }

  // --- Overtime and critical explanations (`REQ-TIME-018`, `-019`) -------
  const candidate = {
    id: draft.id ?? 'preview', employeeId: draft.employeeId, workDate: draft.workDate,
    divisionId: draft.divisionId, projectId: draft.projectId, taskId: draft.taskId,
    activeMinutes: minutes, workLocation: draft.workLocation,
  } as TimeEntry;
  const dayTotal = calculateDay({
    employeeId: draft.employeeId, workDate: draft.workDate, policy,
    entries: [...existingEntries.filter((entry) => entry.id !== draft.id), candidate],
    breakOverrideMinutes, leave, holidayName,
  }).totalMinutes;

  if (requiresOvertimeReason(dayTotal, policy) && !draft.overtimeReason?.trim()) {
    errors.push({
      field: 'overtimeReason',
      code: 'OVERTIME_REASON_REQUIRED',
      message: `This brings the day to ${formatDuration(dayTotal)}, above eight hours.`,
      guidance: 'Give a reason for the overtime.',
    });
  }

  if (
    requiresCriticalExplanation(dayTotal, policy) &&
    !draft.criticalExplanation?.trim()
  ) {
    errors.push({
      field: 'criticalExplanation',
      code: 'CRITICAL_EXPLANATION_REQUIRED',
      message: `This brings the day to ${formatDuration(dayTotal)}, above twelve hours.`,
      guidance:
        'Explain why. Your Team Lead and HR are notified for days above twelve hours.',
    });
  }

  return errors;
}

/** Context used to validate new duration-only task work logs. */
export interface WorkLogValidationContext {
  readonly policy: WorkPolicy;
  readonly existingWorkLogs: readonly WorkLog[];
  readonly historicalEntries?: readonly TimeEntry[];
  readonly effectiveDivisionIds: readonly string[];
  readonly projects: readonly Project[];
  readonly tasks: readonly Task[];
  /** Additional tasks explicitly made available to this employee. */
  readonly availableTaskIds?: readonly string[];
  readonly leave?: LeaveContext | null;
  readonly holidayName?: string | null;
  readonly isPeriodLocked?: boolean;
  readonly breakOverrideMinutes?: DurationMinutes | null;
  readonly excludeWorkLogId?: string;
}

function workLogError(
  field: string,
  code: string,
  message: string,
  guidance: string,
  relatedRecordId?: string,
): FieldError {
  return relatedRecordId
    ? { field, code, message, guidance, relatedRecordId }
    : { field, code, message, guidance };
}

/**
 * Validates new task-based work. Clock ranges and overlap are intentionally
 * absent: a duration-only record cannot prove when work occurred.
 */
export function validateWorkLog(
  draft: WorkLogInput,
  context: WorkLogValidationContext,
): readonly FieldError[] {
  const errors: FieldError[] = [];
  const {
    policy,
    existingWorkLogs,
    historicalEntries = [],
    effectiveDivisionIds,
    projects,
    tasks,
    availableTaskIds = [],
    leave,
    holidayName,
    isPeriodLocked,
    breakOverrideMinutes,
    excludeWorkLogId,
  } = context;

  if (isPeriodLocked) {
    return [workLogError(
      'workDate',
      'PERIOD_LOCKED',
      'This period has been verified by HR and is locked.',
      'Request an amendment with a reason instead of editing the work log directly.',
    )];
  }

  if (!draft.divisionId) {
    errors.push(workLogError('divisionId', 'DIVISION_REQUIRED', 'A division is required.', 'Choose the division this work belongs to.'));
  } else if (!effectiveDivisionIds.includes(draft.divisionId)) {
    errors.push(workLogError('divisionId', 'DIVISION_NOT_EFFECTIVE', 'You were not assigned to this division on this date.', 'Choose an effective division assignment or ask HR to update it.'));
  }

  const project = projects.find((item) => item.id === draft.projectId);
  if (!draft.projectId || !project) {
    errors.push(workLogError('projectId', 'PROJECT_NOT_FOUND', 'That project is not available to you.', 'Choose an active project from the selected division.'));
  } else {
    if (!project.isActive || !project.acceptsTimeEntries) {
      errors.push(workLogError('projectId', 'PROJECT_INACTIVE', `${project.name} is not accepting new work.`, 'Choose an active project, or ask your Team Lead to reopen it.'));
    }
    if (project.divisionId !== draft.divisionId) {
      errors.push(workLogError('projectId', 'PROJECT_DIVISION_MISMATCH', 'That project belongs to a different division.', 'Choose a project from the selected division.'));
    }
  }

  const task = tasks.find((item) => item.id === draft.taskId);
  if (!draft.taskId || !task) {
    errors.push(workLogError('taskId', 'TASK_NOT_FOUND', 'That task is not available to you.', 'Choose an assigned In Progress task.'));
  } else {
    if (task.projectId !== draft.projectId || task.divisionId !== draft.divisionId) {
      errors.push(workLogError('taskId', 'TASK_PROJECT_MISMATCH', 'That task does not belong to the selected project and division.', 'Choose a task from the selected project.'));
    }

    const assigned =
      task.assigneeEmployeeId === draft.employeeId ||
      task.supportingMemberIds.includes(draft.employeeId) ||
      availableTaskIds.includes(task.id);
    if (!assigned) {
      errors.push(workLogError('taskId', 'TASK_NOT_ASSIGNED', 'That task is not assigned or available to you.', 'Choose one of your assigned tasks, or ask your Team Lead to assign it.'));
    }

    if (!taskAcceptsTime(task)) {
      const statusCode =
        task.status === 'completed'
          ? 'TASK_COMPLETED'
          : task.status === 'pending'
            ? 'TASK_NOT_STARTED'
            : task.reviewState === 'rejected'
              ? 'TASK_REVIEW_REJECTED'
              : 'TASK_AWAITING_REVIEW';
      const guidance =
        task.status === 'completed'
          ? 'Reopen the task with a reason before logging more work.'
          : task.status === 'pending'
            ? 'Start the task before logging work.'
            : 'Wait for Team Lead review, or choose another task.';
      errors.push(workLogError('taskId', statusCode, 'That task cannot receive work yet.', guidance));
    }
  }

  if (!Number.isSafeInteger(draft.durationMinutes) || draft.durationMinutes <= 0) {
    errors.push(workLogError('durationMinutes', 'DURATION_REQUIRED', 'A positive duration is required.', 'Enter the active duration as H:MM, for example 3:00.'));
  }

  if (!draft.idempotencyKey.trim()) {
    errors.push(workLogError('idempotencyKey', 'IDEMPOTENCY_KEY_REQUIRED', 'This work log is missing its retry key.', 'Retry from the form so the save can be safely deduplicated.'));
  } else {
    const duplicate = existingWorkLogs.find(
      (item) =>
        item.id !== excludeWorkLogId &&
        item.idempotencyKey === draft.idempotencyKey,
    );
    if (duplicate) {
      errors.push(workLogError('idempotencyKey', 'DUPLICATE_SUBMISSION', 'This work log has already been saved.', 'Use the original saved work log instead of submitting it again.', duplicate.id));
    }
  }

  const currentMinutes =
    existingWorkLogs
      .filter((item) => item.id !== excludeWorkLogId && item.state !== 'draft')
      .reduce((sum, item) => sum + item.durationMinutes, 0) +
    historicalEntries
      .filter((item) => item.state !== 'draft')
      .reduce((sum, item) => sum + item.activeMinutes, 0);
  if (
    Number.isSafeInteger(draft.durationMinutes) &&
    draft.durationMinutes > 0 &&
    currentMinutes + draft.durationMinutes > 24 * 60
  ) {
    errors.push(workLogError('durationMinutes', 'DAILY_ACTIVE_LIMIT', 'This work log would raise the day above 24:00 active work.', `Enter no more than ${formatDuration(Math.max(0, 24 * 60 - currentMinutes))}, or correct an existing work log first.`));
  }

  if (leave?.portion === 'full_day') {
    errors.push(workLogError('workDate', 'LEAVE_CONFLICT', 'You have approved full-day leave on this date.', 'Choose another date, or ask HR to amend the leave record if you worked.'));
  }
  if (holidayName) {
    errors.push(workLogError('workDate', 'HOLIDAY_CONFLICT', `${holidayName} is a holiday.`, 'Ask HR to confirm holiday work before saving it.'));
  }
  if (!draft.workDescription.trim()) {
    errors.push(workLogError('workDescription', 'DESCRIPTION_REQUIRED', 'A work description is required.', 'Describe what you worked on.'));
  }
  if (!draft.completedWork.trim()) {
    errors.push(workLogError('completedWork', 'COMPLETED_WORK_REQUIRED', 'Completed work is required.', 'Describe the outcome, not only the activity.'));
  }

  if (Number.isSafeInteger(draft.durationMinutes) && draft.durationMinutes > 0) {
    const actor = { userId: 'preview', displayName: 'Preview' };
    const stamp = `${draft.workDate}T00:00:00+06:00`;
    const candidate: WorkLog = {
      ...draft,
      id: 'preview',
      state: 'saved',
      policyVersion: policy.version,
      createdAt: stamp,
      createdBy: actor,
      updatedAt: stamp,
      updatedBy: actor,
    };
    const dayTotal = calculateDay({
      employeeId: draft.employeeId,
      workDate: draft.workDate,
      policy,
      workLogs: [
        ...existingWorkLogs.filter((item) => item.id !== excludeWorkLogId && item.state !== 'draft'),
        candidate,
      ],
      historicalEntries,
      breakOverrideMinutes,
      leave,
      holidayName,
    }).totalMinutes;

    if (requiresOvertimeReason(dayTotal, policy) && !draft.overtimeReason?.trim()) {
      errors.push(workLogError('overtimeReason', 'OVERTIME_REASON_REQUIRED', `This brings the day to ${formatDuration(dayTotal)}, above eight hours.`, 'Give a reason for the overtime.'));
    }
    if (requiresCriticalExplanation(dayTotal, policy) && !draft.criticalExplanation?.trim()) {
      errors.push(workLogError('criticalExplanation', 'CRITICAL_EXPLANATION_REQUIRED', `This brings the day to ${formatDuration(dayTotal)}, above twelve hours.`, 'Explain why. Your Team Lead and HR are notified for days above twelve hours.'));
    }
  }

  return errors;
}
