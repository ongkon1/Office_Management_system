'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react';
import type { DayStatus } from '@/contracts/domain';
import type { ClientContributionView, TimesheetDayRowView } from '@/contracts/view-models';
import { cn } from '@/lib/cn';
import { addDays, formatDate, formatMonth, parseIsoDate } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { sumClientContributions } from '@/lib/client-time';
import { ATTENDANCE_LABEL } from '@/lib/status';
import { Button, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader } from '@/components/feedback/card';
import { EmptyState } from '@/components/feedback/alert';
import { Tabs } from '@/components/feedback/disclosure';
import { MultiSelectFilter } from '@/components/data/filters';
import { SearchInput } from '@/components/forms/inputs';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { mockTimesheetService, weekStart } from '@/services/mock/timesheet';
import { ALL_DIVISIONS } from '@/services/mock/organization';
import { DEMO_TODAY } from '@/lib/demo-context';

type ViewMode = 'week' | 'month' | 'calendar' | 'list';

const VIEW_TABS = [
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'list', label: 'List' },
];

/**
 * Filter value standing for time with no client behind it.
 *
 * A client is a free-text label on a project, so "no client" has no id of its
 * own; it still has to be selectable, because otherwise the one bucket a person
 * most needs to find - unattributed time - is the only one they cannot filter
 * to.
 */
const NO_CLIENT = '__no_client__';

const STATUS_OPTIONS: { value: DayStatus; label: string }[] = [
  { value: 'missing', label: 'Missing' },
  { value: 'under_time', label: 'Under-time' },
  { value: 'complete', label: 'Complete' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'critical', label: 'Critical' },
];

export function TimesheetViews({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  const [mode, setMode] = React.useState<ViewMode>('week');
  const [anchor, setAnchor] = React.useState(DEMO_TODAY);
  const [statuses, setStatuses] = React.useState<readonly string[]>([]);
  const [divisions, setDivisions] = React.useState<readonly string[]>([]);
  const [clients, setClients] = React.useState<readonly string[]>([]);
  const [term, setTerm] = React.useState('');

  const monthKey = anchor.slice(0, 7);
  const weekFrom = weekStart(anchor);

  const week = useAsync(
    () => mockTimesheetService.getWeek({ employeeId, weekStartDate: weekFrom }),
    [employeeId, weekFrom],
  );
  const month = useAsync(
    () => mockTimesheetService.getMonth({ employeeId, month: monthKey }),
    [employeeId, monthKey],
  );

  const source = mode === 'week' ? week : month;

  /**
   * Client options come from the period's own rows rather than from a project
   * list. A viewer is then offered exactly the clients their own recorded time
   * touches, so the filter can never name a client whose work they are not
   * authorized to see.
   */
  const clientOptions = React.useMemo(() => {
    if (source.state.status !== 'success') return [];
    return sumClientContributions(source.state.data.days).map((contribution) => ({
      value: contribution.clientId ?? NO_CLIENT,
      label: contribution.clientLabel,
      hint: contribution.active.display,
    }));
  }, [source.state]);

  const days = React.useMemo(() => {
    if (source.state.status !== 'success') return [];
    const rows = source.state.data.days;
    return rows.filter((row) => {
      if (statuses.length > 0 && !statuses.includes(row.status.status)) return false;
      if (
        clients.length > 0 &&
        !row.clientContributions.some((contribution) =>
          clients.includes(contribution.clientId ?? NO_CLIENT),
        )
      ) {
        return false;
      }
      if (
        divisions.length > 0 &&
        !row.divisionCodes.some((code) =>
          divisions.includes(
            ALL_DIVISIONS.find((division) => division.code === code)?.id ?? '',
          ),
        )
      ) {
        return false;
      }
      if (term.trim() && !row.dateLabel.toLowerCase().includes(term.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [source.state, statuses, divisions, clients, term]);

  /**
   * The client split of the days actually on screen, so the panel and the table
   * can never state different things. Filtering by client keeps whole days - a
   * day usually carries work for more than one client - so the other clients'
   * share of those days stays visible rather than silently vanishing.
   */
  const clientTotals = React.useMemo(() => sumClientContributions(days), [days]);

  const hasFilters =
    statuses.length > 0 ||
    divisions.length > 0 ||
    clients.length > 0 ||
    term.trim().length > 0;

  function shift(direction: -1 | 1) {
    setAnchor((current) =>
      mode === 'week' || mode === 'list'
        ? addDays(current, direction * 7)
        : shiftMonth(current, direction),
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="My Timesheet"
        description="Every day you have recorded, with the division split and the status the policy assigns."
        actions={
          <Button variant="primary" onClick={() => {
            router.push(`/timesheets/${DEMO_TODAY}`);
          }}>
            Go to today
          </Button>
        }
      />

      <div className="mt-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs
            label="Timesheet views"
            activeKey={mode}
            onChange={(key) => setMode(key as ViewMode)}
            items={VIEW_TABS}
            className="border-b-0"
          />

          <div className="flex items-center gap-2">
            <IconButton
              label="Previous period"
              variant="secondary"
              size="sm"
              icon={<ChevronLeft aria-hidden className="size-4" />}
              onClick={() => shift(-1)}
            />
            <span className="min-w-40 text-center text-body-sm font-medium text-ink">
              {mode === 'week' || mode === 'list'
                ? `${formatDate(weekFrom)} – ${formatDate(addDays(weekFrom, 6))}`
                : formatMonth(monthKey)}
            </span>
            <IconButton
              label="Next period"
              variant="secondary"
              size="sm"
              icon={<ChevronRight aria-hidden className="size-4" />}
              onClick={() => shift(1)}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectFilter
            label="Status"
            selected={statuses}
            onChange={setStatuses}
            options={STATUS_OPTIONS}
          />
          <MultiSelectFilter
            label="Division"
            selected={divisions}
            onChange={setDivisions}
            options={ALL_DIVISIONS.map((division) => ({
              value: division.id,
              label: division.name,
              hint: division.code,
            }))}
          />
          <MultiSelectFilter
            label="Client"
            selected={clients}
            onChange={setClients}
            options={clientOptions}
          />
          <div className="w-full sm:w-56">
            <SearchInput
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onClear={() => setTerm('')}
              placeholder="Search dates"
              aria-label="Search timesheet dates"
            />
          </div>
          {hasFilters && (
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setStatuses([]);
                setDivisions([]);
                setClients([]);
                setTerm('');
              }}
            >
              Clear filters
            </Button>
          )}
        </div>

        {source.state.status === 'loading' && (
          <div role="status" aria-busy>
            <span className="sr-only">Loading timesheet</span>
            <Skeleton height="6rem" rounded="md" />
            <Skeleton height="18rem" rounded="md" className="mt-4" />
          </div>
        )}

        {source.state.status === 'failure' && (
          <EmptyState
            variant="error"
            title="Could not load your timesheet"
            description="The request failed. Try again, or contact support if this continues."
            action={{ label: 'Try again', onClick: source.reload }}
          />
        )}

        {source.state.status === 'success' && (
          <>
            <TotalsCard totals={source.state.data.totals} />

            {clientTotals.length > 0 && (
              <ClientTotalsCard
                totals={clientTotals}
                selected={clients}
                onSelect={setClients}
              />
            )}

            {days.length === 0 ? (
              <EmptyState
                variant={hasFilters ? 'no-results' : 'empty'}
                title={
                  hasFilters
                    ? 'No days match these filters'
                    : 'Nothing recorded in this period'
                }
                description={
                  hasFilters
                    ? 'Try clearing a filter or moving to a different period.'
                    : 'Open a date to add your first entry.'
                }
                action={
                  hasFilters
                    ? {
                        label: 'Clear filters',
                        onClick: () => {
                          setStatuses([]);
                          setDivisions([]);
                          setClients([]);
                          setTerm('');
                        },
                      }
                    : undefined
                }
              />
            ) : mode === 'calendar' ? (
              <CalendarView days={days} month={monthKey} />
            ) : (
              <DayTable days={days} />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}

function shiftMonth(date: string, direction: -1 | 1): string {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + direction, 1));
  return shifted.toISOString().slice(0, 10);
}

function TotalsCard({
  totals,
}: {
  totals: {
    label: string;
    active: { minutes: number; display: string; accessibleLabel: string };
    break: { minutes: number; display: string; accessibleLabel: string };
    total: { minutes: number; display: string; accessibleLabel: string };
    overtime: { minutes: number; display: string; accessibleLabel: string };
    completeDayCount: number;
    underTimeDayCount: number;
    overtimeDayCount: number;
    criticalDayCount: number;
    missingDayCount: number;
  };
}) {
  return (
    <Card>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Active work', value: totals.active },
          { label: 'Break', value: totals.break },
          { label: 'Total', value: totals.total },
          { label: 'Overtime', value: totals.overtime },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-label text-ink-muted">{item.label}</p>
            <p className="mt-0.5 text-metric tabular text-ink">
              <Duration value={item.value} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        {[
          { status: 'complete' as const, count: totals.completeDayCount },
          { status: 'under_time' as const, count: totals.underTimeDayCount },
          { status: 'overtime' as const, count: totals.overtimeDayCount },
          { status: 'critical' as const, count: totals.criticalDayCount },
          { status: 'missing' as const, count: totals.missingDayCount },
        ]
          .filter((item) => item.count > 0)
          .map((item) => (
            <span key={item.status} className="inline-flex items-center gap-1.5">
              <StatusIndicator status={item.status} />
              <span className="text-body-sm tabular text-ink-muted">
                {item.count} day{item.count === 1 ? '' : 's'}
              </span>
            </span>
          ))}
      </div>
    </Card>
  );
}

/**
 * Time spent per client for the days on screen (`REQ-WORK-001`, `REQ-RPT-002`).
 *
 * Each row is also the fastest way to apply the filter, so "how much on this
 * client" and "show me only those days" are one gesture rather than two. The
 * share bar is decoration only: the duration is always present as text, and the
 * percentage beside it, so nothing here depends on the bar being seen.
 */
function ClientTotalsCard({
  totals,
  selected,
  onSelect,
}: {
  totals: readonly ClientContributionView[];
  selected: readonly string[];
  onSelect: (next: readonly string[]) => void;
}) {
  function toggle(value: string) {
    onSelect(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  }

  return (
    <Card>
      <CardHeader
        title="Time by client"
        description="Active work in this period, grouped by the client each project is delivered for."
      />
      <ul className="mt-4 flex flex-col gap-2">
        {totals.map((contribution) => {
          const value = contribution.clientId ?? NO_CLIENT;
          const isSelected = selected.includes(value);
          return (
            <li key={value}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => toggle(value)}
                className={cn(
                  'flex min-h-11 w-full min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-left',
                  'transition-colors hover:bg-surface-sunken',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  isSelected ? 'border-accent bg-surface-sunken' : 'border-border',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-medium text-ink">
                    {contribution.clientLabel}
                  </span>
                  <span
                    aria-hidden
                    className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
                  >
                    <span
                      className="block h-full rounded-full bg-accent"
                      style={{ width: `${contribution.sharePercent}%` }}
                    />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-body-sm font-semibold tabular text-ink">
                    <Duration value={contribution.active} />
                  </span>
                  <span className="block text-caption tabular text-ink-muted">
                    {contribution.sharePercent}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function DayTable({ days }: { days: readonly TimesheetDayRowView[] }) {
  const columns: readonly DataTableColumn<TimesheetDayRowView>[] = [
    {
      key: 'date',
      header: 'Date',
      alwaysVisible: true,
      render: (row) => (
        <Link
          href={row.href}
          className="inline-flex min-h-6 items-center font-medium text-ink hover:text-accent"
        >
          {row.dateLabel}
        </Link>
      ),
    },
    {
      key: 'attendance',
      header: 'Attendance',
      hideBelow: 'lg',
      render: (row) => (
        <span className="text-ink-muted">{ATTENDANCE_LABEL[row.attendance]}</span>
      ),
    },
    {
      key: 'divisions',
      header: 'Divisions',
      hideBelow: 'md',
      render: (row) =>
        row.divisionCodes.length === 0 ? (
          <span className="text-ink-subtle">—</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.divisionCodes.map((code) => (
              <Badge key={code} tone="neutral">
                {code}
              </Badge>
            ))}
          </span>
        ),
    },
    { key: 'active', header: 'Active', align: 'right', render: (row) => <Duration value={row.active} /> },
    { key: 'break', header: 'Break', align: 'right', hideBelow: 'md', render: (row) => <Duration value={row.break} /> },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (row) => <Duration value={row.total} emphasis />,
    },
    {
      key: 'status',
      header: 'Status',
      alwaysVisible: true,
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <StatusIndicator status={row.status.status} />
          {row.isLocked && <Lock aria-label="Verified period" className="size-3.5 text-ink-subtle" />}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption="Timesheet days"
      rows={days}
      columns={columns}
      getRowId={(row) => row.date}
      renderMobileCard={(row) => (
        <Link href={row.href} className="block">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body-sm font-medium text-ink">{row.dateLabel}</span>
            <StatusIndicator status={row.status.status} />
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
            <div>
              <dt className="inline">Active </dt>
              <dd className="inline tabular text-ink">{row.active.display}</dd>
            </div>
            <div>
              <dt className="inline">Break </dt>
              <dd className="inline tabular text-ink">{row.break.display}</dd>
            </div>
            <div>
              <dt className="inline">Total </dt>
              <dd className="inline tabular font-semibold text-ink">{row.total.display}</dd>
            </div>
          </dl>
          {row.divisionCodes.length > 0 && (
            <p className="mt-1.5 flex flex-wrap gap-1">
              {row.divisionCodes.map((code) => (
                <Badge key={code} tone="neutral">
                  {code}
                </Badge>
              ))}
            </p>
          )}
        </Link>
      )}
    />
  );
}

/**
 * Month calendar (`FE-0313`).
 *
 * Below `md` it becomes a vertical agenda rather than a squeezed grid: a
 * seven-column month at 375 px leaves each cell too small to carry a readable
 * status label, and status must never be colour alone.
 */
function CalendarView({
  days,
  month,
}: {
  days: readonly TimesheetDayRowView[];
  month: string;
}) {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const first = `${month}-01`;
  const parts = parseIsoDate(first);
  if (!parts) return null;

  const firstWeekday = new Date(Date.UTC(parts.year, parts.month - 1, 1)).getUTCDay();
  const leading = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const daysInMonth = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();

  return (
    <Card padding="sm">
      {/* Desktop grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-1">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => (
            <div key={label} className="px-2 py-1 text-caption font-medium text-ink-muted">
              {label}
            </div>
          ))}
          {Array.from({ length: leading }, (_, index) => (
            <div key={`pad-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, index) => {
            const date = `${month}-${String(index + 1).padStart(2, '0')}`;
            const day = byDate.get(date);
            return (
              <Link
                key={date}
                href={`/timesheets/${date}`}
                className={cn(
                  'flex min-h-20 flex-col gap-1 rounded-md border border-border p-2',
                  'transition-colors hover:border-border-strong hover:bg-surface-sunken',
                  date === DEMO_TODAY && 'border-accent ring-1 ring-accent',
                )}
              >
                <span className="text-caption font-medium text-ink">{index + 1}</span>
                {day && day.total.minutes > 0 && (
                  <span className="text-caption tabular text-ink-muted">
                    {day.total.display}
                  </span>
                )}
                {day && (
                  <span className="mt-auto">
                    <StatusIndicator status={day.status.status} variant="dot" />
                    <span className="ml-1 text-[0.625rem] text-ink-muted">
                      {day.status.label}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Mobile agenda */}
      <ul className="flex flex-col gap-2 md:hidden">
        {days
          .filter((day) => day.total.minutes > 0 || day.status.status === 'missing')
          .map((day) => (
            <li key={day.date}>
              <Link
                href={day.href}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-body-sm font-medium text-ink">{day.dateLabel}</p>
                  <p className="text-caption text-ink-muted">
                    {ATTENDANCE_LABEL[day.attendance]}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-body-sm tabular text-ink">{day.total.display}</span>
                  <StatusIndicator status={day.status.status} />
                </div>
              </Link>
            </li>
          ))}
      </ul>
    </Card>
  );
}
