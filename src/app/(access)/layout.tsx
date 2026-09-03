'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_ROUTE } from '@/components/shell/navigation';
import { useSession } from '@/features/access/session-provider';
import { Spinner } from '@/components/ui/progress';

/**
 * Unauthenticated routes.
 *
 * An already-signed-in user is sent to their role's dashboard rather than
 * shown a sign-in form they do not need. The account-state screens live in
 * this group too, because they are reached while signed out.
 */
export default function AccessLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useSession();
  const router = useRouter();

  React.useEffect(() => {
    if (status === 'authenticated' && user) {
      router.replace(DEFAULT_ROUTE[user.primaryRole]);
    }
  }, [status, user, router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  return <>{children}</>;
}
