'use client';

import * as React from 'react';

/**
 * Saved presentation state for the financial report screen (`FE-0611`).
 *
 * This is an external store read through `useSyncExternalStore` rather than
 * state seeded from `localStorage`, for the same reason the session store is:
 * reading storage during render produces a hydration mismatch (the server has
 * no storage), and reading it in an effect means a `setState` in an effect,
 * which the React Compiler correctly rejects. The server snapshot is the
 * default view; the client snapshot is whatever the viewer last used.
 *
 * The value is a per-viewer convenience, not shared or durable state — if
 * storage is unavailable the screen simply opens on the defaults.
 */
export interface ReportPresentation {
  readonly reportKey: string;
  readonly groupBy: 'employee' | 'division' | 'project';
  readonly divisionIds: readonly string[];
}

const STORAGE_KEY = 'oms.finance.report-presentation';

export const DEFAULT_PRESENTATION: ReportPresentation = {
  reportKey: 'payroll-summary',
  groupBy: 'employee',
  divisionIds: [],
};

function read(): ReportPresentation {
  if (typeof window === 'undefined') return DEFAULT_PRESENTATION;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESENTATION;
    const parsed = JSON.parse(raw) as Partial<ReportPresentation>;
    return {
      reportKey: parsed.reportKey ?? DEFAULT_PRESENTATION.reportKey,
      groupBy: parsed.groupBy ?? DEFAULT_PRESENTATION.groupBy,
      divisionIds: Array.isArray(parsed.divisionIds) ? parsed.divisionIds : [],
    };
  } catch {
    return DEFAULT_PRESENTATION;
  }
}

// The snapshot must be referentially stable between reads, or
// `useSyncExternalStore` re-renders forever.
let snapshot: ReportPresentation =
  typeof window === 'undefined' ? DEFAULT_PRESENTATION : read();

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ReportPresentation {
  return snapshot;
}

function getServerSnapshot(): ReportPresentation {
  return DEFAULT_PRESENTATION;
}

export function setPresentation(next: Partial<ReportPresentation>): void {
  snapshot = { ...snapshot, ...next };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Storage unavailable: the choice lasts for this session only.
    }
  }
  for (const listener of listeners) listener();
}

export function resetPresentation(): void {
  setPresentation(DEFAULT_PRESENTATION);
}

export function useReportPresentation(): ReportPresentation {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
