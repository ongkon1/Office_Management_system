import { PageContainer } from '@/components/layout/page';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The route-level loading state.
 *
 * It mirrors the shape of a typical page — header, metric row, content block —
 * so the layout does not jump when the real content replaces it.
 */
export default function Loading() {
  return (
    <PageContainer>
      <div role="status" aria-busy aria-live="polite" className="flex flex-col gap-5">
        <span className="sr-only">Loading page</span>

        <div className="flex flex-col gap-2">
          <Skeleton height="0.75rem" width="12rem" />
          <Skeleton height="1.75rem" width="18rem" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} height="6.5rem" rounded="md" />
          ))}
        </div>

        <Skeleton height="20rem" rounded="md" />
      </div>
    </PageContainer>
  );
}
