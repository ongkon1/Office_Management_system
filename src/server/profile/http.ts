import { z } from 'zod';
import type { ProfileService } from '@/contracts/services';
import { resultResponse } from '@/server/time/http';
const command=z.object({method:z.enum(['getOwnProfile','updateOwnProfile']),args:z.array(z.unknown()).max(2)}).strict();
export async function handleProfileRequest(request:Request,service:ProfileService,origin:string){if(request.headers.get('origin')!==new URL(origin).origin)return resultResponse({status:'permission_denied',code:'FORBIDDEN',message:'The request origin is not allowed.'});try{const parsed=command.safeParse(await request.json());if(!parsed.success)return resultResponse({status:'validation_failure',code:'VALIDATION_FAILED',message:'Choose a supported profile operation.',fieldErrors:[]});return resultResponse(await Reflect.apply(Reflect.get(service,parsed.data.method),service,parsed.data.args));}catch{return resultResponse({status:'error',code:'DEPENDENCY_FAILED',message:'The profile operation could not be completed.',retryable:true});}}
