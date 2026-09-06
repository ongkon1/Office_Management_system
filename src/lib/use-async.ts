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

export function useAsync<T>(
  run: () => Promise<Result<T>>,
  deps: readonly unknown[],
): { state: AsyncState<T>; reload: () => void } {
  const [state, setState] = React.useState<AsyncState<T>>({ status: 'loading' });
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
    setState({ status: 'loading' });
  }

  React.useEffect(() => {
    let cancelled = false;

    run().then((result) => {
      if (cancelled) return;
      setState(
        result.status === 'success'
          ? { status: 'success', data: result.data }
          : {
              status: 'failure',
              failure: result as Exclude<Result<T>, { status: 'success' }>,
            },
      );
    });

    return () => {
      cancelled = true;
    };
    // `key` already encodes deps, the reload nonce, and the store version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = React.useCallback(() => setNonce((value) => value + 1), []);

  return { state, reload };
}

/** Re-renders when the mock store mutates. */
export function useStoreVersion(): number {
  return React.useSyncExternalStore(mockStore.subscribe, mockStore.getVersion, () => 0);
}
