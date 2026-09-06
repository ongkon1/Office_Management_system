# Backend Quality Gates

Tasks: `BE-0023`, `BE-0024`

## Test layers

| Layer | File convention | Command | External dependencies |
|---|---|---|---|
| Domain/application unit | `*.unit.test.ts` | `npm run test:backend:unit` | none |
| MySQL/Redis integration | `*.integration.test.ts` | `npm run test:backend:integration` | isolated MySQL and Redis |
| Server Action/Route integration | `*.api.test.ts` | `npm run test:backend:api` | mocked ports or isolated dependencies by suite |
| Authorization matrix | `*.authorization.test.ts` | `npm run test:backend:authorization` | repository test doubles and database cases |
| Browser workflow | `tests/e2e/*.spec.ts` | `npm run test:e2e` | built/dev server and Chromium |

`vitest.backend.config.mts` uses the Node environment and separates the four backend projects. Database integration runs sequentially to prevent shared-database races until Phase 1 provides per-test isolation. Empty suites are temporarily allowed because Phase 0 configures the layers before feature code exists; owning implementation tasks must add tests and cannot cite an empty run as requirement coverage.

## CI gates

`.github/workflows/quality.yml` defines:

1. Application verification: typecheck, lint, contrast, frontend tests, build, migration static validation, backend suites and high/critical dependency audit.
2. Chromium workflow smoke tests.
3. Backend integration job with isolated MySQL 8.4 and Redis 7 services.

`npm run verify:backend` is the local backend aggregate. `npm run db:validate` rejects empty or materially destructive SQL migrations without explicit recovery guidance. Phase 1 extends it with clean apply, upgrade, schema drift and rollback/recovery tests against MySQL.

The security gate fails on high or critical advisories. Moderate advisories are reviewed and recorded rather than hidden. At this baseline, npm reports a moderate development-server advisory only through Drizzle Kit's legacy `@esbuild-kit` dependency chain; it is not shipped in production, the vulnerable development server is not exposed, and the issue is revisited on every dependency update. There are no high or critical findings.

## Next.js 16 constraints applied

The bundled Next.js 16 guides were read before configuration. The implementation must preserve these points:

- Server Actions are untrusted POST entry points and require authentication, authorization, validation and constrained return values inside each action.
- Route Handlers use Web Request/Response APIs and are not cached by default; protected APIs must remain dynamic.
- Next.js 16 uses `proxy.ts`; proxy redirects are not the authorization boundary.
- Server Actions dispatch sequentially per client, so independent concurrency belongs inside one action, Server Components or Route Handlers.
- Self-hosted multi-instance deployments share the Server Action encryption key and deployment identifier and coordinate caches.
- Vitest does not support async Server Components as unit tests; those flows use end-to-end coverage.

Read sources:

- `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`
- `node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md`
- `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md`
- `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`

## Phase 0 execution evidence

Executed on 3 September 2026 with Node.js 24.20.0, Next.js 16.3.4 and MySQL client 8.4.7 available locally:

- Type generation and TypeScript: pass.
- ESLint: pass.
- Contrast audit: 47/47 pass.
- Existing Vitest suite: 23/23 pass.
- Backend Vitest project discovery: unit, integration, API and authorization projects load successfully; feature tests begin in their owning phases.
- Migration validation: pass; no Phase 1 migrations exist yet.
- Production build: pass.
- Playwright Chromium smoke test: 1/1 pass.
- npm audit: zero high/critical findings; four accepted moderate development-only findings in the Drizzle Kit legacy esbuild chain, as documented above.
