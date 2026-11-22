import { EmployeeDetail } from '@/features/hr/employees';

export default async function EmployeeDetailPage({ params, searchParams }: PageProps<'/employees/[id]'>) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <EmployeeDetail
      employeeId={id}
      initialTab={typeof query.tab === 'string' ? query.tab : undefined}
    />
  );
}
