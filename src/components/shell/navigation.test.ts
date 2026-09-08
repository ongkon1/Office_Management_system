import { describe, expect, it } from 'vitest';
import {
  DEMO_FEATURE_FLAGS,
  MVP_ONLY_FEATURE_FLAGS,
} from '@/contracts/feature-flags';
import { buildNavigation, selectBottomNavItems, DEFAULT_ROUTE } from './navigation';

const ALL_ROLES = [
  'employee',
  'team_lead',
  'hr_manager',
  'management',
  'super_admin',
] as const;

function hrefsFor(...args: Parameters<typeof buildNavigation>): string[] {
  return buildNavigation(...args).flatMap((group) => group.items.map((item) => item.href));
}

describe('buildNavigation', () => {
  it('gives every role a non-empty navigation containing its default route', () => {
    for (const role of ALL_ROLES) {
      const hrefs = hrefsFor({
        role,
        flags: DEMO_FEATURE_FLAGS,
        permissions: [],
      });
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs).toContain(DEFAULT_ROUTE[role]);
    }
  });

  it('removes flagged destinations when the module is disabled', () => {
    const withFlags = hrefsFor({
      role: 'employee',
      flags: DEMO_FEATURE_FLAGS,
      permissions: [],
    });
    const mvpOnly = hrefsFor({
      role: 'employee',
      flags: MVP_ONLY_FEATURE_FLAGS,
      permissions: [],
    });

    expect(withFlags).toContain('/leave');
    expect(mvpOnly).not.toContain('/leave');
    // MVP destinations survive with every flag off.
    expect(mvpOnly).toContain('/timesheets');
    expect(mvpOnly).toContain('/tasks');
  });

  it('hides cost destinations from an HR user without the financial permission', () => {
    const withoutPermission = hrefsFor({
      role: 'hr_manager',
      flags: DEMO_FEATURE_FLAGS,
      permissions: [],
    });
    const withPermission = hrefsFor({
      role: 'hr_manager',
      flags: DEMO_FEATURE_FLAGS,
      permissions: ['finance.cost.view'],
    });

    expect(withoutPermission).not.toContain('/finance/project-costs');
    expect(withoutPermission).not.toContain('/finance/division-costs');
    expect(withoutPermission).not.toContain('/finance/billable');
    // Verified hours remain available either way, and so do payroll and
    // reports: those screens redact the money inside rather than disappearing,
    // which is what `FE-0611` requires.
    expect(withoutPermission).toContain('/finance/hours');
    expect(withoutPermission).toContain('/finance/payroll');
    expect(withoutPermission).toContain('/finance/reports');

    expect(withPermission).toContain('/finance/project-costs');
    expect(withPermission).toContain('/finance/payroll');
  });

  it('drops a group entirely once all of its items are filtered out', () => {
    const groups = buildNavigation({
      role: 'hr_manager',
      // Every costing destination is either permission-gated or behind a
      // feature flag, so switching both off must remove the group rather than
      // leaving an empty heading.
      flags: { ...DEMO_FEATURE_FLAGS, financeReports: false, projectCosting: false },
      permissions: [],
    });
    expect(groups.every((group) => group.items.length > 0)).toBe(true);
    expect(groups.some((group) => group.key === 'costing')).toBe(false);
  });
});

describe('selectBottomNavItems', () => {
  it('never exceeds five destinations for any role', () => {
    for (const role of ALL_ROLES) {
      const items = selectBottomNavItems(
        buildNavigation({ role, flags: DEMO_FEATURE_FLAGS, permissions: ['finance.cost.view'] }),
      );
      expect(items.length).toBeGreaterThan(0);
      expect(items.length).toBeLessThanOrEqual(5);
    }
  });
});
