'use client';

import * as React from 'react';
import { ChevronDown, Lock, ScrollText } from 'lucide-react';
import type { AuditEventView } from '@/contracts/admin';
import { mockAdminService } from '@/services/mock/admin';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Field } from '@/components/forms/field';
import { Input } from '@/components/forms/inputs';
import { Badge } from '@/components/ui/badge';
import { RestrictedValue } from '@/components/ui/misc';
import { cn } from '@/lib/cn';
import { ReportsFallback, ReportsLoading } from '@/features/reports/report-catalogue';

/**
 * One audit entry.
 *
 * Before/after values are `Redactable`. When they are withheld the *event*
 * still shows — actor, action, resource, time and reason — because hiding the
 * event would make the log an unreliable account of what happened, which is
 * the one thing an audit log cannot be.
 */
function AuditEntry({ event }: { event: AuditEventView }) {
  const [open, setOpen] = React.useState(false);
  const hasDetail = event.before !== null || event.after !== null;
  const isRedacted =
    event.before?.visible === false || event.after?.visible === false;

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
            <ScrollText aria-hidden className="size-3.5 shrink-0 text-ink-muted" />
            {event.actionLabel}
            {isRedacted && (
              <Badge tone="warning" icon={<Lock aria-hidden className="size-3.5" />}>
                Values withheld
              </Badge>
            )}
          </p>
          <p className="mt-1 text-caption text-ink-muted">
            {event.actorLabel} · {event.occurredAtLabel}
          </p>
          <p className="mt-1 text-body-sm text-ink">
            {event.resourceType.replace(/_/g, ' ')}: {event.resourceLabel}
          </p>
          {event.scopeLabel && (
            <p className="text-caption text-ink-subtle">Scope: {event.scopeLabel}</p>
          )}
          {event.reason && (
            <p className="mt-1 text-caption text-ink-muted">Reason: {event.reason}</p>
          )}
        </div>
        <Badge tone="neutral">{event.correlationId}</Badge>
      </div>

      {hasDetail && (
        <>
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
            {open ? 'Hide before and after' : 'Show before and after'}
          </button>

          <div hidden={!open} className="mt-2 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-border bg-surface-sunken p-2">
              <p className="text-caption font-semibold text-ink-muted">Before</p>
              {event.before === null ? (
                <p className="mt-1 text-caption text-ink-subtle">No previous value</p>
              ) : event.before.visible ? (
                <dl className="mt-1 space-y-0.5">
                  {Object.entries(event.before.value).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-caption">
                      <dt className="text-ink-muted">{key}</dt>
                      <dd className="text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-1">
                  <RestrictedValue reason="This record belongs to a restricted scope. The event is shown; its values need a separately granted permission." />
                </div>
              )}
            </div>

            <div className="rounded-md border border-border bg-surface-sunken p-2">
              <p className="text-caption font-semibold text-ink-muted">After</p>
              {event.after === null ? (
                <p className="mt-1 text-caption text-ink-subtle">No resulting value</p>
              ) : event.after.visible ? (
                <dl className="mt-1 space-y-0.5">
                  {Object.entries(event.after.value).map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-caption">
                      <dt className="text-ink-muted">{key}</dt>
                      <dd className="text-ink">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="mt-1">
                  <RestrictedValue reason="This record belongs to a restricted scope. The event is shown; its values need a separately granted permission." />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </li>
  );
}

/** FE-0733 — the audit-log viewer. */
export function AuditLog() {
  const { user } = useSession();
  const [actors, setActors] = React.useState<readonly string[]>([]);
  const [actions, setActions] = React.useState<readonly string[]>([]);
  const [resourceTypes, setResourceTypes] = React.useState<readonly string[]>([]);
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');

  const { state, previous } = useAsync(
    () =>
      mockAdminService.getAuditLog(user?.userId ?? '', {
        actors,
        actions,
        resourceTypes,
        from: from || null,
        to: to || null,
      }),
    [user?.userId, actors, actions, resourceTypes, from, to],
  );

  /*
   * Every filter here is a `useAsync` dependency, so the request re-enters
   * `loading` on each change. Returning a page-level skeleton unmounted the
   * filter bar mid-interaction: a date being typed lost its caret after one
   * character and an open multi-select closed the moment an option was picked.
   * The bar stays mounted, drawing its option lists from the last successful
   * response, and only the events region below it changes state.
   */
  const data = state.status === 'success' ? state.data : null;
  const failure = state.status === 'failure' ? state.failure : null;
  const options = data ?? previous;

  const applied = [
    ...actors.map((value) => ({
      key: `actor-${value}`,
      label: 'Actor',
      value: options?.actorOptions.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setActors(actors.filter((item) => item !== value)),
    })),
    ...actions.map((value) => ({
      key: `action-${value}`,
      label: 'Action',
      value: options?.actionOptions.find((option) => option.value === value)?.label ?? value,
      onRemove: () => setActions(actions.filter((item) => item !== value)),
    })),
    ...resourceTypes.map((value) => ({
      key: `resource-${value}`,
      label: 'Resource',
      value: value.replace(/_/g, ' '),
      onRemove: () => setResourceTypes(resourceTypes.filter((item) => item !== value)),
    })),
  ];

  return (
    <PageContainer width="full">
      <PageHeader
        title="Audit log"
        description="Who did what, to which record, when, and why."
        meta={
          data && (
            <>
              <Badge tone="neutral">{data.totalCount} events</Badge>
              {data.restrictedCount > 0 && (
                <Badge tone="warning">{data.restrictedCount} with withheld values</Badge>
              )}
            </>
          )
        }
      />

      <FilterBar
        className="mt-5"
        applied={applied}
        onClearAll={() => {
          setActors([]);
          setActions([]);
          setResourceTypes([]);
          setFrom('');
          setTo('');
        }}
        resultSummary={
          data ? `${data.totalCount} event${data.totalCount === 1 ? '' : 's'}` : 'Loading…'
        }
      >
        <MultiSelectFilter
          label="Actor"
          options={options?.actorOptions ?? []}
          selected={actors}
          onChange={setActors}
        />
        <MultiSelectFilter
          label="Action"
          options={options?.actionOptions ?? []}
          selected={actions}
          onChange={setActions}
        />
        <MultiSelectFilter
          label="Resource"
          options={options?.resourceOptions ?? []}
          selected={resourceTypes}
          onChange={setResourceTypes}
        />
        <Field label="From" className="w-40">
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="To" className="w-40">
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </FilterBar>

      <Callout tone="info" className="mt-4">
        An event about a restricted record still appears here. Its before and after values are
        withheld rather than the event being hidden, so the log stays a complete account of what
        happened.
      </Callout>

      {state.status === 'loading' ? (
        <ReportsLoading label="audit log" inline />
      ) : failure ? (
        <ReportsFallback result={failure} subject="Audit log" inline />
      ) : !data ? null : data.events.length === 0 ? (
        <EmptyState
          className="mt-5"
          variant="no-results"
          title="No events match these filters"
          description="Clear a filter or widen the date range."
        />
      ) : (
        <Card className="mt-5">
          <CardHeader title="Events" description="Newest first." />
          <ul className="mt-4 space-y-3">
            {data.events.map((event) => (
              <AuditEntry key={event.id} event={event} />
            ))}
          </ul>
        </Card>
      )}
    </PageContainer>
  );
}
