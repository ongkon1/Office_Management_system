'use client';

import { MyDivisions } from '@/features/tasks/divisions-remarks-profile';
import { useEmployeeId } from '@/features/access/use-employee';

export default function DivisionsPage() {
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  return <MyDivisions employeeId={employeeId} />;
}
