import { describe, expect, it } from 'vitest';
import type { Approvable, ApprovalReview } from '@/contracts/approval';
import { canDecideApproval, canViewApproval, initialApprovalStage, pendingApprovalRoles, transitionApproval } from './approval-chain';

const base:Approvable={id:'r1',submitterUserId:'u1',submitterEmployeeId:'e1',submitterRole:'employee',teamLeadEmployeeId:'e2',stage:'team_lead_review',outcome:null,submittedAt:'2026-11-16T00:00:00.000Z',decidedAt:null,reviews:[]};
const review=(role:ApprovalReview['reviewerRole'],decision:ApprovalReview['decision']):ApprovalReview=>({id:`${role}-${decision}`,reviewerUserId:`u-${role}`,reviewerEmployeeId:`e-${role}`,reviewerRole:role,decision,reason:decision==='rejected'?'Not approved':null,decidedAt:'2026-11-16T01:00:00.000Z'});

describe('shared approval chain',()=>{
  it('skips Team Lead review for a Team Lead submitter',()=>expect(initialApprovalStage('team_lead')).toBe('reviewer_review'));
  it('requires HR and Super Administrator after Team Lead approval',()=>{const next=transitionApproval(base,review('team_lead','approved'));expect(next.stage).toBe('reviewer_review');expect(pendingApprovalRoles({...base,...next})).toEqual(['hr_manager','super_admin']);});
  it('approves only after both parallel reviewers approve',()=>{const afterLead=transitionApproval(base,review('team_lead','approved'));const record={...base,...afterLead};const afterHr=transitionApproval(record,review('hr_manager','approved'));expect(afterHr.outcome).toBeNull();const final=transitionApproval({...record,...afterHr},review('super_admin','approved'));expect(final).toMatchObject({stage:'decided',outcome:'approved'});});
  it('rejects immediately at either stage',()=>expect(transitionApproval(base,review('team_lead','rejected'))).toMatchObject({stage:'decided',outcome:'rejected'}));
  it('reveals an employee request only to its submitter and assigned Team Lead at the first stage',()=>{
    expect(canViewApproval(base,{userId:'u1',employeeId:'e1',reviewerRole:null})).toBe(true);
    expect(canDecideApproval(base,{userId:'u2',employeeId:'e2',reviewerRole:'team_lead'})).toBe(true);
    expect(canViewApproval(base,{userId:'u-hr',employeeId:'e-hr',reviewerRole:'hr_manager'})).toBe(false);
  });
  it('reveals the parallel stage to HR and Super Administrator without making Finance a current reviewer',()=>{
    const afterLead={...base,...transitionApproval(base,review('team_lead','approved')),reviews:[review('team_lead','approved')]};
    expect(canDecideApproval(afterLead,{userId:'u-hr',employeeId:'e-hr',reviewerRole:'hr_manager'})).toBe(true);
    expect(canDecideApproval(afterLead,{userId:'u-admin',employeeId:'e-admin',reviewerRole:'super_admin'})).toBe(true);
    expect(canDecideApproval(afterLead,{userId:'u-fin',employeeId:'e-fin',reviewerRole:'finance_manager'})).toBe(false);
  });
  it('keeps a Finance-era mid-chain decision as history while still waiting for current HR and Super Admin decisions',()=>{
    const record:Approvable={...base,stage:'reviewer_review',reviews:[review('team_lead','approved'),review('finance_manager','approved')]};
    expect(pendingApprovalRoles(record)).toEqual(['hr_manager','super_admin']);
    expect(canDecideApproval(record,{userId:'u-hr',employeeId:'e-hr',reviewerRole:'hr_manager'})).toBe(true);
  });
});
