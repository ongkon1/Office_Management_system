'use client';

import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import type { MeetingMinuteDetailView } from '@/contracts/meeting-minutes';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';
import { useToast } from '@/components/feedback/toast';
import { Card } from '@/components/feedback/card';
import { Callout } from '@/components/feedback/alert';
import { Button } from '@/components/ui/button';

function newIdempotencyKey(): string {
  return `mm-retry-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Why a failed run is not offered a retry, when it is not. */
function ineligibleReason(minute: MeetingMinuteDetailView): string {
  if (minute.processing.error && !minute.processing.error.retryable) {
    return 'Retrying would not fix this failure, so a retry is not offered. An administrator can look into it.';
  }
  if (minute.archived) {
    return 'This minute is archived, so task generation cannot be retried.';
  }
  return "Only the minute's creator or a Super Administrator can retry task generation.";
}

/**
 * `FE-1125` — what a failed run looks like, and how it is retried.
 *
 * In order of what the reader needs:
 *
 * 1. **What went wrong, safely.** The message is the closed-set wording from
 *    `SAFE_PROCESSING_ERROR_MESSAGE`; a provider's own text never reaches this
 *    screen (`REQ-MTG-017`).
 * 2. **That the minute survived.** Said separately and plainly, because
 *    "failed" next to a record reads as "lost" (`REQ-MTG-007`).
 * 3. **Whether a retry is possible, and why not when it is not.** The service
 *    decides (`canRetry`); this only explains the three reasons it may say no.
 * 4. **A retry that cannot happen twice.** The button is busy for the whole
 *    request and ignores clicks while it is, and the request carries one
 *    idempotency key kept until it succeeds — so a double click, or a click
 *    after a lost answer, is recognised by the service as the same retry
 *    rather than starting a second run (`REQ-MTG-023`). The failed attempt's
 *    id travels with it, so a stale page is refused rather than obeyed.
 *
 * Success is spoken by the page's processing announcer when the status moves
 * to Pending, so the toast here is visual only.
 */
export function ProcessingFailure({
  minute,
  userId,
  onChanged,
}: {
  minute: MeetingMinuteDetailView;
  userId: string;
  /** Reload the minute: after a retry, or after a conflict says it moved on. */
  onChanged: () => void;
}) {
  const toast = useToast();
  const [retrying, setRetrying] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);
  const [conflicted, setConflicted] = React.useState(false);
  const key = React.useRef<string | null>(null);
  const headingId = React.useId();

  if (minute.processing.status !== 'failed' || !minute.processing.error) return null;
  const error = minute.processing.error;
  const failedAttemptId = minute.processing.latestAttemptId;

  async function retry() {
    // The busy button already refuses a second click; this also covers a
    // keyboard repeat or a click that lands before the re-render.
    if (retrying || failedAttemptId === null) return;
    setRetrying(true);
    setProblem(null);
    setConflicted(false);
    key.current ??= newIdempotencyKey();

    const result = await mockMeetingMinutesService.retryProcessing(userId, {
      minuteId: minute.id,
      failedAttemptId,
      idempotencyKey: key.current,
    });
    setRetrying(false);

    if (result.status === 'success') {
      key.current = null;
      toast.show({
        tone: 'success',
        title: 'Task generation queued again',
        description: 'It runs in the background. The minute stays as it is.',
        announce: false,
      });
      onChanged();
      return;
    }

    if (result.status === 'conflict') {
      setConflicted(true);
      setProblem(`${result.message} ${result.guidance}`);
      return;
    }

    setProblem(
      'guidance' in result && result.guidance ? `${result.message} ${result.guidance}` : result.message,
    );
  }

  return (
    <section aria-labelledby={headingId} className="mt-5">
      <Card className="border-critical-border">
        <h2 id={headingId} className="text-h3 text-ink">
          Task generation failed
        </h2>
        <p className="mt-2 text-body text-ink">{error.message}</p>
        <p className="mt-1 text-body-sm text-ink-muted">
          The minute below is saved and unchanged. Nothing was created from this run. Failed{' '}
          {error.occurredAtLabel}.
        </p>

        {problem && (
          <Callout tone="warning" className="mt-4">
            {problem}{' '}
            {conflicted && (
              <button
                type="button"
                onClick={onChanged}
                className="min-h-6 rounded-xs font-medium underline underline-offset-2"
              >
                Reload the minute
              </button>
            )}
          </Callout>
        )}

        {minute.actions.canRetry ? (
          <div className="mt-4">
            <Button
              variant="primary"
              loading={retrying}
              onClick={retry}
              iconLeading={<RotateCcw aria-hidden className="size-4" />}
            >
              {retrying ? 'Retrying task generation' : 'Retry task generation'}
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-body-sm text-ink-muted">{ineligibleReason(minute)}</p>
        )}
      </Card>
    </section>
  );
}
