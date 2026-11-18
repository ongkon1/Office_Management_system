import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { MysqlConveyanceService } from '@/server/conveyance/application';
import { actorFromSession, handleCommand, record, SESSION_COOKIE, text } from '@/server/supporting/http';

export const runtime='nodejs';
const methods=['list','formContext','get','submit','decide','withdraw','getReceipt','queue'] as const;
let database:ReturnType<typeof createDatabaseClient>|undefined;
export async function POST(request:NextRequest){database??=createDatabaseClient();const pool=database.pool;return handleCommand(request,{methods,expectedOrigin:process.env.APP_BASE_URL??'http://localhost:3000',resolveActor:()=>actorFromSession(pool,request.cookies.get(SESSION_COOKIE)?.value??''),dispatch:async(method,args,actor)=>{const service=new MysqlConveyanceService(pool,actor);await service.refreshAssignments();const userId=text(args[0]);switch(method){case'list':return service.list(userId);case'formContext':return service.formContext(userId);case'get':return service.get(userId,text(args[1]));case'submit':return service.submit(userId,record(args[1]) as never);case'decide':return service.decide(userId,text(args[1]),record(args[2]) as never);case'withdraw':return service.withdraw(userId,text(args[1]));case'getReceipt':return service.getReceipt(userId,text(args[1]));case'queue':return service.queue(userId);}}});}
