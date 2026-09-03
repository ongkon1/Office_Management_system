'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EvaluationQueue } from '@/features/team-lead/people-operations';
import { EvaluationAdministration } from '@/features/hr/evaluations';
import { SelfEvaluation } from '@/features/workspace/self-service';
import { useSession } from '@/features/access/session-provider';

function Evaluations() {
  const { user } = useSession();
  const period = useSearchParams().get('period');
  if (user?.primaryRole === 'hr_manager' || user?.primaryRole === 'super_admin') {
    return <EvaluationAdministration periodId={period ?? undefined} />;
  }
  if (user?.primaryRole === 'team_lead') return <EvaluationQueue />;
  return <SelfEvaluation />;
}

export default function EvaluationsPage() {
  return (
    <Suspense fallback={null}>
      <Evaluations />
    </Suspense>
  );
}
