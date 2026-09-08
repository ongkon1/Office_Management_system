import { describe, expect, it, vi } from 'vitest';
import { hashPassword, secretHash } from '@/server/security/crypto';
import { AuthenticationService, type AuthenticationStore } from './service';
import { TwoFactorService } from './two-factor';

function store(account: Awaited<ReturnType<AuthenticationStore['findAccount']>>): AuthenticationStore {
  return { findAccount:vi.fn().mockResolvedValue(account),recordAttempt:vi.fn(),recordSecurityEvent:vi.fn(),registerFailure:vi.fn(),clearFailures:vi.fn(),createSession:vi.fn(),findSession:vi.fn().mockResolvedValue(null),touchSession:vi.fn(),revokeSession:vi.fn(),revokeAllSessions:vi.fn(),saveReset:vi.fn(),consumeReset:vi.fn().mockResolvedValue(true) };
}
describe('BE-0201..0206 and BE-0225 authentication behavior', () => {
  it.each(['super_admin','team_lead','employee','hr_manager','management'])('authenticates the seeded %s role account',async(role)=>{
    const s=store({userId:`u-${role}`,state:'active',passwordHash:await hashPassword('Demo1234!'),failedCount:0,lockedUntil:null,twoFactorEnabled:false});
    const result=await new AuthenticationService(s).login(`${role}@powerin.ai`,'Demo1234!','127.0.0.1');
    expect(result.status).toBe('success');
  });
  it('returns the same response for an unknown account and a bad password', async () => {
    const hash=await hashPassword('valid-password-value');
    const missing=await new AuthenticationService(store(null)).login('missing@test','wrong','127.0.0.1');
    const invalid=await new AuthenticationService(store({userId:'u',state:'active',passwordHash:hash,failedCount:0,lockedUntil:null,twoFactorEnabled:false})).login('known@test','wrong','127.0.0.1');
    expect(missing).toEqual(invalid);
  });
  it('locks on the fifth failure and never issues a session', async () => {
    const s=store({userId:'u',state:'active',passwordHash:await hashPassword('correct-password'),failedCount:4,lockedUntil:null,twoFactorEnabled:false});
    await new AuthenticationService(s,()=>new Date('2026-09-06T00:00:00Z')).login('a@b.test','wrong','ip');
    expect(s.registerFailure).toHaveBeenCalledWith('u',new Date('2026-09-06T00:15:00Z')); expect(s.createSession).not.toHaveBeenCalled();
  });
  it('issues a hashed opaque session and supports revocation', async () => {
    const s=store({userId:'u',state:'active',passwordHash:await hashPassword('correct-password'),failedCount:0,lockedUntil:null,twoFactorEnabled:false}); const auth=new AuthenticationService(s);
    const result=await auth.login('a@b.test','correct-password','ip'); expect(result.status).toBe('success');
    if(result.status==='success'){ expect(s.createSession).toHaveBeenCalledWith(expect.objectContaining({tokenHash:secretHash(result.data.token)})); await auth.logout(result.data.token); expect(s.revokeSession).toHaveBeenCalledWith(secretHash(result.data.token)); }
  });
  it('validates, expires, and rotates database sessions', async () => {
    const s=store(null); const now=new Date('2026-09-06T00:00:00Z'); const auth=new AuthenticationService(s,()=>now);
    vi.mocked(s.findSession).mockResolvedValue({id:'s1',userId:'u',expiresAt:new Date('2026-09-06T01:00:00Z'),revokedAt:null,lastSeenAt:now});
    await expect(auth.validateSession('old')).resolves.toEqual({status:'success',data:{userId:'u',sessionId:'s1'}});
    expect(s.touchSession).toHaveBeenCalledWith('s1',now);
    const rotated=await auth.rotateSession('old','origin'); expect(rotated.status).toBe('success');
    expect(s.revokeSession).toHaveBeenCalledWith(secretHash('old'));
    expect(s.createSession).toHaveBeenCalledWith(expect.objectContaining({userId:'u',rotatedFrom:'s1'}));
  });
  it('uses a non-enumerating reset response and single-use store operation', async () => {
    const s=store(null); const auth=new AuthenticationService(s); expect(await auth.requestPasswordReset('nobody@test')).toEqual({status:'success',data:{message:'If the account exists, reset instructions will be sent.'}});
    expect((await auth.resetPassword('user@test','token','short')).status).toBe('validation_failure');
  });
  it('hashes recovery codes and consumes each through the store', async () => {
    const twoStore={saveEnrollment:vi.fn(),load:vi.fn(),consumeRecoveryCode:vi.fn().mockResolvedValue(true),disable:vi.fn()};
    const two=new TwoFactorService({beginEnrollment:vi.fn().mockResolvedValue({encryptedSecret:'encrypted',provisioningUri:'otpauth://safe'}),verifyTotp:vi.fn()},twoStore);
    const enrollment=await two.enroll('u'); expect(enrollment.recoveryCodes).toHaveLength(10); expect(twoStore.saveEnrollment.mock.calls[0][2][0]).toBe(secretHash(enrollment.recoveryCodes[0]));
    await expect(two.recover('u',enrollment.recoveryCodes[0])).resolves.toBe(true);
  });
});
