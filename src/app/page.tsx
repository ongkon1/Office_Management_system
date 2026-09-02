import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Card } from '@/components/feedback/card';
import { Badge } from '@/components/ui/badge';
import { PageContainer, PageHeader } from '@/components/layout/page';

/**
 * A temporary index for the Phase 1 build.
 *
 * Phase 2 replaces this with `/login` and role-based redirection, at which
 * point the only routes reachable without a session are the access screens.
 */
export default function Home() {
  return (
    <PageContainer width="narrow">
      <PageHeader
        title="Multi-Division Timesheet"
        description="Frontend milestone build. The design system and application shell are in place; feature screens arrive from Phase 2 onward."
        meta={<Badge tone="accent">Phase 1 · Foundation and design system</Badge>}
      />

      <div className="mt-6 flex flex-col gap-3">
        <Link
          href="/showcase"
          className="group rounded-lg transition-colors focus-visible:outline-2"
        >
          <Card className="transition-colors group-hover:border-border-strong group-hover:bg-surface-sunken">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h2 className="text-h3 text-ink">Component showcase</h2>
                <p className="mt-1 text-body-sm text-ink-muted">
                  Every shared component in its normal, hover, focus, disabled, loading,
                  empty, error, and dense states, inside the real application shell.
                </p>
              </div>
              <ArrowRight
                aria-hidden
                className="size-5 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
              />
            </div>
          </Card>
        </Link>
      </div>
    </PageContainer>
  );
}
