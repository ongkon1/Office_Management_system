import { incrementMetric } from './metrics';
import { operationalLog } from './logger';

export type AlertKind =
  | 'authentication_anomaly'
  | 'authorization_denial_spike'
  | 'job_failure'
  | 'export_failure'
  | 'integration_failure'
  | 'database_unhealthy'
  | 'backup_failure';

export function raiseOperationalAlert(kind: AlertKind, correlationId: string, details: Record<string, unknown> = {}): void {
  incrementMetric(`alert.${kind}`);
  operationalLog({
    event: `alert.${kind}`,
    severity: kind === 'database_unhealthy' || kind === 'backup_failure' ? 'error' : 'warn',
    correlationId,
    outcome: 'failure',
    details,
  });
}

