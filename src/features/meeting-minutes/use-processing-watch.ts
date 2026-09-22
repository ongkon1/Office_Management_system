'use client';

import * as React from 'react';
import type { MinuteProcessingStatus } from '@/contracts/meeting-minutes';
import { isProcessingInFlight } from '@/contracts/meeting-minutes';
import { mockMeetingMinutesService } from '@/services/mock/meeting-minutes';

/** How often a queued or running minute is checked. */
export const PROCESSING_POLL_MS = 2000;

let pollMs = PROCESSING_POLL_MS;

/** Test seam: poll faster, so a watch can be observed without waiting seconds. */
export function setProcessingPollIntervalForTests(ms: number | null): void {
  pollMs = ms ?? PROCESSING_POLL_MS;
}

export interface ProcessingChange {
  readonly minuteId: string;
  readonly from: MinuteProcessingStatus;
  readonly to: MinuteProcessingStatus;
}

/**
 * `FE-1126` — watches minutes whose run is queued or running, and reports
 * when one moves on.
 *
 * It polls `getProcessingSnapshot`, the light read the contract provides for
 * exactly this, and only for minutes that are in flight: nothing is polled
 * once a run has finished or failed, and a page showing only settled minutes
 * makes no requests at all. The callers decide what a change means — the
 * detail page reloads itself, the list reloads silently — so this hook never
 * touches screen state of its own.
 *
 * The seeded Pending and Processing minutes never move, so a page open on
 * one of them keeps checking every `PROCESSING_POLL_MS`; that is the honest
 * behaviour of a real client watching a run that has not finished.
 */
export function useProcessingWatch(
  userId: string,
  watched: readonly { readonly id: string; readonly status: MinuteProcessingStatus }[],
  onChange: (changes: readonly ProcessingChange[]) => void,
  intervalMs: number = pollMs,
): void {
  /*
   * Only in-flight minutes, as a stable string, so the effect restarts when —
   * and only when — the set of watched runs or their statuses change.
   */
  const signature = watched
    .filter((item) => isProcessingInFlight(item.status))
    .map((item) => `${item.id}=${item.status}`)
    .join('|');

  /*
   * The callback is held in a ref so the effect can depend on `signature`
   * alone: callers pass an inline function, and restarting the interval on
   * every render would reset the clock before it ever fired.
   */
  const onChangeRef = React.useRef(onChange);
  React.useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  React.useEffect(() => {
    if (signature === '' || userId === '') return;

    const inFlight = signature.split('|').map((pair) => {
      const [id, status] = pair.split('=') as [string, MinuteProcessingStatus];
      return { id, status };
    });
    let cancelled = false;
    let checking = false;

    const timer = window.setInterval(async () => {
      // A slow answer must not overlap the next tick and report twice.
      if (checking) return;
      checking = true;
      const snapshots = await Promise.all(
        inFlight.map((item) => mockMeetingMinutesService.getProcessingSnapshot(userId, item.id)),
      );
      checking = false;
      if (cancelled) return;

      const changes = inFlight.flatMap((item, index): ProcessingChange[] => {
        const snapshot = snapshots[index];
        return snapshot.status === 'success' && snapshot.data.processing.status !== item.status
          ? [{ minuteId: item.id, from: item.status, to: snapshot.data.processing.status }]
          : [];
      });
      if (changes.length === 0) return;

      /*
       * Report once, then stop. This interval was built from the statuses
       * the page is showing, and those stay the same until the caller's reload
       * lands; polling on would report the same change again on every tick in
       * between — two "finished" notices for one run. The caller's reload
       * changes the signature, which starts a fresh watch if anything is still
       * in flight.
       */
      cancelled = true;
      window.clearInterval(timer);
      onChangeRef.current(changes);
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [signature, userId, intervalMs]);
}
