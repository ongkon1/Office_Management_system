'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, FlaskConical } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/avatar';
import { Callout } from '@/components/feedback/alert';
import { DEFAULT_ROUTE, ROLE_LABEL } from '@/components/shell/navigation';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/services/mock/accounts';
import { isDemoMode } from './demo-mode';
import { useSession } from './session-provider';

/**
 * FE-0207 — development-only demo account selection.
 *
 * Rendered only when demo mode is on, so a production build has no
 * one-click sign-in. Choosing an account performs a real sign-in through the
 * same service the form uses, including the two-factor step where the account
 * requires it — a shortcut that skipped it would hide a screen from review.
 */
export function DemoAccountPicker() {
  const router = useRouter();
  const { login } = useSession();
  const [open, setOpen] = React.useState(false);
  const [busyUserId, setBusyUserId] = React.useState<string | null>(null);

  if (!isDemoMode()) return null;

  async function signInAs(email: string, userId: string) {
    setBusyUserId(userId);
    const result = await login({ identifier: email, password: DEMO_PASSWORD, rememberMe: false });
    setBusyUserId(null);

    if (result.status === 'success') {
      if (result.data.requiresTwoFactor) {
        router.push('/two-factor');
        return;
      }
      const user = result.data.user;
      router.replace(user ? DEFAULT_ROUTE[user.primaryRole] : '/dashboard');
      return;
    }

    if (result.status === 'permission_denied' && result.guidance?.startsWith('/')) {
      router.push(result.guidance);
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-border-strong bg-surface-sunken p-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-6 w-full items-center justify-between gap-3 rounded-md text-left"
      >
        <span className="flex items-center gap-2">
          <FlaskConical aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span className="text-body-sm font-medium text-ink">Demo accounts</span>
          <Badge tone="warning">Development only</Badge>
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'size-4 shrink-0 text-ink-muted transition-transform duration-200',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-3">
          <Callout tone="info">
            Every account uses the password <code className="font-semibold">{DEMO_PASSWORD}</code>.
            Selecting one signs in through the normal flow.
          </Callout>

          <ul className="flex max-h-96 flex-col gap-1.5 overflow-y-auto">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.userId}>
                <button
                  type="button"
                  disabled={busyUserId !== null}
                  onClick={() => signInAs(account.email, account.userId)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-md border border-border bg-surface p-2.5 text-left',
                    'transition-colors hover:border-border-strong hover:bg-surface-sunken',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    busyUserId === account.userId && 'border-accent',
                  )}
                >
                  <Avatar name={account.fullName} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="text-body-sm font-medium text-ink">
                        {account.fullName}
                      </span>
                      <span className="text-caption text-ink-subtle">
                        {ROLE_LABEL[account.primaryRole]}
                      </span>
                      {account.status !== 'active' && (
                        <Badge tone={account.status === 'locked' ? 'danger' : 'neutral'}>
                          {account.status === 'locked' ? 'Locked' : 'Inactive'}
                        </Badge>
                      )}
                      {account.twoFactorEnabled && <Badge tone="info">2FA</Badge>}
                    </span>
                    <span className="mt-0.5 block text-caption text-ink-muted">
                      {account.demonstrates}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
