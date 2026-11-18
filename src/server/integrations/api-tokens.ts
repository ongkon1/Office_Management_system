import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import { hasPermission, type ActorPolicyContext } from '@/server/authorization/policy';
import { recordAudit } from '@/server/audit/record';
import { randomOpaqueToken, secretHash } from '@/server/security/crypto';
import { isModuleEnabled } from '@/server/supporting/modules';
import { conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';

type Row = RowDataPacket & Record<string, unknown>;

/**
 * API scopes (`BE-0730`). A token can never do more than its owner could do
 * interactively: scopes only narrow, and every request still runs as the
 * owner through the ordinary authorization rules.
 */
export const API_SCOPES = ['projects:read', 'tasks:read', 'work-logs:read', 'work-logs:write'] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiTokenView {
  readonly id: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: readonly ApiScope[];
  readonly expiresAtLabel: string;
  readonly lastUsedAtLabel: string | null;
  readonly isRevoked: boolean;
  readonly isExpired: boolean;
}

export interface AuthenticatedToken {
  readonly tokenId: string;
  readonly ownerUserId: string;
  readonly scopes: ReadonlySet<ApiScope>;
}

const TOKEN = /^oms_([A-Za-z0-9_-]{8})_([A-Za-z0-9_-]{43})$/;
const stamp = (value: unknown) => formatTimestamp(value instanceof Date ? value.toISOString() : String(value));

/** Who may manage integrations: a Super Administrator, or a holder of `integration.manage`. */
export const canManageIntegrations = (actor: ActorPolicyContext) => actor.roles.includes('super_admin') || hasPermission(actor, 'integration.manage');

/**
 * Personal API tokens. The secret is shown once at creation; only its SHA-256
 * is stored. A token belongs to the person who created it, expires within a
 * year, can be revoked at any time, and stops working the moment its owner is
 * deactivated or the integrations module is switched off.
 */
export class ApiTokenService {
  constructor(private readonly pool: Pool, private readonly now = () => new Date().toISOString()) {}

  create(actor: ActorPolicyContext, input: { readonly name: string; readonly scopes: readonly string[]; readonly expiresInDays: number }): Promise<Result<{ readonly token: string; readonly view: ApiTokenView }>> {
    return guarded(async () => {
      if (!(await isModuleEnabled(this.pool, 'integrations'))) return conflict('Integrations are switched off.', 'Ask a Super Administrator to switch them on.');
      if (!canManageIntegrations(actor)) return denied('Only an integration administrator can create API tokens.');
      const name = input.name.trim();
      if (!name || name.length > 120) return invalid('name', 'Name the token.', 'Say which system will use it, for example "Payroll sync".');
      const scopes = [...new Set(input.scopes)];
      if (!scopes.length || scopes.some((scope) => !API_SCOPES.includes(scope as ApiScope))) return invalid('scopes', 'Choose at least one supported scope.', `Available scopes: ${API_SCOPES.join(', ')}.`);
      if (!Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 365) return invalid('expiresInDays', 'Choose an expiry between 1 and 365 days.', 'Shorter is safer; renew when it expires.');
      const prefix = randomOpaqueToken(6).slice(0, 8);
      const secret = randomOpaqueToken(32);
      const token = `oms_${prefix}_${secret}`;
      const id = randomUUID();
      const expires = new Date(Date.parse(this.now()) + input.expiresInDays * 86_400_000);
      await this.pool.execute(
        'INSERT INTO api_tokens(id,owner_user_id,name,token_prefix,token_hash,scopes,expires_at,created_by_user_id) VALUES(?,?,?,?,?,?,?,?)',
        [id, actor.userId, name, `oms_${prefix}`, secretHash(token), JSON.stringify(scopes), expires, actor.userId]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'api_token.created', resourceType: 'api_token', resourceId: id, after: { name, scopes, expiresAt: expires.toISOString() } });
      return success({ token, view: (await this.views(actor, id))[0] });
    });
  }

  list(actor: ActorPolicyContext): Promise<Result<readonly ApiTokenView[]>> {
    return guarded(async () => (canManageIntegrations(actor) ? success(await this.views(actor)) : denied('Only an integration administrator can see API tokens.')));
  }

  revoke(actor: ActorPolicyContext, id: string): Promise<Result<ApiTokenView>> {
    return guarded(async () => {
      const [rows] = await this.pool.execute<Row[]>('SELECT owner_user_id,revoked_at FROM api_tokens WHERE id=?', [id]);
      if (!rows[0] || (rows[0].owner_user_id !== actor.userId && !actor.roles.includes('super_admin'))) return notFound('token');
      if (!rows[0].revoked_at) {
        await this.pool.execute('UPDATE api_tokens SET revoked_at=UTC_TIMESTAMP(6) WHERE id=?', [id]);
        await recordAudit(this.pool, { actorUserId: actor.userId, action: 'api_token.revoked', resourceType: 'api_token', resourceId: id });
      }
      return success((await this.views(actor, id))[0]);
    });
  }

  private async views(actor: ActorPolicyContext, id?: string): Promise<ApiTokenView[]> {
    const all = actor.roles.includes('super_admin');
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT id,name,token_prefix,scopes,expires_at,last_used_at,revoked_at FROM api_tokens WHERE ${all ? '1=1' : 'owner_user_id=?'} ${id ? 'AND id=?' : ''} ORDER BY created_at DESC`,
      [...(all ? [] : [actor.userId]), ...(id ? [id] : [])]);
    return rows.map((row) => ({
      id: String(row.id), name: String(row.name), prefix: String(row.token_prefix),
      scopes: (typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes) as ApiScope[],
      expiresAtLabel: stamp(row.expires_at), lastUsedAtLabel: row.last_used_at ? stamp(row.last_used_at) : null,
      isRevoked: Boolean(row.revoked_at), isExpired: new Date(row.expires_at as string | Date).getTime() <= Date.parse(this.now()),
    }));
  }

  /** Resolve a bearer token. Any failure is `null` — the caller answers with one indistinguishable 401. */
  async authenticate(raw: string): Promise<AuthenticatedToken | null> {
    if (!TOKEN.test(raw)) return null;
    const hash = secretHash(raw);
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT t.id,t.owner_user_id,t.token_hash,t.scopes,t.expires_at,t.revoked_at,u.status FROM api_tokens t JOIN users u ON u.id=t.owner_user_id WHERE t.token_hash=?`, [hash]);
    const row = rows[0];
    if (!row || !timingSafeEqual(Buffer.from(String(row.token_hash)), Buffer.from(hash))) return null;
    if (row.revoked_at || row.status !== 'active' || new Date(row.expires_at as string | Date).getTime() <= Date.parse(this.now())) return null;
    if (!(await isModuleEnabled(this.pool, 'integrations'))) return null;
    await this.pool.execute('UPDATE api_tokens SET last_used_at=UTC_TIMESTAMP(6) WHERE id=? AND (last_used_at IS NULL OR last_used_at<DATE_SUB(UTC_TIMESTAMP(6),INTERVAL 1 MINUTE))', [row.id]);
    const scopes = (typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes) as ApiScope[];
    return { tokenId: String(row.id), ownerUserId: String(row.owner_user_id), scopes: new Set(scopes) };
  }

  /**
   * Fixed one-minute windows per token (`BE-0730`). Returns what the client
   * needs for `RateLimit-*` headers. Old windows are pruned as it goes.
   */
  async consume(tokenId: string, limit: number): Promise<{ readonly allowed: boolean; readonly limit: number; readonly remaining: number; readonly resetSeconds: number }> {
    const now = Date.parse(this.now());
    const windowStart = new Date(Math.floor(now / 60_000) * 60_000);
    await this.pool.execute<ResultSetHeader>(
      'INSERT INTO api_rate_windows(token_id,window_start,request_count) VALUES(?,?,1) ON DUPLICATE KEY UPDATE request_count=request_count+1',
      [tokenId, windowStart]);
    const [rows] = await this.pool.execute<Row[]>('SELECT request_count FROM api_rate_windows WHERE token_id=? AND window_start=?', [tokenId, windowStart]);
    await this.pool.execute('DELETE FROM api_rate_windows WHERE token_id=? AND window_start<?', [tokenId, new Date(windowStart.getTime() - 600_000)]);
    const used = Number(rows[0]?.request_count ?? 1);
    return { allowed: used <= limit, limit, remaining: Math.max(0, limit - used), resetSeconds: Math.max(1, Math.ceil((windowStart.getTime() + 60_000 - now) / 1000)) };
  }
}
