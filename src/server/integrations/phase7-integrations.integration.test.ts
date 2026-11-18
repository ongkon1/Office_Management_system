import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { decryptSecret } from '@/server/security/crypto';
import { handleIntegrationsRequest } from '@/server/supporting/routes';
import { createSupportingServices } from '@/server/supporting/composition';
import { CRM, CRM_TASK, EMPLOYEE, GOV_PORTAL, POWERINAI, USER, WORK_DATE, data, phase7Database } from '@/server/test/phase7-fixture';
import { ApiTokenService } from './api-tokens';
import { handleApiV1 } from './api/http';
import { CalendarSyncService, type CalendarEvent, type CalendarProvider } from './calendar';
import { integrationKeyProvider } from './keys';
import { OAuthService } from './oauth';
import { WebhookService, publishWebhookEvent, verifyWebhookSignature } from './webhooks';

let env: Awaited<ReturnType<typeof phase7Database>>;
const NOW = () => '2026-10-04T04:00:00.000Z';
const keys = integrationKeyProvider({ NODE_ENV: 'test', BETTER_AUTH_SECRET: 'x'.repeat(40) } as NodeJS.ProcessEnv);
let admin: ActorPolicyContext, lead: ActorPolicyContext, employee: ActorPolicyContext;

beforeAll(async () => {
  env = await phase7Database();
  // Integration management is a per-user grant, the way production gives it.
  await env.grant(3, 'integration.manage');
  [admin, lead, employee] = await Promise.all([1, 2, 3].map((n) => env.actor(n)));
});
afterAll(async () => { await env?.close(); });

const call = (token: string, path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
  handleApiV1(new Request(`http://localhost:3000/api/v1/${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } }), path.split('?')[0].split('/'), env.pool, { now: NOW });

describe('BE-0730: versioned REST API conventions', () => {
  let token: string;

  it('issues tokens only while integrations are on, to an integration manager, once', async () => {
    const tokens = new ApiTokenService(env.pool, NOW);
    expect((await tokens.create(employee, { name: 'Sync', scopes: ['projects:read'], expiresInDays: 30 })).status).toBe('conflict');
    await env.enableModule('integrations');
    expect((await tokens.create(lead, { name: 'Sync', scopes: ['projects:read'], expiresInDays: 30 })).status).toBe('permission_denied');
    expect((await tokens.create(employee, { name: 'Sync', scopes: ['admin:everything'], expiresInDays: 30 })).status).toBe('validation_failure');
    const created = data(await tokens.create(employee, { name: 'Timesheet sync', scopes: ['projects:read', 'work-logs:read', 'work-logs:write'], expiresInDays: 30 }));
    token = created.token;
    expect(token).toMatch(/^oms_/);
    expect(JSON.stringify(await env.rows('SELECT * FROM api_tokens'))).not.toContain(token);
    expect(JSON.stringify(data(await tokens.list(employee)))).not.toContain(token);
  });

  it('authenticates, scopes and paginates with one error envelope', async () => {
    const unauthorized = await call('oms_invalid', 'projects');
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED', requestId: expect.any(String) } });
    const missingScope = await call(token, 'tasks');
    expect(missingScope.status).toBe(403);
    expect((await missingScope.json()).error.code).toBe('INSUFFICIENT_SCOPE');
    expect((await call(token, 'nope')).status).toBe(404);
    const first = await call(token, 'projects?limit=1');
    expect(first.status).toBe(200);
    expect(first.headers.get('api-version')).toBe('1');
    expect(first.headers.get('ratelimit-limit')).toBe('120');
    const page = await first.json() as { data: { id: string }[]; page: { nextCursor: string | null } };
    expect(page.data).toHaveLength(1);
    expect(page.page.nextCursor).toEqual(expect.any(String));
    const second = await (await call(token, `projects?limit=1&cursor=${page.page.nextCursor}`)).json() as { data: { id: string }[] };
    expect(second.data[0].id > page.data[0].id).toBe(true);
    expect((await call(token, 'projects?cursor=!!!')).status).toBe(422);
    expect((await call(token, 'projects?limit=1000')).status).toBe(422);
    // The owner cannot see government projects, so neither can the token.
    const all = await (await call(token, 'projects?limit=100')).json() as { data: { id: string }[] };
    expect(all.data.map((project) => project.id)).not.toContain(GOV_PORTAL);
  });

  it('rate-limits per token with Retry-After', async () => {
    const limited = data(await new ApiTokenService(env.pool, NOW).create(employee, { name: 'Burst', scopes: ['projects:read'], expiresInDays: 1 })).token;
    const burst = (path: string) => handleApiV1(new Request(`http://localhost:3000/api/v1/${path}`, { headers: { authorization: `Bearer ${limited}` } }), [path], env.pool, { now: NOW, rateLimit: 2 });
    expect((await burst('projects')).status).toBe(200);
    expect((await burst('projects')).status).toBe(200);
    const third = await burst('projects');
    expect(third.status).toBe(429);
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('stops a revoked token at once', async () => {
    const tokens = new ApiTokenService(env.pool, NOW);
    const created = data(await tokens.create(employee, { name: 'Temp', scopes: ['projects:read'], expiresInDays: 1 }));
    data(await tokens.revoke(employee, created.view.id));
    expect((await call(created.token, 'projects')).status).toBe(401);
  });

  it('BE-0736: an external write is an ordinary, idempotent work-log save', async () => {
    const body = (overrides: Record<string, unknown> = {}) => JSON.stringify({
      workDate: WORK_DATE, divisionId: POWERINAI, projectId: CRM, taskId: CRM_TASK, durationMinutes: 90, workLocation: 'office',
      workDescription: 'Synced from tracker', completedWork: 'API endpoint done', ...overrides,
    });
    const post = (key: string, payload: string) => call(token, 'work-logs', { method: 'POST', body: payload, headers: { 'idempotency-key': key, 'content-type': 'application/json' } });
    expect((await post('', body())).status).toBe(422);
    const created = await post('sync-0001', body());
    expect(created.status).toBe(201);
    const { data: log } = await created.json() as { data: { id: string } };
    expect(await env.rows('SELECT source,active_minutes FROM time_entries WHERE id=?', [log.id])).toEqual([{ source: 'imported', active_minutes: 90 }]);
    const replay = await (await post('sync-0001', body())).json() as { data: { id: string } };
    expect(replay.data.id).toBe(log.id);
    expect((await post('sync-0001', body({ durationMinutes: 30 }))).status).toBe(409);
    // The same rules as typed entry: a pending task, a locked period, a 24-hour day.
    const pending = randomUUID();
    await env.pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state) VALUES(?,?,?,'Not started','pending',?,?,'team_lead','not_required')", [pending, CRM, POWERINAI, EMPLOYEE(3), EMPLOYEE(2)]);
    expect((await post('sync-0002', body({ taskId: pending }))).status).toBe(422);
    expect((await post('sync-0003', body({ workDate: '2026-08-31' }))).status).toBe(409);
    expect((await post('sync-0004', body({ durationMinutes: 1400 }))).status).toBe(422);
    expect((await env.rows("SELECT action FROM audit_events WHERE resource_id=? AND action='time.create'", [log.id]))).toHaveLength(1);
    const read = await (await call(token, `work-logs?from=${WORK_DATE}&to=${WORK_DATE}`)).json() as { data: { id: string; source: string }[] };
    expect(read.data.find((item) => item.id === log.id)?.source).toBe('imported');
  });
});

describe('BE-0731: webhooks', () => {
  const received: { url: string; headers: Record<string, string>; body: string }[] = [];
  let respond = 200;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    received.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    return new Response(null, { status: respond });
  }) as unknown as typeof fetch;
  const service = () => new WebhookService(env.pool, keys, { fetch: fakeFetch, now: NOW, allowLocalTargets: true, random: () => 0.5, resolveHost: async () => ['93.184.216.34'] });
  let secret: string;
  let endpointId: string;

  it('accepts only public https destinations', async () => {
    for (const url of ['http://example.com/hook', 'https://10.0.0.5/hook', 'https://[::1]/hook', 'https://user:pass@example.com/hook']) {
      expect((await service().register(employee, { url, events: ['work_log.recorded'], description: '' })).status, url).toBe('validation_failure');
    }
    const internal = new WebhookService(env.pool, keys, { resolveHost: async () => ['192.168.0.10'] });
    expect((await internal.register(employee, { url: 'https://hooks.internal.example/x', events: ['work_log.recorded'], description: '' })).status).toBe('validation_failure');
    const registered = data(await service().register(employee, { url: 'https://receiver.example/hook', events: ['work_log.recorded', 'project.changed'], description: 'Tracker' }));
    secret = registered.secret;
    endpointId = registered.endpoint.id;
    const [row] = await env.rows('SELECT secret_ciphertext FROM webhook_endpoints WHERE id=?', [endpointId]);
    expect(String(row.secret_ciphertext)).not.toContain(secret);
    expect(decryptSecret(String(row.secret_ciphertext), keys)).toBe(secret);
  });

  it('publishes once per source, signs the delivery and carries no record content', async () => {
    const [entry] = await env.rows("SELECT id FROM time_entries WHERE source='imported' LIMIT 1");
    expect(await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'manual-test-1' })).toBe(1);
    expect(await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'manual-test-1' })).toBe(0);
    received.length = 0;
    const summary = await service().deliverDue();
    expect(summary.delivered).toBeGreaterThanOrEqual(1);
    const request = received.find((item) => JSON.parse(item.body).data.resourceId === entry.id)!;
    expect(verifyWebhookSignature(secret, { timestamp: request.headers['x-oms-timestamp'], signature: request.headers['x-oms-signature'] }, request.body, Math.floor(Date.parse(NOW()) / 1000))).toBe(true);
    expect(request.body).not.toContain('Synced from tracker');
    expect(JSON.parse(request.body)).toMatchObject({ type: 'work_log.recorded', data: { resourceType: 'work_log' } });
  });

  it('the API work-log write published its event in the same transaction', async () => {
    expect((await env.rows("SELECT id FROM webhook_events WHERE event_type='work_log.recorded' AND source_key LIKE 'work_log:%'")).length).toBeGreaterThanOrEqual(1);
  });

  it('retries server errors with backoff, dead-letters client errors, and disables a gone endpoint', async () => {
    const [entry] = await env.rows("SELECT id FROM time_entries WHERE source='imported' LIMIT 1");
    respond = 503;
    await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'retry-test' });
    await service().deliverDue();
    const [retry] = await env.rows("SELECT d.state,d.attempt_count,d.next_attempt_at FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.source_key='retry-test'");
    expect(retry).toMatchObject({ state: 'pending', attempt_count: 1 });
    expect(new Date(retry.next_attempt_at).getTime()).toBeGreaterThan(Date.parse(NOW()));
    respond = 400;
    await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'client-error' });
    await service().deliverDue();
    expect((await env.rows("SELECT d.state FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.source_key='client-error'"))[0].state).toBe('dead_letter');
    respond = 410;
    await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'gone' });
    await service().deliverDue();
    expect((await env.rows('SELECT is_active,disabled_reason FROM webhook_endpoints WHERE id=?', [endpointId]))[0]).toMatchObject({ is_active: 0, disabled_reason: 'gone' });
    expect((await env.rows('SELECT safe_error_code FROM webhook_delivery_attempts WHERE safe_error_code IS NOT NULL')).map((row) => row.safe_error_code)).toEqual(expect.arrayContaining(['http_503', 'http_400', 'http_410']));
    respond = 200;
    data(await service().setActive(employee, endpointId, true));
  });

  it('skips an event the endpoint owner can no longer open', async () => {
    await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'project.changed', resourceId: GOV_PORTAL, sourceKey: 'gov-project' });
    await service().deliverDue();
    expect((await env.rows("SELECT d.state,d.safe_error_code FROM webhook_deliveries d JOIN webhook_events e ON e.id=d.event_id WHERE e.source_key='gov-project'"))[0])
      .toMatchObject({ state: 'skipped', safe_error_code: 'access_revoked' });
  });

  it('rotates the secret with an overlap: both sign until the old one expires', async () => {
    const rotated = data(await service().rotateSecret(employee, endpointId));
    expect(rotated.endpoint.secretRotationEndsLabel).toEqual(expect.any(String));
    const [entry] = await env.rows("SELECT id FROM time_entries WHERE source='imported' LIMIT 1");
    await publishWebhookEvent(env.pool, { occurredAt: NOW(), type: 'work_log.recorded', resourceId: String(entry.id), sourceKey: 'after-rotation' });
    received.length = 0;
    await service().deliverDue();
    const request = received[0];
    const header = { timestamp: request.headers['x-oms-timestamp'], signature: request.headers['x-oms-signature'] };
    const at = Math.floor(Date.parse(NOW()) / 1000);
    expect(verifyWebhookSignature(rotated.secret, header, request.body, at)).toBe(true);
    expect(verifyWebhookSignature(secret, header, request.body, at)).toBe(true);
  });
});

describe('BE-0732 to BE-0734: OAuth and calendar drafts', () => {
  const environment = { INTEGRATION_APPROVED_PROVIDERS: 'google_calendar', GOOGLE_CALENDAR_CLIENT_ID: 'client', GOOGLE_CALENDAR_CLIENT_SECRET: 'secret' } as unknown as NodeJS.ProcessEnv;
  let tokenResponse: () => Response = () => Response.json({ access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.readonly' });
  const fakeFetch = (async () => tokenResponse()) as unknown as typeof fetch;
  let events: CalendarEvent[] = [];
  let providerFails: number | null = null;
  const provider: CalendarProvider = { listEvents: async () => { if (providerFails) throw new (await import('./oauth')).ProviderError(`events_http_${providerFails}`, providerFails, providerFails >= 500); return events; } };
  const sync = () => new CalendarSyncService(env.pool, new OAuthService(env.pool, keys, { fetch: fakeFetch, now: NOW, environment }), { google_calendar: provider }, NOW);
  let connectionId: string;
  const begin = async (actor: ActorPolicyContext) => new URL(data(await new OAuthService(env.pool, keys, { fetch: fakeFetch, now: NOW, environment }).begin(actor, 'google_calendar')).authorizeUrl).searchParams.get('state')!;
  const callback = (actor: ActorPolicyContext, state: string) => new OAuthService(env.pool, keys, { fetch: fakeFetch, now: NOW, environment }).callback(actor, { state, code: 'auth-code', error: null });

  it('offers only an approved, configured provider, with PKCE', async () => {
    expect((await new OAuthService(env.pool, keys, { environment: {} as NodeJS.ProcessEnv }).begin(employee, 'google_calendar')).status).toBe('validation_failure');
    const url = new URL(data(await new OAuthService(env.pool, keys, { now: NOW, environment }).begin(employee, 'google_calendar')).authorizeUrl);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/calendar.readonly');
    expect(await env.rows('SELECT id FROM oauth_states WHERE state_hash=?', [url.searchParams.get('state')!])).toHaveLength(0);
  });

  it('accepts a state once, only for the person who started it, and encrypts the tokens', async () => {
    const stolen = await begin(employee);
    expect((await callback(lead, stolen)).status).toBe('conflict');
    const state = await begin(employee);
    const connection = data(await callback(employee, state));
    connectionId = connection.id;
    expect(connection).toMatchObject({ providerKey: 'google_calendar', status: 'active' });
    expect((await callback(employee, state)).status).toBe('conflict');
    const [row] = await env.rows('SELECT credential_ciphertext FROM integration_connections WHERE id=?', [connectionId]);
    expect(String(row.credential_ciphertext)).not.toContain('access-1');
    expect(String(row.credential_ciphertext)).not.toContain('refresh-1');
  });

  it('turns events into employee-only drafts that change no totals', async () => {
    events = [
      { id: 'ev-1', changeKey: 'v1', start: '2026-10-04T03:00:00Z', end: '2026-10-04T04:30:00Z', allDay: false, title: 'Sprint planning', cancelled: false, declined: false },
      { id: 'ev-2', changeKey: 'v1', start: '2026-10-04T05:00:00Z', end: '2026-10-04T05:30:00Z', allDay: false, title: 'Declined sync', cancelled: false, declined: true },
      { id: 'ev-3', changeKey: 'v1', start: '2026-10-03T00:00:00Z', end: '2026-10-04T00:00:00Z', allDay: true, title: 'Holiday', cancelled: false, declined: false },
    ];
    const [beforeEntries] = await env.rows('SELECT COUNT(*) n,COALESCE(SUM(active_minutes),0) minutes FROM time_entries WHERE employee_id=?', [EMPLOYEE(3)]);
    const [beforeSummaries] = await env.rows('SELECT COUNT(*) n FROM daily_summaries WHERE employee_id=?', [EMPLOYEE(3)]);
    expect(await sync().sync(connectionId)).toMatchObject({ outcome: 'synced', drafts: 1 });
    const drafts = data(await sync().drafts(employee));
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ workDate: '2026-10-04', proposed: { minutes: 90 }, suggestedDescription: 'Calendar: Sprint planning' });
    expect(data(await sync().drafts(lead))).toHaveLength(0);
    const [afterEntries] = await env.rows('SELECT COUNT(*) n,COALESCE(SUM(active_minutes),0) minutes FROM time_entries WHERE employee_id=?', [EMPLOYEE(3)]);
    const [afterSummaries] = await env.rows('SELECT COUNT(*) n FROM daily_summaries WHERE employee_id=?', [EMPLOYEE(3)]);
    expect(afterEntries).toEqual(beforeEntries);
    expect(afterSummaries).toEqual(beforeSummaries);
    expect(await sync().sync(connectionId)).toMatchObject({ outcome: 'synced', drafts: 0 });
  });

  it('confirms a draft only through the work-log rules, exactly once', async () => {
    const [draft] = data(await sync().drafts(employee));
    const input = { divisionId: POWERINAI, projectId: CRM, taskId: CRM_TASK, durationMinutes: 75, workLocation: 'office' as const, workDescription: 'Sprint planning', completedWork: 'Plan agreed', overtimeReason: null, criticalExplanation: null, expectedVersion: draft.version };
    const pending = randomUUID();
    await env.pool.execute("INSERT INTO tasks(id,project_id,division_id,title,status,assignee_employee_id,creator_employee_id,creator_role,review_state) VALUES(?,?,?,'Later','pending',?,?,'team_lead','not_required')", [pending, CRM, POWERINAI, EMPLOYEE(3), EMPLOYEE(2)]);
    expect((await sync().confirm(employee, draft.id, { ...input, taskId: pending })).status).toBe('validation_failure');
    expect((await sync().confirm(lead, draft.id, input)).status).toBe('not_found');
    const confirmed = data(await sync().confirm(employee, draft.id, input));
    expect(await env.rows('SELECT source,active_minutes,employee_id FROM time_entries WHERE id=?', [confirmed.workLogId])).toEqual([{ source: 'imported', active_minutes: 75, employee_id: EMPLOYEE(3) }]);
    expect(data(await sync().confirm(employee, draft.id, input)).workLogId).toBe(confirmed.workLogId);
    expect(await env.rows("SELECT id FROM time_entries WHERE idempotency_key=?", [`calendar-draft:${draft.id}`])).toHaveLength(1);
    // A later edit to the event never revives a confirmed draft.
    events = [{ ...events[0], changeKey: 'v2', end: '2026-10-04T06:00:00Z' }];
    await sync().sync(connectionId);
    expect((await env.rows('SELECT state,proposed_minutes FROM calendar_work_drafts WHERE id=?', [draft.id]))[0]).toMatchObject({ state: 'confirmed', proposed_minutes: 90 });
  });

  it('withdraws drafts whose event disappeared, and lets an employee dismiss one', async () => {
    events = [{ id: 'ev-9', changeKey: 'v1', start: '2026-10-03T03:00:00Z', end: '2026-10-03T04:00:00Z', allDay: false, title: 'Review', cancelled: false, declined: false }];
    await sync().sync(connectionId);
    const [draft] = data(await sync().drafts(employee));
    expect((await sync().dismiss(employee, draft.id, draft.version + 5)).status).toBe('conflict');
    data(await sync().dismiss(employee, draft.id, draft.version));
    events = [{ id: 'ev-10', changeKey: 'v1', start: '2026-10-03T05:00:00Z', end: '2026-10-03T06:00:00Z', allDay: false, title: 'Will vanish', cancelled: false, declined: false }];
    await sync().sync(connectionId);
    events = [];
    expect(await sync().sync(connectionId)).toMatchObject({ withdrawn: 1 });
  });

  it('backs off on provider failure, and asks for reauthorization when access is refused', async () => {
    providerFails = 503;
    expect(await sync().sync(connectionId)).toMatchObject({ outcome: 'failed' });
    const [failed] = await env.rows('SELECT consecutive_failures,last_error_code,next_sync_at FROM integration_connections WHERE id=?', [connectionId]);
    expect(failed).toMatchObject({ consecutive_failures: 1, last_error_code: 'events_http_503' });
    expect(new Date(failed.next_sync_at).getTime()).toBeGreaterThan(Date.parse(NOW()));
    providerFails = 401;
    expect(await sync().sync(connectionId)).toMatchObject({ outcome: 'reauthorization_required' });
    providerFails = null;
  });

  it('refreshes an expiring token, and destroys credentials on disconnect', async () => {
    await env.pool.execute("UPDATE integration_connections SET status='active' WHERE id=?", [connectionId]);
    tokenResponse = () => Response.json({ access_token: 'access-2', expires_in: 3600 });
    const later = new OAuthService(env.pool, keys, { fetch: fakeFetch, now: () => '2026-10-04T06:00:00.000Z', environment });
    expect(await later.accessToken(connectionId)).toBe('access-2');
    tokenResponse = () => Response.json({ error: 'invalid_grant' }, { status: 400 });
    await expect(new OAuthService(env.pool, keys, { fetch: fakeFetch, now: () => '2026-10-04T08:00:00.000Z', environment }).accessToken(connectionId)).rejects.toThrow('reauthorization_required');
    data(await new OAuthService(env.pool, keys, { fetch: fakeFetch, now: NOW, environment }).disconnect(employee, connectionId));
    const [row] = await env.rows('SELECT status,credential_ciphertext,revoked_at FROM integration_connections WHERE id=?', [connectionId]);
    expect(row).toMatchObject({ status: 'revoked', credential_ciphertext: null });
    expect(row.revoked_at).toBeInstanceOf(Date);
  });
});

describe('BE-0737: the session boundary for integration administration', () => {
  it('refuses cross-origin calls and unknown methods, and never trusts a payload actor', async () => {
    const services = createSupportingServices(env.pool, { scanner: null });
    const request = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/integrations', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await handleIntegrationsRequest(request({ method: 'catalogue', args: [] }, 'https://evil.example'), env.pool, '', 'http://localhost:3000', services)).status).toBe(403);
    expect((await handleIntegrationsRequest(request({ method: 'tokens.dropAll', args: [] }), env.pool, '', 'http://localhost:3000', services)).status).toBe(400);
    expect((await handleIntegrationsRequest(request({ method: 'catalogue', args: [], actor: USER(1) }), env.pool, '', 'http://localhost:3000', services)).status).toBe(400);
    expect((await handleIntegrationsRequest(request({ method: 'catalogue', args: [] }), env.pool, 'not-a-session', 'http://localhost:3000', services)).status).toBe(401);
    void admin;
  });
});
