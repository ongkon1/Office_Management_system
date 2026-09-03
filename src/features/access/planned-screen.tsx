'use client';

import { CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/feedback/card';
import { PageContainer, PageHeader } from '@/components/layout/page';
import { findPlannedRoute, type PlannedRoute } from './planned-routes';

/**
 * The "a later phase builds this" screen.
 *
 * It lives apart from the catch-all route because a route can now exist for one
 * role and not another: `/wfh` is HR administration today and employee
 * self-service in Phase 7, so the employee view renders this deliberately
 * rather than a permission denial, which would be the wrong explanation.
 */
export function PlannedScreen({
  pathname,
  route,
}: {
  pathname: string;
  route?: PlannedRoute;
}) {
  const planned = route ?? findPlannedRoute(pathname);
  if (!planned) return null;

  return (
    <PageContainer>
      <PageHeader
        title={planned.title}
        description={planned.summary}
        meta={<Badge tone="accent">Phase {planned.phase}</Badge>}
      />

      <Card className="mt-6" padding="lg">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CalendarClock aria-hidden className="size-8 text-ink-subtle" />
          <div className="max-w-md">
            <p className="text-body font-semibold text-ink">
              This screen is built in Phase {planned.phase}
            </p>
            <p className="mt-1 text-body-sm text-ink-muted">
              The route, navigation entry and access rules are in place now, so this area is
              reachable and correctly scoped. The interface itself arrives with{' '}
              <span className="whitespace-nowrap">{planned.tasks}</span>.
            </p>
          </div>
          <p className="mt-1 text-caption text-ink-subtle">
            <code className="rounded-xs bg-surface-sunken px-1.5 py-0.5">{pathname}</code>
          </p>
        </div>
      </Card>
    </PageContainer>
  );
}
