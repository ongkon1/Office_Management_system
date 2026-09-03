'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileChartColumn, Lock, ShieldAlert } from 'lucide-react';
import { mockReportingService } from '@/services/mock/reporting';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Result } from '@/contracts/results';

export function ReportsLoading({ label }: { label: string }) {
  return (
    <PageContainer>
      <div role="status" aria-busy>
        <span className="sr-only">Loading {label}</span>
        <Skeleton height="2rem" width="18rem" />
        <Skeleton height="20rem" rounded="md" className="mt-5" />
      </div>
    </PageContainer>
  );
}

export function ReportsFallback({
  result,
  subject,
}: {
  result: Exclude<Result<unknown>, { status: 'success' }>;
  subject: string;
}) {
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
  if (result.status === 'not_found') {
    return (
      <PageContainer>
        <EmptyState
          variant="no-results"
          title={`${subject} not found`}
          description="It may not exist, or it may not be available to your role."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer>
      <EmptyState variant="error" title={`${subject} unavailable`} description="Try again in a moment." />
    </PageContainer>
  );
}

/**
 * FE-0701 — the report catalogue.
 *
 * The catalogue is authorization-filtered by the service: a report this viewer
 * may not run is absent, not greyed out. A disabled entry would turn the
 * catalogue into a directory of what other people can see, which is the same
 * disclosure as showing the data.
 */
export function ReportCatalogue() {
  const { user } = useSession();
  const { state } = useAsync(
    () => mockReportingService.listReports(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <ReportsLoading label="report catalogue" />;
  if (state.status !== 'success') {
    return <ReportsFallback result={state.failure} subject="Reports" />;
  }
  const groups = state.data;
  const total = groups.reduce((sum, group) => sum + group.reports.length, 0);

  return (
    <PageContainer width="full">
      <PageHeader
        title="Reports"
        description="Every report available to your role, grouped by the area it covers."
        meta={<Badge tone="neutral">{total} reports</Badge>}
        actions={
          <LinkButton variant="secondary" href="/reports/exports">
            Export history
          </LinkButton>
        }
      />

      <Callout tone="info" className="mt-5">
        Only reports you are authorized to run are listed. A report that needs a permission you do
        not hold is absent rather than shown and disabled.
      </Callout>

      {groups.length === 0 && (
        <EmptyState
          className="mt-5"
          title="No reports available to your role"
          description="Reports appear here once your role is granted access to them."
        />
      )}

      <div className="mt-5 space-y-5">
        {groups.map((group) => (
          <Card key={group.category}>
            <CardHeader title={group.label} description={group.description} />
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.reports.map((report) => (
                <li key={report.key}>
                  <Link
                    href={report.href}
                    className="flex h-full flex-col rounded-md border border-border p-3 transition-colors hover:border-highlight-hover hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-body-sm font-medium text-ink">{report.title}</span>
                      <FileChartColumn aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    </span>
                    <span className="mt-1 flex-1 text-caption text-ink-muted">
                      {report.description}
                    </span>
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {report.containsProtectedFields && (
                        <Badge tone="warning" icon={<ShieldAlert aria-hidden className="size-3.5" />}>
                          Protected fields
                        </Badge>
                      )}
                      {report.willRedactFields && (
                        <Badge tone="neutral" icon={<Lock aria-hidden className="size-3.5" />}>
                          Some columns withheld
                        </Badge>
                      )}
                      <Badge tone="neutral">{report.filters.length} filters</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}
