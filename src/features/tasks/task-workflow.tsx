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
import type { RoleKey, TaskStatus } from '@/contracts/domain';
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
import { useToast } from '@/components/feedback/toast';
import { Field } from '@/components/forms/field';
import { Textarea } from '@/components/forms/inputs';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { DEMO_TODAY } from '@/lib/demo-context';
import { formatTimestamp, NOT_RECORDED } from '@/lib/format';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { mockTimesheetService } from '@/services/mock/timesheet';
import { useAsync } from '@/lib/use-async';

export type TaskBoardFilter =
  | 'all'
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'upcoming';

export interface WorkflowBoardTask {
  readonly id: string;
  readonly title: string;
  readonly href: string;
  readonly project: { readonly name: string; readonly code: string };
  readonly division: { readonly name: string; readonly code: string };
  readonly assignee: { readonly id: string; readonly fullName: string };
  readonly status: TaskStatus;
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

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
] as const;

const STATUS_PRESENTATION: Record<
  TaskStatus,
  { readonly tone: BadgeTone; readonly icon: typeof Circle }
> = {
  pending: { tone: 'neutral', icon: Circle },
  in_progress: { tone: 'accent', icon: PlayCircle },
  completed: { tone: 'success', icon: CheckCircle2 },
};

function matches(task: WorkflowBoardTask, filter: TaskBoardFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'pending' || filter === 'in_progress' || filter === 'completed') {
    return task.status === filter;
  }
  if (filter === 'overdue') return task.isOverdue;
  return (
    task.status !== 'completed' &&
    task.dueDate !== null &&
    task.dueDate >= DEMO_TODAY
  );
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
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  onRequest: (task: WorkflowBoardTask, toStatus: TaskStatus) => void;
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
      {task.status === 'in_progress' && task.canLogWorkWhenInProgress && (
        <LinkButton
          size="sm"
          variant="secondary"
          href={`/timesheets/${DEMO_TODAY}?task=${task.id}`}
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
  onDragStart,
  onDragEnd,
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  onRequest: (task: WorkflowBoardTask, toStatus: TaskStatus) => void;
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
            className="rounded-xs text-body font-semibold text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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
          <StatusBadge status={task.status} />
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
          <dd className="mt-0.5 font-medium text-ink">{task.assignee.fullName}</dd>
        </div>
      </dl>

      <LatestTransitionNote task={task} />

      {task.reviewBlockedReason && task.status === 'pending' && (
        <Callout tone="warning" className="mt-3">
          {task.reviewBlockedReason}
        </Callout>
      )}

      <TaskActionButtons task={task} actorRole={actorRole} onRequest={onRequest} />
    </article>
  );
}

interface TransitionRequest {
  readonly task: WorkflowBoardTask;
  readonly toStatus: TaskStatus;
}

function TransitionPanel({
  request,
  actorRole,
  onClose,
  onMoved,
}: {
  request: TransitionRequest;
  actorRole: RoleKey;
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
  const day = useAsync(
    () => mockTimesheetService.getDay({ employeeId: task.assignee.id, date: DEMO_TODAY }),
    [task.assignee.id, DEMO_TODAY],
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

    setSubmitting(true);
    setFailure(null);
    const result = await mockTimesheetService.transitionTask({
      taskId: task.id,
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
      toast.show({
        tone: 'success',
        title: `${label} successful`,
        description: `${task.title} is now ${TASK_STATUS_LABEL[toStatus]}. No active time was added.`,
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
          This transition created no active time. It is recorded separately in task history.
        </Alert>
        {toStatus === 'in_progress' && task.canLogWorkWhenInProgress && (
          <div className="mt-4">
            {todayLocked ? (
              <Alert tone="warning" title="Today is in a verified period">
                The task can be In Progress, but today cannot accept a new work log. Request an amendment if work must be recorded.
              </Alert>
            ) : (
              <LinkButton
                href={`/timesheets/${DEMO_TODAY}?task=${task.id}`}
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
              You may complete the task, but a work log for today requires the verified-period amendment process.
            </Alert>
          ) : day.status === 'failure' ? (
            <Alert tone="warning" title="Work-log availability unavailable" className="mt-3">
              You may still complete the task. Check the timesheet separately before recording final work.
            </Alert>
          ) : (
            <LinkButton
              href={`/timesheets/${DEMO_TODAY}?task=${task.id}`}
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

export function TaskWorkflowBoard({
  tasks,
  actorRole,
  onMoved,
}: {
  tasks: readonly WorkflowBoardTask[];
  actorRole: RoleKey;
  onMoved: () => void;
}) {
  const [filter, setFilter] = React.useState<TaskBoardFilter>('all');
  const [request, setRequest] = React.useState<TransitionRequest | null>(null);
  const [draggedTaskId, setDraggedTaskId] = React.useState<string | null>(null);
  const [announcement, setAnnouncement] = React.useState('');
  const visible = tasks.filter((task) => matches(task, filter));
  const counts = FILTER_TABS.map((tab) => ({
    ...tab,
    badgeCount: tasks.filter((task) => matches(task, tab.key)).length,
  }));

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
        label="Task filters"
        activeKey={filter}
        onChange={(key) => setFilter(key as TaskBoardFilter)}
        items={counts}
      />

      <div className="mt-4 flex items-start gap-2 text-caption text-ink-muted">
        <GripVertical aria-hidden className="mt-px size-4 shrink-0" />
        <p>On larger screens, drag a task to another status or use its visible action buttons. Moving a task never records active time.</p>
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>

      {visible.length === 0 ? (
        <EmptyState
          variant={filter === 'all' ? 'empty' : 'no-results'}
          title={filter === 'all' ? 'No tasks in your scope' : 'No tasks in this view'}
          description={filter === 'all' ? 'There is no assigned or available work to show.' : 'Choose another task filter.'}
          className="mt-4"
        />
      ) : (
        <>
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

      {request && (
        <TransitionPanel
          key={`${request.task.id}:${request.task.status}:${request.toStatus}`}
          request={request}
          actorRole={actorRole}
          onClose={() => setRequest(null)}
          onMoved={onMoved}
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
  onMoved,
}: {
  task: WorkflowBoardTask;
  actorRole: RoleKey;
  onMoved: () => void;
}) {
  const [request, setRequest] = React.useState<TransitionRequest | null>(null);
  return (
    <>
      <TaskActionButtons task={task} actorRole={actorRole} onRequest={(selected, toStatus) => setRequest({ task: selected, toStatus })} />
      {request && (
        <TransitionPanel
          key={`${request.task.id}:${request.task.status}:${request.toStatus}`}
          request={request}
          actorRole={actorRole}
          onClose={() => setRequest(null)}
          onMoved={onMoved}
        />
      )}
    </>
  );
}
