import type { ProfileService } from '@/contracts/services';
import { serverPost } from './http';
const call=<T>(method:keyof ProfileService,args:readonly unknown[])=>serverPost<T>('/api/profile',{method,args});
export const serverProfileService:ProfileService={getOwnProfile:(...args)=>call('getOwnProfile',args),updateOwnProfile:(...args)=>call('updateOwnProfile',args)};
