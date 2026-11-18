'use client';

import { TaskList } from '@/features/tasks/task-screens';
import { useEmployeeId } from '@/features/access/use-employee';
import { useSession } from '@/features/access/session-provider';
import { TeamTaskBoard } from '@/features/team-lead/work-management';

/**
 * One route, two audiences. A Team Lead manages their team's work here, and a
 * Super Administrator oversees every task in the organisation; everyone else
 * sees their own tasks. The service decides which tasks each board contains.
 */
export default function TasksPage() {
  const { user } = useSession();
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  if (user?.primaryRole === 'team_lead' || user?.primaryRole === 'super_admin') return <TeamTaskBoard />;
  return <TaskList employeeId={employeeId} />;
}
