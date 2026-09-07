'use client';

import * as React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { HrRequestRowView } from '@/contracts/hr';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { MultiSelectFilter, FilterBar } from '@/components/data/filters';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { CompanyScope, DIVISION_OPTIONS, HrLoading, HrResultFallback, SensitiveBadge } from './shared';

function stateTone(state: HrRequestRowView['state']): BadgeTone {
  if (state === 'approved') return 'success';
  if (state === 'rejected') return 'danger';
  if (state === 'information_requested') return 'warning';
  return state === 'pending' ? 'accent' : 'neutral';
}

const STATE_TABS = [
  { key: 'pending', label: 'Pending' },
  { key: 'information_requested', label: 'Information requested' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'all', label: 'All' },
];

/**
 * The decision dialog.
 *
 * When a Team Lead has already decided, this becomes an *override*: the reason
 * field is required, the previous outcome stays on screen, and the service
 * refuses the change without both the permission and the reason
 * (`REQ-WFH-004`, `REQ-ATT-006`). An override that quietly replaced a decision
 * with no trace would be the defect this screen exists to prevent.
 */
function DecisionDialog({
  request,
  open,
  onClose,
  onDecided,
}: {
  request: HrRequestRowView | null;
  open: boolean;
  onClose: () => void;
  onDecided: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [outcome, setOutcome] =
    React.useState<'approved' | 'rejected' | 'information_requested'>('approved');
  const [comment, setComment] = React.useState('');
  const [overrideReason, setOverrideReason] = React.useState('');
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [denialMessage, setDenialMessage] = React.useState<string | null>(null);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const seedKey = open && request ? request.id : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setOutcome('approved');
    setComment('');
    setOverrideReason('');
    setErrors([]);
    setDenialMessage(null);
  }

  if (!request) return null;
  const isOverride = request.state === 'approved' || request.state === 'rejected';

  async function submit() {
    const result = await mockHrService.decideRequest({
      userId: user?.userId ?? '',
      kind: request!.kind,
      id: request!.id,
      outcome,
      comment,
      overrideReason: overrideReason || null,
    });
    if (result.status === 'success') {
      onDecided();
      onClose();
      toast.show({
        tone: 'success',
        title: isOverride ? 'Decision overridden and recorded' : 'Request decision recorded',
        description: `${request!.employee.fullName} will receive the outcome without protected details.`,
      });
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(
        result.fieldErrors.map((error) => ({
          field: error.field,
          message: `${error.message} ${error.guidance}`,
        })),
      );
      return;
    }
    if (result.status === 'permission_denied') {
      setDenialMessage(`${result.message} ${result.guidance ?? ''}`.trim());
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isOverride ? 'Override the existing decision' : 'Record a decision'}
      description={`${request.employee.fullName} · ${request.dateLabel} · ${request.portionLabel}`}
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            {isOverride ? 'Override and notify' : 'Confirm and notify'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        {denialMessage && (
          <Alert tone="danger" title="Override not permitted" live>
            {denialMessage}
          </Alert>
        )}

        {isOverride && (
          <Alert tone="warning" title="This replaces a decision that has already been made">
            The current outcome is <strong>{request.stateLabel}</strong>
            {request.decisionLabel ? ` (${request.decisionLabel})` : ''}. The override, its reason
            and the previous outcome are stored in the audit history and shown to the Team Lead.
          </Alert>
        )}

        <Field label="Outcome">
          <Select
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as typeof outcome)}
            options={[
              { value: 'approved', label: 'Approve request' },
              { value: 'information_requested', label: 'Request information' },
              { value: 'rejected', label: 'Reject request' },
            ]}
          />
        </Field>

        <Field
          label="Comment to the employee"
          helperText="Included in the notification and the decision history."
        >
          <Textarea rows={3} value={comment} onChange={(event) => setComment(event.target.value)} />
        </Field>

        {isOverride && (
          <Field
            label="Override reason"
            required
            error={errors.find((error) => error.field === 'overrideReason')?.message}
            helperText="Recorded permanently. It cannot be edited later."
          >
            <Textarea
              rows={3}
              name="overrideReason"
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
            />
          </Field>
        )}

        <div className="rounded-md border border-accent-border bg-accent-subtle p-3">
          <p className="text-body-sm font-semibold text-ink">Notification preview</p>
          <p className="mt-1 text-caption text-ink-muted">
            {request.employee.fullName} receives the outcome, the request date and your comment.
            No protected division or cost detail is included.
          </p>
        </div>
      </div>
    </Dialog>
  );
}

function RequestCard({
  request,
  onDecide,
}: {
  request: HrRequestRowView;
  onDecide: (request: HrRequestRowView) => void;
}) {
  const isOverride = request.state === 'approved' || request.state === 'rejected';
  return (
    <Card className="h-full">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 text-ink">{request.employee.fullName}</h3>
          <p className="text-caption text-ink-muted">
            {request.employee.employeeCode} · {request.division.code}
            {request.division.isRestricted && ' · Restricted division'}
          </p>
        </div>
        <Badge tone={stateTone(request.state)}>{request.stateLabel}</Badge>
      </div>

      <p className="mt-3 text-body-sm font-medium text-ink">
        {request.dateLabel} · {request.portionLabel}
        {request.leaveTypeLabel ? ` · ${request.leaveTypeLabel}` : ''}
      </p>
      <p className="mt-1 text-body-sm text-ink-muted">{request.reason}</p>
      {request.plannedWork && (
        <p className="mt-2 text-caption text-ink-muted">Planned: {request.plannedWork}</p>
      )}

      {request.conflictNote && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {request.conflictNote}
        </p>
      )}

      {request.completedWorkPreview.length > 0 && (
        <div className="mt-3 rounded-md border border-border bg-surface-sunken p-3">
          <p className="text-label text-ink-muted">Completed work on the approved day</p>
          <ul className="mt-2 space-y-1">
            {request.completedWorkPreview.map((entry, index) => (
              <li key={`${entry.label}-${index}`} className="text-caption text-ink">
                <span className="font-semibold">{entry.label}</span> ·{' '}
                <Duration value={entry.duration} /> · {entry.completedWork}
              </li>
            ))}
          </ul>
        </div>
      )}

      {request.decisionLabel && (
        <p className="mt-3 text-caption text-ink-muted">{request.decisionLabel}</p>
      )}
      {request.overrideReason && (
        <div className="mt-2 rounded-md border border-undertime-border bg-undertime-surface p-2 text-caption text-undertime">
          <strong>Audited HR override:</strong> {request.overrideReason}
          {request.previousOutcomeLabel && ` (previously ${request.previousOutcomeLabel})`}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          variant={isOverride ? 'secondary' : 'primary'}
          size="sm"
          onClick={() => onDecide(request)}
          iconLeading={isOverride ? <ShieldAlert aria-hidden className="size-4" /> : undefined}
        >
          {isOverride ? 'Override decision' : 'Record decision'}
        </Button>
        {isOverride && <SensitiveBadge label="Needs HR override permission" />}
      </div>
    </Card>
  );
}

/** FE-0511 and FE-0512 — WFH and leave administration. */
export function RequestAdministration({ kind }: { kind: 'wfh' | 'leave' }) {
  const { user } = useSession();
  const [tab, setTab] = React.useState('pending');
  const [divisionIds, setDivisionIds] = React.useState<readonly string[]>([]);
  const [selected, setSelected] = React.useState<HrRequestRowView | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const { state, reload } = useAsync(
    () => mockHrService.listRequests(user?.userId ?? '', kind),
    [user?.userId, kind],
    { keepPrevious: true },
  );
  const { state: summaryState } = useAsync(
    () => mockHrService.listDivisionRequestSummary(user?.userId ?? '', kind),
    [user?.userId, kind],
  );
  const { state: balanceState } = useAsync(
    () => (kind === 'leave' ? mockHrService.listLeaveBalances(user?.userId ?? '') : Promise.resolve({ status: 'success' as const, data: [] })),
    [user?.userId, kind],
  );

  if (state.status === 'loading') return <HrLoading label={kind === 'wfh' ? 'WFH requests' : 'leave requests'} />;
  if (state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject={kind === 'wfh' ? 'WFH requests' : 'Leave requests'} />;
  }

  const all = state.data;
  const filtered = all
    .filter((request) => tab === 'all' || request.state === tab)
    .filter((request) => divisionIds.length === 0 || divisionIds.includes(request.division.id));

  const tabs = STATE_TABS.map((item) => ({
    ...item,
    badgeCount:
      item.key === 'all' ? undefined : all.filter((request) => request.state === item.key).length,
  }));

  return (
    <PageContainer width="full">
      <PageHeader
        title={kind === 'wfh' ? 'Work From Home administration' : 'Leave administration'}
        description={
          kind === 'wfh'
            ? 'Requests across every division, employee history, decisions, completed-work review and audited overrides.'
            : 'Balances, request review, half-day handling, conflicts and audited overrides.'
        }
        meta={<CompanyScope />}
      />

      {kind === 'leave' && balanceState.status === 'success' && balanceState.data.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title="Leave balances"
            description="Entitled, consumed, reserved and remaining days for the current year."
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-body-sm">
              <caption className="sr-only">Leave balances by employee and leave type</caption>
              <thead>
                <tr className="text-left text-caption text-ink-muted">
                  <th scope="col" className="p-2">Employee</th>
                  <th scope="col" className="p-2">Type</th>
                  <th scope="col" className="p-2 text-right">Entitled</th>
                  <th scope="col" className="p-2 text-right">Consumed</th>
                  <th scope="col" className="p-2 text-right">Reserved</th>
                  <th scope="col" className="p-2 text-right">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {balanceState.data.map((balance) => (
                  <tr
                    key={`${balance.employee.id}-${balance.leaveType}`}
                    className="border-t border-border"
                  >
                    <td className="p-2 text-ink">{balance.employee.fullName}</td>
                    <td className="p-2 text-ink-muted">{balance.typeLabel}</td>
                    <td className="p-2 text-right text-ink tabular">{balance.entitledDays}</td>
                    <td className="p-2 text-right text-ink tabular">{balance.consumedDays}</td>
                    <td className="p-2 text-right text-ink tabular">{balance.reservedDays}</td>
                    <td className="p-2 text-right font-semibold text-ink tabular">
                      {balance.remainingDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {summaryState.status === 'success' && summaryState.data.length > 0 && (
        <Card className="mt-5">
          <CardHeader
            title="Division summary"
            description={`${kind === 'wfh' ? 'WFH' : 'Leave'} requests by division.`}
          />
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {summaryState.data.map((summary) => (
              <li key={summary.division.id} className="rounded-md border border-border p-3">
                <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
                  {summary.division.name}
                  {summary.division.isRestricted && <Badge tone="warning">Restricted</Badge>}
                </p>
                <p className="mt-1 text-caption text-ink-muted">
                  {summary.pending} pending · {summary.approved} approved · {summary.rejected}{' '}
                  rejected · {summary.totalDays} day(s)
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Tabs
        className="mt-5"
        items={tabs}
        activeKey={tab}
        onChange={setTab}
        label={`${kind === 'wfh' ? 'WFH' : 'Leave'} request states`}
      />

      <FilterBar
        className="mt-4"
        applied={divisionIds.map((id) => ({
          key: id,
          label: 'Division',
          value: DIVISION_OPTIONS.find((option) => option.value === id)?.label ?? id,
          onRemove: () => setDivisionIds(divisionIds.filter((item) => item !== id)),
        }))}
        onClearAll={() => setDivisionIds([])}
        resultSummary={`${filtered.length} request${filtered.length === 1 ? '' : 's'}`}
      >
        <MultiSelectFilter
          label="Division"
          options={DIVISION_OPTIONS}
          selected={divisionIds}
          onChange={setDivisionIds}
        />
      </FilterBar>

      <Callout tone="info" className="mt-4">
        Replacing a decision a Team Lead has already made is an override: it needs the HR override
        permission and a recorded reason, and both stay visible on the request.
      </Callout>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onDecide={(item) => {
              setSelected(item);
              setDialogOpen(true);
            }}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <EmptyState
          className="mt-5"
          variant="no-results"
          title="No requests in this view"
          description="Change the state tab or clear the division filter."
        />
      )}

      <DecisionDialog
        request={selected}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onDecided={reload}
      />
    </PageContainer>
  );
}
