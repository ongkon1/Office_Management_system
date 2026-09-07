import {describe,expect,it,vi} from 'vitest';
import {AuditWriter} from './writer';

describe('Phase 2 material audit evidence',()=>{
  it.each(['authentication.login','record.changed','workflow.decided','policy.overridden','period.verified','permission.changed','integration.changed','file.accessed','export.requested'])('records and redacts %s',(action)=>{
    const append=vi.fn();const writer=new AuditWriter({append});
    return writer.append({actorUserId:'u1',action,resourceType:'record',scope:{divisionId:'d1'},correlationId:'00000000-0000-4000-8000-000000000001',before:{password:'secret',visible:'yes'},after:{token:'secret'}}).then(()=>{
      expect(append).toHaveBeenCalledWith(expect.objectContaining({action,beforeProtected:{password:'[REDACTED]',visible:'yes'},afterProtected:{token:'[REDACTED]'}}));
    });
  });
});
