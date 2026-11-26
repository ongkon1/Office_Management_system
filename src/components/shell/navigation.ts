/**
 * Permission-aware navigation (FE-0124).
 *
 * This is the code form of the role-to-navigation map in
 * `docs/frontend/phase-0/information-architecture.md`. Hiding an item here is a
 * usability decision, never a security one — the route itself must still deny
 * unauthorized access (`REQ-NAV-005`).
 */

import type { PermissionKey, RoleKey } from '@/contracts/domain';
import type { NavGroupView, NavItemView } from '@/contracts/view-models';
import {
  isFeatureEnabled,
  type FeatureFlagKey,
  type FeatureFlagState,
} from '@/contracts/feature-flags';

export interface NavDefinition {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /** Resolved to an icon component by the shell. */
  readonly iconKey: string;
  readonly flag?: FeatureFlagKey;
  readonly permission?: PermissionKey;
  /** One of at most five mobile bottom-navigation destinations. */
  readonly inMobileBottomNav?: boolean;
}

export interface NavGroupDefinition {
  readonly key: string;
  readonly label: string | null;
  readonly items: readonly NavDefinition[];
}

const TASK_CATEGORIES: NavDefinition = {
  key: 'task-categories', label: 'Task Categories', href: '/admin/task-categories', iconKey: 'folder',
};

const NAVIGATION: Readonly<Record<RoleKey, readonly NavGroupDefinition[]>> = {
  employee: [
    {
      key: 'primary',
      label: null,
      items: [
        TASK_CATEGORIES,
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'timesheets', label: 'My Timesheet', href: '/timesheets', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'tasks', label: 'My Tasks', href: '/tasks', iconKey: 'check-square', inMobileBottomNav: true },
        { key: 'divisions', label: 'My Divisions', href: '/divisions', iconKey: 'building' },
        { key: 'remarks', label: 'Remarks', href: '/remarks', iconKey: 'message-square' },
      ],
    },
    {
      key: 'requests',
      label: 'Requests',
      items: [
        { key: 'wfh', label: 'WFH', href: '/wfh', iconKey: 'house', flag: 'wfhRequests' },
        { key: 'leave', label: 'Leave', href: '/leave', iconKey: 'calendar-off', flag: 'leaveManagement' },
        { key: 'evaluations', label: 'My Evaluation', href: '/evaluations', iconKey: 'award', flag: 'evaluations' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
      ],
    },
    {
      key: 'shared',
      label: 'More',
      items: [
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
        { key: 'messages', label: 'Messages', href: '/messages', iconKey: 'message-square', flag: 'messages' },
        { key: 'meeting-minutes', label: 'Meeting Minutes', href: '/meeting-minutes', iconKey: 'clipboard-list', flag: 'meetingMinutes' },
        { key: 'profile', label: 'Profile', href: '/profile', iconKey: 'user', inMobileBottomNav: true },
        { key: 'settings', label: 'Settings', href: '/settings', iconKey: 'settings' },
      ],
    },
  ],

  team_lead: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
      ],
    },
    {
      key: 'my-work',
      label: 'My work',
      items: [
        { key: 'my-timesheet', label: 'My Timesheet', href: '/timesheets', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'my-tasks', label: 'My Tasks', href: '/tasks', iconKey: 'check-square' },
      ],
    },
    {
      key: 'team-work',
      label: 'Team work',
      items: [
        { key: 'team', label: 'My Team', href: '/team', iconKey: 'users', inMobileBottomNav: true },
        { key: 'team-timesheets', label: 'Team Timesheets', href: '/team/timesheets', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'projects', label: 'Projects', href: '/projects', iconKey: 'folder-kanban', inMobileBottomNav: true },
        { key: 'meeting-minutes', label: 'Meeting Minutes', href: '/meeting-minutes', iconKey: 'clipboard-list', flag: 'meetingMinutes' },
      ],
    },
    {
      key: 'review',
      label: 'Review',
      items: [
        { key: 'requests', label: 'Requests', href: '/requests', iconKey: 'inbox', flag: 'wfhRequests' },
        { key: 'workload', label: 'Workload', href: '/workload', iconKey: 'gauge', flag: 'workloadPlanning' },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
        { key: 'evaluations', label: 'Evaluations', href: '/evaluations', iconKey: 'award', flag: 'evaluations' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
      ],
    },
    {
      key: 'self-service',
      label: 'Self service',
      items: [
        { key: 'my-wfh', label: 'WFH', href: '/wfh', iconKey: 'house', flag: 'wfhRequests' },
        { key: 'my-leave', label: 'Leave', href: '/leave', iconKey: 'calendar-off', flag: 'leaveManagement' },
        { key: 'my-settings', label: 'Settings', href: '/settings', iconKey: 'settings' },
      ],
    },
  ],

  hr_manager: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'hr-dashboard', label: 'HR Dashboard', href: '/hr', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'employees', label: 'Employees', href: '/employees', iconKey: 'users', inMobileBottomNav: true },
        { key: 'hr-timesheets', label: 'Timesheets', href: '/hr/timesheets', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'attendance', label: 'Attendance', href: '/attendance', iconKey: 'calendar-check', flag: 'attendance', inMobileBottomNav: true },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
      ],
    },
    {
      key: 'requests',
      label: 'Requests and evaluation',
      items: [
        { key: 'wfh', label: 'WFH', href: '/wfh', iconKey: 'house', flag: 'wfhRequests' },
        { key: 'leave', label: 'Leave', href: '/leave', iconKey: 'calendar-off', flag: 'leaveManagement' },
        { key: 'evaluations', label: 'Evaluations', href: '/evaluations', iconKey: 'award', flag: 'evaluations' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
      ],
    },
    /*
     * Finance, absorbed into HR (`FE-1003`).
     *
     * The groups keep the name "Finance" rather than being merged into the
     * administration list: the work is still finance work, and an HR user
     * looking for payroll needs it to be findable under the word they think in.
     * What changed is who reaches it, not what it is.
     */

    {
      key: 'finance',
      label: 'Finance',
      items: [
        { key: 'finance', label: 'Finance Dashboard', href: '/finance', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'hours', label: 'Employee Hours', href: '/finance/hours', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'overtime', label: 'Overtime', href: '/finance/overtime', iconKey: 'trending-up', inMobileBottomNav: true },
      ],
    },
    {
      key: 'costing',
      label: 'Costing',
      items: [
        {
          key: 'billable',
          label: 'Billable Analysis',
          href: '/finance/billable',
          iconKey: 'chart-pie',
          permission: 'finance.cost.view',
        },
        {
          key: 'project-costs',
          label: 'Project Costs',
          href: '/finance/project-costs',
          iconKey: 'coins',
          flag: 'projectCosting',
          permission: 'finance.cost.view',
        },
        {
          key: 'division-costs',
          label: 'Division Costs',
          href: '/finance/division-costs',
          iconKey: 'building',
          flag: 'projectCosting',
          permission: 'finance.cost.view',
        },
        // Reachable without the cost permission: the money is redacted inside
        // the screen, and the hours remain usable (`FE-0611`).
        {
          key: 'payroll',
          label: 'Payroll Reports',
          href: '/finance/payroll',
          iconKey: 'receipt',
          flag: 'financeReports',
        },
        {
          key: 'financial-reports',
          label: 'Financial Reports',
          href: '/finance/reports',
          iconKey: 'file-chart-column',
          flag: 'financeReports',
        },
      ],
    },
    {
      key: 'admin',
      label: 'Administration',
      items: [
        { key: 'holidays', label: 'Holidays', href: '/admin/holidays', iconKey: 'calendar-days' },
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
        { key: 'meeting-minutes', label: 'Meeting Minutes', href: '/meeting-minutes', iconKey: 'clipboard-list', flag: 'meetingMinutes' },
        { key: 'settings', label: 'Settings', href: '/settings', iconKey: 'settings' },
      ],
    },
  ],

  management: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column', inMobileBottomNav: true },
        { key: 'projects', label: 'Projects', href: '/projects', iconKey: 'folder-kanban', inMobileBottomNav: true },
        { key: 'meeting-minutes', label: 'Meeting Minutes', href: '/meeting-minutes', iconKey: 'clipboard-list', flag: 'meetingMinutes' },
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
        { key: 'settings', label: 'Settings', href: '/settings', iconKey: 'settings' },
      ],
    },
  ],

  super_admin: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        // Organisation-wide oversight: every task and project, across all divisions.
        { key: 'tasks', label: 'Tasks', href: '/tasks', iconKey: 'check-square' },
        { key: 'employees', label: 'Employees', href: '/employees', iconKey: 'users', inMobileBottomNav: true },
        { key: 'projects', label: 'Projects', href: '/projects', iconKey: 'folder-kanban' },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
        { key: 'meeting-minutes', label: 'Meeting Minutes', href: '/meeting-minutes', iconKey: 'clipboard-list', flag: 'meetingMinutes' },
      ],
    },
    {
      key: 'people-operations',
      label: 'People and work',
      items: [
        { key: 'hr-dashboard', label: 'HR Dashboard', href: '/hr', iconKey: 'layout-dashboard' },
        { key: 'timesheets', label: 'Timesheets', href: '/hr/timesheets', iconKey: 'clock' },
        { key: 'attendance', label: 'Attendance', href: '/attendance', iconKey: 'calendar-check', flag: 'attendance' },
        { key: 'team', label: 'Teams', href: '/team', iconKey: 'users' },
        { key: 'workload', label: 'Workload', href: '/workload', iconKey: 'gauge', flag: 'workloadPlanning' },
        { key: 'requests', label: 'Requests', href: '/requests', iconKey: 'inbox', flag: 'wfhRequests' },
        { key: 'wfh', label: 'WFH', href: '/wfh', iconKey: 'house', flag: 'wfhRequests' },
        { key: 'leave', label: 'Leave', href: '/leave', iconKey: 'calendar-off', flag: 'leaveManagement' },
        { key: 'evaluations', label: 'Evaluations', href: '/evaluations', iconKey: 'award', flag: 'evaluations' },
        { key: 'remarks', label: 'Remarks', href: '/remarks', iconKey: 'message-square' },
      ],
    },
    {
      key: 'finance',
      label: 'Finance',
      items: [
        { key: 'finance-dashboard', label: 'Finance Dashboard', href: '/finance', iconKey: 'layout-dashboard' },
        { key: 'finance-hours', label: 'Employee Hours', href: '/finance/hours', iconKey: 'clock' },
        { key: 'finance-overtime', label: 'Overtime', href: '/finance/overtime', iconKey: 'trending-up' },
        { key: 'finance-billable', label: 'Billable Analysis', href: '/finance/billable', iconKey: 'chart-pie', permission: 'finance.cost.view' },
        { key: 'project-costs', label: 'Project Costs', href: '/finance/project-costs', iconKey: 'coins', flag: 'projectCosting', permission: 'finance.cost.view' },
        { key: 'division-costs', label: 'Division Costs', href: '/finance/division-costs', iconKey: 'building', flag: 'projectCosting', permission: 'finance.cost.view' },
        { key: 'payroll', label: 'Payroll Reports', href: '/finance/payroll', iconKey: 'receipt', flag: 'financeReports' },
        { key: 'financial-reports', label: 'Financial Reports', href: '/finance/reports', iconKey: 'file-chart-column', flag: 'financeReports' },
      ],
    },
    {
      key: 'shared',
      label: 'Shared',
      items: [
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
        { key: 'messages', label: 'Messages', href: '/messages', iconKey: 'message-square', flag: 'messages' },
        { key: 'profile', label: 'Profile', href: '/profile', iconKey: 'user' },
      ],
    },
    {
      key: 'administration',
      label: 'Administration',
      items: [
        { key: 'users', label: 'Users', href: '/admin/users', iconKey: 'user-cog' },
        { key: 'departments', label: 'Departments', href: '/admin/departments', iconKey: 'building' },
        { key: 'divisions', label: 'Divisions', href: '/admin/divisions', iconKey: 'building', inMobileBottomNav: true },
        { key: 'sessions', label: 'Active Sessions', href: '/admin/sessions', iconKey: 'monitor-smartphone' },
        { key: 'policies', label: 'Work Policies', href: '/admin/policies', iconKey: 'settings' },
        { key: 'holidays', label: 'Holidays', href: '/admin/holidays', iconKey: 'calendar-days' },
        { key: 'roles', label: 'Roles and Permissions', href: '/admin/roles', iconKey: 'shield' },
        { key: 'audit', label: 'Audit Log', href: '/admin/audit', iconKey: 'scroll-text', inMobileBottomNav: true },
        { key: 'settings', label: 'Settings', href: '/settings', iconKey: 'settings' },
        {
          key: 'integrations',
          label: 'Integrations',
          href: '/admin/integrations',
          iconKey: 'plug',
          flag: 'integrations',
        },
      ],
    },
  ],
};

/** The route each role lands on after signing in. */
export const DEFAULT_ROUTE: Readonly<Record<RoleKey, string>> = {
  employee: '/dashboard',
  team_lead: '/dashboard',
  hr_manager: '/hr',
  management: '/dashboard',
  super_admin: '/dashboard',
};

export const ROLE_LABEL: Readonly<Record<RoleKey, string>> = {
  employee: 'Employee',
  team_lead: 'Team Lead',
  hr_manager: 'HR Manager',
  management: 'Management',
  super_admin: 'Super Administrator',
};

export interface BuildNavigationInput {
  readonly role: RoleKey;
  readonly flags: FeatureFlagState;
  readonly permissions: readonly PermissionKey[];
  /** Unread counts keyed by nav item key. */
  readonly badges?: Readonly<Record<string, number>>;
}

/** Resolves the definitions for a role into what the shell should render. */
export function buildNavigation({
  role,
  flags,
  permissions,
  badges,
}: BuildNavigationInput): readonly NavGroupView[] {
  const usedGroupKeys = new Set<string>();

  return NAVIGATION[role]
    .map<NavGroupView>((group, index, groups) => {
      // A role can legitimately contain multiple groups with the same
      // semantic key (for example, two `primary` sections). React keys must
      // still be unique among siblings or the navigation can duplicate/drop
      // groups during updates.
      let key = group.key;
      let duplicateIndex = 2;
      while (usedGroupKeys.has(key)) {
        key = `${group.key}-${duplicateIndex}`;
        duplicateIndex += 1;
      }
      usedGroupKeys.add(group.key);

      return {
      key,
      label: group.label,
      items: (role !== 'employee' && index === groups.length - 1 ? [...group.items, TASK_CATEGORIES] : group.items)
        .filter((item) => !item.flag || isFeatureEnabled(flags, item.flag))
        .filter((item) => role === 'super_admin' || !item.permission || permissions.includes(item.permission))
        .map<NavItemView>((item) => ({
          key: item.key,
          label: item.label,
          href: item.href,
          iconKey: item.iconKey,
          badgeCount: badges?.[item.key],
          inMobileBottomNav: item.inMobileBottomNav ?? false,
        })),
      };
    })
    .filter((group) => group.items.length > 0);
}

/**
 * The mobile bottom bar, capped at five destinations.
 *
 * The cap is a hard rule, not a preference: a sixth item makes each target too
 * narrow to hit reliably at 375 px.
 */
export function selectBottomNavItems(
  groups: readonly NavGroupView[],
): readonly NavItemView[] {
  return groups
    .flatMap((group) => group.items)
    .filter((item) => item.inMobileBottomNav)
    .slice(0, 5);
}
