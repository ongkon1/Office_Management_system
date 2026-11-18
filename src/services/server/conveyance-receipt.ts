import type { ReceiptUploadInput } from '@/contracts/conveyance';
import type { Result } from '@/contracts/results';
import { serverPost } from './http';

interface InitiatedUpload {
  readonly attachment: { readonly id: string };
  readonly upload: { readonly method: 'PUT'; readonly url: string; readonly headers: Readonly<Record<string,string>> };
}
const failed=<T>(message:string):Result<T>=>({status:'error',code:'DEPENDENCY_FAILED',message,retryable:true});
async function sha256(file:File){const digest=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');}

export async function uploadConveyanceReceipt(employeeId:string,file:File):Promise<Result<ReceiptUploadInput>>{
  try{
    const initiated=await serverPost<InitiatedUpload>('/api/files',{method:'initiate',args:[{ownerType:'conveyance_claim',ownerId:employeeId,fileName:file.name,mediaType:file.type,sizeBytes:file.size,sha256:await sha256(file)}]});
    if(initiated.status!=='success')return initiated;
    const target=new URL(initiated.data.upload.url,window.location.href);
    const sent=await fetch(target,{method:'PUT',headers:initiated.data.upload.headers,body:file,credentials:target.origin===window.location.origin?'include':'omit'});
    if(!sent.ok)return failed('The receipt upload failed. The claim was not submitted.');
    const completed=await serverPost<unknown>('/api/files',{method:'complete',args:[initiated.data.attachment.id]});
    if(completed.status!=='success')return completed;
    return {status:'success',data:{attachmentId:initiated.data.attachment.id,fileName:file.name,sizeBytes:file.size,mimeType:file.type}};
  }catch{return failed('The receipt upload failed. The claim was not submitted.');}
}

export async function discardConveyanceReceipt(id:string){
  await serverPost('/api/files',{method:'deactivate',args:[id,'Claim submission did not complete.']});
}
