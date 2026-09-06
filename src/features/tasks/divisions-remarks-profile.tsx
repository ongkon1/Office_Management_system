'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { useAsync } from '@/lib/use-async';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Duration } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/forms/field';
import { Input, Select, Textarea } from '@/components/forms/inputs';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader, StickyActionBar } from '@/components/layout/page';
import { mockDivisionsService, mockRemarkService } from '@/services/mock/work';
import { findAccountByUserId } from '@/services/mock/accounts';
import { WORK_LOCATION_LABEL } from '@/lib/status';

/* -------------------------------------------------------------------------- */
/* My Divisions (FE-0342)                                                     */
/* -------------------------------------------------------------------------- */

export function MyDivisions({ employeeId }: { employeeId: string }) {
  const { state, reload } = useAsync(
    () => mockDivisionsService.listForEmployee(employeeId),
    [employeeId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading your divisions</span>
          <Skeleton height="2rem" width="12rem" />
          <Skeleton height="12rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Could not load your divisions"
          action={{ label: 'Try again', onClick: reload }}
        />
      </PageContainer>
    );
  }

  const { assignments, totalAllocation } = state.data;

  return (
    <PageContainer>
      <PageHeader
        title="My Divisions"
        description="Where you are assigned, how much of your week each division expects, and which assignments are effective today."
      />

      <div className="mt-5 flex flex-col gap-5">
        {/* REQ-ORG-010: a warning, not a block. */}
        {totalAllocation !== 100 && (
          <Alert
            tone="warning"
            title={`Your concurrent allocation is ${totalAllocation}%`}
          >
            Planned allocation across your active assignments does not total 100%. This is
            a planning signal, not a restriction on recording time — raise it with HR if it
            looks wrong.
          </Alert>
        )}

        {assignments.length === 0 ? (
          <EmptyState
            variant="empty"
            title="No division assignments"
            description="Ask HR to assign you to a division so you can record time."
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <Card
                  className={
                    assignment.isEffectiveToday ? undefined : 'border-dashed opacity-80'
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body font-medium text-ink">
                        {assignment.division.name}
                      </p>
                      <p className="mt-0.5 text-caption text-ink-muted">
                        {assignment.division.code}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                      {assignment.isPrimary && <Badge tone="accent">Primary</Badge>}
                      {assignment.isTemporary && <Badge tone="info">Temporary</Badge>}
                      {!assignment.isEffectiveToday && (
                        <Badge tone="neutral">Not effective today</Badge>
                      )}
                    </div>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <dt className="text-caption text-ink-subtle">Team Lead</dt>
                      <dd className="text-body-sm text-ink">
                        {assignment.teamLead?.fullName ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-ink-subtle">Allocation</dt>
                      <dd className="text-body-sm tabular text-ink">
                        {assignment.allocationPercent}%
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-ink-subtle">Expected weekly</dt>
                      <dd className="text-body-sm text-ink">
                        <Duration value={assignment.expectedWeekly} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-caption text-ink-subtle">Effective</dt>
                      <dd className="text-body-sm text-ink">
                        {assignment.startDateLabel}
                        {assignment.endDateLabel ? ` – ${assignment.endDateLabel}` : ' – open'}
                      </dd>
                    </div>
                  </dl>

                  {!assignment.isEffectiveToday && assignment.endDateLabel && (
                    <p className="mt-3 border-t border-border pt-2 text-caption text-ink-muted">
                      This assignment ended on {assignment.endDateLabel}. New time cannot be
                      recorded against this division after that date.
                    </p>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Remarks inbox and detail (FE-0343, FE-0344)                                */
/* -------------------------------------------------------------------------- */

export function RemarksInbox({ employeeId }: { employeeId: string }) {
  const [filter, setFilter] = React.useState('all');
  const { state, reload } = useAsync(
    () => mockRemarkService.listForEmployee(employeeId),
    [employeeId],
  );

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy>
          <span className="sr-only">Loading remarks</span>
          <Skeleton height="2rem" width="12rem" />
          <Skeleton height="12rem" rounded="md" className="mt-4" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Could not load your remarks"
          action={{ label: 'Try again', onClick: reload }}
        />
      </PageContainer>
    );
  }

  const all = state.data;
  const remarks =
    filter === 'all'
      ? all
      : filter === 'action'
        ? all.filter((remark) => remark.state === 'open' && remark.isCorrectionRequest)
        : all.filter((remark) => remark.state === filter);

  return (
    <PageContainer>
      <PageHeader
        title="Remarks"
        description="Feedback and correction requests from your Team Lead. There is one remark type — this is not an approval queue."
      />

      <div className="mt-5 flex flex-col gap-4">
        <Tabs
          label="Remark filters"
          activeKey={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: 'All', badgeCount: all.length },
            {
              key: 'action',
              label: 'Needs action',
              badgeCount: all.filter(
                (remark) => remark.state === 'open' && remark.isCorrectionRequest,
              ).length,
            },
            { key: 'open', label: 'Open' },
            { key: 'responded', label: 'Responded' },
            { key: 'resolved', label: 'Resolved' },
          ]}
        />

        {remarks.length === 0 ? (
          <EmptyState
            variant={filter === 'all' ? 'empty' : 'no-results'}
            title={filter === 'all' ? 'No remarks' : 'Nothing in this view'}
            description={
              filter === 'all'
                ? 'Your Team Lead has not raised anything.'
                : 'Try another filter.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {remarks.map((remark) => (
              <li key={remark.id}>
                <Link href={remark.href} className="group block">
                  <Card className="transition-colors group-hover:border-border-strong group-hover:bg-surface-sunken">
                    <div className="flex items-start gap-3">
                      <Avatar name={remark.author.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-body-sm font-medium text-ink">
                            {remark.author.fullName}
                          </span>
                          <span className="text-caption text-ink-subtle">
                            {remark.createdAtLabel}
                          </span>
                          {remark.isCorrectionRequest && (
                            <Badge tone="warning">Correction requested</Badge>
                          )}
                          <Badge
                            tone={
                              remark.state === 'resolved'
                                ? 'success'
                                : remark.state === 'open'
                                  ? 'neutral'
                                  : 'info'
                            }
                          >
                            {remark.stateLabel}
                          </Badge>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-body-sm text-ink-muted">
                          {remark.message}
                        </p>
                        {remark.relatedLabel && (
                          <p className="mt-1 text-caption text-accent">
                            {remark.relatedLabel}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}

export function RemarkDetail({
  remarkId,
  employeeId,
}: {
  remarkId: string;
  employeeId: string;
}) {
  const toast = useToast();
  const { state, reload } = useAsync(() => mockRemarkService.getById(remarkId), [remarkId]);
  const [reply, setReply] = React.useState('');
  const [sending, setSending] = React.useState(false);

  if (state.status === 'loading') {
    return (
      <PageContainer width="narrow">
        <div role="status" aria-busy>
          <span className="sr-only">Loading remark</span>
          <Skeleton height="10rem" rounded="md" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer width="narrow">
        <EmptyState variant="no-results" title="Remark not found" />
      </PageContainer>
    );
  }

  const { summary, requestedChanges, responses } = state.data;

  async function submit() {
    if (!reply.trim()) return;
    setSending(true);
    const result = await mockRemarkService.respond(remarkId, reply.trim(), employeeId);
    setSending(false);
    if (result.status === 'success') {
      setReply('');
      toast.show({
        tone: 'success',
        title: 'Clarification sent',
        description: 'Your Team Lead can see your response. The original remark is kept.',
      });
      reload();
    }
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Remark"
        crumbs={[{ label: 'Remarks', href: '/remarks' }, { label: summary.createdAtLabel }]}
        backHref="/remarks"
        backLabel="All remarks"
        meta={
          <>
            <Badge
              tone={
                summary.state === 'resolved'
                  ? 'success'
                  : summary.state === 'open'
                    ? 'neutral'
                    : 'info'
              }
            >
              {summary.stateLabel}
            </Badge>
            {summary.isCorrectionRequest && <Badge tone="warning">Correction requested</Badge>}
          </>
        }
      />

      <div className="mt-5 flex flex-col gap-4">
        <Card>
          <div className="flex items-start gap-3">
            <Avatar name={summary.author.fullName} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-body-sm font-medium text-ink">{summary.author.fullName}</p>
              <p className="text-caption text-ink-subtle">{summary.createdAtLabel}</p>
              <p className="mt-2 text-body-sm text-ink">{summary.message}</p>
            </div>
          </div>

          {summary.relatedHref && summary.relatedLabel && (
            <Link
              href={summary.relatedHref}
              className="mt-3 inline-flex min-h-6 items-center rounded-xs text-body-sm text-accent underline underline-offset-2"
            >
              Open {summary.relatedLabel}
            </Link>
          )}
        </Card>

        {requestedChanges && (
          <Alert tone="warning" title="Requested changes">
            {requestedChanges}
            {summary.relatedHref && (
              <p className="mt-2">
                <Link
                  href={summary.relatedHref}
                  className="inline-flex min-h-6 items-center font-medium text-accent underline underline-offset-2"
                >
                  Open the record to correct it
                </Link>
              </p>
            )}
          </Alert>
        )}

        {responses.length > 0 && (
          <Card>
            <CardHeader title="Responses" as="h2" />
            <ul className="mt-3 flex flex-col gap-3">
              {responses.map((response) => (
                <li key={response.id} className="flex items-start gap-3">
                  <Avatar name={response.author.fullName} size="xs" />
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-ink">
                      {response.author.fullName}{' '}
                      <span className="font-normal text-ink-subtle">
                        {response.createdAtLabel}
                      </span>
                    </p>
                    <p className="mt-0.5 text-body-sm text-ink-muted">{response.message}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {summary.state !== 'resolved' && (
          <Card>
            <CardHeader
              title="Add a clarification"
              description="Your response is added to the history; nothing is overwritten."
              as="h2"
            />
            <div className="mt-3">
              <Field label="Your response" hideLabel>
                <Textarea
                  rows={4}
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Explain what happened, or what you have corrected."
                />
              </Field>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="primary"
                onClick={submit}
                loading={sending}
                disabled={!reply.trim()}
              >
                Send clarification
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}

/* -------------------------------------------------------------------------- */
/* Profile (FE-0345)                                                          */
/* -------------------------------------------------------------------------- */

export function ProfileScreen({ userId }: { userId: string }) {
  const toast = useToast();
  const account = findAccountByUserId(userId);

  const [phone, setPhone] = React.useState('+880 1700 000000');
  const [workMode, setWorkMode] = React.useState('office');
  const [density, setDensity] = React.useState('comfortable');
  const [dirty, setDirty] = React.useState(false);

  if (!account) {
    return (
      <PageContainer width="narrow">
        <EmptyState variant="no-results" title="Profile not available" />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Profile"
        description="Your details, preferences, and how the interface behaves for you."
      />

      <div className="mt-5 flex flex-col gap-5">
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={account.fullName} size="lg" />
            <div className="min-w-0">
              <p className="text-h3 text-ink">{account.fullName}</p>
              <p className="text-body-sm text-ink-muted">{account.designation}</p>
              <p className="mt-1 text-caption text-ink-subtle">
                {account.employeeCode} · {account.email}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Employment"
            description="Managed by HR. Contact them if something is wrong."
            as="h2"
          />
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-caption text-ink-subtle">Employee ID</dt>
              <dd className="text-body-sm text-ink">{account.employeeCode}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-subtle">Designation</dt>
              <dd className="text-body-sm text-ink">{account.designation}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-subtle">Primary division</dt>
              <dd className="text-body-sm text-ink">{account.primaryDivisionId.toUpperCase()}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-subtle">Divisions in scope</dt>
              <dd className="text-body-sm text-ink">{account.scopedDivisionIds.length}</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <CardHeader title="Contact and preferences" as="h2" />
          <div className="mt-3 flex flex-col gap-4">
            <Field label="Phone" helperText="Visible to your Team Lead and HR.">
              <Input
                value={phone}
                onChange={(event) => {
                  setPhone(event.target.value);
                  setDirty(true);
                }}
              />
            </Field>

            <Field label="Normal work mode" helperText="The location pre-selected on new entries.">
              <Select
                value={workMode}
                onChange={(event) => {
                  setWorkMode(event.target.value);
                  setDirty(true);
                }}
                options={Object.entries(WORK_LOCATION_LABEL).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </Field>

            <Field
              label="Table density"
              helperText="Compact fits more rows without changing touch-target sizes."
            >
              <Select
                value={density}
                onChange={(event) => {
                  setDensity(event.target.value);
                  setDirty(true);
                }}
                options={[
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'dense', label: 'Compact' },
                ]}
              />
            </Field>
          </div>
        </Card>

        {dirty && (
          <StickyActionBar>
            <Button variant="ghost" onClick={() => setDirty(false)}>
              Discard
            </Button>
            <Button
              variant="primary"
              iconLeading={<Check aria-hidden className="size-4" />}
              onClick={() => {
                setDirty(false);
                toast.show({ tone: 'success', title: 'Preferences saved' });
              }}
            >
              Save changes
            </Button>
          </StickyActionBar>
        )}
      </div>
    </PageContainer>
  );
}
