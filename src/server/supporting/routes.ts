import { Readable } from 'node:stream';
import type { Pool } from 'mysql2/promise';
import type { Result } from '@/contracts/results';
import { success } from '@/contracts/results';
import type { WorkLocation } from '@/contracts/domain';
import type { ActorPolicyContext } from '@/server/authorization/policy';
import { resultResponse } from '@/server/time/http';
import type { DownloadTarget } from '@/server/files/storage';
import { contentDisposition } from '@/server/files/storage';
import { FileApplication } from '@/server/files/application';
import type { AttachmentOwnerType } from '@/server/files/policy';
import type { CreateDocumentInput, DocumentCategory, DocumentSensitivity } from '@/server/documents/application';
import type { MessageScopeType } from '@/server/authorization/record-access';
import { INTEGRATIONS, integrationStatus } from '@/server/integrations/catalogue';
import { canManageIntegrations } from '@/server/integrations/api-tokens';
import type { ServerModuleKey } from './modules';
import { createSupportingServices } from './composition';
import { actorFromSession, handleCommand, record, text, trustedOrigin } from './http';
import { denied, invalid, notFound, unauthenticated } from './results';

type Services = ReturnType<typeof createSupportingServices>;
const num = (value: unknown) => (typeof value === 'number' ? value : Number.NaN);
const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

/** A download as an HTTP response: a short-lived redirect, or a private stream. */
export function downloadResponse(target: DownloadTarget & { readonly fileName: string; readonly mediaType: string }) {
  const headers = { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
  if (target.kind === 'redirect') return new Response(null, { status: 302, headers: { ...headers, location: target.url } });
  return new Response(Readable.toWeb(target.body) as ReadableStream, {
    status: 200,
    headers: { ...headers, 'content-type': target.mediaType, 'content-length': String(target.sizeBytes), 'content-disposition': contentDisposition(target.fileName) },
  });
}

const FILE_METHODS = ['initiate', 'complete', 'deactivate', 'list', 'policy'] as const;

/** `/api/files`: POST commands, PUT bytes to the local store, GET a download. */
export async function handleFilesRequest(request: Request, pool: Pool, sessionToken: string, expectedOrigin: string, services: Services = createSupportingServices(pool)) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (request.method === 'GET' || request.method === 'PUT') {
    if (request.method === 'PUT' && !trustedOrigin(request, expectedOrigin)) return resultResponse(denied('The request origin is not allowed.'));
    const actor = await actorFromSession(pool, sessionToken);
    if (!actor) return resultResponse(unauthenticated());
    if (!id) return resultResponse(invalid('id', 'Name the file.', 'Open the file from its record.'));
    if (request.method === 'PUT') {
      if (!request.body) return resultResponse(invalid('file', 'Send the file contents.', 'Choose the file again.'));
      return resultResponse(await services.files.receive(actor, id, Readable.fromWeb(request.body as import('node:stream/web').ReadableStream)));
    }
    const download = await services.files.download(actor, id);
    return download.status === 'success' ? downloadResponse(download.data) : resultResponse(download);
  }
  return handleCommand(request, {
    methods: FILE_METHODS, expectedOrigin, resolveActor: () => actorFromSession(pool, sessionToken),
    dispatch: async (method, args, actor) => {
      const input = record(args[0]);
      switch (method) {
        case 'initiate': return services.files.initiate(actor, {
          ownerType: text(input.ownerType) as AttachmentOwnerType, ownerId: text(input.ownerId), fileName: text(input.fileName),
          mediaType: text(input.mediaType), sizeBytes: num(input.sizeBytes), sha256: text(input.sha256).toLowerCase(),
        });
        case 'complete': return services.files.complete(actor, text(args[0]));
        case 'deactivate': return services.files.deactivate(actor, text(args[0]), text(args[1]));
        case 'list': return services.files.listForOwner(actor, text(input.ownerType) as AttachmentOwnerType, text(input.ownerId));
        case 'policy': return success(FileApplication.policyFor(text(args[0]) as AttachmentOwnerType));
      }
    },
  });
}

const DOCUMENT_METHODS = ['get', 'create', 'update', 'addVersion', 'changeAccess', 'setActive'] as const;

/** `/api/documents`: management commands; `GET ?download=` streams or redirects the current version. */
export async function handleDocumentsRequest(request: Request, pool: Pool, sessionToken: string, expectedOrigin: string, services: Services = createSupportingServices(pool)) {
  if (request.method === 'GET') {
    const actor = await actorFromSession(pool, sessionToken);
    if (!actor) return resultResponse(unauthenticated());
    const id = new URL(request.url).searchParams.get('download');
    if (!id) return resultResponse(notFound('document'));
    const download = await services.documents.download(actor, id);
    if (download.status !== 'success') return resultResponse(download);
    return download.data.kind === 'link'
      ? new Response(null, { status: 302, headers: { location: download.data.url, 'cache-control': 'private, no-store', 'referrer-policy': 'no-referrer' } })
      : downloadResponse(download.data);
  }
  return handleCommand(request, {
    methods: DOCUMENT_METHODS, expectedOrigin, resolveActor: () => actorFromSession(pool, sessionToken),
    dispatch: async (method, args, actor) => {
      const id = text(args[0]);
      const input = record(args[1]);
      switch (method) {
        case 'get': return services.documents.get(actor, id);
        case 'create': {
          const create = record(args[0]);
          return services.documents.create(actor, {
            title: text(create.title), description: text(create.description), category: text(create.category) as DocumentCategory,
            scope: text(create.scope) as CreateDocumentInput['scope'], divisionId: text(create.divisionId) || null, projectId: text(create.projectId) || null,
            sensitivity: (text(create.sensitivity) || 'protected') as DocumentSensitivity, externalLink: text(create.externalLink) || null,
          });
        }
        case 'update': return services.documents.update(actor, id, { title: text(input.title), description: text(input.description), category: text(input.category) as DocumentCategory, expectedVersion: num(input.expectedVersion) });
        case 'addVersion': return services.documents.addVersion(actor, id, { attachmentId: text(input.attachmentId) || null, externalLink: text(input.externalLink) || null, changeNote: text(input.changeNote), expectedVersion: num(input.expectedVersion) });
        case 'changeAccess': return services.documents.changeAccess(actor, id, { sensitivity: text(input.sensitivity) as DocumentSensitivity, reason: text(input.reason), expectedVersion: num(input.expectedVersion) });
        case 'setActive': return services.documents.setActive(actor, id, { active: input.active === true, reason: text(input.reason), expectedVersion: num(input.expectedVersion) });
      }
    },
  });
}

const MESSAGE_METHODS = ['threads', 'post', 'startDirect', 'pin', 'markRead'] as const;

export async function handleMessagesRequest(request: Request, pool: Pool, sessionToken: string, expectedOrigin: string, services: Services = createSupportingServices(pool)) {
  return handleCommand(request, {
    methods: MESSAGE_METHODS, expectedOrigin, resolveActor: () => actorFromSession(pool, sessionToken),
    dispatch: async (method, args, actor) => {
      const input = record(args[0]);
      switch (method) {
        case 'threads': return services.messages.threads(actor);
        case 'post': return services.messages.post(actor, {
          scopeType: text(input.scopeType) as MessageScopeType, scopeId: text(input.scopeId), body: text(input.body),
          mentionUserIds: list(input.mentionUserIds), isAnnouncement: input.isAnnouncement === true, idempotencyKey: text(input.idempotencyKey),
        });
        case 'startDirect': return services.messages.startDirect(actor, text(args[0]));
        case 'pin': return services.messages.pin(actor, text(args[0]), args[1] === true);
        case 'markRead': return services.messages.markRead(actor, text(args[0]) as MessageScopeType, text(args[1]));
      }
    },
  });
}

const INTEGRATION_METHODS = [
  'catalogue', 'modules.list', 'modules.set', 'tokens.list', 'tokens.create', 'tokens.revoke',
  'webhooks.list', 'webhooks.register', 'webhooks.rotate', 'webhooks.setActive', 'webhooks.deliveries',
  'oauth.providers', 'oauth.begin', 'connections.list', 'connections.disconnect', 'connections.sync',
  'drafts.list', 'drafts.confirm', 'drafts.dismiss',
] as const;

/** The catalogue view: every integration with its live status — administrators only. */
function catalogue(actor: ActorPolicyContext): Result<unknown> {
  if (!canManageIntegrations(actor)) return denied('Only an integration administrator can see the integration catalogue.');
  return success(INTEGRATIONS.map((entry) => ({ ...entry, status: integrationStatus(entry) })));
}

export async function handleIntegrationsRequest(request: Request, pool: Pool, sessionToken: string, expectedOrigin: string, services: Services = createSupportingServices(pool)) {
  return handleCommand(request, {
    methods: INTEGRATION_METHODS, expectedOrigin, resolveActor: () => actorFromSession(pool, sessionToken),
    dispatch: async (method, args, actor) => {
      const input = record(args[0]);
      switch (method) {
        case 'catalogue': return catalogue(actor);
        case 'modules.list': return actor.roles.includes('super_admin') ? services.modules.list() : denied();
        case 'modules.set': return services.modules.set(actor, text(input.key) as ServerModuleKey, input.enabled === true, text(input.reason), num(input.expectedVersion));
        case 'tokens.list': return services.tokens.list(actor);
        case 'tokens.create': return services.tokens.create(actor, { name: text(input.name), scopes: list(input.scopes), expiresInDays: num(input.expiresInDays) });
        case 'tokens.revoke': return services.tokens.revoke(actor, text(args[0]));
        case 'webhooks.list': return services.webhooks.list(actor);
        case 'webhooks.register': return services.webhooks.register(actor, { url: text(input.url), events: list(input.events), description: text(input.description) });
        case 'webhooks.rotate': return services.webhooks.rotateSecret(actor, text(args[0]));
        case 'webhooks.setActive': return services.webhooks.setActive(actor, text(args[0]), args[1] === true);
        case 'webhooks.deliveries': return services.webhooks.deliveries(actor, text(args[0]));
        case 'oauth.providers': return success(services.oauth.availableProviders());
        case 'oauth.begin': return services.oauth.begin(actor, text(args[0]));
        case 'connections.list': return services.oauth.connections(actor);
        case 'connections.disconnect': return services.oauth.disconnect(actor, text(args[0]));
        case 'connections.sync': {
          const connections = await services.oauth.connections(actor);
          if (connections.status !== 'success' || !connections.data.some((connection) => connection.id === text(args[0]))) return notFound('connection');
          return success(await services.calendar.sync(text(args[0])));
        }
        case 'drafts.list': return services.calendar.drafts(actor);
        case 'drafts.confirm': return services.calendar.confirm(actor, text(args[0]), {
          divisionId: text(input.divisionId), projectId: text(input.projectId), taskId: text(input.taskId),
          durationMinutes: num(input.durationMinutes), workLocation: text(input.workLocation) as WorkLocation,
          workDescription: text(input.workDescription), completedWork: text(input.completedWork),
          overtimeReason: text(input.overtimeReason) || null, criticalExplanation: text(input.criticalExplanation) || null,
          expectedVersion: num(input.expectedVersion),
        });
        case 'drafts.dismiss': return services.calendar.dismiss(actor, text(args[0]), num(args[1]));
      }
    },
  });
}

/** `GET /api/integrations/oauth/callback`: finish the provider sign-in, then return to Settings. */
export async function handleOAuthCallback(request: Request, pool: Pool, sessionToken: string, baseUrl: string, services: Services = createSupportingServices(pool)) {
  const url = new URL(request.url);
  const back = (outcome: string) => new Response(null, { status: 302, headers: { location: `${baseUrl}/settings?integration=${outcome}`, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
  const actor = await actorFromSession(pool, sessionToken);
  if (!actor) return back('signin_required');
  const result = await services.oauth.callback(actor, { state: url.searchParams.get('state'), code: url.searchParams.get('code'), error: url.searchParams.get('error') });
  return back(result.status === 'success' ? 'connected' : 'failed');
}
