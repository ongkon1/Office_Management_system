'use client';

import * as React from 'react';
import Link from 'next/link';
import { Paperclip, Plus } from 'lucide-react';
import type { ConveyanceRowView } from '@/contracts/conveyance';
import { mockConveyanceService } from '@/services/mock/conveyance';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { LinkButton } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export function claimTone(row: {
  stage: ConveyanceRowView['stage'];
  outcome: ConveyanceRowView['outcome'];
}): BadgeTone {
  if (row.stage !== 'decided') return 'accent';
  if (row.outcome === 'approved') return 'success';
  if (row.outcome === 'rejected') return 'danger';
  return 'neutral';
}

/**
 * `FE-0764` — the conveyance list.
 *
 * The same shape as the requisition list, because it is the same chain and a
 * person moving between them should not have to relearn where anything is.
 * What differs is the row: a journey has a destination, a date and a mode,
 * where a requisition has an item.
 */
export function ConveyanceList() {
  const { user } = useSession();
  const [tab, setTab] = React.useState('all');

  const { state } = useAsync(
    () => mockConveyanceService.list(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading conveyance claims</span>
          <Skeleton height="4rem" rounded="md" />
          <Skeleton height="20rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status !== 'success') {
    return (
      <PageContainer>
        <EmptyState
          variant={state.failure.status === 'permission_denied' ? 'denied' : 'error'}
          title="Conveyance unavailable"
          description={state.failure.message}
        />
      </PageContainer>
    );
  }

  const data = state.data;
  const awaiting = data.rows.filter((row) => row.awaitingThisViewer);
  const open = data.rows.filter((row) => row.stage !== 'decided');
  const decided = data.rows.filter((row) => row.stage === 'decided');
  const shown =
    tab === 'awaiting' ? awaiting : tab === 'open' ? open : tab === 'decided' ? decided : data.rows;

  const columns: readonly DataTableColumn<ConveyanceRowView>[] = [
    {
      key: 'business',
      header: 'Business',
      alwaysVisible: true,
      render: (row) => (
        <Link
          href={row.href}
          className="inline-flex min-h-6 flex-col font-medium text-ink hover:text-accent"
        >
          {row.businessName}
          <span className="text-caption font-normal text-ink-subtle">{row.reference}</span>
        </Link>
      ),
    },
    {
      key: 'client',
      header: 'Client',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.clientName}</span>,
    },
    {
      key: 'visited',
      header: 'Visited',
      hideBelow: 'md',
      render: (row) => <span className="text-ink-muted">{row.visitedLabel}</span>,
    },
    {
      key: 'mode',
      header: 'Mode',
      hideBelow: 'md',
      render: (row) => <Badge tone="neutral">{row.modeLabel}</Badge>,
    },
    {
      key: 'submitter',
      header: 'Claimed by',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.submitterName}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="inline-flex items-center gap-1.5">
          {row.hasReceipt && (
            <Paperclip aria-label="Receipt attached" className="size-3.5 text-ink-subtle" />
          )}
          <span className="tabular text-ink">{row.amountDisplay}</span>
        </span>
      ),
    },
    {
      key: 'stage',
      header: 'Stage',
      alwaysVisible: true,
      render: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={claimTone(row)}>{row.stageLabel}</Badge>
          {row.awaitingThisViewer && <Badge tone="warning">Your decision</Badge>}
        </span>
      ),
    },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Conveyance"
        description={data.scopeLabel}
        actions={
          data.canSubmit ? (
            <LinkButton
              href="/conveyance/new"
              variant="primary"
              iconLeading={<Plus aria-hidden className="size-4" />}
            >
              New claim
            </LinkButton>
          ) : undefined
        }
      />

      {data.submitBlockedReason && (
        <Callout tone="info" className="mt-5">
          {data.submitBlockedReason}
        </Callout>
      )}

      {awaiting.length > 0 && (
        <Alert tone="warning" className="mt-5" title="Waiting for your decision">
          {awaiting.length} conveyance claim{awaiting.length === 1 ? '' : 's'} cannot move
          forward until you review {awaiting.length === 1 ? 'it' : 'them'}.
        </Alert>
      )}

      <Tabs
        className="mt-5"
        label="Conveyance claim states"
        activeKey={tab}
        onChange={setTab}
        items={[
          { key: 'all', label: 'All', badgeCount: data.rows.length },
          { key: 'awaiting', label: 'Awaiting you', badgeCount: awaiting.length },
          { key: 'open', label: 'In review', badgeCount: open.length },
          { key: 'decided', label: 'Decided', badgeCount: decided.length },
        ]}
      />

      <div className="mt-4">
        {shown.length === 0 ? (
          <EmptyState
            variant={data.rows.length === 0 ? 'empty' : 'no-results'}
            title={data.rows.length === 0 ? 'No conveyance claims yet' : 'Nothing in this group'}
            description={
              data.rows.length === 0
                ? data.canSubmit
                  ? 'Claim a journey you made for work. A receipt helps, but is optional.'
                  : 'Claims appear here once they reach you for review.'
                : 'Try another tab.'
            }
            secondaryAction={
              data.rows.length === 0 && data.canSubmit ? (
                <LinkButton href="/conveyance/new" variant="secondary" size="sm">
                  New claim
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Conveyance claims"
            rows={shown}
            columns={columns}
            getRowId={(row) => row.id}
            renderMobileCard={(row) => (
              <Link href={row.href} className="block">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0 text-body-sm font-medium text-ink">
                    {row.businessName}
                  </span>
                  <Badge tone={claimTone(row)}>{row.stageLabel}</Badge>
                </div>
                <p className="mt-1 text-caption text-ink-muted">
                  {row.reference} · {row.visitedLabel} · {row.modeLabel}
                </p>
                <p className="mt-1 text-caption tabular text-ink">
                  {row.amountDisplay}
                  {row.hasReceipt ? ' · Receipt attached' : ''}
                </p>
                {row.awaitingThisViewer && (
                  <p className="mt-2">
                    <Badge tone="warning">Your decision</Badge>
                  </p>
                )}
              </Link>
            )}
          />
        )}
      </div>

      <Card className="mt-5">
        <h2 className="text-h3 text-ink">How a claim travels</h2>
        <ol className="mt-3 flex flex-col gap-2 text-body-sm text-ink-muted">
          <li>
            <span className="font-medium text-ink">1.</span> An Employee or a Team Lead
            claims a journey.
          </li>
          <li>
            <span className="font-medium text-ink">2.</span> An Employee&rsquo;s goes to
            their Team Lead first. A Team Lead&rsquo;s own skips that step.
          </li>
          <li>
            <span className="font-medium text-ink">3.</span> HR, Finance and the Super
            Administrator each review it. One rejection ends it.
          </li>
        </ol>
      </Card>
    </PageContainer>
  );
}
