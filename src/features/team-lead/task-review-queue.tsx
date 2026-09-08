'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, X } from 'lucide-react';
import type { TaskReviewRowView } from '@/contracts/task-review';
import { mockTaskReviewService } from '@/services/mock/task-review';
import { useAsync } from '@/lib/use-async';
import { useSession } from '@/features/access/session-provider';
import { useToast } from '@/components/feedback/toast';
import { Card, CardHeader } from '@/components/feedback/card';
import { Alert, Callout } from '@/components/feedback/alert';
import { Dialog } from '@/components/feedback/overlay';
import { Field } from '@/components/forms/field';
import { Textarea } from '@/components/forms/inputs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Duration } from '@/components/ui/misc';

/**
 * `FE-0782` — the Team Lead's task review queue.
 *
 * Shown on the team task board rather than as a separate destination: a Team
 * Lead reviewing what their team proposed is doing the same job as looking at
 * the board, and a second route would make the queue easy to never visit.
 *
 * The panel disappears entirely when nothing is waiting. An empty queue with a
 * heading is a permanent reminder of nothing.
 */
export function TaskReviewQueue({ onDecided }: { onDecided?: () => void }) {
  const { user } = useSession();
  const toast = useToast();
  const [target, setTarget] = React.useState<{
    row: TaskReviewRowView;
    decision: 'approved' | 'rejected';
  } | null>(null);
  const [note, setNote] = React.useState('');
  const [noteError, setNoteError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { state, reload } = useAsync(
    () => mockTaskReviewService.queue(user?.userId ?? ''),
    [user?.userId],
  );

  if (state.status !== 'success' || state.data.rows.length === 0) return null;

  const rows = state.data.rows;

  async function decide() {
    if (!target) return;
    setNoteError(null);
    setConflict(null);
    setBusy(true);

    const result = await mockTaskReviewService.decide(user?.userId ?? '', target.row.id, {
      decision: target.decision,
      note,
    });
    setBusy(false);

    if (result.status === 'success') {
      const approved = target.decision === 'approved';
      setTarget(null);
      setNote('');
      reload();
      onDecided?.();
      toast.show({
        tone: approved ? 'success' : 'info',
        title: approved ? 'Task approved' : 'Task not approved',
        description: approved
          ? `${target.row.requestedByName} can now record time against it.`
          : `${target.row.requestedByName} will see your note.`,
      });
      return;
    }

    if (result.status === 'validation_failure') {
      setNoteError(
        result.fieldErrors.map((error) => `${error.message} ${error.guidance}`).join(' '),
      );
      return;
    }

    setTarget(null);
    setConflict(
      'guidance' in result ? `${result.message} ${result.guidance ?? ''}`.trim() : result.message,
    );
    reload();
  }

  return (
    <Card className="mt-5">
      <CardHeader
        title={`${rows.length} task${rows.length === 1 ? '' : 's'} raised by your team`}
        description="Approve a task before the person who raised it can record time against it."
      />

      {conflict && (
        <Alert tone="warning" className="mt-4" title="This could not be recorded" live>
          {conflict}
        </Alert>
      )}

      <ul aria-label="Tasks awaiting your review" className="mt-4 flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {/*
                  `inline-flex min-h-6` gives the link a 24px effective target
                  (WCAG 2.5.8). A bare inline link inherits the line box and
                  came out 18px tall — the same pattern every other list in the
                  product already uses.
                */}
                <Link
                  href={row.href}
                  className="inline-flex min-h-6 items-center text-body-sm font-medium text-ink hover:text-accent"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 text-caption text-ink-muted">
                  {row.requestedByName} · {row.projectLabel}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{row.divisionCode}</Badge>
                <Badge tone={row.priority === 'urgent' ? 'danger' : 'neutral'}>
                  {row.priority}
                </Badge>
              </div>
            </div>

            {row.description && (
              <p className="mt-2 text-caption text-ink-muted">{row.description}</p>
            )}

            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-ink-muted">
              <div>
                <dt className="inline">Estimate </dt>
                <dd className="inline tabular text-ink">
                  <Duration value={row.estimated} />
                </dd>
              </div>
              {row.dueDateLabel && (
                <div>
                  <dt className="inline">Due </dt>
                  <dd className="inline text-ink">{row.dueDateLabel}</dd>
                </div>
              )}
              <div>
                <dt className="inline">Raised </dt>
                <dd className="inline text-ink">{row.requestedAtLabel}</dd>
              </div>
            </dl>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                iconLeading={<Check aria-hidden className="size-4" />}
                onClick={() => setTarget({ row, decision: 'approved' })}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                iconLeading={<X aria-hidden className="size-4" />}
                onClick={() => setTarget({ row, decision: 'rejected' })}
              >
                Do not approve
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={target !== null}
        onClose={() => {
          setTarget(null);
          setNoteError(null);
        }}
        title={target?.decision === 'approved' ? 'Approve this task' : 'Do not approve'}
        description={
          target?.decision === 'approved'
            ? `${target.row.requestedByName} will be able to record time against it.`
            : `${target?.row.requestedByName ?? 'The person who raised it'} will see your note and the task will not receive time.`
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setTarget(null);
                setNoteError(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={decide} loading={busy}>
              {target?.decision === 'approved' ? 'Approve' : 'Do not approve'}
            </Button>
          </>
        }
      >
        {target?.decision === 'rejected' && (
          <Callout tone="info" className="mb-4">
            Say what would need to change. A refusal with no reason leaves the person no
            way to act on it.
          </Callout>
        )}
        <Field
          label={target?.decision === 'rejected' ? 'Note' : 'Note (optional)'}
          required={target?.decision === 'rejected'}
          error={noteError ?? undefined}
        >
          <Textarea
            name="note"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>
      </Dialog>
    </Card>
  );
}
