'use client';

import * as React from 'react';
import type { MinuteProcessingStatus } from '@/contracts/meeting-minutes';
import { describeMinuteProcessingStatus } from '@/lib/status';

/**
 * `FE-1121` — says out loud when a meeting minute's processing status changes.
 *
 * The badge (`ProcessingStatusIndicator`) shows a status; this announces a
 * *change* of one, through a polite live region, because a background run
 * finishing or failing is exactly the kind of update a screen-reader user
 * would otherwise only discover by re-reading the page.
 *
 * What counts as meaningful, and the reason for each rule:
 *
 * - **Never on first sight of a record.** The badge is already on screen, so
 *   announcing it would repeat what was just read — and on a list, it would
 *   read out every row on arrival.
 * - **Never for an unchanged status.** A re-render or a refresh that returns
 *   the same state says nothing.
 * - **Not when the record itself changes.** Moving from one minute to another
 *   is navigation, not a status change; the new record starts fresh.
 * - **Unknown is not a change.** `status={null}` means "not known right now",
 *   typically while data reloads. The last known status is held through it,
 *   so a refresh that lands on a new status is still announced as the change
 *   it is, rather than being mistaken for first sight after a remount.
 *
 * The region is always rendered, empty until there is something to say. A
 * live region that appears in the same update as its text is not reliably
 * announced, so it has to exist first.
 *
 * Polite, not assertive, even for a failure: the minute is saved in every
 * state, so nothing is lost by finishing the current sentence first.
 */
export function ProcessingStatusAnnouncer({
  recordId,
  status,
  subject,
}: {
  recordId: string;
  status: MinuteProcessingStatus | null;
  /** Prefix naming the record, where more than one could change (a list). */
  subject?: string;
}) {
  const [last, setLast] = React.useState<{
    readonly recordId: string;
    readonly status: MinuteProcessingStatus;
  } | null>(status === null ? null : { recordId, status });
  const [message, setMessage] = React.useState('');

  /*
   * Derived during render rather than in an effect: comparing against the
   * previous value is exactly what the React docs' "storing information from
   * previous renders" pattern is for, and an effect would announce one frame
   * late and trips the Compiler's set-state-in-effect rule.
   */
  if (status !== null) {
    if (last === null || last.recordId !== recordId) {
      setLast({ recordId, status });
      if (message !== '') setMessage('');
    } else if (last.status !== status) {
      setLast({ recordId, status });
      const announcement = describeMinuteProcessingStatus(status).announcement;
      setMessage(subject ? `${subject}: ${announcement}` : announcement);
    }
  }

  return (
    <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </p>
  );
}
