import type { Instrumentation } from 'next';
import { operationalLog } from '@/server/observability/logger';
import { incrementMetric } from '@/server/observability/metrics';

export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    operationalLog({ event: 'application.started', severity: 'info', outcome: 'success' });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  incrementMetric('request.error');
  const digest = typeof error === 'object' && error !== null && 'digest' in error
    ? String(error.digest)
    : undefined;
  operationalLog({
    event: 'request.error',
    severity: 'error',
    outcome: 'failure',
    resourceType: context.routeType,
    resourceRef: context.routePath,
    details: { method: request.method, path: request.path.split('?')[0], digest },
  });
};
