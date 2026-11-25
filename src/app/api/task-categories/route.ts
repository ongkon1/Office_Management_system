import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { createDatabaseClient } from '@/server/database/client';
import { AuthenticationService } from '@/server/authentication/service';
import { MysqlAuthenticationStore } from '@/server/authentication/mysql-store';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { businessToday } from '@/lib/business-date';
import { manageTaskCategories } from '@/server/organization/task-categories';
import { resultResponse } from '@/server/time/http';
import { invalid } from '@/server/time/validation';

export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
const command = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('list'), includeArchived: z.boolean().optional() }),
  z.strictObject({ action: z.literal('create'), name: z.string().max(1000) }),
  z.strictObject({ action: z.literal('rename'), id: z.uuid(), name: z.string().max(1000) }),
  z.strictObject({ action: z.literal('setActive'), id: z.uuid(), isActive: z.boolean() }),
]);

export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== new URL(process.env.APP_BASE_URL ?? 'http://localhost:3000').origin) {
    return resultResponse({ status: 'permission_denied', code: 'FORBIDDEN', message: 'The request origin is not allowed.' });
  }
  try {
    const token = request.cookies.get(process.env.NODE_ENV === 'production' ? '__Host-office_session' : 'office_session')?.value ?? '';
    database ??= createDatabaseClient();
    const pool = database.pool;
    const session = token && await new AuthenticationService(new MysqlAuthenticationStore(pool)).validateSession(token);
    const actor = session && session.status === 'success'
      ? await loadActorPolicyContext(pool, session.data.userId, businessToday()) : null;
    if (!actor) {
      return resultResponse({ status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' });
    }
    const parsed = command.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return resultResponse(invalid('request', 'Choose a supported category operation.'));
    return resultResponse(await manageTaskCategories(pool, {
      userId: actor.userId, isAdmin: actor.roles.includes('super_admin'),
    }, parsed.data));
  } catch {
    return resultResponse({ status: 'error', code: 'DEPENDENCY_FAILED', message: 'Task categories are unavailable.', retryable: true });
  }
}
