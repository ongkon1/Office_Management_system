'use client';

import Link from 'next/link';
import { AlertTriangle, CalendarClock, CheckSquare2, FolderKanban, UserCog, Users } from 'lucide-react';
import type { TeamTaskView } from '@/contracts/team-lead';
import { useSession } from '@/features/access/session-provider';
import { useAsync } from '@/lib/use-async';
import { PRIORITY_LABEL, TASK_STATUS_LABEL } from '@/lib/status';
import { teamLeadService } from '@/services/runtime/team-lead';
import { DashboardGrid, PageContainer, PageHeader, SectionHeader } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { EmptyState } from '@/components/feedback/alert';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const PRIORITY_TONE: Readonly<Record<TeamTaskView['priority'], BadgeTone>> = {
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

const STATUS_TONE: Readonly<Record<TeamTaskView['status'], BadgeTone>> = {
  pending: 'neutral',
  in_progress: 'accent',
  completed: 'success',
};

const ADMIN_SHORTCUTS = [
  { label: 'Employees', href: '/employees', note: 'People, roles and employment records', icon: Users },
  { label: 'Tasks', href: '/tasks', note: 'Assignments, status and delivery deadlines', icon: CheckSquare2 },
  { label: 'Projects', href: '/projects', note: 'Projects, membership and progress', icon: FolderKanban },
  { label: 'Users', href: '/admin/users', note: 'Accounts, access and role assignment', icon: UserCog },
] as const;

function DashboardLoading() {
  return (
    <PageContainer>
      <div role="status" aria-busy>
        <span className="sr-only">Loading administrator dashboard</span>
        <Skeleton height="2.25rem" width="18rem" />
        <DashboardGrid className="mt-6">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height="7.5rem" rounded="md" />
          ))}
        </DashboardGrid>
        <Skeleton height="22rem" rounded="md" className="mt-6" />
      </div>
    </PageContainer>
  );
}

function deadlineTasks(tasks: readonly TeamTaskView[]): readonly TeamTaskView[] {
  return [...tasks]
    .filter((task) => task.status !== 'completed' && task.dueDate !== null)
    .sort((left, right) => {
      if (left.isOverdue !== right.isOverdue) return left.isOverdue ? -1 : 1;
      return left.dueDate!.localeCompare(right.dueDate!);
    })
    .slice(0, 6);
}

/**
 * Super Administrator landing view.
 *
 * Task rows come from the existing operations service, which applies record
 * authorization before returning them. This component only summarizes and
 * orders that already-authorized view; it never fetches fixtures directly.
 */
export function AdminDashboard() {
  const { user } = useSession();
  const { state } = useAsync(
    () => teamLeadService.listTasks(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <DashboardLoading />;

  if (state.status !== 'success') {
    return (
      <PageContainer>
        <PageHeader
          title="Administration dashboard"
          description="Organization-wide delivery deadlines and administrative shortcuts."
        />
        <EmptyState
          className="mt-6"
          variant="error"
          title="Task overview unavailable"
          description={state.failure.message}
        />
      </PageContainer>
    );
  }

  const tasks = state.data;
  const pendingCount = tasks.filter((task) => task.status === 'pending').length;
  const inProgressCount = tasks.filter((task) => task.status === 'in_progress').length;
  const overdueCount = tasks.filter(
    (task) => task.status !== 'completed' && task.isOverdue,
  ).length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;
  const deadlines = deadlineTasks(tasks);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Administration dashboard"
        description="Monitor task delivery across the organization and open the areas that need attention."
        meta={
          <Badge tone="accent" icon={<Users aria-hidden className="size-3.5" />}>
            Organization-wide task view
          </Badge>
        }
        actions={<LinkButton href="/tasks" variant="primary">View all tasks</LinkButton>}
      />

      <DashboardGrid className="mt-6">
        <MetricCard
          tile={{
            key: 'pending_tasks',
            label: 'Pending tasks',
            value: String(pendingCount),
            secondaryValue: 'Waiting to start',
            tone: pendingCount > 0 ? 'caution' : 'neutral',
            href: '/tasks',
          }}
        />
        <MetricCard
          tile={{
            key: 'in_progress_tasks',
            label: 'In progress',
            value: String(inProgressCount),
            secondaryValue: 'Currently being worked on',
            href: '/tasks',
          }}
        />
        <MetricCard
          tile={{
            key: 'overdue_tasks',
            label: 'Overdue tasks',
            value: String(overdueCount),
            secondaryValue: overdueCount > 0 ? 'Needs attention' : 'No overdue work',
            tone: overdueCount > 0 ? 'negative' : 'positive',
            href: '/tasks',
          }}
        />
        <MetricCard
          tile={{
            key: 'completed_tasks',
            label: 'Completed tasks',
            value: String(completedCount),
            secondaryValue: `${tasks.length} tasks visible in total`,
            tone: 'positive',
            href: '/tasks',
          }}
        />
      </DashboardGrid>

      <Card className="mt-6" padding="lg">
        <CardHeader
          title="Approaching task deadlines"
          description="Open work ordered by urgency and nearest due date. Overdue tasks appear first."
          actions={<LinkButton href="/tasks" variant="secondary" size="sm">Open task board</LinkButton>}
        />

        {deadlines.length === 0 ? (
          <EmptyState
            title="No upcoming task deadlines"
            description="There are no open tasks with a due date in your authorized view."
          />
        ) : (
          <ul className="mt-5 divide-y divide-border" aria-label="Approaching task deadlines">
            {deadlines.map((task) => (
              <li key={task.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="rounded-xs text-body-sm font-semibold text-ink hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                      >
                        {task.title}
                      </Link>
                      <Badge tone={STATUS_TONE[task.status]}>
                        {TASK_STATUS_LABEL[task.status]}
                      </Badge>
                      <Badge tone={PRIORITY_TONE[task.priority]}>
                        {PRIORITY_LABEL[task.priority]} priority
                      </Badge>
                    </div>
                    <p className="mt-1 text-caption text-ink-muted">
                      {task.projectLabel} · {task.assignee?.fullName ?? 'Unassigned'} · {task.division.name}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    <span
                      className={task.isOverdue
                        ? 'inline-flex items-center gap-1.5 text-body-sm font-medium text-critical'
                        : 'inline-flex items-center gap-1.5 text-body-sm font-medium text-ink'}
                    >
                      {task.isOverdue
                        ? <AlertTriangle aria-hidden className="size-4 shrink-0" />
                        : <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />}
                      {task.isOverdue ? 'Overdue' : 'Due'} {task.dueDateLabel}
                    </span>
                    <LinkButton href={`/tasks/${task.id}`} variant="secondary" size="sm">
                      View details
                    </LinkButton>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="mt-7" aria-labelledby="admin-shortcuts-heading">
        <SectionHeader
          title="Administration shortcuts"
          description="Frequently used areas for managing people and delivery."
        />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {ADMIN_SHORTCUTS.map((shortcut) => {
            const ShortcutIcon = shortcut.icon;
            return (
              <Link key={shortcut.href} href={shortcut.href} className="group rounded-xl">
                <Card className="h-full transition-[border-color,background-color,box-shadow] duration-200 group-hover:border-accent-border group-hover:bg-accent-subtle/30 group-hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <span className="rounded-lg bg-accent-subtle p-2 text-accent-strong">
                      <ShortcutIcon aria-hidden className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-body-sm font-semibold text-ink">{shortcut.label}</h3>
                      <p className="mt-0.5 text-caption text-ink-muted">{shortcut.note}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </PageContainer>
  );
}
