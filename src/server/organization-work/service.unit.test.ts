import { describe, expect, it, vi } from 'vitest';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import {
  OrganizationWorkService,
  type AssignmentRow,
  type DivisionRow,
  type EmployeeRow,
  type OrganizationWorkEffects,
  type OrganizationWorkRepository,
  type ProjectRow,
  type TaskRow,
} from './service';

class MemoryRepository implements OrganizationWorkRepository {
  divisions=new Map<string,DivisionRow>(); employees=new Map<string,EmployeeRow>(); assignments_=new Map<string,AssignmentRow>(); projects=new Map<string,ProjectRow>(); tasks=new Map<string,TaskRow>(); decisions=new Map<string,string>();
  projectMinutes=0; taskMinutes=0; leads=new Map<string,string>();
  async transaction<T>(work:(r:OrganizationWorkRepository)=>Promise<T>):Promise<T>{return work(this)}
  async getDivision(id:string){return this.divisions.get(id)??null} async saveDivision(r:DivisionRow,v?:number){const x=this.divisions.get(r.id);if(v!==undefined&&x?.version!==v)return false;this.divisions.set(r.id,r);return true}
  async getEmployee(id:string){return this.employees.get(id)??null} async saveEmployee(r:EmployeeRow,v?:number){const x=this.employees.get(r.id);if(v!==undefined&&x?.version!==v)return false;this.employees.set(r.id,r);return true}
  async assignments(id:string){return [...this.assignments_.values()].filter(x=>x.employeeId===id)} async getAssignment(id:string){return this.assignments_.get(id)??null} async saveAssignment(r:AssignmentRow,v?:number){const x=this.assignments_.get(r.id);if(v!==undefined&&x?.version!==v)return false;this.assignments_.set(r.id,r);return true}
  async getProject(id:string){return this.projects.get(id)??null} async saveProject(r:ProjectRow){this.projects.set(r.id,r);return true} async projectActualMinutes(){return this.projectMinutes}
  async getTask(id:string){return this.tasks.get(id)??null} async saveTask(r:TaskRow,v?:number){const x=this.tasks.get(r.id);if(v!==undefined&&x?.version!==v)return false;this.tasks.set(r.id,r);return true} async taskActualMinutes(){return this.taskMinutes}
  async effectiveLead(id:string){return this.leads.get(id)??null}
  async appendTaskDecision(i:{taskId:string;idempotencyKey:string}){const replay=this.decisions.get(i.idempotencyKey);if(replay)return replay===i.taskId?'replayed':'conflict';if([...this.decisions.values()].includes(i.taskId))return 'conflict';this.decisions.set(i.idempotencyKey,i.taskId);return 'created'}
}

const employeeActor:ActorPolicyContext={userId:'u1',employeeId:'e1',roles:['employee'],permissions:new Set(),divisionIds:new Set(['d1']),employeeIds:new Set(['e1']),projectIds:new Set(['p1']),teamIds:new Set()};
const leadActor:ActorPolicyContext={...employeeActor,userId:'u2',employeeId:'lead',roles:['team_lead'],employeeIds:new Set(['e1']),projectIds:new Set(['p1'])};
const effects:OrganizationWorkEffects={audit:vi.fn(async()=>{}),notify:vi.fn(async()=>{}),profilePhotoExists:vi.fn(async()=>true)};
const assignment=(overrides:Partial<AssignmentRow>={}):AssignmentRow=>({id:'a1',version:1,isActive:true,employeeId:'e1',divisionId:'d1',leadEmployeeId:'lead',primary:true,temporary:false,allocationPercent:100,from:'2026-01-01',to:null,...overrides});
const project:ProjectRow={id:'p1',version:1,isActive:true,divisionId:'d1',managerEmployeeId:'lead',status:'active',acceptsTime:true,completionPercent:20};
const task=(state:TaskRow['reviewState']='pending_review'):TaskRow=>({id:'t1',version:1,isActive:true,projectId:'p1',divisionId:'d1',creatorEmployeeId:'e1',assigneeEmployeeId:'e1',status:'pending',dueDate:'2026-09-01',reviewState:state,reviewerEmployeeId:'lead',reviewedAt:null,reviewNote:null});

describe('Backend Phase 3 organization and work rules',()=>{
  it('rejects inverted and open-ended temporary assignments',async()=>{const r=new MemoryRepository();const s=new OrganizationWorkService(r,effects);const hr={...employeeActor,roles:['hr_manager'] as const};expect((await s.saveAssignment(hr,assignment({temporary:true}))).status).toBe('validation_failure');expect((await s.saveAssignment(hr,assignment({to:'2025-12-31'}))).status).toBe('validation_failure')});
  it('warns instead of changing an allocation total that is not 100 percent',async()=>{const r=new MemoryRepository();const s=new OrganizationWorkService(r,effects);const hr={...employeeActor,roles:['hr_manager'] as const};const result=await s.saveAssignment(hr,assignment({allocationPercent:60}));expect(result.status).toBe('success');if(result.status==='success')expect(result.warnings?.[0]?.code).toBe('ALLOCATION_NOT_100')});
  it('rejects overlapping primary assignments',async()=>{const r=new MemoryRepository();r.assignments_.set('old',assignment({id:'old'}));const s=new OrganizationWorkService(r,effects);const hr={...employeeActor,roles:['hr_manager'] as const};expect((await s.saveAssignment(hr,assignment({id:'new',divisionId:'d2'}))).status).toBe('conflict')});
  it.each(['not_required','pending_review','rejected'] as const)('refuses time for a self-raised task in %s state',async(state)=>{const r=new MemoryRepository();r.projects.set('p1',project);r.tasks.set('t1',task(state));const result=await new OrganizationWorkService(r,effects).validateTaskForTime('t1');expect(result.status).toBe(state==='not_required'?'success':'validation_failure')});
  it('allows time only after approval',async()=>{const r=new MemoryRepository();r.projects.set('p1',project);r.tasks.set('t1',task('approved'));expect((await new OrganizationWorkService(r,effects).validateTaskForTime('t1')).status).toBe('success')});
  it('forces employee task ownership and current Team Lead review',async()=>{const r=new MemoryRepository();r.projects.set('p1',project);r.assignments_.set('a1',assignment());r.leads.set('e1','lead');const s=new OrganizationWorkService(r,effects);const result=await s.saveTask(employeeActor,{...task('not_required'),assigneeEmployeeId:'other',reviewerEmployeeId:null});expect(result.status).toBe('success');if(result.status==='success'){expect(result.data.assigneeEmployeeId).toBe('e1');expect(result.data.reviewState).toBe('pending_review');expect(result.data.reviewerEmployeeId).toBe('lead')}});
  it('hides a pending task from the wrong reviewer and prevents self-endorsement',async()=>{const r=new MemoryRepository();r.tasks.set('t1',task());r.leads.set('e1','lead');const s=new OrganizationWorkService(r,effects);expect((await s.decideTask({...leadActor,employeeId:'wrong'},'t1',{decision:'approved',note:'',idempotencyKey:'k1',decidedAt:'2026-09-08T10:00:00Z'})).status).toBe('not_found');expect((await s.decideTask(employeeActor,'t1',{decision:'approved',note:'',idempotencyKey:'k2',decidedAt:'2026-09-08T10:00:00Z'})).status).toBe('not_found')});
  it('requires a rejection note and makes a decision idempotent',async()=>{const r=new MemoryRepository();r.tasks.set('t1',task());r.leads.set('e1','lead');const s=new OrganizationWorkService(r,effects);expect((await s.decideTask(leadActor,'t1',{decision:'rejected',note:'',idempotencyKey:'k',decidedAt:'2026-09-08T10:00:00Z'})).status).toBe('validation_failure');expect((await s.decideTask(leadActor,'t1',{decision:'approved',note:'',idempotencyKey:'k',decidedAt:'2026-09-08T10:00:00Z'})).status).toBe('success');expect((await s.decideTask(leadActor,'t1',{decision:'approved',note:'',idempotencyKey:'k',decidedAt:'2026-09-08T10:00:00Z'})).status).toBe('success')});
  it('derives actual minutes and overdue state instead of accepting an editable total',async()=>{const r=new MemoryRepository();r.projects.set('p1',project);r.tasks.set('t1',task('approved'));r.taskMinutes=125;const s=new OrganizationWorkService(r,effects);const result=await s.saveTask(leadActor,task('approved'));expect(result.status).toBe('success');if(result.status==='success'){expect(result.data.actualMinutes).toBe(125);expect(result.data.overdue).toBe(true)}});
});
