'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { TaskStatus } from '@/contracts/domain';
import type { TaskSummaryView } from '@/contracts/view-models';
import { cn } from '@/lib/cn';
import { useAsync } from '@/lib/use-async';
import { TASK_STATUS_LABEL } from '@/lib/status';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/forms/inputs';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { mockTaskService } from '@/services/mock/work';
import { DEMO_TODAY } from '@/fixtures';

type TaskFilter = 'all' | 'pending' | 'in_progress' | 'completed' | 'overdue' | 'upcoming';

const FILTER_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'upcoming', label: 'Upcoming' },
];

function matches(task: TaskSummaryView, filter: TaskFilter): boolean {
  switch (filter) {
    case 'pending':
    case 'in_progress':
    case 'completed':
      return task.status === (filter as TaskStatus);
    case 'overdue':
      return task.isOverdue;
    case 'upcoming':
      return (
        task.status !== 'completed' &&
        task.dueDate !== null &&
        task.dueDate >= DEMO_TODAY
      );
    default:
      return true;
  }
}

/** Employee task list (`FE-0340`). */
export function TaskList({ employeeId }: { employeeId: string }) {
  const [filter, setFilter] = React.useState<TaskFilter>('all');
  const { state, reload } = useAsync(
    () => mockTaskService.listForEmployee(employeeId),
    [employeeId],
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

  const tasks = state.data.filter((task) => matches(task, filter));

  const counts = FILTER_TABS.map((tab) => ({
    ...tab,
    badgeCount: state.data.filter((task) => matches(task, tab.key as TaskFilter)).length,
  }));

  return (
    <PageContainer>
      <PageHeader
        title="My Tasks"
        description="Work assigned to you, with actual time derived from your entries."
      />

      <div className="mt-5 flex flex-col gap-4">
        <Tabs
          label="Task filters"
          activeKey={filter}
          onChange={(key) => setFilter(key as TaskFilter)}
          items={counts}
        />

        {tasks.length === 0 ? (
          <EmptyState
            variant={filter === 'all' ? 'empty' : 'no-results'}
            title={filter === 'all' ? 'No tasks assigned' : 'No tasks in this view'}
            description={
              filter === 'all'
                ? 'Nothing is assigned to you right now.'
                : 'Try another filter.'
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {tasks.map((task) => (
              <li key={task.id}>
                <Link href={task.href} className="group block h-full">
                  <Card className="h-full transition-colors group-hover:border-border-strong group-hover:bg-surface-sunken">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body font-medium text-ink">{task.title}</p>
                        <p className="mt-0.5 text-caption text-ink-muted">
                          {task.project.name} · {task.division.code}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <Badge
                          tone={
                            task.status === 'completed'
                              ? 'success'
                              : task.status === 'in_progress'
                                ? 'accent'
                                : 'neutral'
                          }
                        >
                          {task.statusLabel}
                        </Badge>
                        {task.isOverdue && <Badge tone="danger">Overdue</Badge>}
                      </div>
                    </div>

                    <div className="mt-3">
                      <ProgressBar
                        value={
                          task.estimated.minutes > 0
                            ? (task.actual.minutes / task.estimated.minutes) * 100
                            : 0
                        }
                        label="Actual against estimate"
                        valueText={`${task.actual.display} of ${task.estimated.display}`}
                        tone={
                          task.variancePercent !== null && task.variancePercent > 0
                            ? 'overtime'
                            : 'accent'
                        }
                      />
                    </div>

                    {task.dueDateLabel && (
                      <p className="mt-2 text-caption text-ink-muted">
                        Due {task.dueDateLabel}
                      </p>
                    )}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

/** Task detail (`FE-0341`). */
export function TaskDetail({ taskId }: { taskId: string }) {
  const router = useRouter();
  const { state, reload } = useAsync(() => mockTaskService.getById(taskId), [taskId]);

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

  const { summary, description, checklist, supportingMembers, entries } = state.data;
  const done = checklist.filter((item) => item.isDone).length;

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
            <Badge tone="neutral">{summary.division.code}</Badge>
          </>
        }
        actions={
          <Button
            variant="primary"
            iconLeading={<Plus aria-hidden className="size-4" />}
            onClick={() => {
              router.push(`/timesheets/${DEMO_TODAY}`);
            }}
          >
            Add time
          </Button>
        }
      />

      <div className="mt-5 flex flex-col gap-5">
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
                {summary.variancePercent === null
                  ? '—'
                  : `${summary.variancePercent > 0 ? '+' : ''}${summary.variancePercent}%`}
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
            Actual time is derived from your linked time entries, never entered directly.
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
            title="Work history"
            description="Time entries linked to this task."
            as="h2"
          />
          {entries.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                variant="empty"
                title="No time recorded against this task"
                description="Add time from your timesheet and link it to this task."
              />
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-body-sm font-medium text-ink">
                      {entry.workDateLabel}
                    </p>
                    <p className="mt-0.5 text-caption text-ink-muted">
                      {entry.completedWork}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="neutral">{entry.division.code}</Badge>
                    <span className="text-body-sm tabular font-semibold text-ink">
                      <Duration value={entry.duration} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
