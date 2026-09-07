'use client';

import * as React from 'react';
import type { Result } from '@/contracts/results';
import { mockStore } from '@/services/mock/store';

/**
 * Runs a service call and exposes the loading phase a `Result` cannot carry.
 *
 * Every data screen branches on this, which is what gives loading, empty,
 * error and denied states a single shape across the product.
 */
export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | {
      readonly status: 'failure';
      readonly failure: Exclude<Result<T>, { status: 'success' }>;
    };

export interface AsyncOptions {
  /**
   * Keep the last successful data on screen while the next request runs,
   * instead of dropping back to `loading`.
   *
   * For a screen whose own filter controls are `deps`: without it the screen
   * replaces itself with a skeleton on every change, which unmounts the
   * control being used — a date field loses its caret after one character and
   * an open multi-select closes the instant an option is picked. Only the
   * arguments differ between those requests, never the viewer, so the rows
   * held over belong to the same person. Leave it off where a dependency can
   * change who is asking.
   */
  readonly keepPrevious?: boolean;
}

export function useAsync<T>(
  run: () => Promise<Result<T>>,
  deps: readonly unknown[],
  options?: AsyncOptions,
): { state: AsyncState<T>; previous: T | null; reload: () => void } {
  const [state, setState] = React.useState<AsyncState<T>>({ status: 'loading' });
  /*
   * The last successful payload, kept across a reload.
   *
   * A screen whose own filter controls are part of `deps` re-enters `loading`
   * on every keystroke and every filter change. If it swaps itself for a
   * skeleton it unmounts the field being typed into and the popover being
   * clicked — the caret is lost after one character and the dropdown shuts on
   * selection. Such a screen keeps its controls mounted and feeds them from
   * `previous` while the next result is in flight.
   *
   * Only for populating controls that outlive the request — option lists,
   * result summaries. Records belong to the current `state`: `previous` was
   * fetched under the earlier arguments, so rendering rows from it would show
   * data the current query has not authorised.
   */
  const [previous, setPrevious] = React.useState<T | null>(null);
  const [nonce, setNonce] = React.useState(0);

  // The store version is part of the key, so any mutation refreshes the view.
  const version = useStoreVersion();
  const key = `${JSON.stringify(deps)}|${nonce}|${version}`;

  // Reset to loading when the request changes. Adjusted during render rather
  // than in an effect: setting state synchronously inside an effect causes a
  // cascading render, and the stale result would paint for one frame first.
  const [lastKey, setLastKey] = React.useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    if (!(options?.keepPrevious && state.status === 'success')) {
      setState({ status: 'loading' });
    }
  }

  React.useEffect(() => {
    let cancelled = false;

    run().then((result) => {
      if (cancelled) return;
      if (result.status === 'success') {
        setState({ status: 'success', data: result.data });
        setPrevious(result.data);
      } else {
        setState({
          status: 'failure',
          failure: result as Exclude<Result<T>, { status: 'success' }>,
        });
      }
    });

    return () => {
      cancelled = true;
    };
    // `key` already encodes deps, the reload nonce, and the store version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = React.useCallback(() => setNonce((value) => value + 1), []);

  return { state, previous, reload };
}

/** Re-renders when the mock store mutates. */
export function useStoreVersion(): number {
  return React.useSyncExternalStore(mockStore.subscribe, mockStore.getVersion, () => 0);
}
