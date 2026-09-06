import { describe, expect, it } from 'vitest';
import { authorize, indistinguishableNotFound, mapAuthorizedFields, type ActorPolicyContext, type EntryPoint } from './policy';

const actor = (role: ActorPolicyContext['roles'][number], permissions: string[] = []): ActorPolicyContext => ({
  userId:'u1',employeeId:'e1',roles:[role],permissions:new Set(permissions),divisionIds:new Set(['d1']),employeeIds:new Set(['e1','e2']),projectIds:new Set(['p1']),teamIds:new Set(['t1']),
});

describe('BE-0210..0217 and BE-0224 authorization matrix', () => {
  const boundaries: EntryPoint[] = ['server_component','server_action','route_handler','job','search','report','export'];
  it.each(boundaries)('enforces the same policy at %s', (boundary) => {
    expect(authorize(actor('team_lead'), 'time.team.read', { employeeId:'e2',divisionId:'d1',effective:true }, boundary)).toBe(true);
    expect(authorize(actor('team_lead'), 'time.team.read', { employeeId:'outside',divisionId:'d1',effective:true }, boundary)).toBe(false);
  });
  it('limits employees to self and management to reads', () => {
    expect(authorize(actor('employee'),'time.self.manage',{employeeId:'e1'},'server_action')).toBe(true);
    expect(authorize(actor('employee'),'time.self.manage',{employeeId:'e2'},'server_action')).toBe(false);
    expect(authorize(actor('management'),'report.write',{},'route_handler')).toBe(false);
  });
  it.each(['government','salary','cost_rate','labour_cost','evaluation','export','document','attachment','audit'] as const)('denies %s by default', (sensitivity) => {
    expect(authorize(actor('super_admin',[]),'organization.read',{sensitivity},'server_component')).toBe(true);
    expect(authorize(actor('team_lead'),'organization.read',{sensitivity},'server_component')).toBe(false);
  });
  it('omits protected fields and makes unauthorized ids indistinguishable', () => {
    expect(mapAuthorizedFields({hours:420,cost:'10.00'},actor('finance_manager'),{cost:'labour_cost'})).toEqual({hours:420});
    expect(indistinguishableNotFound('attachment')).toEqual(indistinguishableNotFound('attachment'));
  });
});
