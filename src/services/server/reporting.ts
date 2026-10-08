import type { ReportingService } from '@/contracts/reporting';
import { serverPost } from './http';

const call=<T>(method:string,userId:string,args:readonly unknown[]=[])=>serverPost<T>('/api/reporting',{operation:'client.reporting',method,userId,args});

export const serverReportingService:ReportingService={
  listReports:(userId)=>call('listReports',userId),
  getReport:(userId,reportKey)=>call('getReport',userId,[reportKey]),
  runReport:(userId,input)=>call('runReport',userId,[input]),
  requestExport:(userId,input)=>call('requestExport',userId,[input]),
  listExports:(userId)=>call('listExports',userId),
  advanceExport:(userId,jobId)=>call('advanceExport',userId,[jobId]),
  retryExport:(userId,jobId)=>call('retryExport',userId,[jobId]),
};
