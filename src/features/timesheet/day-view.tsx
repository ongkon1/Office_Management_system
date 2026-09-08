'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Coffee, Lock, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import type { TimeEntryInput } from '@/contracts/services';
import type { TimesheetDayView } from '@/contracts/view-models';
import { cn } from '@/lib/cn';
import { addDays, formatDate } from '@/lib/format';
import { useAsync } from '@/lib/use-async';
import { Button, IconButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';
import { ProgressBar } from '@/components/ui/progress';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, EmptyState } from '@/components/feedback/alert';
import { Dialog, DropdownMenu } from '@/components/feedback/overlay';
import { useToast } from '@/components/feedback/toast';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';
import { mockTimesheetService } from '@/services/mock/timesheet';
import { mockStore } from '@/services/mock/store';
import { DEMO_TODAY } from '@/lib/demo-context';
import { EntryDrawer } from './entry-drawer';
import { TimerPanel } from './timer-panel';

export function DayView({ employeeId, date }: { employeeId: string; date: string }) {
  const router = useRouter();
  const toast = useToast();
  const { state, reload } = useAsync(
    () => mockTimesheetService.getDay({ employeeId, date }),
    [employeeId, date],
  );

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | undefined>();
  const [initial, setInitial] = React.useState<Partial<TimeEntryInput> | undefined>();
  const [draftOrigin, setDraftOrigin] = React.useState<'copy' | 'timer' | null>(null);
  const [copyOpen, setCopyOpen] = React.useState(false);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);

  function openNew() {
    setEditingId(undefined);
    setInitial(undefined);
    setDraftOrigin(null);
    setDrawerOpen(true);
  }

  function openEdit(entryId: string) {
    const entry = mockStore.findEntry(entryId);
    if (!entry) return;
    setEditingId(entryId);
    setInitial({
      divisionId: entry.divisionId,
      projectId: entry.projectId,
      taskId: entry.taskId,
      entryMethod: entry.startTime ? 'manual_clock' : 'manual_duration',
      workLocation: entry.workLocation,
      startTime: entry.startTime ? entry.startTime.slice(11, 16) : null,
      endTime: entry.endTime ? entry.endTime.slice(11, 16) : null,
      activeMinutes: entry.activeMinutes,
      workDescription: entry.workDescription,
      completedWork: entry.completedWork,
      supportingLink: entry.supportingLink,
    });
    setDraftOrigin(null);
    setDrawerOpen(true);
  }

  async function copyFrom(sourceEntryId: string) {
    const result = await mockTimesheetService.copyEntry({ sourceEntryId, targetDate: date });
    setCopyOpen(false);
    if (result.status !== 'success') return;
    setEditingId(undefined);
    setInitial(result.data);
    setDraftOrigin('copy');
    setDrawerOpen(true);
  }

  function openTimerDraft(draft: TimeEntryInput) {
    setEditingId(undefined);
    setInitial(draft);
    setDraftOrigin('timer');
    setDrawerOpen(true);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    const result = await mockTimesheetService.deleteEntry(deleteId);
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
                  onClick={openNew}
                  iconLeading={<Plus aria-hidden className="size-4" />}
                >
                  Add time
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

        {date === DEMO_TODAY && !day.summary.isLocked && (
          <TimerPanel employeeId={employeeId} workDate={date} onDraft={openTimerDraft} />
        )}

        <Card padding="none">
          <div className="p-4">
            <CardHeader
              title="Entries"
              description={
                day.entries.length === 0
                  ? undefined
                  : `${day.entries.length} entr${day.entries.length === 1 ? 'y' : 'ies'}, plus one recognized break`
              }
              as="h2"
            />
          </div>

          {day.entries.length === 0 ? (
            <div className="p-4 pt-0">
              <EmptyState
                variant={day.exemption ? 'empty' : 'empty'}
                title={
                  day.exemption
                    ? `Nothing recorded — ${day.exemption.label.toLowerCase()}`
                    : 'No time recorded yet'
                }
                description={
                  day.exemption
                    ? 'No time is required on this day.'
                    : day.canAddEntry
                      ? 'Add your first entry for this date.'
                      : 'This period is locked.'
                }
                action={
                  day.canAddEntry ? { label: 'Add time', onClick: openNew } : undefined
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-border border-t border-border">
              {day.entries.map((entry) => (
                <li key={entry.id} className="flex gap-3 p-4">
                  <div
                    aria-hidden
                    className="mt-1 h-full w-1 shrink-0 rounded-full bg-accent"
                    style={{ minHeight: '2.5rem' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-ink">
                        <Duration value={entry.duration} />
                      </span>
                      {entry.timeRangeLabel && (
                        <span className="text-body-sm text-ink-muted">
                          {entry.timeRangeLabel}
                        </span>
                      )}
                      <Badge tone="neutral">{entry.division.code}</Badge>
                      {entry.project && <Badge>{entry.project.code}</Badge>}
                      <Badge tone="info">{entry.workLocationLabel}</Badge>
                      {entry.isDraft && <Badge tone="warning">Draft</Badge>}
                    </div>
                    <p className="mt-1.5 text-body-sm text-ink">{entry.workDescription}</p>
                    <p className="mt-0.5 text-caption text-ink-muted">
                      <span className="font-medium">Completed:</span> {entry.completedWork}
                    </p>
                    {entry.task && (
                      <Link
                        href={`/tasks/${entry.task.id}`}
                        className="mt-1 inline-flex min-h-6 items-center text-caption text-accent underline underline-offset-2"
                      >
                        {entry.task.title}
                      </Link>
                    )}
                  </div>
                  {(entry.canEdit || entry.canDelete) && (
                    <DropdownMenu
                      label={`Actions for the ${entry.duration.display} entry`}
                      items={[
                        {
                          key: 'edit',
                          label: 'Edit entry',
                          icon: <Pencil aria-hidden className="size-4" />,
                          onSelect: () => openEdit(entry.id),
                        },
                        {
                          key: 'delete',
                          label: 'Delete entry',
                          icon: <Trash2 aria-hidden className="size-4" />,
                          onSelect: () => setDeleteId(entry.id),
                          destructive: true,
                        },
                      ]}
                      trigger={
                        <IconButton
                          label="Entry actions"
                          variant="ghost"
                          size="sm"
                          icon={<Pencil aria-hidden className="size-4" />}
                        />
                      }
                    />
                  )}
                </li>
              ))}

              {/* The break is one daily value, shown as its own row rather
                  than folded into an entry (`REQ-TIME-012`). */}
              <li className="flex items-center gap-3 bg-surface-sunken p-4">
                <Coffee aria-hidden className="size-4 shrink-0 text-ink-muted" />
                <span className="flex-1 text-body-sm text-ink-muted">
                  Recognized break — one per day, not per entry
                </span>
                <span className="text-body font-semibold text-ink">
                  <Duration value={day.breakEntry.duration} />
                </span>
              </li>
            </ul>
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
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <EntryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        employeeId={employeeId}
        workDate={date}
        entryId={editingId}
        initial={initial}
        draftOrigin={draftOrigin}
        onSaved={reload}
      />

      <CopyEntryDialog
        open={copyOpen}
        onClose={() => setCopyOpen(false)}
        employeeId={employeeId}
        beforeDate={date}
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

/** Picks a recent entry to copy onto this date (`FE-0327`). */
function CopyEntryDialog({
  open,
  onClose,
  employeeId,
  beforeDate,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  beforeDate: string;
  onPick: (entryId: string) => void;
}) {
  const recent = React.useMemo(
    () =>
      mockStore
        .entriesBetween(employeeId, addDays(beforeDate, -14), addDays(beforeDate, -1))
        .sort((a, b) => b.workDate.localeCompare(a.workDate))
        .slice(0, 12),
    [employeeId, beforeDate],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Copy a previous entry"
      description={`The copy lands on ${formatDate(beforeDate)} as an editable draft.`}
    >
      {recent.length === 0 ? (
        <EmptyState
          variant="empty"
          title="Nothing to copy"
          description="There are no entries in the last two weeks."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => onPick(entry.id)}
                className="w-full rounded-md border border-border p-3 text-left transition-colors hover:border-border-strong hover:bg-surface-sunken"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-medium text-ink">
                    {formatDate(entry.workDate)}
                  </span>
                  <span className="text-body-sm tabular text-ink-muted">
                    {Math.floor(entry.activeMinutes / 60)}:
                    {String(entry.activeMinutes % 60).padStart(2, '0')}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-caption text-ink-muted">
                  {entry.workDescription}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

export { Play, Square };
