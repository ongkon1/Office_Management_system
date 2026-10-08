import { describe, expect, it } from 'vitest';

import type { ActorPolicyContext } from '@/server/authorization/policy';
import { reachesEmployee, resolveAuthority } from './department-authority';

/**
 * `OH-BE-0301` … `OH-BE-0309` — the two decisions every rewired workflow makes,
 * without a database.
 *
 * `resolveAuthority` is the precedence rule; `reachesEmployee` is the reach
 * test that replaced six hand-written variations, one of which silently
 * excluded every department lead because it required the division.
 */

function actor(overrides: Partial<ActorPolicyContext> = {}): ActorPolicyContext {
  return {
    userId: 'usr-1',
    employeeId: 'emp-lead',
    roles: ['employee'],
    permissions: new Set<string>(),
    divisionIds: new Set<string>(),
    employeeIds: new Set<string>(['emp-lead']),
    projectIds: new Set<string>(),
    teamIds: new Set<string>(),
    ...overrides,
  };
}

describe('authority precedence (OH-BE-0301)', () => {
  it('prefers the department appointment over the frozen legacy lead', () => {
    expect(
      resolveAuthority({ departmentLeadEmployeeId: 'emp-appointed', legacyLeadEmployeeId: 'emp-legacy' }),
    ).toEqual({ leadEmployeeId: 'emp-appointed', fromDepartment: true });
  });

  it('keeps the legacy lead where the backfill could not place the assignment', () => {
    expect(
      resolveAuthority({ departmentLeadEmployeeId: null, legacyLeadEmployeeId: 'emp-legacy' }),
    ).toEqual({ leadEmployeeId: 'emp-legacy', fromDepartment: false });
  });

  it('resolves to nobody when neither route names a lead', () => {
    expect(resolveAuthority({ departmentLeadEmployeeId: null, legacyLeadEmployeeId: null })).toEqual({
      leadEmployeeId: null,
      fromDepartment: false,
    });
  });
});

describe('reach (OH-BE-0303, OH-BE-0307, OH-BE-0308)', () => {
  it('always reaches oneself', () => {
    expect(reachesEmployee(actor(), { employeeId: 'emp-lead' })).toBe(true);
  });

  it('reaches anybody for HR and a Super Administrator', () => {
    for (const role of ['hr_manager', 'super_admin'] as const) {
      expect(
        reachesEmployee(actor({ roles: [role], employeeIds: new Set() }), { employeeId: 'emp-other', divisionId: 'div-9' }),
      ).toBe(true);
    }
  });

  it('reaches a department member even though the appointment never widened the division', () => {
    const lead = actor({
      employeeIds: new Set(['emp-lead', 'emp-member']),
      departmentIds: new Set(['dept-a']),
      departmentLeadScopes: [
        { departmentId: 'dept-a', divisionId: 'div-1', effectiveFrom: '2026-01-01', effectiveTo: null },
      ],
    });
    expect(reachesEmployee(lead, { employeeId: 'emp-member', divisionId: 'div-1' })).toBe(true);
    /* And still not somebody outside the derived employee set. */
    expect(reachesEmployee(lead, { employeeId: 'emp-stranger', divisionId: 'div-1' })).toBe(false);
  });

  it('reaches a division-scoped lead relationship without any department', () => {
    const legacyLead = actor({
      employeeIds: new Set(['emp-lead', 'emp-member']),
      divisionIds: new Set(['div-1']),
    });
    expect(reachesEmployee(legacyLead, { employeeId: 'emp-member', divisionId: 'div-1' })).toBe(true);
    expect(reachesEmployee(legacyLead, { employeeId: 'emp-member', divisionId: 'div-2' })).toBe(false);
  });

  it('refuses an employee nobody has scoped the actor to', () => {
    expect(reachesEmployee(actor({ divisionIds: new Set(['div-1']) }), { employeeId: 'emp-other', divisionId: 'div-1' })).toBe(
      false,
    );
  });
});
