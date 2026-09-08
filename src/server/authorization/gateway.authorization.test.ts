import {describe,expect,it} from 'vitest';
import type {RoleKey} from '@/contracts/domain';
import {authorize, type ActorPolicyContext, type EntryPoint} from './policy';
import {authorizeMutation,countAuthorized,mapAuthorizedRecord,readAuthorized} from './gateway';

const actor=(role:RoleKey,permissions:string[]=[]):ActorPolicyContext=>({userId:`u-${role}`,employeeId:`e-${role}`,roles:[role],permissions:new Set(permissions),divisionIds:new Set(['d1']),employeeIds:new Set([`e-${role}`,'e-team']),projectIds:new Set(['p1']),teamIds:new Set(['t1'])});
const boundaries:EntryPoint[]=['server_component','server_action','route_handler','job','search','report','export'];

describe('Phase 2 exit matrix across every trusted server boundary',()=>{
  it.each([
    ['super_admin','organization.read',true],['team_lead','time.team.read',true],['employee','time.self.manage',true],
    ['hr_manager','time.period.verify',true],['hr_manager','report.finance.read',true],['management','report.read',true],
  ] as const)('%s receives its baseline %s capability', (role,permission,allowed)=>expect(authorize(actor(role),permission,{},'server_component')).toBe(allowed));

  it.each(boundaries)('prevents scope bypass and identifier disclosure at %s',(boundary)=>{
    const lead=actor('team_lead'); const visible={value:{id:'visible'},policy:{employeeId:'e-team',divisionId:'d1',effective:true}};const hidden={value:{id:'hidden'},policy:{employeeId:'outside',divisionId:'d1',effective:true}};
    expect(readAuthorized(lead,'time.team.read',visible,boundary).status).toBe('success');
    expect(readAuthorized(lead,'time.team.read',hidden,boundary)).toEqual(readAuthorized(lead,'time.team.read',null,boundary));
    expect(countAuthorized(lead,'time.team.read',[visible,hidden],boundary)).toBe(1);
  });

  it('omits protected fields before a response leaves the service',()=>{
    const result=mapAuthorizedRecord(actor('hr_manager'),'report.finance.read',{value:{minutes:420,salary:'1.00',cost:'2.00'},policy:{}},'report',{salary:'salary',cost:'labour_cost'});
    expect(result).toEqual({status:'success',data:{minutes:420}});
  });

  it.each(boundaries)('denies Management/View-Only mutations at %s even with an accidental grant',(boundary)=>{
    expect(authorizeMutation(actor('management',['task.manage']),'task.manage',{},boundary).status).toBe('permission_denied');
  });

  it.each(['government','salary','cost_rate','labour_cost','evaluation','export','document','attachment','audit'] as const)('denies sensitive %s data without its explicit permission',(sensitivity)=>{
    expect(readAuthorized(actor('employee'),'organization.self.read',{value:{id:'x'},policy:{sensitivity}},'route_handler').status).toBe('not_found');
  });

  it('enforces effective dates and workflow states',()=>{
    expect(authorize(actor('team_lead'),'request.decide',{effective:false},'server_action')).toBe(false);
    expect(authorize(actor('team_lead'),'request.decide',{workflowState:'draft',allowedWorkflowStates:['submitted']},'server_action')).toBe(false);
  });
});
