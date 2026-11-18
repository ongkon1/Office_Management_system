# REST API and webhook conventions (v1)

`BE-0730`, `BE-0731` · Implementation: `src/server/integrations/api/http.ts`, `src/server/integrations/webhooks.ts`

This is the contract for systems that integrate with the PowerInAI work-management service: automation platforms (Zapier, Make), internal tools, and future approved connectors. It applies to everything under `/api/v1` and to every outbound webhook.

## 1. Before you start

- The **integrations module** must be switched on by a Super Administrator. While it is off, tokens do not authenticate and no webhook events are recorded.
- API tokens and webhooks are created by someone who holds the `integration.manage` permission (granted per person) or is a Super Administrator.
- A token always acts **as the person who created it**. It can never see or do more than that person could in the web application. Scopes only narrow what it may attempt.

## 2. Versioning

- The version is the first path segment: `/api/v1/...`. Every response carries `API-Version: 1`.
- Within a version, changes are additive only: new endpoints, new optional request fields, new response fields. Ignore fields you do not recognize.
- A breaking change ships as a new version (`/api/v2`). The old version stays available for **at least 6 months** after the new one is published.
- A route scheduled for removal returns:
  - `Deprecation: @<unix-seconds>` — when it was deprecated (RFC 9745).
  - `Sunset: <HTTP date>` — when it will stop working (RFC 8594).
  - `Link: <successor>; rel="successor-version"`.

## 3. Authentication and scopes

Send the token as a bearer credential:

```
Authorization: Bearer oms_XXXXXXXX_YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY
```

- Tokens are shown **once** at creation; only a hash is stored. Store them in a secret manager.
- Tokens expire after at most 365 days and can be revoked at any time. They stop working immediately when revoked, expired, when the owner is deactivated, or when the integrations module is switched off.
- Session cookies are never accepted on `/api/v1`.

| Scope | Grants |
|---|---|
| `projects:read` | `GET /api/v1/projects` |
| `tasks:read` | `GET /api/v1/tasks` |
| `work-logs:read` | `GET /api/v1/work-logs` |
| `work-logs:write` | `POST /api/v1/work-logs` |

`GET /api/v1/me` needs no scope and returns the identity the token acts as.

## 4. Endpoints

| Method and path | Purpose | Notes |
|---|---|---|
| `GET /me` | The token's identity | `userId`, `employeeId`, `roles` |
| `GET /projects` | Projects the owner can see | Government projects require the owner's government access |
| `GET /tasks?projectId=` | Active tasks in visible projects | `projectId` optional; an unseen project is `404` |
| `GET /work-logs?from=&to=` | The owner's own saved work logs | Both dates required, `YYYY-MM-DD`, at most 92 days |
| `POST /work-logs` | Record work for the owner | Requires `Idempotency-Key` |

### Recording work

`POST /api/v1/work-logs` is the same operation as saving a work log in the web application (`BE-0736`, `REQ-INT-008`). Every rule applies:

- the task must be In Progress and eligible for work;
- the division must be one of the owner's effective assignments;
- verified periods are locked;
- a day cannot exceed 24:00 of active work;
- overtime needs a reason, and critical time needs an explanation.

The log is recorded with `source: imported`, audited, recalculated and published like any other.

```json
{
  "workDate": "2026-10-04",
  "divisionId": "…", "projectId": "…", "taskId": "…",
  "durationMinutes": 90,
  "workLocation": "office",
  "workDescription": "What was worked on",
  "completedWork": "What was finished",
  "supportingLink": null, "overtimeReason": null, "criticalExplanation": null
}
```

`workLocation` is one of `office`, `wfh`, `hybrid`, `field_work`, `client_office`, `official_travel`, `training_venue`. Durations are whole minutes; there are no start or end times.

## 5. Idempotency

- Every write requires `Idempotency-Key`: 8–64 characters from letters, digits, `-` and `_`.
- Repeating a request with the same key and the same body returns the original result. Retrying is always safe.
- Reusing a key with a **different** body is refused with `409 CONFLICT`.
- Keys are scoped to the token.

## 6. Pagination

- List endpoints return `{ "data": [...], "page": { "nextCursor": "…" | null, "limit": n } }`.
- Pass `?cursor=<nextCursor>` to continue. A `null` cursor means you have reached the end.
- `limit` defaults to 25, with a maximum of 100. Cursors are opaque: do not build or edit them.
- Order is stable: by id, or by date then id for work logs.

## 7. Errors

All errors use one envelope:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "…", "details": [{ "field": "…", "message": "…", "guidance": "…" }], "requestId": "…" } }
```

| Status | `code` | Meaning |
|---|---|---|
| 400 | `BAD_REQUEST` | Body is not JSON |
| 401 | `UNAUTHENTICATED` | Missing, invalid, expired or revoked token |
| 403 | `INSUFFICIENT_SCOPE`, `FORBIDDEN` | Token lacks the scope, or the owner may not do this |
| 404 | `NOT_FOUND` | No such resource — or one the owner cannot see. The two are indistinguishable by design. |
| 405 | `METHOD_NOT_ALLOWED` | Known resource, unsupported method |
| 409 | `CONFLICT`, `PERIOD_LOCKED` | Idempotency-key reuse, a stale version, or a verified period |
| 422 | `VALIDATION_FAILED` | Field errors in `details`, each with corrective guidance |
| 429 | `RATE_LIMITED` | Too many requests; see `Retry-After` |
| 503 | `DEPENDENCY_FAILED` | Temporary failure; retry writes with the same `Idempotency-Key` |

Every response includes `X-Request-Id`. Quote it when reporting a problem.

## 8. Rate limits

- 120 requests per minute per token, in fixed one-minute windows.
- Every authenticated response carries `RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` (seconds).
- A `429` response also carries `Retry-After`.

## 9. Webhooks

### Events

| Event | Resource | When |
|---|---|---|
| `work_log.recorded` | `work_log` | A work log is created or corrected |
| `task.status_changed` | `task` | A task moves between Pending, In Progress and Completed |
| `project.changed` | `project` | A project is created or edited |
| `period.verified` | `period` | HR verifies or amends a payroll period |

### Payload

The payload names the event and the record; it never carries the record's content. Fetch details through the API, using a token with the right scopes.

```json
{ "id": "…", "type": "task.status_changed", "apiVersion": "1", "occurredAt": "2026-10-04T04:00:00.000Z",
  "data": { "resourceType": "task", "resourceId": "…" } }
```

An event is delivered only while the endpoint's owner can still open the record. Events about government work never reach an owner without that access.

### Destinations

- Only `https` URLs that resolve to public addresses are accepted. Private, loopback, link-local and carrier-grade NAT ranges are refused.
- The address is checked at registration **and** again before every delivery.
- Redirects are not followed, and the response body is ignored.

### Verifying a delivery

Each request carries:

| Header | Content |
|---|---|
| `X-OMS-Event-Id` | Unique event id — store it and ignore repeats |
| `X-OMS-Event-Type` | The event type |
| `X-OMS-Timestamp` | Unix seconds when signed |
| `X-OMS-Signature` | `v1=<hex>`, or several separated by `, ` during a secret rotation |

Compute `HMAC-SHA256(secret, "<timestamp>.<raw body>")` and compare it in constant time with any `v1=` value.

To prevent replays:

- reject a request whose timestamp is more than **5 minutes** from your clock;
- drop any event id you have already processed.

`verifyWebhookSignature` in `src/server/integrations/webhooks.ts` is a reference implementation.

### Secret rotation

Rotating issues a new secret immediately. The previous secret **also** signs every delivery for 24 hours, so you can deploy the new secret without missing events.

### Retries

| Your response | What happens |
|---|---|
| `2xx` | Delivered |
| `408`, `429`, `5xx`, timeout (10 s), network error | Retried with exponential backoff (30 s doubling, capped at 6 h, ±20% jitter), up to 8 attempts, then dead-lettered |
| Any other `4xx` | Dead-lettered at once |
| `410 Gone` | Dead-lettered, and the endpoint is disabled |

Delivery history, with states and safe error codes only, is available to the endpoint owner.

## 10. Calendar connections

Google Calendar and Microsoft Outlook connect through OAuth 2.0 with PKCE. A provider is offered only after it is **approved** (`INTEGRATION_APPROVED_PROVIDERS`) and **configured** (client id and secret). Access is read-only.

Events become **drafts visible only to that employee**. They change no totals until the employee confirms them, and confirmation is the same work-log save described in §4.
