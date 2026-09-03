'use client';

import * as React from 'react';
import {
  DEMO_FEATURE_FLAGS,
  FEATURE_FLAGS,
  type FeatureFlagKey,
  type FeatureFlagState,
} from '@/contracts/feature-flags';

/**
 * Runtime feature-flag state (`FE-0732`).
 *
 * `DEMO_FEATURE_FLAGS` is the build default; this store is what the running
 * app reads, so the settings screen can switch a module on or off and the
 * consequence is immediate and demonstrable: the navigation entry disappears
 * and the route stops resolving. A settings screen whose switches changed
 * nothing would be a worse lie than not having one.
 *
 * Read through `useSyncExternalStore` for the same reason the session store is:
 * reading `localStorage` during render breaks hydration, and reading it in an
 * effect means a `setState` in an effect, which the React Compiler rejects.
 *
 * Flag state is a per-viewer demo convenience. In the backend milestone it
 * becomes a server-owned setting; the flag table and `isRouteEnabled` do not
 * change when it moves.
 */

const STORAGE_KEY = 'oms.feature-flags';

function read(): FeatureFlagState {
  if (typeof window === 'undefined') return DEMO_FEATURE_FLAGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEMO_FEATURE_FLAGS;
    const parsed = JSON.parse(raw) as Partial<Record<FeatureFlagKey, boolean>>;
    // Merge onto the defaults so a flag added after a viewer last saved still
    // gets its intended default rather than becoming undefined.
    return Object.freeze({ ...DEMO_FEATURE_FLAGS, ...parsed }) as FeatureFlagState;
  } catch {
    return DEMO_FEATURE_FLAGS;
  }
}

// A stable snapshot reference: returning a fresh object each read makes
// `useSyncExternalStore` re-render forever.
let snapshot: FeatureFlagState =
  typeof window === 'undefined' ? DEMO_FEATURE_FLAGS : read();

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FeatureFlagState {
  return snapshot;
}

function getServerSnapshot(): FeatureFlagState {
  return DEMO_FEATURE_FLAGS;
}

function commit(next: FeatureFlagState): void {
  snapshot = Object.freeze(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage unavailable: the change lasts for this session only.
    }
  }
  for (const listener of listeners) listener();
}

export function setFeatureFlag(key: FeatureFlagKey, enabled: boolean): void {
  commit({ ...snapshot, [key]: enabled });
}

export function resetFeatureFlags(): void {
  commit(DEMO_FEATURE_FLAGS);
}

/** Every flag off — proves the MVP stands alone (`FE-0006`). */
export function applyMvpOnlyFlags(): void {
  commit(
    Object.freeze(
      Object.fromEntries(
        Object.keys(FEATURE_FLAGS).map((key) => [key, false]),
      ) as Record<FeatureFlagKey, boolean>,
    ),
  );
}

export function useFeatureFlags(): FeatureFlagState {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
