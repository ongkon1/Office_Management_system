'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Clock3, Coffee, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { WorkLog } from '@/contracts/work-log';
import type { TimesheetDayView } from '@/contracts/view-models';
import { cn } from '@/lib/cn';
import { addDays, formatDate } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { Button, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { toDurationView } from '@/lib/status';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Dialog, DropdownMenu } from '@/components/feedback/overlay';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
import { mockTimesheetService } from '@/services/mock/timesheet';
import { WorkLogDrawer, type CopiedWorkLogDraft } from './work-log-drawer';

export function DayView({
  employeeId,
  date,
  initialLogTaskId,
  initialEditWorkLogId,
}: {
  employeeId: string;
  date: string;
  initialLogTaskId?: string;
  initialEditWorkLogId?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { state, reload } = useAsync(
    () => mockTimesheetService.getDay({ employeeId, date }),
    [employeeId, date],
  );

  const [workLogOpen, setWorkLogOpen] = React.useState(Boolean(initialLogTaskId));
  const [copiedWorkLog, setCopiedWorkLog] = React.useState<CopiedWorkLogDraft>();
  const [editingWorkLog, setEditingWorkLog] = React.useState<WorkLog>();
  const [copyingId, setCopyingId] = React.useState<string | null>(null);
  const [handledLogTaskId, setHandledLogTaskId] = React.useState(initialLogTaskId);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!initialEditWorkLogId) return;
    let cancelled = false;
    void mockTimesheetService.getWorkLog(initialEditWorkLogId).then((result) => {
      if (
        cancelled ||
        result.status !== 'success' ||
        result.data.employeeId !== employeeId ||
        result.data.workDate !== date
      ) return;
      setCopiedWorkLog(undefined);
      setEditingWorkLog(result.data);
      setWorkLogOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [date, employeeId, initialEditWorkLogId]);

  if (initialLogTaskId !== handledLogTaskId) {
    setHandledLogTaskId(initialLogTaskId);
    if (initialLogTaskId) {
      setCopiedWorkLog(undefined);
      setWorkLogOpen(true);
    }
  }

  function openWorkLog() {
    setCopiedWorkLog(undefined);
    setEditingWorkLog(undefined);
    setWorkLogOpen(true);
  }

  async function openWorkLogEdit(entryId: string) {
    const result = await mockTimesheetService.getWorkLog(entryId);
    if (result.status !== 'success') {
      toast.show({ tone: 'error', title: result.message });
      return;
    }
    setCopiedWorkLog(undefined);
    setEditingWorkLog(result.data);
    setWorkLogOpen(true);
  }

  async function copyFrom(source: WorkLog) {
    setCopyingId(source.id);
    const result = await mockTimesheetService.copyWorkLog({
      sourceWorkLogId: source.id,
      targetDate: date,
    });
    setCopyingId(null);
    if (result.status !== 'success') {
      toast.show({ tone: 'error', title: result.message });
      return;
    }
    setCopyOpen(false);
    setEditingWorkLog(undefined);
    setCopiedWorkLog({ input: result.data, sourceWorkDate: source.workDate });
    setWorkLogOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const result = await mockTimesheetService.deleteWorkLog(deleteId);
    setDeleteId(null);
    if (result.status === 'success') {
      toast.show({ tone: 'success', title: 'Entry removed' });
      reload();
    } else if (result.status === 'conflict') {
      toast.show({ tone: 'error', title: result.message, description: result.guidance });
    }
  }

  if (state.status === 'loading') {
    return (
      <PageContainer>
        <div role="status" aria-busy className="flex flex-col gap-5">
          <span className="sr-only">Loading timesheet</span>
          <Skeleton height="2rem" width="16rem" />
          <Skeleton height="8rem" rounded="md" />
          <Skeleton height="16rem" rounded="md" />
        </div>
      </PageContainer>
    );
  }

  if (state.status === 'failure') {
    return (
      <PageContainer>
        <EmptyState
          variant="error"
          title="Could not load this day"
          description="The request failed. Try again, or contact support if this continues."
          action={{ label: 'Try again', onClick: reload }}
        />
      </PageContainer>
    );
  }

  const day = state.data;
  const previous = addDays(date, -1);
  const next = addDays(date, 1);

  return (
    <PageContainer>
      <PageHeader
        title={day.dateLabel}
        crumbs={[{ label: 'My Timesheet', href: '/timesheets' }, { label: formatDate(date) }]}
        backHref="/timesheets"
        backLabel="All timesheets"
        meta={
          <>
            <StatusIndicator status={day.summary.status.status} />
            {day.exemption && <Badge tone="neutral">{day.exemption.label}</Badge>}
            {day.summary.isLocked && (
              <Badge tone="neutral" icon={<Lock aria-hidden className="size-3" />}>
                Verified period
              </Badge>
            )}
            <span className="text-caption text-ink-subtle">
              Policy v{day.policyVersion} · {day.timezone}
            </span>
          </>
        }
        actions={
          <>
            <IconButton
              label={`Previous day, ${formatDate(previous)}`}
              variant="secondary"
              icon={<ChevronLeft aria-hidden className="size-4" />}
              onClick={() => {
                router.push(`/timesheets/${previous}`);
              }}
            />
            <IconButton
              label={`Next day, ${formatDate(next)}`}
              variant="secondary"
              icon={<ChevronRight aria-hidden className="size-4" />}
              onClick={() => {
                router.push(`/timesheets/${next}`);
              }}
            />
            {day.canAddEntry && (
              <>
                <Button variant="secondary" onClick={() => setCopyOpen(true)}>
                  Copy previous
                </Button>
                <Button
                  variant="primary"
                  onClick={openWorkLog}
                  iconLeading={<Plus aria-hidden className="size-4" />}
                >
                  Log work
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mt-5 flex flex-col gap-5">
        {day.lockedReason && (
          <Alert tone="warning" title="This period is verified and locked">
            {day.lockedReason}
          </Alert>
        )}

        <DaySummaryCard day={day} />

        <Card padding="none">
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Work by task"
              description={
                day.entries.length === 0
                  ? 'Daily work logs are organized around tasks, not clock times.'
                  : `${day.entries.length} work log${day.entries.length === 1 ? '' : 's'} across the day`
              }
              as="h2"
            />
          </div>

          {day.entries.length === 0 ? (
            <div className="p-4 pt-0 sm:p-5 sm:pt-0">
              <EmptyState
                variant="empty"
                title={
                  day.exemption
                    ? `Nothing recorded — ${day.exemption.label.toLowerCase()}`
                    : 'No work logged yet'
                }
                description={
                  day.exemption
                    ? 'No work is required on this day.'
                    : day.canAddEntry
                      ? 'Log active time against an In Progress task.'
                      : 'This period is locked.'
                }
                action={
                  day.canAddEntry ? { label: 'Log work', onClick: openWorkLog } : undefined
                }
              />
            </div>
          ) : (
            <div className="border-t border-border">
              <div
                aria-hidden
                className="hidden grid-cols-[minmax(12rem,1.05fr)_minmax(7rem,0.55fr)_6rem_minmax(7rem,0.55fr)_minmax(14rem,1.3fr)_2.75rem] gap-4 border-b border-border bg-accent-subtle/70 px-5 py-3 xl:grid"
              >
                {['Task', 'Division', 'Duration', 'Location', 'Description', ''].map(
                  (label, index) => (
                    <span
                      key={`${label}-${index}`}
                      className={cn(
                        'text-label font-semibold tracking-wide text-ink-muted',
                        label === 'Duration' && 'text-right',
                      )}
                    >
                      {label}
                    </span>
                  ),
                )}
              </div>
              <ul className="divide-y divide-border" aria-label="Work logs by task">
              {day.entries.map((entry) => (
                <li
                  key={entry.id}
                  className="grid min-w-0 gap-4 px-4 py-4 transition-colors duration-150 hover:bg-accent-subtle/30 sm:px-5 xl:grid-cols-[minmax(12rem,1.05fr)_minmax(7rem,0.55fr)_6rem_minmax(7rem,0.55fr)_minmax(14rem,1.3fr)_2.75rem] xl:items-start"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-medium text-ink-muted xl:hidden">Task</p>
                    {entry.task ? (
                      <Link
                        href={`/tasks/${entry.task.id}`}
                        className="inline-flex min-h-6 items-center font-semibold text-ink underline-offset-2 hover:text-accent hover:underline"
                      >
                        {entry.task.title}
                      </Link>
                    ) : (
                      <p className="font-semibold text-ink">Task not recorded</p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {entry.project && <Badge>{entry.project.code}</Badge>}
                      {entry.isDraft && <Badge tone="warning">Draft</Badge>}
                      {entry.recordKind === 'historical_clock_entry' && (
                        <Badge
                          tone="neutral"
                          icon={<Clock3 aria-hidden className="size-3" />}
                        >
                          Recorded before task-based logging
                        </Badge>
                      )}
                    </div>
                    {entry.recordKind === 'historical_clock_entry' && entry.timeRangeLabel && (
                      <p className="mt-1.5 text-caption text-ink-muted">
                        Original range: {entry.timeRangeLabel} · Read-only historical record
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-caption font-medium text-ink-muted xl:hidden">Division</p>
                    <p className="mt-0.5 text-body-sm text-ink xl:mt-0">{entry.division.name}</p>
                    <p className="text-caption text-ink-subtle">{entry.division.code}</p>
                  </div>

                  <div>
                    <p className="text-caption font-medium text-ink-muted xl:hidden">Duration</p>
                    <p className="mt-0.5 text-body font-semibold text-ink xl:mt-0 xl:text-right">
                      <Duration value={entry.duration} />
                    </p>
                  </div>

                  <div>
                    <p className="text-caption font-medium text-ink-muted xl:hidden">Location</p>
                    <p className="mt-0.5 text-body-sm text-ink xl:mt-0">{entry.workLocationLabel}</p>
                  </div>

                  <div className="min-w-0">
                    <p className="text-caption font-medium text-ink-muted xl:hidden">Description</p>
                    <p className="mt-0.5 text-body-sm text-ink xl:mt-0">{entry.workDescription}</p>
                    <p className="mt-1 text-caption text-ink-muted">
                      <span className="font-medium text-ink-subtle">Completed:</span>{' '}
                      {entry.completedWork}
                    </p>
                  </div>

                  <div className="flex justify-end xl:block">
                    {(entry.canEdit || entry.canDelete) && (
                      <DropdownMenu
                        label={`Actions for ${entry.task?.title ?? 'work log'}`}
                        items={[
                          {
                            key: 'edit',
                            label: entry.timeRangeLabel ? 'Edit historical entry' : 'Edit work log',
                            icon: <Pencil aria-hidden className="size-4" />,
                            onSelect: () => {
                              void openWorkLogEdit(entry.id);
                            },
                          },
                          {
                            key: 'delete',
                            label: entry.timeRangeLabel ? 'Delete historical entry' : 'Delete work log',
                            icon: <Trash2 aria-hidden className="size-4" />,
                            onSelect: () => setDeleteId(entry.id),
                            destructive: true,
                          },
                        ]}
                        trigger={
                          <IconButton
                            label={`Actions for ${entry.task?.title ?? 'work log'}`}
                            variant="ghost"
                            size="sm"
                            icon={<MoreHorizontal aria-hidden className="size-4" />}
                          />
                        }
                      />
                    )}
                  </div>
                </li>
              ))}
              </ul>

              {/* The break is one daily value, shown as its own row rather
                  than folded into an entry (`REQ-TIME-012`). */}
              <div className="flex flex-wrap items-center gap-3 border-t border-border bg-surface-sunken px-4 py-3 sm:px-5">
                <Coffee aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1 text-body-sm text-ink-muted">
                  Recognized break — shown once for the day, never added per task
                </span>
                <span className="text-body font-semibold text-ink">
                  <Duration value={day.breakEntry.duration} />
                </span>
              </div>
            </div>
          )}
        </Card>

        {day.remarks.length > 0 && (
          <Card>
            <CardHeader title="Remarks on this day" as="h2" />
            <ul className="mt-3 flex flex-col gap-3">
              {day.remarks.map((remark) => (
                <li key={remark.id} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-medium text-ink">
                      {remark.author.fullName}
                    </span>
                    {remark.isCorrectionRequest && (
                      <Badge tone="warning">Correction requested</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-body-sm text-ink-muted">{remark.message}</p>
                  <Link
                    href={`/remarks/${remark.id}`}
                    className="mt-2 inline-flex min-h-6 items-center text-caption text-accent underline underline-offset-2"
                  >
                    Open remark
                  </Link>
                  {remark.isCorrectionRequest && remark.relatedHref?.includes('workLog=') && (
                    <Link
                      href={remark.relatedHref}
                      className="ml-4 mt-2 inline-flex min-h-6 items-center text-caption text-accent underline underline-offset-2"
                    >
                      Edit linked work log
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <WorkLogDrawer
        open={workLogOpen && day.canAddEntry}
        onClose={() => setWorkLogOpen(false)}
        employeeId={employeeId}
        defaultWorkDate={date}
        initialTaskId={initialLogTaskId}
        copiedDraft={copiedWorkLog}
        editingWorkLog={editingWorkLog}
        onSaved={reload}
      />

      <CopyWorkLogDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        employeeId={employeeId}
        beforeDate={date}
        copyingId={copyingId}
        onPick={copyFrom}
      />

      <Dialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete this entry?"
        description="The time will be removed from this day's totals."
        dismissOnBackdrop={false}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete
            </Button>
          </>
        }
      />
    </PageContainer>
  );
}

function DaySummaryCard({ day }: { day: TimesheetDayView }) {
  const summary = day.summary;

  return (
    <Card>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Active work', value: summary.active, emphasis: true },
          { label: 'Break', value: summary.break },
          { label: 'Daily total', value: summary.total, emphasis: true },
          { label: 'Remaining', value: summary.remainingActive },
        ].map((item) => (
          <div key={item.label}>
            <p className="text-label text-ink-muted">{item.label}</p>
            <p
              className={cn(
                'mt-0.5 text-metric tabular text-ink',
                item.emphasis && 'font-semibold',
              )}
            >
              <Duration value={item.value} />
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <ProgressBar
          value={summary.scheduleProgressPercent}
          label="Progress toward the scheduled day"
          valueText={`${summary.total.display} of ${
            summary.requiredActive.minutes > 0 ? '8:00' : '—'
          }`}
          tone={
            summary.status.status === 'critical'
              ? 'critical'
              : summary.status.status === 'overtime'
                ? 'overtime'
                : summary.status.status === 'complete'
                  ? 'complete'
                  : 'undertime'
          }
        />
      </div>

      {day.divisionContributions.length > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="text-label text-ink-muted">Division contribution</p>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
            {day.divisionContributions.map((contribution) => (
              <li key={contribution.division.id} className="flex items-baseline gap-1.5">
                <span className="text-body-sm text-ink">{contribution.division.name}</span>
                <span className="text-body-sm font-semibold text-ink tabular">
                  <Duration value={contribution.active} />
                </span>
                <span className="text-caption text-ink-subtle">
                  {contribution.sharePercent}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** Picks a recent saved work log to copy onto this date (`MFE-0307`). */
function CopyWorkLogDialog({
  open,
  onClose,
  employeeId,
  beforeDate,
  copyingId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  beforeDate: string;
  copyingId: string | null;
  onPick: (workLog: WorkLog) => void;
}) {
  const { state, reload } = useAsync(
    () =>
      mockTimesheetService.listWorkLogs({
        pagination: { page: 1, pageSize: 100 },
        filters: {
          employeeIds: [employeeId],
          dateRange: {
            from: addDays(beforeDate, -14),
            to: addDays(beforeDate, -1),
          },
        },
      }),
    [employeeId, beforeDate],
  );

  const recent =
    state.status === 'success'
      ? [...state.data.items]
          .filter((workLog) => workLog.state !== 'draft')
          .sort(
            (a, b) =>
              b.workDate.localeCompare(a.workDate) || b.createdAt.localeCompare(a.createdAt),
          )
          .slice(0, 12)
      : [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Copy a previous work log"
      description={`Choose saved work from the last two weeks. It opens on ${formatDate(beforeDate)} as an unsaved draft for review.`}
    >
      {state.status === 'loading' ? (
        <div role="status" aria-busy className="space-y-2">
          <span className="sr-only">Loading recent work logs</span>
          <Skeleton height="4.5rem" rounded="md" />
          <Skeleton height="4.5rem" rounded="md" />
          <Skeleton height="4.5rem" rounded="md" />
        </div>
      ) : state.status === 'failure' ? (
        <Alert
          tone="danger"
          title="Recent work logs could not be loaded"
          actions={
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          }
        >
          Try again. No draft has been created.
        </Alert>
      ) : recent.length === 0 ? (
        <EmptyState
          variant="empty"
          title="No saved work logs to copy"
          description="There are no eligible work logs in the previous two weeks."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((workLog) => (
            <li key={workLog.id}>
              <button
                type="button"
                disabled={copyingId !== null}
                aria-busy={copyingId === workLog.id}
                onClick={() => onPick(workLog)}
                className="min-h-11 w-full rounded-md border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-sunken disabled:cursor-wait disabled:opacity-55"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-medium text-ink">
                    {formatDate(workLog.workDate)}
                  </span>
                  <span className="text-body-sm tabular text-ink-muted">
                    <Duration value={toDurationView(workLog.durationMinutes)} />
                  </span>
                </div>
                <p className="mt-0.5 truncate text-caption text-ink-muted">
                  {copyingId === workLog.id ? 'Preparing draft…' : workLog.workDescription}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

