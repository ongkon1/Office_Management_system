'use client';

import { use } from 'react';
import { TaskDetail } from '@/features/tasks/task-screens';
import { useSession } from '@/features/access/session-provider';
import { TeamTaskDetail } from '@/features/team-lead/work-management';

export default function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useSession();
  if (user?.primaryRole === 'team_lead') return <TeamTaskDetail taskId={id} />;
  return <TaskDetail taskId={id} />;
}
