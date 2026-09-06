'use client';

import * as React from 'react';
import { ChevronRight, Download, Lock, RotateCcw } from 'lucide-react';
import { mockReportingService } from '@/services/mock/reporting';
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
 * Every state an export can be in is present, including the ones people
 * actually get stuck on. `Advance` walks a queued job through processing to
 * ready so the lifecycle is demonstrable without a backend worker; it exists
 * because a history that only ever shows `Ready` teaches nothing about what to
 * do when a job is not.
 */
export function ExportHistory() {
  const { user } = useSession();
  const toast = useToast();
  const { state, reload } = useAsync(
    () => mockReportingService.listExports(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="export history" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Export history" />;
  }
  const jobs = state.data;

  async function advance(id: string) {
    const result = await mockReportingService.advanceExport(user?.userId ?? '', id);
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: `Export is now ${result.data.stateLabel.toLowerCase()}`,
        description:
          result.data.state === 'ready'
            ? 'The job record is complete. No file is produced during the frontend milestone.'
            : 'Advance again to move it to the next state.',
      });
    }
  }

  async function retry(id: string) {
    const result = await mockReportingService.retryExport(user?.userId ?? '', id);
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: 'Export requeued',
        description: 'The job returns to the queued state with your name as the requester.',
      });
    }
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
        No export produces a file during the frontend milestone. The job record, its states and
        the permission rules around downloading are real; file generation arrives with the backend
        export worker.
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
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeading={<Download aria-hidden className="size-4" />}
                    onClick={() =>
                      toast.show({
                        tone: 'info',
                        title: 'Download not available yet',
                        description:
                          'The job record is real; file delivery arrives with the backend export worker.',
                      })
                    }
                  >
                    Download
                  </Button>
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
                    iconLeading={<ChevronRight aria-hidden className="size-4" />}
                    onClick={() => advance(job.id)}
                  >
                    Advance state
                  </Button>
                )}
                {job.canRetry && (
                  <Button
                    variant="secondary"
                    size="sm"
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
