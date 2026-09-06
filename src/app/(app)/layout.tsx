'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/features/settings/flag-store';
import { Spinner } from '@/components/ui/progress';
import { PermissionDeniedScreen } from '@/features/access/account-state';
import { AppShellHost } from '@/features/access/app-shell-host';
import { checkRouteAccess } from '@/features/access/route-access';
import { useSession } from '@/features/access/session-provider';

/**
 * Authenticated routes.
 *
 * Two guards run here, and they behave differently on purpose:
 *
 *  - **No session** → redirect to `/login`, preserving the attempted URL so the
 *    user lands where they were going after signing in.
 *  - **Session but no access** → render the denied screen *in place*, keeping
 *    the URL. Redirecting would hide which route was refused, and direct-route
 *    testing is exactly what this guard exists to make demonstrable (FE-0209).
 *
 * This is a client-side guard because the frontend milestone has no server
 * session. The backend milestone moves the check server-side; the rule table in
 * `route-access.ts` is unchanged by that move.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const flags = useFeatureFlags();

  React.useEffect(() => {
    if (status === 'unauthenticated') {
      const returnTo = encodeURIComponent(pathname);
      router.replace(`/login?returnTo=${returnTo}`);
    }
  }, [status, pathname, router]);

  if (status === 'loading' || status === 'unauthenticated' || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label="Checking your session" />
      </div>
    );
  }

  const decision = checkRouteAccess(pathname, user, flags);

  return (
    <AppShellHost>
      {decision.allowed ? (
        children
      ) : (
        <PermissionDeniedScreen
          reason={decision.reason}
          requiredPermission={decision.requiredPermission}
        />
      )}
    </AppShellHost>
  );
}
