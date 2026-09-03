'use client';

import * as React from 'react';
import { CheckCircle2, TriangleAlert } from 'lucide-react';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { ChartContainer, DonutChart } from '@/components/charts/chart';
import {
  CostPermissionBadge,
  FinanceFallback,
  FinanceLoading,
  MoneyValue,
  PeriodPicker,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

/**
 * FE-0605 — billable versus non-billable analysis.
 *
 * The reconciliation panel is the point of the screen. Billable plus
 * non-billable must equal total verified active time *exactly* — these are
 * integer minutes, so a difference of even one minute is a defect in the
 * classification, not a rounding artefact, and the screen says so rather than
 * hiding it behind a percentage that looks about right.
 */
export function BillableAnalysis() {
  const { user } = useSession();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);

  const { state } = useAsync(
    () => mockFinanceService.getBillableAnalysis(user?.userId ?? '', { periodId }),
    [user?.userId, periodId],
  );
  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="billable analysis" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Billable analysis" />;
  }
  const data = state.data;
  const reconciliation = data.reconciliation;

  const splitChart = [
    {
      key: 'billable',
      label: 'Billable',
      value: data.billable.minutes,
      display: data.billable.display,
    },
    {
      key: 'non-billable',
      label: 'Non-billable',
      value: data.nonBillable.minutes,
      display: data.nonBillable.display,
    },
  ];

  return (
    <PageContainer width="full">
      <PageHeader
        title="Billable analysis"
        description="Billable versus non-billable verified hours, reconciled against the period total."
        crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Billable analysis' }]}
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-label text-ink-muted">Billable hours</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.billable} />
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            <MoneyValue value={data.billableCost} compact />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Non-billable hours</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.nonBillable} />
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            <MoneyValue value={data.nonBillableCost} compact />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Total verified</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.totalVerified} />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Billable share</p>
          <p className="mt-1 text-metric text-ink tabular">{data.billablePercent}%</p>
          <ProgressBar
            className="mt-3"
            value={data.billablePercent}
            label="Billable share of verified time"
            hideLabel
            tone="complete"
          />
        </Card>
      </div>

      <Alert
        className="mt-5"
        tone={reconciliation.balances ? 'success' : 'danger'}
        title={
          reconciliation.balances
            ? 'Reconciled against total verified hours'
            : 'Reconciliation failed'
        }
      >
        <div className="flex items-start gap-2">
          {reconciliation.balances ? (
            <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <div>
            <p>
              Billable {reconciliation.billableMinutes} minutes + non-billable{' '}
              {reconciliation.nonBillableMinutes} minutes = {reconciliation.sumMinutes} minutes,
              against a period total of {reconciliation.totalVerifiedMinutes} minutes.
            </p>
            <p className="mt-1">
              {reconciliation.balances
                ? 'The split accounts for every verified minute. Durations are integer minutes, so this is an exact match, not a rounded one.'
                : `Difference of ${reconciliation.differenceMinutes} minutes. Every verified minute must be classified as billable or non-billable; this gap is a classification defect.`}
            </p>
          </div>
        </div>
      </Alert>

      <div className="mt-5 grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
        <ChartContainer
          className="min-w-0"
          title="Billable split"
          description="The same two figures as the reconciliation above."
          tableCaption="Billable and non-billable verified hours"
          valueHeader="Active hours"
          data={splitChart}
        >
          <DonutChart
            data={splitChart}
            centerLabel="Verified"
            centerValue={data.totalVerified.display}
          />
        </ChartContainer>

        <Card className="min-w-0">
          <CardHeader
            title="By project"
            description="Why each line is billable or not, so the classification can be checked rather than trusted."
          />
          <div className="mt-4 table-scroll">
            <table className="w-full text-body-sm">
              <caption className="sr-only">
                Billable classification, hours and cost by project
              </caption>
              <thead>
                <tr className="text-caption text-ink-muted">
                  <th scope="col" className="py-1.5 text-left">Project</th>
                  <th scope="col" className="py-1.5 text-left">Division</th>
                  <th scope="col" className="py-1.5 text-left">Classification</th>
                  <th scope="col" className="py-1.5 text-right">Active</th>
                  <th scope="col" className="py-1.5 text-right">Share</th>
                  <th scope="col" className="py-1.5 text-right">Labour cost</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr key={line.key} className="border-t border-border align-top">
                    <td className="py-2 text-ink">{line.label}</td>
                    <td className="py-2 text-ink-muted">{line.division.code}</td>
                    <td className="py-2">
                      <Badge tone={line.isBillable ? 'accent' : 'neutral'}>
                        {line.isBillable ? 'Billable' : 'Non-billable'}
                      </Badge>
                      {line.nonBillableReason && (
                        <p className="mt-1 max-w-56 text-caption text-ink-muted">
                          {line.nonBillableReason}
                        </p>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <Duration value={line.active} />
                    </td>
                    <td className="py-2 text-right text-ink tabular">{line.sharePercent}%</td>
                    <td className="py-2 text-right">
                      <MoneyValue value={line.cost} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-strong font-semibold">
                  <td className="py-2 text-ink" colSpan={3}>
                    Total verified
                  </td>
                  <td className="py-2 text-right text-ink">
                    <Duration value={data.totalVerified} emphasis />
                  </td>
                  <td className="py-2 text-right text-ink tabular">100%</td>
                  <td className="py-2 text-right text-ink">
                    <MoneyValue value={data.totalCost} emphasis />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
