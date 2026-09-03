'use client';

import { use } from 'react';
import { EvaluationDetail } from '@/features/team-lead/people-operations';
import { HrEvaluationDetail } from '@/features/hr/evaluations';
import { SelfEvaluation } from '@/features/workspace/self-service';
import { useSession } from '@/features/access/session-provider';

export default function EvaluationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  if (user?.primaryRole === 'hr_manager' || user?.primaryRole === 'super_admin') {
    return <HrEvaluationDetail evaluationId={id} />;
  }
  if (user?.primaryRole === 'team_lead') return <EvaluationDetail evaluationId={id} />;
  return <SelfEvaluation />;
}
