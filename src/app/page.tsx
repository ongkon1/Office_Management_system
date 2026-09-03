'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@/components/ui/progress';
import { DEFAULT_ROUTE } from '@/components/shell/navigation';
import { useSession } from '@/features/access/session-provider';

/**
 * The entry point.
 *
 * Signed in, it forwards to the role's default route; signed out, to `/login`.
 * It renders nothing of its own, so there is no landing page to keep in sync
 * with the dashboards it forwards to.
 */
export default function RootPage() {
  const { status, user } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'loading') return;
    router.replace(user ? DEFAULT_ROUTE[user.primaryRole] : '/login');
  }, [status, user, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner label="Loading" />
    </div>
  );
}
