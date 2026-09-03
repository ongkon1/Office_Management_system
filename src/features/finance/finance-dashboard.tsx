'use client';

import * as React from 'react';
import { Building2, Clock, FileSpreadsheet, TrendingUp } from 'lucide-react';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { DashboardGrid, PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { BarChart, ChartContainer, DonutChart } from '@/components/charts/chart';
import {
  CostPermissionBadge,
  FinanceFallback,
  FinanceLoading,
  PeriodPicker,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

/**
 * FE-0601 and FE-0602 — the Finance dashboard.
 *
 * The hours tiles are available to any Finance viewer; the money tiles keep
 * their labels and render a restricted marker without `finance.cost.view`.
 * That split is the whole point of the screen: the role is not the permission.
 */
export function FinanceDashboard() {
  const { user } = useSession();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);

  const { state } = useAsync(
    () => mockFinanceService.getDashboard(user?.userId ?? '', periodId),
    [user?.userId, periodId],
  );

  if (state.status === 'loading') return <FinanceLoading label="Finance dashboard" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Finance dashboard" />;
  }
  const data = state.data;

  const divisionChart = data.divisionHours.map((entry) => ({
    key: entry.division.id,
    label: entry.division.name,
    value: entry.active.minutes,
    display: entry.active.display,
  }));
  const projectChart = data.projectHours.map((entry) => ({
    key: entry.project.id,
    label: entry.project.code,
    value: entry.active.minutes,
    display: entry.active.display,
  }));

  return (
    <PageContainer width="full">
      <PageHeader
        title="Finance dashboard"
        description="Verified employee, division, project and overtime hours, with labour cost where the financial-detail permission allows it."
        meta={
          <>
            <VerificationBadge period={data.period} />
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
            <Badge tone="neutral">{data.period.rangeLabel}</Badge>
          </>
        }
        actions={
          <>
            <PeriodPicker
              periods={data.availablePeriods}
              value={data.period.id}
              onChange={setPeriodId}
            />
            <LinkButton
              variant="secondary"
              href="/finance/payroll"
              iconLeading={<FileSpreadsheet aria-hidden className="size-4" />}
            >
              Payroll
            </LinkButton>
          </>
        }
      />

      <UnverifiedWarning warning={data.unverifiedWarning} />

      <DashboardGrid className="mt-5">
        <MetricCard
          tile={{
            key: 'hours',
            label: 'Verified employee hours',
            value: data.verifiedEmployeeHours.display,
            secondaryValue: `${data.employeeCount} employees`,
            href: '/finance/hours',
          }}
        />
        <MetricCard
          tile={{
            key: 'overtime',
            label: 'Verified overtime',
            value: data.verifiedOvertimeHours.display,
            href: '/finance/overtime',
          }}
        />
        <MetricCard tile={data.billableHours} />
        <MetricCard tile={data.nonBillableHours} />
      </DashboardGrid>

      <DashboardGrid className="mt-4">
        <MetricCard tile={data.projectLabourCost} />
        <MetricCard tile={data.divisionLabourCost} />
        <MetricCard tile={data.payrollSummary} />
        <MetricCard tile={data.budgetVariance} />
      </DashboardGrid>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartContainer
          title="Hours by division"
          description="Verified active time attributed to each division."
          tableCaption="Verified active hours by division"
          valueHeader="Active hours"
          data={divisionChart}
        >
          <DonutChart
            data={divisionChart}
            centerLabel="Total active"
            centerValue={data.verifiedEmployeeHours.display}
          />
        </ChartContainer>

        <ChartContainer
          title="Hours by project"
          description="Verified active time attributed to each project."
          tableCaption="Verified active hours by project"
          valueHeader="Active hours"
          data={projectChart}
        >
          <BarChart data={projectChart} />
        </ChartContainer>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Division detail"
            description="The same figures as the chart, in tabular form."
            actions={
              <LinkButton variant="ghost" size="sm" href="/finance/division-costs">
                Division costs
              </LinkButton>
            }
          />
          <div className="mt-4 table-scroll">
            <table className="w-full text-body-sm">
              <caption className="sr-only">Verified active hours and share by division</caption>
              <thead>
                <tr className="text-caption text-ink-muted">
                  <th scope="col" className="py-1.5 text-left">Division</th>
                  <th scope="col" className="py-1.5 text-right">Active</th>
                  <th scope="col" className="py-1.5 text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.divisionHours.map((entry) => (
                  <tr key={entry.division.id} className="border-t border-border">
                    <td className="py-2 text-ink">
                      <span className="flex items-center gap-2">
                        <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
                        {entry.division.name}
                        {entry.division.isRestricted && <Badge tone="warning">Restricted</Badge>}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Duration value={entry.active} />
                    </td>
                    <td className="py-2 text-right text-ink tabular">{entry.sharePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Recent exports"
            description="Export history, including the states an export can fail into."
            actions={
              <LinkButton variant="ghost" size="sm" href="/finance/reports">
                Reports
              </LinkButton>
            }
          />
          <ul className="mt-4 space-y-2">
            {data.recentExports.map((job) => (
              <li key={job.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-ink">{job.reportTitle}</p>
                    <p className="text-caption text-ink-muted">
                      {job.formatLabel} · {job.requestedByLabel} · {job.requestedAtLabel}
                    </p>
                  </div>
                  <Badge
                    tone={
                      job.state === 'ready'
                        ? 'success'
                        : job.state === 'failed'
                          ? 'danger'
                          : job.state === 'expired'
                            ? 'warning'
                            : 'neutral'
                    }
                  >
                    {job.stateLabel}
                  </Badge>
                </div>
                {job.failureMessage && (
                  <p className="mt-2 text-caption text-danger">{job.failureMessage}</p>
                )}
              </li>
            ))}
            {data.recentExports.length === 0 && (
              <li className="text-body-sm text-ink-muted">No exports requested yet.</li>
            )}
          </ul>
        </Card>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <LinkButton variant="secondary" href="/finance/hours" iconLeading={<Clock aria-hidden className="size-4" />}>
          Employee hours
        </LinkButton>
        <LinkButton variant="secondary" href="/finance/overtime" iconLeading={<TrendingUp aria-hidden className="size-4" />}>
          Overtime
        </LinkButton>
        <LinkButton variant="secondary" href="/finance/billable">
          Billable analysis
        </LinkButton>
        <LinkButton variant="secondary" href="/finance/project-costs">
          Project costs
        </LinkButton>
      </div>
    </PageContainer>
  );
}
