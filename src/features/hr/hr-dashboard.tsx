'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CalendarCheck,
  ClipboardList,
  UserPlus,
  Users,
} from 'lucide-react';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { DashboardGrid, PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Callout } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { BarChart, ChartContainer } from '@/components/charts/chart';
import { CompanyScope, HrLoading, HrResultFallback } from './shared';

/**
 * FE-0501 — the HR dashboard.
 *
 * Every number here comes from the same service call, and every tile links to
 * the screen that can act on it. The verification panel is deliberately the
 * most prominent: it is the only control on this page that locks data.
 */
export function HrDashboard() {
  const { user } = useSession();
  const { state } = useAsync(() => mockHrService.getDashboard(user?.userId ?? ''), [user?.userId]);

  if (state.status === 'loading') return <HrLoading label="HR dashboard" />;
  if (state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject="HR dashboard" />;
  }
  const data = state.data;
  const verification = data.pendingVerification;

  return (
    <PageContainer width="full">
      <PageHeader
        title="HR dashboard"
        description="Headcount, attendance, timesheet exceptions, monthly hours, evaluations and workload concerns across every division."
        meta={<CompanyScope />}
        actions={
          <>
            <LinkButton variant="secondary" href="/employees" iconLeading={<Users aria-hidden className="size-4" />}>
              Employees
            </LinkButton>
            <LinkButton variant="primary" href="/employees/new" iconLeading={<UserPlus aria-hidden className="size-4" />}>
              Add employee
            </LinkButton>
          </>
        }
      />

      <DashboardGrid className="mt-5">
        <MetricCard
          tile={{
            key: 'active',
            label: 'Active employees',
            value: String(data.activeEmployees),
            secondaryValue: `${data.totalEmployees} on record`,
            href: '/employees',
          }}
        />
        <MetricCard
          tile={{
            key: 'divisions',
            label: 'Divisions',
            value: String(data.divisionCount),
            secondaryValue: 'All divisions in scope',
          }}
        />
        <MetricCard
          tile={{
            key: 'monthly',
            label: 'Monthly active hours',
            value: data.monthlyHours.active.display,
            secondaryValue: `Required ${data.monthlyHours.requiredActive.display}`,
            href: '/hr/timesheets',
          }}
        />
        <MetricCard
          tile={{
            key: 'incomplete',
            label: 'Incomplete profiles',
            value: String(data.incompleteProfiles),
            tone: data.incompleteProfiles > 0 ? 'caution' : 'neutral',
            href: '/employees?incomplete=1',
          }}
        />
      </DashboardGrid>

      {verification && (
        <Card className="mt-5">
          <CardHeader
            title={`Payroll period: ${verification.label}`}
            description={`${verification.rangeLabel} · policy version ${verification.policyVersion}`}
            actions={
              <LinkButton variant="primary" href={`/hr/timesheets?period=${verification.periodId}`}>
                Open verification workspace
              </LinkButton>
            }
          />
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <p className="text-caption text-ink-muted">Status</p>
              <Badge
                className="mt-1"
                tone={verification.status === 'verified' ? 'success' : 'warning'}
              >
                {verification.statusLabel}
              </Badge>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Employees complete</p>
              <p className="mt-1 text-body font-semibold text-ink">
                {verification.completeEmployeeCount} of {verification.employeeCount}
              </p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Open exceptions</p>
              <p className="mt-1 text-body font-semibold text-ink">
                {verification.openExceptionCount}
              </p>
            </div>
            <div>
              <p className="text-caption text-ink-muted">Unresolved corrections</p>
              <p className="mt-1 text-body font-semibold text-ink">
                {verification.unresolvedCorrectionCount}
              </p>
            </div>
          </div>
          <Callout tone="info" className="mt-4">
            Verification locks the period for payroll. It is not an approval of any individual
            day — Team Leads request corrections, HR verifies the period.
          </Callout>
        </Card>
      )}

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Attendance today"
            description="Every state an employee day can be in, including the ones that are not timesheet failures."
            actions={
              <LinkButton variant="ghost" size="sm" href="/attendance">
                Open attendance
              </LinkButton>
            }
          />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.attendanceBreakdown.map((entry) => (
              <li
                key={entry.state}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-sunken px-3 py-2"
              >
                <span className="text-body-sm text-ink">{entry.label}</span>
                <span className="text-body font-semibold text-ink tabular">{entry.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Time exceptions this month"
            description="Missing, under-time, overtime and critical days across all divisions."
            actions={
              <LinkButton variant="ghost" size="sm" href="/hr/timesheets">
                Review
              </LinkButton>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ['missing', data.exceptions.missing],
                ['under_time', data.exceptions.underTime],
                ['overtime', data.exceptions.overtime],
                ['critical', data.exceptions.critical],
              ] as const
            ).map(([status, tile]) => (
              <div
                key={tile.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <StatusIndicator status={status} variant="inline" />
                <span className="text-metric text-ink tabular">{tile.value}</span>
              </div>
            ))}
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
            <div>
              <dt className="text-caption text-ink-muted">Active</dt>
              <dd className="font-semibold text-ink">
                <Duration value={data.monthlyHours.active} />
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Break</dt>
              <dd className="font-semibold text-ink">
                <Duration value={data.monthlyHours.break} />
              </dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Overtime</dt>
              <dd className="font-semibold text-ink">
                <Duration value={data.monthlyHours.overtime} />
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader title="Headcount by division" description="Active assignments per division." />
          <ul className="mt-4 space-y-2">
            {data.divisionHeadcount.map((entry) => (
              <li key={entry.division.id} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
                  <span className="truncate text-body-sm text-ink">{entry.division.name}</span>
                  {entry.division.isRestricted && <Badge tone="warning">Restricted</Badge>}
                </span>
                <span className="text-body font-semibold text-ink tabular">{entry.count}</span>
              </li>
            ))}
          </ul>
        </Card>

        <ChartContainer
          title="WFH trend"
          description="Approved and requested work-from-home days by month."
          tableCaption="Work-from-home requests by month"
          valueHeader="Requests"
          data={data.wfhTrend.map((point) => ({
            key: point.label,
            label: point.label,
            value: point.count,
            display: String(point.count),
          }))}
        >
          <BarChart
            data={data.wfhTrend.map((point) => ({
              key: point.label,
              label: point.label,
              value: point.count,
              display: String(point.count),
            }))}
          />
        </ChartContainer>

        <Card>
          <CardHeader
            title="Workload concerns"
            description="Employees outside the expected weekly capacity band."
          />
          <ul className="mt-4 space-y-3">
            {data.workloadConcerns.map((concern) => (
              <li key={concern.employee.id} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-ink">
                      {concern.employee.fullName}
                    </p>
                    <p className="text-caption text-ink-muted">{concern.weekLabel}</p>
                  </div>
                  <Badge tone={concern.warning === 'overallocated' ? 'danger' : 'warning'}>
                    {concern.warningLabel}
                  </Badge>
                </div>
                <ProgressBar
                  className="mt-3"
                  value={concern.utilizationPercent}
                  label="Planned utilization"
                  valueText={`${concern.utilizationPercent}%`}
                  tone={concern.warning === 'overallocated' ? 'critical' : 'undertime'}
                />
              </li>
            ))}
            {data.workloadConcerns.length === 0 && (
              <li className="text-body-sm text-ink-muted">No workload concerns this week.</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Evaluation periods"
            description="Open periods and how far each has progressed."
            actions={
              <LinkButton variant="ghost" size="sm" href="/evaluations">
                Manage
              </LinkButton>
            }
          />
          <ul className="mt-4 space-y-3">
            {data.openEvaluationPeriods.map((period) => (
              <li key={period.periodLabel} className="rounded-md border border-border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body-sm font-medium text-ink">{period.periodLabel}</p>
                    <p className="text-caption text-ink-muted">Due {period.dueDateLabel}</p>
                  </div>
                  <ClipboardList aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </div>
                <dl className="mt-3 grid grid-cols-4 gap-2 text-caption">
                  <div>
                    <dt className="text-ink-muted">Not started</dt>
                    <dd className="font-semibold text-ink">{period.notStarted}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">In progress</dt>
                    <dd className="font-semibold text-ink">{period.inProgress}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">With HR</dt>
                    <dd className="font-semibold text-ink">{period.submitted}</dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Published</dt>
                    <dd className="font-semibold text-ink">{period.published}</dd>
                  </div>
                </dl>
              </li>
            ))}
            {data.openEvaluationPeriods.length === 0 && (
              <li className="text-body-sm text-ink-muted">No open evaluation period.</li>
            )}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Recent assignment changes"
            description="Division assignments, including temporary ones with an end date."
          />
          <ul className="mt-4 space-y-2">
            {data.recentAssignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/employees/${assignment.employee.id}`}
                    className="inline-flex min-h-6 items-center text-body-sm font-medium text-ink hover:underline"
                  >
                    {assignment.employee.fullName}
                  </Link>
                  <p className="text-caption text-ink-muted">
                    {assignment.division.name} · {assignment.changeLabel}
                  </p>
                  <p className="text-caption text-ink-subtle">{assignment.effectiveLabel}</p>
                </div>
                {assignment.isTemporary ? (
                  <Badge tone="info" icon={<CalendarCheck aria-hidden className="size-3.5" />}>
                    Temporary
                  </Badge>
                ) : (
                  <Badge tone="neutral">Standing</Badge>
                )}
              </li>
            ))}
          </ul>
          {data.incompleteProfiles > 0 && (
            <Callout tone="warning" className="mt-4">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle aria-hidden className="size-4" />
                {data.incompleteProfiles} employee record(s) are missing required profile fields.
              </span>
            </Callout>
          )}
        </Card>
      </div>
    </PageContainer>
  );
}
