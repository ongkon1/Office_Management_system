import type { FinanceService } from '@/contracts/finance';
import { serverPost } from './http';

const call=<T>(method:string,userId:string,args:readonly unknown[]=[])=>serverPost<T>('/api/reporting',{operation:'client.finance',method,userId,args});

export const serverFinanceService:FinanceService={
  listPeriods:(userId)=>call('listPeriods',userId),
  getDashboard:(userId,periodId)=>call('getDashboard',userId,[periodId]),
  getHours:(userId,filters)=>call('getHours',userId,[filters]),
  getOvertime:(userId,filters)=>call('getOvertime',userId,[filters]),
  getCostAnalysis:(userId,scope,filters)=>call('getCostAnalysis',userId,[scope,filters]),
  getBillableAnalysis:(userId,filters)=>call('getBillableAnalysis',userId,[filters]),
  getPayrollSummary:(userId,periodId)=>call('getPayrollSummary',userId,[periodId]),
  previewReport:(userId,filters)=>call('previewReport',userId,[filters]),
  requestExport:(userId,configuration)=>call('requestExport',userId,[configuration]),
  listExports:(userId)=>call('listExports',userId),
};
