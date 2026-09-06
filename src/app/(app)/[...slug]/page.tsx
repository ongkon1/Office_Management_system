'use client';

import { notFound, usePathname } from 'next/navigation';
import { findPlannedRoute } from '@/features/access/planned-routes';
import { PlannedScreen } from '@/features/access/planned-screen';

/**
 * Placeholder for destinations navigation links to that a later phase builds.
 *
 * Only registered routes land here — anything unregistered falls through to
 * not-found, so this cannot quietly swallow a typo or a dead link. The guard in
 * the group layout has already run, so an unauthorized user sees the denied
 * screen instead of this page.
 */
export default function PlannedScreenPage() {
  const pathname = usePathname();
  const planned = findPlannedRoute(pathname);
  if (!planned) notFound();
  return <PlannedScreen pathname={pathname} route={planned} />;
}
