'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowRight, MapPin, MessageSquareText, Users } from 'lucide-react';
import type { TeamTimesheetRowView } from '@/contracts/view-models';
import { mockTeamLeadService } from '@/services/mock/team-lead';
import { mockRequisitionService } from '@/services/mock/requisition';
import { mockConveyanceService } from '@/services/mock/conveyance';
import { mockTaskReviewService } from '@/services/mock/task-review';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { PageContainer, PageHeader, DashboardGrid, SectionHeader } from '@/components/layout/page';
import { Card, CardHeader, MetricCard } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Duration } from '@/components/ui/misc';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { ProgressBar } from '@/components/ui/progress';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { FilterBar, MultiSelectFilter } from '@/components/data/filters';
import { Field } from '@/components/forms/field';
import { Checkbox, Textarea } from '@/components/forms/inputs';
import { Dialog } from '@/components/feedback/overlay';
import { StepIndicator } from '@/components/feedback/disclosure';
import { useToast } from '@/components/feedback/toast';
import { REMARK_STATE_LABEL } from '@/lib/status';

function LoadingPage({ label }: { label: string }) {
  return (
    <PageContainer>
      <div role="status" aria-busy>
        <span className="sr-only">Loading {label}</span>
        <Skeleton height="2rem" width="18rem" />
        <Skeleton height="16rem" rounded="md" className="mt-5" />
      </div>
    </PageContainer>
  );
}

function ScopeBadge() {
  return <Badge tone="accent" icon={<Users aria-hidden className="size-3.5" />}>Assigned team scope</Badge>;
}

export function TeamLeadDashboard() {
  const router = useRouter();
  const { user } = useSession();
  const { state } = useAsync(
    () => mockTeamLeadService.getDashboard(user?.userId ?? ''),
    [user?.userId],
  );
  /*
   * The requisition queue is loaded separately rather than folded into the
   * dashboard view model: it belongs to a different service with its own
   * visibility rule, and merging the two would let a dashboard failure hide a
   * decision that is genuinely waiting.
   */
  const requisitions = useAsync(
    () => mockRequisitionService.queue(user?.userId ?? ''),
    [user?.userId],
  );
  const conveyance = useAsync(
    () => mockConveyanceService.queue(user?.userId ?? ''),
    [user?.userId],
  );
  const taskReviews = useAsync(
    () => mockTaskReviewService.queue(user?.userId ?? ''),
    [user?.userId],
  );
  if (state.status === 'loading') return <LoadingPage label="Team Lead dashboard" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Dashboard unavailable" description={state.failure.message} /></PageContainer>;

  const view = state.data;
  const metricTiles = [
    { key: 'assigned', label: 'Assigned employees', value: String(view.assignedHeadcount), href: '/team' },
    { key: 'working', label: 'Working today', value: String(view.workingToday), secondaryValue: `${view.assignedHeadcount - view.workingToday} not recording time`, href: '/team' },
    { key: 'pending_tasks', label: 'Pending tasks', value: String(view.pendingTasks), href: '/tasks' },
    { key: 'overdue_tasks', label: 'Overdue tasks', value: String(view.overdueTasks), tone: 'negative' as const, href: '/tasks?overdue=true' },
  ];

  /*
   * One queue presentation, not two (`FE-0769`). Requisitions and conveyance
   * claims are both "a decision only you can make"; a Team Lead with one of
   * each wants a single prompt, not two competing banners saying the same
   * thing about different nouns.
   */
  const pendingDecisions = [
    {
      key: 'requisitions',
      count: requisitions.state.status === 'success' ? requisitions.state.data.awaitingCount : 0,
      singular: 'requisition',
      plural: 'requisitions',
      href: '/requisitions',
    },
    {
      key: 'conveyance',
      count: conveyance.state.status === 'success' ? conveyance.state.data.awaitingCount : 0,
      singular: 'conveyance claim',
      plural: 'conveyance claims',
      href: '/conveyance',
    },
    {
      key: 'task-reviews',
      count: taskReviews.state.status === 'success' ? taskReviews.state.data.awaitingCount : 0,
      singular: 'task raised by your team',
      plural: 'tasks raised by your team',
      href: '/tasks',
    },
  ].filter((item) => item.count > 0);

  return (
    <PageContainer>
      <PageHeader title="Team Lead dashboard" description="Today’s team status, exceptions, delivery, requests, and capacity." meta={<ScopeBadge />} />
      <DashboardGrid className="mt-5">
        {metricTiles.map((tile) => <MetricCard key={tile.key} tile={tile} />)}
      </DashboardGrid>

      {pendingDecisions.length > 0 && (
        <Alert
          tone="warning"
          className="mt-5"
          title={`${pendingDecisions
            .map((item) => `${item.count} ${item.count === 1 ? item.singular : item.plural}`)
            .join(' and ')} waiting for you`}
          actions={
            <span className="flex flex-wrap gap-2">
              {pendingDecisions.map((item) => (
                <LinkButton key={item.key} href={item.href} variant="secondary" size="sm">
                  Review {item.plural}
                </LinkButton>
              ))}
            </span>
          }
        >
          An employee cannot move these past you. A requisition or claim reaches HR,
          Finance and the Super Administrator only after your review, and a task they
          raised cannot receive time until you approve it.
        </Alert>
      )}

      <section className="mt-7" aria-labelledby="attendance-heading">
        <SectionHeader title="Working today" description="Presence states for employees assigned to you." />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {view.attendanceBreakdown.map((item) => (
            <Card key={item.state} padding="sm">
              <p className="text-caption text-ink-muted">{item.label}</p>
              <p className="mt-1 text-metric tabular text-ink">{item.count}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-7" aria-labelledby="exceptions-heading">
        <SectionHeader title="Time exceptions" description="Review by exception; daily records do not require a decision." />
        <DashboardGrid className="mt-3">
          {Object.values(view.exceptions).map((tile) => <MetricCard key={tile.key} tile={tile} />)}
        </DashboardGrid>
      </section>

      <div className="mt-7 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Project progress" description="Estimate and actual time remain attributed to the source project." actions={<Button variant="link" size="sm" onClick={() => router.push('/projects')}>All projects</Button>} />
          <ul className="mt-4 space-y-4">
            {view.projectProgress.map((item) => (
              <li key={item.project.id}>
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-body-sm font-semibold text-ink">{item.project.name}</p><p className="text-caption text-ink-muted">{item.project.code} · {item.status}</p></div>
                  <span className="text-body-sm tabular font-semibold text-ink">{item.completionPercent}%</span>
                </div>
                <ProgressBar value={item.completionPercent} label={`${item.project.name} completion`} className="mt-2" />
                <p className="mt-1 text-caption text-ink-muted">Actual <Duration value={item.actual} /> · Estimate <Duration value={item.estimated} /></p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Pending requests" description="WFH and leave requests awaiting review or more information." actions={<Button variant="link" size="sm" onClick={() => router.push('/requests')}>Open queue</Button>} />
          {view.pendingRequests.length === 0 ? <EmptyState title="No pending requests" description="The assigned queue is clear." /> : (
            <ul className="mt-3 divide-y divide-border">
              {view.pendingRequests.slice(0, 5).map((request) => (
                <li key={`${request.kind}-${request.id}`} className="flex items-center justify-between gap-3 py-3">
                  <div><p className="text-body-sm font-medium text-ink">{request.employee.fullName}</p><p className="text-caption text-ink-muted">{request.kind === 'wfh' ? 'WFH' : 'Leave'} · {request.dateLabel}</p></div>
                  <Badge tone={request.state === 'information_requested' ? 'warning' : 'accent'}>{request.stateLabel}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title="Division hours" description="Aggregated across the selected period with source attribution retained." />
          <ul className="mt-3 space-y-3">
            {view.divisionHours.map((item) => (
              <li key={item.division.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-sunken px-3 py-2.5">
                <div><p className="text-body-sm font-medium text-ink">{item.division.name}</p><p className="text-caption text-ink-muted">{item.division.code} · {item.sharePercent}% share</p></div>
                <span className="text-body-sm font-semibold text-ink"><Duration value={item.active} /></span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Workload and evaluations" description="Capacity warnings and current review progress." />
          <div className="mt-3 space-y-3">
            {view.workloadWarnings.map((warning) => (
              <div key={warning.employee.id} className="rounded-md border border-undertime-border bg-undertime-surface p-3">
                <p className="text-body-sm font-semibold text-ink">{warning.employee.fullName} · {warning.warningLabel}</p>
                <p className="mt-1 text-caption text-ink-muted">{warning.utilizationPercent}% planned · <Duration value={warning.planned} /> of <Duration value={warning.capacity} /></p>
              </div>
            ))}
            {view.evaluationStatus && (
              <div className="rounded-md border border-border bg-surface-sunken p-3">
                <p className="text-body-sm font-semibold text-ink">{view.evaluationStatus.periodLabel}</p>
                <p className="mt-1 text-caption text-ink-muted">{view.evaluationStatus.inProgress} in progress · {view.evaluationStatus.submitted} submitted · {view.evaluationStatus.published} published</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Recent time entries" description="Latest records in your assigned employee scope." actions={<Button variant="secondary" size="sm" iconTrailing={<ArrowRight aria-hidden className="size-4" />} onClick={() => router.push('/team/timesheets')}>Review timesheets</Button>} />
        <div className="mt-3 space-y-2">
          {view.recentEntries.map((row) => <TimesheetCompactRow key={`${row.employee.id}-${row.date}`} row={row} />)}
        </div>
      </Card>
    </PageContainer>
  );
}

function TimesheetCompactRow({ row }: { row: TeamTimesheetRowView }) {
  return (
    <a href={row.href} className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-border px-3 py-2 transition-colors hover:border-highlight-hover hover:bg-surface-sunken">
      <div className="min-w-0"><p className="truncate text-body-sm font-medium text-ink">{row.employee.fullName}</p><p className="text-caption text-ink-muted">{row.dateLabel} · <Duration value={row.active} /> active</p></div>
      <StatusIndicator status={row.status.status} />
    </a>
  );
}

export function TeamMembers() {
  const { user } = useSession();
  const { state } = useAsync(() => mockTeamLeadService.listMembers(user?.userId ?? ''), [user?.userId]);
  if (state.status === 'loading') return <LoadingPage label="assigned employees" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Team unavailable" /></PageContainer>;
  return (
    <PageContainer>
      <PageHeader title="My Team" description="Employees explicitly assigned to your Team Lead scope." meta={<ScopeBadge />} />
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.data.map((member) => (
          <Card key={member.employee.id}>
            <div className="flex items-start justify-between gap-3"><div><h2 className="text-h3 text-ink">{member.employee.fullName}</h2><p className="text-body-sm text-ink-muted">{member.employee.employeeCode} · {member.employee.designation}</p></div><StatusIndicator status={member.status.status} /></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{member.divisions.map((division) => <Badge key={division.id} tone="neutral">{division.code}</Badge>)}</div>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
              <div><dt className="text-caption text-ink-muted">Today</dt><dd className="text-body-sm font-semibold text-ink"><Duration value={member.active} /></dd></div>
              <div><dt className="text-caption text-ink-muted">Location</dt><dd className="text-body-sm font-semibold text-ink">{member.attendanceLabel}</dd></div>
              <div><dt className="text-caption text-ink-muted">Open remarks</dt><dd className="text-body-sm font-semibold text-ink">{member.openRemarkCount}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}

const STATUS_OPTIONS = [
  { value: 'missing', label: 'Missing' }, { value: 'under_time', label: 'Under-time' },
  { value: 'overtime', label: 'Overtime' }, { value: 'critical', label: 'Critical' },
] as const;

export function TeamTimesheets() {
  const router = useRouter();
  const { user } = useSession();
  const [statuses, setStatuses] = React.useState<readonly string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = window.localStorage.getItem('oms.team-timesheet-statuses');
      return stored ? (JSON.parse(stored) as string[]) : [];
    } catch {
      return [];
    }
  });
  const [selectedIds, setSelectedIds] = React.useState<readonly string[]>([]);
  const [saved, setSaved] = React.useState(false);
  const { state } = useAsync(() => mockTeamLeadService.listTimesheets(user?.userId ?? ''), [user?.userId]);
  if (state.status === 'loading') return <LoadingPage label="team timesheets" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="error" title="Timesheets unavailable" /></PageContainer>;
  const rows = statuses.length ? state.data.filter((row) => statuses.includes(row.status.status)) : state.data;
  const columns: readonly DataTableColumn<TeamTimesheetRowView>[] = [
    { key: 'employee', header: 'Employee', alwaysVisible: true, render: (row) => <div><p className="font-medium text-ink">{row.employee.fullName}</p><p className="text-caption text-ink-muted">{row.employee.employeeCode}</p></div> },
    { key: 'date', header: 'Date', render: (row) => row.dateLabel },
    { key: 'active', header: 'Active', align: 'right', render: (row) => <Duration value={row.active} /> },
    { key: 'break', header: 'Break', align: 'right', hideBelow: 'lg', render: (row) => <Duration value={row.break} /> },
    { key: 'total', header: 'Total', align: 'right', render: (row) => <Duration value={row.total} emphasis /> },
    { key: 'divisions', header: 'Division contribution', hideBelow: 'lg', render: (row) => <div className="flex flex-wrap gap-1">{row.divisionContributions.map((item) => <Badge key={item.division.id} tone="neutral">{item.division.code} {item.active.display}</Badge>)}</div> },
    { key: 'location', header: 'Location', hideBelow: 'md', render: (row) => row.workLocations.join(', ') || 'Not recorded' },
    { key: 'status', header: 'Status', alwaysVisible: true, render: (row) => <StatusIndicator status={row.status.status} /> },
  ];
  return (
    <PageContainer>
      <PageHeader title="Team Timesheets" description="Exception-focused review across employees assigned to you." meta={<ScopeBadge />} />
      <FilterBar className="mt-5" applied={statuses.length ? [{ key: 'status', label: 'Status', value: statuses.map((status) => STATUS_OPTIONS.find((item) => item.value === status)?.label).join(', '), onRemove: () => setStatuses([]) }] : []} onClearAll={() => setStatuses([])} resultSummary={`${rows.length} assigned-scope records`}>
        <MultiSelectFilter label="Status" options={STATUS_OPTIONS} selected={statuses} onChange={setStatuses} />
        <Button variant="secondary" size="sm" onClick={() => { window.localStorage.setItem('oms.team-timesheet-statuses', JSON.stringify(statuses)); setSaved(true); window.setTimeout(() => setSaved(false), 2000); }}>{saved ? 'Filter saved' : 'Save filter'}</Button>
      </FilterBar>
      {selectedIds.length > 0 && <p role="status" className="mt-4 rounded-md border border-accent-border bg-accent-subtle p-3 text-body-sm text-ink">{selectedIds.length} record{selectedIds.length === 1 ? '' : 's'} selected. Open each record for review; daily status is never changed in bulk.</p>}
      <DataTable className="mt-4" rows={rows} columns={columns} getRowId={(row) => `${row.employee.id}-${row.date}`} caption="Assigned team timesheets" selectedIds={selectedIds} onSelectionChange={setSelectedIds} onRowClick={(row) => router.push(row.href)} emptyState={{ variant: 'no-results', title: 'No matching timesheets', description: 'Clear filters to see all assigned records.' }} renderMobileCard={(row) => <div><div className="flex items-start justify-between gap-2"><div><p className="font-semibold text-ink">{row.employee.fullName}</p><p className="text-caption text-ink-muted">{row.dateLabel}</p></div><StatusIndicator status={row.status.status} /></div><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="text-caption text-ink-muted">Active</p><Duration value={row.active} /></div><div><p className="text-caption text-ink-muted">Break</p><Duration value={row.break} /></div><div><p className="text-caption text-ink-muted">Total</p><Duration value={row.total} emphasis /></div></div><p className="mt-3 text-caption text-ink-muted"><MapPin aria-hidden className="mr-1 inline size-3.5" />{row.workLocations.join(', ') || 'Not recorded'}</p></div>} />
    </PageContainer>
  );
}

export function TeamTimesheetDetail({ employeeId, date }: { employeeId: string; date: string }) {
  const { user } = useSession();
  const toast = useToast();
  const [version, setVersion] = React.useState(0);
  const [message, setMessage] = React.useState('');
  const [correction, setCorrection] = React.useState(false);
  const [requestedChanges, setRequestedChanges] = React.useState('');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState('');
  const { state } = useAsync(() => mockTeamLeadService.getTimesheet(user?.userId ?? '', employeeId, date), [user?.userId, employeeId, date, version]);
  if (state.status === 'loading') return <LoadingPage label="timesheet detail" />;
  if (state.status !== 'success') return <PageContainer><EmptyState variant="no-results" title="Timesheet not found" description="The record may be outside your assigned scope." /></PageContainer>;
  const day = state.data;
  const employeeName = day.employee?.fullName ?? employeeId;
  async function submitRemark() {
    if (!message.trim() || (correction && !requestedChanges.trim())) { setError('Enter the general remark and the requested changes.'); return; }
    const result = await mockTeamLeadService.addRemark({ userId: user?.userId ?? '', employeeId, date, message, requestedChanges: correction ? requestedChanges : null });
    if (result.status === 'success') { setConfirmOpen(false); setMessage(''); setRequestedChanges(''); setCorrection(false); setError(''); setVersion((value) => value + 1); toast.show({ tone: 'success', title: correction ? 'Correction request sent' : 'General remark added', description: 'The employee notification is queued in this demo.' }); }
  }
  return (
    <PageContainer>
      <PageHeader title={`${employeeName} · ${day.dateLabel}`} crumbs={[{ label: 'Team Timesheets', href: '/team/timesheets' }, { label: day.dateLabel }]} backHref="/team/timesheets" backLabel="Team timesheets" meta={<><ScopeBadge /><StatusIndicator status={day.summary.status.status} /></>} />
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.75fr)]">
        <div className="space-y-5">
          <Card><CardHeader title="Calculation breakdown" description={`Policy v${day.policyVersion} · ${day.timezone}`} /><dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4"><div><dt className="text-caption text-ink-muted">Active work</dt><dd className="text-metric text-ink"><Duration value={day.summary.active} /></dd></div><div><dt className="text-caption text-ink-muted">Separate break</dt><dd className="text-metric text-ink"><Duration value={day.summary.break} /></dd></div><div><dt className="text-caption text-ink-muted">Total</dt><dd className="text-metric text-ink"><Duration value={day.summary.total} /></dd></div><div><dt className="text-caption text-ink-muted">Required active</dt><dd className="text-metric text-ink"><Duration value={day.summary.requiredActive} /></dd></div></dl></Card>
          {(day.summary.status.status === 'critical' || day.summary.status.status === 'overtime' || day.summary.status.status === 'missing' || day.summary.status.status === 'under_time') && (
            <Card className="border-undertime-border bg-undertime-surface">
              <CardHeader
                title="Anomaly detected"
                description={`This record is classified ${day.summary.status.label}. Review the entries and add a general remark when follow-up is needed.`}
                actions={<AlertTriangle aria-hidden className="size-5 text-warning" />}
              />
              {/*
                The stated cause, not just the classification. A day above eight
                hours requires a reason and a day above twelve requires an
                explanation; a reviewer shown neither has no basis on which to
                review (`REQ-TIME-018`, `REQ-TIME-019`).
              */}
              {(day.summary.criticalExplanation || day.summary.overtimeReason) && (
                <div className="mt-3 rounded-md border border-border bg-surface p-3">
                  <p className="text-label text-ink-muted">
                    {day.summary.criticalExplanation
                      ? 'Explanation recorded by the employee'
                      : 'Reason recorded by the employee'}
                  </p>
                  <p className="mt-1 text-body-sm text-ink">
                    {day.summary.criticalExplanation ?? day.summary.overtimeReason}
                  </p>
                </div>
              )}
              {day.summary.status.status === 'critical' && !day.summary.criticalExplanation && (
                <p className="mt-3 text-body-sm text-undertime">
                  No explanation is recorded for this critical day. Request one before the period
                  is verified.
                </p>
              )}
            </Card>
          )}
          <Card><CardHeader title="Time entries and completed work" description="All divisions are combined for the day while each source remains visible." />
            <ul className="mt-3 divide-y divide-border">{day.entries.map((entry) => <li key={entry.id} className="py-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-ink">{entry.project?.name ?? entry.division.name}</p><p className="text-caption text-ink-muted">{entry.division.code} · {entry.task?.title ?? 'No task'} · {entry.workLocationLabel}</p></div><Duration value={entry.duration} emphasis /></div><p className="mt-2 text-body-sm text-ink-muted">{entry.completedWork}</p><div className="mt-2 flex flex-wrap gap-2"><Badge tone="neutral">{entry.attachmentCount === 'restricted' ? 'Restricted' : <>{entry.attachmentCount} attachment{entry.attachmentCount === 1 ? '' : 's'}</>}</Badge>{entry.supportingLink && <a className="text-caption text-accent underline" href={entry.supportingLink}>Supporting link</a>}</div></li>)}</ul>
          </Card>
          <Card><CardHeader title="Remarks and change history" description="Clarifications and corrected values remain connected to this record." />
            {day.remarks.length === 0 ? <p className="mt-3 text-body-sm text-ink-muted">No general remarks yet.</p> : <ul className="mt-3 space-y-3">{day.remarks.map((remark) => <li key={remark.id} className="rounded-md border border-border bg-surface-sunken p-3"><div className="flex items-center justify-between gap-2"><p className="text-body-sm font-semibold text-ink">{remark.author.fullName}</p><Badge tone={remark.state === 'resolved' ? 'success' : remark.state === 'corrected' ? 'accent' : 'warning'}>{REMARK_STATE_LABEL[remark.state]}</Badge></div><p className="mt-2 text-body-sm text-ink-muted">{remark.message}</p><p className="mt-2 text-caption text-ink-subtle">{remark.responseCount} clarification response{remark.responseCount === 1 ? '' : 's'} · {remark.createdAtLabel}</p></li>)}</ul>}
            {day.teamReview && <div className="mt-4 rounded-md border border-accent-border bg-accent-subtle p-4"><p className="text-body-sm font-semibold text-ink">Employee clarification</p><p className="mt-1 text-body-sm text-ink-muted">{day.teamReview.clarification}</p><h3 className="mt-4 text-label text-ink">Corrected values</h3><dl className="mt-2 space-y-2">{day.teamReview.correctedValues.map((value) => <div key={value.label} className="grid gap-1 rounded-md bg-surface p-2 sm:grid-cols-[8rem_1fr_1fr]"><dt className="text-caption font-semibold text-ink">{value.label}</dt><dd className="text-caption text-ink-muted"><span className="sr-only">Before: </span>{value.before}</dd><dd className="text-caption text-accent"><span className="sr-only">After: </span>{value.after}</dd></div>)}</dl></div>}
          </Card>
        </div>
        <aside className="space-y-5">
          <Card><CardHeader title="Add general remark" description="Use the single remark type for time, task, quality, performance, or missing information." /><div className="mt-4 space-y-4"><Field label="General remark" required error={error}><Textarea rows={5} value={message} onChange={(event) => setMessage(event.target.value)} /></Field><Checkbox label="Request a correction to this record" checked={correction} onChange={(event) => setCorrection(event.target.checked)} />{correction && <Field label="Requested changes" required helperText="Describe the exact value or entry the employee should review."><Textarea rows={4} value={requestedChanges} onChange={(event) => setRequestedChanges(event.target.value)} /></Field>}<Button variant="primary" className="w-full" iconLeading={<MessageSquareText aria-hidden className="size-4" />} onClick={() => { if (!message.trim() || (correction && !requestedChanges.trim())) setError('Enter the required details.'); else setConfirmOpen(true); }}>Preview and send</Button></div></Card>
          <Card className="min-w-0 overflow-hidden"><CardHeader title="Correction workflow" description="A durable history from review to resolution." /><StepIndicator className="[&_ol]:!flex-col [&_ol]:!items-stretch [&_ol]:!gap-3 [&_li>.h-px]:!hidden" label="Correction workflow" currentIndex={Math.max(0, ['open','responded','corrected','resolved'].indexOf(day.remarks[0]?.state ?? 'open'))} steps={(['open','responded','corrected','resolved'] as const).map((key) => ({ key, label: REMARK_STATE_LABEL[key] }))} /></Card>
          <Card><CardHeader title="Record history" /><ul className="mt-3 space-y-3 text-body-sm text-ink-muted"><li>Created from employee time entries</li><li>Calculated with policy v{day.policyVersion}</li><li>{day.summary.isLocked ? 'Locked after HR period verification' : 'Open for employee correction'}</li></ul></Card>
        </aside>
      </div>
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title={correction ? 'Send correction request?' : 'Add general remark?'} description={`${employeeName} · ${day.dateLabel}`} dismissOnBackdrop={false} footer={<><Button variant="secondary" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button variant="primary" onClick={submitRemark}>Confirm and notify</Button></>}><div className="space-y-3"><div className="rounded-md bg-surface-sunken p-3"><p className="text-label text-ink-muted">Linked record</p><p className="mt-1 text-body-sm font-medium text-ink">{employeeName} · {day.dateLabel}</p></div><div><p className="text-label text-ink-muted">General remark</p><p className="mt-1 text-body-sm text-ink">{message}</p></div>{correction && <div><p className="text-label text-ink-muted">Requested changes</p><p className="mt-1 text-body-sm text-ink">{requestedChanges}</p></div>}<div className="rounded-md border border-accent-border bg-accent-subtle p-3"><p className="text-body-sm font-semibold text-ink">Notification preview</p><p className="mt-1 text-caption text-ink-muted">The employee will be notified with the record date and a safe link to review it.</p></div></div></Dialog>
    </PageContainer>
  );
}
