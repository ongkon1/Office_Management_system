'use client';

import { RoleLanding } from '@/features/access/role-landing';
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
    return (
      <RoleLanding
        title="Administration"
        phase={7}
        summary="Divisions, users, roles, policies, holidays and the audit log."
        destinations={[
          { label: 'Divisions', href: '/admin/divisions', note: 'Create and deactivate divisions' },
          { label: 'Users', href: '/admin/users', note: 'Accounts and role assignment' },
          { label: 'Roles and Permissions', href: '/admin/roles', note: 'Scope and sensitive grants' },
          { label: 'Work Policies', href: '/admin/policies', note: 'Hours, break and overtime rules' },
          { label: 'Holidays', href: '/admin/holidays', note: 'Company, division and weekly calendars' },
          { label: 'Audit Log', href: '/admin/audit', note: 'Actor, action, resource, before/after' },
        ]}
      />
    );
  }

  return <EmployeeDashboard userId={user.userId} />;
}
