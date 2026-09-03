'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Lock, ShieldX, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/feedback/card';
import { PageContainer } from '@/components/layout/page';
import { useSession } from './session-provider';

/**
 * FE-0204 — the screens a user lands on when they cannot proceed.
 *
 * Each states what happened, what it means, and what to do next. None of them
 * reveal whether a given account exists, what data lies behind the wall, or
 * which permission another user might hold.
 */

function StateScreen({
  icon,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card padding="lg" className="w-full max-w-md text-center" elevation="raised">
        <div className="flex flex-col items-center gap-4">
          {icon}
          <div>
            <h1 className="text-h2 text-ink">{title}</h1>
            <div className="mt-2 text-body-sm text-ink-muted">{children}</div>
          </div>
          <div className="mt-2 flex w-full flex-col gap-2">{actions}</div>
        </div>
      </Card>
    </div>
  );
}

export function AccountLockedScreen() {
  const router = useRouter();
  return (
    <StateScreen
      icon={<Lock aria-hidden className="size-8 text-danger" />}
      title="This account is locked"
      actions={
        <Button variant="primary" fullWidth onClick={() => router.push('/login')}>
          Back to sign in
        </Button>
      }
    >
      <p>
        The account has been locked after repeated failed sign-in attempts, or by an
        administrator.
      </p>
      <p className="mt-2">
        Contact your administrator or the HR team to have it unlocked. For your security,
        we cannot unlock it from this screen.
      </p>
    </StateScreen>
  );
}

export function AccountInactiveScreen() {
  const router = useRouter();
  return (
    <StateScreen
      icon={<UserX aria-hidden className="size-8 text-ink-muted" />}
      title="This account is no longer active"
      actions={
        <Button variant="primary" fullWidth onClick={() => router.push('/login')}>
          Back to sign in
        </Button>
      }
    >
      <p>
        The account has been deactivated. Its historical records are preserved for payroll
        and audit purposes, but it can no longer sign in.
      </p>
      <p className="mt-2">
        If you believe this is a mistake, contact the HR team.
      </p>
    </StateScreen>
  );
}

export function SessionExpiredScreen() {
  const router = useRouter();
  return (
    <StateScreen
      icon={<Clock aria-hidden className="size-8 text-warning" />}
      title="Your session has expired"
      actions={
        <Button variant="primary" fullWidth onClick={() => router.push('/login')}>
          Sign in again
        </Button>
      }
    >
      <p>
        You were signed out because the session reached its time limit. Any unsaved work on
        the previous screen was not submitted.
      </p>
    </StateScreen>
  );
}

/**
 * Rendered in place at the denied URL rather than redirecting, so a direct-route
 * test shows both the address and the outcome (`FE-0209`).
 *
 * It names the missing permission but never the data behind it — and it is used
 * only where the viewer already knows the route exists. An unauthorized *record*
 * returns not-found instead, so identifiers cannot be probed.
 */
export function PermissionDeniedScreen({
  requiredPermission,
  reason = 'permission',
}: {
  requiredPermission?: string;
  reason?: 'role' | 'permission' | 'feature_disabled';
}) {
  const router = useRouter();
  const { user } = useSession();

  const description =
    reason === 'role'
      ? 'Your role does not include this area. If you need it for your work, ask your administrator to review your access.'
      : reason === 'feature_disabled'
        ? 'This module is not enabled in this environment yet.'
        : 'This area needs a permission that is granted separately from your role.';

  return (
    <PageContainer width="narrow">
      <Card padding="lg" className="text-center" elevation="raised">
        <div className="flex flex-col items-center gap-4">
          <ShieldX aria-hidden className="size-8 text-ink-muted" />
          <div>
            <h1 className="text-h2 text-ink">You do not have access to this page</h1>
            <p className="mt-2 text-body-sm text-ink-muted">{description}</p>
            {requiredPermission && (
              <p className="mt-3 text-caption text-ink-subtle">
                Required permission:{' '}
                <code className="rounded-xs bg-surface-sunken px-1 py-0.5">
                  {requiredPermission}
                </code>
              </p>
            )}
          </div>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => router.back()}>
              Go back
            </Button>
            {user && (
              <Button variant="secondary" onClick={() => router.push('/dashboard')}>
                Go to dashboard
              </Button>
            )}
          </div>
        </div>
      </Card>
    </PageContainer>
  );
}
