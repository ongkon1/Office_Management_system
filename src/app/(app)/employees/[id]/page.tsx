'use client';
import { use } from 'react';
import { EmployeeDetail } from '@/features/hr/employees';
export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmployeeDetail employeeId={id} />;
}
