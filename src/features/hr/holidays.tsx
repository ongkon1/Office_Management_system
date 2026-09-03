'use client';

import * as React from 'react';
import { CalendarPlus } from 'lucide-react';
import type { HolidayFormInput, HolidayView } from '@/contracts/hr';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field, FormErrorSummary } from '@/components/forms/field';
import { Input, Select, Switch } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CompanyScope, DIVISION_OPTIONS, HrLoading, HrResultFallback } from './shared';

const SCOPE_OPTIONS = [
  { value: 'company', label: 'Company-wide' },
  { value: 'division', label: 'Division-specific' },
  { value: 'weekly', label: 'Weekly (repeats)' },
];

const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];

const EMPTY: HolidayFormInput = {
  name: '',
  scope: 'company',
  divisionId: null,
  date: '2026-10-01',
  weekday: null,
};

function HolidaySection({
  title,
  description,
  holidays,
  onToggle,
}: {
  title: string;
  description: string;
  holidays: readonly HolidayView[];
  onToggle: (holiday: HolidayView) => void;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <ul className="mt-4 space-y-2">
        {holidays.map((holiday) => (
          <li
            key={holiday.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
          >
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                {holiday.name}
                {!holiday.isActive && <Badge tone="neutral">Inactive</Badge>}
                {holiday.division?.isRestricted && <Badge tone="warning">Restricted</Badge>}
              </span>
              <span className="block text-caption text-ink-muted">
                {holiday.dateLabel ?? `Every ${holiday.weekdayLabel}`} · {holiday.scopeLabel} ·{' '}
                {holiday.affectedEmployeeCount} employee(s) affected
              </span>
            </span>
            <Switch
              checked={holiday.isActive}
              onCheckedChange={() => onToggle(holiday)}
              label="Active"
            />
          </li>
        ))}
        {holidays.length === 0 && (
          <li className="text-body-sm text-ink-muted">None configured.</li>
        )}
      </ul>
    </Card>
  );
}

/**
 * FE-0513 — holiday administration.
 *
 * A holiday changes what counts as a required working day, which is why
 * deactivating one is a switch with an immediate effect rather than a delete:
 * removing the record would make past days that were exempt look missing.
 */
export function HolidayAdministration() {
  const { user } = useSession();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<HolidayFormInput>(EMPTY);
  const [errors, setErrors] = React.useState<readonly { field: string; message: string }[]>([]);

  const { state, reload } = useAsync(
    () => mockHrService.listHolidays(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status === 'loading') return <HrLoading label="holiday calendars" />;
  if (state.status !== 'success') return <HrResultFallback result={state.failure} subject="Holidays" />;

  const holidays = state.data;

  async function save() {
    const result = await mockHrService.saveHoliday(user?.userId ?? '', form);
    if (result.status === 'success') {
      setOpen(false);
      setErrors([]);
      setForm(EMPTY);
      reload();
      toast.show({
        tone: 'success',
        title: 'Holiday saved',
        description: 'Days covered by an active holiday are not treated as missing timesheets.',
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

  async function toggle(holiday: HolidayView) {
    const result = await mockHrService.setHolidayActive(
      user?.userId ?? '',
      holiday.id,
      !holiday.isActive,
    );
    if (result.status === 'success') {
      reload();
      toast.show({
        tone: 'info',
        title: holiday.isActive ? 'Holiday deactivated' : 'Holiday activated',
        description: `${holiday.name} now ${holiday.isActive ? 'does not affect' : 'affects'} required working days.`,
      });
    }
  }

  const fieldError = (field: string) => errors.find((error) => error.field === field)?.message;

  return (
    <PageContainer>
      <PageHeader
        title="Holidays"
        description="Company-wide, division-specific and weekly holiday calendars."
        meta={<CompanyScope />}
        actions={
          <Button
            variant="primary"
            onClick={() => setOpen(true)}
            iconLeading={<CalendarPlus aria-hidden className="size-4" />}
          >
            Add holiday
          </Button>
        }
      />

      <Callout tone="info" className="mt-5">
        A day covered by an active holiday is not a required working day, so it is never classified
        as a missing timesheet. Deactivate rather than delete, so past days stay explainable.
      </Callout>

      <div className="mt-5 space-y-5">
        <HolidaySection
          title="Company holidays"
          description="Applies to every division."
          holidays={holidays.filter((holiday) => holiday.scope === 'company')}
          onToggle={toggle}
        />
        <HolidaySection
          title="Division holidays"
          description="Applies only to employees assigned to that division."
          holidays={holidays.filter((holiday) => holiday.scope === 'division')}
          onToggle={toggle}
        />
        <HolidaySection
          title="Weekly holidays"
          description="Repeats on a weekday. These form the weekly off pattern."
          holidays={holidays.filter((holiday) => holiday.scope === 'weekly')}
          onToggle={toggle}
        />
      </div>

      {holidays.length === 0 && (
        <EmptyState className="mt-5" title="No holidays configured" description="Add the first holiday." />
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add holiday"
        description="Company-wide, division-specific or a repeating weekly holiday."
        dismissOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save holiday
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormErrorSummary errors={errors} autoFocus={false} />
          <Field label="Holiday name" required error={fieldError('name')}>
            <Input
              name="name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </Field>
          <Field label="Scope" required>
            <Select
              value={form.scope}
              options={SCOPE_OPTIONS}
              onChange={(event) =>
                setForm({
                  ...form,
                  scope: event.target.value as HolidayFormInput['scope'],
                  divisionId: event.target.value === 'division' ? 'pia' : null,
                  date: event.target.value === 'weekly' ? null : '2026-10-01',
                  weekday: event.target.value === 'weekly' ? 5 : null,
                })
              }
            />
          </Field>
          {form.scope === 'division' && (
            <Field label="Division" required error={fieldError('divisionId')}>
              <Select
                value={form.divisionId ?? 'pia'}
                options={DIVISION_OPTIONS}
                onChange={(event) => setForm({ ...form, divisionId: event.target.value })}
              />
            </Field>
          )}
          {form.scope === 'weekly' ? (
            <Field label="Weekday" required error={fieldError('weekday')}>
              <Select
                value={String(form.weekday ?? 5)}
                options={WEEKDAY_OPTIONS}
                onChange={(event) => setForm({ ...form, weekday: Number(event.target.value) })}
              />
            </Field>
          ) : (
            <Field label="Date" required error={fieldError('date')}>
              <Input
                type="date"
                name="date"
                value={form.date ?? ''}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
              />
            </Field>
          )}
        </div>
      </Dialog>
    </PageContainer>
  );
}
