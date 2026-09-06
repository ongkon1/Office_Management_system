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

const EMPLOYEE_SELF_GROUP: NavGroupDefinition = {
  key: 'my-work',
  label: 'My work',
  items: [
    { key: 'my-timesheet', label: 'My Timesheet', href: '/timesheets', iconKey: 'clock' },
    { key: 'my-tasks', label: 'My Tasks', href: '/tasks', iconKey: 'check-square' },
    { key: 'my-wfh', label: 'WFH', href: '/wfh', iconKey: 'house', flag: 'wfhRequests' },
    { key: 'my-leave', label: 'Leave', href: '/leave', iconKey: 'calendar-off', flag: 'leaveManagement' },
  ],
};

const NAVIGATION: Readonly<Record<RoleKey, readonly NavGroupDefinition[]>> = {
  employee: [
    {
      key: 'primary',
      label: null,
      items: [
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
        { key: 'profile', label: 'Profile', href: '/profile', iconKey: 'user', inMobileBottomNav: true },
      ],
    },
  ],

  team_lead: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'team', label: 'My Team', href: '/team', iconKey: 'users', inMobileBottomNav: true },
        { key: 'team-timesheets', label: 'Team Timesheets', href: '/team/timesheets', iconKey: 'clock', inMobileBottomNav: true },
        { key: 'projects', label: 'Projects', href: '/projects', iconKey: 'folder-kanban', inMobileBottomNav: true },
        { key: 'tasks', label: 'Tasks', href: '/tasks', iconKey: 'check-square' },
      ],
    },
    {
      key: 'review',
      label: 'Review',
      items: [
        { key: 'workload', label: 'Workload', href: '/workload', iconKey: 'gauge', flag: 'workloadPlanning' },
        { key: 'requests', label: 'Requests', href: '/requests', iconKey: 'inbox', flag: 'wfhRequests' },
        { key: 'evaluations', label: 'Evaluations', href: '/evaluations', iconKey: 'award', flag: 'evaluations' },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
      ],
    },
    EMPLOYEE_SELF_GROUP,
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
    {
      key: 'admin',
      label: 'Administration',
      items: [
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
        { key: 'holidays', label: 'Holidays', href: '/admin/holidays', iconKey: 'calendar-days' },
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
      ],
    },
  ],

  finance_manager: [
    {
      key: 'primary',
      label: null,
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
      key: 'review',
      label: 'Review',
      items: [
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
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
        { key: 'documents', label: 'Documents', href: '/documents', iconKey: 'folder', flag: 'documents' },
      ],
    },
  ],

  super_admin: [
    {
      key: 'primary',
      label: null,
      items: [
        { key: 'dashboard', label: 'Dashboard', href: '/dashboard', iconKey: 'layout-dashboard', inMobileBottomNav: true },
        { key: 'employees', label: 'Employees', href: '/employees', iconKey: 'users', inMobileBottomNav: true },
        { key: 'reports', label: 'Reports', href: '/reports', iconKey: 'file-chart-column' },
        { key: 'requisitions', label: 'Requisition', href: '/requisitions', iconKey: 'package-open', flag: 'requisitions' },
        { key: 'conveyance', label: 'Conveyance', href: '/conveyance', iconKey: 'car-front', flag: 'conveyance' },
      ],
    },
    {
      key: 'administration',
      label: 'Administration',
      items: [
        { key: 'divisions', label: 'Divisions', href: '/admin/divisions', iconKey: 'building', inMobileBottomNav: true },
        { key: 'users', label: 'Users', href: '/admin/users', iconKey: 'user-cog' },
        { key: 'roles', label: 'Roles and Permissions', href: '/admin/roles', iconKey: 'shield' },
        { key: 'policies', label: 'Work Policies', href: '/admin/policies', iconKey: 'settings' },
        { key: 'holidays', label: 'Holidays', href: '/admin/holidays', iconKey: 'calendar-days' },
        { key: 'audit', label: 'Audit Log', href: '/admin/audit', iconKey: 'scroll-text', inMobileBottomNav: true },
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
  finance_manager: '/finance',
  management: '/dashboard',
  super_admin: '/dashboard',
};

export const ROLE_LABEL: Readonly<Record<RoleKey, string>> = {
  employee: 'Employee',
  team_lead: 'Team Lead',
  hr_manager: 'HR Manager',
  finance_manager: 'Finance Manager',
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
  return NAVIGATION[role]
    .map<NavGroupView>((group) => ({
      key: group.key,
      label: group.label,
      items: group.items
        .filter((item) => !item.flag || isFeatureEnabled(flags, item.flag))
        .filter((item) => !item.permission || permissions.includes(item.permission))
        .map<NavItemView>((item) => ({
          key: item.key,
          label: item.label,
          href: item.href,
          iconKey: item.iconKey,
          badgeCount: badges?.[item.key],
          inMobileBottomNav: item.inMobileBottomNav ?? false,
        })),
    }))
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
