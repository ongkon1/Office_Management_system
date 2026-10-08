import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { BackendProfileService } from '@/server/profile/application';
import { handleProfileRequest } from '@/server/profile/http';
import { resultResponse } from '@/server/time/http';
export const runtime='nodejs';let database:ReturnType<typeof createDatabaseClient>|undefined;
export async function POST(request:NextRequest){const token=request.cookies.get(process.env.NODE_ENV==='production'?'__Host-office_session':'office_session')?.value??'';if(!token)return resultResponse({status:'unauthenticated',code:'UNAUTHENTICATED',message:'Sign in to continue.',reason:'no_session'});database??=createDatabaseClient();return handleProfileRequest(request,new BackendProfileService(database.pool,token),process.env.APP_BASE_URL??'http://localhost:3000');}
