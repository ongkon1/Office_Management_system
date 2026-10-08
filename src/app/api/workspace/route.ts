import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { BackendWorkspaceService } from '@/server/workspace/application';
import { handleWorkspaceRequest } from '@/server/workspace/http';
import { resultResponse } from '@/server/time/http';

export const runtime='nodejs';
let database:ReturnType<typeof createDatabaseClient>|undefined;
const token=(request:NextRequest)=>request.cookies.get(process.env.NODE_ENV==='production'?'__Host-office_session':'office_session')?.value??'';
export async function POST(request:NextRequest){
  const sessionToken=token(request);
  if(!sessionToken)return resultResponse({status:'unauthenticated',code:'UNAUTHENTICATED',message:'Sign in to continue.',reason:'no_session'});
  database??=createDatabaseClient();
  return handleWorkspaceRequest(request,new BackendWorkspaceService(database.pool,sessionToken),process.env.APP_BASE_URL??'http://localhost:3000');
}
