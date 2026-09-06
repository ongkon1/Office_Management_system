import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, hashPassword, verifyPassword } from './crypto';
import { isTrustedMutation, sessionCookie } from './request';
import { prohibitImpersonation, redactProtected } from './redaction';
import { sessionFailure } from './session';

describe('BE-0201/0202/0206/0207/0221/0222/0223 security primitives', () => {
  it('uses Better Auth password hashing and constant-time verification', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });
  it('sets the required opaque session cookie properties', () => expect(sessionCookie(true)).toMatchObject({ name: '__Host-office_session', httpOnly: true, secure: true, sameSite: 'lax', path: '/' }));
  it('rejects cross-site and missing-origin mutations', () => {
    expect(isTrustedMutation({ method:'POST',origin:'https://evil.test',referer:null,secFetchSite:'cross-site' }, ['https://office.test'])).toBe(false);
    expect(isTrustedMutation({ method:'POST',origin:null,referer:null,secFetchSite:null }, ['https://office.test'])).toBe(false);
    expect(isTrustedMutation({ method:'POST',origin:'https://office.test',referer:null,secFetchSite:'same-origin' }, ['https://office.test'])).toBe(true);
  });
  it('redacts nested secrets and prohibits unapproved impersonation', () => {
    expect(redactProtected({ token:'x',nested:{ salary:2,ok:'visible' } })).toEqual({ token:'[REDACTED]',nested:{ salary:'[REDACTED]',ok:'visible' } });
    expect(prohibitImpersonation).toThrow('not approved');
  });
  it('encrypts provider credentials with authenticated, rotatable envelopes', () => {
    const key = Buffer.alloc(32, 7); const provider = { current:()=>({id:'k1',key}), byId:(id:string)=>id==='k1'?key:undefined };
    const encrypted = encryptSecret('provider-secret',provider); expect(encrypted).not.toContain('provider-secret'); expect(decryptSecret(encrypted,provider)).toBe('provider-secret');
  });
  it('maps expired and 2FA sessions to stable frontend failures', () => {
    expect(sessionFailure('expired').reason).toBe('session_expired'); expect(sessionFailure('two_factor').reason).toBe('two_factor_required');
  });
});
