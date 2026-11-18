import { createHash, randomUUID } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import { formatTimestamp } from '@/lib/format';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { recordAudit } from '@/server/audit/record';
import { decryptSecret, encryptSecret, randomOpaqueToken, secretHash, type KeyProvider } from '@/server/security/crypto';
import { isModuleEnabled } from '@/server/supporting/modules';
import { conflict, denied, guarded, invalid, notFound } from '@/server/supporting/results';

type Row = RowDataPacket & Record<string, unknown>;

export type OAuthProviderKey = 'google_calendar' | 'microsoft_calendar';

export interface OAuthProviderConfig {
  readonly key: OAuthProviderKey;
  readonly label: string;
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly revokeUrl: string | null;
  readonly scopes: readonly string[];
  readonly clientId: string;
  readonly clientSecret: string;
  readonly extraAuthorizeParams: Readonly<Record<string, string>>;
}

const LABEL: Readonly<Record<OAuthProviderKey, string>> = { google_calendar: 'Google Calendar', microsoft_calendar: 'Microsoft Outlook Calendar' };

/**
 * A provider is usable only when it is **approved** (listed in
 * `INTEGRATION_APPROVED_PROVIDERS`) and **configured** (its client id and
 * secret are set). Either missing, it does not exist for users — the
 * "when credentials are approved" condition in `BE-0732`.
 */
export function providerConfig(key: string, environment: NodeJS.ProcessEnv = process.env): OAuthProviderConfig | null {
  const approved = (environment.INTEGRATION_APPROVED_PROVIDERS ?? '').split(',').map((value) => value.trim());
  if (!approved.includes(key)) return null;
  if (key === 'google_calendar' && environment.GOOGLE_CALENDAR_CLIENT_ID && environment.GOOGLE_CALENDAR_CLIENT_SECRET) {
    return {
      key, label: LABEL[key], authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth', tokenUrl: 'https://oauth2.googleapis.com/token',
      revokeUrl: 'https://oauth2.googleapis.com/revoke', scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      clientId: environment.GOOGLE_CALENDAR_CLIENT_ID, clientSecret: environment.GOOGLE_CALENDAR_CLIENT_SECRET,
      extraAuthorizeParams: { access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true' },
    };
  }
  if (key === 'microsoft_calendar' && environment.MICROSOFT_CALENDAR_CLIENT_ID && environment.MICROSOFT_CALENDAR_CLIENT_SECRET) {
    const tenant = encodeURIComponent(environment.MICROSOFT_CALENDAR_TENANT ?? 'organizations');
    return {
      key, label: LABEL[key], authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
      tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, revokeUrl: null,
      scopes: ['offline_access', 'Calendars.Read'],
      clientId: environment.MICROSOFT_CALENDAR_CLIENT_ID, clientSecret: environment.MICROSOFT_CALENDAR_CLIENT_SECRET, extraAuthorizeParams: {},
    };
  }
  return null;
}

/** Credentials as stored, encrypted. Never logged, never returned. */
interface StoredCredential { readonly accessToken: string; readonly refreshToken: string | null; readonly expiresAt: string }

export class ProviderError extends Error {
  constructor(readonly code: string, readonly status: number | null, readonly retryable: boolean) { super(code); }
}

export interface IntegrationConnectionView {
  readonly id: string;
  readonly providerKey: string;
  readonly providerLabel: string;
  readonly status: 'active' | 'reauthorization_required' | 'revoked' | 'error';
  readonly lastSyncedAtLabel: string | null;
  readonly lastErrorCode: string | null;
  readonly connectedAtLabel: string;
}

const STATE_TTL_MS = 10 * 60_000;
const stamp = (value: unknown) => formatTimestamp(value instanceof Date ? value.toISOString() : String(value));

/**
 * OAuth connections (`BE-0734`).
 *
 * `begin` stores only the SHA-256 of a random `state` together with an
 * encrypted PKCE verifier, bound to the signed-in user and provider for ten
 * minutes. `callback` accepts the state once — consuming it in a single
 * conditional update — only for that same user, and exchanges the code with
 * the verifier. Tokens are encrypted at rest, refreshed shortly before expiry,
 * and destroyed on disconnect. A refresh the provider refuses marks the
 * connection as needing reauthorization instead of retrying forever.
 */
export class OAuthService {
  constructor(
    private readonly pool: Pool,
    private readonly keys: KeyProvider,
    private readonly options: { readonly fetch?: typeof fetch; readonly now?: () => string; readonly environment?: NodeJS.ProcessEnv; readonly baseUrl?: string } = {},
  ) {}

  private now() { return this.options.now?.() ?? new Date().toISOString(); }
  private config(key: string) { return providerConfig(key, this.options.environment ?? process.env); }
  private redirectUri() { return `${this.options.baseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000'}/api/integrations/oauth/callback`; }
  private get http() { return this.options.fetch ?? fetch; }

  /** Providers this deployment offers right now. */
  availableProviders() {
    return (['google_calendar', 'microsoft_calendar'] as const).flatMap((key) => (this.config(key) ? [{ key, label: LABEL[key] }] : []));
  }

  begin(actor: ActorPolicyContext, providerKey: string): Promise<Result<{ readonly authorizeUrl: string }>> {
    return guarded(async () => {
      if (!(await isModuleEnabled(this.pool, 'integrations'))) return conflict('Integrations are switched off.', 'Ask a Super Administrator to switch them on.');
      if (!actor.employeeId) return denied('Only employees can connect a calendar.');
      const config = this.config(providerKey);
      if (!config) return invalid('provider', 'That calendar provider is not available.', 'Choose one of the providers listed.');
      const state = randomOpaqueToken(32);
      const verifier = randomOpaqueToken(48);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      await this.pool.execute('INSERT INTO oauth_states(id,state_hash,user_id,provider_key,verifier_ciphertext,redirect_uri,expires_at) VALUES(?,?,?,?,?,?,?)',
        [randomUUID(), secretHash(state), actor.userId, config.key, encryptSecret(verifier, this.keys), this.redirectUri(), new Date(Date.parse(this.now()) + STATE_TTL_MS)]);
      const url = new URL(config.authorizeUrl);
      for (const [name, value] of Object.entries({
        client_id: config.clientId, redirect_uri: this.redirectUri(), response_type: 'code', scope: config.scopes.join(' '),
        state, code_challenge: challenge, code_challenge_method: 'S256', ...config.extraAuthorizeParams,
      })) url.searchParams.set(name, value);
      return success({ authorizeUrl: url.toString() });
    });
  }

  callback(actor: ActorPolicyContext, input: { readonly state: string | null; readonly code: string | null; readonly error: string | null }): Promise<Result<IntegrationConnectionView>> {
    return guarded(async () => {
      if (!input.state || input.state.length > 200) return conflict('This sign-in link is not valid.', 'Start connecting the calendar again.');
      const [rows] = await this.pool.execute<Row[]>('SELECT * FROM oauth_states WHERE state_hash=?', [secretHash(input.state)]);
      const row = rows[0];
      // One answer for unknown, someone else's, expired and reused: nothing to learn by probing.
      const refuse = () => conflict('This sign-in link is not valid or has expired.', 'Start connecting the calendar again.');
      if (!row || row.user_id !== actor.userId || new Date(row.expires_at as string | Date).getTime() < Date.parse(this.now())) return refuse();
      const [consumed] = await this.pool.execute<ResultSetHeader>('UPDATE oauth_states SET consumed_at=UTC_TIMESTAMP(6) WHERE id=? AND consumed_at IS NULL', [row.id]);
      if (consumed.affectedRows !== 1) return refuse();
      const config = this.config(String(row.provider_key));
      if (!config) return conflict('That calendar provider is no longer available.', 'Ask an administrator.');
      if (input.error || !input.code) {
        await recordAudit(this.pool, { actorUserId: actor.userId, action: 'integration.connect_declined', resourceType: 'integration_connection', resourceId: null, scope: { provider: config.key } });
        return conflict('The calendar was not connected.', 'Try again and allow read access to your calendar.');
      }
      const tokens = await this.tokenRequest(config, {
        grant_type: 'authorization_code', code: input.code, redirect_uri: String(row.redirect_uri),
        code_verifier: decryptSecret(String(row.verifier_ciphertext), this.keys),
      });
      const credential = encryptSecret(JSON.stringify(tokens.credential), this.keys);
      const [existing] = await this.pool.execute<Row[]>('SELECT id FROM integration_connections WHERE owner_user_id=? AND provider_key=? AND revoked_at IS NULL', [actor.userId, config.key]);
      const id = existing[0] ? String(existing[0].id) : randomUUID();
      if (existing[0]) {
        await this.pool.execute(`UPDATE integration_connections SET credential_ciphertext=?,granted_scopes=?,access_expires_at=?,status='active',
          consecutive_failures=0,last_error_code=NULL,next_sync_at=UTC_TIMESTAMP(6),version=version+1 WHERE id=?`,
        [credential, JSON.stringify(tokens.scopes), new Date(tokens.credential.expiresAt), id]);
      } else {
        await this.pool.execute(`INSERT INTO integration_connections(id,provider_key,owner_user_id,credential_ciphertext,granted_scopes,access_expires_at,sync_settings,status,next_sync_at)
          VALUES(?,?,?,?,?,?,?,'active',UTC_TIMESTAMP(6))`,
        [id, config.key, actor.userId, credential, JSON.stringify(tokens.scopes), new Date(tokens.credential.expiresAt), JSON.stringify({ lookbackDays: 14 })]);
      }
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'integration.connected', resourceType: 'integration_connection', resourceId: id, scope: { provider: config.key }, after: { scopes: tokens.scopes } });
      return success((await this.views(actor, id))[0]);
    });
  }

  private async tokenRequest(config: OAuthProviderConfig, form: Record<string, string>) {
    let response: Response;
    try {
      response = await this.http(config.tokenUrl, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams({ ...form, client_id: config.clientId, client_secret: config.clientSecret }).toString(),
      });
    } catch {
      throw new ProviderError('provider_unreachable', null, true);
    }
    const body = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error?: string };
    if (!response.ok || !body.access_token) {
      const code = body.error === 'invalid_grant' ? 'invalid_grant' : `token_http_${response.status}`;
      throw new ProviderError(code, response.status, response.status >= 500 || response.status === 429);
    }
    return {
      credential: {
        accessToken: body.access_token, refreshToken: body.refresh_token ?? form.refresh_token ?? null,
        expiresAt: new Date(Date.parse(this.now()) + Math.max(60, Number(body.expires_in ?? 3600)) * 1000).toISOString(),
      } satisfies StoredCredential,
      scopes: (body.scope ?? config.scopes.join(' ')).split(/\s+/).filter(Boolean),
    };
  }

  /**
   * A usable access token for a connection, refreshed when it expires within a
   * minute. A refused refresh marks the connection `reauthorization_required`.
   */
  async accessToken(connectionId: string): Promise<string> {
    const [rows] = await this.pool.execute<Row[]>('SELECT provider_key,credential_ciphertext,status FROM integration_connections WHERE id=? AND revoked_at IS NULL', [connectionId]);
    const row = rows[0];
    if (!row?.credential_ciphertext || row.status === 'revoked') throw new ProviderError('connection_unavailable', null, false);
    const config = this.config(String(row.provider_key));
    if (!config) throw new ProviderError('provider_unavailable', null, false);
    const stored = JSON.parse(decryptSecret(String(row.credential_ciphertext), this.keys)) as StoredCredential;
    if (Date.parse(stored.expiresAt) - 60_000 > Date.parse(this.now())) return stored.accessToken;
    if (!stored.refreshToken) {
      await this.pool.execute("UPDATE integration_connections SET status='reauthorization_required',last_error_code='no_refresh_token' WHERE id=?", [connectionId]);
      throw new ProviderError('reauthorization_required', 401, false);
    }
    try {
      const refreshed = await this.tokenRequest(config, { grant_type: 'refresh_token', refresh_token: stored.refreshToken });
      await this.pool.execute('UPDATE integration_connections SET credential_ciphertext=?,access_expires_at=?,version=version+1 WHERE id=?',
        [encryptSecret(JSON.stringify(refreshed.credential), this.keys), new Date(refreshed.credential.expiresAt), connectionId]);
      return refreshed.credential.accessToken;
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        await this.pool.execute("UPDATE integration_connections SET status='reauthorization_required',last_error_code=? WHERE id=?", [error.code, connectionId]);
        throw new ProviderError('reauthorization_required', 401, false);
      }
      throw error;
    }
  }

  /** Revoke at the provider when it supports it, then destroy the stored credential. */
  disconnect(actor: ActorPolicyContext, id: string): Promise<Result<IntegrationConnectionView>> {
    return guarded(async () => {
      const [rows] = await this.pool.execute<Row[]>('SELECT owner_user_id,provider_key,credential_ciphertext FROM integration_connections WHERE id=? AND revoked_at IS NULL', [id]);
      const row = rows[0];
      if (!row || (row.owner_user_id !== actor.userId && !actor.roles.includes('super_admin'))) return notFound('connection');
      const config = this.config(String(row.provider_key));
      if (config?.revokeUrl && row.credential_ciphertext) {
        const stored = JSON.parse(decryptSecret(String(row.credential_ciphertext), this.keys)) as StoredCredential;
        await this.http(config.revokeUrl, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: stored.refreshToken ?? stored.accessToken }).toString() }).catch(() => undefined);
      }
      await this.pool.execute("UPDATE integration_connections SET status='revoked',revoked_at=UTC_TIMESTAMP(6),credential_ciphertext=NULL,next_sync_at=NULL,version=version+1 WHERE id=?", [id]);
      await this.pool.execute("UPDATE calendar_work_drafts SET state='withdrawn',decided_at=UTC_TIMESTAMP(6),version=version+1 WHERE connection_id=? AND state='draft'", [id]);
      await recordAudit(this.pool, { actorUserId: actor.userId, action: 'integration.disconnected', resourceType: 'integration_connection', resourceId: id, scope: { provider: String(row.provider_key) } });
      return success((await this.views(actor, id, true))[0]);
    });
  }

  connections(actor: ActorPolicyContext): Promise<Result<readonly IntegrationConnectionView[]>> {
    return guarded(async () => success(await this.views(actor)));
  }

  private async views(actor: ActorPolicyContext, id?: string, includeRevoked = false): Promise<IntegrationConnectionView[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT c.id,c.provider_key,c.status,c.last_error_code,c.created_at,s.last_synced_at FROM integration_connections c
       LEFT JOIN integration_sync_cursors s ON s.connection_id=c.id
       WHERE (c.owner_user_id=? OR ?) ${id ? 'AND c.id=?' : ''} ${includeRevoked ? '' : 'AND c.revoked_at IS NULL'} ORDER BY c.created_at DESC`,
      // A Super Administrator may act on one named connection; lists stay personal.
      [actor.userId, Boolean(id) && actor.roles.includes('super_admin'), ...(id ? [id] : [])]);
    return rows.map((row) => ({
      id: String(row.id), providerKey: String(row.provider_key), providerLabel: LABEL[String(row.provider_key) as OAuthProviderKey] ?? String(row.provider_key),
      status: String(row.status) as IntegrationConnectionView['status'], lastSyncedAtLabel: row.last_synced_at ? stamp(row.last_synced_at) : null,
      lastErrorCode: row.last_error_code ? String(row.last_error_code) : null, connectedAtLabel: stamp(row.created_at),
    }));
  }
}
