import { randomUUID } from 'node:crypto';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { authorize, indistinguishableNotFound } from '@/server/authorization/policy';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { taskAcceptsTime, type TaskReviewState } from '@/contracts/domain';

export interface EffectiveRange { readonly from: string; readonly to: string | null }
export interface Versioned { readonly id: string; readonly version: number; readonly isActive: boolean }
export interface DivisionRow extends Versioned { readonly name: string; readonly code: string; readonly restricted: boolean }
export interface EmployeeRow extends Versioned { readonly userId: string; readonly code: string; readonly name: string; readonly profilePhotoAttachmentId: string | null }
export interface AssignmentRow extends Versioned, EffectiveRange { readonly employeeId: string; readonly divisionId: string; readonly leadEmployeeId: string | null; readonly primary: boolean; readonly temporary: boolean; readonly allocationPercent: number }
export interface ProjectRow extends Versioned { readonly divisionId: string; readonly managerEmployeeId: string; readonly status: 'planned'|'active'|'on_hold'|'completed'|'closed'; readonly acceptsTime: boolean; readonly completionPercent: number }
export interface TaskRow extends Versioned { readonly projectId: string; readonly divisionId: string; readonly creatorEmployeeId: string; readonly assigneeEmployeeId: string; readonly status: 'pending'|'in_progress'|'completed'; readonly dueDate: string|null; readonly reviewState: TaskReviewState; readonly reviewerEmployeeId: string|null; readonly reviewedAt: string|null; readonly reviewNote: string|null }

export interface OrganizationWorkRepository {
  transaction<T>(work: (repository: OrganizationWorkRepository) => Promise<T>): Promise<T>;
  getDivision(id: string): Promise<DivisionRow|null>; saveDivision(row: DivisionRow, expectedVersion?: number): Promise<boolean>;
  getEmployee(id: string): Promise<EmployeeRow|null>; saveEmployee(row: EmployeeRow, expectedVersion?: number): Promise<boolean>;
  assignments(employeeId: string): Promise<readonly AssignmentRow[]>; getAssignment(id: string): Promise<AssignmentRow|null>; saveAssignment(row: AssignmentRow, expectedVersion?: number): Promise<boolean>;
  getProject(id: string): Promise<ProjectRow|null>; saveProject(row: ProjectRow, expectedVersion?: number): Promise<boolean>; projectActualMinutes(id: string): Promise<number>;
  getTask(id: string): Promise<TaskRow|null>; saveTask(row: TaskRow, expectedVersion?: number): Promise<boolean>; taskActualMinutes(id: string): Promise<number>;
  effectiveLead(employeeId: string, date: string): Promise<string|null>;
  appendTaskDecision(input: { id:string; taskId:string; reviewerEmployeeId:string; decision:'approved'|'rejected'; note:string|null; idempotencyKey:string; decidedAt:string }): Promise<'created'|'replayed'|'conflict'>;
}

export interface OrganizationWorkEffects {
  audit(input: { actorUserId:string; action:string; resourceType:string; resourceId:string; before:unknown; after:unknown; reason?:string|null }): Promise<void>;
  notify(input: { employeeId:string; type:string; resourceId:string }): Promise<void>;
  profilePhotoExists(id:string, ownerEmployeeId:string): Promise<boolean>;
}

const validation = (field:string, code:string, message:string, guidance:string): Result<never> => ({ status:'validation_failure', code:'VALIDATION_FAILED', message, focusField:field, fieldErrors:[{field,code,message,guidance}] });
const conflict = (message:string, guidance:string): Result<never> => ({ status:'conflict', code:'CONFLICT', message, guidance });

function canManage(actor: ActorPolicyContext): boolean {
  return actor.roles.includes('super_admin') || actor.roles.includes('hr_manager');
}

function rangesOverlap(a: EffectiveRange, b: EffectiveRange): boolean {
  return a.from <= (b.to ?? '9999-12-31') && b.from <= (a.to ?? '9999-12-31');
}

export class OrganizationWorkService {
  constructor(private readonly repository: OrganizationWorkRepository, private readonly effects: OrganizationWorkEffects) {}

  async saveDivision(actor: ActorPolicyContext, row: DivisionRow, expectedVersion?: number): Promise<Result<DivisionRow>> {
    if (!canManage(actor)) return { status:'permission_denied', code:'FORBIDDEN', message:'You cannot manage divisions.' };
    if (!row.name.trim() || !row.code.trim()) return validation('name','REQUIRED','Division name and code are required.','Enter a unique division name and code.');
    const before = await this.repository.getDivision(row.id);
    const saved = await this.repository.saveDivision(row, expectedVersion);
    if (!saved) return conflict('The division changed before this update was saved.','Reload and review the latest version.');
    await this.effects.audit({actorUserId:actor.userId,action:before?'division.update':'division.create',resourceType:'division',resourceId:row.id,before,after:row});
    return success(row);
  }

  async saveEmployee(actor: ActorPolicyContext, row: EmployeeRow, expectedVersion?: number): Promise<Result<EmployeeRow>> {
    if (!canManage(actor)) return { status:'permission_denied', code:'FORBIDDEN', message:'You cannot manage employees.' };
    if (row.profilePhotoAttachmentId && !(await this.effects.profilePhotoExists(row.profilePhotoAttachmentId,row.id))) return validation('profilePhotoAttachmentId','INVALID_ATTACHMENT','The profile photo is unavailable.','Upload an authorized image owned by this employee.');
    const before = await this.repository.getEmployee(row.id);
    const saved = await this.repository.saveEmployee(row,expectedVersion);
    if (!saved) return conflict('The employee changed before this update was saved.','Reload and review the latest version.');
    await this.effects.audit({actorUserId:actor.userId,action:before?'employee.update':'employee.create',resourceType:'employee',resourceId:row.id,before,after:row});
    return success(row);
  }

  async saveAssignment(actor: ActorPolicyContext, row: AssignmentRow, expectedVersion?: number): Promise<Result<AssignmentRow>> {
    if (!canManage(actor)) return { status:'permission_denied', code:'FORBIDDEN', message:'You cannot manage assignments.' };
    if (row.to && row.to < row.from) return validation('endDate','INVALID_RANGE','The assignment end date is before its start date.','Choose an end date on or after the start date.');
    if (row.temporary && !row.to) return validation('endDate','TEMPORARY_END_REQUIRED','A temporary assignment requires an end date.','Choose when the temporary assignment ends.');
    if (row.allocationPercent < 0 || row.allocationPercent > 100) return validation('allocationPercent','OUT_OF_RANGE','Allocation must be between 0 and 100 percent.','Enter a whole percentage from 0 to 100.');
    const existing = await this.repository.assignments(row.employeeId);
    if (existing.some((item)=>item.id!==row.id && item.divisionId===row.divisionId && item.isActive && rangesOverlap(item,row))) return conflict('This assignment overlaps another assignment for the same division.','End or adjust the existing assignment first.');
    if (row.primary && existing.some((item)=>item.id!==row.id && item.primary && item.isActive && rangesOverlap(item,row))) return conflict('The employee already has a primary division for this period.','End the current primary assignment or make this assignment secondary.');
    const concurrent = existing.filter((item)=>item.id!==row.id && item.isActive && rangesOverlap(item,row)).reduce((sum,item)=>sum+item.allocationPercent,0)+row.allocationPercent;
    const before = await this.repository.getAssignment(row.id);
    const saved = await this.repository.saveAssignment(row,expectedVersion);
    if (!saved) return conflict('The assignment changed before this update was saved.','Reload and review the latest version.');
    await this.effects.audit({actorUserId:actor.userId,action:before?'assignment.update':'assignment.create',resourceType:'employee_division_assignment',resourceId:row.id,before,after:row});
    return success(row, concurrent===100 ? undefined : [{code:'ALLOCATION_NOT_100',field:'allocationPercent',message:`Concurrent allocation totals ${concurrent} percent; review the plan.`}]);
  }

  async saveProject(actor: ActorPolicyContext, row: ProjectRow, expectedVersion?: number): Promise<Result<ProjectRow & {actualMinutes:number}>> {
    if (!authorize(actor,'project.manage',{divisionId:row.divisionId,effective:true},'server_action')) return {status:'permission_denied',code:'FORBIDDEN',message:'You cannot manage this project.'};
    if (row.completionPercent<0 || row.completionPercent>100) return validation('completionPercent','OUT_OF_RANGE','Completion must be between 0 and 100 percent.','Enter a whole percentage from 0 to 100.');
    const managerAssignments = await this.repository.assignments(row.managerEmployeeId);
    if (!managerAssignments.some((item)=>item.divisionId===row.divisionId && item.isActive)) return validation('managerEmployeeId','MANAGER_OUT_OF_SCOPE','The manager is not assigned to the project division.','Choose a manager with an effective assignment to this division.');
    const before=await this.repository.getProject(row.id); const saved=await this.repository.saveProject(row,expectedVersion);
    if(!saved) return conflict('The project changed before this update was saved.','Reload and review the latest version.');
    await this.effects.audit({actorUserId:actor.userId,action:before?'project.update':'project.create',resourceType:'project',resourceId:row.id,before,after:row});
    return success({...row,actualMinutes:await this.repository.projectActualMinutes(row.id)});
  }

  async saveTask(actor: ActorPolicyContext, row: TaskRow, expectedVersion?: number): Promise<Result<TaskRow & {actualMinutes:number;overdue:boolean}>> {
    const project=await this.repository.getProject(row.projectId);
    if(!project || project.divisionId!==row.divisionId) return validation('projectId','PROJECT_DIVISION_MISMATCH','The task and project divisions do not match.','Choose a project in the task division.');
    const employeeRaised=actor.roles.includes('employee')&&!actor.roles.includes('team_lead');
    let candidate=row;
    if(employeeRaised){
      if(actor.employeeId!==row.creatorEmployeeId) return {status:'permission_denied',code:'FORBIDDEN',message:'You can raise tasks only for yourself.'};
      const assigned=await this.repository.assignments(row.creatorEmployeeId);
      if(!project.isActive||!project.acceptsTime||!assigned.some((item)=>item.divisionId===row.divisionId&&item.isActive)) return {status:'permission_denied',code:'FORBIDDEN',message:'The selected project is not available to you.'};
      const lead=await this.repository.effectiveLead(row.creatorEmployeeId,new Date().toISOString().slice(0,10));
      if(!lead) return conflict('No current Team Lead can review this task.','Ask HR to correct the effective Team Lead assignment.');
      candidate={...row,assigneeEmployeeId:row.creatorEmployeeId,reviewState:'pending_review',reviewerEmployeeId:lead,reviewedAt:null,reviewNote:null};
    } else if(!authorize(actor,'task.manage',{divisionId:row.divisionId,projectId:row.projectId,effective:true},'server_action')) return {status:'permission_denied',code:'FORBIDDEN',message:'You cannot manage this task.'};
    const saved=await this.repository.saveTask(candidate,expectedVersion); if(!saved) return conflict('The task changed before this update was saved.','Reload and review the latest version.');
    await this.effects.audit({actorUserId:actor.userId,action:'task.save',resourceType:'task',resourceId:candidate.id,before:null,after:candidate});
    if(employeeRaised&&candidate.reviewerEmployeeId) await this.effects.notify({employeeId:candidate.reviewerEmployeeId,type:'task_review_requested',resourceId:candidate.id});
    const actualMinutes=await this.repository.taskActualMinutes(candidate.id);
    return success({...candidate,actualMinutes,overdue:candidate.status!=='completed'&&Boolean(candidate.dueDate&&candidate.dueDate<new Date().toISOString().slice(0,10))});
  }

  async decideTask(actor:ActorPolicyContext,taskId:string,input:{decision:'approved'|'rejected';note:string;idempotencyKey:string;decidedAt:string}):Promise<Result<TaskRow>>{
    return this.repository.transaction(async(repository)=>{
      const task=await repository.getTask(taskId); if(!task) return indistinguishableNotFound('task');
      const currentLead=await repository.effectiveLead(task.creatorEmployeeId,input.decidedAt.slice(0,10));
      if(!actor.employeeId||actor.employeeId!==currentLead||actor.employeeId===task.creatorEmployeeId) return indistinguishableNotFound('task');
      if(input.decision==='rejected'&&!input.note.trim()) return validation('note','REJECTION_NOTE_REQUIRED','A reason is required when a task is not approved.','Explain what the employee should change.');
      const appended=await repository.appendTaskDecision({id:randomUUID(),taskId,reviewerEmployeeId:actor.employeeId,decision:input.decision,note:input.note.trim()||null,idempotencyKey:input.idempotencyKey,decidedAt:input.decidedAt});
      if(appended==='conflict') return conflict('This task has already been decided.','Reload to see the recorded decision.');
      if(appended==='replayed') return success((await repository.getTask(taskId))!);
      const next:TaskRow={...task,reviewState:input.decision==='approved'?'approved':'rejected',reviewerEmployeeId:actor.employeeId,reviewedAt:input.decidedAt,reviewNote:input.note.trim()||null,version:task.version+1};
      if(!(await repository.saveTask(next,task.version))) return conflict('Another reviewer decided this task first.','Reload to see the recorded decision.');
      await this.effects.audit({actorUserId:actor.userId,action:`task.${input.decision}`,resourceType:'task',resourceId:task.id,before:task,after:next,reason:next.reviewNote});
      await this.effects.notify({employeeId:task.creatorEmployeeId,type:`task_${input.decision}`,resourceId:task.id});
      return success(next);
    });
  }

  async validateTaskForTime(taskId:string):Promise<Result<void>>{
    const task=await this.repository.getTask(taskId);
    if(!task||!task.isActive||!taskAcceptsTime(task.reviewState)) return validation('taskId','TASK_NOT_APPROVED','This task cannot receive time yet.','Choose an approved active task or ask the Team Lead to review it.');
    const project=await this.repository.getProject(task.projectId);
    if(!project||!project.isActive||!project.acceptsTime) return validation('projectId','PROJECT_NOT_ACTIVE','The project is not accepting time.','Choose an active project.');
    return success(undefined);
  }
}
