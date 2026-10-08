import { z } from 'zod';
import type { Result } from '@/contracts/results';
import type { DepartmentAdministrationService } from '@/contracts/organization-hierarchy';
import { isTrustedMutation } from '@/server/security/request';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';
import type { BackendUserRoleAdmin } from './user-role-views';

/**
 * The administration command boundary.
 *
 * `OH-BE-0216`: department administration is exposed **through this existing
 * envelope**, not through a parallel API. One route, one request shape, one
 * origin check, one size limit, one error mapping; the only addition is a
 * namespaced method whose name says which service answers it. A second API
 * model would be a second place for authorization to be forgotten.
 */

const adminMethod = z.enum(['getBranding','updateBranding','listDivisions','saveDivision','setDivisionActive','listUsers','updateEmployeeAccessRole','deactivateUser','listRoles','setRolePermission','getWorkPolicySettings','listNotificationSettings','setNotificationSetting','getAuditLog','listIntegrations']);

/** Namespaced because `get`, `create` and `update` are not names an envelope shared by several services can carry unqualified. */
const departmentMethod = z.enum(['department.catalogue','department.get','department.create','department.update','department.setStatus','department.remove','department.listEligibleLeads','department.appointLead']);

const DEPARTMENT_METHODS: Readonly<Record<z.infer<typeof departmentMethod>, keyof DepartmentAdministrationService>> = {
  'department.catalogue':'catalogue','department.get':'get','department.create':'create','department.update':'update',
  'department.setStatus':'setStatus','department.remove':'remove','department.listEligibleLeads':'listEligibleLeads','department.appointLead':'appointLead',
};

const command=z.object({method:z.union([adminMethod,departmentMethod]),args:z.array(z.unknown()).min(1).max(4)}).strict();

export interface AdminRequestServices {
  readonly admin: BackendUserRoleAdmin;
  readonly departments: DepartmentAdministrationService;
}

export async function handleAdminRequest(request:Request,services:AdminRequestServices,trustedOrigin:string){
  if(!isTrustedMutation({method:request.method,origin:request.headers.get('origin'),referer:request.headers.get('referer'),secFetchSite:request.headers.get('sec-fetch-site')},[trustedOrigin]))return resultResponse({status:'permission_denied',code:'FORBIDDEN',message:'The request origin is not allowed.'});
  try{
    const text=await request.text();if(Buffer.byteLength(text)>1500000)return resultResponse(invalid('request','Reduce the request size.'));
    const parsed=command.safeParse(JSON.parse(text));if(!parsed.success)return resultResponse(invalid('request',parsed.error.issues[0].message));
    const {method,args}=parsed.data;
    if(method.startsWith('department.')){
      const target=DEPARTMENT_METHODS[method as z.infer<typeof departmentMethod>];
      return resultResponse(await Reflect.apply(services.departments[target] as (...values:unknown[])=>Promise<Result<unknown>>,services.departments,args));
    }
    const adminService=services.admin as unknown as Record<string,(...values:unknown[])=>Promise<Result<unknown>>>;
    return resultResponse(await Reflect.apply(adminService[method]!,services.admin,args));
  }
  catch(error){return resultResponse(error instanceof SyntaxError?invalid('request','Send valid JSON.'):{status:'error',code:'DEPENDENCY_FAILED',message:'The operation could not be completed.',retryable:true});}
}
