import type { Pool } from 'mysql2/promise';
import { z } from 'zod';
import type { Result } from '@/contracts/results';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { isTrustedMutation } from '@/server/security/request';
import { resultResponse } from '@/server/time/http';
import { businessDate, invalid, unauthenticated, unavailable } from './results';

/**
 * The shared session boundary for the Phase 7 routes. Identity comes only
 * from the session cookie; a payload can name a method and its arguments,
 * never who is acting. Mutations must come from the application's own origin.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-office_session' : 'office_session';

export async function actorFromSession(pool: Pool, sessionToken: string): Promise<ActorPolicyContext | null> {
  if (!sessionToken) return null;
  const session = await new AuthenticationService(new MysqlAuthenticationStore(pool)).validateSession(sessionToken);
  return session.status === 'success' ? loadActorPolicyContext(pool, session.data.userId, businessDate()) : null;
}

export const trustedOrigin = (request: Request, expectedOrigin: string) =>
  isTrustedMutation({ method: request.method, origin: request.headers.get('origin'), referer: request.headers.get('referer'), secFetchSite: request.headers.get('sec-fetch-site') }, [new URL(expectedOrigin).origin]);

/**
 * Parse a `{ method, args }` command against an explicit method list and
 * dispatch it with the session actor. Unknown methods are refused by name.
 */
export async function handleCommand<M extends string>(
  request: Request,
  options: {
    readonly methods: readonly M[];
    readonly expectedOrigin: string;
    readonly resolveActor: () => Promise<ActorPolicyContext | null>;
    readonly dispatch: (method: M, args: readonly unknown[], actor: ActorPolicyContext) => Promise<Result<unknown>>;
    readonly maxBytes?: number;
  },
) {
  if (!trustedOrigin(request, options.expectedOrigin)) return resultResponse({ status: 'permission_denied', code: 'FORBIDDEN', message: 'The request origin is not allowed.' });
  try {
    const text = await request.text();
    if (Buffer.byteLength(text) > (options.maxBytes ?? 200_000)) return resultResponse(invalid('request', 'The request is too large.', 'Send less data in one request.'));
    const command = z.object({ method: z.enum(options.methods as unknown as [M, ...M[]]), args: z.array(z.unknown()).max(4) }).strict().safeParse(JSON.parse(text));
    if (!command.success) return resultResponse(invalid('method', 'Choose a supported operation.', 'Reload the page and try again.'));
    const actor = await options.resolveActor();
    if (!actor) return resultResponse(unauthenticated());
    return resultResponse(await options.dispatch(command.data.method, command.data.args, actor));
  } catch (error) {
    return resultResponse(error instanceof SyntaxError ? invalid('request', 'Send valid JSON.', 'Reload the page and try again.') : unavailable('The operation could not be completed.'));
  }
}

/** Narrow an untyped argument, refusing anything that is not a plain string. */
export const text = (value: unknown, fallback = '') => (typeof value === 'string' ? value : fallback);
export const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});
