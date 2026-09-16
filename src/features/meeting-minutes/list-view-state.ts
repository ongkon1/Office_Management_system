/**
 * `FE-1112` — which state the Meeting Minutes list is in.
 *
 * One pure function decides it, so every state is unit-tested and the screen
 * cannot render two at once. The states that carry list data are the ones where
 * the service has answered for this viewer; `denied` and `signed-out` carry
 * none at all, so they cannot show a count, a client name or a filter option —
 * redaction is a property of the type, not of a component remembering to hide
 * something (`REQ-MTG-003`, `AC-MTG-009`).
 */

import type { MeetingMinuteListView } from '@/contracts/meeting-minutes';
import type { Failure } from '@/contracts/results';

export type MinuteListViewState =
  /** Nothing to show yet: the first request is in flight. */
  | { readonly kind: 'loading' }
  /** A later request is in flight; the last answer keeps the controls mounted. */
  | { readonly kind: 'refreshing'; readonly frame: MeetingMinuteListView }
  | { readonly kind: 'populated'; readonly data: MeetingMinuteListView }
  /** Nothing the viewer may read exists, and no filter is applied. */
  | { readonly kind: 'empty'; readonly data: MeetingMinuteListView }
  /** Filters or search matched nothing. */
  | { readonly kind: 'no-results'; readonly data: MeetingMinuteListView }
  | { readonly kind: 'denied' }
  | { readonly kind: 'signed-out' }
  /**
   * The request failed. `frame` is the viewer's own last successful answer, if
   * any, so the filters can stay usable; it is never another viewer's data.
   */
  | {
      readonly kind: 'error';
      readonly retryable: boolean;
      readonly reference: string | null;
      readonly frame: MeetingMinuteListView | null;
    }
  /** The list's own settings were rejected; resetting them recovers. */
  | { readonly kind: 'invalid'; readonly frame: MeetingMinuteListView | null };

export interface MinuteListStateInput {
  readonly failure: Failure | null;
  /** The answer for the current URL, or null while it is outstanding. */
  readonly settled: MeetingMinuteListView | null;
  /** The last answer for an earlier URL, from the same viewer. */
  readonly previous: MeetingMinuteListView | null;
  readonly filtersActive: boolean;
}

export function resolveMinuteListState({
  failure,
  settled,
  previous,
  filtersActive,
}: MinuteListStateInput): MinuteListViewState {
  if (failure) {
    switch (failure.status) {
      case 'permission_denied':
        return { kind: 'denied' };
      case 'unauthenticated':
        return { kind: 'signed-out' };
      case 'validation_failure':
        return { kind: 'invalid', frame: previous };
      case 'error':
        return {
          kind: 'error',
          retryable: failure.retryable,
          reference: failure.reference ?? null,
          frame: previous,
        };
      case 'conflict':
        return { kind: 'error', retryable: true, reference: null, frame: previous };
      case 'not_found':
        // The list never looks a record up, so this is unexpected; say so
        // plainly rather than guessing at a cause.
        return { kind: 'error', retryable: false, reference: null, frame: previous };
    }
  }

  if (settled) {
    if (settled.page.pageInfo.totalItems > 0) return { kind: 'populated', data: settled };
    return filtersActive ? { kind: 'no-results', data: settled } : { kind: 'empty', data: settled };
  }

  return previous ? { kind: 'refreshing', frame: previous } : { kind: 'loading' };
}

/** The data whose options and pager the screen may render, if any. */
export function frameOf(state: MinuteListViewState): MeetingMinuteListView | null {
  switch (state.kind) {
    case 'populated':
    case 'empty':
    case 'no-results':
      return state.data;
    case 'refreshing':
      return state.frame;
    case 'error':
    case 'invalid':
      return state.frame;
    case 'loading':
    case 'denied':
    case 'signed-out':
      return null;
  }
}
