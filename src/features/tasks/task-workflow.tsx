'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock3,
  GripVertical,
  History,
  ListChecks,
  PlayCircle,
  RotateCcw,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { RoleKey, TaskReviewState, TaskStatus, WorkLocation } from '@/contracts/domain';
import type { Failure } from '@/contracts/results';
import {
  canTransition,
  transitionRequiresNote,
  type TaskHistoryItemView,
} from '@/contracts/task-transition';
import type { DurationVarianceView } from '@/contracts/work-log';
import type { DurationView } from '@/contracts/view-models';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { FilterBar } from '@/components/data/filters';
import { useToast } from '@/components/feedback/toast';
import { Field } from '@/components/forms/field';
import { DurationInput, Input, SearchInput, Select, Textarea } from '@/components/forms/inputs';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { businessToday } from '@/lib/business-date';
import { formatDuration, formatTimestamp, NOT_RECORDED } from '@/lib/format';
import { TASK_STATUS_LABEL, WORK_LOCATION_LABEL } from '@/lib/status';
import { timesheetService as mockTimesheetService } from '@/services/runtime/timesheet';
import { taskReviewService as mockTaskReviewService } from '@/services/runtime/task-review';
import { useAsync } from '@/lib/use-async';

export type TaskBoardView = 'workflow' | 'rejected';
export type TaskDueFilter = 'all' | 'overdue' | 'upcoming';

export interface WorkflowBoardTask {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly href: string;
  /** `id` is what a completion work log is recorded against; optional for older callers. */
  readonly project: { readonly id?: string; readonly name: string; readonly code: string };
  readonly division: { readonly id?: string; readonly name: string; readonly code: string };
  /** Null for an unassigned task (`REQ-MTG-014`), shown as "Unassigned". */
  readonly assignee: { readonly id: string; readonly fullName: string } | null;
  readonly status: TaskStatus;
  readonly reviewState: TaskReviewState;
  readonly estimated: DurationView;
  readonly actual: DurationView;
  readonly variance: DurationVarianceView;
  readonly dueDate: string | null;
  readonly dueDateLabel: string | null;
  readonly isOverdue: boolean;
  readonly reviewBlockedReason: string | null;
  /** Whether this viewer may log against the task once it is In Progress. */
  readonly canLogWorkWhenInProgress: boolean;
}

const WORKFLOW_STATUSES = ['pending', 'in_progress', 'completed'] as const;

const BOARD_VIEWS = [
  { key: 'workflow', label: 'Workflow board' },
  { key: 'rejected', label: 'Rejected' },
] as const;

const DUE_FILTER_OPTIONS = [
  { value: 'all', label: 'All due dates' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
] as const;

const STATUS_PRESENTATION: Record<
  TaskStatus,
  { readonly tone: BadgeTone; readonly icon: typeof Circle }
> = {
  pending: { tone: 'neutral', icon: Circle },
  in_progress: { tone: 'accent', icon: PlayCircle },
  completed: { tone: 'success', icon: CheckCircle2 },
};

function matchesDueDate(task: WorkflowBoardTask, filter: TaskDueFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'overdue') return task.isOverdue;
  return task.status !== 'completed' && task.dueDate !== null && task.dueDate >= businessToday();
}

function matchesSearch(task: WorkflowBoardTask, term: string): boolean {
  const query = term.trim().toLowerCase();
  if (!query) return true;
  return [
    task.title,
    task.project.name,
    task.project.code,
    task.division.name,
    task.division.code,
    task.assignee?.fullName ?? 'Unassigned',
  ].some((value) => value.toLowerCase().includes(query));
}

function StatusBadge({ status }: { status: TaskStatus }) {
  const presentation = STATUS_PRESENTATION[status];
  const Icon = presentation.icon;
  return (
    <Badge tone={presentation.tone} icon={<Icon aria-hidden className="size-3.5" />}>
      {TASK_STATUS_LABEL[status]}
    </Badge>
  );
}

function actionLabel(from: TaskStatus, to: TaskStatus): string {
  if (from === 'pending' && to === 'completed') return 'Complete directly';
  if (to === 'in_progress' && from === 'completed') return 'Reopen';
  if (to === 'in_progress') return 'Start';
  return 'Complete';
}

function actionIcon(from: TaskStatus, to: TaskStatus) {
  if (from === 'completed' && to === 'in_progress') {
    return <RotateCcw aria-hidden className="size-4" />;
  }
  if (to === 'completed') return <CheckCircle2 aria-hidden className="size-4" />;
  return <PlayCircle aria-hidden className="size-4" />;
}

function transitionTargets(task: WorkflowBoardTask, actorRole: RoleKey): readonly TaskStatus[] {
  if (task.reviewState === 'rejected') return [];
  return WORKFLOW_STATUSES.filter((status) => {
    if (status === task.status || !canTransition(task.status, status, actorRole)) return false;
    if (
      task.status === 'pending' &&
      status === 'in_progress' &&
      task.reviewBlockedReason
    ) {
      return false;
    }
    return true;
  });
}

function LatestTransitionNote({ task }: { task: WorkflowBoardTask }) {
  const { state } = useAsync(
    () => mockTimesheetService.getTaskHistory(task.id),
    [task.id, task.status],
    { keepPrevious: true },
  );

  if (state.status === 'loading') {
    return <Skeleton height="1rem" width="75%" className="mt-3" />;
  }
  if (state.status !== 'success') {
    return <p className="mt-3 text-caption text-ink-subtle">Latest note unavailable</p>;
  }
  const latest = [...state.data.items]
    .reverse()
    .find((item) => item.kind === 'transition' && item.transition.note);
  return (
    <p className="mt-3 line-clamp-2 text-caption text-ink-muted">
      <span className="font-medium text-ink-subtle">Latest note:</span>{' '}
      {latest?.kind === 'transition' ? latest.transition.note : NOT_RECORDED}
    </p>
  );
}

function TaskActionButtons({
  task,
  actorRole,
  onRequest,
  onReopenReview,
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  onRequest: (task: WorkflowBoardTask, toStatus: TaskStatus) => void;
  onReopenReview: (task: WorkflowBoardTask) => void;
}) {
  const targets = transitionTargets(task, actorRole);
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {targets.map((target) => (
        <Button
          key={target}
          size="sm"
          variant={target === 'in_progress' ? 'primary' : 'secondary'}
          iconLeading={actionIcon(task.status, target)}
          onClick={() => onRequest(task, target)}
        >
          {actionLabel(task.status, target)}
        </Button>
      ))}
      {task.reviewState === 'rejected' && (actorRole === 'team_lead' || actorRole === 'super_admin') && (
        <Button
          size="sm"
          variant="primary"
          iconLeading={<RotateCcw aria-hidden className="size-4" />}
          onClick={() => onReopenReview(task)}
        >
          Reopen review
        </Button>
      )}
      {task.status === 'in_progress' && task.canLogWorkWhenInProgress && (
        <LinkButton
          size="sm"
          variant="secondary"
          href={`/timesheets/${businessToday()}?task=${task.id}`}
          iconLeading={<Clock3 aria-hidden className="size-4" />}
        >
          Log work
        </LinkButton>
      )}
    </div>
  );
}

function TaskCard({
  task,
  actorRole,
  onRequest,
  onReopenReview,
  onDragStart,
  onDragEnd,
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  onRequest: (task: WorkflowBoardTask, toStatus: TaskStatus) => void;
  onReopenReview: (task: WorkflowBoardTask) => void;
  onDragStart: (task: WorkflowBoardTask) => void;
  onDragEnd: () => void;
}) {
  const targets = transitionTargets(task, actorRole);
  return (
    <article
      draggable={targets.length > 0}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', task.id);
        onDragStart(task);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'min-w-0 rounded-lg border border-border bg-surface p-4 shadow-xs',
        'transition-[border-color,box-shadow,opacity] duration-150',
        targets.length > 0 && 'cursor-grab hover:border-highlight-hover hover:shadow-sm active:cursor-grabbing',
      )}
      data-task-id={task.id}
      data-task-status={task.status}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={task.href}
            className="inline-flex min-h-6 items-center rounded-xs text-body font-semibold text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {task.title}
          </Link>
          <p className="mt-1 text-caption text-ink-muted">
            {task.project.code} · {task.project.name}
          </p>
          <p className="mt-0.5 text-caption text-ink-subtle" title={task.division.name}>
            {task.division.code}
          </p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          {task.reviewState === 'rejected' ? (
            <Badge tone="danger" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
              Rejected
            </Badge>
          ) : (
            <StatusBadge status={task.status} />
          )}
          {targets.length > 0 && (
            <span title="Drag to another status" aria-hidden className="mt-1 text-ink-subtle">
              <GripVertical className="size-4" />
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {task.isOverdue && (
          <Badge tone="danger" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
            Overdue
          </Badge>
        )}
        {task.variance.minutes > 0 && (
          <Badge tone="warning" icon={<TriangleAlert aria-hidden className="size-3.5" />}>
            Over estimate {task.variance.label}
          </Badge>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-caption">
        <div>
          <dt className="text-ink-subtle">Estimate</dt>
          <dd className="mt-0.5 tabular font-semibold text-ink">
            <Duration value={task.estimated} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-subtle">Actual</dt>
          <dd className="mt-0.5 tabular font-semibold text-ink">
            <Duration value={task.actual} />
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-subtle">
            <CalendarDays aria-hidden className="size-3.5" /> Due
          </dt>
          <dd className={cn('mt-0.5 font-medium', task.isOverdue ? 'text-danger' : 'text-ink')}>
            {task.dueDateLabel ?? NOT_RECORDED}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-ink-subtle">
            <UserRound aria-hidden className="size-3.5" /> Assignee
          </dt>
          <dd className="mt-0.5 font-medium text-ink">{task.assignee?.fullName ?? 'Unassigned'}</dd>
        </div>
      </dl>

      <LatestTransitionNote task={task} />

      {task.reviewBlockedReason && task.status === 'pending' && (
        <Callout tone="warning" className="mt-3">
          {task.reviewBlockedReason}
        </Callout>
      )}

      <TaskActionButtons task={task} actorRole={actorRole} onRequest={onRequest} onReopenReview={onReopenReview} />
    </article>
  );
}

/** The field-level message a validation failure carries for one field, if any. */
function fieldMessage(failure: Failure | null, field: string) {
  return failure?.status === 'validation_failure'
    ? failure.fieldErrors.find((error) => error.field === field)?.message
    : undefined;
}

interface TransitionRequest {
  readonly task: WorkflowBoardTask;
  readonly toStatus: TaskStatus;
}

function TransitionPanel({
  request,
  actorRole,
  viewerEmployeeId: viewerEmployeeIdProp,
  onClose,
  onMoved,
}: {
  request: TransitionRequest;
  actorRole: RoleKey;
  /** Who is completing the task; time can be logged only for oneself. */
  viewerEmployeeId?: string | null;
  onClose: () => void;
  onMoved: () => void;
}) {
  const { task, toStatus } = request;
  const toast = useToast();
  const noteRequired = transitionRequiresNote(task.status, toStatus);
  const [note, setNote] = React.useState('');
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);
  const [idempotencyKey] = React.useState(
    () => `task-transition:${task.id}:${task.status}:${toStatus}:${crypto.randomUUID()}`,
  );
  /*
   * Completing can record the last of the work at the same time. The minutes
   * are an ordinary work log — saved first, through the same rules as the
   * timesheet (24-hour day, overtime reason, locked period) — and only then is
   * the task completed. The transition itself still adds no time.
   */
  const viewerEmployeeId = viewerEmployeeIdProp ?? '';
  const canLogOnCompletion = toStatus === 'completed' && task.status === 'in_progress'
    && task.canLogWorkWhenInProgress && task.assignee?.id === viewerEmployeeId
    && Boolean(viewerEmployeeId && task.project.id && task.division.id);
  const [logMinutes, setLogMinutes] = React.useState<number | null>(null);
  const [completedWork, setCompletedWork] = React.useState('');
  const [workLocation, setWorkLocation] = React.useState<WorkLocation>('office');
  const [overtimeReason, setOvertimeReason] = React.useState('');
  const [criticalExplanation, setCriticalExplanation] = React.useState('');
  const [needsOvertimeReason, setNeedsOvertimeReason] = React.useState(false);
  const [needsCriticalExplanation, setNeedsCriticalExplanation] = React.useState(false);
  // Set once the work log is saved, so a retried completion never logs twice.
  const [loggedMinutes, setLoggedMinutes] = React.useState<number | null>(null);
  const [workLogKey] = React.useState(() => `task-completion-log:${task.id}:${crypto.randomUUID()}`);
  // The lock that matters is the person logging; otherwise the assignee's. An
  // unassigned task has none to check, and its start is refused by the service anyway.
  const assigneeId = canLogOnCompletion ? viewerEmployeeId : task.assignee?.id ?? '';
  const currentDate = businessToday();
  const day = useAsync(
    () => mockTimesheetService.getDay({ employeeId: assigneeId, date: currentDate }),
    [assigneeId, currentDate],
    { keepPrevious: true },
  ).state;
  const todayLocked = day.status === 'success' && day.data.summary.isLocked;
  const label = actionLabel(task.status, toStatus);

  async function submit() {
    if (noteRequired && !note.trim()) {
      setFailure({
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'A reason is required.',
        fieldErrors: [{
          field: 'note',
          code: 'TRANSITION_NOTE_REQUIRED',
          message: 'Enter a reason for reopening this task.',
          guidance: 'Explain why more work is needed before reopening.',
        }],
        focusField: 'note',
      });
      return;
    }

    if (canLogOnCompletion && loggedMinutes === null && day.status !== 'success') {
      setFailure({
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        retryable: true,
        message: 'Today\'s timesheet could not be checked. Try again before completing the task.',
      });
      return;
    }
    if (canLogOnCompletion && loggedMinutes === null && todayLocked) {
      setFailure({
        status: 'conflict',
        code: 'PERIOD_LOCKED',
        message: 'Today is in a verified period. Request an amendment before recording this work and completing the task.',
        guidance: 'Ask HR to open the verified-period amendment workflow, then try again.',
      });
      return;
    }
    if (canLogOnCompletion && loggedMinutes === null && (logMinutes === null || logMinutes <= 0)) {
      setFailure({
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'Enter the actual time spent today.',
        focusField: 'durationMinutes',
        fieldErrors: [{
          field: 'durationMinutes',
          code: 'REQUIRED',
          message: 'Actual time is required to complete your task.',
          guidance: 'Enter the hours and minutes worked today, for example 1:30.',
        }],
      });
      return;
    }

    const willLog = canLogOnCompletion && loggedMinutes === null;
    if (willLog && !completedWork.trim()) {
      setFailure({
        status: 'validation_failure', code: 'VALIDATION_FAILED', message: 'Say what you finished.', focusField: 'completedWork',
        fieldErrors: [{ field: 'completedWork', code: 'REQUIRED', message: 'Describe the work you finished today.', guidance: 'It is saved with the time on your timesheet.' }],
      });
      return;
    }

    setSubmitting(true);
    setFailure(null);
    if (willLog) {
      const saved = await mockTimesheetService.createWorkLog({
        employeeId: viewerEmployeeId, workDate: currentDate, divisionId: task.division.id!, projectId: task.project.id!, taskId: task.id,
        durationMinutes: logMinutes!, workLocation, workDescription: `Final work on ${task.title}`, completedWork: completedWork.trim(),
        supportingLink: null, attachmentIds: [], overtimeReason: overtimeReason.trim() || null,
        criticalExplanation: criticalExplanation.trim() || null, source: 'manual', idempotencyKey: workLogKey,
      });
      if (saved.status !== 'success') {
        // Day-level rules surface as fields: offer the one the service asked for.
        if (saved.status === 'validation_failure') {
          if (saved.fieldErrors.some((error) => error.field === 'overtimeReason')) setNeedsOvertimeReason(true);
          if (saved.fieldErrors.some((error) => error.field === 'criticalExplanation')) setNeedsCriticalExplanation(true);
        }
        setSubmitting(false);
        setFailure(saved);
        return;
      }
      setLoggedMinutes(logMinutes);
    }
    const result = await mockTimesheetService.transitionTask({
      taskId: task.id,
      expectedVersion: task.version,
      fromStatus: task.status,
      toStatus,
      actorRole,
      note: note.trim() || null,
      idempotencyKey,
    });
    setSubmitting(false);
    if (result.status === 'success') {
      setCompleted(true);
      onMoved();
      const recorded = loggedMinutes ?? (willLog ? logMinutes : null);
      toast.show({
        tone: 'success',
        title: `${label} successful`,
        description: recorded
          ? `${formatDuration(recorded)} logged on today's timesheet, and ${task.title} is now ${TASK_STATUS_LABEL[toStatus]}.`
          : `${task.title} is now ${TASK_STATUS_LABEL[toStatus]}. No active time was added.`,
      });
      return;
    }
    setFailure(result);
  }

  const noteError =
    failure?.status === 'validation_failure'
      ? failure.fieldErrors.find((error) => error.field === 'note')?.message
      : undefined;

  if (completed) {
    return (
      <Dialog
        open
        onClose={onClose}
        title={`${label} complete`}
        description={`${task.title} is now ${TASK_STATUS_LABEL[toStatus]}.`}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}
      >
        <Alert tone="success" title="Task status updated">
          {loggedMinutes
            ? `${formatDuration(loggedMinutes)} was saved as a work log for today; the status change itself added no time.`
            : 'This transition created no active time. It is recorded separately in task history.'}
        </Alert>
        {toStatus === 'in_progress' && task.canLogWorkWhenInProgress && (
          <div className="mt-4">
            {todayLocked ? (
              <Alert tone="warning" title="Today is in a verified period">
                The task can be In Progress, but today cannot accept a new work log. Request an amendment if work must be recorded.
              </Alert>
            ) : (
              <LinkButton
                href={`/timesheets/${currentDate}?task=${task.id}`}
                variant="primary"
                iconTrailing={<ArrowRight aria-hidden className="size-4" />}
              >
                Log today&apos;s work
              </LinkButton>
            )}
          </div>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={!submitting}
      title={`${label} task`}
      description={`${task.title} · ${TASK_STATUS_LABEL[task.status]} → ${TASK_STATUS_LABEL[toStatus]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting}>{label}</Button>
        </>
      }
    >
      {failure && (
        <Alert
          tone={failure.status === 'conflict' ? 'warning' : 'danger'}
          title={
            failure.status === 'conflict'
              ? 'The board is out of date'
              : failure.status === 'permission_denied'
                ? 'This move is not available to you'
                : 'The task could not be moved'
          }
          live
          className="mb-4"
          actions={
            failure.status === 'conflict'
              ? <Button variant="secondary" size="sm" onClick={onMoved}>Reload board</Button>
              : undefined
          }
        >
          {failure.message}{'guidance' in failure && failure.guidance ? ` ${failure.guidance}` : ''}
        </Alert>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-md border border-border bg-surface-sunken p-4">
        <div>
          <dt className="text-caption text-ink-muted">Estimate</dt>
          <dd className="mt-1 tabular font-semibold text-ink"><Duration value={task.estimated} /></dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Actual time</dt>
          <dd className="mt-1 tabular font-semibold text-ink"><Duration value={task.actual} /></dd>
        </div>
        <div className="col-span-2">
          <dt className="text-caption text-ink-muted">Estimate variance</dt>
          <dd className={cn('mt-1 tabular font-semibold', task.variance.minutes > 0 ? 'text-warning' : 'text-ink')}>
            {task.variance.label}
          </dd>
        </div>
      </dl>

      {task.variance.minutes > 0 && toStatus === 'completed' && (
        <Callout tone="warning" className="mt-4">
          Actual time is above the estimate. It is not capped, and the completion note remains optional.
        </Callout>
      )}

      {toStatus === 'completed' && task.canLogWorkWhenInProgress && (
        <div className="mt-4 rounded-md border border-border p-4">
          <p className="text-body-sm font-semibold text-ink">Final work for today</p>
          {day.status === 'loading' ? (
            <p role="status" className="mt-1 text-caption text-ink-muted">Checking today&apos;s period…</p>
          ) : todayLocked ? (
            <Alert tone="warning" title="Today is locked" className="mt-3">
              Request a verified-period amendment before recording this work and completing the task.
            </Alert>
          ) : day.status === 'failure' ? (
            <Alert tone="warning" title="Work-log availability unavailable" className="mt-3">
              Try again after today&apos;s timesheet is available. Your task has not been completed.
            </Alert>
          ) : canLogOnCompletion ? (
            loggedMinutes !== null ? (
              <p role="status" className="mt-2 text-body-sm text-ink">
                {formatDuration(loggedMinutes)} is saved on today&apos;s timesheet. Complete the task to finish.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                <p className="text-caption text-ink-muted">
                  Enter the actual time spent today. It is saved to your timesheet before the task is completed.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Time spent today" required helperText="Hours and minutes, for example 1:30." error={fieldMessage(failure, 'durationMinutes')}>
                    <DurationInput value={logMinutes} onValueChange={setLogMinutes} disabled={submitting} />
                  </Field>
                  <Field label="Work location">
                    <Select
                      value={workLocation}
                      onChange={(event) => setWorkLocation(event.target.value as WorkLocation)}
                      options={(Object.keys(WORK_LOCATION_LABEL) as WorkLocation[]).map((value) => ({ value, label: WORK_LOCATION_LABEL[value] }))}
                      disabled={submitting}
                    />
                  </Field>
                </div>
                <Field label="What you finished" required error={fieldMessage(failure, 'completedWork')}>
                  <Input value={completedWork} onChange={(event) => setCompletedWork(event.target.value)} disabled={submitting} />
                </Field>
                {needsOvertimeReason && (
                  <Field label="Overtime reason" required helperText="Today goes above eight hours." error={fieldMessage(failure, 'overtimeReason')}>
                    <Input value={overtimeReason} onChange={(event) => setOvertimeReason(event.target.value)} disabled={submitting} />
                  </Field>
                )}
                {needsCriticalExplanation && (
                  <Field label="Critical-time explanation" required helperText="Today goes above twelve hours; your Team Lead and HR are notified." error={fieldMessage(failure, 'criticalExplanation')}>
                    <Input value={criticalExplanation} onChange={(event) => setCriticalExplanation(event.target.value)} disabled={submitting} />
                  </Field>
                )}
                {logMinutes !== null && logMinutes > 0 && (
                  <p className="text-caption text-ink-muted">
                    Task total after completing: <span className="tabular font-semibold text-ink">{formatDuration(task.actual.minutes + logMinutes)}</span>
                  </p>
                )}
              </div>
            )
          ) : (
            <LinkButton
              href={`/timesheets/${currentDate}?task=${task.id}`}
              variant="secondary"
              size="sm"
              className="mt-3"
              iconLeading={<Clock3 aria-hidden className="size-4" />}
            >
              Log final work first
            </LinkButton>
          )}
        </div>
      )}

      <Field
        label={noteRequired ? 'Reason' : 'Note (optional)'}
        required={noteRequired}
        helperText={
          noteRequired
            ? 'Explain why the task needs more work. The original completion remains in history.'
            : 'Describe the outcome or context. This note does not add active time.'
        }
        error={noteError}
        className="mt-4"
      >
        <Textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          disabled={submitting}
        />
      </Field>
    </Dialog>
  );
}

function ReviewReopenPanel({
  task,
  userId,
  onClose,
  onReopened,
}: {
  task: WorkflowBoardTask;
  userId: string;
  onClose: () => void;
  onReopened: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = React.useState('');
  const [failure, setFailure] = React.useState<Failure | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  async function submit() {
    if (!reason.trim()) {
      setFailure({
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'A reason is required.',
        focusField: 'reason',
        fieldErrors: [{
          field: 'reason',
          code: 'REOPEN_REASON_REQUIRED',
          message: 'Enter a reason for reopening review.',
          guidance: 'Explain what changed and why the task should be reviewed again.',
        }],
      });
      return;
    }
    setSubmitting(true);
    setFailure(null);
    const result = await mockTaskReviewService.reopen(userId, task.id, {
      expectedVersion: task.version,
      reason: reason.trim(),
    });
    setSubmitting(false);
    if (result.status !== 'success') {
      setFailure(result);
      return;
    }
    toast.show({
      tone: 'success',
      title: 'Task review reopened',
      description: `${task.title} is awaiting Team Lead review again.`,
    });
    onReopened();
  }

  return (
    <Dialog
      open
      onClose={onClose}
      dismissOnBackdrop={!submitting}
      title="Reopen task review"
      description={`${task.title} will return to the Team Lead review queue. This does not approve or start the task.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={submitting}>Reopen review</Button>
        </>
      }
    >
      {failure && (
        <Alert
          tone={failure.status === 'conflict' ? 'warning' : 'danger'}
          title={failure.status === 'conflict' ? 'The task changed' : 'Review could not be reopened'}
          live
          className="mb-4"
        >
          {failure.message}{'guidance' in failure && failure.guidance ? ` ${failure.guidance}` : ''}
        </Alert>
      )}
      <Field
        label="Reason"
        required
        helperText="This reason is stored in the audit log."
        error={fieldMessage(failure, 'reason')}
      >
        <Textarea
          name="reason"
          rows={4}
          maxLength={2000}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={submitting}
        />
      </Field>
    </Dialog>
  );
}

export function TaskWorkflowBoard({
  tasks,
  actorRole,
  viewerUserId = '',
  viewerEmployeeId = null,
  scopeFilter,
  scopeFilterActive = false,
  onClearScopeFilter,
  onMoved,
}: {
  tasks: readonly WorkflowBoardTask[];
  actorRole: RoleKey;
  /** Required for server-authorized review actions. */
  viewerUserId?: string;
  /** The signed-in employee; completing can log their final work for today. */
  viewerEmployeeId?: string | null;
  /** Optional Team Lead or administrator assignee control, placed in the shared toolbar. */
  scopeFilter?: React.ReactNode;
  scopeFilterActive?: boolean;
  onClearScopeFilter?: () => void;
  onMoved: () => void;
}) {
  const [view, setView] = React.useState<TaskBoardView>('workflow');
  const [search, setSearch] = React.useState('');
  const [dueFilter, setDueFilter] = React.useState<TaskDueFilter>('all');
  const [request, setRequest] = React.useState<TransitionRequest | null>(null);
  const [reopenTask, setReopenTask] = React.useState<WorkflowBoardTask | null>(null);
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const visible = tasks.filter((task) => (
    (view === 'rejected' ? task.reviewState === 'rejected' : task.reviewState !== 'rejected')
    && matchesDueDate(task, dueFilter)
    && matchesSearch(task, search)
  ));
  const viewItems = BOARD_VIEWS.map((tab) => ({
    ...tab,
    badgeCount: tasks.filter((task) => (
      tab.key === 'rejected' ? task.reviewState === 'rejected' : task.reviewState !== 'rejected'
    )).length,
  }));
  const hasLocalFilters = search.trim().length > 0 || dueFilter !== 'all';
  const hasAnyFilters = hasLocalFilters || scopeFilterActive;

  function clearFilters() {
    setSearch('');
    setDueFilter('all');
    onClearScopeFilter?.();
  }

  function requestMove(task: WorkflowBoardTask, toStatus: TaskStatus) {
    setRequest({ task, toStatus });
  }

  function dropOn(status: TaskStatus) {
    const task = tasks.find((candidate) => candidate.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!task || task.status === status) return;
    if (!transitionTargets(task, actorRole).includes(status)) {
      setAnnouncement(`${task.title} cannot move to ${TASK_STATUS_LABEL[status]}. Use an available action on the card.`);
      return;
    }
    setAnnouncement(`${task.title} selected for ${TASK_STATUS_LABEL[status]}. Confirm the move in the panel.`);
    requestMove(task, status);
  }

  return (
    <div className="mt-5 min-w-0">
      <Tabs
        label="Task views"
        activeKey={view}
        onChange={(key) => setView(key as TaskBoardView)}
        items={viewItems}
      />

      <FilterBar
        className="mt-4"
        resultSummary={`${visible.length} ${visible.length === 1 ? 'task' : 'tasks'} in this view`}
      >
        <SearchInput
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onClear={() => setSearch('')}
          placeholder="Search tasks"
          aria-label="Search tasks"
          className="min-w-56"
        />
        {scopeFilter}
        <Select
          aria-label="Filter tasks by due date"
          value={dueFilter}
          onChange={(event) => setDueFilter(event.target.value as TaskDueFilter)}
          options={DUE_FILTER_OPTIONS}
          className="min-w-44"
        />
        {hasAnyFilters && (
          <Button variant="link" size="sm" onClick={clearFilters}>Clear filters</Button>
        )}
      </FilterBar>

      {view === 'workflow' && (
        <div className="mt-4 flex items-start gap-2 text-caption text-ink-muted">
          <GripVertical aria-hidden className="mt-px size-4 shrink-0" />
          <p>On larger screens, drag a task to another status or use its visible action buttons. Moving a task never records active time.</p>
        </div>
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>

      <div
        role="tabpanel"
        id={`panel-${view}`}
        aria-labelledby={`tab-${view}`}
        tabIndex={0}
      >
      {view === 'rejected' ? (
        visible.length === 0 ? (
          <EmptyState
            variant={hasAnyFilters ? 'no-results' : 'empty'}
            title={hasAnyFilters ? 'No rejected tasks match these filters' : 'No rejected tasks'}
            description={hasAnyFilters ? 'Clear or change the filters to see more work.' : 'Tasks rejected during review will appear here, separate from the workflow board.'}
            className="mt-4"
          />
        ) : (
          <section aria-labelledby="rejected-task-heading" className="mt-4 max-w-4xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="rejected-task-heading" className="text-h3 text-ink">Rejected tasks</h2>
              <Badge tone="danger" aria-label={`${visible.length} rejected tasks`}>{visible.length}</Badge>
            </div>
            <div className="space-y-3">
              {visible.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  actorRole={actorRole}
                  onRequest={requestMove}
                  onReopenReview={setReopenTask}
                  onDragStart={() => undefined}
                  onDragEnd={() => undefined}
                />
              ))}
            </div>
          </section>
        )
      ) : (
        <>
          {visible.length === 0 && hasAnyFilters && (
        <EmptyState
          variant="no-results"
          title="No workflow tasks match these filters"
          description="Clear or change the filters to see more work."
          className="mt-4"
        />
          )}
          <div
            aria-label="Task status board"
            className="mt-4 hidden min-w-0 grid-cols-3 gap-4 md:grid"
            data-board-layout="desktop"
          >
            {WORKFLOW_STATUSES.map((status) => {
              const columnTasks = visible.filter((task) => task.status === status);
              return (
                <section
                  key={status}
                  aria-labelledby={`workflow-column-${status}`}
                  onDragOver={(event) => {
                    if (draggedTaskId) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    dropOn(status);
                  }}
                  className={cn(
                    'min-w-0 rounded-xl border border-border bg-surface-sunken p-3',
                    draggedTaskId && 'border-dashed border-border-strong',
                  )}
                  data-status-column={status}
                >
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <h2 id={`workflow-column-${status}`} className="text-h3 text-ink">
                      {TASK_STATUS_LABEL[status]}
                    </h2>
                    <Badge tone="neutral" aria-label={`${columnTasks.length} tasks`}>
                      {columnTasks.length}
                    </Badge>
                  </div>
                  {columnTasks.length > 0 ? (
                    <div className="space-y-3">
                      {columnTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          actorRole={actorRole}
                          onRequest={requestMove}
                          onReopenReview={setReopenTask}
                          onDragStart={(dragged) => {
                            setDraggedTaskId(dragged.id);
                            setAnnouncement(`${dragged.title} picked up. Drop it in an available status column or use its action buttons.`);
                          }}
                          onDragEnd={() => setDraggedTaskId(null)}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-caption text-ink-subtle">
                      No {TASK_STATUS_LABEL[status].toLowerCase()} tasks in this view
                    </p>
                  )}
                </section>
              );
            })}
          </div>

          <div
            aria-label="Task status groups"
            className="mt-4 space-y-5 md:hidden"
            data-board-layout="mobile"
          >
            {visible.length === 0 && !hasAnyFilters && (
              <EmptyState
                variant="empty"
                title="No workflow tasks"
                description="Assigned work will appear here under Pending, In Progress, or Completed."
              />
            )}
            {WORKFLOW_STATUSES.map((status) => {
              const groupTasks = visible.filter((task) => task.status === status);
              if (groupTasks.length === 0) return null;
              return (
                <section key={status} aria-labelledby={`workflow-list-${status}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 id={`workflow-list-${status}`} className="text-h3 text-ink">
                      {TASK_STATUS_LABEL[status]}
                    </h2>
                    <Badge tone="neutral">{groupTasks.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {groupTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        actorRole={actorRole}
                        onRequest={requestMove}
                        onReopenReview={setReopenTask}
                        onDragStart={() => undefined}
                        onDragEnd={() => undefined}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
      </div>

      {request && (
        <TransitionPanel
          key={`${request.task.id}:${request.task.status}:${request.toStatus}`}
          request={request}
          actorRole={actorRole}
          viewerEmployeeId={viewerEmployeeId}
          onClose={() => setRequest(null)}
          onMoved={onMoved}
        />
      )}
      {reopenTask && (
        <ReviewReopenPanel
          task={reopenTask}
          userId={viewerUserId}
          onClose={() => setReopenTask(null)}
          onReopened={() => {
            setReopenTask(null);
            onMoved();
          }}
        />
      )}
    </div>
  );
}

function HistoryItem({ item }: { item: TaskHistoryItemView }) {
  if (item.kind === 'transition') {
    return (
      <li className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
        <span aria-hidden className="z-[1] grid size-6 place-items-center rounded-full border border-accent-border bg-accent-subtle text-accent">
          <History className="size-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-semibold text-ink">
            {TASK_STATUS_LABEL[item.transition.fromStatus]} → {TASK_STATUS_LABEL[item.transition.toStatus]}
          </p>
          <p className="mt-0.5 text-caption text-ink-muted">
            {item.transition.actor.displayName} · {formatTimestamp(item.transition.changedAt, 'Asia/Dhaka')}
          </p>
          {item.transition.note && (
            <p className="mt-2 rounded-md bg-surface-sunken px-3 py-2 text-body-sm text-ink-muted">
              {item.transition.note}
            </p>
          )}
        </div>
      </li>
    );
  }

  if (item.kind === 'historical_clock_entry') {
    return (
      <li className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
        <span aria-hidden className="z-[1] grid size-6 place-items-center rounded-full border border-border bg-surface-sunken text-ink-muted">
          <Clock3 className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-ink">Historical clock entry · {item.historicalEntry.workDateLabel}</p>
            <span className="tabular text-body-sm font-semibold text-ink"><Duration value={item.historicalEntry.duration} /></span>
          </div>
          <p className="mt-0.5 text-caption text-ink-muted">{item.historicalEntry.timeRangeLabel}</p>
          <p className="mt-1 text-body-sm text-ink-muted">{item.historicalEntry.completedWork}</p>
        </div>
      </li>
    );
  }

  return (
    <li className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 pb-5 last:pb-0">
      <span aria-hidden className="z-[1] grid size-6 place-items-center rounded-full border border-complete-border bg-success-surface text-success">
        <ListChecks className="size-3.5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-body-sm font-semibold text-ink">Work log · {item.workLog.workDateLabel}</p>
          <span className="tabular text-body-sm font-semibold text-ink"><Duration value={item.workLog.duration} /></span>
        </div>
        <p className="mt-1 text-body-sm text-ink-muted">{item.workLog.completedWork}</p>
      </div>
    </li>
  );
}

export function TaskHistoryTimeline({ taskId }: { taskId: string }) {
  const { state, reload } = useAsync(
    () => mockTimesheetService.getTaskHistory(taskId),
    [taskId],
    { keepPrevious: true },
  );

  if (state.status === 'loading') {
    return <div role="status" aria-busy className="mt-4 space-y-3"><span className="sr-only">Loading task history</span><Skeleton height="3rem" /><Skeleton height="3rem" /></div>;
  }
  if (state.status !== 'success') {
    return <Alert tone="danger" title="Task history unavailable" actions={<Button size="sm" variant="secondary" onClick={reload}>Try again</Button>}>Reload the timeline to try again.</Alert>;
  }
  if (state.data.items.length === 0) {
    return <EmptyState title="No task history yet" description="Status changes and work logs will appear here in order." className="mt-4" />;
  }
  return (
    <ol className="relative mt-4 before:absolute before:top-3 before:bottom-3 before:left-[0.7rem] before:w-px before:bg-border">
      {state.data.items.map((item) => (
        <HistoryItem
          key={item.kind === 'transition' ? item.transition.id : item.kind === 'work_log' ? item.workLog.id : item.historicalEntry.id}
          item={item}
        />
      ))}
    </ol>
  );
}

export function TaskDetailTransitions({
  task,
  actorRole,
  viewerUserId = '',
  viewerEmployeeId = null,
  onMoved,
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  viewerUserId?: string;
  /** The signed-in employee; completing can log their final work for today. */
  viewerEmployeeId?: string | null;
  onMoved: () => void;
}) {
  const [request, setRequest] = React.useState<TransitionRequest | null>(null);
  const [reopening, setReopening] = React.useState(false);
  return (
    <>
      <TaskActionButtons task={task} actorRole={actorRole} onRequest={(selected, toStatus) => setRequest({ task: selected, toStatus })} onReopenReview={() => setReopening(true)} />
      {request && (
        <TransitionPanel
          key={`${request.task.id}:${request.task.status}:${request.toStatus}`}
          request={request}
          actorRole={actorRole}
          viewerEmployeeId={viewerEmployeeId}
          onClose={() => setRequest(null)}
          onMoved={onMoved}
        />
      )}
      {reopening && (
        <ReviewReopenPanel
          task={task}
          userId={viewerUserId}
          onClose={() => setReopening(false)}
          onReopened={() => {
            setReopening(false);
            onMoved();
          }}
        />
      )}
    </>
  );
}
