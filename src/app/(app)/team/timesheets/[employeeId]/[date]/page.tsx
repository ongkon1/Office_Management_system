'use client';
import { use } from 'react';
import { TeamTimesheetDetail } from '@/features/team-lead/team-overview';
export default function TeamTimesheetDetailPage({ params }: { params: Promise<{ employeeId: string; date: string }> }) { const { employeeId, date } = use(params); return <TeamTimesheetDetail employeeId={employeeId} date={date} />; }
