'use client';

import { use } from 'react';
import { RemarkDetail } from '@/features/tasks/divisions-remarks-profile';
import { useEmployeeId } from '@/features/access/use-employee';

export default function RemarkDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  return <RemarkDetail remarkId={id} employeeId={employeeId} />;
}
