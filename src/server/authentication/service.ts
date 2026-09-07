import { randomUUID } from 'node:crypto';
import { hashPassword, randomOpaqueToken, secretHash, verifyPassword } from '@/server/security/crypto';
import type { AuthenticationRateLimiter } from './rate-limit';

export type AccountState = 'active' | 'inactive' | 'locked';
export interface AuthAccount { readonly userId: string; readonly state: AccountState; readonly passwordHash: string; readonly failedCount: number; readonly lockedUntil: Date | null; readonly twoFactorEnabled: boolean }
export interface AuthenticationStore {
  findAccount(identifierNormalized: string): Promise<AuthAccount | null>;
  recordAttempt(input: { userId: string | null; identifierHash: string; outcome: string; originHash: string; correlationId: string }): Promise<void>;
  recordSecurityEvent(input: { userId: string | null; eventType: string; identifierHash?: string | null; originHash?: string | null; correlationId: string }): Promise<void>;
  registerFailure(userId: string, lockedUntil: Date | null): Promise<void>;
  clearFailures(userId: string): Promise<void>;
  createSession(input: { id: string; userId: string; tokenHash: string; expiresAt: Date; originHash: string; rotatedFrom: string | null }): Promise<void>;
  findSession(tokenHash: string): Promise<{ readonly id: string; readonly userId: string; readonly expiresAt: Date; readonly revokedAt: Date | null; readonly lastSeenAt: Date } | null>;
  touchSession(id: string, seenAt: Date): Promise<void>;
  revokeSession(tokenHash: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
  saveReset(input: { identifierHash: string; tokenHash: string; expiresAt: Date }): Promise<void>;
  consumeReset(identifierHash: string, tokenHash: string, passwordHash: string): Promise<boolean>;
}

const genericLoginFailure = { status: 'unauthenticated' as const, code: 'UNAUTHENTICATED' as const, message: 'Invalid sign-in details.', reason: 'no_session' as const };
const dummyPasswordHash = hashPassword('constant-time-dummy-password');

export class AuthenticationService {
  constructor(
    private readonly store: AuthenticationStore,
    private readonly now = () => new Date(),
    private readonly rateLimiter?: AuthenticationRateLimiter,
  ) {}

  async login(identifier: string, password: string, origin: string, correlationId = randomUUID()) {
    const normalized = identifier.trim().toLowerCase(); const identifierHash = secretHash(normalized); const originHash = secretHash(origin);
    const limited = await this.rateLimiter?.check(identifierHash, originHash, 'login');
    if (limited?.status === 'error') return limited;
    const account = await this.store.findAccount(normalized);
    const valid = await verifyPassword(password, account?.passwordHash ?? await dummyPasswordHash);
    if (!account || !valid || account.state !== 'active' || (account.lockedUntil && account.lockedUntil > this.now())) {
      if (account?.state === 'active') await this.store.registerFailure(account.userId, account.failedCount + 1 >= 5 ? new Date(this.now().getTime() + 15 * 60_000) : null);
      await this.store.recordAttempt({ userId: account?.userId ?? null, identifierHash, outcome: 'failed', originHash, correlationId });
      return genericLoginFailure;
    }
    await this.store.clearFailures(account.userId);
    await this.store.recordAttempt({ userId: account.userId, identifierHash, outcome: 'success', originHash, correlationId });
    if (account.twoFactorEnabled) return { status: 'unauthenticated' as const, code: 'UNAUTHENTICATED' as const, message: 'Two-factor verification required.', reason: 'two_factor_required' as const };
    return this.issueSession(account.userId, originHash, null);
  }

  async issueSession(userId: string, originHash: string, rotatedFrom: string | null) {
    const token = randomOpaqueToken();
    await this.store.createSession({ id: randomUUID(), userId, tokenHash: secretHash(token), expiresAt: new Date(this.now().getTime() + 8 * 60 * 60_000), originHash, rotatedFrom });
    await this.store.recordSecurityEvent({userId,eventType:rotatedFrom?'session_rotated':'session_created',originHash,correlationId:randomUUID()});
    return { status: 'success' as const, data: { token, expiresAt: new Date(this.now().getTime() + 8 * 60 * 60_000).toISOString() } };
  }

  async validateSession(token: string) {
    const tokenHash = secretHash(token);
    const session = await this.store.findSession(tokenHash);
    if (!session) return { status: 'unauthenticated' as const, reason: 'no_session' as const };
    if (session.revokedAt || session.expiresAt <= this.now()) {
      if (!session.revokedAt) await this.store.revokeSession(tokenHash);
      return { status: 'unauthenticated' as const, reason: 'session_expired' as const };
    }
    await this.store.touchSession(session.id, this.now());
    return { status: 'success' as const, data: { userId: session.userId, sessionId: session.id } };
  }

  async rotateSession(token: string, origin: string) {
    const current = await this.store.findSession(secretHash(token));
    if (!current || current.revokedAt || current.expiresAt <= this.now()) return { status: 'unauthenticated' as const, reason: 'session_expired' as const };
    await this.store.revokeSession(secretHash(token));
    return this.issueSession(current.userId, secretHash(origin), current.id);
  }

  async logout(token: string) { const current=await this.store.findSession(secretHash(token)); await this.store.revokeSession(secretHash(token)); await this.store.recordSecurityEvent({userId:current?.userId??null,eventType:'session_revoked',correlationId:randomUUID()}); return { status: 'success' as const, data: undefined }; }

  async requestPasswordReset(identifier: string, origin = 'unknown') {
    const normalized = identifier.trim().toLowerCase(); const identifierHash = secretHash(normalized); const account = await this.store.findAccount(normalized);
    const limited = await this.rateLimiter?.check(identifierHash, secretHash(origin), 'reset');
    if (limited?.status === 'error') return { status: 'success' as const, data: { message: 'If the account exists, reset instructions will be sent.' } };
    if (account?.state === 'active') { const token = randomOpaqueToken(); await this.store.saveReset({ identifierHash, tokenHash: secretHash(token), expiresAt: new Date(this.now().getTime() + 15 * 60_000) }); }
    await this.store.recordSecurityEvent({userId:account?.userId??null,eventType:'password_reset_requested',identifierHash,originHash:secretHash(origin),correlationId:randomUUID()});
    return { status: 'success' as const, data: { message: 'If the account exists, reset instructions will be sent.' } };
  }

  async resetPassword(identifier: string, token: string, password: string) {
    if (password.length < 12) return { status: 'validation_failure' as const, code: 'VALIDATION_FAILED' as const, message: 'Password does not meet policy.', fieldErrors: [{ field: 'password', code: 'PASSWORD_TOO_SHORT', message: 'Use at least 12 characters.', guidance: 'Choose a longer unique password.' }] };
    const consumed = await this.store.consumeReset(secretHash(identifier.trim().toLowerCase()), secretHash(token), await hashPassword(password));
    return consumed ? { status: 'success' as const, data: undefined } : genericLoginFailure;
  }
}
