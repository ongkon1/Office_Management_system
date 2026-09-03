'use client';

import * as React from 'react';
import Link from 'next/link';
import { FileClock, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import type { HrPeriodEmployeeRowView, HrPeriodWorkspaceView } from '@/contracts/hr';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Tabs } from '@/components/feedback/disclosure';
import { DataTable } from '@/components/data/data-table';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Checkbox, Input, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { CompanyScope, HrLoading, HrResultFallback, SensitiveBadge } from './shared';

function statusTone(status: HrPeriodWorkspaceView['status']) {
  if (status === 'verified') return 'success' as const;
  if (status === 'amended') return 'warning' as const;
  if (status === 'pending_verification') return 'accent' as const;
  return 'neutral' as const;
}

/* -------------------------------------------------------------------------- */
/* FE-0521 — verification confirmation                                        */
/* -------------------------------------------------------------------------- */

function VerifyDialog({
  workspace,
  open,
  onClose,
  onVerified,
}: {
  workspace: HrPeriodWorkspaceView;
  open: boolean;
  onClose: () => void;
  onVerified: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [failure, setFailure] = React.useState<string | null>(null);

  const [seededFor, setSeededFor] = React.useState<string | null>(null);
  const seedKey = open ? workspace.periodId : null;
  if (seedKey !== seededFor) {
    setSeededFor(seedKey);
    setAcknowledged(false);
    setFailure(null);
  }

  async function verify() {
    const result = await mockHrService.verifyPeriod({
      userId: user?.userId ?? '',
      periodId: workspace.periodId,
      acknowledgedExceptions: acknowledged,
    });
    if (result.status === 'success') {
      onVerified();
      onClose();
      toast.show({
        tone: 'success',
        title: `${workspace.label} verified and locked`,
        description: 'Time records in this period can now change only through a recorded amendment.',
      });
      return;
    }
    setFailure(
      `${result.status === 'permission_denied' || result.status === 'conflict' ? result.message : 'The period could not be verified.'} ${
        'guidance' in result ? (result.guidance ?? '') : ''
      }`.trim(),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Verify ${workspace.label}?`}
      description="Verification is a payroll action on the whole period, not an approval of any individual day."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={verify}
            disabled={workspace.openExceptionCount > 0 && !acknowledged}
            iconLeading={<Lock aria-hidden className="size-4" />}
          >
            Verify and lock period
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {failure && (
          <Alert tone="danger" title="Could not verify the period" live>
            {failure}
          </Alert>
        )}

        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-caption text-ink-muted">Included dates</dt>
            <dd className="text-body-sm font-medium text-ink">
              {workspace.rangeLabel} ({workspace.includedDateCount} days)
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Policy version applied</dt>
            <dd className="text-body-sm font-medium text-ink">
              Version {workspace.policyVersion}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Employees included</dt>
            <dd className="text-body-sm font-medium text-ink">{workspace.employeeCount}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-muted">Open exceptions</dt>
            <dd className="text-body-sm font-medium text-ink">{workspace.openExceptionCount}</dd>
          </div>
        </dl>

        <Alert tone="warning" title="What locking this period does">
          Time entries, break values and daily totals inside {workspace.rangeLabel} become
          read-only. Employees and Team Leads can still view them. Any later change needs the
          period-amendment permission and is recorded with a reason and before/after values.
        </Alert>

        {workspace.openExceptionCount > 0 && (
          <Checkbox
            label={`Accept the ${workspace.openExceptionCount} remaining exception(s)`}
            description="Missing, under-time and critical days stay recorded as they are and are carried into payroll."
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
        )}
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0522 — unlock request and amendment                                     */
/* -------------------------------------------------------------------------- */

function UnlockDialog({
  workspace,
  open,
  onClose,
  onDone,
}: {
  workspace: HrPeriodWorkspaceView;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);

  async function submit() {
    const result = await mockHrService.requestUnlock({
      userId: user?.userId ?? '',
      periodId: workspace.periodId,
      reason,
    });
    if (result.status === 'success') {
      onDone();
      onClose();
      setReason('');
      toast.show({
        tone: 'info',
        title: 'Unlock requested',
        description: 'The request is recorded against the period with its reason.',
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
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Request unlock for ${workspace.label}`}
      description="An unlock request does not reopen the period by itself; it records what needs changing and why."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Submit unlock request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        <Field
          label="Reason"
          required
          error={errors.find((error) => error.field === 'reason')?.message}
          helperText="Name the record and say why it cannot wait for the next period."
        >
          <Textarea
            rows={4}
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

function AmendDialog({
  workspace,
  open,
  onClose,
  onDone,
}: {
  workspace: HrPeriodWorkspaceView;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useSession();
  const toast = useToast();
  const [employeeId, setEmployeeId] = React.useState(workspace.rows[0]?.employee.id ?? '');
  const [recordLabel, setRecordLabel] = React.useState('');
  const [before, setBefore] = React.useState('');
  const [after, setAfter] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);
  const [failure, setFailure] = React.useState<string | null>(null);

  async function submit() {
    setFailure(null);
    const result = await mockHrService.amendPeriod({
      userId: user?.userId ?? '',
      periodId: workspace.periodId,
      employeeId,
      recordLabel,
      reason,
      before,
      after,
    });
    if (result.status === 'success') {
      onDone();
      onClose();
      setReason('');
      toast.show({
        tone: 'success',
        title: 'Amendment recorded',
        description: 'The period is marked amended and the change is kept with its before and after values.',
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
    setFailure('guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Amend ${workspace.label}`}
      description="An amendment to a verified period is permanent and always carries a reason."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit}>
            Record amendment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormErrorSummary errors={errors} autoFocus={false} />
        {failure && (
          <Alert tone="danger" title="Could not record the amendment" live>
            {failure}
          </Alert>
        )}
        <Field label="Employee" required>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-body-sm text-ink"
          >
            {workspace.rows.map((row) => (
              <option key={row.employee.id} value={row.employee.id}>
                {row.employee.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Record reference" required helperText="For example: Time entry, 23 Jul 2026.">
          <Input value={recordLabel} onChange={(event) => setRecordLabel(event.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Value before">
            <Input value={before} onChange={(event) => setBefore(event.target.value)} />
          </Field>
          <Field label="Value after">
            <Input value={after} onChange={(event) => setAfter(event.target.value)} />
          </Field>
        </div>
        <Field
          label="Amendment reason"
          required
          error={errors.find((error) => error.field === 'reason')?.message}
        >
          <Textarea
            rows={3}
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* FE-0520 — the workspace                                                    */
/* -------------------------------------------------------------------------- */

export function PeriodVerificationWorkspace({ periodId }: { periodId?: string }) {
  const { user } = useSession();
  const [selected, setSelected] = React.useState<string | null>(periodId ?? null);
  const [verifyOpen, setVerifyOpen] = React.useState(false);
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [amendOpen, setAmendOpen] = React.useState(false);

  const { state, reload } = useAsync(
    () => mockHrService.listPeriods(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <HrLoading label="period verification" />;
  if (state.status !== 'success') {
    return <HrResultFallback result={state.failure} subject="Period verification" />;
  }

  const periods = state.data;
  const active =
    periods.find((period) => period.periodId === selected) ??
    periods.find((period) => period.status === 'pending_verification') ??
    periods[0];

  if (!active) {
    return (
      <PageContainer>
        <PageHeader title="Timesheet verification" meta={<CompanyScope />} />
        <Callout tone="info" className="mt-5">
          No payroll period is configured.
        </Callout>
      </PageContainer>
    );
  }

  const isLocked = active.status === 'verified' || active.status === 'amended';

  return (
    <PageContainer width="full">
      <PageHeader
        title="Timesheet verification"
        description="Company-wide completeness, exceptions and unresolved corrections for each payroll period."
        meta={
          <>
            <CompanyScope />
            <Badge tone={statusTone(active.status)}>{active.statusLabel}</Badge>
            <SensitiveBadge label="Needs period-verification permission" />
          </>
        }
        actions={
          <>
            {isLocked && (
              <Button
                variant="secondary"
                onClick={() => setUnlockOpen(true)}
                iconLeading={<LockOpen aria-hidden className="size-4" />}
              >
                Request unlock
              </Button>
            )}
            {active.canAmend && (
              <Button
                variant="secondary"
                onClick={() => setAmendOpen(true)}
                iconLeading={<FileClock aria-hidden className="size-4" />}
              >
                Record amendment
              </Button>
            )}
            <Button
              variant="primary"
              disabled={!active.canVerify}
              onClick={() => setVerifyOpen(true)}
              iconLeading={<ShieldCheck aria-hidden className="size-4" />}
            >
              Verify period
            </Button>
          </>
        }
      />

      <Tabs
        className="mt-5"
        items={periods.map((period) => ({ key: period.periodId, label: period.label }))}
        activeKey={active.periodId}
        onChange={setSelected}
        label="Payroll periods"
      />

      <Callout tone="info" className="mt-4">
        HR verifies a payroll period; Team Leads request corrections on individual days. There is
        no daily approval step anywhere in this product, and verification never approves a single
        time record.
      </Callout>

      {active.blockedReason && (
        <Alert
          className="mt-4"
          tone={isLocked ? 'info' : 'warning'}
          title={isLocked ? 'This period is locked' : 'Verification is blocked'}
        >
          {active.blockedReason}
        </Alert>
      )}

      {active.unlockRequest && (
        <Alert className="mt-4" tone="warning" title={active.unlockRequest.stateLabel}>
          {active.unlockRequest.requestedByLabel} on {active.unlockRequest.requestedAtLabel}:{' '}
          {active.unlockRequest.reason}
        </Alert>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="text-label text-ink-muted">Completeness</p>
          <p className="mt-1 text-metric text-ink">
            {active.completeEmployeeCount} / {active.employeeCount}
          </p>
          <ProgressBar
            className="mt-3"
            value={
              active.employeeCount
                ? Math.round((active.completeEmployeeCount / active.employeeCount) * 100)
                : 0
            }
            label="Employees with no open exception"
            hideLabel
            tone="complete"
          />
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Open exceptions</p>
          <p className="mt-1 text-metric text-ink">{active.openExceptionCount}</p>
          <p className="mt-1 text-caption text-ink-muted">Missing, under-time and critical days.</p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Unresolved corrections</p>
          <p className="mt-1 text-metric text-ink">{active.unresolvedCorrectionCount}</p>
          <p className="mt-1 text-caption text-ink-muted">
            Verification is blocked while any remain.
          </p>
        </Card>
        <Card>
          <p className="text-label text-ink-muted">Period</p>
          <p className="mt-1 text-body font-semibold text-ink">{active.rangeLabel}</p>
          <p className="mt-1 text-caption text-ink-muted">
            {active.includedDateCount} dates · policy version {active.policyVersion}
          </p>
          {active.verifiedAtLabel && (
            <p className="mt-1 text-caption text-ink-muted">
              Verified {active.verifiedAtLabel} by {active.verifiedByLabel}
            </p>
          )}
        </Card>
      </div>

      <DataTable<HrPeriodEmployeeRowView>
        className="mt-5"
        caption={`Employee completeness for ${active.label}`}
        rows={active.rows}
        getRowId={(row) => row.employee.id}
        emptyState={{ title: 'No employees in this period' }}
        columns={[
          {
            key: 'employee',
            header: 'Employee',
            alwaysVisible: true,
            render: (row) => (
              <Link
                href={row.href}
                className="inline-flex min-h-6 items-center font-medium text-ink hover:underline"
              >
                {row.employee.fullName}
              </Link>
            ),
          },
          {
            key: 'completeness',
            header: 'Completeness',
            render: (row) => (
              <span className="flex items-center gap-2">
                <span className="tabular">
                  {row.recordedDays}/{row.requiredDays}
                </span>
                <span className="text-caption text-ink-muted">{row.completenessPercent}%</span>
              </span>
            ),
          },
          {
            key: 'active',
            header: 'Active',
            align: 'right',
            render: (row) => <Duration value={row.active} />,
          },
          {
            key: 'exceptions',
            header: 'Exceptions',
            hideBelow: 'md',
            render: (row) => (
              <span className="flex flex-wrap gap-1">
                {row.missingDays > 0 && <Badge tone="missing">Missing {row.missingDays}</Badge>}
                {row.underTimeDays > 0 && (
                  <Badge tone="undertime">Under-time {row.underTimeDays}</Badge>
                )}
                {row.overtimeDays > 0 && <Badge tone="overtime">Overtime {row.overtimeDays}</Badge>}
                {row.criticalDays > 0 && <Badge tone="critical">Critical {row.criticalDays}</Badge>}
                {row.missingDays + row.underTimeDays + row.overtimeDays + row.criticalDays ===
                  0 && <Badge tone="complete">None</Badge>}
              </span>
            ),
          },
          {
            key: 'corrections',
            header: 'Corrections',
            hideBelow: 'lg',
            render: (row) =>
              row.unresolvedCorrections > 0 ? (
                <Badge tone="warning">{row.unresolvedCorrections} unresolved</Badge>
              ) : (
                <span className="text-ink-muted">None</span>
              ),
          },
          {
            key: 'ready',
            header: 'Ready',
            render: (row) => (
              <Badge tone={row.isReady ? 'success' : 'warning'}>
                {row.isReady ? 'Ready' : 'Needs review'}
              </Badge>
            ),
          },
        ]}
        renderMobileCard={(row) => (
          <div>
            <div className="flex items-start justify-between gap-3">
              <Link href={row.href} className="min-h-6 font-medium text-ink hover:underline">
                {row.employee.fullName}
              </Link>
              <Badge tone={row.isReady ? 'success' : 'warning'}>
                {row.isReady ? 'Ready' : 'Needs review'}
              </Badge>
            </div>
            <p className="mt-1 text-caption text-ink-muted">
              {row.recordedDays}/{row.requiredDays} days · {row.unresolvedCorrections} unresolved
              correction(s)
            </p>
          </div>
        )}
      />

      <Card className="mt-5">
        <CardHeader
          title="Amendment history"
          description="Every change made after verification, with its reason and before and after values."
        />
        <ol className="mt-4 space-y-3">
          {active.amendments.map((amendment) => (
            <li key={amendment.id} className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">
                    {amendment.employeeName} · {amendment.recordLabel}
                  </p>
                  <p className="text-caption text-ink-muted">
                    {amendment.amendedByLabel} · {amendment.amendedAtLabel}
                  </p>
                </div>
                <Badge tone="warning">Amended</Badge>
              </div>
              <p className="mt-2 text-body-sm text-ink">{amendment.reason}</p>
              <ul className="mt-2 space-y-1">
                {amendment.changes.map((change) => (
                  <li key={change.label} className="text-caption text-ink-muted">
                    {change.label}: <span className="line-through">{change.before}</span> →{' '}
                    <span className="font-semibold text-ink">{change.after}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {active.amendments.length === 0 && (
            <li className="text-body-sm text-ink-muted">No amendments recorded.</li>
          )}
        </ol>
      </Card>

      <VerifyDialog
        workspace={active}
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        onVerified={reload}
      />
      <UnlockDialog
        workspace={active}
        open={unlockOpen}
        onClose={() => setUnlockOpen(false)}
        onDone={reload}
      />
      <AmendDialog
        workspace={active}
        open={amendOpen}
        onClose={() => setAmendOpen(false)}
        onDone={reload}
      />
    </PageContainer>
  );
}
