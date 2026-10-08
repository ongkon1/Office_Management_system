'use client';

import * as React from 'react';
import { Download, Lock, RefreshCw, RotateCcw } from 'lucide-react';
import type { ReportingService } from '@/contracts/reporting';
import { reportingService as mockReportingService } from '@/services/runtime/reporting';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ReportsFallback, ReportsLoading } from './report-catalogue';

function stateTone(state: string): BadgeTone {
  if (state === 'ready') return 'success';
  if (state === 'failed') return 'danger';
  if (state === 'expired') return 'warning';
  if (state === 'processing') return 'accent';
  return 'neutral';
}

/**
 * FE-0705 — export history.
 *
 * Every durable worker state is rendered from the backend. Pending jobs can be
 * refreshed, failed jobs can be retried, and ready artifacts use the protected
 * download route returned by the server.
 */
export function ExportHistory({ service = mockReportingService }: { service?: ReportingService }) {
  const { user } = useSession();
  const toast = useToast();
  const [refreshingJobId, setRefreshingJobId] = React.useState<string | null>(null);
  const [retryingJobId, setRetryingJobId] = React.useState<string | null>(null);
  const { state, reload } = useAsync(
    () => service.listExports(user?.userId ?? ''),
    [service, user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="export history" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Export history" />;
  }
  const jobs = state.data;

  async function refreshStatus(id: string) {
    setRefreshingJobId(id);
    const result = await service.advanceExport(user?.userId ?? '', id);
    setRefreshingJobId(null);
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: `Export is now ${result.data.stateLabel.toLowerCase()}`,
        description: result.data.state === 'ready'
          ? 'The protected file is ready to download.'
          : 'The export worker is still processing this request.',
      });
      return;
    }
    toast.show({ tone: 'error', title: 'Status could not be refreshed', description: result.message });
  }

  async function retry(id: string) {
    setRetryingJobId(id);
    const result = await service.retryExport(user?.userId ?? '', id);
    setRetryingJobId(null);
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: 'Export requeued',
        description: 'The job returns to the queued state with your name as the requester.',
      });
      return;
    }
    toast.show({ tone: 'error', title: 'Export could not be retried', description: result.message });
  }

  return (
    <PageContainer width="full">
      <PageHeader
        title="Export history"
        description="Every export request, its filters, who asked for it and what state it is in."
        crumbs={[{ label: 'Reports', href: '/reports' }, { label: 'Export history' }]}
        backHref="/reports"
        backLabel="Reports"
        meta={<Badge tone="neutral">{jobs.length} jobs</Badge>}
        actions={
          <LinkButton variant="secondary" href="/reports">
            Report catalogue
          </LinkButton>
        }
      />

      <Callout tone="info" className="mt-5">
        Exports are generated securely in the background. Refresh a pending job to see its latest
        state; ready files remain permission-checked when downloaded.
      </Callout>

      <Card className="mt-5">
        <CardHeader title="Jobs" description="Newest first." />
        <ul className="mt-4 space-y-3">
          {jobs.map((job) => (
            <li key={job.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">{job.reportTitle}</p>
                  <p className="text-caption text-ink-muted">
                    {job.formatLabel} · requested by {job.requestedByLabel} ·{' '}
                    {job.requestedAtLabel}
                  </p>
                  <p className="text-caption text-ink-subtle">{job.filterSummary}</p>
                </div>
                <Badge tone={stateTone(job.state)}>{job.stateLabel}</Badge>
              </div>

              {job.failureMessage && (
                <p className="mt-2 rounded-md border border-critical-border bg-critical-surface p-2 text-caption text-danger">
                  {job.failureMessage}
                </p>
              )}
              {job.expiresAtLabel && job.state === 'ready' && (
                <p className="mt-2 text-caption text-ink-muted">Expires {job.expiresAtLabel}</p>
              )}
              {job.state === 'expired' && (
                <p className="mt-2 text-caption text-ink-muted">
                  The file is no longer available. Request it again to produce a fresh copy.
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {job.canDownload && (
                  <LinkButton
                    variant="ghost"
                    size="sm"
                    href={job.downloadUrl ?? `/api/reporting?view=download&id=${job.id}`}
                    iconLeading={<Download aria-hidden className="size-4" />}
                  >
                    Download
                  </LinkButton>
                )}
                {job.state === 'ready' && !job.canDownload && (
                  <span className="inline-flex min-h-6 items-center gap-1 text-caption text-ink-muted">
                    <Lock aria-hidden className="size-3.5" />
                    This file contains protected columns and needs the export-protected permission
                  </span>
                )}
                {(job.state === 'queued' || job.state === 'processing') && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={refreshingJobId === job.id}
                    iconLeading={<RefreshCw aria-hidden className="size-4" />}
                    onClick={() => refreshStatus(job.id)}
                  >
                    Refresh status
                  </Button>
                )}
                {job.canRetry && (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={retryingJobId === job.id}
                    iconLeading={<RotateCcw aria-hidden className="size-4" />}
                    onClick={() => retry(job.id)}
                  >
                    Request again
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>

        {jobs.length === 0 && (
          <EmptyState
            className="mt-4"
            title="No exports requested yet"
            description="Run a report and export it to see its job appear here."
          />
        )}
      </Card>
    </PageContainer>
  );
}
