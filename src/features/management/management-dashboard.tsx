'use client';

import * as React from 'react';
import Link from 'next/link';
import { Eye } from 'lucide-react';
import { mockManagementService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { DashboardGrid, PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { Field } from '@/components/forms/field';
import { Select } from '@/components/forms/inputs';
import { BarChart, ChartContainer, DonutChart } from '@/components/charts/chart';
import type { Result } from '@/contracts/results';

function Fallback({ result }: { result: Exclude<Result<unknown>, { status: 'success' }> }) {
  if (result.status === 'permission_denied') {
    return (
      <PageContainer>
        <EmptyState
          variant="denied"
          title="Not available to your role"
          description={`${result.message} ${result.guidance ?? ''}`.trim()}
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <EmptyState variant="error" title="Management overview unavailable" />
    </PageContainer>
  );
}

/**
 * FE-0612 and FE-0613 — the management dashboard.
 *
 * Everything here is a reader. The screen imports `mockManagementService`
 * only, and that interface has no mutating method at all — so "no edit,
 * approve, verify, override or destructive action" is enforced by what this
 * component *can* call, not by remembering to leave buttons out.
 *
 * Cost is restricted for this role regardless of any permission grant: a
 * view-only mandate does not extend to salary and labour cost.
 */
export function ManagementDashboard() {
  const { user } = useSession();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);

  const { state } = useAsync(
    () => mockManagementService.getDashboard(user?.userId ?? '', periodId),
    [user?.userId, periodId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading management overview</span>
        </div>
      </PageContainer>
    );
  }
  if (state.status !== 'success') return <Fallback result={state.failure} />;

  const data = state.data;
  const divisionChart = data.divisionSummaries.map((entry) => ({
    key: entry.division.id,
    label: entry.division.name,
    value: entry.active.minutes,
    display: entry.active.display,
  }));
  const projectChart = data.projectProgress.map((entry) => ({
    key: entry.project.id,
    label: entry.project.code,
    value: entry.actual.minutes,
    display: entry.actual.display,
  }));

  return (
    <PageContainer width="full">
      <PageHeader
        title="Management dashboard"
        description="Authorized company, division, employee and project summaries for the selected period."
        meta={
          <>
            <Badge tone="accent" icon={<Eye aria-hidden className="size-3.5" />}>
              Read-only
            </Badge>
            <Badge tone={data.period.isVerified ? 'success' : 'warning'}>
              {data.period.isVerified ? 'Verified period' : 'Not verified'}
            </Badge>
            <Badge tone="neutral">{data.period.rangeLabel}</Badge>
          </>
        }
        actions={
          <Field label="Period" hideLabel className="w-56">
            <Select
              value={data.period.id}
              aria-label="Period"
              onChange={(event) => setPeriodId(event.target.value)}
              options={data.availablePeriods.map((period) => ({
                value: period.id,
                label: `${period.label}${period.isVerified ? '' : ' (not verified)'}`,
              }))}
            />
          </Field>
        }
      />

      <Callout tone="info" className="mt-4">
        {data.readOnlyNote}
      </Callout>

      {data.unverifiedWarning && (
        <Callout tone="warning" className="mt-3">
          {data.unverifiedWarning}
        </Callout>
      )}

      <DashboardGrid className="mt-5">
        {data.companyMetrics.map((tile) => (
          <MetricCard key={tile.key} tile={tile} />
        ))}
      </DashboardGrid>

      <DashboardGrid className="mt-4">
        {data.restrictedTiles.map((tile) => (
          <MetricCard key={tile.key} tile={tile} />
        ))}
      </DashboardGrid>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartContainer
          title="Time allocation by division"
          description="Where recorded active time went in this period."
          tableCaption="Active hours by division"
          valueHeader="Active hours"
          data={divisionChart}
        >
          <DonutChart data={divisionChart} centerLabel="Divisions" centerValue={String(divisionChart.length)} />
        </ChartContainer>

        <ChartContainer
          title="Actual hours by project"
          description="Recorded time against each project."
          tableCaption="Actual active hours by project"
          valueHeader="Active hours"
          data={projectChart}
        >
          <BarChart data={projectChart} />
        </ChartContainer>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Employee summaries"
            description={`${data.employeeSummaryCount} employees with recorded time.`}
          />
          <div className="mt-4 table-scroll">
            <table className="w-full text-body-sm">
              <caption className="sr-only">
                Active hours, complete days and exception days by employee
              </caption>
              <thead>
                <tr className="text-caption text-ink-muted">
                  <th scope="col" className="py-1.5 text-left">Employee</th>
                  <th scope="col" className="py-1.5 text-left">Divisions</th>
                  <th scope="col" className="py-1.5 text-right">Active</th>
                  <th scope="col" className="py-1.5 text-right">Complete</th>
                  <th scope="col" className="py-1.5 text-right">Exceptions</th>
                </tr>
              </thead>
              <tbody>
                {data.employeeSummaries.map((row) => (
                  <tr key={row.employee.id} className="border-t border-border">
                    <td className="py-2 text-ink">{row.employee.fullName}</td>
                    <td className="py-2 text-ink-muted">{row.divisionCodes.join(', ') || '—'}</td>
                    <td className="py-2 text-right">
                      <Duration value={row.active} />
                    </td>
                    <td className="py-2 text-right text-ink tabular">{row.completeDayCount}</td>
                    <td className="py-2 text-right text-ink tabular">{row.exceptionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Project progress"
            description="Completion, estimate and actual time. Cost and budget are outside this role."
          />
          <ul className="mt-4 space-y-3">
            {data.projectProgress.map((entry) => (
              <li key={entry.project.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={entry.href}
                      className="inline-flex min-h-6 items-center truncate text-body-sm font-medium text-ink hover:underline"
                    >
                      {entry.project.name}
                    </Link>
                    <p className="text-caption text-ink-muted">{entry.project.code}</p>
                  </div>
                  <Badge tone="neutral">{entry.status}</Badge>
                </div>
                <ProgressBar
                  className="mt-3"
                  value={entry.completionPercent}
                  label="Completion"
                  valueText={`${entry.completionPercent}%`}
                  tone="accent"
                />
                <dl className="mt-3 grid grid-cols-3 gap-2 text-caption">
                  <div>
                    <dt className="text-ink-muted">Estimated</dt>
                    <dd className="font-semibold text-ink">
                      <Duration value={entry.estimated} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Actual</dt>
                    <dd className="font-semibold text-ink">
                      <Duration value={entry.actual} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Variance</dt>
                    <dd className="font-semibold text-ink tabular">
                      {entry.variancePercent === null
                        ? '—'
                        : `${entry.variancePercent > 0 ? '+' : ''}${entry.variancePercent}%`}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
            {data.projectProgress.length === 0 && (
              <li className="text-body-sm text-ink-muted">No project time recorded.</li>
            )}
          </ul>
        </Card>
      </div>
    </PageContainer>
  );
}
