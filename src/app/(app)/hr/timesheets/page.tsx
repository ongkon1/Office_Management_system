'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PeriodVerificationWorkspace } from '@/features/hr/verification';

function Workspace() {
  const period = useSearchParams().get('period');
  return <PeriodVerificationWorkspace periodId={period ?? undefined} />;
}

export default function HrTimesheetsPage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}
