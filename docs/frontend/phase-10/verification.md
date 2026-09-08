# Phase 10 — Role Consolidation: Finance into HR

HR absorbed everything the Finance Manager did, and the role was retired. The product presents five roles: Super Administrator, Team Lead, Employee, HR Manager, Management/View-Only.

## This Was a Permission Change First

Two regressions were possible, and both are silent — nothing crashes, the screens look right, and no existing test would have caught either.

### Trap one: the merge must not grant cost access

`finance.cost.view` was already a **per-user** grant, not a role property: `usr-4001` held it, `usr-4002` did not, and that pair is what proves `AC-AUTH-003`. The pre-existing HR account held none of it.

The tempting implementation is to give the HR role the Finance role's default permissions. That would hand **every HR account** salary, cost-rate and budget visibility as a side effect of a role merge. `REQ-RBAC-017` already forbids it — cost data is exposed "only through separately granted financial permissions" — and the §4 capability matrix already marks HR's cost access as permission-gated.

So `seedRolePermissions` in `src/services/mock/admin.ts` grants HR nothing new, and `roleDefaults` in `src/server/authorization/policy.ts` gained the Finance *capabilities* (`time.verified.read`, `report.finance.read`, `report.export`) but **not** `finance.cost.view` or `finance.salary.view`. The role changed who reaches the screens; the permission still decides who sees money on them.

`npm run audit:role-merge` checks this directly, on three accounts:

| Account | Expectation |
|---|---|
| HR **with** the permission | Reaches all eight finance routes |
| HR **without** it | No `BDT` figure on any of the five money routes; refused the three cost-only routes outright; sees `Restricted`, not a blank or a zero |
| The pre-existing HR account | No `BDT` figure anywhere — the account that was never Finance is where a role-level widening would show |

### Trap two: retiring the role must not erase history

`reviewerRole: 'finance_manager'` is stored on requisition and conveyance review rows. Deleting the value from the type would make every one of those rows unrenderable.

The type system now carries the distinction explicitly:

```
RoleKey        — assignable now       (finance_manager absent)
RetiredRoleKey — valid historically   (finance_manager)
StoredRoleKey  — either
```

A function that assigns a role cannot accept a retired one; a function that renders recorded history must handle it. `ReviewerRole` keeps `finance_manager` so timelines render, while `PARALLEL_REVIEWER_ROLES` drops it — which is what stops any *new* decision being recorded against it. The gate opens a requisition and a claim that Finance decided before the merge and asserts both still name the decider and keep their reason.

## The Chain Shrank

HR + Finance + Super Administrator was three parallel reviewers; it is now **two**. Shrinking `PARALLEL_REVIEWER_ROLES` was the whole change — the chain reads that list for "who still has to decide", so nothing else in `approval-chain.ts` needed touching. Every "all three" sentence, count and label in requisition and conveyance changed with it.

A consequence worth naming: **two HR accounts are not two votes.** The stage tracks roles, not people, so a second HR user deciding after HR has already decided is refused. Both unit suites and both browser gates now assert that explicitly, because the previous versions passed by accident once `usr-4001` became HR.

## Defects Found

**A pre-existing false FAIL in `phase2-flows.mjs`.** The printed verdict compared `path === '/finance/payroll'` while the page had navigated to `/finance/project-costs`, so that line printed **FAIL on every run** while the `check()` calls beneath it passed and the gate exited zero. It was not caused by this phase, but a permanently red line that never fails a build teaches people to ignore red lines. Fixed.

**Two flow assertions read `main` for a message rendered in a portal.** The decision dialog is a `createPortal`, so a validation message inside it is never part of `main` — those checks could only ever have passed by reading something else. Now read `body`.

## Evidence

| Gate | Result |
|---|---:|
| `npm run audit:role-merge` (new) | 34/34 |
| `npm run verify` | 409 tests, contrast 48/48, clean build |
| `npm run audit:requisition` | 45/45 |
| `npm run audit:conveyance` | 45/45 |
| `npm run audit:task-review` | 26/26 |
| `npm run audit:a11y` | 279/279 |
| `npm run audit:stress` | 73/73 |
| `npm run audit:journeys` | 41/41 |
| `npm run audit:flows` · `flows6` · `flows7` | all pass |
| `npm run audit:responsive` | 0 failures |

The dev server for this run was on **:3001**; port 3000 was occupied by an unrelated application, so the gates were invoked with `--url=http://localhost:3001`.

## Still Open

**`project_requirement.md` has not been amended, and it is the source of truth.** It still defines the Finance Manager in `REQ-RBAC-003`, `-016`, `-017`, `-018`, `REQ-DASH-007`, `REQ-RPT-004`, `REQ-RPT-010`, the §4 role list, the §4 capability matrix, and the §6.4 workflow. The build now diverges from it. That amendment needs business sign-off; it is not a developer's call.

**Separation of duties has narrowed, and this should be a decision rather than a side effect.** HR verifies payroll periods (`REQ-RBAC-015`) and Finance consumed the verified result (`REQ-RPT-010`, §6.4). One role now does both. That may be right for a company this size, but the check that existed is gone.

**Two reviewers, not one.** `FE-1001` was implemented as HR + Super Administrator. If the intent was that HR alone decides a requisition or a claim, that is a different chain and a further change.

**Nobody inherited `finance.cost.view`.** The two former Finance accounts kept what they had; no other HR account gained anything. If named HR users are meant to hold it, an administrator grants it per user.
