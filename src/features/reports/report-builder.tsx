'use client';

import * as React from 'react';
import { Download, Play, Printer, RotateCcw } from 'lucide-react';
import type { ReportRunInput } from '@/contracts/reporting';
import type { ExportFormat } from '@/contracts/domain';
import { mockReportingService } from '@/services/mock/reporting';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { MultiSelectFilter } from '@/components/data/filters';
import { Field } from '@/components/forms/field';
import { Checkbox, Input, Select } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import { BarChart, ChartContainer, DonutChart } from '@/components/charts/chart';
import { ReportsFallback, ReportsLoading } from './report-catalogue';

const FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'print', label: 'Print' },
];

const DEFAULT_RUN = { from: '2026-08-01', to: '2026-09-02' };

/**
 * FE-0702, FE-0703, FE-0704 and FE-0706 — the report builder.
 *
 * One builder serves every report: the filter set comes from the report
 * definition, so a new report gets its filters without a new screen. The
 * preview is what prints — `data-print="hide"` removes the builder, the page
 * chrome and the action bar, leaving the title, applied filters, provenance,
 * table and totals (`FE-0706`).
 */
export function ReportBuilder({ reportKey }: { reportKey: string }) {
  const { user } = useSession();
  const toast = useToast();

  const [from, setFrom] = React.useState(DEFAULT_RUN.from);
  const [to, setTo] = React.useState(DEFAULT_RUN.to);
  const [selections, setSelections] = React.useState<Record<string, readonly string[]>>({});
  const [overtimeOnly, setOvertimeOnly] = React.useState(false);
  const [run, setRun] = React.useState(0);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [format, setFormat] = React.useState<ExportFormat>('excel');
  const [exportFailure, setExportFailure] = React.useState<string | null>(null);

  const { state: definitionState } = useAsync(
    () => mockReportingService.getReport(user?.userId ?? '', reportKey),
    [user?.userId, reportKey],
  );

  const input: ReportRunInput = React.useMemo(
    () => ({
      reportKey,
      from,
      to,
      employeeIds: selections.employee,
      divisionIds: selections.division,
      projectIds: selections.project,
      taskIds: selections.task,
      teamLeadIds: selections.team_lead,
      employmentTypes: selections.employment_type,
      workLocations: selections.work_location,
      statuses: selections.status,
      overtimeOnly,
    }),
    [reportKey, from, to, selections, overtimeOnly],
  );

  const { state: previewState } = useAsync(
    () => mockReportingService.runReport(user?.userId ?? '', input),
    [user?.userId, JSON.stringify(input), run],
  );

  if (definitionState.status === 'loading') return <ReportsLoading label="report" />;
  if (definitionState.status !== 'success') {
    return <ReportsFallback result={definitionState.failure} subject="Report" />;
  }
  const definition = definitionState.data;

  function resetFilters() {
    setFrom(DEFAULT_RUN.from);
    setTo(DEFAULT_RUN.to);
    setSelections({});
    setOvertimeOnly(false);
    setRun((value) => value + 1);
  }

  async function submitExport() {
    setExportFailure(null);
    if (format === 'print') {
      setExportOpen(false);
      // The preview is the printable artefact; no job is created for print.
      window.print();
      return;
    }
    const result = await mockReportingService.requestExport(user?.userId ?? '', {
      reportKey,
      format,
      run: input,
    });
    if (result.status === 'success') {
      setExportOpen(false);
      toast.show({
        tone: 'info',
        title: 'Export queued',
        description: result.data.note,
      });
      return;
    }
    setExportFailure(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
  }

  const preview = previewState.status === 'success' ? previewState.data : null;

  return (
    <PageContainer width="full">
      <PageHeader
        title={definition.title}
        description={definition.description}
        crumbs={[{ label: 'Reports', href: '/reports' }, { label: definition.title }]}
        backHref="/reports"
        backLabel="Reports"
        meta={
          <>
            <Badge tone="accent">{definition.categoryLabel}</Badge>
            {definition.willRedactFields && <Badge tone="neutral">Some columns withheld</Badge>}
          </>
        }
        actions={
          <>
            <Button
              variant="secondary"
              onClick={resetFilters}
              iconLeading={<RotateCcw aria-hidden className="size-4" />}
            >
              Reset
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.print()}
              iconLeading={<Printer aria-hidden className="size-4" />}
            >
              Print
            </Button>
            <Button
              variant="primary"
              onClick={() => setExportOpen(true)}
              iconLeading={<Download aria-hidden className="size-4" />}
            >
              Export
            </Button>
          </>
        }
      />

      {/* Builder. Removed from print output; the preview is the artefact. */}
      <Card className="mt-5" data-print="hide">
        <CardHeader
          title="Filters"
          description="Filters apply as you change them. Reset returns the report to its default range."
        />
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {definition.filters.map((filter) => {
            if (filter.kind === 'date_range') {
              return (
                <React.Fragment key={filter.kind}>
                  <Field label="From" className="w-40" helperText={filter.helperText}>
                    <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                  </Field>
                  <Field label="To" className="w-40">
                    <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                  </Field>
                </React.Fragment>
              );
            }
            if (filter.kind === 'overtime') {
              return (
                <Checkbox
                  key={filter.kind}
                  label={filter.label}
                  description={filter.helperText}
                  checked={overtimeOnly}
                  onChange={(event) => setOvertimeOnly(event.target.checked)}
                />
              );
            }
            if (filter.options.length === 0) return null;
            return (
              <MultiSelectFilter
                key={filter.kind}
                label={filter.label}
                options={filter.options}
                selected={selections[filter.kind] ?? []}
                onChange={(next) =>
                  setSelections((current) => ({ ...current, [filter.kind]: next }))
                }
              />
            );
          })}
        </div>
      </Card>

      {definition.willRedactFields && (
        <Alert className="mt-4" tone="info" title="Some columns are withheld">
          This report contains cost columns. They stay in the table so the report’s shape is
          honest, and their values read <strong>Restricted</strong>.
        </Alert>
      )}

      {previewState.status === 'loading' && (
        <Card className="mt-5">
          <div role="status" aria-busy className="py-8 text-center text-body-sm text-ink-muted">
            Running the report…
          </div>
        </Card>
      )}

      {previewState.status === 'failure' && (
        <ReportsFallback result={previewState.failure} subject="Report" />
      )}

      {preview && (
        <Card className="mt-5" id="report-preview">
          <CardHeader
            title={preview.title}
            description={`${preview.categoryLabel} · ${preview.periodLabel}`}
          />

          {/* Provenance. Printed with the report so a copy explains itself. */}
          <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-4">
            {preview.appliedFilters.map((filter) => (
              <div key={filter.label}>
                <dt className="text-caption text-ink-muted">{filter.label}</dt>
                <dd className="text-body-sm font-medium text-ink">{filter.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-caption text-ink-muted">Timezone</dt>
              <dd className="text-body-sm font-medium text-ink">{preview.timezone}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Policy version</dt>
              <dd className="text-body-sm font-medium text-ink">Version {preview.policyVersion}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Generated</dt>
              <dd className="text-body-sm font-medium text-ink">{preview.generatedAtLabel}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Rows</dt>
              <dd className="text-body-sm font-medium text-ink">{preview.rowCount}</dd>
            </div>
          </dl>

          {preview.unverifiedWarning && (
            <Alert className="mt-4" tone="warning" title="Includes unverified data">
              {preview.unverifiedWarning}
            </Alert>
          )}
          {preview.restrictionNote && (
            <Callout tone="info" className="mt-4">
              {preview.restrictionNote}
            </Callout>
          )}

          {preview.chart && (
            <div className="mt-5 max-w-2xl">
              <ChartContainer
                title={preview.chart.title}
                tableCaption={`${preview.chart.title} data`}
                valueHeader={preview.chart.valueHeader}
                data={preview.chart.data}
              >
                {preview.chart.kind === 'donut' ? (
                  <DonutChart data={preview.chart.data} />
                ) : (
                  <BarChart data={preview.chart.data} />
                )}
              </ChartContainer>
            </div>
          )}

          {preview.rows.length === 0 ? (
            <EmptyState
              className="mt-5"
              variant="no-results"
              title="No rows match these filters"
              description="Widen the date range or clear a filter."
            />
          ) : (
            <div className="mt-5 table-scroll">
              <table className="w-full text-body-sm">
                <caption className="sr-only">
                  {preview.title} for {preview.periodLabel}
                </caption>
                <thead>
                  <tr className="text-caption text-ink-muted">
                    {preview.columns.map((column) => (
                      <th
                        key={column.field}
                        scope="col"
                        className={`border-b border-border py-2 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
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
                  {preview.rows.map((row, index) => (
                    <tr key={index} className="border-b border-border">
                      {preview.columns.map((column) => (
                        <td
                          key={column.field}
                          className={`py-2 text-ink ${column.align === 'right' ? 'text-right tabular' : ''}`}
                        >
                          {row[column.field] === 'Restricted' ? (
                            <RestrictedValue reason="This column needs a permission you do not hold." />
                          ) : (
                            row[column.field]
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
                {preview.totals && (
                  <tfoot>
                    <tr className="border-t-2 border-border-strong font-semibold">
                      {preview.columns.map((column) => (
                        <td
                          key={column.field}
                          className={`py-2 text-ink ${column.align === 'right' ? 'text-right tabular' : ''}`}
                        >
                          {preview.totals![column.field] === 'Restricted' ? (
                            <RestrictedValue reason="This column needs a permission you do not hold." />
                          ) : (
                            preview.totals![column.field]
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
      )}

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export this report"
        description={`${definition.title} · ${preview?.periodLabel ?? ''}`}
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={submitExport}
              iconLeading={<Play aria-hidden className="size-4" />}
            >
              {format === 'print' ? 'Open print dialog' : 'Queue export'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {exportFailure && (
            <Alert tone="danger" title="Export refused" live>
              {exportFailure}
            </Alert>
          )}
          <Alert tone="info" title="No file is produced during the frontend milestone">
            Excel, CSV and PDF exports record a job you can then advance through its states.
            Print uses the browser dialog and the print stylesheet, and works today.
          </Alert>
          <Field label="Format">
            <Select
              value={format}
              options={FORMAT_OPTIONS}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
            />
          </Field>
        </div>
      </Dialog>
    </PageContainer>
  );
}
