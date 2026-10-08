/**
 * The session as an external store.
 *
 * The authenticated identity is memory-only. The durable credential is the
 * server-issued HttpOnly cookie, which browser JavaScript cannot read or copy.
 *
 * `hydrated` and `user` live in **one** snapshot object deliberately. Tracking
 * hydration in separate React state races the store's post-hydration read, and
 * a guard that samples the pair mid-race sees "signed out" for a frame and
 * redirects a signed-in user to the login screen.
 */

import type { SessionUser } from '@/contracts/domain';

export interface SessionState {
  /** False until the browser store has been read. */
  readonly hydrated: boolean;
  readonly user: SessionUser | null;
}

/** Stable reference: returning a new object each call would loop forever. */
const SERVER_STATE: SessionState = { hydrated: false, user: null };

let state: SessionState = SERVER_STATE;
const listeners = new Set<() => void>();

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
    for (const listener of listeners) listener();
  },

  /** Test seam. */
  reset(): void {
    state = { hydrated: true, user: null };
    listeners.clear();
  },
};
