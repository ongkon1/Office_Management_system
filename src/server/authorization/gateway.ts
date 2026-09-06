import { authorize, indistinguishableNotFound, mapAuthorizedFields, type ActorPolicyContext, type EntryPoint, type ResourcePolicyContext, type SensitiveField } from './policy';

export interface ScopedRecord<T> { readonly value:T; readonly policy:ResourcePolicyContext }

/** A single-record boundary that deliberately collapses absent and unauthorized. */
export function readAuthorized<T>(actor:ActorPolicyContext, action:string, record:ScopedRecord<T>|null, entryPoint:EntryPoint){
  if(!record || !authorize(actor,action,record.policy,entryPoint)) return indistinguishableNotFound();
  return {status:'success' as const,data:record.value};
}

/** Filtering occurs before count, aggregation, search matching, sorting or pagination. */
export function filterAuthorized<T>(actor:ActorPolicyContext, action:string, records:readonly ScopedRecord<T>[], entryPoint:EntryPoint):readonly ScopedRecord<T>[] {
  return records.filter(record=>authorize(actor,action,record.policy,entryPoint));
}

export function countAuthorized<T>(actor:ActorPolicyContext, action:string, records:readonly ScopedRecord<T>[], entryPoint:EntryPoint):number {
  return filterAuthorized(actor,action,records,entryPoint).length;
}

export function mapAuthorizedRecord<T extends Record<string,unknown>>(actor:ActorPolicyContext, action:string, record:ScopedRecord<T>|null, entryPoint:EntryPoint, fields:Partial<Record<keyof T,SensitiveField>>){
  const result=readAuthorized(actor,action,record,entryPoint);
  return result.status==='success'?{status:'success' as const,data:mapAuthorizedFields(result.data,actor,fields)}:result;
}

export function authorizeMutation(actor:ActorPolicyContext, action:string, resource:ResourcePolicyContext, entryPoint:EntryPoint){
  return authorize(actor,action,resource,entryPoint)
    ? {status:'success' as const,data:undefined}
    : {status:'permission_denied' as const,code:'PERMISSION_DENIED' as const,message:'You do not have permission to perform this action.',permission:action};
}
