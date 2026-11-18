import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { actorFromSession, handleCommand, record, SESSION_COOKIE, text } from '@/server/supporting/http';
import { MysqlRequisitionService } from '@/server/requisitions/application';

export const runtime='nodejs';
const methods=['list','get','submit','decide','withdraw','queue'] as const;
let database:ReturnType<typeof createDatabaseClient>|undefined;
export async function POST(request:NextRequest){
  database??=createDatabaseClient();
  const pool=database.pool;
  return handleCommand(request,{
    methods,
    expectedOrigin:process.env.APP_BASE_URL??'http://localhost:3000',
    resolveActor:()=>actorFromSession(pool,request.cookies.get(SESSION_COOKIE)?.value??''),
    dispatch:async(method,args,actor)=>{
      const service=new MysqlRequisitionService(pool,actor);
      await service.refreshAssignments();
      const userId=text(args[0]);
      switch(method){
        case'list':return service.list(userId);
        case'get':return service.get(userId,text(args[1]));
        case'submit':return service.submit(userId,record(args[1]) as never);
        case'decide':return service.decide(userId,text(args[1]),record(args[2]) as never);
        case'withdraw':return service.withdraw(userId,text(args[1]));
        case'queue':return service.queue(userId);
      }
    },
  });
}
