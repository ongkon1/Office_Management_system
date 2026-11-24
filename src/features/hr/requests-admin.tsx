'use client';

import * as React from 'react';
import { AlertTriangle, CalendarPlus, ShieldAlert } from 'lucide-react';
import type { AddLeaveBalanceInput, HrRequestRowView, LeaveBalanceFormOptions } from '@/contracts/hr';
import { hrService as mockHrService } from '@/services/runtime/hr';
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
import { DateInput, NumberInput, Select, Textarea } from '@/components/forms/inputs';
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

function AddLeaveBalanceDialog({
  open,
  options,
  onClose,
  onSaved,
}: {
  open: boolean;
  options: LeaveBalanceFormOptions;
  onClose: () => void;
  onSaved: (year: number) => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [employeeId, setEmployeeId] = React.useState('');
  const [leaveType, setLeaveType] = React.useState<AddLeaveBalanceInput['leaveType']>('annual');
  const [year, setYear] = React.useState(options.defaultYear);
  const [days, setDays] = React.useState(1);
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const seedKey = open ? `${options.defaultYear}:${options.employees[0]?.id ?? ''}:${options.leaveTypes[0]?.value ?? ''}` : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setEmployeeId(options.employees[0]?.id ?? '');
    setLeaveType(options.leaveTypes[0]?.value ?? 'annual');
    setYear(options.defaultYear);
    setDays(1);
    setReason('');
    setErrors([]);
    setSaving(false);
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  async function submit() {
    setSaving(true);
    setErrors([]);
    const result = await mockHrService.addLeaveBalance({
      userId: user?.userId ?? '', employeeId, leaveType, year, days, reason,
    });
    setSaving(false);
    if (result.status === 'success') {
      onSaved(year);
      onClose();
      toast.show({
        tone: 'success', title: 'Leave balance added',
        description: `${days} day${days === 1 ? '' : 's'} added to ${result.data.employee.fullName}'s ${result.data.typeLabel} balance.`,
      });
      return;
    }
    if (result.status === 'validation_failure') {
      setErrors(result.fieldErrors.map(error => ({ field: error.field, message: `${error.message} ${error.guidance}` })));
      return;
    }
    setErrors([{ field: 'form', message: result.message }]);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add leave balance"
      description="Add entitlement without changing leave already consumed or reserved."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} loading={saving}>Add balance</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        <Field label="Employee" required error={fieldError('employeeId')}>
          <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} options={options.employees.map(employee => ({ value: employee.id, label: `${employee.fullName} · ${employee.employeeCode}` }))} />
        </Field>
        <Field label="Leave type" required error={fieldError('leaveType')}>
          <Select value={leaveType} onChange={(event) => setLeaveType(event.target.value as AddLeaveBalanceInput['leaveType'])} options={options.leaveTypes} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Year" required error={fieldError('year')}>
            <NumberInput min={2000} max={2100} step={1} value={year} onChange={(event) => setYear(Number(event.target.value))} />
          </Field>
          <Field label="Days to add" required error={fieldError('days')} helperText="Full-day or half-day amounts, for example 10 or 2.5.">
            <NumberInput min={0.5} max={366} step={0.5} value={days} onChange={(event) => setDays(Number(event.target.value))} />
          </Field>
        </div>
        <Field label="Reason" required error={fieldError('reason')} helperText="Stored permanently in the audit log.">
          <Textarea name="reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Callout tone="info">If a balance already exists for this employee, leave type and year, these days are added to its current entitlement.</Callout>
      </div>
    </Dialog>
  );
}

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
  const [approvalMode, setApprovalMode] = React.useState<'full' | 'reduced'>('full');
  const [approvedStartDate, setApprovedStartDate] = React.useState('');
  const [approvedEndDate, setApprovedEndDate] = React.useState('');
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [denialMessage, setDenialMessage] = React.useState<string | null>(null);
  const [seededFor, setSeededFor] = React.useState<string | null>(null);

  const seedKey = open && request ? request.id : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setOutcome('approved');
    setComment('');
    setOverrideReason('');
    setApprovalMode('full');
    setApprovedStartDate(request?.requestedStartDate ?? '');
    setApprovedEndDate(request?.requestedEndDate ?? '');
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
      approvedStartDate:
        request!.kind === 'leave' && outcome === 'approved' && approvalMode === 'reduced'
          ? approvedStartDate
          : undefined,
      approvedEndDate:
        request!.kind === 'leave' && outcome === 'approved' && approvalMode === 'reduced'
          ? approvedEndDate
          : undefined,
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
          <Button
            variant="primary"
            onClick={submit}
            disabled={
              request.kind === 'leave' && outcome === 'approved' && approvalMode === 'reduced' &&
              (!approvedStartDate || !approvedEndDate || approvedEndDate < approvedStartDate || !comment.trim())
            }
          >
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

        {request.kind === 'leave' && outcome === 'approved' && (
          <div className="space-y-4 rounded-md border border-border bg-surface-sunken p-4">
            <Field
              label="Leave to approve"
              helperText="The employee's original request remains unchanged in the history."
            >
              <Select
                value={approvalMode}
                onChange={(event) => {
                  const mode = event.target.value as 'full' | 'reduced';
                  setApprovalMode(mode);
                  if (mode === 'full') {
                    setApprovedStartDate(request.requestedStartDate);
                    setApprovedEndDate(request.requestedEndDate);
                  }
                }}
                options={[
                  { value: 'full', label: `Approve full request (${request.requestedDateLabel})` },
                  { value: 'reduced', label: 'Approve a shorter period' },
                ]}
              />
            </Field>
            {approvalMode === 'reduced' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Approved from"
                  required
                  error={errors.find((error) => error.field === 'approvedStartDate')?.message}
                >
                  <DateInput
                    value={approvedStartDate}
                    min={request.requestedStartDate}
                    max={request.requestedEndDate}
                    onChange={(event) => setApprovedStartDate(event.target.value)}
                  />
                </Field>
                <Field
                  label="Approved through"
                  required
                  error={errors.find((error) => error.field === 'approvedEndDate')?.message}
                >
                  <DateInput
                    value={approvedEndDate}
                    min={approvedStartDate || request.requestedStartDate}
                    max={request.requestedEndDate}
                    onChange={(event) => setApprovedEndDate(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        )}

        <Field
          label="Comment to the employee"
          required={request.kind === 'leave' && outcome === 'approved' && approvalMode === 'reduced'}
          error={errors.find((error) => error.field === 'comment')?.message}
          helperText={
            request.kind === 'leave' && outcome === 'approved' && approvalMode === 'reduced'
              ? 'Required: explain why the approved period is shorter.'
              : 'Included in the notification and the decision history.'
          }
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
      {request.kind === 'leave' && request.approvedDateLabel && (
        <p className="mt-1 text-caption font-medium text-success">
          Approved: {request.approvedDateLabel}
          {request.approvedDays !== null ? ` · ${request.approvedDays} day${request.approvedDays === 1 ? '' : 's'}` : ''}
        </p>
      )}
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
  const canAddLeaveBalance = user?.roles.includes('super_admin') ?? false;
  const [tab, setTab] = React.useState('pending');
  const [divisionIds, setDivisionIds] = React.useState<readonly string[]>([]);
  const [selected, setSelected] = React.useState<HrRequestRowView | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [balanceDialogOpen, setBalanceDialogOpen] = React.useState(false);
  const [balanceYear, setBalanceYear] = React.useState(() => new Date().getFullYear());

  const { state, reload } = useAsync(
    () => mockHrService.listRequests(user?.userId ?? '', kind),
    [user?.userId, kind],
    { keepPrevious: true },
  );
  const { state: summaryState } = useAsync(
    () => mockHrService.listDivisionRequestSummary(user?.userId ?? '', kind),
    [user?.userId, kind],
  );
  const { state: balanceState, reload: reloadBalances } = useAsync(
    () => (kind === 'leave' ? mockHrService.listLeaveBalances(user?.userId ?? '', balanceYear) : Promise.resolve({ status: 'success' as const, data: [] })),
    [user?.userId, kind, balanceYear],
  );
  const { state: balanceOptionsState } = useAsync(
    () => canAddLeaveBalance
      ? mockHrService.getLeaveBalanceFormOptions(user?.userId ?? '')
      : Promise.resolve({ status: 'success' as const, data: { employees: [], leaveTypes: [], defaultYear: new Date().getFullYear() } }),
    [user?.userId, canAddLeaveBalance],
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
        actions={kind === 'leave' && canAddLeaveBalance ? (
          <Button
            variant="primary"
            onClick={() => setBalanceDialogOpen(true)}
            disabled={balanceOptionsState.status !== 'success' || balanceOptionsState.data.employees.length === 0}
            iconLeading={<CalendarPlus aria-hidden className="size-4" />}
          >
            Add leave balance
          </Button>
        ) : undefined}
      />

      {kind === 'leave' && balanceState.status === 'success' && (
        <Card className="mt-5">
          <CardHeader
            title="Leave balances"
            description={`Entitled, consumed, reserved and remaining days for ${balanceYear}.`}
            actions={
              <Select
                aria-label="Leave balance year"
                value={String(balanceYear)}
                onChange={(event) => setBalanceYear(Number(event.target.value))}
                options={[balanceYear - 1, balanceYear, balanceYear + 1].map(year => ({ value: String(year), label: String(year) }))}
              />
            }
          />
          {balanceState.data.length > 0 ? <div className="mt-4 overflow-x-auto">
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
          </div> : (
            <EmptyState
              className="mt-4"
              title={`No leave balances for ${balanceYear}`}
              description={canAddLeaveBalance ? 'Use Add leave balance to create the first entitlement for this year.' : 'No entitlement has been assigned for this year.'}
            />
          )}
        </Card>
      )}

      {kind === 'leave' && canAddLeaveBalance && balanceOptionsState.status === 'success' && (
        <AddLeaveBalanceDialog
          open={balanceDialogOpen}
          options={balanceOptionsState.data}
          onClose={() => setBalanceDialogOpen(false)}
          onSaved={(year) => {
            if (year === balanceYear) reloadBalances();
            else setBalanceYear(year);
          }}
        />
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
