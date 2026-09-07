export interface RequestSecurityInput { readonly method: string; readonly origin: string | null; readonly referer: string | null; readonly secFetchSite: string | null }

export function isTrustedMutation(input: RequestSecurityInput, trustedOrigins: readonly string[]): boolean {
  if (['GET', 'HEAD', 'OPTIONS'].includes(input.method.toUpperCase())) return true;
  if (input.secFetchSite === 'cross-site') return false;
  const candidate = input.origin ?? (input.referer ? new URL(input.referer).origin : null);
  return candidate !== null && trustedOrigins.includes(candidate);
}

export const sessionCookie = (secure = true) => ({
  name: secure ? '__Host-office_session' : 'office_session', httpOnly: true, secure, sameSite: 'lax' as const, path: '/', maxAge: 60 * 60 * 8,
});
