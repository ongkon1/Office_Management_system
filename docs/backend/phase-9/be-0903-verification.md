# BE-0903 Verification — Production Data Boundaries

## Outcome

`BE-0903` is complete. Application features, routes, shared components, and
shared libraries no longer import deterministic fixtures or mock services
directly. Production composition now resolves to MySQL-backed HTTP adapters
where those adapters exist and to a typed, explicit unavailable result where
the corresponding backend milestone is still pending.

Deterministic fixtures remain available in two isolated places:

- `src/services/mock/` and `src/fixtures/` for test scenarios and maintained
  frontend demonstrations.
- `src/services/runtime/demo.ts` for the explicitly gated demo-account and
  presentation-reset experience.

They are not fallback data for ordinary production services.

## Delivered boundaries

- `src/services/runtime/*` is the only composition surface imported by feature
  code. Implemented modules use `src/services/server/*`; pending modules return
  a standard `DEPENDENCY_FAILED` result rather than displaying fixture records.
- `src/services/runtime/unavailable.ts` supplies that typed, honest fallback and
  supports partially cut-over contracts such as HR.
- `src/services/runtime/invalidation.ts` replaces the shared UI hook's direct
  dependency on the mock store. The mock store publishes to this neutral signal
  only inside test/demo composition.
- `src/test/runtime/*` maps runtime contracts to deterministic mock adapters.
  `vitest.config.mts` owns those aliases, so test data is injected by the test
  runner instead of selected inside production modules.
- `scripts/audit-production-data-boundaries.mjs` fails when a non-test,
  non-demo-composition source file imports `@/fixtures` or
  `@/services/mock`. Both `verify` commands now run this gate.

## Safety behavior for incomplete cutovers

Team Lead, requisition, conveyance, Meeting Minutes, department administration,
employee dashboard, management dashboard, and synchronous work-log selector
adapters awaited their backend work under `BE-0902` or later milestones at the
time of this verification. `BE-0902` was subsequently completed on 8 October
2026; later standalone milestones remain separate.
Their production runtime boundaries therefore return an unavailable result (or
an empty synchronous selector set) instead of silently presenting demo data as
live data. Their deterministic UI tests continue to use the mock adapters.

## Verification evidence

Executed on 2026-10-04:

| Check | Result |
|---|---|
| `npm run audit:data-boundaries` | Passed; no direct fixture or mock-service imports in production modules |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed with zero errors; one existing `session-provider.tsx` exhaustive-deps warning remains |
| `npm run test` | Passed: 50 files, 914 tests |
| `npm run build` | Passed: optimized Next.js 16.3.4 production build, 68/68 static pages |
| Production-output check for feature mock-service symbols | No `mockTeamLeadService`, `mockMeetingMinutesService`, `mockDepartmentAdminService`, or `mockDashboardService` symbols found |

The local helper runtime reported Node 22.22.1 while `package.json` requires Node
24; npm emitted the existing engine warning, but all checks above completed.
Deployment must continue to use the declared Node 24 runtime.
