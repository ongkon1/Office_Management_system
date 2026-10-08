import type { Result } from '@/contracts/results';

const failure=<T>():Result<T>=>({status:'error',code:'DEPENDENCY_FAILED',message:'The server operation could not be completed.',retryable:true});

export async function serverGet<T>(path:string,query:Record<string,unknown>={}):Promise<Result<T>>{
  try{const search=new URLSearchParams();for(const [key,value] of Object.entries(query)){if(value===undefined||value===null||value==='')continue;search.set(key,Array.isArray(value)?value.join(','):String(value));}const response=await fetch(`${path}${search.size?`?${search}`:''}`,{credentials:'include',cache:'no-store'});return await response.json() as Result<T>;}catch{return failure<T>();}
}

export async function serverPost<T>(path:string,body:unknown):Promise<Result<T>>{
  try{const response=await fetch(path,{method:'POST',credentials:'include',cache:'no-store',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return await response.json() as Result<T>;}catch{return failure<T>();}
}
