'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchResultsPage } from '@/features/workspace/search';

function Results() {
  return <SearchResultsPage initialTerm={useSearchParams().get('q') ?? ''} />;
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <Results />
    </Suspense>
  );
}
