import {describe,expect,it,vi} from 'vitest';
import {AuditWriter,MysqlAuditSink} from './writer';

describe('Phase 2 material audit evidence',()=>{
  it.each(['authentication.login','record.changed','workflow.decided','policy.overridden','period.verified','permission.changed','integration.changed','file.accessed','export.requested'])('records and redacts %s',(action)=>{
    const append=vi.fn();const writer=new AuditWriter({append});
    return writer.append({actorUserId:'u1',action,resourceType:'record',scope:{divisionId:'d1'},correlationId:'00000000-0000-4000-8000-000000000001',before:{password:'secret',visible:'yes'},after:{token:'secret'}}).then(()=>{
      expect(append).toHaveBeenCalledWith(expect.objectContaining({action,beforeProtected:{password:'[REDACTED]',visible:'yes'},afterProtected:{token:'[REDACTED]'}}));
    });
  });

  it('passes audit instants to mysql2 as Date values',async()=>{
    const execute=vi.fn().mockResolvedValue([{},[]]);
    const sink=new MysqlAuditSink({execute} as never);
    const occurredAt='2026-11-23T07:08:38.903Z';

    await sink.append({
      eventId:'00000000-0000-4000-8000-000000000001',actorUserId:'u1',impersonatorUserId:null,
      action:'task.raised',resourceType:'task',resourceId:'t1',scope:{},reason:null,
      correlationId:'00000000-0000-4000-8000-000000000002',beforeProtected:null,
      afterProtected:{reviewState:'pending_review'},occurredAt,
    });

    const parameters=execute.mock.calls[0]?.[1] as unknown[];
    expect(parameters.at(-1)).toBeInstanceOf(Date);
    expect((parameters.at(-1) as Date).toISOString()).toBe(occurredAt);
  });

  it('refuses an invalid audit instant before executing SQL',async()=>{
    const execute=vi.fn();
    const sink=new MysqlAuditSink({execute} as never);

    await expect(sink.append({occurredAt:'not-a-date'})).rejects.toThrow('Audit event occurredAt must be a valid timestamp.');
    expect(execute).not.toHaveBeenCalled();
  });
});
