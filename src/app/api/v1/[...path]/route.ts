import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { handleApiV1 } from '@/server/integrations/api/http';

/**
 * Versioned REST API (`BE-0730`). Bearer-token only: no session cookie is
 * read, so a browser cannot be tricked into calling it with someone's session.
 */
export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
async function handle(request: NextRequest, context: RouteContext<'/api/v1/[...path]'>) {
  database ??= createDatabaseClient();
  const { path } = await context.params;
  return handleApiV1(request, path, database.pool);
}
export const GET = handle;
export const POST = handle;
