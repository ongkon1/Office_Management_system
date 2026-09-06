'use client';

import * as React from 'react';
import type { TimerSession, WorkLocation } from '@/contracts/domain';
import { mockStore } from '@/services/mock/store';
import { mockTimesheetService } from '@/services/mock/timesheet';

/**
 * The running timer (`FE-0328`–`FE-0330`).
 *
 * One source of truth for the whole app, so the shell indicator and the
 * timesheet page can never disagree about whether a timer is running — which
 * is the visible half of the one-running-timer rule (`REQ-TIME-008`).
 *
 * `wasRecovered` is true when the timer was restored from storage rather than
 * started in this session, so the UI can say so instead of silently resuming.
 */

export interface TimerState {
  readonly session: TimerSession | null;
  readonly elapsedMinutes: number;
  readonly elapsedSeconds: number;
  readonly wasRecovered: boolean;
}

/**
 * The timer that already existed when this tab loaded.
 *
 * Captured once at module load rather than detected in an effect: a timer
 * present at load was restored from storage, and one started later was started
 * here. That distinction is a fact about page load, so it does not need state.
 */
const RESTORED_TIMER_ID =
  typeof window === 'undefined' ? null : (mockStore.getTimer()?.id ?? null);


export function useTimer() {
  // Subscribed rather than read during render: reading module state directly
  // in a render body is an impure read React cannot track.
  const session = React.useSyncExternalStore(
    mockStore.subscribe,
    mockStore.getTimer,
    () => null,
  );

  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!session?.isRunning) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session?.isRunning, session?.id]);

  // Acknowledgement is per-consumer React state; nothing is written back to
  // module scope, so the hook stays a pure function of store and props.
  const [acknowledged, setAcknowledged] = React.useState(false);

  const elapsedMs = session ? Math.max(0, now - new Date(session.startedAt).getTime()) : 0;

  const state: TimerState = {
    session,
    elapsedMinutes: Math.floor(elapsedMs / 60000),
    elapsedSeconds: Math.floor(elapsedMs / 1000),
    wasRecovered:
      session !== null && session.id === RESTORED_TIMER_ID && !acknowledged,
  };

  const start = React.useCallback(
    async (input: {
      divisionId: string;
      projectId: string | null;
      taskId: string | null;
      workLocation: WorkLocation;
    }) => {
      return mockTimesheetService.startTimer({
        ...input,
        idempotencyKey: `timer-start-${Date.now()}`,
      });
    },
    [],
  );

  const stop = React.useCallback(async () => {
    const current = mockStore.getTimer();
    if (!current) return null;
    const result = await mockTimesheetService.stopTimer({
      sessionId: current.id,
      idempotencyKey: `timer-stop-${current.id}`,
    });
    return result;
  }, []);

  const cancel = React.useCallback(async () => {
    const current = mockStore.getTimer();
    if (!current) return;
    await mockTimesheetService.cancelTimer({ sessionId: current.id });
  }, []);

  const acknowledgeRecovery = React.useCallback(() => setAcknowledged(true), []);

  return { ...state, start, stop, cancel, acknowledgeRecovery };
}

/** Formats elapsed seconds as `H:MM:SS` for the live timer readout. */
export function formatElapsed(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
