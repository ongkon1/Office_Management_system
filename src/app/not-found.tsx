import Link from 'next/link';
import type { Metadata } from 'next';
import { EmptyState } from '@/components/feedback/alert';
import { PageContainer } from '@/components/layout/page';

export const metadata: Metadata = { title: 'Not found' };

/**
 * The not-found state.
 *
 * A record the viewer is not authorized to see returns this same page rather
 * than a distinct "forbidden" one, so an identifier cannot be probed to prove
 * a record exists (`REQ-SRCH-003`, `AC-AUTH-004`). A genuine permission denial
 * on a route the viewer knows about has its own screen, built in Phase 2.
 */
export default function NotFound() {
  return (
    <PageContainer width="narrow">
      <EmptyState
        variant="no-results"
        title="Page not found"
        description="This page does not exist, or you do not have access to it. Check the address, or return to your dashboard."
        secondaryAction={
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center rounded-md border border-primary bg-primary px-3.5 text-body-sm font-medium text-ink-inverse transition-colors hover:bg-primary-hover"
          >
            Go to dashboard
          </Link>
        }
      />
    </PageContainer>
  );
}
