import type { TimesheetService } from '@/contracts/services';
import type { ListQuery } from '@/contracts/query';
import type { IsoDate } from '@/contracts/domain';
import { addDays } from '@/lib/format';
import { serverGet,serverPost } from './http';

function listQuery(query:ListQuery){const range=query.filters?.dateRange;return {employeeId:query.filters?.employeeIds?.[0],from:range?.from,to:range?.to,page:query.pagination.page,pageSize:query.pagination.pageSize};}

export const serverTimesheetService:TimesheetService={
  getDay:(input)=>serverGet('/api/time',{view:'day',employeeId:input.employeeId,date:input.date}),
  getWeek:(input)=>serverGet('/api/time',{view:'week',employeeId:input.employeeId,date:input.weekStartDate}),
  getMonth:(input)=>serverGet('/api/time',{view:'month',employeeId:input.employeeId,month:input.month}),
  listWorkLogs:(query)=>serverGet('/api/time',{view:'work-logs',...listQuery(query)}),
  getDailySummaries:(input)=>serverGet('/api/time',{view:'daily-summaries',employeeId:input.employeeId,from:input.range.from,to:input.range.to}),
  createWorkLog:(input)=>serverPost('/api/time',{operation:'create',input}),
  getWorkLog:(id)=>serverGet('/api/time',{view:'work-log',id}),
  getWorkLogHistory:(id)=>serverGet('/api/time',{view:'work-log-history',id}),
  updateWorkLog:(id,input)=>serverPost('/api/time',{operation:'update',id,input}),
  deleteWorkLog:(id,expectedVersion)=>serverPost('/api/time',{operation:'delete',id,expectedVersion:expectedVersion??1}),
  copyWorkLog:(input)=>serverPost('/api/time',{operation:'copy',id:input.sourceWorkLogId,targetDate:input.targetDate}),
  previewWorkLog:(input,options)=>serverPost('/api/time',{operation:'preview',input,excludeWorkLogId:options?.excludeWorkLogId}),
  transitionTask:(input)=>serverPost('/api/time',{operation:'task.transition',input}),
  getTaskHistory:(taskId)=>serverGet('/api/time',{view:'task-history',id:taskId}),
  setBreakOverride:(input)=>serverPost('/api/time',{operation:'break',input}),
};

export function weekStart(date:IsoDate):IsoDate{const [year,month,day]=date.split('-').map(Number);const weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();return addDays(date,1-(weekday===0?7:weekday));}
