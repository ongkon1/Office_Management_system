import { describe, expect, it } from 'vitest';
import type { DepartmentLeadScope, SessionUser } from '@/contracts/domain';
import { checkRouteAccess } from './route-access';
import { DEMO_FEATURE_FLAGS } from '@/contracts/feature-flags';
import { buildNavigation } from '@/components/shell/navigation';
import {
  describeLeadScope,
  effectiveRoleKeys,
  leadsDepartmentsNow,
  navigationRole,
} from './capabilities';

/**
 * `OH-FE-0307`, `OH-FE-0309`, `OH-FE-0312` — what an appointment offers.
 *
 * The appointment is not a role: `roles` stays what was granted, and these
 * cases pin the three things that follow from that — an appointed Employee
 * reaches Team Lead surfaces, loses them when the appointment stops being
 * effective, and keeps employee self-service throughout.
 */

const scope = (departmentId: string, divisionId: string): DepartmentLeadScope => ({
  departmentId,
  divisionId,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
});

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: 'usr-1001',
    employeeId: 'emp-1001',
    displayName: 'Nadia Rahman',
    email: 'nadia@demo.local',
    avatarUrl: null,
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    scopedDivisionIds: ['pia'],
    scopedEmployeeIds: [],
    departmentLeadScopes: [],
    timezone: 'Asia/Dhaka',
    locale: 'en-GB',
    sessionExpiresAt: '2026-09-02T18:00:00+06:00',
    ...overrides,
  } as SessionUser;
}

const APPOINTED = user({ departmentLeadScopes: [scope('dept-pia-sales', 'pia')] });

describe('an appointment grants capability, not a role (OH-FE-0307)', () => {
  it('leaves the granted roles untouched', () => {
    expect(APPOINTED.roles).toEqual(['employee']);
    expect(APPOINTED.primaryRole).toBe('employee');
    expect(leadsDepartmentsNow(APPOINTED)).toBe(true);
    expect(effectiveRoleKeys(APPOINTED)).toEqual(['employee', 'team_lead']);
  });

  it('opens the Team Lead routes while the appointment is effective', () => {
    for (const path of ['/team', '/team/timesheets', '/requests', '/workload']) {
      expect(checkRouteAccess(path, user(), DEMO_FEATURE_FLAGS).allowed, `${path} without`).toBe(false);
      expect(checkRouteAccess(path, APPOINTED, DEMO_FEATURE_FLAGS).allowed, `${path} with`).toBe(true);
    }
  });

  it('closes them again when no appointment is effective (OH-FE-0312)', () => {
    /* The service resolves scopes for today, so an ended or future appointment
       is simply absent — there is no revocation step to run. */
    const formerLead = user({ departmentLeadScopes: [] });
    expect(leadsDepartmentsNow(formerLead)).toBe(false);
    expect(checkRouteAccess('/team', formerLead, DEMO_FEATURE_FLAGS)).toMatchObject({
      allowed: false,
      reason: 'role',
    });
  });

  it('offers Team Lead navigation that still contains employee self-service', () => {
    expect(navigationRole(user())).toBe('employee');
    expect(navigationRole(APPOINTED)).toBe('team_lead');

    const navigation = buildNavigation({
      role: navigationRole(APPOINTED),
      flags: DEMO_FEATURE_FLAGS,
      permissions: APPOINTED.permissions,
    });
    const hrefs = navigation.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain('/team');
    expect(hrefs).toContain('/timesheets');
    expect(hrefs).toContain('/tasks');
  });

  it('never downgrades a role that already outranks the appointment', () => {
    for (const role of ['hr_manager', 'super_admin', 'management'] as const) {
      const elevated = user({ roles: [role], primaryRole: role, departmentLeadScopes: [scope('d', 'pia')] });
      expect(navigationRole(elevated)).toBe(role);
      expect(effectiveRoleKeys(elevated)).toEqual([role, 'team_lead']);
    }
  });

  it('does not grant an HR or administration route', () => {
    for (const path of ['/employees', '/hr', '/admin/departments', '/admin/users']) {
      expect(checkRouteAccess(path, APPOINTED, DEMO_FEATURE_FLAGS).allowed, path).toBe(false);
    }
  });
});

describe('describing a lead scope (OH-FE-0309)', () => {
  it('says nothing when there is no appointment', () => {
    expect(describeLeadScope(user())).toBeNull();
  });

  it('counts departments and divisions in words', () => {
    expect(describeLeadScope(APPOINTED)).toBe('You lead 1 department across 1 division.');
    const many = user({
      departmentLeadScopes: [
        scope('dept-pia-technical', 'pia'),
        scope('dept-pia-people', 'pia'),
        scope('dept-cjg-production', 'cjg'),
      ],
    });
    expect(describeLeadScope(many)).toBe('You lead 3 departments across 2 divisions.');
  });
});
