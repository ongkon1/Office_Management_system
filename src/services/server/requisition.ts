import type { RequisitionService } from '@/contracts/requisition';
import { serverPost } from './http';
const call=<T>(method:string,args:readonly unknown[])=>serverPost<T>('/api/requisitions',{method,args});
export const serverRequisitionService:RequisitionService={list:(...a)=>call('list',a),get:(...a)=>call('get',a),submit:(...a)=>call('submit',a),decide:(...a)=>call('decide',a),withdraw:(...a)=>call('withdraw',a),queue:(...a)=>call('queue',a)};
