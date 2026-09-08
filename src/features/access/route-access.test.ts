import { describe, expect, it } from 'vitest';
import type { PermissionKey, RoleKey, SessionUser } from '@/contracts/domain';
import { DEMO_FEATURE_FLAGS, MVP_ONLY_FEATURE_FLAGS } from '@/contracts/feature-flags';
import { checkRouteAccess, findRule } from './route-access';

function userWith(role: RoleKey, permissions: readonly PermissionKey[] = []): SessionUser {
  return {
    userId: 'usr-test',
    employeeId: 'emp-test',
    displayName: 'Test User',
    email: 'test@demo.local',
    avatarUrl: null,
    roles: [role],
    primaryRole: role,
    permissions,
    scopedDivisionIds: [],
    scopedEmployeeIds: [],
    timezone: 'Asia/Dhaka',
    locale: 'en-GB',
    sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}

const allow = (pathname: string, user: SessionUser) =>
  checkRouteAccess(pathname, user, DEMO_FEATURE_FLAGS).allowed;

describe('findRule', () => {
  it('prefers the most specific rule so a child can be stricter than its parent', () => {
    expect(findRule('/finance/payroll')?.path).toBe('/finance/payroll');
    expect(findRule('/finance/hours')?.path).toBe('/finance/hours');
    expect(findRule('/finance')?.path).toBe('/finance');
  });

  it('matches on a segment boundary, not a string prefix', () => {
    // `/teams-archive` must not match the `/team` rule.
    expect(findRule('/team/timesheets')?.path).toBe('/team');
    expect(findRule('/teams-archive')).toBeNull();
  });
});

describe('checkRouteAccess', () => {
  it('lets each role reach its own dashboard', () => {
    expect(allow('/dashboard', userWith('employee'))).toBe(true);
    expect(allow('/hr', userWith('hr_manager'))).toBe(true);
    expect(allow('/finance', userWith('hr_manager'))).toBe(true);
  });

  it('keeps an Employee out of HR, Finance and administration', () => {
    const employee = userWith('employee');
    expect(allow('/hr', employee)).toBe(false);
    expect(allow('/finance', employee)).toBe(false);
    expect(allow('/admin/users', employee)).toBe(false);
    expect(allow('/attendance', employee)).toBe(false);
  });

  it('separates Finance cost routes from Finance hours by permission', () => {
    // HR absorbed the Finance role, but not its cost access: the permission is
    // still what separates these, and merging the role granted nobody anything.
    const withoutPermission = userWith('hr_manager');
    const withPermission = userWith('hr_manager', ['finance.cost.view']);

    // Hours and overtime need no extra grant.
    expect(allow('/finance/hours', withoutPermission)).toBe(true);
    expect(allow('/finance/overtime', withoutPermission)).toBe(true);

    // Screens that are wholly about money do.
    for (const route of [
      '/finance/project-costs',
      '/finance/division-costs',
      '/finance/billable',
    ]) {
      expect(allow(route, withoutPermission)).toBe(false);
      expect(allow(route, withPermission)).toBe(true);
    }

    // Payroll and reports are role-gated but not permission-gated: `FE-0611`
    // requires the restricted-field behaviour *inside* a report, and the hours
    // remain the Finance role's to see. The service redacts the money.
    for (const route of ['/finance/payroll', '/finance/reports']) {
      expect(allow(route, withoutPermission)).toBe(true);
      expect(allow(route, withPermission)).toBe(true);
    }
  });

  it('reports why access was refused, and which permission was missing', () => {
    const decision = checkRouteAccess(
      '/finance/project-costs',
      userWith('hr_manager'),
      DEMO_FEATURE_FLAGS,
    );
    expect(decision).toEqual({
      allowed: false,
      reason: 'permission',
      requiredPermission: 'finance.cost.view',
    });

    const roleDecision = checkRouteAccess('/hr', userWith('employee'), DEMO_FEATURE_FLAGS);
    expect(roleDecision).toMatchObject({ allowed: false, reason: 'role' });
  });

  it('refuses a route whose module is switched off, whatever the role', () => {
    const admin = userWith('super_admin', ['finance.cost.view', 'control.audit.view']);
    expect(allow('/leave', admin)).toBe(true);

    const decision = checkRouteAccess('/leave', admin, MVP_ONLY_FEATURE_FLAGS);
    expect(decision).toMatchObject({ allowed: false, reason: 'feature_disabled' });
  });

  it('gives the Super Administrator every administration route', () => {
    const admin = userWith('super_admin', ['control.audit.view']);
    for (const route of [
      '/admin/divisions',
      '/admin/users',
      '/admin/roles',
      '/admin/policies',
      '/admin/holidays',
      '/admin/audit',
    ]) {
      expect(allow(route, admin)).toBe(true);
    }
  });

  it('denies the audit log to an administrator lacking the audit permission', () => {
    expect(allow('/admin/audit', userWith('super_admin'))).toBe(false);
  });

  it('allows an unruled route rather than failing closed on navigation', () => {
    // Unknown paths resolve to not-found at the route level; the guard itself
    // does not need a rule for every string.
    expect(allow('/some/unlisted/path', userWith('employee'))).toBe(true);
  });
});
