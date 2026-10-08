import type { Result } from './results';
import type { DivisionRef, EmployeeDashboardView, EmployeeRef, RemarkSummaryView, TaskSummaryView } from './view-models';
import type { DurationView } from './view-models';

export interface EmployeeTaskDetailView {
  readonly summary: TaskSummaryView;
  readonly description: string | null;
  readonly checklist: readonly { readonly id:string; readonly taskId:string; readonly label:string; readonly order:number; readonly isDone:boolean }[];
  readonly supportingMembers: readonly EmployeeRef[];
  readonly entries: readonly { readonly id:string; readonly workDate:string; readonly workDateLabel:string; readonly duration:DurationView; readonly completedWork:string; readonly division:DivisionRef }[];
}
export interface EmployeeTaskViewService {
  listForEmployee(employeeId:string):Promise<Result<readonly TaskSummaryView[]>>;
  getById(taskId:string,employeeId?:string):Promise<Result<EmployeeTaskDetailView>>;
  setChecklistItem(itemId:string,isDone:boolean):Promise<Result<void>>;
}
export interface EmployeeRemarkDetailView { readonly summary:RemarkSummaryView; readonly requestedChanges:string|null; readonly responses:readonly {readonly id:string;readonly author:EmployeeRef;readonly message:string;readonly createdAtLabel:string}[] }
export interface EmployeeRemarkViewService {
  listForEmployee(employeeId:string):Promise<Result<readonly RemarkSummaryView[]>>;
  getById(remarkId:string):Promise<Result<EmployeeRemarkDetailView>>;
  respond(remarkId:string,message:string,employeeId:string):Promise<Result<void>>;
}
export interface EmployeeDivisionViewService {
  listForEmployee(employeeId:string):Promise<Result<{readonly assignments:readonly {readonly id:string;readonly division:DivisionRef;readonly teamLead:EmployeeRef|null;readonly isPrimary:boolean;readonly allocationPercent:number;readonly expectedWeekly:DurationView;readonly startDateLabel:string;readonly endDateLabel:string|null;readonly isTemporary:boolean;readonly isActive:boolean;readonly isEffectiveToday:boolean}[];readonly totalAllocation:number}>>;
}
export interface EmployeeDashboardViewService { getEmployeeDashboard(userId:string,date?:string):Promise<Result<EmployeeDashboardView>> }
