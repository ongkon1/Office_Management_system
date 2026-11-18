import { randomUUID } from 'node:crypto';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import type { Result } from '@/contracts/results';
import { loadActorPolicyContext } from '@/server/authorization/mysql-context';
import { canSeeGovernment, decideProjectReach, PROJECT_FACT_COLUMNS, projectFactsFrom } from '@/server/authorization/record-access';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { TimeApplication } from '@/server/time/application';
import { MysqlTimeRepository } from '@/server/time/mysql-repository';
import { businessDate } from '@/server/supporting/results';
import { ApiTokenService, type ApiScope } from '../api-tokens';

type Row = RowDataPacket & Record<string, unknown>;

/**
 * `/api/v1` (`BE-0730`). The conventions live in
 * `docs/backend/phase-7/api-conventions.md`; this is their implementation.
 *
 * A route declares the scope it needs. The token must hold it, and the call
 * then runs as the token's owner through the normal authorization: a scope
 * narrows what a token may attempt, never widens what the owner may see.
 */
interface RouteContext {
  readonly actor: ActorPolicyContext;
  readonly tokenId: string;
  readonly url: URL;
  readonly request: Request;
  readonly pool: Pool;
  readonly now: () => string;
}
type RouteResult = { readonly status: number; readonly body: unknown };
interface Route {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly scope: ApiScope | null;
  /** Set when a route is retired: sent as `Deprecation`, `Sunset` and `Link` headers. */
  readonly deprecated?: { readonly since: string; readonly sunset: string; readonly successor: string };
  readonly handle: (context: RouteContext) => Promise<RouteResult>;
}

export const API_RATE_LIMIT_PER_MINUTE = 120;
const PAGE_DEFAULT = 25, PAGE_MAX = 100;

const STATUS_OF: Readonly<Record<string, number>> = {
  validation_failure: 422, permission_denied: 403, unauthenticated: 401, not_found: 404, conflict: 409, error: 503,
};

function failure(status: number, code: string, message: string, details?: unknown): RouteResult {
  return { status, body: { error: { code, message, ...(details ? { details } : {}) } } };
}

function fromResult<T>(result: Result<T>, map: (data: T) => unknown, created = false): RouteResult {
  if (result.status === 'success') return { status: created ? 201 : 200, body: { data: map(result.data) } };
  const details = result.status === 'validation_failure' ? result.fieldErrors.map((error) => ({ field: error.field, message: error.message, guidance: error.guidance })) : undefined;
  return failure(STATUS_OF[result.status] ?? 500, result.code, result.message, details);
}

/** Cursor: opaque base64url of the last key; rejected if tampered into a wrong shape. */
const encodeCursor = (key: readonly string[]) => Buffer.from(JSON.stringify(key)).toString('base64url');
function decodeCursor(raw: string | null): string[] | null | 'invalid' {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return Array.isArray(value) && value.length <= 3 && value.every((part) => typeof part === 'string' && part.length <= 64) ? value : 'invalid';
  } catch { return 'invalid'; }
}
function pageOf<T>(items: readonly T[], keyOf: (item: T) => string[], url: URL): RouteResult | { readonly data: readonly T[]; readonly nextCursor: string | null; readonly limit: number } {
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw === null ? PAGE_DEFAULT : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX) return failure(422, 'VALIDATION_FAILED', `limit must be an integer from 1 to ${PAGE_MAX}.`);
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  if (cursor === 'invalid') return failure(422, 'VALIDATION_FAILED', 'cursor is not valid. Use the nextCursor value from the previous page.');
  const compare = (a: string[], b: string[]) => { for (let i = 0; i < a.length; i += 1) { if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; } return 0; };
  const after = cursor ? items.filter((item) => compare(keyOf(item), cursor) > 0) : items;
  const data = after.slice(0, limit);
  return { data, nextCursor: after.length > limit ? encodeCursor(keyOf(data[data.length - 1])) : null, limit };
}
const paged = (page: ReturnType<typeof pageOf>): RouteResult => ('status' in page ? page : { status: 200, body: { data: page.data, page: { nextCursor: page.nextCursor, limit: page.limit } } });

async function visibleProjects(context: RouteContext) {
  const me = context.actor.employeeId ?? '';
  const date = businessDate(context.now());
  const [rows] = await context.pool.execute<Row[]>(
    `SELECT ${PROJECT_FACT_COLUMNS},p.name,p.project_code,p.status,p.start_date,p.end_date FROM projects p JOIN divisions d ON d.id=p.division_id ORDER BY p.id`,
    [me, date, date, me, me]);
  return rows.filter((row) => decideProjectReach(context.actor, projectFactsFrom(row)).view);
}
const isoDate = (value: unknown) => (value == null ? null : value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10));

const workLogBody = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  divisionId: z.string().uuid(), projectId: z.string().uuid(), taskId: z.string().uuid(),
  durationMinutes: z.number().int(),
  workLocation: z.enum(['office', 'wfh', 'hybrid', 'field_work', 'client_office', 'official_travel', 'training_venue']),
  workDescription: z.string().max(10000), completedWork: z.string().max(10000),
  supportingLink: z.string().url().max(1024).nullable().optional(),
  overtimeReason: z.string().max(5000).nullable().optional(),
  criticalExplanation: z.string().max(5000).nullable().optional(),
}).strict();

export const ROUTES: readonly Route[] = [
  {
    method: 'GET', path: 'me', scope: null,
    handle: async ({ actor }) => ({ status: 200, body: { data: { userId: actor.userId, employeeId: actor.employeeId, roles: actor.roles } } }),
  },
  {
    method: 'GET', path: 'projects', scope: 'projects:read',
    handle: async (context) => paged(pageOf((await visibleProjects(context)).map((row) => ({
      id: String(row.id), code: String(row.project_code), name: String(row.name), divisionId: String(row.division_id),
      status: String(row.status), startDate: isoDate(row.start_date), endDate: isoDate(row.end_date),
    })), (project) => [project.id], context.url)),
  },
  {
    method: 'GET', path: 'tasks', scope: 'tasks:read',
    handle: async (context) => {
      const projectFilter = context.url.searchParams.get('projectId');
      const projects = new Set((await visibleProjects(context)).map((row) => String(row.id)));
      if (projectFilter && !projects.has(projectFilter)) return failure(404, 'NOT_FOUND', 'Project was not found.');
      const ids = projectFilter ? [projectFilter] : [...projects];
      if (!ids.length) return paged(pageOf([], () => [], context.url));
      const [rows] = await context.pool.query<Row[]>(
        'SELECT id,project_id,title,status,assignee_employee_id,start_date,due_date,estimated_minutes FROM tasks WHERE is_active=TRUE AND project_id IN (?) ORDER BY id', [ids]);
      return paged(pageOf(rows.map((row) => ({
        id: String(row.id), projectId: String(row.project_id), title: String(row.title), status: String(row.status),
        assigneeEmployeeId: row.assignee_employee_id ? String(row.assignee_employee_id) : null,
        startDate: isoDate(row.start_date), dueDate: isoDate(row.due_date), estimatedMinutes: Number(row.estimated_minutes ?? 0),
      })), (task) => [task.id], context.url));
    },
  },
  {
    // The owner's own saved work logs; a 92-day window at most.
    method: 'GET', path: 'work-logs', scope: 'work-logs:read',
    handle: async (context) => {
      const from = context.url.searchParams.get('from'), to = context.url.searchParams.get('to');
      if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) return failure(422, 'VALIDATION_FAILED', 'from and to are required dates (YYYY-MM-DD), with to on or after from.');
      if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 92) return failure(422, 'VALIDATION_FAILED', 'Request at most 92 days per call.');
      if (!context.actor.employeeId) return paged(pageOf([], () => [], context.url));
      const [rows] = await context.pool.execute<Row[]>(
        `SELECT t.id,t.work_date,t.division_id,t.project_id,t.task_id,t.active_minutes,t.work_location,t.source,t.status,d.is_government
         FROM time_entries t JOIN divisions d ON d.id=t.division_id
         WHERE t.employee_id=? AND t.work_date BETWEEN ? AND ? AND t.is_active=TRUE AND t.status<>'draft' ORDER BY t.work_date,t.id`,
        [context.actor.employeeId, from, to]);
      const government = canSeeGovernment(context.actor);
      return paged(pageOf(rows.filter((row) => !row.is_government || government).map((row) => ({
        id: String(row.id), workDate: isoDate(row.work_date)!, divisionId: String(row.division_id), projectId: row.project_id ? String(row.project_id) : null,
        taskId: row.task_id ? String(row.task_id) : null, durationMinutes: Number(row.active_minutes), workLocation: String(row.work_location),
        source: String(row.source), state: String(row.status),
      })), (log) => [log.workDate, log.id], context.url));
    },
  },
  {
    // `BE-0736`: an external write is an ordinary work-log save by the owner.
    method: 'POST', path: 'work-logs', scope: 'work-logs:write',
    handle: async (context) => {
      const key = context.request.headers.get('idempotency-key');
      if (!key || !/^[A-Za-z0-9_-]{8,64}$/.test(key)) return failure(422, 'VALIDATION_FAILED', 'Send an Idempotency-Key header of 8 to 64 letters, digits, - or _.');
      if (!context.actor.employeeId) return failure(403, 'FORBIDDEN', 'Only an employee account can record work.');
      let body: unknown;
      try { body = await context.request.json(); } catch { return failure(400, 'BAD_REQUEST', 'Send a JSON body.'); }
      const parsed = workLogBody.safeParse(body);
      if (!parsed.success) return failure(422, 'VALIDATION_FAILED', 'The work log is not valid.', parsed.error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })));
      const time = new TimeApplication(new MysqlTimeRepository(context.pool), async () => context.actor, context.now);
      const result = await time.saveImported({
        ...parsed.data, employeeId: context.actor.employeeId, supportingLink: parsed.data.supportingLink ?? null,
        overtimeReason: parsed.data.overtimeReason ?? null, criticalExplanation: parsed.data.criticalExplanation ?? null,
        attachmentIds: [], source: 'imported', idempotencyKey: `api:${context.tokenId.slice(0, 36)}:${key}`,
      });
      return fromResult(result, (entry) => ({ id: entry.id, workDate: entry.workDate, durationMinutes: entry.activeMinutes, state: entry.state, version: entry.version }), true);
    },
  },
];

/** Entry point for `src/app/api/v1/[...path]/route.ts`. */
export async function handleApiV1(request: Request, segments: readonly string[], pool: Pool, options: { readonly now?: () => string; readonly rateLimit?: number } = {}) {
  const requestId = randomUUID();
  const now = options.now ?? (() => new Date().toISOString());
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-request-id': requestId, 'api-version': '1' });
  const respond = (result: RouteResult, extra: Record<string, string> = {}) => {
    for (const [name, value] of Object.entries(extra)) headers.set(name, value);
    const body = result.body as { error?: Record<string, unknown> };
    return new Response(JSON.stringify(body.error ? { error: { ...body.error, requestId } } : body), { status: result.status, headers });
  };
  const path = segments.join('/');
  const route = ROUTES.find((candidate) => candidate.path === path && candidate.method === request.method);
  if (!route) {
    const known = ROUTES.some((candidate) => candidate.path === path);
    return respond(failure(known ? 405 : 404, known ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND', known ? 'This method is not supported for this resource.' : 'There is no such API resource.'));
  }
  const authorization = request.headers.get('authorization') ?? '';
  const tokens = new ApiTokenService(pool, now);
  const token = authorization.startsWith('Bearer ') ? await tokens.authenticate(authorization.slice(7).trim()) : null;
  if (!token) return respond(failure(401, 'UNAUTHENTICATED', 'Send a valid bearer token.'), { 'www-authenticate': 'Bearer' });
  const limit = await tokens.consume(token.tokenId, options.rateLimit ?? API_RATE_LIMIT_PER_MINUTE);
  const rateHeaders = { 'ratelimit-limit': String(limit.limit), 'ratelimit-remaining': String(limit.remaining), 'ratelimit-reset': String(limit.resetSeconds) };
  if (!limit.allowed) return respond(failure(429, 'RATE_LIMITED', 'Too many requests. Wait for the window to reset.'), { ...rateHeaders, 'retry-after': String(limit.resetSeconds) });
  if (route.scope && !token.scopes.has(route.scope)) return respond(failure(403, 'INSUFFICIENT_SCOPE', `This token needs the ${route.scope} scope.`), rateHeaders);
  const actor = await loadActorPolicyContext(pool, token.ownerUserId, businessDate(now()));
  if (!actor) return respond(failure(401, 'UNAUTHENTICATED', 'Send a valid bearer token.'), rateHeaders);
  const deprecation: Record<string, string> = route.deprecated
    ? { deprecation: `@${Math.floor(Date.parse(route.deprecated.since) / 1000)}`, sunset: new Date(route.deprecated.sunset).toUTCString(), link: `<${route.deprecated.successor}>; rel="successor-version"` }
    : {};
  try {
    return respond(await route.handle({ actor, tokenId: token.tokenId, url: new URL(request.url), request, pool, now }), { ...rateHeaders, ...deprecation });
  } catch {
    return respond(failure(503, 'DEPENDENCY_FAILED', 'The request could not be completed. Retry with the same Idempotency-Key.'), rateHeaders);
  }
}
