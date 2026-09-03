'use client';

import * as React from 'react';
import { FileSpreadsheet, RotateCcw } from 'lucide-react';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Field } from '@/components/forms/field';
import { Checkbox, Select } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import {
  resetPresentation,
  setPresentation,
  useReportPresentation,
} from './presentation-store';
import {
  CostPermissionBadge,
  DIVISION_FILTER_OPTIONS,
  FinanceFallback,
  FinanceLoading,
  PeriodPicker,
  RestrictionNote,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

const REPORT_OPTIONS = [
  { value: 'payroll-summary', label: 'Payroll summary' },
  { value: 'employee-hours', label: 'Employee hours' },
  { value: 'project-costs', label: 'Project labour cost' },
];

const GROUP_OPTIONS = [
  { value: 'employee', label: 'Employee' },
  { value: 'division', label: 'Division' },
  { value: 'project', label: 'Project' },
];

const FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
];

export function FinanceReports() {
  const { user } = useSession();
  const toast = useToast();

  // Presentation state lives in an external store so it survives a revisit
  // without reading storage during render or setting state in an effect.
  const { reportKey, groupBy, divisionIds } = useReportPresentation();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [format, setFormat] = React.useState('excel');
  const [includeProtected, setIncludeProtected] = React.useState(true);
  const [failure, setFailure] = React.useState<string | null>(null);

  const { state } = useAsync(
    () =>
      mockFinanceService.previewReport(user?.userId ?? '', {
        reportKey,
        periodId,
        divisionIds,
        groupBy,
      }),
    [user?.userId, reportKey, periodId, divisionIds, groupBy],
  );
  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="report preview" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Financial reports" />;
  }
  const data = state.data;
  const period = periodState.status === 'success'
    ? periodState.data.find((item) => item.label === data.periodLabel)
    : undefined;

  async function submitExport() {
    setFailure(null);
    const result = await mockFinanceService.requestExport(user?.userId ?? '', {
      reportKey,
      periodId: period?.id ?? '',
      format: format as 'excel' | 'csv' | 'pdf',
      includeProtectedFields: includeProtected,
      divisionIds,
    });
    if (result.status === 'success') {
      setExportOpen(false);
      toast.show({
        tone: 'info',
        title: 'Export configuration recorded',
        description: result.data.simulationNote,
      });
      return;
    }
    setFailure(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Financial reports"
        description="Configure a report, preview the rows it will contain, then record the export configuration."
        crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Reports' }]}
        backHref="/finance"
        backLabel="Finance"
        meta={
          <>
            {period && <VerificationBadge period={period} />}
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
            <Badge tone="neutral">{data.rowCount} rows</Badge>
          </>
        }
        actions={
          <>
            {periodState.status === 'success' && period && (
              <PeriodPicker
                periods={periodState.data}
                value={period.id}
                onChange={setPeriodId}
              />
            )}
            <Button
              variant="primary"
              onClick={() => setExportOpen(true)}
              iconLeading={<FileSpreadsheet aria-hidden className="size-4" />}
            >
              Configure export
            </Button>
          </>
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
          onRemove: () =>
            setPresentation({ divisionIds: divisionIds.filter((item) => item !== id) }),
        }))}
        onClearAll={() => setPresentation({ divisionIds: [] })}
        resultSummary={`${data.rowCount} row${data.rowCount === 1 ? '' : 's'}`}
      >
        <Field label="Report" hideLabel className="w-52">
          <Select
            value={reportKey}
            aria-label="Report"
            options={REPORT_OPTIONS}
            onChange={(event) => setPresentation({ reportKey: event.target.value })}
          />
        </Field>
        <Field label="Group by" hideLabel className="w-40">
          <Select
            value={groupBy}
            aria-label="Group by"
            options={GROUP_OPTIONS}
            onChange={(event) =>
              setPresentation({ groupBy: event.target.value as 'employee' | 'division' | 'project' })
            }
          />
        </Field>
        <MultiSelectFilter
          label="Division"
          options={DIVISION_FILTER_OPTIONS}
          selected={divisionIds}
          onChange={(next) => setPresentation({ divisionIds: next })}
        />
        <Button
          variant="ghost"
          size="sm"
          iconLeading={<RotateCcw aria-hidden className="size-4" />}
          onClick={resetPresentation}
        >
          Reset view
        </Button>
      </FilterBar>

      <Card className="mt-5">
        <CardHeader
          title={data.title}
          description={`${data.periodLabel} · ${data.rangeLabel}`}
        />
        <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
          {data.filterSummary.map((entry) => (
            <div key={entry.label}>
              <dt className="text-caption text-ink-muted">{entry.label}</dt>
              <dd className="text-body-sm font-medium text-ink">{entry.value}</dd>
            </div>
          ))}
          <div>
            <dt className="text-caption text-ink-muted">Timezone</dt>
            <dd className="text-body-sm font-medium text-ink">{data.timezone}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Policy version</dt>
            <dd className="text-body-sm font-medium text-ink">Version {data.policyVersion}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Generated</dt>
            <dd className="text-body-sm font-medium text-ink">{data.generatedAtLabel}</dd>
          </div>
        </dl>

        {data.rows.length === 0 ? (
          <EmptyState
            className="mt-5"
            variant="no-results"
            title="No rows for these filters"
            description="Clear a division filter or choose a period with recorded time."
          />
        ) : (
          <div className="mt-4 table-scroll">
            <table className="w-full text-body-sm">
              <caption className="sr-only">
                {data.title} for {data.periodLabel}
              </caption>
              <thead>
                <tr className="text-caption text-ink-muted">
                  {data.columns.map((column) => (
                    <th
                      key={column.field}
                      scope="col"
                      className={`py-1.5 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {column.label}
                      {column.restricted && (
                        <span className="ml-1 text-ink-subtle">(restricted)</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={`${row.name}-${index}`} className="border-t border-border">
                    {data.columns.map((column) => (
                      <td
                        key={column.field}
                        className={`py-2 text-ink ${column.align === 'right' ? 'text-right tabular' : ''}`}
                      >
                        {row[column.field] === 'Restricted' ? (
                          <RestrictedValue reason="Cost values need the financial-detail permission." />
                        ) : (
                          row[column.field]
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {data.totals && (
                <tfoot>
                  <tr className="border-t-2 border-border-strong font-semibold">
                    {data.columns.map((column) => (
                      <td
                        key={column.field}
                        className={`py-2 text-ink ${column.align === 'right' ? 'text-right tabular' : ''}`}
                      >
                        {data.totals![column.field] === 'Restricted' ? (
                          <RestrictedValue reason="Cost values need the financial-detail permission." />
                        ) : (
                          data.totals![column.field]
                        )}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Configure export"
        description={`${data.title} · ${data.periodLabel}`}
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submitExport}>
              Record export configuration
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {failure && (
            <Alert tone="danger" title="Export refused" live>
              {failure}
            </Alert>
          )}
          <Alert tone="info" title="No file is produced during the frontend milestone">
            The configuration and the job record are real. File generation arrives with the backend
            export worker.
          </Alert>
          <Field label="Format">
            <Select
              value={format}
              options={FORMAT_OPTIONS}
              onChange={(event) => setFormat(event.target.value)}
            />
          </Field>
          <Checkbox
            label="Include cost and rate columns"
            description="Protected fields need the financial-detail and export-protected permissions, and a verified period."
            checked={includeProtected}
            onChange={(event) => setIncludeProtected(event.target.checked)}
          />
        </div>
      </Dialog>
    </PageContainer>
  );
}
