import { randomUUID } from 'node:crypto';
import { redactProtected } from '@/server/security/redaction';
import type { Pool } from 'mysql2/promise';

export interface AuditEventInput {
  readonly actorUserId: string | null; readonly impersonatorUserId?: string | null; readonly action: string;
  readonly resourceType: string; readonly resourceId?: string | null; readonly scope: Readonly<Record<string, unknown>>;
  readonly reason?: string | null; readonly correlationId: string; readonly before?: unknown; readonly after?: unknown;
}
export interface AuditSink { append(event: Readonly<Record<string, unknown>>): Promise<void> }

export class AuditWriter {
  constructor(private readonly sink: AuditSink) {}
  async append(input: AuditEventInput) {
    await this.sink.append({ eventId: randomUUID(), ...input, impersonatorUserId: input.impersonatorUserId ?? null,
      resourceId: input.resourceId ?? null, reason: input.reason ?? null,
      beforeProtected: redactProtected(input.before), afterProtected: redactProtected(input.after), occurredAt: new Date().toISOString() });
  }
}

/** The database trigger makes these rows append-only; this adapter exposes no update/delete API. */
export class MysqlAuditSink implements AuditSink {
  constructor(private readonly pool: Pool) {}
  async append(event: Readonly<Record<string, unknown>>): Promise<void> {
    const scalar = (key: string) => typeof event[key] === 'string' ? event[key] as string : null;
    await this.pool.execute(
      `INSERT INTO audit_events(event_id,actor_user_id,impersonator_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,before_protected,after_protected,occurred_at) VALUES(?,?,?,?,?,?,CAST(? AS JSON),?,?,CAST(? AS JSON),CAST(? AS JSON),?)`,
      [scalar('eventId'),scalar('actorUserId'),scalar('impersonatorUserId'),scalar('action'),scalar('resourceType'),scalar('resourceId'),JSON.stringify(event.scope),scalar('reason'),scalar('correlationId'),JSON.stringify(event.beforeProtected ?? null),JSON.stringify(event.afterProtected ?? null),scalar('occurredAt')],
    );
  }
}
