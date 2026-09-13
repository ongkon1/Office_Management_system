import { randomUUID } from 'node:crypto';
import { AuditWriter } from '@/server/audit/writer';
import { success } from '@/contracts/results';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Pool } from 'mysql2/promise';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { HrRepository } from '@/server/hr/repository';
import { RequestApplication } from '@/server/hr/requests';
import { ReportApplication } from './application';
import { ExportApplication } from './exports';
import type { ExportStorage } from './storage';
/** Trusted host only. Requester identity is read from SQL, never accepted from job payloads. */
export async function dispatchExports(pool: Pool, storage: ExportStorage, fontPath?: string) {
    await sweepExportJobs(pool,storage);
    const repo = new HrRepository(pool);
    const rows = await repo.rows("SELECT id,requested_by_user_id,state FROM export_jobs WHERE deleted_at IS NULL AND (state='queued' OR (state='processing' AND lease_until<UTC_TIMESTAMP(6))) ORDER BY requested_at,id LIMIT 20");
    for (const row of rows) {
        const reports = new ReportApplication(new RequestApplication(repo, on => loadActorPolicyContext(pool, String(row.requested_by_user_id), on)));
        const app = new ExportApplication(reports, storage, { fontPath });
        const result = await app.process(String(row.id));
        if (result.status !== 'success' && result.status !== 'conflict')
            throw new Error('Export dispatch did not complete');
    }
    return { processed: rows.length };
}
export async function startExportWorker(pool: Pool, storage: ExportStorage, connection: ConnectionOptions, fontPath?: string) {
    const queue = new Queue('office-exports', { connection });
    await queue.upsertJobScheduler('export-outbox', { every: 10000 }, { name: 'dispatch', opts: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 } });
    const worker = new Worker('office-exports', () => dispatchExports(pool, storage, fontPath), { connection, concurrency: 1 });
    return { queue, worker, async close() { await worker.close(); await queue.close(); } };
}

/** Trusted scheduler maintenance does not depend on an expired or disabled requester session. */
export async function sweepExportJobs(pool:Pool,storage:ExportStorage){
 return new HrRepository(pool).transaction(async repo=>{
  const rows=await repo.rows("SELECT j.*,a.storage_key FROM export_jobs j JOIN users u ON u.id=j.requested_by_user_id LEFT JOIN export_artifacts a ON a.export_job_id=j.id WHERE j.deleted_at IS NULL AND ((j.state='ready' AND j.expires_at<=UTC_TIMESTAMP(6)) OR (u.status<>'active' AND j.state IN ('queued','processing'))) ORDER BY j.requested_at,j.id LIMIT 100");
  const audit=new AuditWriter({async append(e){await repo.execute('INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,before_protected,after_protected) VALUES(?,NULL,?,?,?,?,?,?,?,?)',[String(e.eventId),String(e.action),'export',String(e.resourceId),JSON.stringify(e.scope),String(e.reason),String(e.correlationId),JSON.stringify(e.beforeProtected??null),JSON.stringify(e.afterProtected??null)]);}});
  for(const row of rows){
   const expired=row.state==='ready';if(row.storage_key)await storage.delete(String(row.storage_key));
   await repo.execute("UPDATE export_jobs SET state=?,failure_code=?,lease_token=NULL,lease_until=NULL WHERE id=?",[expired?'expired':'failed',expired?null:'REQUESTER_INACTIVE',String(row.id)]);
   await audit.append({actorUserId:null,action:expired?'export.expiry':'export.failure',resourceType:'export',resourceId:String(row.id),scope:{initiator:'export_scheduler'},reason:expired?'Artifact access expired':'Requester is inactive',correlationId:randomUUID(),before:{state:row.state},after:{state:expired?'expired':'failed'}});
   if(row.storage_key)await audit.append({actorUserId:null,action:'export.deletion',resourceType:'export',resourceId:String(row.id),scope:{initiator:'export_scheduler'},reason:'Expired artifact removed',correlationId:randomUUID(),after:{artifactDeleted:true}});
  }
  return success({processed:rows.length});
 });
}
