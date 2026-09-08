'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, House, Play, Plus } from 'lucide-react';
import type { EmployeeDashboardView } from '@/contracts/view-models';
import { useAsync } from '@/lib/use-async';
import { formatElapsed, useTimer } from '@/features/timesheet/use-timer';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { BarChart, ChartContainer } from '@/components/charts/chart';
import {
  DashboardGrid,
  PageContainer,
  PageHeader,
  SplitPanel,
} from '@/components/layout/page';
import { mockDashboardService } from '@/services/mock/work';
import { DEMO_TODAY } from '@/lib/demo-context';
import { ATTENDANCE_LABEL } from '@/lib/status';

const QUICK_ACTION_ICONS: Record<string, React.ReactNode> = {
  add_time: <Plus aria-hidden className="size-4" />,
  start_timer: <Play aria-hidden className="size-4" />,
  request_wfh: <House aria-hidden className="size-4" />,
  apply_leave: <CalendarPlus aria-hidden className="size-4" />,
};

/**
 * The employee dashboard (`FE-0301`–`FE-0305`).
 *
 * Every metric links to the filtered detail view it summarises
 * (`REQ-DASH-008`), so a number is never a dead end.
 */
export function EmployeeDashboard({ userId }: { userId: string }) {
  const router = useRouter();
  const { state, reload } = useAsync(
    () => mockDashboardService.getEmployeeDashboard(userId, DEMO_TODAY),
    [userId],
  );
  const timer = useTimer();

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy className="flex flex-col gap-5">
          <span className="sr-only">Loading your dashboard</span>
          <Skeleton height="2rem" width="14rem" />
          <DashboardGrid>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height="6.5rem" rounded="md" />
            ))}
          </DashboardGrid>
          <Skeleton height="16rem" rounded="md" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Could not load your dashboard"
          description="The request failed. Try again, or contact support if this continues."
          action={{ label: 'Try again', onClick: reload }}
        />
      </PageContainer>
    );
  }

  const view = state.data;
  const today = view.today;

  return (
    <PageContainer>
      <PageHeader
        title="My dashboard"
        description={today.dateLabel}
        meta={
          <>
            <StatusIndicator status={today.status.status} />
            <Badge tone="neutral">{ATTENDANCE_LABEL[today.attendance]}</Badge>
          </>
        }
        actions={view.quickActions
          .filter((action) => action.enabled)
          .map((action) => (
            <Button
              key={action.key}
              variant={action.key === 'add_time' ? 'primary' : 'secondary'}
              iconLeading={QUICK_ACTION_ICONS[action.key]}
              onClick={() => {
                router.push(action.href);
              }}
            >
              {action.label}
            </Button>
          ))}
      />

      <div className="mt-5 flex flex-col gap-5">
        {timer.session?.isRunning && (
          <Alert
            tone="info"
            title={`Timer running — ${formatElapsed(timer.elapsedSeconds)}`}
            actions={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  router.push(`/timesheets/${DEMO_TODAY}`);
                }}
              >
                Go to timesheet
              </Button>
            }
          >
            Stopping the timer creates a draft you review before it counts toward the day.
          </Alert>
        )}

        {/* FE-0301: today's summary. */}
        <Card>
          <CardHeader
            title="Today"
            description="Active work, the recognized break, and where the day stands."
            as="h2"
            actions={
              <Link
                href={`/timesheets/${today.date}`}
                className="inline-flex min-h-6 items-center text-body-sm text-accent underline underline-offset-2"
              >
                Open today
              </Link>
            }
          />

          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Active work', value: today.active, href: `/timesheets/${today.date}` },
              { label: 'Break', value: today.break },
              { label: 'Daily total', value: today.total },
              { label: 'Remaining active', value: today.remainingActive },
            ].map((item) => (
              <div key={item.label}>
                <p className="text-label text-ink-muted">{item.label}</p>
                <p className="mt-0.5 text-metric tabular text-ink">
                  <Duration value={item.value} />
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <ProgressBar
              value={today.scheduleProgressPercent}
              label="Progress toward the eight-hour schedule"
              valueText={`${today.total.display} of 8:00`}
              tone={
                today.status.status === 'critical'
                  ? 'critical'
                  : today.status.status === 'overtime'
                    ? 'overtime'
                    : today.status.status === 'complete'
                      ? 'complete'
                      : 'undertime'
              }
            />
          </div>

          {view.todaysDivisions.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-label text-ink-muted">Today&apos;s divisions</p>
              <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                {view.todaysDivisions.map((contribution) => (
                  <li key={contribution.division.id} className="flex items-baseline gap-1.5">
                    <span className="text-body-sm text-ink">
                      {contribution.division.name}
                    </span>
                    <span className="text-body-sm font-semibold tabular text-ink">
                      <Duration value={contribution.active} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* FE-0303: period totals, each linking to its detail view. */}
        <DashboardGrid>
          <MetricCard
            tile={{
              key: 'week-active',
              label: 'Active work this week',
              value: view.weekly.active.display,
              secondaryValue: `Required ${view.weekly.requiredActive.display}`,
              href: '/timesheets',
            }}
          />
          <MetricCard
            tile={{
              key: 'month-active',
              label: 'Active work this month',
              value: view.monthly.active.display,
              secondaryValue: `${view.monthly.completeDayCount} complete days`,
              href: '/timesheets',
            }}
          />
          <MetricCard
            tile={{
              key: 'overtime',
              label: 'Overtime this month',
              value: view.monthly.overtime.display,
              tone: view.monthly.overtime.minutes > 0 ? 'caution' : 'neutral',
              href: '/timesheets',
            }}
          />
          <MetricCard
            tile={{
              key: 'missing',
              label: 'Missing days this month',
              value: String(view.missingDates.length),
              tone: view.missingDates.length > 0 ? 'negative' : 'positive',
              secondaryValue:
                view.missingDates.length > 0
                  ? view.missingDates.slice(0, 2).join(', ')
                  : 'Nothing outstanding',
              href: '/timesheets',
            }}
          />
        </DashboardGrid>

        <SplitPanel
          main={
            <div className="flex flex-col gap-5">
              {/* FE-0302: active tasks and deadlines. */}
              <Card>
                <CardHeader
                  title="Active tasks"
                  as="h2"
                  actions={
                    <Link
                      href="/tasks"
                      className="inline-flex min-h-6 items-center text-body-sm text-accent underline underline-offset-2"
                    >
                      All tasks
                    </Link>
                  }
                />
                {view.activeTasks.length === 0 ? (
                  <div className="mt-3">
                    <EmptyState
                      variant="empty"
                      title="No active tasks"
                      description="Nothing is assigned to you right now."
                    />
                  </div>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {view.activeTasks.slice(0, 5).map((task) => (
                      <li key={task.id} className="py-2.5 first:pt-0">
                        <Link href={task.href} className="group block">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-body-sm font-medium text-ink group-hover:text-accent">
                                {task.title}
                              </p>
                              <p className="mt-0.5 text-caption text-ink-muted">
                                {task.project.name} · {task.division.code}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {task.isOverdue && <Badge tone="danger">Overdue</Badge>}
                              <span className="text-caption tabular text-ink-muted">
                                {task.actual.display} / {task.estimated.display}
                              </span>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {view.divisionContribution.length > 0 && (
                <ChartContainer
                  title="Division contribution this month"
                  description="Active work only; breaks are excluded."
                  data={view.divisionContribution.map((contribution) => ({
                    key: contribution.division.id,
                    label: contribution.division.name,
                    value: contribution.active.minutes,
                    display: contribution.active.display,
                  }))}
                  tableCaption="Active work by division for this month"
                  valueHeader="Active work"
                >
                  <BarChart
                    data={view.divisionContribution.map((contribution) => ({
                      key: contribution.division.id,
                      label: contribution.division.name,
                      value: contribution.active.minutes,
                      display: contribution.active.display,
                    }))}
                  />
                </ChartContainer>
              )}
            </div>
          }
          aside={
            <div className="flex flex-col gap-5">
              <Card>
                <CardHeader title="Upcoming deadlines" as="h2" />
                {view.upcomingDeadlines.length === 0 ? (
                  <p className="mt-3 text-body-sm text-ink-muted">
                    Nothing due in the near term.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2.5">
                    {view.upcomingDeadlines.map((deadline) => (
                      <li key={deadline.taskId}>
                        <Link href={deadline.href} className="group block">
                          <p className="truncate text-body-sm text-ink group-hover:text-accent">
                            {deadline.title}
                          </p>
                          <p className="text-caption text-ink-muted">
                            {deadline.dueDateLabel}
                            {deadline.isOverdue ? (
                              <span className="ml-1.5 font-medium text-danger">Overdue</span>
                            ) : (
                              <span className="ml-1.5">in {deadline.daysRemaining} days</span>
                            )}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Recent remarks"
                  as="h2"
                  actions={
                    <Link
                      href="/remarks"
                      className="inline-flex min-h-6 items-center text-body-sm text-accent underline underline-offset-2"
                    >
                      All remarks
                    </Link>
                  }
                />
                {view.recentRemarks.length === 0 ? (
                  <p className="mt-3 text-body-sm text-ink-muted">No remarks.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-3">
                    {view.recentRemarks.slice(0, 3).map((remark) => (
                      <li key={remark.id}>
                        <Link href={remark.href} className="group block">
                          <div className="flex items-center gap-2">
                            <span className="text-caption font-medium text-ink">
                              {remark.author.fullName}
                            </span>
                            {remark.isCorrectionRequest && (
                              <Badge tone="warning">Correction</Badge>
                            )}
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-caption text-ink-muted group-hover:text-ink">
                            {remark.message}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              {view.wfhStatus && (
                <Card>
                  <CardHeader title="WFH" as="h2" />
                  <p className="mt-2 text-body-sm text-ink">{view.wfhStatus.dateLabel}</p>
                  <p className="text-caption text-ink-muted">
                    {view.wfhStatus.portionLabel} · {view.wfhStatus.stateLabel}
                  </p>
                </Card>
              )}
            </div>
          }
        />
      </div>
    </PageContainer>
  );
}

export type { EmployeeDashboardView };
