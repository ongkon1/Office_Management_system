'use client';

import { TaskList } from '@/features/tasks/task-screens';
import { useEmployeeId } from '@/features/access/use-employee';
import { useSession } from '@/features/access/session-provider';
import { TeamTaskBoard } from '@/features/team-lead/work-management';

export default function TasksPage() {
  const { user } = useSession();
  const employeeId = useEmployeeId();
  if (!employeeId) return null;
  if (user?.primaryRole === 'team_lead') return <TeamTaskBoard />;
  return <TaskList employeeId={employeeId} />;
}
