import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { recordAudit } from '@/server/audit/record';
import { canOpenRelated } from '@/server/notifications/access';
import type { RelatedRecord } from '@/server/notifications/catalogue';
import { decryptSecret, encryptSecret, randomOpaqueToken, type KeyProvider } from '@/server/security/crypto';
import { isModuleEnabled } from '@/server/supporting/modules';
import { businessDate, conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';
import { safeErrorCode } from '@/server/notifications/delivery';
import { canManageIntegrations } from './api-tokens';

type Row = RowDataPacket & Record<string, unknown>;
type Executor = Pick<Pool | PoolConnection, 'execute'>;

/**
 * Outbound events (`BE-0731`). The payload names the event and the record —
 * never its content. A receiver fetches what it needs through the API, with
 * the token's own scopes, so a webhook can never deliver more than its owner
 * could read.
 */
export const WEBHOOK_EVENTS = ['work_log.recorded', 'task.status_changed', 'project.changed', 'period.verified'] as const;
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];
const RESOURCE_OF: Readonly<Record<WebhookEventType, string>> = {
  'work_log.recorded': 'work_log', 'task.status_changed': 'task', 'project.changed': 'project', 'period.verified': 'period',
};

export const SIGNATURE_TOLERANCE_SECONDS = 300;
export const ROTATION_OVERLAP_HOURS = 24;
const MAX_ATTEMPTS = 8;
const stamp = (value: unknown) => formatTimestamp(value instanceof Date ? value.toISOString() : String(value));

/**
 * Record an event and queue a delivery for every active endpoint subscribed
 * to it. Call inside the business transaction: a rolled-back change publishes
 * nothing, and the unique `source_key` makes a re-run publish once. Nothing is
 * recorded while the integrations module is off.
 */
export async function publishWebhookEvent(db: Executor, event: { readonly type: WebhookEventType; readonly resourceId: string; readonly sourceKey: string; readonly occurredAt?: string }) {
  if (!(await isModuleEnabled(db, 'integrations'))) return 0;
  const id = randomUUID();
  try {
    await db.execute('INSERT INTO webhook_events(id,event_type,resource_type,resource_id,source_key,occurred_at) VALUES(?,?,?,?,?,?)',
      [id, event.type, RESOURCE_OF[event.type], event.resourceId, event.sourceKey.slice(0, 191), new Date(event.occurredAt ?? Date.now())]);
  } catch (error) {
    if ((error as { errno?: number }).errno === 1062) return 0;
    throw error;
  }
  const [endpoints] = await db.execute<Row[]>('SELECT id,subscribed_events FROM webhook_endpoints WHERE is_active=TRUE');
  let queued = 0;
  for (const endpoint of endpoints) {
    const events = (typeof endpoint.subscribed_events === 'string' ? JSON.parse(endpoint.subscribed_events) : endpoint.subscribed_events) as string[];
    if (!events.includes(event.type)) continue;
    await db.execute("INSERT INTO webhook_deliveries(id,endpoint_id,event_id,state,next_attempt_at) VALUES(?,?,?,'pending',?)", [randomUUID(), endpoint.id, id, new Date(event.occurredAt ?? Date.now())]);
    queued += 1;
  }
  return queued;
}

/** The `X-OMS-Signature` value: one `v1=` per secret currently valid. */
export function signPayload(secrets: readonly string[], timestamp: number, body: string) {
  return secrets.map((secret) => `v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`).join(', ');
}

/**
 * Receiver-side verification, exported for integrators and tests. Rejects a
 * timestamp outside the tolerance (replay protection; receivers should also
 * keep the event id and drop repeats) and any signature that does not match.
 */
export function verifyWebhookSignature(secret: string, header: { readonly timestamp: string | null; readonly signature: string | null }, body: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = SIGNATURE_TOLERANCE_SECONDS) {
  const timestamp = Number(header.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds || !header.signature) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'));
  return header.signature.split(',').map((part) => part.trim()).filter((part) => part.startsWith('v1=')).some((part) => {
    const candidate = Buffer.from(part.slice(3));
    return candidate.length === expected.length && timingSafeEqual(candidate, expected);
  });
}

/** Loopback, private, link-local, carrier-grade NAT and unspecified addresses (SSRF). */
export function isPrivateAddress(address: string) {
  const mapped = address.toLowerCase().startsWith('::ffff:') ? address.slice(7) : address;
  if (isIP(mapped) === 4) {
    const [a, b] = mapped.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = mapped.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb') || v6.startsWith('ff');
}

export interface WebhookEndpointView {
  readonly id: string;
  readonly url: string;
  readonly description: string | null;
  readonly events: readonly WebhookEventType[];
  readonly isActive: boolean;
  readonly disabledReason: string | null;
  readonly secretRotationEndsLabel: string | null;
  readonly createdAtLabel: string;
}

export interface WebhookDeliveryLogView {
  readonly id: string;
  readonly eventType: string;
  readonly state: string;
  readonly attemptCount: number;
  readonly lastResponseCode: number | null;
  readonly lastErrorCode: string | null;
  readonly createdAtLabel: string;
}

export interface WebhookOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => string;
  readonly resolveHost?: (hostname: string) => Promise<readonly string[]>;
  /** Development and tests: allow `http://localhost` receivers. Never in production. */
  readonly allowLocalTargets?: boolean;
  readonly random?: () => number;
  readonly timeoutMs?: number;
}

/**
 * Webhook endpoints and delivery (`BE-0731`).
 *
 * Registration accepts only `https` destinations that resolve to public
 * addresses; the check runs again at each delivery, redirects are never
 * followed, and responses are not stored. Each request is signed with HMAC-SHA256
 * over `timestamp.body`; during a rotation both the new and the previous
 * secret sign, for 24 hours. Delivery claims rows under a lease, re-checks
 * that the endpoint's owner can still open the record, retries 408, 429, 5xx
 * and network failures with exponential backoff and jitter, dead-letters other
 * 4xx responses and the last attempt, and disables an endpoint that answers
 * 410 Gone. Every attempt is logged with a safe code only.
 */
export class WebhookService {
  constructor(private readonly pool: Pool, private readonly keys: KeyProvider, private readonly options: WebhookOptions = {}) {}

  private now() { return this.options.now?.() ?? new Date().toISOString(); }
  private resolve(hostname: string) {
    return this.options.resolveHost?.(hostname) ?? lookup(hostname, { all: true }).then((records) => records.map((record) => record.address));
  }

  /** Throws a safe code when the destination may not be called. */
  private async assertDestination(raw: string) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new Error('invalid_url'); }
    const local = this.options.allowLocalTargets && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !local) throw new Error('https_required');
    if (url.username || url.password) throw new Error('credentials_in_url');
    if (local) return url;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = isIP(host) ? [host] : await this.resolve(host).catch(() => { throw new Error('dns_failed'); });
    if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('blocked_destination');
    return url;
  }

  register(actor: ActorPolicyContext, input: { readonly url: string; readonly events: readonly string[]; readonly description: string }): Promise<Result<{ readonly endpoint: WebhookEndpointView; readonly secret: string }>> {
    return guarded(async () => {
      if (!(await isModuleEnabled(this.pool, 'integrations'))) return conflict('Integrations are switched off.', 'Ask a Super Administrator to switch them on.');
      if (!canManageIntegrations(actor)) return denied('Only an integration administrator can register webhooks.');
      if (input.url.length > 1024) return invalid('url', 'The address is too long.', 'Use an address under 1,024 characters.');
      try { await this.assertDestination(input.url); } catch (error) {
        const code = (error as Error).message;
        return invalid('url', code === 'https_required' ? 'The address must use https.' : code === 'blocked_destination' ? 'The address points to a private or internal network.' : 'The address cannot be used.',
          'Use the public https address your receiving system gives you.');
      }
      const events = [...new Set(input.events)];
      if (!events.length || events.some((event) => !WEBHOOK_EVENTS.includes(event as WebhookEventType))) return invalid('events', 'Choose at least one supported event.', `Available events: ${WEBHOOK_EVENTS.join(', ')}.`);
      if (input.description.length > 240) return invalid('description', 'Keep the description under 240 characters.', 'Say which system receives it.');
      const id = randomUUID();
      const secret = `whsec_${randomOpaqueToken(32)}`;
      await this.pool.execute('INSERT INTO webhook_endpoints(id,owner_user_id,target_url,secret_ciphertext,subscribed_events,description) VALUES(?,?,?,?,?,?)',
        [id, actor.userId, input.url, encryptSecret(secret, this.keys), JSON.stringify(events), input.description.trim() || null]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'webhook.registered', resourceType: 'webhook_endpoint', resourceId: id, after: { host: new URL(input.url).host, events } });
      return success({ endpoint: (await this.views(actor, id))[0], secret });
    });
  }

  list(actor: ActorPolicyContext): Promise<Result<readonly WebhookEndpointView[]>> {
    return guarded(async () => (canManageIntegrations(actor) ? success(await this.views(actor)) : denied('Only an integration administrator can see webhooks.')));
  }

  private async owned(actor: ActorPolicyContext, id: string) {
    const [rows] = await this.pool.execute<Row[]>('SELECT * FROM webhook_endpoints WHERE id=?', [id]);
    const row = rows[0];
    return row && (row.owner_user_id === actor.userId || actor.roles.includes('super_admin')) && canManageIntegrations(actor) ? row : null;
  }

  /** New secret now; the old one keeps signing for 24 hours so receivers can switch over. */
  rotateSecret(actor: ActorPolicyContext, id: string): Promise<Result<{ readonly endpoint: WebhookEndpointView; readonly secret: string }>> {
    return guarded(async () => {
      const row = await this.owned(actor, id);
      if (!row) return notFound('webhook');
      const secret = `whsec_${randomOpaqueToken(32)}`;
      const overlap = new Date(Date.parse(this.now()) + ROTATION_OVERLAP_HOURS * 3_600_000);
      await this.pool.execute('UPDATE webhook_endpoints SET previous_secret_ciphertext=secret_ciphertext,previous_secret_expires_at=?,secret_ciphertext=?,version=version+1 WHERE id=?',
        [overlap, encryptSecret(secret, this.keys), id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'webhook.secret_rotated', resourceType: 'webhook_endpoint', resourceId: id });
      return success({ endpoint: (await this.views(actor, id))[0], secret });
    });
  }

  setActive(actor: ActorPolicyContext, id: string, active: boolean): Promise<Result<WebhookEndpointView>> {
    return guarded(async () => {
      const row = await this.owned(actor, id);
      if (!row) return notFound('webhook');
      await this.pool.execute('UPDATE webhook_endpoints SET is_active=?,disabled_reason=?,version=version+1 WHERE id=?', [active, active ? null : 'disabled_by_owner', id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: active ? 'webhook.enabled' : 'webhook.disabled', resourceType: 'webhook_endpoint', resourceId: id });
      return success((await this.views(actor, id))[0]);
    });
  }

  /** Recent deliveries for one endpoint — states and safe codes only. */
  deliveries(actor: ActorPolicyContext, id: string): Promise<Result<readonly WebhookDeliveryLogView[]>> {
    return guarded(async () => {
      if (!(await this.owned(actor, id))) return notFound('webhook');
      const [rows] = await this.pool.execute<Row[]>(
        `SELECT d.id,e.event_type,d.state,d.attempt_count,d.response_code,d.safe_error_code,d.created_at FROM webhook_deliveries d
         JOIN webhook_events e ON e.id=d.event_id WHERE d.endpoint_id=? ORDER BY d.created_at DESC LIMIT 100`, [id]);
      return success(rows.map((row) => ({
        id: String(row.id), eventType: String(row.event_type), state: String(row.state), attemptCount: Number(row.attempt_count),
        lastResponseCode: row.response_code == null ? null : Number(row.response_code), lastErrorCode: row.safe_error_code ? String(row.safe_error_code) : null,
        createdAtLabel: stamp(row.created_at),
      })));
    });
  }

  private async views(actor: ActorPolicyContext, id?: string): Promise<WebhookEndpointView[]> {
    const all = actor.roles.includes('super_admin');
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT id,target_url,description,subscribed_events,is_active,disabled_reason,previous_secret_expires_at,created_at FROM webhook_endpoints
       WHERE ${all ? '1=1' : 'owner_user_id=?'} ${id ? 'AND id=?' : ''} ORDER BY created_at DESC`,
      [...(all ? [] : [actor.userId]), ...(id ? [id] : [])]);
    const now = Date.parse(this.now());
    return rows.map((row) => ({
      id: String(row.id), url: String(row.target_url), description: row.description ? String(row.description) : null,
      events: (typeof row.subscribed_events === 'string' ? JSON.parse(row.subscribed_events) : row.subscribed_events) as WebhookEventType[],
      isActive: Boolean(row.is_active), disabledReason: row.disabled_reason ? String(row.disabled_reason) : null,
      secretRotationEndsLabel: row.previous_secret_expires_at && new Date(row.previous_secret_expires_at as string | Date).getTime() > now ? stamp(row.previous_secret_expires_at) : null,
      createdAtLabel: stamp(row.created_at),
    }));
  }

  backoffSeconds(attempt: number) {
    const base = Math.min(6 * 3600, 30 * 2 ** Math.max(0, attempt - 1));
    return Math.round(base * (0.8 + 0.4 * (this.options.random ?? Math.random)()));
  }

  /** Worker entry point: deliver what is due. */
  async deliverDue(limit = 25) {
    const summary = { delivered: 0, retried: 0, deadLettered: 0, skipped: 0 };
    const now = new Date(this.now());
    const connection = await this.pool.getConnection();
    let claims: { id: string; token: string }[] = [];
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<Row[]>(
        `SELECT id FROM webhook_deliveries WHERE (state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_until<?)
         ORDER BY next_attempt_at LIMIT ? FOR UPDATE SKIP LOCKED`, [now, now, limit]);
      claims = rows.map((row) => ({ id: String(row.id), token: randomUUID() }));
      for (const claim of claims) {
        await connection.execute("UPDATE webhook_deliveries SET state='processing',lease_token=?,lease_until=? WHERE id=?", [claim.token, new Date(now.getTime() + 120_000), claim.id]);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
    for (const claim of claims) summary[await this.deliverOne(claim.id, claim.token)] += 1;
    return summary;
  }

  private async relatedOf(resourceType: string, resourceId: string): Promise<RelatedRecord | null> {
    if (resourceType === 'task' || resourceType === 'project' || resourceType === 'period') return { type: resourceType, id: resourceId };
    if (resourceType === 'work_log') {
      const [rows] = await this.pool.execute<Row[]>('SELECT employee_id,work_date FROM time_entries WHERE id=?', [resourceId]);
      if (!rows[0]) return null;
      const date = rows[0].work_date instanceof Date ? rows[0].work_date.toISOString().slice(0, 10) : String(rows[0].work_date).slice(0, 10);
      return { type: 'timesheet', employeeId: String(rows[0].employee_id), date };
    }
    return null;
  }

  private async deliverOne(id: string, token: string): Promise<'delivered' | 'retried' | 'deadLettered' | 'skipped'> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT d.attempt_count,w.id endpoint_id,w.owner_user_id,w.target_url,w.is_active,w.secret_ciphertext,w.previous_secret_ciphertext,w.previous_secret_expires_at,
        e.id event_id,e.event_type,e.resource_type,e.resource_id,e.occurred_at
       FROM webhook_deliveries d JOIN webhook_endpoints w ON w.id=d.endpoint_id JOIN webhook_events e ON e.id=d.event_id WHERE d.id=? AND d.lease_token=?`, [id, token]);
    const row = rows[0];
    if (!row) return 'skipped';
    const attempt = Number(row.attempt_count) + 1;
    const finish = async (state: string, code: string | null, responseCode: number | null, next: Date | null) => {
      await this.pool.execute(
        `UPDATE webhook_deliveries SET state=?,attempt_count=?,safe_error_code=?,response_code=?,next_attempt_at=COALESCE(?,next_attempt_at),
          delivered_at=${state === 'delivered' ? 'UTC_TIMESTAMP(6)' : 'delivered_at'},lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?`,
        [state, state === 'skipped' ? Number(row.attempt_count) : attempt, code, responseCode, next, id, token]);
    };
    // The owner must still be active, still an integration manager, and still able to open the record.
    const date = businessDate(this.now());
    const owner = await loadActorPolicyContext(this.pool, String(row.owner_user_id), date);
    const related = await this.relatedOf(String(row.resource_type), String(row.resource_id));
    if (!row.is_active) { await finish('skipped', 'endpoint_disabled', null, null); return 'skipped'; }
    if (!owner || !canManageIntegrations(owner) || !related || !(await canOpenRelated(this.pool, owner, related, date))) {
      await finish('skipped', 'access_revoked', null, null);
      return 'skipped';
    }
    const body = JSON.stringify({
      id: String(row.event_id), type: String(row.event_type), apiVersion: '1',
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
      data: { resourceType: String(row.resource_type), resourceId: String(row.resource_id) },
    });
    const secrets = [decryptSecret(String(row.secret_ciphertext), this.keys)];
    if (row.previous_secret_ciphertext && new Date(row.previous_secret_expires_at as string | Date).getTime() > Date.parse(this.now())) {
      secrets.push(decryptSecret(String(row.previous_secret_ciphertext), this.keys));
    }
    const timestamp = Math.floor(Date.parse(this.now()) / 1000);
    const started = Date.now();
    let responseCode: number | null = null;
    let code: string | null = null;
    try {
      await this.assertDestination(String(row.target_url));
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
      try {
        const response = await (this.options.fetch ?? fetch)(String(row.target_url), {
          method: 'POST', body, redirect: 'manual', signal: controller.signal,
          headers: {
            'content-type': 'application/json', 'user-agent': 'PowerInAI-Webhooks/1.0',
            'x-oms-event-id': String(row.event_id), 'x-oms-event-type': String(row.event_type),
            'x-oms-timestamp': String(timestamp), 'x-oms-signature': signPayload(secrets, timestamp, body),
          },
        });
        responseCode = response.status;
        await response.body?.cancel().catch(() => undefined);
      } finally {
        clearTimeout(timer);
      }
    } catch (error) {
      const message = (error as Error).message;
      code = ['https_required', 'blocked_destination', 'dns_failed', 'invalid_url', 'credentials_in_url'].includes(message) ? message
        : (error as Error).name === 'AbortError' ? 'timeout' : 'network_error';
    }
    await this.pool.execute('INSERT INTO webhook_delivery_attempts(id,delivery_id,attempt_number,response_code,safe_error_code,duration_ms) VALUES(?,?,?,?,?,?)',
      [randomUUID(), id, attempt, responseCode, code ? safeErrorCode(code) : responseCode && responseCode >= 300 ? `http_${responseCode}` : null, Math.max(0, Date.now() - started)]);
    if (responseCode !== null && responseCode >= 200 && responseCode < 300) {
      await finish('delivered', null, responseCode, null);
      return 'delivered';
    }
    if (responseCode === 410) {
      await this.pool.execute("UPDATE webhook_endpoints SET is_active=FALSE,disabled_reason='gone',version=version+1 WHERE id=?", [row.endpoint_id]);
      await finish('dead_letter', 'http_410', responseCode, null);
      return 'deadLettered';
    }
    const permanent = code === 'blocked_destination' || code === 'https_required' || code === 'invalid_url' || code === 'credentials_in_url'
      || (responseCode !== null && responseCode >= 300 && responseCode < 500 && responseCode !== 408 && responseCode !== 429);
    if (!permanent && attempt < MAX_ATTEMPTS) {
      await finish('pending', code ?? `http_${responseCode}`, responseCode, new Date(Date.parse(this.now()) + this.backoffSeconds(attempt) * 1000));
      return 'retried';
    }
    await finish('dead_letter', code ?? `http_${responseCode}`, responseCode, null);
    return 'deadLettered';
  }
}

