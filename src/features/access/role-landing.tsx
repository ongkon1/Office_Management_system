'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ROLE_LABEL } from '@/components/shell/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/feedback/card';
import { Alert } from '@/components/feedback/alert';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { formatDateWithWeekday, formatTimestamp } from '@/lib/format';
import { DEMO_DATE, findAccountByUserId } from '@/services/mock/accounts';
import { useSession } from './session-provider';

/**
 * The landing page each role reaches after signing in (`FE-0208`).
 *
 * Phase 2 proves the routing, shell, scope and session behaviour. The real
 * metrics arrive with each role's phase, so this states plainly what is not
 * built yet rather than showing placeholder numbers that could be mistaken for
 * data.
 */
export function RoleLanding({
  title,
  phase,
  summary,
  destinations,
}: {
  title: string;
  phase: number;
  summary: string;
  destinations: readonly { readonly label: string; readonly href: string; readonly note: string }[];
}) {
  const { user } = useSession();
  if (!user) return null;

  const account = findAccountByUserId(user.userId);

  return (
    <PageContainer>
      <PageHeader
        title={title}
        description={summary}
        meta={
          <>
            <Badge tone="accent">{ROLE_LABEL[user.primaryRole]}</Badge>
            <Badge>Dashboard arrives in Phase {phase}</Badge>
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-5">
        <Card>
          <h2 className="text-h3 text-ink">Signed in as {user.displayName}</h2>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-label text-ink-muted">Role</dt>
              <dd className="text-body-sm text-ink">{ROLE_LABEL[user.primaryRole]}</dd>
            </div>
            <div>
              <dt className="text-label text-ink-muted">Today</dt>
              <dd className="text-body-sm text-ink">{formatDateWithWeekday(DEMO_DATE)}</dd>
            </div>
            <div>
              <dt className="text-label text-ink-muted">Divisions in scope</dt>
              <dd className="text-body-sm text-ink">
                {user.scopedDivisionIds.length} of 5
              </dd>
            </div>
            <div>
              <dt className="text-label text-ink-muted">Last signed in</dt>
              <dd className="text-body-sm text-ink">
                {account?.lastLoginAt
                  ? formatTimestamp(account.lastLoginAt, user.timezone)
                  : 'First sign-in'}
              </dd>
            </div>
            {user.permissions.length > 0 && (
              <div className="sm:col-span-2">
                <dt className="text-label text-ink-muted">Additional permissions</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {user.permissions.map((permission) => (
                    <Badge key={permission} tone="info">
                      {permission}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </Card>

        <Alert tone="info" title={`This dashboard is built in Phase ${phase}`}>
          Phase 2 delivers authentication, the role-aware shell, and access control. No
          metrics are shown here yet — placeholder numbers would be indistinguishable from
          real ones.
        </Alert>

        <section>
          <h2 className="text-h3 text-ink">Your areas</h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {destinations.map((destination) => (
              <li key={destination.href}>
                <Link href={destination.href} className="group block rounded-lg">
                  <Card className="h-full transition-colors group-hover:border-border-strong group-hover:bg-surface-sunken">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-medium text-ink">
                          {destination.label}
                        </p>
                        <p className="mt-0.5 text-caption text-ink-muted">
                          {destination.note}
                        </p>
                      </div>
                      <ArrowRight
                        aria-hidden
                        className="size-4 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                      />
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PageContainer>
  );
}
