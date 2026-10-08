'use client';

import * as React from 'react';
import type { DepartmentCatalogueRowView } from '@/contracts/organization-hierarchy';
import { departmentAdminService as mockDepartmentAdminService } from '@/services/runtime/department-admin';
import { useAsync } from '@/lib/use-async';
import { Dialog } from '@/components/feedback/overlay';
import { Alert, Callout } from '@/components/feedback/alert';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, RadioGroup, Select, Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import {
  NO_FORM_FAILURE,
  fieldErrorFor,
  toFormFailure,
  type DepartmentFormFailure,
} from './department-shared';

/**
 * Appoint a department lead (`OH-FE-0204`, `OH-FE-0205`).
 *
 * The two flows the milestone asks for are one stored record with two start
 * dates, so the form asks which of them the administrator means rather than
 * leaving a bare date field to be guessed at: **effective now** starts today,
 * **scheduled** starts on a later date and the current lead stays in force
 * until then.
 *
 * Eligibility is re-asked whenever the date changes, because an assignment that
 * has ended by then no longer makes someone eligible. The list is the service's
 * answer — this dialog never filters it — and a selection that the new date
 * invalidates is cleared rather than submitted.
 */
export function AppointLeadDialog({
  open,
  userId,
  today,
  department,
  onClose,
  onSaved,
}: {
  open: boolean;
  userId: string;
  today: string;
  department: DepartmentCatalogueRowView | null;
  onClose: () => void;
  onSaved: (message: string, description: string) => void;
}) {
  /*
   * Mounted only while it is open, so each opening starts from a clean form and
   * the eligibility request is never made for a department nobody is looking at.
   * The overlay restores focus to the control that opened it on unmount.
   */
  if (!open || !department) return null;
  return (
    <AppointLeadDialogBody
      userId={userId}
      today={today}
      department={department}
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}

function AppointLeadDialogBody({
  userId,
  today,
  department,
  onClose,
  onSaved,
}: {
  userId: string;
  today: string;
  department: DepartmentCatalogueRowView;
  onClose: () => void;
  onSaved: (message: string, description: string) => void;
}) {
  const departmentId = department.department.id;

  const [timing, setTiming] = React.useState<'now' | 'scheduled'>('now');
  const [scheduledFrom, setScheduledFrom] = React.useState('');
  const [leadEmployeeId, setLeadEmployeeId] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [failure, setFailure] = React.useState<DepartmentFormFailure>(NO_FORM_FAILURE);
  const [saving, setSaving] = React.useState(false);

  const effectiveFrom = timing === 'now' ? today : scheduledFrom;

  /*
   * A malformed or empty scheduled date is not sent to the service as a query:
   * eligibility is asked for the date that would be saved, and until there is
   * one the list stays on today's answer.
   */
  const queryDate = /^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ? effectiveFrom : today;

  const eligible = useAsync(
    () => mockDepartmentAdminService.listEligibleLeads(userId, departmentId, queryDate),
    [userId, departmentId, queryDate],
  );

  const options = eligible.state.status === 'success' ? eligible.state.data : [];

  /*
   * `OH-FE-0204`. A candidate chosen for one date may not be eligible on
   * another, so the selection is cleared when the list it came from changes and
   * no longer contains it — the same rule the Meeting Minutes form applies to a
   * project when its client changes.
   */
  const optionsKey = `${queryDate}|${options.map((option) => option.value).join(',')}`;
  const [lastOptionsKey, setLastOptionsKey] = React.useState(optionsKey);
  if (optionsKey !== lastOptionsKey) {
    setLastOptionsKey(optionsKey);
    if (
      leadEmployeeId &&
      eligible.state.status === 'success' &&
      !options.some((option) => option.value === leadEmployeeId)
    ) {
      setLeadEmployeeId('');
    }
  }

  async function save() {
    setSaving(true);
    setFailure(NO_FORM_FAILURE);
    const result = await mockDepartmentAdminService.appointLead(userId, {
      departmentId: department.department.id,
      leadEmployeeId,
      effectiveFrom,
      reason,
    });
    setSaving(false);

    if (result.status === 'success') {
      const appointed = result.data.scheduledAppointment ?? result.data.currentAppointment;
      onSaved(
        'Lead appointed',
        result.warnings?.[0]?.message ??
          `${appointed?.lead.fullName ?? 'The lead'} leads ${result.data.department.name} from ${appointed?.effectiveFromLabel ?? 'today'}.`,
      );
      return;
    }
    setFailure(toFormFailure(result));
  }

  const listFailure =
    eligible.state.status === 'failure' ? toFormFailure(eligible.state.failure) : null;
  const noneEligible = eligible.state.status === 'success' && options.length === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Appoint a lead for ${department.department.name}`}
      description="One employee leads a department at a time. The outgoing appointment is closed the day before the new one starts, and nothing already recorded is changed."
      dismissOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={noneEligible || eligible.state.status === 'loading'}
            onClick={save}
          >
            Appoint lead
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormErrorSummary errors={failure.fieldErrors} title="The appointment was not saved" />

        {failure.blocking && (
          <Alert tone="danger" title={failure.blocking.title} live>
            {failure.blocking.detail}
          </Alert>
        )}

        {department.currentAppointment && (
          <Callout tone="info">
            {department.currentAppointment.lead.fullName} leads this department from{' '}
            {department.currentAppointment.effectiveFromLabel}. That period is kept as recorded.
          </Callout>
        )}

        <Field label="When the appointment takes effect" required>
          <RadioGroup
            name="appointment-timing"
            legend="When the appointment takes effect"
            hideLegend
            value={timing}
            onValueChange={(value) => setTiming(value === 'scheduled' ? 'scheduled' : 'now')}
            options={[
              {
                value: 'now',
                label: 'Effective now',
                description: `Starts today. The new lead takes over immediately.`,
              },
              {
                value: 'scheduled',
                label: 'Scheduled for a later date',
                description: 'The current lead stays in force until that date.',
              },
            ]}
          />
        </Field>

        {timing === 'scheduled' && (
          <Field
            label="Effective from"
            required
            error={fieldErrorFor(failure, 'effectiveFrom')}
            helperText="A later date than today. An appointment cannot start in the past."
          >
            <Input
              name="effectiveFrom"
              type="date"
              min={today}
              value={scheduledFrom}
              onChange={(event) => setScheduledFrom(event.target.value)}
            />
          </Field>
        )}

        <Field
          label="Lead"
          required
          error={fieldErrorFor(failure, 'leadEmployeeId') ?? fieldErrorFor(failure, 'departmentId')}
          disabled={eligible.state.status === 'loading' || noneEligible}
          helperText={
            eligible.state.status === 'loading'
              ? 'Checking who is eligible on that date.'
              : 'Active employees with an effective assignment in this division.'
          }
        >
          <Select
            name="leadEmployeeId"
            value={leadEmployeeId}
            placeholder="Select an employee"
            options={options.map((option) => ({ value: option.value, label: option.label }))}
            onChange={(event) => setLeadEmployeeId(event.target.value)}
          />
        </Field>

        {noneEligible && (
          <Alert tone="warning" title="Nobody is eligible on that date">
            A lead must be an active employee with an effective assignment in this division. Place an
            employee in the division first, or choose another date.
          </Alert>
        )}

        {listFailure?.blocking && (
          <Alert tone="danger" title={listFailure.blocking.title} live>
            {listFailure.blocking.detail}
          </Alert>
        )}

        <Field
          label="Reason"
          error={fieldErrorFor(failure, 'reason')}
          helperText="Optional. Up to 200 characters, kept with the appointment."
        >
          <Textarea
            name="reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
