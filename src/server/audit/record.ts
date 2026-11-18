import { randomUUID } from 'node:crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { redactProtected } from '@/server/security/redaction';

/**
 * Append one audit event on a given executor — usually the mutation's own
 * transaction, so the evidence and the change commit or roll back together.
 * The same redaction as `AuditWriter`; the table itself is append-only.
 */
export async function recordAudit(
  db: Pick<Pool | PoolConnection, 'execute'>,
  event: {
    readonly actorUserId: string | null;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string | null;
    readonly scope?: Readonly<Record<string, unknown>>;
    readonly reason?: string | null;
    readonly before?: unknown;
    readonly after?: unknown;
    readonly correlationId?: string;
  },
) {
  await db.execute(
    'INSERT INTO audit_events(event_id,actor_user_id,action,resource_type,resource_id,scope_json,reason,correlation_id,before_protected,after_protected) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [
      randomUUID(), event.actorUserId, event.action, event.resourceType, event.resourceId,
      JSON.stringify(event.scope ?? {}), event.reason ?? null, event.correlationId ?? randomUUID(),
      JSON.stringify(redactProtected(event.before ?? null)), JSON.stringify(redactProtected(event.after ?? null)),
    ],
  );
}
