'use client';

import * as React from 'react';
import { CalendarDays, List } from 'lucide-react';
import type { AttendanceState } from '@/contracts/domain';
import type { HrAttendanceDayView } from '@/contracts/hr';
import { mockHrService } from '@/services/mock/hr';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Card, CardHeader } from '@/components/feedback/card';
import { Callout } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import { CompanyScope, HrLoading, HrResultFallback } from './shared';

/**
 * Attendance tone.
 *
 * Leave, holiday and weekly-off are deliberately *not* negative tones: they are
 * explained non-working days, and colouring them like a failure is exactly the
 * misreading `FE-0514` exists to rule out. Only a genuinely missing timesheet
 * and an unexplained absence read as problems.
 */
const STATE_TONE: Readonly<Record<AttendanceState, BadgeTone>> = {
  office: 'complete',
  wfh: 'info',
  official_travel: 'accent',
  field_duty: 'accent',
  training_duty: 'accent',
  approved_leave: 'neutral',
  half_day_leave: 'undertime',
  absent: 'danger',
  holiday: 'neutral',
  weekly_off: 'neutral',
  missing_timesheet: 'missing',
};

/** Two-letter cell code, so the calendar is readable without colour. */
const STATE_CODE: Readonly<Record<AttendanceState, string>> = {
  office: 'OF',
  wfh: 'WH',
  official_travel: 'TR',
  field_duty: 'FD',
  training_duty: 'TD',
  approved_leave: 'LV',
  half_day_leave: 'HL',
  absent: 'AB',
  holiday: 'HO',
  weekly_off: 'WO',
  missing_timesheet: 'MT',
};

const STATE_CELL_CLASS: Readonly<Record<AttendanceState, string>> = {
  office: 'bg-complete-surface text-complete border-complete-border',
  wfh: 'bg-info-surface text-info border-border',
  official_travel: 'bg-accent-subtle text-accent border-accent-border',
  field_duty: 'bg-accent-subtle text-accent border-accent-border',
  training_duty: 'bg-accent-subtle text-accent border-accent-border',
  approved_leave: 'bg-surface-sunken text-ink-muted border-border',
  half_day_leave: 'bg-undertime-surface text-undertime border-undertime-border',
  absent: 'bg-danger-surface text-danger border-critical-border',
  holiday: 'bg-surface-sunken text-ink-muted border-border',
  weekly_off: 'bg-surface-sunken text-ink-subtle border-border',
  missing_timesheet: 'bg-missing-surface text-missing border-missing-border',
};

function AttendanceCell({ day }: { day: HrAttendanceDayView }) {
  return (
    <Tooltip
      content={`${day.dateLabel}: ${day.stateLabel}${day.exemptionNote ? ` — ${day.exemptionNote}` : ''}`}
    >
      <span
        className={cn(
          'flex min-h-6 min-w-8 items-center justify-center rounded border px-1 py-0.5 text-caption font-semibold',
          STATE_CELL_CLASS[day.state],
        )}
      >
        <span aria-hidden>{STATE_CODE[day.state]}</span>
        <span className="sr-only">
          {day.dateLabel}: {day.stateLabel}
        </span>
      </span>
    </Tooltip>
  );
}

/**
 * FE-0510 and FE-0514 — attendance administration.
 *
 * The list view carries the exemption note in plain text, because the whole
 * point of the requirement is that a reader can tell an explained non-working
 * day from a missing timesheet without decoding a colour.
 */
export function AttendanceAdministration() {
  const { user } = useSession();
  const [view, setView] = React.useState<'calendar' | 'list'>('calendar');
  const { state } = useAsync(
    () => mockHrService.getAttendance(user?.userId ?? '', '2026-08-17', '2026-09-02'),
    [user?.userId],
  );

  if (state.status === 'loading') return <HrLoading label="attendance" />;
  if (state.status !== 'success') return <HrResultFallback result={state.failure} subject="Attendance" />;

  const data = state.data;
  const allDays = data.rows.flatMap((row) => row.days);
  const exempted = allDays.filter((day) => day.exemptionNote !== null);
  const missing = allDays.filter((day) => day.isMissing);
  const halfDays = allDays.filter((day) => day.state === 'half_day_leave');

  return (
    <PageContainer width="full">
      <PageHeader
        title="Attendance"
        description="Office, WFH, travel, field, training, leave, absence, holiday and missing-timesheet states across every division."
        meta={<CompanyScope />}
        actions={
          <>
            <Button
              variant={view === 'calendar' ? 'primary' : 'secondary'}
              onClick={() => setView('calendar')}
              iconLeading={<CalendarDays aria-hidden className="size-4" />}
            >
              Calendar
            </Button>
            <Button
              variant={view === 'list' ? 'primary' : 'secondary'}
              onClick={() => setView('list')}
              iconLeading={<List aria-hidden className="size-4" />}
            >
              List
            </Button>
          </>
        }
      />

      <Card className="mt-5">
        <CardHeader
          title={`States recorded · ${data.rangeLabel}`}
          description="Every state an employee day can carry, counted across the range."
        />
        <ul className="mt-4 flex flex-wrap gap-2">
          {data.stateCounts.map((entry) => (
            <li key={entry.state}>
              <Badge tone={STATE_TONE[entry.state]}>
                {STATE_CODE[entry.state]} · {entry.label}: {entry.count}
              </Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Callout tone="info" className="mt-4">
        Approved leave, half-day leave, holidays and weekly offs are explained non-working states.
        They are never counted as a missing timesheet. In this range {exempted.length} day(s) are
        explained, {halfDays.length} carry a reduced half-day requirement, and {missing.length}{' '}
        are genuinely missing.
      </Callout>

      {view === 'calendar' ? (
        <Card className="mt-5" padding="none">
          <div className="border-b border-border p-4">
            <h2 className="text-h3 text-ink">Attendance calendar</h2>
            <p className="text-caption text-ink-muted">
              Each cell carries a two-letter code and an accessible label, so the state never
              depends on colour alone.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse">
              <caption className="sr-only">
                Attendance by employee and date for {data.rangeLabel}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 z-10 bg-surface p-2 text-left text-caption text-ink-muted"
                  >
                    Employee
                  </th>
                  {data.dates.map((date) => (
                    <th
                      key={date}
                      scope="col"
                      className="p-1 text-center text-caption text-ink-muted"
                    >
                      {date.slice(8)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.employee.id} className="border-t border-border">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface p-2 text-left text-body-sm font-medium text-ink"
                    >
                      {row.employee.fullName}
                    </th>
                    {row.days.map((day) => (
                      <td key={day.date} className="p-1 text-center">
                        <AttendanceCell day={day} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="mt-5 space-y-5">
          {data.rows.map((row) => (
            <Card key={row.employee.id} padding="none">
              <div className="border-b border-border p-4">
                <h2 className="text-h3 text-ink">{row.employee.fullName}</h2>
                <p className="text-caption text-ink-muted">{row.employee.employeeCode}</p>
              </div>
              <ul className="divide-y divide-border">
                {row.days.map((day) => (
                  <li
                    key={day.date}
                    className="flex flex-wrap items-center justify-between gap-3 p-3"
                  >
                    <span className="min-w-0">
                      <span className="block text-body-sm font-medium text-ink">
                        {day.dateLabel}
                      </span>
                      {day.exemptionNote && (
                        <span className="block text-caption text-ink-muted">
                          {day.exemptionNote}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATE_TONE[day.state]}>{day.stateLabel}</Badge>
                      <span className="text-body-sm text-ink">
                        <Duration value={day.active} /> of{' '}
                        <Duration value={day.requiredActive} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
