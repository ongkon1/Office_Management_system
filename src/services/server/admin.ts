import type { AdminService } from '@/contracts/admin';
import { serverPost } from './http';

const call=<T>(method:string,args:readonly unknown[])=>serverPost<T>('/api/admin',{method,args});
export const serverAdminService:AdminService={
  getBranding:(...args)=>call('getBranding',args),
  updateBranding:(...args)=>call('updateBranding',args),
  listDivisions:(...args)=>call('listDivisions',args),
  saveDivision:(...args)=>call('saveDivision',args),
  setDivisionActive:(...args)=>call('setDivisionActive',args),
  listUsers:(...args)=>call('listUsers',args),
  updateEmployeeAccessRole:(...args)=>call('updateEmployeeAccessRole',args),
  deactivateUser:(...args)=>call('deactivateUser',args),
  listRoles:(...args)=>call('listRoles',args),
  setRolePermission:(...args)=>call('setRolePermission',args),
  getWorkPolicySettings:(...args)=>call('getWorkPolicySettings',args),
  listNotificationSettings:(...args)=>call('listNotificationSettings',args),
  setNotificationSetting:(...args)=>call('setNotificationSetting',args),
  getAuditLog:(...args)=>call('getAuditLog',args),
  listIntegrations:(...args)=>call('listIntegrations',args),
};
