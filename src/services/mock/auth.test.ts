import { beforeEach, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from './accounts';
import {
  MockAuthService,
  DEMO_RESET_TOKENS,
  DEMO_TWO_FACTOR_CODE,
  MAX_FAILED_ATTEMPTS,
} from './auth';

const EMPLOYEE = 'nadia.rahman@demo.local';
const ADMIN = 'arif.mahmud@demo.local';
const LOCKED = 'rafiq.chowdhury@demo.local';
const INACTIVE = 'nusrat.jahan@demo.local';

function service() {
  return new MockAuthService();
}

beforeEach(() => {
  MockAuthService.resetAttempts();
});

describe('login', () => {
  it('signs in a valid account and returns a session', async () => {
    const result = await service().login({
      identifier: EMPLOYEE,
      password: DEMO_PASSWORD,
      rememberMe: false,
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.requiresTwoFactor).toBe(false);
    expect(result.data.user?.displayName).toBe('Nadia Rahman');
    expect(result.data.user?.primaryRole).toBe('employee');
  });

  it('accepts an employee ID as well as an email', async () => {
    const result = await service().login({
      identifier: 'EMP-1001',
      password: DEMO_PASSWORD,
      rememberMe: false,
    });
    expect(result.status).toBe('success');
  });

  it('fails identically for an unknown account and a wrong password', async () => {
    const unknown = await service().login({
      identifier: 'nobody@demo.local',
      password: DEMO_PASSWORD,
      rememberMe: false,
    });
    const wrongPassword = await service().login({
      identifier: EMPLOYEE,
      password: 'wrong-password',
      rememberMe: false,
    });

    // Distinguishable responses would let the form enumerate accounts.
    expect(unknown.status).toBe('validation_failure');
    expect(wrongPassword.status).toBe('validation_failure');
    if (unknown.status !== 'validation_failure') return;
    if (wrongPassword.status !== 'validation_failure') return;
    expect(unknown.fieldErrors[0].code).toBe(wrongPassword.fieldErrors[0].code);
    expect(unknown.fieldErrors[0].message).toBe(wrongPassword.fieldErrors[0].message);
  });

  it('locks an account after repeated failures', async () => {
    const auth = service();
    for (let attempt = 1; attempt < MAX_FAILED_ATTEMPTS; attempt += 1) {
      const result = await auth.login({
        identifier: EMPLOYEE,
        password: 'wrong',
        rememberMe: false,
      });
      expect(result.status).toBe('validation_failure');
    }

    const locked = await auth.login({
      identifier: EMPLOYEE,
      password: 'wrong',
      rememberMe: false,
    });
    expect(locked.status).toBe('validation_failure');
    if (locked.status !== 'validation_failure') return;
    expect(locked.fieldErrors[0].code).toBe('ACCOUNT_LOCKED');
  });

  it('clears the failure count after a successful sign-in', async () => {
    const auth = service();
    await auth.login({ identifier: EMPLOYEE, password: 'wrong', rememberMe: false });
    await auth.login({ identifier: EMPLOYEE, password: DEMO_PASSWORD, rememberMe: false });

    // Four more failures must not reach the lock threshold.
    for (let attempt = 0; attempt < MAX_FAILED_ATTEMPTS - 1; attempt += 1) {
      const result = await auth.login({
        identifier: EMPLOYEE,
        password: 'wrong',
        rememberMe: false,
      });
      if (result.status !== 'validation_failure') throw new Error('expected failure');
      expect(result.fieldErrors[0].code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('refuses a locked account and an inactive account with their own routes', async () => {
    const locked = await service().login({
      identifier: LOCKED,
      password: DEMO_PASSWORD,
      rememberMe: false,
    });
    expect(locked.status).toBe('permission_denied');
    if (locked.status === 'permission_denied') {
      expect(locked.guidance).toBe('/account-locked');
    }

    const inactive = await service().login({
      identifier: INACTIVE,
      password: DEMO_PASSWORD,
      rememberMe: false,
    });
    expect(inactive.status).toBe('permission_denied');
    if (inactive.status === 'permission_denied') {
      expect(inactive.guidance).toBe('/account-inactive');
    }
  });
});

describe('two-factor', () => {
  // No demo account enables 2FA any more: the pending challenge is held in
  // module memory and cannot survive a page load, so the step stranded anyone
  // who reached /two-factor by anything but a client-side push. The service
  // still implements it for the real TOTP cutover, hence the guard test below.
  it('completes the administrator sign-in without a second step', async () => {
    const auth = service();
    const login = await auth.login({
      identifier: ADMIN,
      password: DEMO_PASSWORD,
      rememberMe: false,
    });

    expect(login.status).toBe('success');
    if (login.status !== 'success') return;
    expect(login.data.requiresTwoFactor).toBe(false);
    expect(login.data.user?.primaryRole).toBe('super_admin');

    // The session is live immediately, with no verification in between.
    const session = await auth.getSession();
    expect(session.status === 'success' && session.data?.primaryRole).toBe('super_admin');
  });

  it('refuses verification when no sign-in is pending', async () => {
    const result = await service().verifyTwoFactor({ code: DEMO_TWO_FACTOR_CODE });
    expect(result.status).toBe('unauthenticated');
  });
});

describe('password reset', () => {
  it('reports success regardless of whether the address exists', async () => {
    const known = await service().requestPasswordReset({ email: EMPLOYEE });
    const unknown = await service().requestPasswordReset({ email: 'nobody@demo.local' });
    expect(known.status).toBe('success');
    expect(unknown.status).toBe('success');
  });

  it('distinguishes a valid, expired and invalid token', async () => {
    const auth = service();
    const valid = await auth.resetPassword({
      token: DEMO_RESET_TOKENS.valid,
      password: 'a-long-enough-passphrase',
    });
    const expired = await auth.resetPassword({
      token: DEMO_RESET_TOKENS.expired,
      password: 'a-long-enough-passphrase',
    });
    const invalid = await auth.resetPassword({
      token: 'something-else',
      password: 'a-long-enough-passphrase',
    });

    expect(valid.status).toBe('success');
    expect(expired.status).toBe('conflict');
    expect(invalid.status).toBe('not_found');
  });
});

describe('session lifecycle', () => {
  it('clears the session on sign-out', async () => {
    const auth = service();
    await auth.login({ identifier: EMPLOYEE, password: DEMO_PASSWORD, rememberMe: false });

    const before = await auth.getSession();
    expect(before.status === 'success' && before.data).not.toBeNull();

    await auth.logout();

    const after = await auth.getSession();
    expect(after.status === 'success' && after.data).toBeNull();
  });

  it('issues a session that expires in the future', async () => {
    const auth = service();
    const result = await auth.login({
      identifier: EMPLOYEE,
      password: DEMO_PASSWORD,
      rememberMe: false,
    });
    if (result.status !== 'success' || !result.data.user) throw new Error('expected session');
    expect(new Date(result.data.user.sessionExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe('demo account switching', () => {
  it('replaces the session with the selected role', async () => {
    const auth = service();
    const result = await auth.switchDemoAccount({ userId: 'usr-3001' });
    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.data.primaryRole).toBe('hr_manager');
    expect(result.data.permissions).toContain('time.period.verify');
  });

  it('reports an unknown account as not found', async () => {
    const result = await service().switchDemoAccount({ userId: 'usr-does-not-exist' });
    expect(result.status).toBe('not_found');
  });
});
