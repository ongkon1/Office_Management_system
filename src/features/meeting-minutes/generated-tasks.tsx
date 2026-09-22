'use client';

import * as React from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { GeneratedTaskView, MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { Card } from '@/components/feedback/card';
import { DataTable, type DataTableColumn } from '@/components/data/data-table';
import { Badge } from '@/components/ui/badge';

type VisibleTask = Extract<GeneratedTaskView, { access: 'visible' }>;

const ACTION_LINK =
  'inline-flex min-h-6 items-center rounded-xs text-body-sm font-medium text-accent hover:underline';

/** Why there are no tasks, by where processing stands. */
const NO_TASKS: Readonly<Record<MeetingMinuteDetailView['processing']['status'], string>> = {
  not_processed: 'AI was not asked to read this minute, so no tasks were created from it.',
  pending: 'Tasks will appear here once task generation finishes.',
  processing: 'Tasks will appear here once task generation finishes.',
  processed: 'Task generation finished and found no tasks to create.',
  failed: 'Task generation did not finish, so no tasks were created.',
};

function Assignee({ task }: { task: VisibleTask }) {
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      {/* Never a blank: an unassigned task says so (`REQ-MTG-014`). */}
      <span>{task.assigneeName ?? 'Unassigned'}</span>
      {task.reassignedSinceGeneration && (
        <span className="text-caption text-ink-muted">
          {task.matchOutcome.kind === 'unassigned'
            ? 'Assigned since it was created'
            : 'Reassigned since it was created'}
        </span>
      )}
    </span>
  );
}

function OpenTask({ task }: { task: VisibleTask }) {
  return (
    // The same pattern as the list's View and Edit links: the visible word stays
    // short and the hidden title completes the accessible name. A colon here
    // read as "Open task colon …" in Chromium, which spaces an absolutely
    // positioned span off from the text before it.
    <Link href={task.href} className={ACTION_LINK}>
      Open task<span className="sr-only"> {task.title}</span>
    </Link>
  );
}

const COLUMNS: readonly DataTableColumn<VisibleTask>[] = [
  {
    key: 'position',
    header: '#',
    widthClass: 'w-10',
    render: (task) => <span className="tabular text-ink-muted">{task.position}</span>,
  },
  { key: 'title', header: 'Task', alwaysVisible: true, render: (task) => task.title },
  { key: 'assignee', header: 'Assigned to', render: (task) => <Assignee task={task} /> },
  { key: 'priority', header: 'Priority', render: (task) => task.priorityLabel },
  { key: 'due', header: 'Due', render: (task) => task.dueDateLabel },
  { key: 'status', header: 'Status', render: (task) => task.statusLabel },
  { key: 'match', header: 'How it was assigned', hideBelow: 'lg', render: (task) => task.matchOutcome.label },
  { key: 'open', header: 'Action', alwaysVisible: true, render: (task) => <OpenTask task={task} /> },
];

function TaskCard({ task }: { task: VisibleTask }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="font-medium text-ink">
        <span className="tabular text-ink-muted">{task.position}. </span>
        {task.title}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-body-sm">
        <dt className="text-ink-muted">Assigned to</dt>
        <dd className="min-w-0">
          <Assignee task={task} />
        </dd>
        <dt className="text-ink-muted">Priority</dt>
        <dd>{task.priorityLabel}</dd>
        <dt className="text-ink-muted">Due</dt>
        <dd>{task.dueDateLabel}</dd>
        <dt className="text-ink-muted">Status</dt>
        <dd>{task.statusLabel}</dd>
        <dt className="text-ink-muted">How it was assigned</dt>
        <dd>{task.matchOutcome.label}</dd>
      </dl>
      <OpenTask task={task} />
    </div>
  );
}

/**
 * `FE-1123` — the tasks a minute's run created; `FE-1124` — where they came
 * from, said without implying AI decided anything about access.
 *
 * Three things this section is careful about:
 *
 * - **It is not the AI summary.** The summary (`FE-1122`) describes the
 *   meeting; these are pieces of work created from it. They sit in separate
 *   sections with separate headings.
 * - **Origin, not authority.** Each task was *proposed* by task generation and
 *   *assigned* by matching rules, and the section says so, together with what
 *   actually governs the task afterwards: its project and assignment, like any
 *   other task. Nothing here suggests AI granted anyone access, and a match
 *   outcome is worded as grounds for a proposal, never as a permission.
 * - **Only what the viewer can open.** The service lists a task as visible
 *   only when the task page itself would open it for this viewer, so every
 *   Open task link lands. The others keep their numbered place — their
 *   existence follows from the minute the viewer can read — and are counted
 *   in a sentence rather than named.
 */
export function GeneratedTasks({ minute }: { minute: MeetingMinuteDetailView }) {
  const headingId = React.useId();
  const visible = minute.generatedTasks.filter(
    (task): task is VisibleTask => task.access === 'visible',
  );
  const restrictedCount = minute.generatedTasks.length - visible.length;

  return (
    <section aria-labelledby={headingId} className="mt-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-h3 text-ink">
              Tasks created from this meeting
            </h2>
            <p className="mt-0.5 max-w-2xl text-body-sm text-ink-muted">
              Proposed by task generation and assigned by matching the minute against the team.
              Each one is ordinary work: who can see it and log time on it follows its project and
              assignment, like any other task.
            </p>
          </div>
          <Badge tone="neutral" icon={<Sparkles aria-hidden className="size-3.5 shrink-0" />}>
            AI-generated
          </Badge>
        </div>

        {minute.generatedTasks.length === 0 ? (
          <p className="mt-4 text-body-sm text-ink-muted">{NO_TASKS[minute.processing.status]}</p>
        ) : (
          <>
            {visible.length > 0 && (
              <DataTable
                className="mt-4"
                caption={`Tasks created from ${minute.title}`}
                rows={visible}
                columns={COLUMNS}
                getRowId={(task) => task.linkId}
                renderMobileCard={(task) => <TaskCard task={task} />}
              />
            )}
            {minute.duplicateProposalCount > 0 && (
              // `REQ-MTG-011`: the run heard the same work twice and created it
              // once. Said here so the list does not look short.
              <p className="mt-4 text-body-sm text-ink-muted">
                {minute.duplicateProposalCount === 1
                  ? 'One more proposed task repeated one already created, so it was not added again.'
                  : `${minute.duplicateProposalCount} more proposed tasks repeated ones already created, so they were not added again.`}
              </p>
            )}
            {restrictedCount > 0 && (
              <p className="mt-4 text-body-sm text-ink-muted">
                {restrictedCount === 1
                  ? 'One task created from this meeting is not shown, because you do not have access to it.'
                  : `${restrictedCount} tasks created from this meeting are not shown, because you do not have access to them.`}
              </p>
            )}
          </>
        )}
      </Card>
    </section>
  );
}
