# Organization Hierarchy — Phase F3 Verification

Employee placement belongs to the division assignment, and department
leadership is a capability a person can be told about, scope, and lose.

| Field | Value |
|---|---|
| Milestone | `organization_hierarchy_milestone.md` Phase F3 |
| Tasks | `OH-FE-0301` – `OH-FE-0314` |
| Status | 13 of 14 complete; `OH-FE-0314` blocked on adapters that do not exist yet (§5) |

---

## 1. What was already there, and what was not

Phase F1 moved placement onto the assignment form, so the division-dependent
department control, the cleared stale selection and the read-only effective lead
existed before this phase. They are now **verified rather than assumed**
(`placement-form.test.tsx`), and the audit found two real gaps behind them:

- **A future placement was labelled "Ended".** The employee detail split
  assignments by "effective today", so anything else — including a placement
  starting in December — landed in history as ended. A placement is `current`,
  `scheduled` or `ended`, and `placementState` now answers that.
- **A transfer looked like two unrelated rows.** Moving from Technical to Prompt
  Engineering inside one division is two assignments, and a reader had to infer
  the relationship from dates. `placementHistory` derives it and the screen says
  "Transferred from Technical on 1 Sep 2026".

Both live in `src/features/hr/placement-history.ts`, which is pure and tested
without rendering anything.

## 2. An appointment is a capability, not a role

`src/features/access/capabilities.ts` answers the only question navigation and
route access need — *may this person use a Team Lead surface right now* — from
`departmentLeadScopes`, which the service resolved for today:

| Function | Answers |
|---|---|
| `leadsDepartmentsNow` | is any appointment effective |
| `effectiveRoleKeys` | the roles an access decision should see (`team_lead` added, never stored) |
| `navigationRole` | which navigation set to build |
| `describeLeadScope` | how the person's own scope is described to them |

`checkRouteAccess` tests the effective roles and `buildNavigation` takes the
navigation role, so an appointed Employee reaches `/team`, `/team/timesheets`,
`/requests` and `/workload` while the appointment is in force, keeps employee
self-service throughout (the Team Lead navigation contains the "My work"
group), and loses those routes the moment no appointment is effective — with no
revocation step, because nothing is cached.

Three things it deliberately does **not** do: add a role to the session, widen a
division, or open HR and administration routes. All three are asserted.

## 3. Scope a person can see and narrow

- **Member rows name the departments they are reached through** — the
  intersection of the member's placements and the viewer's appointments, never
  every department the member belongs to. A lead reaching Nadia through
  PowerInAI Technical does not learn she is also in WesternCF Client Services.
- **`TeamLeadScopeView`** reports the departments led, the divisions covered,
  whether the reach comes from appointments alone, and any appointment that has
  not started. The dashboard and My Team both render it, so a lead of nine
  departments is told so and a lead whose appointment starts in December is told
  *that* rather than shown an unexplained empty team.
- **A department selector** appears on My Team when more than one department is
  in scope, narrows the list, and appears in the applied-filter list so it can
  be removed. Its options name the division, because a department name is unique
  only inside one.

## 4. Two defects this phase fixed in the scope model

- **The mock session widened a lead's divisions.** `scopedDivisionIds` unioned
  the appointment's division, while the server (Phase B2) deliberately does not.
  A demo that grants more than the database does proves the wrong thing; the
  mock now matches, and `inDivisionScope` still unions the appointment's
  division for the lead's own department reach while keeping the government
  check.
- **Project mutation was authorized by division alone.** With appointments
  unioned into the division scope, an appointment-only lead could create and
  edit projects. `canManageProject` now requires the project's own manager or a
  role that carries project management, so project authority and department
  authority stay separate (`OH-FE-0310`) — while reading the division's projects
  is unchanged.

## 5. Evidence

| Check | Result |
|---|---|
| `placement-history.test.ts` | 5 passed — scheduled vs ended, transfers inside one division, a second division that is not a transfer, multi-placement description |
| `placement-form.test.tsx` | 4 passed — department options follow the selected division, a stale department is cleared, the effective lead is `readonly` context with no Team Lead field, history labels an ended placement correctly |
| `department-capabilities.test.ts` | 8 passed — routes open and close with the appointment, navigation keeps self-service, no HR or administration route, scope described in words |
| `department-scope.test.tsx` | 8 passed — member rows scoped to the viewer's departments, restricted divisions excluded, the selector narrows, no-member and not-yet-started states, project authority separate, government permission still required |
| Frontend suite | 945/945 |
| Backend suites | 416/416 (unchanged) |
| `typecheck`, `eslint`, contrast 48/48, `next build` | clean (one pre-existing `session-provider.tsx` warning) |

A seeded scheduled hand-over supports the demo: WesternCF Sales is led by
Farhana Islam until 30 November 2026 and by Sumaiya Noor from 1 December,
written exactly as `appointLead` would write it — the outgoing period closed the
day before the new one starts.

## 6. `OH-FE-0314` — why the browser journeys cannot pass yet

`scripts/_ohfe03-probe.mjs` contains both journeys (HR placing one employee in
two divisions; an appointed lead reaching the surfaces the appointment grants
and nothing more) and **exits 2 with a stated precondition**, because the
screens cannot answer in a browser:

- `src/services/runtime/hr.ts` routes HR reads to the server through
  `partialService`, and `serverHrService` implements no directory, assignment or
  department-option operation — so `/employees` itself answers "not available
  from the server yet".
- `src/services/runtime/team-lead.ts` is still `unavailableService`, so `/team`
  answers the same way.

Both are Backend Phase 9 adapter work (`BE-0902`), not F3 behaviour. The probe
is written so it starts passing the day those adapters land; until then the
behaviour is carried by the four test files above, which run against the same
screens through the mock. For the same reason the responsive, accessibility and
stress gates cannot say anything about these screens in a browser today — they
would measure the unavailable state — which is why the phase's "frontend quality
gates pass" criterion stays `[~]` rather than being claimed from a run that
proves nothing.
