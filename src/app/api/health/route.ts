import { createDatabaseClient } from '@/server/database/client';
import { checkDatabaseReadiness } from '@/server/database/health';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let database: ReturnType<typeof createDatabaseClient> | undefined;

const responseHeaders = {
  'Cache-Control': 'no-store, max-age=0',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
};

async function healthResponse(includeBody: boolean): Promise<Response> {
  const checkedAt = new Date().toISOString();
  const startedAt = performance.now();

  try {
    database ??= createDatabaseClient();
    const readiness = await checkDatabaseReadiness(database.pool);
    const healthy = readiness.status === 'healthy';
    const payload = {
      status: healthy ? 'healthy' : 'unhealthy',
      service: 'office-management-system',
      checkedAt,
      responseTimeMs: Math.ceil(performance.now() - startedAt),
      uptimeSeconds: Math.floor(process.uptime()),
      deploymentVersion: process.env.DEPLOYMENT_VERSION ?? 'unknown',
      source: 'server',
      checks: {
        application: { status: 'healthy' },
        database: {
          status: readiness.status,
          latencyMs: readiness.latencyMs,
        },
        schema: {
          status: readiness.status,
          expectedMigration: readiness.expectedMigration,
          appliedMigration: readiness.appliedMigration,
        },
      },
    };
    return new Response(includeBody ? JSON.stringify(payload) : null, {
      status: healthy ? 200 : 503,
      headers: responseHeaders,
    });
  } catch {
    const payload = {
      status: 'unhealthy',
      service: 'office-management-system',
      checkedAt,
      responseTimeMs: Math.ceil(performance.now() - startedAt),
      uptimeSeconds: Math.floor(process.uptime()),
      deploymentVersion: process.env.DEPLOYMENT_VERSION ?? 'unknown',
      source: 'server',
      checks: {
        application: { status: 'healthy' },
        database: { status: 'unhealthy' },
        schema: { status: 'unhealthy' },
      },
    };
    return new Response(includeBody ? JSON.stringify(payload) : null, {
      status: 503,
      headers: responseHeaders,
    });
  }
}

export async function GET(): Promise<Response> {
  return healthResponse(true);
}

export async function HEAD(): Promise<Response> {
  return healthResponse(false);
}
