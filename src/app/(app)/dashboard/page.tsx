'use client';

import { AdminDashboard } from '@/features/admin/admin-dashboard';
import { EmployeeDashboard } from '@/features/dashboard/employee-dashboard';
import { ManagementDashboard } from '@/features/management/management-dashboard';
import { TeamLeadDashboard } from '@/features/team-lead/team-overview';
import { useSession } from '@/features/access/session-provider';

export default function DashboardPage() {
  const { user } = useSession();
  if (!user) return null;

  if (user.primaryRole === 'team_lead') return <TeamLeadDashboard />;

  if (user.primaryRole === 'management') return <ManagementDashboard />;

  if (user.primaryRole === 'super_admin') {
    return <AdminDashboard />;
  }

  return <EmployeeDashboard userId={user.userId} />;
}
