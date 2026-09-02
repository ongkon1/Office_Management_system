'use client';

import * as React from 'react';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback/alert';
import { PageContainer } from '@/components/layout/page';

/**
 * The route-level error boundary.
 *
 * It shows the error's `digest` rather than its message: a raw message can
 * carry record content the viewer is not authorized to see, while the digest
 * is a safe reference for support (`REQ-NFR-SEC-007`).
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // Replaced by the real error-reporting client in the backend milestone.
    console.error('Route error', error.digest ?? error.message);
  }, [error]);

  return (
    <PageContainer width="narrow">
      <EmptyState
        variant="error"
        title="Something went wrong"
        description={
          error.digest
            ? `This page could not be loaded. Quote reference ${error.digest} if you contact support.`
            : 'This page could not be loaded. Try again, and contact support if the problem continues.'
        }
        secondaryAction={
          <Button
            variant="primary"
            onClick={reset}
            iconLeading={<RotateCw aria-hidden className="size-4" />}
          >
            Try again
          </Button>
        }
      />
    </PageContainer>
  );
}
