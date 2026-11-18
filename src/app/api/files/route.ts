import type { NextRequest } from 'next/server';
import { createDatabaseClient } from '@/server/database/client';
import { SESSION_COOKIE } from '@/server/supporting/http';
import { handleFilesRequest } from '@/server/supporting/routes';

export const runtime = 'nodejs';
let database: ReturnType<typeof createDatabaseClient> | undefined;
const origin = () => process.env.APP_BASE_URL ?? 'http://localhost:3000';
const handle = (request: NextRequest) => {
  database ??= createDatabaseClient();
  return handleFilesRequest(request, database.pool, request.cookies.get(SESSION_COOKIE)?.value ?? '', origin());
};
export const GET = handle;
export const POST = handle;
export const PUT = handle;
