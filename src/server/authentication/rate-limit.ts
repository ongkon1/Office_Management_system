export interface RateLimitStore {
  increment(key: string, action: string, windowSeconds: number, maximum: number, now: Date): Promise<{ readonly allowed: boolean; readonly retryAfterSeconds: number }>;
}
export class AuthenticationRateLimiter {
  constructor(private readonly store: RateLimitStore) {}
  async check(accountIdentifier: string, origin: string, action: 'login' | 'reset' | 'two_factor') {
    const windowSeconds = action === 'reset' ? 900 : 60;
    const maximum = action === 'login' ? 5 : action === 'two_factor' ? 3 : 3;
    const account = await this.store.increment(accountIdentifier, action, windowSeconds, maximum, new Date());
    const source = await this.store.increment(origin, action, windowSeconds, maximum * 4, new Date());
    return account.allowed && source.allowed
      ? { status: 'success' as const, data: undefined }
      : { status: 'error' as const, code: 'RATE_LIMITED' as const, message: 'Too many attempts. Try again later.', retryable: true, retryAfterSeconds: Math.max(account.retryAfterSeconds, source.retryAfterSeconds) };
  }
}
