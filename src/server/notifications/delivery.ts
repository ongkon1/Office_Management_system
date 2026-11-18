import { randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { Resend } from 'resend';
import { localParts } from '@/lib/calculation/instants';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { canOpenRelated } from './access';
import { NOTIFICATION_TEMPLATES, canonicalType, relatedFromStored } from './catalogue';

type Row = RowDataPacket & Record<string, unknown>;

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** The delivery id: a provider retry with the same key sends once. */
  readonly idempotencyKey: string;
}

/** A provider failure reduced to a safe code and whether retrying can help. */
export class EmailDeliveryError extends Error {
  constructor(readonly code: string, readonly retryable: boolean) {
    super(code);
  }
}

/** `BE-0012`: the application email port. Providers sit behind it. */
export interface EmailSender {
  send(message: EmailMessage): Promise<{ readonly providerMessageId: string }>;
}

export class ResendEmailSender implements EmailSender {
  private readonly client: Resend;
  constructor(apiKey: string, private readonly from: string) {
    this.client = new Resend(apiKey);
  }
  async send(message: EmailMessage) {
    let response: Awaited<ReturnType<Resend['emails']['send']>>;
    try {
      response = await this.client.emails.send(
        { from: this.from, to: message.to, subject: message.subject, text: message.text },
        { idempotencyKey: message.idempotencyKey },
      );
    } catch {
      throw new EmailDeliveryError('provider_unreachable', true);
    }
    if (response.error || !response.data) {
      const name = String(response.error?.name ?? 'provider_error');
      // Validation and authorization failures will not improve on retry.
      const permanent = /validation|invalid|missing|restricted|not_found|forbidden|unauthori/i.test(name);
      throw new EmailDeliveryError(name, !permanent);
    }
    return { providerMessageId: response.data.id };
  }
}

/** Development and test: keeps messages in memory and delivers nothing. */
export class CaptureEmailSender implements EmailSender {
  readonly messages: EmailMessage[] = [];
  constructor(private readonly failWith: EmailDeliveryError | null = null) {}
  async send(message: EmailMessage) {
    if (this.failWith) throw this.failWith;
    this.messages.push(message);
    return { providerMessageId: `capture-${this.messages.length}` };
  }
}

/**
 * The configured channel, or none. Resend needs both a key and a sender; with
 * neither, deliveries are recorded as skipped rather than silently lost.
 */
export function emailSenderFromEnvironment(environment: NodeJS.ProcessEnv = process.env): EmailSender | null {
  return environment.RESEND_API_KEY && environment.EMAIL_FROM
    ? new ResendEmailSender(environment.RESEND_API_KEY, environment.EMAIL_FROM)
    : null;
}

/** Codes are stored and logged; anything else a provider says is not. */
export const safeErrorCode = (value: unknown) =>
  String(value ?? 'unknown').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'unknown';

export interface DeliveryRunSummary {
  readonly sent: number;
  readonly retried: number;
  readonly deadLettered: number;
  readonly skipped: number;
}

/**
 * Email delivery for in-app notifications (`BE-0704`).
 *
 * Due rows are claimed under `FOR UPDATE SKIP LOCKED` with a lease token, so
 * concurrent workers never take the same row and a crashed worker's rows come
 * back when the lease lapses; every final write is fenced on that token.
 * Before sending, the recipient, their email preference and their access to
 * the related record are all checked again — a notification that was safe to
 * create may no longer be safe to email. Failures retry with exponential
 * backoff and jitter; a permanent failure, or the last attempt, dead-letters
 * the row for manual follow-up. Each attempt is logged in `delivery_attempts`
 * with a safe code only.
 */
export class NotificationDeliveryWorker {
  constructor(
    private readonly pool: Pool,
    private readonly sender: EmailSender | null,
    private readonly options: {
      readonly baseUrl?: string;
      readonly now?: () => string;
      readonly maxAttempts?: number;
      readonly leaseSeconds?: number;
      readonly random?: () => number;
    } = {},
  ) {}

  private now() { return this.options.now?.() ?? new Date().toISOString(); }
  private get maxAttempts() { return this.options.maxAttempts ?? 5; }

  /** Seconds before attempt `n + 1`: 1, 2, 4, 8 … minutes, capped at one hour, ±20%. */
  backoffSeconds(attempt: number) {
    const base = Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1));
    return Math.round(base * (0.8 + 0.4 * (this.options.random ?? Math.random)()));
  }

  async processDue(limit = 50): Promise<DeliveryRunSummary> {
    const summary = { sent: 0, retried: 0, deadLettered: 0, skipped: 0 };
    for (const claim of await this.claim(limit)) {
      const outcome = await this.deliver(claim.id, claim.token);
      summary[outcome] += 1;
    }
    return summary;
  }

  private async claim(limit: number) {
    const now = new Date(this.now());
    const leaseUntil = new Date(now.getTime() + (this.options.leaseSeconds ?? 120) * 1000);
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [rows] = await connection.query<Row[]>(
        `SELECT id FROM notification_deliveries
         WHERE (state='pending' AND next_attempt_at<=?) OR (state='processing' AND lease_until<?)
         ORDER BY next_attempt_at LIMIT ? FOR UPDATE SKIP LOCKED`, [now, now, limit]);
      const claims = rows.map((row) => ({ id: String(row.id), token: randomUUID() }));
      for (const claim of claims) {
        await connection.execute("UPDATE notification_deliveries SET state='processing',lease_token=?,lease_until=? WHERE id=?", [claim.token, leaseUntil, claim.id]);
      }
      await connection.commit();
      return claims;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private async deliver(id: string, token: string): Promise<keyof DeliveryRunSummary> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT d.attempt_count,n.id notification_id,n.notification_type,n.safe_payload,n.related_type,n.related_id,
        u.id user_id,u.email,u.status user_status
       FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id JOIN users u ON u.id=n.recipient_user_id
       WHERE d.id=? AND d.lease_token=?`, [id, token]);
    const row = rows[0];
    if (!row) return 'skipped';
    const type = canonicalType(String(row.notification_type));
    const template = type ? NOTIFICATION_TEMPLATES[type] : null;
    const [preference] = template
      ? await this.pool.execute<Row[]>('SELECT email_enabled FROM notification_preferences WHERE user_id=? AND setting_key=?', [String(row.user_id), template.settingKey])
      : [[] as Row[]];
    const payload = (typeof row.safe_payload === 'string' ? JSON.parse(row.safe_payload) : row.safe_payload) as { title?: string; body?: string; href?: string; relatedDate?: string | null };
    const related = relatedFromStored(row.related_type ? String(row.related_type) : null, row.related_id ? String(row.related_id) : null, payload.relatedDate ?? null);
    const date = localParts(this.now(), 'Asia/Dhaka').date;

    let skip: string | null = null;
    if (!this.sender) skip = 'channel_unconfigured';
    else if (!template || !template.emailEligible) skip = 'type_not_emailed';
    else if (row.user_status !== 'active') skip = 'recipient_inactive';
    else if (!preference[0]?.email_enabled) skip = 'preference_disabled';
    else {
      const actor = await loadActorPolicyContext(this.pool, String(row.user_id), date);
      if (!actor || !related || !(await canOpenRelated(this.pool, actor, related, date))) skip = 'access_revoked';
    }
    const attempt = Number(row.attempt_count) + 1;
    if (skip) {
      await this.finish(id, token, { state: 'skipped', attempt: Number(row.attempt_count), code: skip });
      return 'skipped';
    }

    const started = Date.now();
    const link = `${this.options.baseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000'}${payload.href ?? '/notifications'}`;
    try {
      const sent = await this.sender!.send({
        to: String(row.email),
        subject: `PowerInAI: ${template!.title}`,
        text: `${template!.title}\n\n${template!.body}\n\nOpen it here: ${link}\n\nYou receive this email because email is switched on for this notification type in your settings.`,
        idempotencyKey: id,
      });
      await this.attempt(id, String(row.notification_id), attempt, 'sent', null, sent.providerMessageId, Date.now() - started, null);
      await this.finish(id, token, { state: 'sent', attempt, providerMessageId: sent.providerMessageId });
      return 'sent';
    } catch (error) {
      const failure = error instanceof EmailDeliveryError ? error : new EmailDeliveryError('unexpected_error', true);
      const code = safeErrorCode(failure.code);
      if (failure.retryable && attempt < this.maxAttempts) {
        const next = new Date(Date.parse(this.now()) + this.backoffSeconds(attempt) * 1000);
        await this.attempt(id, String(row.notification_id), attempt, 'retry', code, null, Date.now() - started, next);
        await this.finish(id, token, { state: 'pending', attempt, code, nextAttemptAt: next });
        return 'retried';
      }
      await this.attempt(id, String(row.notification_id), attempt, 'dead_letter', code, null, Date.now() - started, null);
      await this.finish(id, token, { state: 'dead_letter', attempt, code });
      return 'deadLettered';
    }
  }

  private async attempt(deliveryId: string, notificationId: string, attempt: number, state: string, code: string | null, providerMessageId: string | null, durationMs: number, next: Date | null) {
    await this.pool.execute(
      'INSERT INTO delivery_attempts(id,notification_id,delivery_id,channel,provider_message_id,state,attempt_number,next_attempt_at,safe_error_code,duration_ms) VALUES(?,?,?,?,?,?,?,?,?,?)',
      [randomUUID(), notificationId, deliveryId, 'email', providerMessageId, state, attempt, next, code, Math.max(0, durationMs)]);
  }

  private async finish(id: string, token: string, update: { state: 'sent' | 'pending' | 'dead_letter' | 'skipped'; attempt: number; code?: string; providerMessageId?: string; nextAttemptAt?: Date }) {
    const terminal = update.state !== 'pending';
    await this.pool.execute<ResultSetHeader>(
      `UPDATE notification_deliveries SET state=?,attempt_count=?,safe_error_code=?,provider_message_id=COALESCE(?,provider_message_id),
        next_attempt_at=COALESCE(?,next_attempt_at),lease_token=NULL,lease_until=NULL,completed_at=${terminal ? 'UTC_TIMESTAMP(6)' : 'NULL'}
       WHERE id=? AND lease_token=?`,
      [update.state, update.attempt, update.code ?? null, update.providerMessageId ?? null, update.nextAttemptAt ?? null, id, token]);
  }
}
