# Organization Hierarchy — Phase B2 Verification

Department administration as a MySQL application service behind the approved
contract, with authorization, scoped Team Lead capability, audit evidence and
concurrency control.

| Field | Value |
|---|---|
| Milestone | `organization_hierarchy_milestone.md` Phase B2 |
| Tasks | `OH-BE-0201` – `OH-BE-0216` |
| Application service | `src/server/organization/department-administration.ts` |
| Shared rules | `src/lib/department-hierarchy.ts` |
| Exposure | `src/app/api/admin/route.ts` → `src/server/admin/http.ts` → `src/services/server/department-admin.ts` → `src/services/runtime/department-admin.ts` |
| Status | 16 of 16 complete |

---

## 1. One contract, two implementations, one set of answers

`BackendDepartmentAdministration` implements `DepartmentAdministrationService`
— the same interface the mock implements and `/admin/departments` consumes — so
connecting the backend changed **no screen, no view model and no test of the
screen**. The browser probe is the proof: the Phase F2 screen, unmodified,
renders the seeded MySQL hierarchy and refuses a duplicate with the same words.

Everything a person reads now comes from `src/lib/department-hierarchy.ts`,
imported by both implementations: conflict wording, field failures, shape
validation, the appointment date policy, the deactivation reason rule and the
warning text. Before this phase the mock held its own copies, which is how a
screen built against fixtures starts contradicting the server once it is
connected. What stayed per-implementation is only what needs rows — uniqueness
inside a division, lead eligibility, period overlap.

## 2. Authorization

| Rule | Where | Task |
|---|---|---|
| The actor comes from the session cookie; the `userId` argument is only checked against it | `actor()` | `OH-BE-0202` |
| Department and appointment mutation is Super Administrator only — the role is tested explicitly, because HR holds `organization.manage` for employee administration while the approved model reserves the hierarchy | `administrator()`, `gate()` | `OH-BE-0202` |
| Scope is applied before any row is read, counted, grouped or totalled, including the unfiltered total and the division options | `catalogue()` | `OH-BE-0210` |
| A department outside scope answers exactly as a nonexistent one — same status, code, message and resource | `visibleRow()`, `notFound()` | `OH-BE-0211` |

A capability refusal stays `permission_denied`: it is identical for every id,
existing or not, so it confirms nothing. Record-level answers are the ones that
collapse to not-found, which is what keeps a future department-scoped reader
(Phase B3) from being able to probe for ids.

## 3. The scope an appointment grants

`OH-BE-0207` – `OH-BE-0209` are implemented in the authorization layer, not in
the department service:

- `loadActorPolicyContext` loads, for the requested business date, the
  departments the actor leads and the employees those departments reach. An
  appointment that has not started or has ended contributes nothing.
- `hasPermission` grants the **Team Lead capability set** to anyone holding at
  least one effective appointment. No role row is written, no division is
  widened, and `authorize` still requires the record's department to be one the
  actor leads.
- One employee may hold several appointments at once, including in different
  divisions, and each is bounded separately.
- `loadSessionUser` reports the scopes instead of an empty list, so the client
  shows what the appointment actually grants.

The policy's employee self-only rule needed a bounded exception: a lead whose
stored role is Employee was granted the capability and then refused every record
about anybody else, so the appointment granted nothing usable. The exception is
narrow — it applies only when the record names a department the actor has an
effective appointment for, and the department check immediately re-asserts the
boundary.

**Nothing derived is cached on the server.** The policy context is rebuilt per
request from effective-dated rows, so an expired appointment stops granting
access with no revocation step and no cache to purge; the only cache is the
client's session snapshot, which the runtime adapter invalidates after every
successful mutation (`runtimeInvalidation.notify()`).

## 4. Audit, period locking and concurrency

- **Audit** (`OH-BE-0212`): `department.created`, `department.updated`,
  `department.activated`, `department.deactivated`, `department.deleted` and
  `department.lead.appointed`, each with the actor, the resource, the scope, the
  before and after values and the reason the person gave. The rows are
  append-only by trigger from migration 0002 — which is also why the integration
  test selects its own rows instead of truncating the table.
- **Period locking** (`OH-BE-0213`): a lead appointment writes dated history, so
  an effective date inside a verified or amended payroll period is refused with
  `PERIOD_LOCKED`, the period's label and the amendment path. A department's
  name, description or status carries no dated history, and a delete is possible
  only for a department nothing references, so those are not gated — that is
  what "where applicable" means in the task.
- **Concurrency** (`OH-BE-0214`): writes go through the repository's version
  checks and a stale version becomes a conflict with "reload and review"
  guidance. The integration test asserts the property rather than the scheduler:
  two parallel updates may both succeed if they serialize, but the stored row
  must equal one of the submissions and the version must advance exactly once
  per success. The deterministic stale-version refusal is tested directly.

## 5. Exposure (`OH-BE-0216`)

Department administration travels through the **existing** `/api/admin`
envelope with namespaced method names (`department.catalogue`,
`department.appointLead`, …), so there is one administration route, one origin
check, one size limit and one error mapping. The route constructs both services
and each resolves its own actor from the session. `src/services/runtime/department-admin.ts`
now returns the server adapter instead of the "not available yet" stub;
`src/test/runtime/department-admin.ts` keeps pointing at the mock, so component
tests still run on fixtures.

The API test covers the boundary itself: dispatch with arguments, an omitted
optional argument staying omitted, a cross-origin refusal before the body is
read, malformed JSON, empty and oversized argument lists, and that
`__proto__`, `constructor` and an unknown `department.*` name are refused by the
whitelist rather than reflected onto an object.

## 6. Evidence

| Check | Result |
|---|---|
| `department-hierarchy.unit.test.ts` | 13 passed — the rules both implementations share |
| `department-scope.authorization.test.ts` | 6 passed — what an appointment grants and what it must not |
| `department-http.api.test.ts` | 6 passed — the command envelope |
| `department-administration.integration.test.ts` | 20 passed — authorization, not-found equivalence, views by date, audit payloads, period lock, concurrency, scope derivation |
| Backend suites | 397/397 across unit, integration, api and authorization |
| Frontend suite | 918/918, including the 29 mock service tests and 12 screen tests unchanged |
| `scripts/_ohbe02-probe.mjs` | 24/24 against the dev server and the seeded database |
| `npm run db:validate`, `typecheck`, `eslint`, `next build` | clean (one pre-existing `session-provider.tsx` warning) |

Two things the probe found, both real:

- **`EXPECTED_DATABASE_MIGRATION` was stale at `0011`** while `0012` and `0013`
  were applied, so `/api/health` reported the schema unhealthy on a correctly
  migrated database — the opposite of the probe's purpose. It now tracks `0013`.
- **A "no console errors" check was wrong**, not the code: a refused save
  answers HTTP 400 by design and Chrome logs every non-2xx fetch, so the check
  asserted that the probe never exercises a refusal. It now ignores reported
  response statuses the product means to return and collects uncaught page
  errors instead.

The runtime grant hardener was also extended to keep `department_migration_*`
read-only for application accounts, with a matching rule in
`validate-migrations.mjs`: those tables are migration output that the report
reads, never application state.

## 7. What Phase B2 does not do

Workflow and reporting readers still use the frozen legacy
`employee_division_assignments.lead_employee_id` — switching HR requests,
evaluations, notifications, task review, reports and search onto department
leadership is Phase B3, and `department_migration_review` already lists every
disagreement for that work. Employee placement from the assignment forms
(`placeAssignment` in the repository) is wired up in Phase F3 and B3.
