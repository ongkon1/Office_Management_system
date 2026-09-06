'use client';
import { use } from 'react';
import { EmployeeForm } from '@/features/hr/employees';
export default function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <EmployeeForm employeeId={id} />;
}
