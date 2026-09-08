import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { authorize, indistinguishableNotFound } from '@/server/authorization/policy';

export interface ProfilePhotoMetadata {
  readonly id:string; readonly employeeId:string; readonly storageKey:string;
  readonly mediaType:string; readonly sizeBytes:number; readonly scanStatus:'pending'|'clean'|'rejected'|'failed';
}
export interface ProfilePhotoMetadataRepository { find(id:string):Promise<ProfilePhotoMetadata|null> }
export interface FileAccessAudit { record(input:{actorUserId:string;attachmentId:string;employeeId:string}):Promise<void> }

/** Authorized, short-lived delivery; an object key is never returned directly. */
export class ProfilePhotoService {
  constructor(private readonly metadata:ProfilePhotoMetadataRepository,private readonly s3:S3Client,private readonly bucket:string,private readonly audit:FileAccessAudit){}
  async download(actor:ActorPolicyContext,id:string):Promise<Result<{url:string;expiresInSeconds:number;mediaType:string}>>{
    const photo=await this.metadata.find(id);
    const action=actor.employeeId===photo?.employeeId?'organization.self.read':'organization.read';
    if(!photo||photo.scanStatus!=='clean'||!authorize(actor,action,{employeeId:photo.employeeId,sensitivity:'attachment'},'route_handler')) return indistinguishableNotFound('profile photo');
    const expiresInSeconds=60;
    const url=await getSignedUrl(this.s3,new GetObjectCommand({Bucket:this.bucket,Key:photo.storageKey}),{expiresIn:expiresInSeconds});
    await this.audit.record({actorUserId:actor.userId,attachmentId:photo.id,employeeId:photo.employeeId});
    return success({url,expiresInSeconds,mediaType:photo.mediaType});
  }
}
