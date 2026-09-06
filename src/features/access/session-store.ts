/**
 * The session as an external store.
 *
 * React state would need an effect to read `localStorage` after hydration, and
 * setting state synchronously in an effect causes cascading renders. A store
 * read through `useSyncExternalStore` avoids that: the server snapshot is a
 * stable "not hydrated" value, the client snapshot is whatever storage holds,
 * and React reconciles the difference after hydration on its own.
 *
 * `hydrated` and `user` live in **one** snapshot object deliberately. Tracking
 * hydration in separate React state races the store's post-hydration read, and
 * a guard that samples the pair mid-race sees "signed out" for a frame and
 * redirects a signed-in user to the login screen.
 */

import type { SessionUser } from '@/contracts/domain';

const STORAGE_KEY = 'oms.session';

export interface SessionState {
  /** False until the browser store has been read. */
  readonly hydrated: boolean;
  readonly user: SessionUser | null;
}

/** Stable reference: returning a new object each call would loop forever. */
const SERVER_STATE: SessionState = { hydrated: false, user: null };

let state: SessionState = SERVER_STATE;
const listeners = new Set<() => void>();

function readStored(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionUser;
    if (new Date(parsed.sessionExpiresAt).getTime() <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    // Corrupt or unavailable storage reads as "no session", never a crash.
    return null;
  }
}

function writeStored(next: SessionUser | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // A private window with storage disabled degrades to a memory-only session.
  }
}

// Restore at module load. Client components evaluate this in the browser only,
// so the server render keeps SERVER_STATE.
if (typeof window !== 'undefined') {
  state = { hydrated: true, user: readStored() };
}

export const sessionStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  getSnapshot(): SessionState {
    return state;
  },

  getServerSnapshot(): SessionState {
    return SERVER_STATE;
  },

  getUser(): SessionUser | null {
    return state.user;
  },

  set(next: SessionUser | null): void {
    state = { hydrated: true, user: next };
    writeStored(next);
    for (const listener of listeners) listener();
  },

  /** Test seam. */
  reset(): void {
    state = { hydrated: true, user: null };
    writeStored(null);
    listeners.clear();
  },
};
