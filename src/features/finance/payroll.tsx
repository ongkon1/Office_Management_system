'use client';

import * as React from 'react';
import { Download, FileSpreadsheet, Lock } from 'lucide-react';
import type { PayrollEmployeeRowView } from '@/contracts/finance';
import { mockFinanceService } from '@/services/mock/finance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { DataTable } from '@/components/data/data-table';
import { Field } from '@/components/forms/field';
import { Checkbox, Select } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import {
  CostPermissionBadge,
  FinanceFallback,
  FinanceLoading,
  MoneyValue,
  PeriodPicker,
  UnverifiedWarning,
  VerificationBadge,
} from './shared';

const FORMAT_OPTIONS = [
  { value: 'excel', label: 'Excel (.xlsx)' },
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
];

/**
 * FE-0606 and FE-0610 — payroll-period summary and export configuration.
 *
 * The export dialog configures a job and never produces a file. That is stated
 * on screen: an export that appears to succeed and delivers nothing is worse
 * than one honestly labelled as not yet wired up.
 */
export function PayrollSummary() {
  const { user } = useSession();
  const toast = useToast();
  const [periodId, setPeriodId] = React.useState<string | undefined>(undefined);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [format, setFormat] = React.useState('excel');
  const [includeProtected, setIncludeProtected] = React.useState(true);
  const [failure, setFailure] = React.useState<string | null>(null);

  const { state, reload } = useAsync(
    () => mockFinanceService.getPayrollSummary(user?.userId ?? '', periodId),
    [user?.userId, periodId],
  );
  const { state: periodState } = useAsync(
    () => mockFinanceService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <FinanceLoading label="payroll summary" />;
  if (state.status !== 'success') {
    return <FinanceFallback result={state.failure} subject="Payroll summary" />;
  }
  const data = state.data;

  async function submitExport() {
    setFailure(null);
    const result = await mockFinanceService.requestExport(user?.userId ?? '', {
      reportKey: 'payroll-summary',
      periodId: data.period.id,
      format: format as 'excel' | 'csv' | 'pdf',
      includeProtectedFields: includeProtected,
      divisionIds: [],
    });
    if (result.status === 'success') {
      setExportOpen(false);
      reload();
      toast.show({
        tone: 'info',
        title: 'Export configuration recorded',
        description: result.data.simulationNote,
      });
      return;
    }
    setFailure(
      'guidance' in result
        ? `${result.message} ${result.guidance ?? ''}`.trim()
        : result.message,
    );
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Payroll reports"
        description="Payroll-period summary, verification status, exception visibility, export readiness and history."
        crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Payroll' }]}
        backHref="/finance"
        backLabel="Finance"
        meta={
          <>
            <VerificationBadge period={data.period} />
            <CostPermissionBadge allowed={data.hasFinancialPermission} />
            <Badge tone={data.isVerified ? 'success' : 'warning'}>{data.timesheetStatusLabel}</Badge>
          </>
        }
        actions={
          <>
            {periodState.status === 'success' && (
              <PeriodPicker
                periods={periodState.data}
                value={data.period.id}
                onChange={setPeriodId}
              />
            )}
            <Button
              variant="primary"
              disabled={!data.canExport}
              onClick={() => setExportOpen(true)}
              iconLeading={<FileSpreadsheet aria-hidden className="size-4" />}
            >
              Configure export
            </Button>
          </>
        }
      />

      <UnverifiedWarning warning={data.unverifiedWarning} />

      {data.exportBlockers.length > 0 && (
        <Alert className="mt-4" tone="info" title="This period cannot be exported yet">
          <ul className="ml-4 list-disc space-y-1">
            {data.exportBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-label text-ink-muted">Employees</p>
          <p className="mt-1 text-metric text-ink tabular">{data.employeeCount}</p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Total active</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.totalActive} />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Total overtime</p>
          <p className="mt-1 text-metric text-ink">
            <Duration value={data.totalOvertime} />
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Payroll total</p>
          <p className="mt-1 text-metric text-ink">
            <MoneyValue value={data.totalCost} emphasis compact />
          </p>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Period status"
          description="What was verified, by whom, and under which policy version."
        />
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <dt className="text-caption text-ink-muted">Timesheet period</dt>
            <dd className="text-body-sm font-medium text-ink">{data.timesheetStatusLabel}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Verified</dt>
            <dd className="text-body-sm font-medium text-ink">
              {data.verifiedAtLabel ?? 'Not verified'}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Verified by</dt>
            <dd className="text-body-sm font-medium text-ink">
              {data.verifiedByLabel ?? '—'}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Policy version</dt>
            <dd className="text-body-sm font-medium text-ink">Version {data.policyVersion}</dd>
          </div>
        </dl>

        <div className="mt-4 border-t border-border pt-4">
          <p className="text-label text-ink-muted">Exceptions carried into payroll</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.exceptions.map((exception) => (
              <li key={exception.label}>
                <Badge
                  tone={
                    exception.count === 0
                      ? 'neutral'
                      : exception.tone === 'negative'
                        ? 'danger'
                        : 'warning'
                  }
                >
                  {exception.label}: {exception.count}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <DataTable<PayrollEmployeeRowView>
        className="mt-5"
        caption={`Payroll lines for ${data.period.label}`}
        rows={data.rows}
        getRowId={(row) => row.employee.id}
        emptyState={{ title: 'No payroll lines in this period' }}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            alwaysVisible: true,
            render: (row) => (
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                <span className="block truncate text-caption text-ink-muted">
                  {row.divisionCodes.join(', ')}
                </span>
              </span>
            ),
          },
          { key: 'days', header: 'Days', align: 'right', hideBelow: 'md', render: (row) => row.dayCount },
          {
            key: 'active',
            header: 'Active',
            align: 'right',
            render: (row) => <Duration value={row.active} />,
          },
          {
            key: 'overtime',
            header: 'Overtime',
            align: 'right',
            hideBelow: 'md',
            render: (row) => <Duration value={row.overtime} />,
          },
          {
            key: 'exceptions',
            header: 'Exceptions',
            align: 'right',
            hideBelow: 'lg',
            render: (row) =>
              row.exceptionCount > 0 ? (
                <Badge tone="warning">{row.exceptionCount}</Badge>
              ) : (
                <Badge tone="complete">None</Badge>
              ),
          },
          {
            key: 'rate',
            header: 'Hourly rate',
            align: 'right',
            hideBelow: 'lg',
            render: (row) => <MoneyValue value={row.hourlyRate} />,
          },
          {
            key: 'cost',
            header: 'Labour cost',
            align: 'right',
            render: (row) => <MoneyValue value={row.cost} />,
          },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate font-medium text-ink">{row.employee.fullName}</span>
                <span className="block text-caption text-ink-muted">
                  {row.divisionCodes.join(', ')} · {row.dayCount} days
                </span>
              </span>
              <MoneyValue value={row.cost} emphasis />
            </div>
            <p className="mt-2 text-caption text-ink-muted">
              Active <Duration value={row.active} /> · overtime <Duration value={row.overtime} />
            </p>
          </div>
        )}
      />

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Export history"
            description="Every requested export, including the ones that expired or failed."
          />
          <ul className="mt-4 space-y-2">
            {data.exportHistory.map((job) => (
              <li key={job.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-body-sm font-medium text-ink">{job.reportTitle}</p>
                    <p className="text-caption text-ink-muted">
                      {job.formatLabel} · {job.requestedByLabel} · {job.requestedAtLabel}
                    </p>
                    <p className="text-caption text-ink-subtle">{job.filterSummary}</p>
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
                {job.expiresAtLabel && job.state === 'ready' && (
                  <p className="mt-1 text-caption text-ink-muted">Expires {job.expiresAtLabel}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {job.canDownload ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      iconLeading={<Download aria-hidden className="size-4" />}
                      onClick={() =>
                        toast.show({
                          tone: 'info',
                          title: 'Download not available yet',
                          description:
                            'File delivery arrives with the backend export worker. The job record is real; the file is not produced during the frontend milestone.',
                        })
                      }
                    >
                      Download
                    </Button>
                  ) : (
                    job.state === 'ready' && (
                      <span className="inline-flex min-h-6 items-center gap-1 text-caption text-ink-muted">
                        <Lock aria-hidden className="size-3.5" />
                        Needs the export-protected permission
                      </span>
                    )
                  )}
                  {job.canRetry && (
                    <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
                      Reconfigure
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            title="Audit trail"
            description="Verification and export activity against this period."
          />
          <ol className="mt-4 space-y-3">
            {data.auditTrail.map((entry, index) => (
              <li key={`${entry.label}-${index}`} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">{entry.label}</p>
                  <p className="text-caption text-ink-muted">
                    {entry.actorLabel} · {entry.atLabel}
                  </p>
                </div>
              </li>
            ))}
            {data.auditTrail.length === 0 && (
              <li className="text-body-sm text-ink-muted">No recorded activity.</li>
            )}
          </ol>
          <Callout tone="info" className="mt-4">
            HR verifies the payroll period; Finance reads it. Nothing on this screen approves or
            changes a time record.
          </Callout>
        </Card>
      </div>

      <Dialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Configure payroll export"
        description={`${data.period.label} · ${data.period.rangeLabel}`}
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
            This records the export configuration and queues the job. File generation arrives with
            the backend export worker.
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
            description="Protected fields need both the financial-detail and export-protected permissions, and a verified period."
            checked={includeProtected}
            onChange={(event) => setIncludeProtected(event.target.checked)}
          />

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-caption text-ink-muted">Period verification</dt>
              <dd className="text-body-sm font-medium text-ink">{data.timesheetStatusLabel}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-muted">Policy version</dt>
              <dd className="text-body-sm font-medium text-ink">Version {data.policyVersion}</dd>
            </div>
          </dl>
        </div>
      </Dialog>
    </PageContainer>
  );
}
