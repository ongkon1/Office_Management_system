import { describe, expect, it } from 'vitest';

import type { DepartmentLeadScope } from '@/contracts/domain';
import { authorize, hasPermission, type ActorPolicyContext } from './policy';

/**
 * `OH-BE-0207`, `OH-BE-0208` — what a department appointment grants, and what
 * it must not.
 *
 * The appointment is the only source of the capability: no role row is written,
 * so the same employee stops being a lead the moment their last appointment
 * stops being effective, and a lead reaches their own department's records and
 * nothing else.
 */

const scope = (departmentId: string, divisionId: string): DepartmentLeadScope => ({
  departmentId,
  divisionId,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
});

function actor(overrides: Partial<ActorPolicyContext> = {}): ActorPolicyContext {
  return {
    userId: 'usr-1',
    employeeId: 'emp-1',
    roles: ['employee'],
    permissions: new Set<string>(),
    divisionIds: new Set<string>(),
    employeeIds: new Set<string>(['emp-1']),
    projectIds: new Set<string>(),
    teamIds: new Set<string>(),
    ...overrides,
  };
}

const TEAM_LEAD_CAPABILITY = 'time.team.read';

describe('an effective appointment grants Team Lead capability (OH-BE-0207)', () => {
  it('grants it to an employee who leads a department', () => {
    const plain = actor();
    const lead = actor({
      departmentLeadScopes: [scope('dept-a', 'div-1')],
      departmentIds: new Set(['dept-a']),
      employeeIds: new Set(['emp-1', 'emp-2']),
    });
    expect(hasPermission(plain, TEAM_LEAD_CAPABILITY)).toBe(false);
    expect(hasPermission(lead, TEAM_LEAD_CAPABILITY)).toBe(true);
  });

  it('grants no role and no capability outside the Team Lead set', () => {
    const lead = actor({
      departmentLeadScopes: [scope('dept-a', 'div-1')],
      departmentIds: new Set(['dept-a']),
    });
    /* Roles are what is stored, not what is derived. */
    expect(lead.roles).toEqual(['employee']);
    for (const permission of ['organization.manage', 'time.period.verify', 'finance.cost.view', 'control.audit.view']) {
      expect(hasPermission(lead, permission)).toBe(false);
    }
  });

  it('is bounded to the departments appointed, not the division', () => {
    const lead = actor({
      departmentLeadScopes: [scope('dept-a', 'div-1')],
      departmentIds: new Set(['dept-a']),
      employeeIds: new Set(['emp-1', 'emp-2']),
    });
    expect(authorize(lead, TEAM_LEAD_CAPABILITY, { departmentId: 'dept-a', employeeId: 'emp-2' }, 'route_handler')).toBe(true);
    expect(authorize(lead, TEAM_LEAD_CAPABILITY, { departmentId: 'dept-b', employeeId: 'emp-2' }, 'route_handler')).toBe(false);
    /* The appointment did not widen division visibility. */
    expect(authorize(lead, TEAM_LEAD_CAPABILITY, { divisionId: 'div-1' }, 'route_handler')).toBe(false);
  });

  it('lets one employee hold several department scopes at once (OH-BE-0208)', () => {
    const lead = actor({
      departmentLeadScopes: [scope('dept-a', 'div-1'), scope('dept-b', 'div-2')],
      departmentIds: new Set(['dept-a', 'dept-b']),
      employeeIds: new Set(['emp-1', 'emp-2', 'emp-3']),
    });
    expect(authorize(lead, TEAM_LEAD_CAPABILITY, { departmentId: 'dept-a', employeeId: 'emp-2' }, 'route_handler')).toBe(true);
    expect(authorize(lead, TEAM_LEAD_CAPABILITY, { departmentId: 'dept-b', employeeId: 'emp-3' }, 'route_handler')).toBe(true);
  });

  it('grants nothing once the last scope is gone (OH-BE-0209)', () => {
    /*
     * The context is loaded per request from effective-dated rows, so an
     * appointment that has ended is simply absent — there is no revocation step
     * and nothing to purge. This is the shape the loader produces for a former
     * lead.
     */
    const formerLead = actor({ departmentLeadScopes: [], departmentIds: new Set<string>() });
    expect(hasPermission(formerLead, TEAM_LEAD_CAPABILITY)).toBe(false);
    expect(authorize(formerLead, TEAM_LEAD_CAPABILITY, { departmentId: 'dept-a' }, 'route_handler')).toBe(false);
  });

  it('still denies a mutation to Management even with a department scope', () => {
    const viewer = actor({
      roles: ['management'],
      departmentLeadScopes: [scope('dept-a', 'div-1')],
      departmentIds: new Set(['dept-a']),
    });
    expect(authorize(viewer, 'task.manage', { departmentId: 'dept-a' }, 'route_handler')).toBe(false);
  });
});
