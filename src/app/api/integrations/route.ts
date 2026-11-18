import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { SESSION_COOKIE } from '@/server/supporting/http';
import { handleIntegrationsRequest } from '@/server/supporting/routes';

export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
export async function POST(request: NextRequest) {
  database ??= createDatabaseClient();
  return handleIntegrationsRequest(request, database.pool, request.cookies.get(SESSION_COOKIE)?.value ?? '', process.env.APP_BASE_URL ?? 'http://localhost:3000');
}
