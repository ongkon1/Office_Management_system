export function sessionFailure(state: 'missing' | 'expired' | 'revoked' | 'two_factor', returnTo?: string) {
  const reason = state === 'two_factor' ? 'two_factor_required' : state === 'expired' || state === 'revoked' ? 'session_expired' : 'no_session';
  return { status: 'unauthenticated' as const, code: 'UNAUTHENTICATED' as const,
    message: reason === 'session_expired' ? 'Your session has expired. Sign in again.' : reason === 'two_factor_required' ? 'Complete two-factor verification.' : 'Sign in to continue.',
    reason, ...(returnTo ? { returnTo } : {}) };
}
