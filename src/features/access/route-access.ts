/**
 * FE-0209 — route access rules.
 *
 * Navigation hides what a role cannot use, but hiding is a usability decision,
 * never the control. Every route is checked here as well, so typing a URL
 * directly produces an explicit denied state rather than a working page
 * (`REQ-NAV-005`, `AC-AUTH-001`).
 *
 * In the backend milestone this becomes a server-side check. The rule table
 * stays; only the enforcement point moves.
 */

import type { PermissionKey, RoleKey, SessionUser } from '@/contracts/domain';
import {
  findFlagForRoute,
  isFeatureEnabled,
  type FeatureFlagState,
} from '@/contracts/feature-flags';

export interface RouteRule {
  /** Matched as an exact path or as a `prefix/` segment boundary. */
  readonly path: string;
  /** Roles permitted. Omit to allow any authenticated role. */
  readonly roles?: readonly RoleKey[];
  /** Additional permission required on top of the role. */
  readonly permission?: PermissionKey;
}

const ALL_ROLES: readonly RoleKey[] = [
  'employee',
  'team_lead',
  'hr_manager',
  'management',
  'super_admin',
];

/**
 * Ordered from general to specific; the most specific match wins, so
 * `/finance/payroll` can be stricter than `/finance`.
 */
export const ROUTE_RULES: readonly RouteRule[] = [
  // Shared.
  { path: '/dashboard' },
  { path: '/notifications' },
  { path: '/search' },
  { path: '/profile' },
  { path: '/settings' },
  { path: '/documents' },
  { path: '/messages' },

  // Employee self-service. A Team Lead is also an employee.
  { path: '/timesheets', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },
  { path: '/tasks', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },
  { path: '/divisions', roles: ['employee', 'team_lead'] },
  { path: '/wfh', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },
  { path: '/leave', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },
  { path: '/evaluations', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },
  { path: '/remarks', roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'] },

  /*
   * Requisition. Every role here except Management, which is read-only and has
   * no place in the chain. Submission is narrower still — Employee and Team
   * Lead only — but that is a service rule, not a route rule: Finance opening
   * `/requisitions` should reach their review queue, not a denial.
   */
  {
    path: '/requisitions',
    roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'],
  },

  // Conveyance travels the same chain, so it has the same audiences.
  {
    path: '/conveyance',
    roles: ['employee', 'team_lead', 'hr_manager', 'super_admin'],
  },

  // Team Lead scope.
  { path: '/team', roles: ['team_lead', 'hr_manager', 'super_admin'] },
  { path: '/projects', roles: ALL_ROLES },
  { path: '/workload', roles: ['team_lead', 'hr_manager', 'super_admin'] },
  { path: '/requests', roles: ['team_lead', 'hr_manager', 'super_admin'] },
  { path: '/reports', roles: ALL_ROLES },

  // HR.
  { path: '/hr', roles: ['hr_manager', 'super_admin'] },
  { path: '/employees', roles: ['hr_manager', 'super_admin'] },
  { path: '/attendance', roles: ['hr_manager', 'super_admin'] },

  /*
   * Finance, now owned by HR (`FE-1004`). The paths are unchanged: renaming
   * them would break every deep link and audit reference for no gain.
   *
   * Note what did *not* change — `finance.cost.view` still gates every money
   * route. HR reaching these screens is a role change; seeing cost on them is
   * still a separate grant (`REQ-RBAC-017`).
   */
  { path: '/finance', roles: ['hr_manager', 'super_admin'] },
  { path: '/finance/hours', roles: ['hr_manager', 'super_admin'] },
  { path: '/finance/overtime', roles: ['hr_manager', 'super_admin'] },
  {
    path: '/finance/billable',
    roles: ['hr_manager', 'super_admin'],
    permission: 'finance.cost.view',
  },
  {
    path: '/finance/project-costs',
    roles: ['hr_manager', 'super_admin'],
    permission: 'finance.cost.view',
  },
  {
    path: '/finance/division-costs',
    roles: ['hr_manager', 'super_admin'],
    permission: 'finance.cost.view',
  },
  /*
   * Payroll and reports are role-gated but not permission-gated.
   *
   * `FE-0611` requires restricted-field behaviour *inside* a report: the cost
   * column stays, its cells read `Restricted`, and the hours remain usable.
   * Denying the whole screen would make that behaviour unreachable and would
   * withhold hours the Finance role is entitled to. The service redacts the
   * money; the route does not hide the page.
   */
  { path: '/finance/payroll', roles: ['hr_manager', 'super_admin'] },
  { path: '/finance/reports', roles: ['hr_manager', 'super_admin'] },

  // Administration.
  { path: '/admin', roles: ['super_admin'] },
  { path: '/admin/holidays', roles: ['super_admin', 'hr_manager'] },
  { path: '/admin/audit', roles: ['super_admin'], permission: 'control.audit.view' },
];

export type AccessDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason: 'role' | 'permission' | 'feature_disabled';
      readonly requiredPermission?: PermissionKey;
    };

function matches(rulePath: string, pathname: string): boolean {
  return pathname === rulePath || pathname.startsWith(`${rulePath}/`);
}

/** The most specific matching rule, or `null` when no rule covers the path. */
export function findRule(pathname: string): RouteRule | null {
  let best: RouteRule | null = null;
  for (const rule of ROUTE_RULES) {
    if (!matches(rule.path, pathname)) continue;
    if (!best || rule.path.length > best.path.length) best = rule;
  }
  return best;
}

export function checkRouteAccess(
  pathname: string,
  user: SessionUser,
  flags: FeatureFlagState,
): AccessDecision {
  const flag = findFlagForRoute(pathname);
  if (flag && !isFeatureEnabled(flags, flag.key)) {
    return { allowed: false, reason: 'feature_disabled' };
  }

  const rule = findRule(pathname);
  if (!rule) return { allowed: true };

  if (rule.roles && !rule.roles.some((role) => user.roles.includes(role))) {
    return { allowed: false, reason: 'role' };
  }

  if (rule.permission && !user.permissions.includes(rule.permission)) {
    return {
      allowed: false,
      reason: 'permission',
      requiredPermission: rule.permission,
    };
  }

  return { allowed: true };
}
