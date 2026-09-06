'use client';

import { use } from 'react';
import { notFound } from 'next/navigation';
import { DayView } from '@/features/timesheet/day-view';
import { useEmployeeId } from '@/features/access/use-employee';

export default function TimesheetDayPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = use(params);
  const employeeId = useEmployeeId();

  // An unparseable date is not found, not an error: the URL is simply wrong.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  if (!employeeId) return null;

  return <DayView employeeId={employeeId} date={date} />;
}
