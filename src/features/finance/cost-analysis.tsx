'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import type { CostLineView } from '@/contracts/finance';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { BarChart, ChartContainer } from '@/components/charts/chart';
import { cn } from '@/lib/cn';
import {
  CostPermissionBadge,
  DIVISION_FILTER_OPTIONS,
  FinanceFallback,
  FinanceLoading,
  MoneyValue,
  PeriodPicker,
  RestrictionNote,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

function VarianceBadge({ percent }: { percent: number | null }) {
  if (percent === null) {
    return <span className="text-caption text-ink-muted">No budget set</span>;
  }
  return (
    <Badge tone={percent > 0 ? 'danger' : percent < 0 ? 'success' : 'neutral'}>
      {percent > 0 ? '+' : ''}
      {percent}% against budget
    </Badge>
  );
}

/**
 * A cost line with its employee drill-down.
 *
 * The drill-down is a disclosure rather than a separate page because the
 * question it answers — "which people make up this number" — is a check on the
 * figure above it, and navigating away loses that comparison.
 */
function CostLine({ line }: { line: CostLineView }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
            {line.label}
            {line.isRestrictedScope && <Badge tone="warning">Restricted division</Badge>}
          </p>
          <p className="text-caption text-ink-muted">{line.secondaryLabel}</p>
        </div>
        <VarianceBadge percent={line.variancePercent} />
      </div>

      <dl className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <dt className="text-caption text-ink-muted">Active</dt>
          <dd className="font-semibold text-ink">
            <Duration value={line.active} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Overtime</dt>
          <dd className="font-semibold text-ink">
            <Duration value={line.overtime} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Labour cost</dt>
          <dd className="font-semibold text-ink">
            <MoneyValue value={line.cost} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Budget</dt>
          <dd className="font-semibold text-ink">
            <MoneyValue value={line.budget} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Variance</dt>
          <dd className="font-semibold text-ink">
            <MoneyValue value={line.variance} />
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-muted">Estimate variance</dt>
          <dd className="font-semibold text-ink tabular">
            {line.estimateVariancePercent === null
              ? '—'
              : `${line.estimateVariancePercent > 0 ? '+' : ''}${line.estimateVariancePercent}%`}
          </dd>
        </div>
      </dl>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="mt-3 inline-flex min-h-6 items-center gap-1 rounded-xs text-caption text-ink-muted underline underline-offset-2 hover:text-ink"
      >
        <ChevronDown
          aria-hidden
          className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')}
        />
        {open ? 'Hide employee breakdown' : `Show employee breakdown (${line.drillDown.length})`}
      </button>

      <div hidden={!open} className="mt-2 table-scroll">
        <table className="w-full text-body-sm">
          <caption className="sr-only">Employee breakdown for {line.label}</caption>
          <thead>
            <tr className="text-caption text-ink-muted">
              <th scope="col" className="py-1.5 text-left">Employee</th>
              <th scope="col" className="py-1.5 text-right">Active</th>
              <th scope="col" className="py-1.5 text-right">Labour cost</th>
            </tr>
          </thead>
          <tbody>
            {line.drillDown.map((entry) => (
              <tr key={entry.key} className="border-t border-border">
                <td className="py-1.5 text-ink">{entry.label}</td>
                <td className="py-1.5 text-right">
                  <Duration value={entry.active} />
                </td>
                <td className="py-1.5 text-right">
                  <MoneyValue value={entry.cost} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </li>
  );
}

/** FE-0604 — project and division cost analysis. */
export function CostAnalysis({ scope }: { scope: 'project' | 'division' }) {
  const { user } = useSession();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);
  const [divisionIds, setDivisionIds] = React.useState<readonly string[]>([]);

  const { state } = useAsync(
    () =>
      mockFinanceService.getCostAnalysis(user?.userId ?? '', scope, {
        periodId,
        divisionIds,
      }),
    [user?.userId, scope, periodId, divisionIds],
    { keepPrevious: true },
  );
  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="cost analysis" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Cost analysis" />;
  }
  const data = state.data;

  const hoursChart = data.lines.map((line) => ({
    key: line.key,
    label: line.label,
    value: line.active.minutes,
    display: line.active.display,
  }));
  const trendChart = data.trend.map((point) => ({
    key: point.periodLabel,
    label: point.periodLabel,
    value: point.active.minutes,
    display: point.cost.visible ? point.cost.display : point.active.display,
  }));

  return (
    <PageContainer width="full">
      <PageHeader
        title={scope === 'project' ? 'Project costs' : 'Division costs'}
        description={
          scope === 'project'
            ? 'Labour cost, budget variance and estimate variance for each project, with an employee drill-down.'
            : 'Labour cost, budget variance and trend for each division, with an employee drill-down.'
        }
        crumbs={[
          { label: 'Finance', href: '/finance' },
          { label: scope === 'project' ? 'Project costs' : 'Division costs' },
        ]}
        backHref="/finance"
        backLabel="Finance"
        meta={
          <>
            <VerificationBadge period={data.period} />
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
          </>
        }
        actions={
          periodState.status === 'success' ? (
            <PeriodPicker
              periods={periodState.data}
              value={data.period.id}
              onChange={setPeriodId}
            />
          ) : null
        }
      />

      <UnverifiedWarning warning={data.unverifiedWarning} />
      <RestrictionNote note={data.restrictionNote} />

      <FilterBar
        className="mt-5"
        applied={divisionIds.map((id) => ({
          key: id,
          label: 'Division',
          value: DIVISION_FILTER_OPTIONS.find((option) => option.value === id)?.label ?? id,
          onRemove: () => setDivisionIds(divisionIds.filter((item) => item !== id)),
        }))}
        onClearAll={() => setDivisionIds([])}
        resultSummary={`${data.lines.length} ${scope === 'project' ? 'project' : 'division'} line(s)`}
      >
        <MultiSelectFilter
          label="Division"
          options={DIVISION_FILTER_OPTIONS}
          selected={divisionIds}
          onChange={setDivisionIds}
        />
      </FilterBar>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-label text-ink-muted">Total active</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.totalActive} />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Total labour cost</p>
          <p className="mt-1 text-metric text-ink">
            <MoneyValue value={data.totalCost} emphasis compact />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Total budget</p>
          <p className="mt-1 text-metric text-ink">
            <MoneyValue value={data.totalBudget} emphasis compact />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Variance</p>
          <p className="mt-1 text-metric text-ink">
            <MoneyValue value={data.totalVariance} emphasis compact />
          </p>
          <div className="mt-2">
            <VarianceBadge percent={data.totalVariancePercent} />
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <ChartContainer
          title={scope === 'project' ? 'Active hours by project' : 'Active hours by division'}
          description="Every chart is paired with the same figures as a table."
          tableCaption={`Active hours by ${scope}`}
          valueHeader="Active hours"
          data={hoursChart}
        >
          <BarChart data={hoursChart} />
        </ChartContainer>

        <ChartContainer
          title="Trend across payroll periods"
          description={
            data.hasFinancialPermission
              ? 'Active hours per period; the table shows the matching labour cost.'
              : 'Active hours per period. Cost is withheld without the financial-detail permission.'
          }
          tableCaption="Active hours and labour cost by payroll period"
          valueHeader={data.hasFinancialPermission ? 'Labour cost' : 'Active hours'}
          data={trendChart}
        >
          <BarChart data={trendChart} />
        </ChartContainer>
      </div>

      <Card className="mt-5">
        <CardHeader
          title={scope === 'project' ? 'Project lines' : 'Division lines'}
          description="Expand a line to see which employees make up the figure."
        />
        <ul className="mt-4 space-y-3">
          {data.lines.map((line) => (
            <CostLine key={line.key} line={line} />
          ))}
        </ul>
        {data.lines.length === 0 && (
          <EmptyState
            className="mt-4"
            variant="no-results"
            title="No cost lines for these filters"
            description="Clear a filter or choose a period with recorded time."
          />
        )}
      </Card>

      <Callout tone="info" className="mt-4">
        Labour cost is the employee hourly rate applied to verified active minutes, computed in
        fixed precision and rounded once. It is not derived from a rounded hours figure.
      </Callout>
    </PageContainer>
  );
}
