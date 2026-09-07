import type { Result } from '@/contracts/results';import type { ActorPolicyContext } from '@/server/authorization/policy';
export interface ProfilePhotoMetadata{id:string;employeeId:string;storageKey:string;fileName:string;mediaType:string;sizeBytes:number;sha256:string;scanStatus:'pending'|'clean'|'rejected'|'failed'}
export interface ProfilePhotoRepository{find(id:string):Promise<ProfilePhotoMetadata|null>}
export interface ProtectedObjectStore{authorizedDownload(key:string,options:{fileName:string;mediaType:string;expiresSeconds:number}):Promise<{url:string;expiresAt:string}>}
const absent=()=>({status:'not_found' as const,code:'NOT_FOUND' as const,message:'Profile photo was not found.',resource:'profile_photo'});
export class ProfilePhotoService{
  constructor(private repo:ProfilePhotoRepository,private storage:ProtectedObjectStore){}
  async metadata(actor:ActorPolicyContext,id:string):Promise<Result<ProfilePhotoMetadata>>{const file=await this.repo.find(id);if(!file)return absent();const allowed=actor.employeeId===file.employeeId||actor.employeeIds.has(file.employeeId)||actor.roles.includes('hr_manager')||actor.roles.includes('super_admin');return allowed?{status:'success',data:file}:absent()}
  async download(actor:ActorPolicyContext,id:string){const result=await this.metadata(actor,id);if(result.status!=='success')return result;const file=result.data;if(file.scanStatus!=='clean')return{status:'conflict' as const,code:'CONFLICT' as const,message:'This profile photo is not available.',guidance:'Wait for security scanning or upload another image.'};return{status:'success' as const,data:await this.storage.authorizedDownload(file.storageKey,{fileName:file.fileName,mediaType:file.mediaType,expiresSeconds:60})}}
}
