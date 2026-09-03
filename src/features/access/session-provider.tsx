'use client';

import * as React from 'react';
import type { SessionUser } from '@/contracts/domain';
import type { LoginInput } from '@/contracts/services';
import type { Result } from '@/contracts/results';
import { mockAuthService, SESSION_DURATION_MS } from '@/services/mock/auth';
import { sessionStore } from './session-store';

/**
 * FE-0206 — the session boundary every screen consumes.
 *
 * The shape of `useSession()` is what server authentication will provide too:
 * a status, a user, and the operations. Screens must not reach past this to the
 * auth service, so swapping the mock adapter for real server sessions changes
 * this file only.
 */

export type SessionStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface SessionContextValue {
  readonly status: SessionStatus;
  readonly user: SessionUser | null;
  /** Milliseconds until the session expires; `null` when unauthenticated. */
  readonly msUntilExpiry: number | null;
  login: (
    input: LoginInput,
  ) => Promise<Result<{ requiresTwoFactor: boolean; user: SessionUser | null }>>;
  verifyTwoFactor: (code: string) => Promise<Result<SessionUser>>;
  signOut: () => Promise<void>;
  /** Development-only role switch. */
  switchDemoAccount?: (userId: string) => Promise<Result<SessionUser>>;
  /** Extends the session from now, as a real server would on activity. */
  extendSession: () => void;
  /** Development-only: shortens the session to demonstrate the warning. */
  simulateExpiry: (msFromNow: number) => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { hydrated, user } = React.useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  );

  const [now, setNow] = React.useState(() => Date.now());

  // Keep the mock service's view of the session aligned with the store. Done
  // in an effect rather than during render, since it mutates a module.
  React.useEffect(() => {
    mockAuthService.setRestoredSession(user);
  }, [user]);

  // One tick drives the countdown and enforces expiry. Expiry is applied in
  // the timer callback rather than an effect, so a session cannot outlive its
  // own timestamp merely because nothing navigated.
  React.useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      const current = sessionStore.getUser();
      if (current && new Date(current.sessionExpiresAt).getTime() <= Date.now()) {
        mockAuthService.setRestoredSession(null);
        sessionStore.set(null);
        return;
      }
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const applySession = React.useCallback((session: SessionUser | null) => {
    mockAuthService.setRestoredSession(session);
    sessionStore.set(session);
  }, []);

  const login = React.useCallback<SessionContextValue['login']>(
    async (input) => {
      const result = await mockAuthService.login(input);
      if (result.status === 'success' && result.data.user) applySession(result.data.user);
      return result;
    },
    [applySession],
  );

  const verifyTwoFactor = React.useCallback<SessionContextValue['verifyTwoFactor']>(
    async (code) => {
      const result = await mockAuthService.verifyTwoFactor({ code });
      if (result.status === 'success') applySession(result.data);
      return result;
    },
    [applySession],
  );

  const signOut = React.useCallback(async () => {
    await mockAuthService.logout();
    applySession(null);
  }, [applySession]);

  const switchDemoAccount = React.useCallback(
    async (userId: string) => {
      const result = await mockAuthService.switchDemoAccount({ userId });
      if (result.status === 'success') applySession(result.data);
      return result;
    },
    [applySession],
  );

  const extendSession = React.useCallback(() => {
    const current = sessionStore.getUser();
    if (!current) return;
    applySession({
      ...current,
      sessionExpiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
    });
  }, [applySession]);

  const simulateExpiry = React.useCallback(
    (msFromNow: number) => {
      const current = sessionStore.getUser();
      if (!current) return;
      applySession({
        ...current,
        sessionExpiresAt: new Date(Date.now() + msFromNow).toISOString(),
      });
    },
    [applySession],
  );

  const msUntilExpiry = user
    ? Math.max(0, new Date(user.sessionExpiresAt).getTime() - now)
    : null;

  const status: SessionStatus = !hydrated
    ? 'loading'
    : user
      ? 'authenticated'
      : 'unauthenticated';

  const value = React.useMemo<SessionContextValue>(
    () => ({
      status,
      user,
      msUntilExpiry,
      login,
      verifyTwoFactor,
      signOut,
      switchDemoAccount,
      extendSession,
      simulateExpiry,
    }),
    [
      status,
      user,
      msUntilExpiry,
      login,
      verifyTwoFactor,
      signOut,
      switchDemoAccount,
      extendSession,
      simulateExpiry,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
