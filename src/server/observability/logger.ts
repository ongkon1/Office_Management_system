import { safeObservabilityData } from './safe-data';

export type LogSeverity = 'debug' | 'info' | 'warn' | 'error';

export interface OperationalEvent {
  readonly event: string;
  readonly severity: LogSeverity;
  readonly correlationId?: string;
  readonly actorRef?: string | null;
  readonly resourceType?: string | null;
  readonly resourceRef?: string | null;
  readonly durationMs?: number;
  readonly outcome: 'success' | 'denied' | 'failure' | 'degraded';
  readonly details?: Readonly<Record<string, unknown>>;
}

export type LogSink = (line: string) => void;

export function operationalLog(event: OperationalEvent, sink: LogSink = console.log): void {
  sink(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'office-management-system',
    deploymentVersion: process.env.DEPLOYMENT_VERSION ?? 'unknown',
    event: event.event,
    severity: event.severity,
    correlationId: event.correlationId ?? crypto.randomUUID(),
    actorRef: event.actorRef ?? null,
    resourceType: event.resourceType ?? null,
    resourceRef: event.resourceRef ?? null,
    durationMs: event.durationMs === undefined ? null : Math.max(0, Math.round(event.durationMs)),
    outcome: event.outcome,
    details: safeObservabilityData(event.details ?? {}),
  }));
}

