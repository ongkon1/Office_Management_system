'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Clock, FlaskConical } from 'lucide-react';
import type { AppShellView } from '@/contracts/view-models';
import { useFeatureFlags } from '@/features/settings/flag-store';
import { AppShell } from '@/components/shell/app-shell';
import { buildNavigation, DEFAULT_ROUTE, ROLE_LABEL } from '@/components/shell/navigation';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/feedback/overlay';
import { Card } from '@/components/feedback/card';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { formatTimestamp } from '@/lib/format';
import { DEMO_ACCOUNTS, findAccountByUserId } from '@/services/mock/accounts';
import { SearchPalette } from '@/features/workspace/search';
import { isDemoMode } from './demo-mode';
import { useSession, useSessionExpiry } from './session-provider';

/** Show the expiry warning when this much time is left. */
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * FE-0210 — session expiry warning.
 *
 * It warns rather than acting: an automatic sign-out with no notice loses work
 * silently. The countdown is announced politely once when it appears, not on
 * every tick, which would make a screen reader unusable.
 */
function SessionExpiryWarning() {
  const { extendSession, signOut } = useSession();
  const msUntilExpiry = useSessionExpiry();
  const router = useRouter();

  if (msUntilExpiry === null || msUntilExpiry > WARNING_THRESHOLD_MS) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="session-warning-title"
      className="fixed inset-x-0 bottom-0 z-50 p-4 md:bottom-4 md:left-auto md:right-4 md:max-w-sm"
      data-print="hide"
    >
      <Card elevation="raised" className="border-undertime-border bg-warning-surface">
        <div className="flex gap-3">
          <Clock aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <p id="session-warning-title" className="text-body-sm font-semibold text-ink">
              Your session ends in {formatCountdown(msUntilExpiry)}
            </p>
            <p className="mt-1 text-caption text-ink-muted">
              Stay signed in to continue working. Unsaved changes are not submitted
              automatically.
            </p>
            <div className="mt-3 flex gap-2">
              <Button variant="primary" size="sm" onClick={extendSession}>
                Stay signed in
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  router.replace('/login');
                }}
              >
                Sign out now
              </Button>
            </div>
          </div>
        </div>
      </Card>
      <p aria-live="polite" className="sr-only">
        Your session will end in about {Math.ceil(msUntilExpiry / 60000)} minutes.
      </p>
    </div>
  );
}

/** Development-only panel: switch role and exercise the expiry states. */
function DemoTools() {
  const { user, switchDemoAccount, simulateExpiry } = useSession();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  if (!isDemoMode() || !user) return null;

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        data-print="hide"
        iconLeading={<FlaskConical aria-hidden className="size-4" />}
        className="fixed bottom-[calc(var(--shell-bottom-nav-height)+1rem)] left-4 z-30 shadow-md md:bottom-4"
      >
        Demo
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Demo tools"
        description="Development only. Switch role or exercise the session states."
        size="md"
      >
        <div className="flex flex-col gap-5">
          <section>
            <h3 className="text-label text-ink-muted">Signed in as</h3>
            <div className="mt-2 flex items-center gap-2.5">
              <Avatar name={user.displayName} size="sm" />
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-ink">{user.displayName}</p>
                <p className="text-caption text-ink-subtle">
                  {ROLE_LABEL[user.primaryRole]}
                </p>
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-label text-ink-muted">Switch role</h3>
            <ul className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {DEMO_ACCOUNTS.filter((account) => account.status === 'active').map(
                (account) => (
                  <li key={account.userId}>
                    <button
                      type="button"
                      disabled={account.userId === user.userId}
                      onClick={async () => {
                        const result = await switchDemoAccount?.(account.userId);
                        setOpen(false);
                        if (result?.status === 'success') {
                          router.replace(DEFAULT_ROUTE[result.data.primaryRole]);
                        }
                      }}
                      className="flex w-full items-center gap-2.5 rounded-md border border-border p-2 text-left transition-colors hover:bg-surface-sunken disabled:opacity-50"
                    >
                      <Avatar name={account.fullName} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-body-sm text-ink">
                        {account.fullName}
                      </span>
                      <Badge>{ROLE_LABEL[account.primaryRole]}</Badge>
                    </button>
                  </li>
                ),
              )}
            </ul>
          </section>

          <section>
            <h3 className="text-label text-ink-muted">Session</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  simulateExpiry(60 * 1000);
                  setOpen(false);
                }}
              >
                Expire in 1 minute
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  simulateExpiry(0);
                  setOpen(false);
                }}
              >
                Expire now
              </Button>
            </div>
          </section>
        </div>
      </Dialog>
    </>
  );
}

/**
 * Builds the shell view from the session and hosts the authenticated chrome:
 * expiry warning, sign-out confirmation, and the demo tools.
 */
export function AppShellHost({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const flags = useFeatureFlags();

  const view = React.useMemo<AppShellView | null>(() => {
    if (!user) return null;
    return {
      viewer: {
        displayName: user.displayName,
        roleLabel: ROLE_LABEL[user.primaryRole],
        primaryRole: user.primaryRole,
        avatarUrl: user.avatarUrl,
      },
      navigation: buildNavigation({
        role: user.primaryRole,
        flags,
        permissions: user.permissions,
      }),
      unreadNotificationCount: 3,
      runningTimer: null,
      sessionExpiresAt: user.sessionExpiresAt,
    };
  }, [user, flags]);

  if (!view || !user) return null;

  const account = findAccountByUserId(user.userId);

  return (
    <>
      <AppShell
        view={view}
        onOpenSearch={flags.globalSearch ? () => setSearchOpen(true) : undefined}
        onSignOut={() => setConfirmSignOut(true)}
      >
        {children}
      </AppShell>

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SessionExpiryWarning />
      <DemoTools />

      <Dialog
        open={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title="Sign out?"
        description="You will need to sign in again to return."
        dismissOnBackdrop={false}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSignOut(false)}>
              Stay signed in
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                setConfirmSignOut(false);
                await signOut();
                router.replace('/login');
              }}
            >
              Sign out
            </Button>
          </>
        }
      >
        <div className="flex items-center gap-3 rounded-md border border-border bg-surface-sunken p-3">
          <Avatar name={user.displayName} src={user.avatarUrl} size="md" />
          <div className="min-w-0">
            <p className="truncate text-body-sm font-medium text-ink">{user.displayName}</p>
            <p className="truncate text-caption text-ink-subtle">
              {ROLE_LABEL[user.primaryRole]}
            </p>
            {/* Recent-login presentation (FE-0210). */}
            {account?.lastLoginAt && (
              <p className="mt-1 text-caption text-ink-muted">
                Last signed in {formatTimestamp(account.lastLoginAt, user.timezone)}
              </p>
            )}
          </div>
        </div>
        {pathname !== '/dashboard' && (
          <p className="mt-3 text-caption text-ink-muted">
            You are currently on{' '}
            {/* A route has no spaces to wrap at, so it is told where it may break. */}
            <code className="rounded-xs bg-surface-sunken px-1 py-0.5 font-mono text-ink-muted break-all">
              {pathname}
            </code>{' '}
            — anything unsaved here will not be submitted.
          </p>
        )}
      </Dialog>
    </>
  );
}
