import { createDatabaseClient } from '@/server/database/client';
import { checkDatabaseReadiness } from '@/server/database/health';
import { checkJobReadiness } from '@/server/database/dependencies';
import { incrementMetric, observeDuration } from '@/server/observability/metrics';
import { operationalLog } from '@/server/observability/logger';

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
    const [readiness, jobs] = await Promise.all([
      checkDatabaseReadiness(database.pool),
      checkJobReadiness(),
    ]);
    const healthy = readiness.status === 'healthy' && jobs.status !== 'unhealthy';
    const degraded = healthy && jobs.status === 'degraded';
    const durationMs = Math.ceil(performance.now() - startedAt);
    incrementMetric(healthy ? 'health.success' : 'health.failure');
    observeDuration('health.duration', durationMs);
    operationalLog({
      event: 'health.checked',
      severity: healthy ? (degraded ? 'warn' : 'info') : 'error',
      outcome: healthy ? (degraded ? 'degraded' : 'success') : 'failure',
      durationMs,
      details: { database: readiness.status, jobs: jobs.status },
    });
    const payload = {
      status: healthy ? (degraded ? 'degraded' : 'healthy') : 'unhealthy',
      service: 'office-management-system',
      checkedAt,
      responseTimeMs: durationMs,
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
        redis: { status: jobs.redis, latencyMs: jobs.latencyMs },
        jobQueue: {
          status: jobs.status,
          waiting: jobs.waitingJobs,
          delayed: jobs.delayedJobs,
          failed: jobs.failedJobs,
        },
        workers: { status: jobs.workers, active: jobs.activeWorkers },
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
