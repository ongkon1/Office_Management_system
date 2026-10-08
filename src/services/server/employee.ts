import type { EmployeeDivisionViewService, EmployeeRemarkViewService, EmployeeTaskViewService } from '@/contracts/employee-views';
import { serverPost } from './http';
const call=<T>(service:string,method:string,args:readonly unknown[])=>serverPost<T>('/api/employee',{service,method,args});
export const serverEmployeeTaskService:EmployeeTaskViewService={listForEmployee:(...args)=>call('tasks','listForEmployee',args),getById:(...args)=>call('tasks','getById',args),setChecklistItem:(...args)=>call('tasks','setChecklistItem',args)};
export const serverEmployeeRemarkService:EmployeeRemarkViewService={listForEmployee:(...args)=>call('remarks','listForEmployee',args),getById:(...args)=>call('remarks','getById',args),respond:(...args)=>call('remarks','respond',args)};
export const serverEmployeeDivisionService:EmployeeDivisionViewService={listForEmployee:(...args)=>call('divisions','listForEmployee',args)};
