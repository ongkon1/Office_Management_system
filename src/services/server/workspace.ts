import type { WorkspaceService } from '@/contracts/workspace';
import { serverPost } from './http';

const call=<T>(method:keyof WorkspaceService,args:readonly unknown[])=>serverPost<T>('/api/workspace',{method,args});
export const serverWorkspaceService:WorkspaceService={
  getNotifications:(...args)=>call('getNotifications',args),markNotificationRead:(...args)=>call('markNotificationRead',args),markAllNotificationsRead:(...args)=>call('markAllNotificationsRead',args),
  search:(...args)=>call('search',args),listRecentSearches:(...args)=>call('listRecentSearches',args),getDocuments:(...args)=>call('getDocuments',args),downloadDocument:(...args)=>call('downloadDocument',args),
  getMessages:(...args)=>call('getMessages',args),getWfhSelfService:(...args)=>call('getWfhSelfService',args),submitWfhRequest:(...args)=>call('submitWfhRequest',args),cancelRequest:(...args)=>call('cancelRequest',args),
  getLeaveSelfService:(...args)=>call('getLeaveSelfService',args),submitLeaveRequest:(...args)=>call('submitLeaveRequest',args),getSelfEvaluation:(...args)=>call('getSelfEvaluation',args),saveSelfEvaluation:(...args)=>call('saveSelfEvaluation',args),
};
