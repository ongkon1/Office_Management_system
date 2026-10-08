'use client';

import * as React from 'react';
import type { SessionUser } from '@/contracts/domain';
import type { LoginInput } from '@/contracts/services';
import type { Result } from '@/contracts/results';
import { serverAuthService } from '@/services/server/auth';
import { serverAdminService } from '@/services/server/admin';
import { commitBranding, resetBranding } from '@/lib/branding-store';
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
  login: (
    input: LoginInput,
  ) => Promise<Result<{ requiresTwoFactor: boolean; user: SessionUser | null }>>;
  verifyTwoFactor: (code: string) => Promise<Result<SessionUser>>;
  signOut: () => Promise<void>;
  /** Refreshes display name/email after the current user edits their profile. */
  refreshUser: () => Promise<void>;
  /** Development-only role switch. */
  switchDemoAccount?: (userId: string) => Promise<Result<SessionUser>>;
  /** Extends the session from now, as a real server would on activity. */
  extendSession: () => void;
  /** Development-only: shortens the session to demonstrate the warning. */
  simulateExpiry: (msFromNow: number) => void;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

/**
 * The countdown is deliberately a separate context.
 *
 * It changes every second. Held on the session value, that tick re-rendered
 * every `useSession()` consumer once a second — which is most of the product —
 * and React re-applies a controlled input's `name` attribute on each update,
 * so every form field visibly flickered in the inspector for a countdown only
 * the expiry warning reads. Subscribing to the clock is now opt-in.
 */
const SessionExpiryContext = React.createContext<number | null>(null);

export function useSession(): SessionContextValue {
  const context = React.useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <SessionProvider>');
  return context;
}

/** Milliseconds until the session expires; `null` when unauthenticated. */
export function useSessionExpiry(): number | null {
  return React.useContext(SessionExpiryContext);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { hydrated, user } = React.useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getServerSnapshot,
  );

  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    let active=true;
    void serverAuthService.getSession().then((result)=>{
      if(active) sessionStore.set(result.status==='success' ? result.data : null);
    });
    return ()=>{active=false;};
  }, []);

  React.useEffect(()=>{
    if(!user){resetBranding();return;}
    let active=true;
    void serverAdminService.getBranding(user.userId).then(result=>{if(active&&result.status==='success')commitBranding(result.data);});
    return()=>{active=false;};
  },[user?.userId]);

  // One tick drives the countdown and enforces expiry. Expiry is applied in
  // the timer callback rather than an effect, so a session cannot outlive its
  // own timestamp merely because nothing navigated.
  React.useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      const current = sessionStore.getUser();
      if (current && new Date(current.sessionExpiresAt).getTime() <= Date.now()) {
        sessionStore.set(null);
        return;
      }
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [user]);

  const applySession = React.useCallback((session: SessionUser | null) => {
    sessionStore.set(session);
  }, []);

  const login = React.useCallback<SessionContextValue['login']>(
    async (input) => {
      const result = await serverAuthService.login(input);
      if (result.status === 'success' && result.data.user) applySession(result.data.user);
      return result;
    },
    [applySession],
  );

  const verifyTwoFactor = React.useCallback<SessionContextValue['verifyTwoFactor']>(
    async (code) => {
      const result = await serverAuthService.verifyTwoFactor({ code });
      if (result.status === 'success') applySession(result.data);
      return result;
    },
    [applySession],
  );

  const signOut = React.useCallback(async () => {
    await serverAuthService.logout();
    applySession(null);
  }, [applySession]);

  const refreshUser = React.useCallback(async () => {
    const result = await serverAuthService.refreshSession();
    if (result.status === 'success') applySession(result.data);
  }, [applySession]);

  const extendSession = React.useCallback(() => {
    void serverAuthService.refreshSession().then((result)=>{
      if(result.status==='success') applySession(result.data);
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
      login,
      verifyTwoFactor,
      signOut,
      refreshUser,
      extendSession,
      simulateExpiry,
    }),
    [
      status,
      user,
      login,
      verifyTwoFactor,
      signOut,
      refreshUser,
      extendSession,
      simulateExpiry,
    ],
  );

  return (
    <SessionContext.Provider value={value}>
      <SessionExpiryContext.Provider value={msUntilExpiry}>
        {children}
      </SessionExpiryContext.Provider>
    </SessionContext.Provider>
  );
}
