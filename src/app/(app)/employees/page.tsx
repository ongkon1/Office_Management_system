'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmployeeDirectory } from '@/features/hr/employees';

function Directory() {
  return <EmployeeDirectory incompleteOnly={useSearchParams().get('incomplete') === '1'} />;
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <Directory />
    </Suspense>
  );
}
