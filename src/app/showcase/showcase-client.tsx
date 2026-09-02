'use client';

import * as React from 'react';
import { Download, Pencil, Plus, Trash2 } from 'lucide-react';
import type { DateRange, DateRangePreset, PageInfo, SortParams } from '@/contracts/query';
import type { MetricTileView } from '@/contracts/view-models';
import type { DayStatus } from '@/contracts/domain';
import { DEMO_FEATURE_FLAGS } from '@/contracts/feature-flags';
import { buildNavigation, ROLE_LABEL } from '@/components/shell/navigation';
import { AppShell } from '@/components/shell/app-shell';
import { Button, IconButton } from '@/components/ui/button';
import { Badge, CountBadge } from '@/components/ui/badge';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Avatar, AvatarGroup } from '@/components/ui/avatar';
import { Skeleton, SkeletonText } from '@/components/ui/skeleton';
import { ProgressBar, Spinner } from '@/components/ui/progress';
import { Tooltip } from '@/components/ui/tooltip';
import { Divider, Duration, NotRecorded, RestrictedValue } from '@/components/ui/misc';
import { Field, FormErrorSummary } from '@/components/forms/field';
import {
  Checkbox,
  CurrencyInput,
  DateInput,
  DurationInput,
  FileUpload,
  Input,
  NumberInput,
  PercentInput,
  RadioGroup,
  SearchInput,
  Select,
  Switch,
  Textarea,
  TimeInput,
} from '@/components/forms/inputs';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Alert, Callout, EmptyState } from '@/components/feedback/alert';
import { Dialog, Drawer, DropdownMenu, Popover } from '@/components/feedback/overlay';
import { useToast } from '@/components/feedback/toast';
import {
  AccordionItem,
  StepIndicator,
  TabPanel,
  Tabs,
} from '@/components/feedback/disclosure';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { DateRangeFilter, FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { BarChart, ChartContainer, DonutChart } from '@/components/charts/chart';
import {
  DashboardGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
  SplitPanel,
} from '@/components/layout/page';
import { toDurationView } from '@/lib/status';

/* -------------------------------------------------------------------------- */
/* Showcase scaffolding                                                       */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 scroll-mt-20" id={title.toLowerCase().replace(/\s+/g, '-')}>
      <SectionHeader title={title} description={description} />
      <Card padding="lg" className="flex flex-col gap-6">
        {children}
      </Card>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-ink-subtle">{label}</p>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Sample data                                                                */
/* -------------------------------------------------------------------------- */

interface DemoRow {
  readonly id: string;
  readonly employee: string;
  readonly division: string;
  readonly active: number;
  readonly total: number;
  readonly status: DayStatus;
}

const DEMO_ROWS: readonly DemoRow[] = [
  { id: 'r1', employee: 'Nadia Rahman', division: 'PowerInAI', active: 420, total: 480, status: 'complete' },
  { id: 'r2', employee: 'Tanvir Ahmed', division: 'Computer Jagat', active: 510, total: 570, status: 'overtime' },
  { id: 'r3', employee: 'Sadia Karim', division: 'PowerInAI Training', active: 419, total: 479, status: 'under_time' },
  { id: 'r4', employee: 'Sumaiya Noor', division: 'WesternCF', active: 0, total: 0, status: 'missing' },
  { id: 'r5', employee: 'Imran Hossain', division: 'PowerInAI', active: 690, total: 750, status: 'critical' },
];

const METRIC_TILES: readonly MetricTileView[] = [
  {
    key: 'active',
    label: 'Active work today',
    value: '7:00',
    secondaryValue: 'Required 7:00',
    tone: 'positive',
    href: '/timesheets',
  },
  { key: 'break', label: 'Break', value: '1:00', secondaryValue: 'Recognized' },
  {
    key: 'total',
    label: 'Daily total',
    value: '8:00',
    trend: { direction: 'flat', label: 'On schedule' },
  },
  {
    key: 'cost',
    label: 'Project labour cost',
    value: '',
    restricted: true,
  },
];

const CHART_DATA = [
  { key: 'pia', label: 'PowerInAI', value: 180, display: '3:00' },
  { key: 'gov', label: 'Government Projects', value: 120, display: '2:00' },
  { key: 'wcf', label: 'WesternCF', value: 120, display: '2:00' },
];

/* -------------------------------------------------------------------------- */
/* Showcase                                                                   */
/* -------------------------------------------------------------------------- */

export function ShowcaseClient() {
  const toast = useToast();

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [tab, setTab] = React.useState('overview');
  const [density, setDensity] = React.useState<'comfortable' | 'dense'>('comfortable');
  const [search, setSearch] = React.useState('');
  const [duration, setDuration] = React.useState<number | null>(420);
  const [switchOn, setSwitchOn] = React.useState(true);
  const [radio, setRadio] = React.useState('full_day');
  const [selected, setSelected] = React.useState<readonly string[]>([]);
  const [divisions, setDivisions] = React.useState<readonly string[]>(['pia']);
  const [sort, setSort] = React.useState<SortParams>({ field: 'employee', direction: 'asc' });
  const [range, setRange] = React.useState<DateRange>({
    from: '2026-09-01',
    to: '2026-09-30',
    preset: 'this_month',
  });

  const shellView = React.useMemo(
    () => ({
      viewer: {
        displayName: 'Nadia Rahman',
        roleLabel: ROLE_LABEL.employee,
        primaryRole: 'employee' as const,
        avatarUrl: null,
      },
      navigation: buildNavigation({
        role: 'employee',
        flags: DEMO_FEATURE_FLAGS,
        permissions: [],
        badges: { dashboard: 0 },
      }),
      unreadNotificationCount: 3,
      runningTimer: {
        sessionId: 'timer-1',
        startedAt: '2026-09-02T09:15:00+06:00',
        elapsed: toDurationView(95),
        division: { id: 'pia', name: 'PowerInAI', code: 'PIA', isRestricted: false },
        project: null,
        task: null,
        workLocation: 'office' as const,
        wasRecovered: false,
      },
      sessionExpiresAt: '2026-09-02T18:00:00+06:00',
    }),
    [],
  );

  const columns: readonly DataTableColumn<DemoRow>[] = [
    {
      key: 'employee',
      header: 'Employee',
      sortable: true,
      alwaysVisible: true,
      render: (row) => (
        <span className="flex items-center gap-2">
          <Avatar name={row.employee} size="xs" />
          <span className="truncate">{row.employee}</span>
        </span>
      ),
    },
    { key: 'division', header: 'Division', sortable: true, hideBelow: 'lg', render: (row) => row.division },
    {
      key: 'active',
      header: 'Active',
      align: 'right',
      sortable: true,
      render: (row) => <Duration value={toDurationView(row.active)} />,
    },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      sortable: true,
      render: (row) => <Duration value={toDurationView(row.total)} emphasis />,
    },
    {
      key: 'status',
      header: 'Status',
      alwaysVisible: true,
      render: (row) => <StatusIndicator status={row.status} />,
    },
  ];

  const pageInfo: PageInfo = {
    page: 1,
    pageSize: 25,
    totalItems: DEMO_ROWS.length,
    totalPages: 1,
    hasPreviousPage: false,
    hasNextPage: false,
  };

  function resolvePreset(preset: DateRangePreset): DateRange {
    // The showcase resolves presets statically; features resolve against today.
    return { from: '2026-09-01', to: '2026-09-30', preset };
  }

  return (
    <AppShell view={shellView}>
      <PageContainer>
        <div data-density={density === 'dense' ? 'dense' : undefined} className="flex flex-col gap-8">
          <PageHeader
            title="Component showcase"
            description="The frontend source of truth. Every shared component in its normal, hover, focus, disabled, loading, empty, error, and dense states."
            crumbs={[{ label: 'Home', href: '/' }, { label: 'Component showcase' }]}
            meta={<Badge tone="accent">Phase 1</Badge>}
            actions={
              <>
                <Button
                  variant={density === 'dense' ? 'primary' : 'secondary'}
                  onClick={() =>
                    setDensity((value) => (value === 'dense' ? 'comfortable' : 'dense'))
                  }
                >
                  {density === 'dense' ? 'Dense' : 'Comfortable'}
                </Button>
                <Button
                  variant="accent"
                  iconLeading={<Plus aria-hidden className="size-4" />}
                  onClick={() =>
                    toast.show({
                      tone: 'success',
                      title: 'Entry saved',
                      description: '3:00 recorded for PowerInAI on 2 Sep 2026.',
                    })
                  }
                >
                  Show toast
                </Button>
              </>
            }
          />

          {/* ---------------------------------------------------------------- */}
          <Section title="Buttons" description="Every variant, size, and interaction state.">
            <Row label="Variants">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="accent">Accent</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
            </Row>
            <Row label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </Row>
            <Row label="States">
              <Button variant="primary" loading>
                Saving
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="secondary" iconLeading={<Download aria-hidden className="size-4" />}>
                With icon
              </Button>
              <IconButton label="Edit entry" icon={<Pencil aria-hidden className="size-4" />} />
              <IconButton
                label="Delete entry"
                variant="ghost"
                icon={<Trash2 aria-hidden className="size-4" />}
              />
            </Row>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            title="Status and badges"
            description="Day classification always renders shape plus text plus colour, never colour alone."
          >
            <Row label="Day status — badge">
              {(['missing', 'under_time', 'complete', 'overtime', 'critical'] as const).map(
                (status) => (
                  <StatusIndicator key={status} status={status} />
                ),
              )}
            </Row>
            <Row label="Day status — inline">
              {(['missing', 'under_time', 'complete', 'overtime', 'critical'] as const).map(
                (status) => (
                  <StatusIndicator key={status} status={status} variant="inline" />
                ),
              )}
            </Row>
            <Row label="Badges">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success">Verified</Badge>
              <Badge tone="warning">Pending</Badge>
              <Badge tone="danger">Rejected</Badge>
              <Badge tone="info">Draft</Badge>
              <CountBadge count={12} label="unread" />
              <CountBadge count={140} label="unread" />
            </Row>
            <Row label="Avatars">
              <Avatar name="Nadia Rahman" size="xs" />
              <Avatar name="Tanvir Ahmed" size="sm" />
              <Avatar name="Rezaul Haque" size="md" />
              <Avatar name="Mahmuda Akter" size="lg" />
              <AvatarGroup
                people={[
                  { name: 'Nadia Rahman' },
                  { name: 'Tanvir Ahmed' },
                  { name: 'Sadia Karim' },
                  { name: 'Imran Hossain' },
                  { name: 'Sumaiya Noor' },
                  { name: 'Arif Mahmud' },
                ]}
              />
            </Row>
            <Row label="Values">
              <Duration value={toDurationView(419)} />
              <Duration value={toDurationView(480)} emphasis />
              <NotRecorded />
              <RestrictedValue />
              <Tooltip content="Recorded in the business timezone">
                <button
                  type="button"
                  className="inline-flex min-h-6 items-center rounded-xs text-body-sm underline"
                >
                  Hover or focus me
                </button>
              </Tooltip>
            </Row>
            <Row label="Loading">
              <Spinner size="sm" />
              <Spinner />
              <Skeleton height="1rem" width="8rem" />
            </Row>
            <div className="max-w-md">
              <ProgressBar value={87.5} label="Progress to 8:00 schedule" valueText="7:00 of 8:00" />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            title="Form controls"
            description="Every control is wired to its label, helper text, and error through the Field wrapper."
          >
            <FormErrorSummary
              autoFocus={false}
              errors={[
                { field: 'endTime', message: 'End time must be after start time.' },
                { field: 'completedWork', message: 'Completed work is required.' },
              ]}
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Work description" required helperText="What did you work on?">
                <Input placeholder="Model evaluation harness" />
              </Field>
              <Field
                label="End time"
                required
                error="End time must be after start time. Change it to a time after 9:15 AM."
              >
                <TimeInput defaultValue="08:30" />
              </Field>
              <Field label="Work date" required>
                <DateInput defaultValue="2026-09-02" />
              </Field>
              <Field label="Duration" required helperText="Accepts 7:30, 7.5h, 90m, or 450.">
                <DurationInput value={duration} onValueChange={setDuration} />
              </Field>
              <Field label="Division" required>
                <Select
                  placeholder="Select a division"
                  defaultValue=""
                  options={[
                    { value: 'pia', label: 'PowerInAI' },
                    { value: 'pit', label: 'PowerInAI Training' },
                    { value: 'gov', label: 'Government Projects' },
                    { value: 'cjg', label: 'Computer Jagat' },
                    { value: 'wcf', label: 'WesternCF' },
                  ]}
                />
              </Field>
              <Field label="Allocation">
                <PercentInput defaultValue={50} />
              </Field>
              <Field label="Estimated hours">
                <NumberInput defaultValue={40} />
              </Field>
              <Field label="Budget">
                <CurrencyInput currency="BDT" defaultValue="125000.00" />
              </Field>
              <Field label="Disabled field" disabled helperText="Locked by a verified period.">
                <Input defaultValue="July 2026" disabled />
              </Field>
              <Field label="Search">
                <SearchInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onClear={() => setSearch('')}
                  placeholder="Search employees"
                />
              </Field>
            </div>

            <Field label="Completed work" required helperText="Describe the outcome, not only the activity.">
              <Textarea rows={3} placeholder="Completed the evaluation harness and ran the first benchmark." />
            </Field>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <RadioGroup
                name="portion"
                legend="Duration"
                value={radio}
                onValueChange={setRadio}
                options={[
                  { value: 'full_day', label: 'Full day' },
                  { value: 'half_day', label: 'Half day', description: 'Adjusts the daily requirement.' },
                ]}
              />
              <div className="flex flex-col gap-3">
                <p className="text-label text-ink">Options</p>
                <Checkbox label="Remember me" defaultChecked />
                <Checkbox label="Send a notification" description="The Team Lead is notified." />
                <Checkbox label="Disabled option" disabled />
              </div>
              <Switch
                checked={switchOn}
                onCheckedChange={setSwitchOn}
                label="Compact table density"
                description="Shows more rows without changing touch targets."
              />
            </div>

            <FileUpload
              label="Add an attachment or supporting link"
              helperText="PDF, image, or document up to 10 MB."
              files={[{ id: 'f1', name: 'benchmark-results.pdf', size: '248 KB' }]}
              onFilesSelected={() => {}}
              onRemove={() => {}}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section title="Cards and metrics" description="Real, restricted, and loading metric states.">
            <DashboardGrid>
              {METRIC_TILES.map((tile) => (
                <MetricCard key={tile.key} tile={tile} />
              ))}
            </DashboardGrid>
            <DashboardGrid>
              <MetricCard tile={METRIC_TILES[0]} loading />
              <MetricCard tile={METRIC_TILES[1]} loading />
              <MetricCard tile={METRIC_TILES[2]} loading />
              <MetricCard tile={METRIC_TILES[3]} loading />
            </DashboardGrid>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section title="Feedback" description="Alerts, callouts, and the six empty-state variants.">
            <div className="flex flex-col gap-3">
              <Alert tone="info" title="This period is open">
                Entries can still be added or corrected until HR verifies September 2026.
              </Alert>
              <Alert tone="success" title="Period verified">
                July 2026 was verified on 2 Aug 2026 by Rezaul Haque.
              </Alert>
              <Alert
                tone="warning"
                title="Concurrent allocation is 130%"
                actions={<Button size="sm" variant="secondary">Review assignments</Button>}
              >
                Expected 100%. Review the employee&apos;s division assignments.
              </Alert>
              <Alert tone="danger" title="Overlapping entry" live>
                This entry overlaps 9:00 AM – 11:00 AM on PowerInAI. Adjust the times so they do not overlap.
              </Alert>
              <Callout tone="info">
                Breaks are recognized once per day and are never added per entry.
              </Callout>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <EmptyState
                variant="empty"
                title="No time recorded yet"
                description="Add your first entry for 2 Sep 2026."
                action={{ label: 'Add time', onClick: () => {} }}
              />
              <EmptyState
                variant="no-results"
                title="No records match these filters"
                description="Try widening the date range or clearing the division filter."
                action={{ label: 'Clear filters', onClick: () => {} }}
              />
              <EmptyState
                variant="denied"
                title="You do not have access to this data"
                description="Labour cost requires the financial-detail permission. Contact your administrator."
              />
              <EmptyState
                variant="locked"
                title="July 2026 is verified and locked"
                description="Ordinary edits are not allowed. Request an amendment with a reason instead."
                action={{ label: 'Request amendment', onClick: () => {} }}
              />
              <EmptyState
                variant="error"
                title="Could not load timesheets"
                description="The request failed. Try again, or contact support if this continues."
                action={{ label: 'Try again', onClick: () => {} }}
              />
              <EmptyState
                variant="offline"
                title="You appear to be offline"
                description="Your timer keeps running. Changes will be saved when the connection returns."
              />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section title="Overlays" description="Dialog, drawer, popover, and menu, each with focus management.">
            <Row label="Triggers">
              <Button variant="secondary" onClick={() => setDialogOpen(true)}>
                Open dialog
              </Button>
              <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
                Open drawer
              </Button>
              <Popover label="Example popover" trigger={<Button variant="secondary">Open popover</Button>}>
                <p className="text-body-sm text-ink-muted">
                  A non-modal surface. Focus is not trapped, so you can tab straight into the content behind it.
                </p>
              </Popover>
              <DropdownMenu
                label="Example menu"
                trigger={<Button variant="secondary">Open menu</Button>}
                items={[
                  { key: 'edit', label: 'Edit entry', icon: <Pencil aria-hidden className="size-4" />, onSelect: () => {} },
                  { key: 'copy', label: 'Copy to another date', onSelect: () => {} },
                  { key: 'delete', label: 'Delete entry', icon: <Trash2 aria-hidden className="size-4" />, onSelect: () => {}, destructive: true },
                ]}
              />
            </Row>

            <Row label="Toasts">
              <Button variant="secondary" onClick={() => toast.show({ tone: 'success', title: 'Saved' })}>
                Success
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.show({ tone: 'error', title: 'Save failed', description: 'Check the highlighted fields.' })}
              >
                Error
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast.show({ tone: 'warning', title: 'Overtime reason required' })}
              >
                Warning
              </Button>
            </Row>

            <Dialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              title="Discard unsaved changes?"
              description="This entry has not been saved. Discarding removes what you typed."
              dismissOnBackdrop={false}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                    Keep editing
                  </Button>
                  <Button variant="danger" onClick={() => setDialogOpen(false)}>
                    Discard
                  </Button>
                </>
              }
            />

            <Drawer
              open={drawerOpen}
              onClose={() => setDrawerOpen(false)}
              title="Add time entry"
              description="2 Sep 2026 · PowerInAI"
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="secondary">Save draft</Button>
                  <Button variant="primary" onClick={() => setDrawerOpen(false)}>
                    Save entry
                  </Button>
                </>
              }
            >
              <div className="flex flex-col gap-4">
                <Field label="Work description" required>
                  <Input placeholder="What did you work on?" />
                </Field>
                <Field label="Completed work" required>
                  <Textarea rows={3} />
                </Field>
                <Callout tone="info">
                  Saving a daily entry never requires Team Lead approval.
                </Callout>
              </div>
            </Drawer>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section title="Tabs, accordion, and steps">
            <div>
              <Tabs
                label="Employee detail sections"
                activeKey={tab}
                onChange={setTab}
                items={[
                  { key: 'overview', label: 'Overview' },
                  { key: 'assignments', label: 'Assignments', badgeCount: 3 },
                  { key: 'time', label: 'Time' },
                  { key: 'evaluations', label: 'Evaluations', disabled: true },
                ]}
              />
              <div className="pt-4">
                <TabPanel tabKey="overview" activeKey={tab}>
                  <p className="text-body-sm text-ink-muted">
                    Overview content. The tab strip scrolls horizontally rather than wrapping.
                  </p>
                </TabPanel>
                <TabPanel tabKey="assignments" activeKey={tab}>
                  <p className="text-body-sm text-ink-muted">
                    Three active division assignments totalling 100% allocation.
                  </p>
                </TabPanel>
                <TabPanel tabKey="time" activeKey={tab}>
                  <p className="text-body-sm text-ink-muted">Time content.</p>
                </TabPanel>
              </div>
            </div>

            <Divider />

            <div>
              <AccordionItem title="Calculation breakdown" defaultOpen meta={<Badge tone="complete">Complete</Badge>}>
                Active 7:00 across three divisions, plus one recognized break hour, for an 8:00 total.
              </AccordionItem>
              <AccordionItem title="Change history">
                Two amendments, each with a reason and before/after values.
              </AccordionItem>
              <AccordionItem title="Attachments">One file attached.</AccordionItem>
            </div>

            <Divider />

            <StepIndicator
              label="Period verification"
              currentIndex={1}
              steps={[
                { key: 'review', label: 'Review exceptions', description: '4 open' },
                { key: 'resolve', label: 'Resolve corrections' },
                { key: 'verify', label: 'Verify period' },
              ]}
            />
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            title="Filters and data table"
            description="Sorting, selection, column visibility, row actions, pagination, and a mobile card fallback below 768 px."
          >
            <FilterBar
              applied={[
                { key: 'division', label: 'Division', value: 'PowerInAI', onRemove: () => setDivisions([]) },
                { key: 'status', label: 'Status', value: 'Overtime', onRemove: () => {} },
              ]}
              onClearAll={() => setDivisions([])}
              resultSummary={`${DEMO_ROWS.length} records match the current filters`}
            >
              <DateRangeFilter value={range} onChange={setRange} resolvePreset={resolvePreset} />
              <MultiSelectFilter
                label="Division"
                selected={divisions}
                onChange={setDivisions}
                options={[
                  { value: 'pia', label: 'PowerInAI', hint: 'PIA' },
                  { value: 'pit', label: 'PowerInAI Training', hint: 'PIT' },
                  { value: 'gov', label: 'Government Projects', hint: 'GOV' },
                  { value: 'cjg', label: 'Computer Jagat', hint: 'CJG' },
                  { value: 'wcf', label: 'WesternCF', hint: 'WCF' },
                ]}
              />
              <MultiSelectFilter
                label="Status"
                selected={[]}
                onChange={() => {}}
                options={[
                  { value: 'missing', label: 'Missing' },
                  { value: 'under_time', label: 'Under-time' },
                  { value: 'complete', label: 'Complete' },
                  { value: 'overtime', label: 'Overtime' },
                  { value: 'critical', label: 'Critical' },
                ]}
              />
            </FilterBar>

            <DataTable
              caption="Team timesheet records"
              rows={DEMO_ROWS}
              columns={columns}
              getRowId={(row) => row.id}
              sort={sort}
              onSortChange={setSort}
              pageInfo={pageInfo}
              onPageChange={() => {}}
              onPageSizeChange={() => {}}
              selectedIds={selected}
              onSelectionChange={setSelected}
              rowActions={(row) => [
                { key: 'view', label: `View ${row.employee}`, onSelect: () => {} },
                { key: 'remark', label: 'Add general remark', onSelect: () => {} },
              ]}
              renderMobileCard={(row) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar name={row.employee} size="xs" />
                      <span className="truncate text-body-sm font-medium">{row.employee}</span>
                    </span>
                    <StatusIndicator status={row.status} />
                  </div>
                  <dl className="flex gap-4 text-caption text-ink-muted">
                    <div>
                      <dt className="inline">Active </dt>
                      <dd className="inline text-ink tabular">{toDurationView(row.active).display}</dd>
                    </div>
                    <div>
                      <dt className="inline">Total </dt>
                      <dd className="inline text-ink tabular">{toDurationView(row.total).display}</dd>
                    </div>
                    <div className="truncate">
                      <dt className="sr-only">Division</dt>
                      <dd>{row.division}</dd>
                    </div>
                  </dl>
                </div>
              )}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <DataTable
                caption="Loading example"
                rows={[]}
                columns={columns}
                getRowId={(row: DemoRow) => row.id}
                loading
              />
              <DataTable
                caption="Empty example"
                rows={[]}
                columns={columns}
                getRowId={(row: DemoRow) => row.id}
                emptyState={{
                  variant: 'no-results',
                  title: 'No records match these filters',
                  description: 'Try a wider date range.',
                }}
              />
            </div>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section
            title="Charts"
            description="Every chart carries a legend and a data table equivalent; series colours differ in lightness as well as hue."
          >
            <SplitPanel
              main={
                <ChartContainer
                  title="Division contribution"
                  description="2 Sep 2026 · 7:00 active"
                  data={CHART_DATA}
                  tableCaption="Active work by division for 2 September 2026"
                  valueHeader="Active work"
                >
                  <BarChart data={CHART_DATA} />
                </ChartContainer>
              }
              aside={
                <ChartContainer
                  title="Share of day"
                  data={CHART_DATA}
                  tableCaption="Share of active work by division"
                  valueHeader="Active work"
                >
                  <DonutChart data={CHART_DATA} centerValue="7:00" centerLabel="Active" />
                </ChartContainer>
              }
            />
            <ChartContainer
              title="Empty chart"
              data={[]}
              tableCaption="No data"
              valueHeader="Active work"
            >
              <div />
            </ChartContainer>
          </Section>

          {/* ---------------------------------------------------------------- */}
          <Section title="Loading placeholders">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader title="Skeleton text" />
                <SkeletonText lines={4} className="mt-3" />
              </Card>
              <Card>
                <CardHeader title="Skeleton blocks" />
                <div className="mt-3 flex flex-col gap-2">
                  <Skeleton height="2rem" rounded="md" />
                  <Skeleton height="2rem" width="70%" rounded="md" />
                  <Skeleton height="2rem" width="45%" rounded="md" />
                </div>
              </Card>
            </div>
          </Section>
        </div>
      </PageContainer>
    </AppShell>
  );
}
