'use client';

import { TimesheetViews } from '@/features/timesheet/timesheet-views';
import { useEmployeeId } from '@/features/access/use-employee';

export default function TimesheetsPage() {
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  return <TimesheetViews employeeId={employeeId} />;
}
