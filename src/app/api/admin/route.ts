import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { BackendUserRoleAdmin } from '@/server/admin/user-role-views';
import { BackendDepartmentAdministration } from '@/server/organization/department-administration';
import { handleAdminRequest } from '@/server/admin/http';
import { resultResponse } from '@/server/time/http';

export const runtime='nodejs';
let database:ReturnType<typeof createDatabaseClient>|undefined;
const token=(request:NextRequest)=>request.cookies.get(process.env.NODE_ENV==='production'?'__Host-office_session':'office_session')?.value??'';
export async function POST(request:NextRequest){
  const sessionToken=token(request);if(!sessionToken)return resultResponse({status:'unauthenticated',code:'UNAUTHENTICATED',message:'Sign in to continue.',reason:'no_session'});
  database??=createDatabaseClient();
  // One boundary, two services: user/role administration and the department
  // hierarchy (`OH-BE-0216`). Each resolves its own actor from the session.
  return handleAdminRequest(request,{
    admin:new BackendUserRoleAdmin(database.pool,sessionToken),
    departments:new BackendDepartmentAdministration(database.pool,sessionToken),
  },process.env.APP_BASE_URL??'http://localhost:3000');
}
