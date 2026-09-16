'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { TaskSummaryView } from '@/contracts/view-models';
import { cn } from '@/lib/cn';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { RaiseTaskButton } from './raise-task';
import {
  TaskDetailTransitions,
  TaskHistoryTimeline,
  TaskWorkflowBoard,
  type WorkflowBoardTask,
} from './task-workflow';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/forms/inputs';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { mockTaskService } from '@/services/mock/work';
import { DEMO_TODAY } from '@/lib/demo-context';

function employeeBoardTask(task: TaskSummaryView): WorkflowBoardTask {
  return {
    id: task.id,
    title: task.title,
    href: task.href,
    project: { name: task.project.name, code: task.project.code },
    division: { name: task.division.name, code: task.division.code },
    assignee: { id: task.assignee.id, fullName: task.assignee.fullName },
    status: task.status,
    estimated: task.estimated,
    actual: task.actual,
    variance: task.variance,
    dueDate: task.dueDate,
    dueDateLabel: task.dueDateLabel,
    isOverdue: task.isOverdue,
    reviewBlockedReason: task.review.blocksTimeEntry ? task.review.detail : null,
    canLogWorkWhenInProgress: !task.review.blocksTimeEntry,
  };
}

/** Employee task list (`FE-0340`). */
export function TaskList({ employeeId }: { employeeId: string }) {
  const { user } = useSession();
  const { state, reload } = useAsync(
    () => mockTaskService.listForEmployee(employeeId),
    [employeeId],
    { keepPrevious: true },
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading tasks</span>
          <Skeleton height="2rem" width="12rem" />
          <Skeleton height="14rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Could not load your tasks"
          action={{ label: 'Try again', onClick: reload }}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Tasks"
        description="Move assigned work through its workflow and review actual time derived from work logs."
        actions={<RaiseTaskButton onCreated={reload} />}
      />
      <TaskWorkflowBoard
        tasks={state.data.map(employeeBoardTask)}
        actorRole={user?.primaryRole ?? 'employee'}
        onMoved={reload}
      />
    </PageContainer>
  );
}

/** Task detail (`FE-0341`). */
export function TaskDetail({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { user } = useSession();
  const employeeId = user?.employeeId ?? '';
  const { state, reload } = useAsync(
    () => mockTaskService.getById(taskId, employeeId),
    [taskId, employeeId],
    { keepPrevious: true },
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading task</span>
          <Skeleton height="2rem" width="18rem" />
          <Skeleton height="12rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="no-results"
          title="Task not found"
          description="It may have been removed, or you may not have access to it."
        />
      </PageContainer>
    );
  }

  const { summary, description, checklist, supportingMembers } = state.data;
  const done = checklist.filter((item) => item.isDone).length;
  const workflowTask = employeeBoardTask(summary);

  return (
    <PageContainer>
      <PageHeader
        title={summary.title}
        crumbs={[{ label: 'My Tasks', href: '/tasks' }, { label: summary.title }]}
        backHref="/tasks"
        backLabel="All tasks"
        meta={
          <>
            <Badge
              tone={
                summary.status === 'completed'
                  ? 'success'
                  : summary.status === 'in_progress'
                    ? 'accent'
                    : 'neutral'
              }
            >
              {TASK_STATUS_LABEL[summary.status]}
            </Badge>
            {summary.isOverdue && <Badge tone="danger">Overdue</Badge>}
            {summary.review.state !== 'not_required' && (
              <Badge
                tone={
                  summary.review.state === 'approved'
                    ? 'success'
                    : summary.review.state === 'rejected'
                      ? 'danger'
                      : 'warning'
                }
              >
                {summary.review.label}
              </Badge>
            )}
            <Badge tone="neutral">{summary.division.code}</Badge>
          </>
        }
        actions={
          /*
           * Offering "Add time" on a task that cannot receive any sends the
           * person to a form that will refuse them, with no explanation until
           * they have filled it in. The block is stated here instead.
           */
          summary.status === 'in_progress' && !summary.review.blocksTimeEntry ? (
            <Button
              variant="primary"
              iconLeading={<Plus aria-hidden className="size-4" />}
              onClick={() => {
                router.push(`/timesheets/${DEMO_TODAY}`);
              }}
            >
              Log work
            </Button>
          ) : undefined
        }
      />

      <TaskDetailTransitions
        task={workflowTask}
        actorRole={user?.primaryRole ?? 'employee'}
        onMoved={reload}
      />

      <div className="mt-5 flex flex-col gap-5">
        {summary.review.state !== 'not_required' && (
          <Alert
            tone={
              summary.review.state === 'approved'
                ? 'success'
                : summary.review.state === 'rejected'
                  ? 'danger'
                  : 'warning'
            }
            title={summary.review.label}
          >
            {summary.review.detail}
            {summary.review.note ? ` ${summary.review.note}` : ''}
            {summary.review.reviewerName && summary.review.reviewedAtLabel
              ? ` Reviewed by ${summary.review.reviewerName} on ${summary.review.reviewedAtLabel}.`
              : ''}
          </Alert>
        )}
        {summary.isOverdue && (
          <Alert tone="warning" title="This task is past its due date">
            Due {summary.dueDateLabel}. Update the status, or raise it with your Team Lead
            if it is blocked.
          </Alert>
        )}

        <Card>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-label text-ink-muted">Estimated</p>
              <p className="mt-0.5 text-metric tabular text-ink">
                <Duration value={summary.estimated} />
              </p>
            </div>
            <div>
              <p className="text-label text-ink-muted">Actual</p>
              <p className="mt-0.5 text-metric tabular text-ink">
                <Duration value={summary.actual} />
              </p>
            </div>
            <div>
              <p className="text-label text-ink-muted">Variance</p>
              <p
                className={cn(
                  'mt-0.5 text-metric tabular',
                  summary.variancePercent !== null && summary.variancePercent > 0
                    ? 'text-overtime'
                    : 'text-ink',
                )}
              >
                {summary.variance.label}
              </p>
            </div>
            <div>
              <p className="text-label text-ink-muted">Due</p>
              <p className="mt-0.5 text-body font-semibold text-ink">
                {summary.dueDateLabel ?? '—'}
              </p>
            </div>
          </div>
          <p className="mt-3 text-caption text-ink-subtle">
            Actual time is derived from linked work logs and preserved historical entries, never entered directly.
          </p>
        </Card>

        {description && (
          <Card>
            <CardHeader title="Description" as="h2" />
            <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
          </Card>
        )}

        {checklist.length > 0 && (
          <Card>
            <CardHeader
              title="Checklist"
              description={`${done} of ${checklist.length} done`}
              as="h2"
            />
            <div className="mt-3 flex flex-col gap-1">
              {checklist.map((item) => (
                <Checkbox
                  key={item.id}
                  label={item.label}
                  checked={item.isDone}
                  onChange={async (event) => {
                    await mockTaskService.setChecklistItem(item.id, event.target.checked);
                    reload();
                  }}
                />
              ))}
            </div>
          </Card>
        )}

        {supportingMembers.length > 0 && (
          <Card>
            <CardHeader title="Supporting members" as="h2" />
            <ul className="mt-2 flex flex-wrap gap-2">
              {supportingMembers.map((member) => (
                <li key={member.id}>
                  <Badge tone="neutral">{member.fullName}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Task history"
            description="Status transitions and work records in chronological order. Transition times never count as active work."
            as="h2"
          />
          <TaskHistoryTimeline taskId={taskId} />
        </Card>
      </div>
    </PageContainer>
  );
}
