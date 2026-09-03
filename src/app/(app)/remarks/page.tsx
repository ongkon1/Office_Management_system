'use client';

import { RemarksInbox } from '@/features/tasks/divisions-remarks-profile';
import { useEmployeeId } from '@/features/access/use-employee';

export default function RemarksPage() {
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  return <RemarksInbox employeeId={employeeId} />;
}
