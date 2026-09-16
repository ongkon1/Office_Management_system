'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { MeetingMinuteListView, MeetingMinuteSummaryView } from '@/contracts/meeting-minutes';
import { MINUTE_PROCESSING_STATUSES } from '@/contracts/meeting-minutes';
import { success } from '@/contracts/results';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { formatDate, formatDateRange } from '@/lib/format';
import { describeMinuteProcessingStatus } from '@/lib/status';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar, MultiSelectFilter, type AppliedFilter } from '@/components/data/filters';
import { Field } from '@/components/forms/field';
import { Checkbox, Input, SearchInput } from '@/components/forms/inputs';
import { LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ProcessingStatusIndicator } from '@/components/ui/status-indicator';
import {
  EMPTY_MINUTE_LIST_STATE,
  hasActiveFilters,
  parseMinuteListParams,
  projectOptionsForClients,
  reconcileWithAppliedFilters,
  serializeMinuteListParams,
  toMinuteListQuery,
  withoutIncompatibleProjects,
  type MinuteListUrlState,
} from './list-url-state';
import { frameOf, resolveMinuteListState, type MinuteListViewState } from './list-view-state';

const SEARCH_DELAY_MS = 300;

const ACTION_LINK =
  'inline-flex min-h-6 items-center rounded-xs text-body-sm font-medium text-accent hover:underline';

const STATUS_OPTIONS = MINUTE_PROCESSING_STATUSES.map((status) => ({
  value: status,
  label: describeMinuteProcessingStatus(status).label,
}));

/** View, plus Edit when the service allows it. The visible word stays short; the
 *  accessible name carries the title, so a list of "Edit" links is still
 *  distinguishable to a screen reader. */
function RowActions({ row }: { row: MeetingMinuteSummaryView }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Link href={row.href} className={ACTION_LINK}>
        View<span className="sr-only"> {row.title}</span>
      </Link>
      {row.actions.canEdit && (
        <Link href={`${row.href}/edit`} className={ACTION_LINK}>
          Edit<span className="sr-only"> {row.title}</span>
        </Link>
      )}
    </span>
  );
}

function TitleCell({ row }: { row: MeetingMinuteSummaryView }) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <Link
        href={row.href}
        className="inline-flex min-h-6 items-center font-medium text-ink hover:text-accent"
      >
        {row.title}
      </Link>
      {row.isArchived && (
        <span>
          <Badge tone="neutral">Archived</Badge>
        </span>
      )}
    </span>
  );
}

function createdRangeLabel(from: string, to: string): string {
  if (from && to) return formatDateRange(from, to);
  return from ? `From ${formatDate(from)}` : `Until ${formatDate(to)}`;
}

/**
 * `FE-1110` — the Meeting Minutes list; `FE-1111` — its search and filters.
 *
 * The URL is the only source of list state (`./list-url-state.ts`). Every
 * change is a `replace`, so filtering adds no history entries, and the service
 * decides which filters it actually applied — the URL is rewritten from that,
 * so it never keeps a filter the viewer may not use. The full state set is
 * `FE-1112`.
 */
export function MeetingMinutesList() {
  const { user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const requestKey = searchParams.toString();
  const urlState = React.useMemo(
    () => parseMinuteListParams(new URLSearchParams(requestKey)),
    [requestKey],
  );

  const navigate = React.useCallback(
    (next: MinuteListUrlState) => {
      const query = serializeMinuteListParams(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  /*
   * The controls read a draft, not the URL. `router.replace` settles a moment
   * after the click, so a checkbox or date field bound straight to the URL
   * snaps back to its old value until then — and a screen reader announces the
   * old state. The draft changes at once and is reset from the URL whenever the
   * URL changes (Clear all, Back, a pasted link, or the service dropping a
   * filter), adjusted during render rather than in an effect.
   */
  const [draft, setDraft] = React.useState(urlState);
  const [draftKey, setDraftKey] = React.useState(requestKey);
  if (requestKey !== draftKey) {
    setDraftKey(requestKey);
    setDraft(urlState);
  }

  /** A filter change always returns to the first page. Built on the draft, so
   *  two quick changes before the URL settles are both kept. */
  const update = (patch: Partial<MinuteListUrlState>) => {
    const next = { ...draft, search: urlState.search, page: 1, ...patch };
    setDraft(next);
    navigate(next);
  };

  /*
   * Search is typed locally and written to the URL once typing pauses. When the
   * URL's term changes from elsewhere — Clear all, Back, a pasted link — the box
   * follows it, adjusted during render rather than in an effect.
   */
  const [term, setTerm] = React.useState(urlState.search);
  const [syncedSearch, setSyncedSearch] = React.useState(urlState.search);
  if (urlState.search !== syncedSearch) {
    setSyncedSearch(urlState.search);
    setTerm(urlState.search);
  }

  React.useEffect(() => {
    if (term.trim() === urlState.search) return;
    const timer = setTimeout(() => navigate({ ...urlState, search: term.trim(), page: 1 }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term, urlState, navigate]);

  const { state, previous, reload } = useAsync(
    async () => {
      const result = await mockMeetingMinutesService.list(user?.userId ?? '', toMinuteListQuery(urlState));
      // Tagged with the URL it answers, so a response that arrives after the
      // filters changed is never mistaken for the current one.
      return result.status === 'success' ? success({ key: requestKey, view: result.data }) : result;
    },
    [user?.userId, requestKey],
    { keepPrevious: true },
  );

  const settled: MeetingMinuteListView | null =
    state.status === 'success' && state.data.key === requestKey ? state.data.view : null;
  const listState = resolveMinuteListState({
    failure: state.status === 'failure' ? state.failure : null,
    settled,
    previous: previous?.view ?? null,
    filtersActive: hasActiveFilters(urlState),
  });
  const frame = frameOf(listState);

  // Rewrite the URL to what the service applied, and pull an out-of-range page
  // back to the last one.
  React.useEffect(() => {
    if (!settled) return;
    let next = reconcileWithAppliedFilters(urlState, settled.appliedFilters);
    if (next.page > settled.page.pageInfo.totalPages) {
      next = { ...next, page: settled.page.pageInfo.totalPages };
    }
    if (serializeMinuteListParams(next) !== serializeMinuteListParams(urlState)) navigate(next);
  }, [settled, urlState, navigate]);

  if (listState.kind === 'loading') {
    return <MeetingMinutesListSkeleton />;
  }

  // Denied and signed-out carry no list data, so nothing below can show a
  // count, an option or a name (`FE-1112`).
  if (listState.kind === 'denied' || listState.kind === 'signed-out') {
    const here = requestKey ? `${pathname}?${requestKey}` : pathname;
    return (
      <PageContainer>
        <PageHeader title="Meeting Minutes" />
        <div className="mt-5" role="alert">
          {listState.kind === 'denied' ? (
            <EmptyState
              variant="denied"
              title="You don’t have access to meeting minutes"
              description="Your account can’t open this list. If you need it for your work, ask your administrator to review your access."
            />
          ) : (
            <EmptyState
              variant="denied"
              title="Sign in to see meeting minutes"
              description="Your session has ended. Sign in again and you’ll come back to this list with the same filters."
              secondaryAction={
                <LinkButton href={`/login?returnTo=${encodeURIComponent(here)}`} variant="primary" size="sm">
                  Sign in
                </LinkButton>
              }
            />
          )}
        </div>
      </PageContainer>
    );
  }

  if ((listState.kind === 'error' || listState.kind === 'invalid') && !listState.frame) {
    // An error or rejected settings before any successful answer: there are no
    // options to offer, so show the problem and the way out, and nothing else.
    return (
      <PageContainer>
        <PageHeader title="Meeting Minutes" />
        <div className="mt-5" role="alert">
          <ListProblem
            state={listState}
            onRetry={reload}
            onReset={() => navigate(EMPTY_MINUTE_LIST_STATE)}
          />
        </div>
      </PageContainer>
    );
  }

  // Every remaining state carries a frame; this only narrows the type.
  if (!frame) {
    return <MeetingMinutesListSkeleton />;
  }

  const clearAll = () => {
    setTerm('');
    navigate({ ...EMPTY_MINUTE_LIST_STATE, pageSize: urlState.pageSize });
  };

  const clientName = (id: string) => frame.clientOptions.find((item) => item.id === id)?.name ?? id;
  const projectName = (id: string) => frame.projectOptions.find((item) => item.id === id)?.name ?? id;
  const projectChoices = projectOptionsForClients(draft.clientIds, frame.projectOptions).map((item) => ({
    value: item.id,
    label: item.name,
    hint: item.isActive ? item.code : `${item.code} · Inactive`,
  }));

  const applied: AppliedFilter[] = [
    ...(urlState.search
      ? [{ key: 'search', label: 'Search', value: urlState.search, onRemove: () => { setTerm(''); update({ search: '' }); } }]
      : []),
    ...draft.clientIds.map((id) => ({
      key: `client-${id}`,
      label: 'Client',
      value: clientName(id),
      onRemove: () => {
        const clientIds = draft.clientIds.filter((item) => item !== id);
        update({
          clientIds,
          projectIds: withoutIncompatibleProjects(draft.projectIds, clientIds, frame.projectOptions),
        });
      },
    })),
    ...draft.projectIds.map((id) => ({
      key: `project-${id}`,
      label: 'Project',
      value: projectName(id),
      onRemove: () => update({ projectIds: draft.projectIds.filter((item) => item !== id) }),
    })),
    ...draft.statuses.map((status) => ({
      key: `status-${status}`,
      label: 'Status',
      value: describeMinuteProcessingStatus(status).label,
      onRemove: () => update({ statuses: draft.statuses.filter((item) => item !== status) }),
    })),
    ...(draft.createdFrom || draft.createdTo
      ? [
          {
            key: 'created',
            label: 'Created',
            value: createdRangeLabel(draft.createdFrom, draft.createdTo),
            onRemove: () => update({ createdFrom: '', createdTo: '' }),
          },
        ]
      : []),
    ...(draft.includeArchived
      ? [{ key: 'archived', label: 'Archived', value: 'Included', onRemove: () => update({ includeArchived: false }) }]
      : []),
  ];

  const rows = settled?.page.items ?? [];
  const pageInfo = frame.page.pageInfo;
  const total = settled?.page.pageInfo.totalItems;

  const columns: readonly DataTableColumn<MeetingMinuteSummaryView>[] = [
    { key: 'title', header: 'Title', alwaysVisible: true, render: (row) => <TitleCell row={row} /> },
    {
      key: 'client',
      header: 'Client',
      hideBelow: 'md',
      render: (row) => <span className="text-ink-muted">{row.client.name}</span>,
    },
    {
      key: 'project',
      header: 'Project',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.projectName}</span>,
    },
    {
      key: 'creator',
      header: 'Created by',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.creatorName}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      hideBelow: 'md',
      render: (row) => <span className="whitespace-nowrap text-ink-muted">{row.createdAtLabel}</span>,
    },
    {
      key: 'ai',
      header: 'AI requested',
      hideBelow: 'lg',
      render: (row) => <span className="text-ink-muted">{row.aiRequestedLabel}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      alwaysVisible: true,
      render: (row) => <ProcessingStatusIndicator status={row.processing.status} />,
    },
    { key: 'actions', header: 'Actions', alwaysVisible: true, render: (row) => <RowActions row={row} /> },
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Meeting Minutes"
        description="Minutes from client and project meetings you have access to."
        actions={
          frame.canCreate ? (
            <LinkButton
              href="/meeting-minutes/new"
              variant="primary"
              iconLeading={<Plus aria-hidden className="size-4" />}
            >
              Add meeting minute
            </LinkButton>
          ) : undefined
        }
      />

      {!frame.canCreate && (
        <Callout tone="info" className="mt-5">
          You can read the meeting minutes in your scope. Team Leads, HR and the Super
          Administrator add and edit them.
        </Callout>
      )}

      <div className="mt-5 flex flex-col gap-3">
        <div className="w-full sm:max-w-sm">
          <SearchInput
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onClear={() => {
              setTerm('');
              update({ search: '' });
            }}
            placeholder="Search title, client or project"
            aria-label="Search meeting minutes"
            maxLength={200}
          />
        </div>

        <FilterBar
          applied={applied}
          onClearAll={clearAll}
          resultSummary={
            listState.kind === 'refreshing'
              ? 'Loading meeting minutes'
              : total === undefined
                ? undefined
                : `${total} meeting minute${total === 1 ? '' : 's'}`
          }
        >
          <MultiSelectFilter
            label="Client"
            options={frame.clientOptions.map((item) => ({ value: item.id, label: item.name }))}
            selected={draft.clientIds}
            onChange={(clientIds) =>
              update({
                clientIds,
                projectIds: withoutIncompatibleProjects(draft.projectIds, clientIds, frame.projectOptions),
              })
            }
          />
          <MultiSelectFilter
            label="Project"
            options={projectChoices}
            selected={draft.projectIds}
            onChange={(projectIds) => update({ projectIds })}
          />
          <MultiSelectFilter
            label="Status"
            options={STATUS_OPTIONS}
            selected={draft.statuses}
            onChange={(statuses) =>
              update({ statuses: STATUS_OPTIONS.map((item) => item.value).filter((value) => statuses.includes(value)) })
            }
          />
          <Field label="Created from" className="w-40">
            <Input
              type="date"
              value={draft.createdFrom}
              max={draft.createdTo || undefined}
              onChange={(event) => update({ createdFrom: event.target.value })}
            />
          </Field>
          <Field label="Created to" className="w-40">
            <Input
              type="date"
              value={draft.createdTo}
              min={draft.createdFrom || undefined}
              onChange={(event) => update({ createdTo: event.target.value })}
            />
          </Field>
          <Checkbox
            label="Include archived"
            checked={draft.includeArchived}
            onChange={(event) => update({ includeArchived: event.target.checked })}
            className="self-end pb-2"
          />
        </FilterBar>
      </div>

      <div className="mt-5">
        {listState.kind === 'error' || listState.kind === 'invalid' ? (
          <div role="alert">
            <ListProblem state={listState} onRetry={reload} onReset={clearAll} />
          </div>
        ) : listState.kind === 'no-results' ? (
          <EmptyState
            variant="no-results"
            title="No meeting minutes match"
            description="Change the search or filters, or clear them to see every minute you can access."
            action={{ label: 'Clear all filters', onClick: clearAll }}
          />
        ) : listState.kind === 'empty' ? (
          <EmptyState
            variant="empty"
            title="No meeting minutes yet"
            description={
              frame.canCreate
                ? 'Record a client or project meeting so decisions and follow-up work stay traceable.'
                : 'Minutes appear here once someone records a meeting for a project you can see.'
            }
            secondaryAction={
              frame.canCreate ? (
                <LinkButton href="/meeting-minutes/new" variant="secondary" size="sm">
                  Add meeting minute
                </LinkButton>
              ) : undefined
            }
          />
        ) : (
          <DataTable
            caption="Meeting minutes"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            loading={!settled}
            pageInfo={pageInfo}
            onPageChange={(page) => navigate({ ...urlState, page })}
            onPageSizeChange={(pageSize) => navigate({ ...urlState, pageSize, page: 1 })}
            renderMobileCard={(row) => (
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <TitleCell row={row} />
                  <ProcessingStatusIndicator status={row.processing.status} />
                </div>
                <p className="text-caption text-ink-muted">
                  {row.client.name} · {row.projectName}
                </p>
                <p className="text-caption text-ink-muted">
                  {row.creatorName} · {row.createdAtLabel}
                </p>
                <p className="text-caption text-ink-muted">AI requested: {row.aiRequestedLabel}</p>
                <RowActions row={row} />
              </div>
            )}
          />
        )}
      </div>
    </PageContainer>
  );
}

/**
 * An error or rejected list settings. The message is fixed copy, never the
 * service's own text, so nothing a failure carries can reach the page; only the
 * support reference is shown, because it is designed to be safe to show.
 */
function ListProblem({
  state,
  onRetry,
  onReset,
}: {
  state: Extract<MinuteListViewState, { kind: 'error' | 'invalid' }>;
  onRetry: () => void;
  onReset: () => void;
}) {
  if (state.kind === 'invalid') {
    return (
      <EmptyState
        variant="error"
        title="This list link isn’t valid"
        description="Some of its settings couldn’t be used. Reset the list to start again from the first page."
        action={{ label: 'Reset the list', onClick: onReset }}
      />
    );
  }
  const reference = state.reference ? ` Reference: ${state.reference}.` : '';
  return state.retryable ? (
    <EmptyState
      variant="error"
      title="Meeting minutes couldn’t be loaded"
      description={`This is usually temporary, and your filters are kept.${reference}`}
      action={{ label: 'Try again', onClick: onRetry }}
    />
  ) : (
    <EmptyState
      variant="error"
      title="Meeting minutes couldn’t be loaded"
      description={`Trying again won’t fix this one. If it keeps happening, contact support.${reference}`}
    />
  );
}

export function MeetingMinutesListSkeleton() {
  return (
    <PageContainer>
      <div role="status" aria-busy>
        <span className="sr-only">Loading meeting minutes</span>
        <Skeleton height="4rem" rounded="md" />
        <Skeleton height="20rem" rounded="md" className="mt-4" />
      </div>
    </PageContainer>
  );
}
