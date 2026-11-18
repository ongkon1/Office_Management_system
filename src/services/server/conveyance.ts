import type { ConveyanceService } from '@/contracts/conveyance';
import { serverPost } from './http';
const call=<T>(method:string,args:readonly unknown[])=>serverPost<T>('/api/conveyance',{method,args});
export const serverConveyanceService:ConveyanceService={list:(...a)=>call('list',a),formContext:(...a)=>call('formContext',a),get:(...a)=>call('get',a),submit:(...a)=>call('submit',a),decide:(...a)=>call('decide',a),withdraw:(...a)=>call('withdraw',a),getReceipt:(...a)=>call('getReceipt',a),queue:(...a)=>call('queue',a)};
