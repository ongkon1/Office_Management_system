# Backend Phase 12 Verification — Finance into HR

Date: 19 November 2026  
Status: Complete  
Migration: `0018_finance_role_consolidation.sql`

## Outcome

The active Finance Manager role is retired and cannot be assigned. Every account
that held the role at migration time receives the active HR Manager role. The
historical `finance_manager` value remains present in `roles`, requisition and
conveyance review enums, audit JSON, and rendering contracts.

This phase preserves the narrower Phase 12 permission boundary: HR does not gain
`finance.cost.view` by role. A former Finance Manager receives an unscoped
personal grant only when the retired role previously supplied that permission.
The wider amended `REQ-RBAC-017` grant remains Backend Phase 14 work and must cut
over atomically with Frontend Phase 12.

## Task Evidence

| Task | Evidence |
|---|---|
| BE-1201 | `RoleKey` excludes `finance_manager`; `StoredRoleKey` retains it; migration sets the stored role inactive; all assignment paths accept active roles only. |
| BE-1202–BE-1203 | Migration evidence records prior HR and cost state and creates only the required HR role and personal cost grant. Recovery removes only created rows. |
| BE-1204 | HR owns `report.finance.read`, period verification, and export workflow capabilities in `authorization/policy.ts`; no active Finance role exists. |
| BE-1205 | `PARALLEL_REVIEWER_ROLES` is HR plus Super Admin. A Finance-era mid-chain decision remains history and does not replace either current decision. |
| BE-1206 | Cost, rate and budget services continue to check `finance.cost.view`; salary and protected export remain independently permissioned. |
| BE-1207 | Historical decisions are untouched. Migration and recovery append system audit events with reason, correlation and before/after state. |
| BE-1208 | Development seed contains two HR accounts: user 5 has the personal cost grant and user 4 does not. The retired role is seeded inactive. |
| BE-1209 | Authorization and existing reporting/project integration tests prove cost redaction and protected-operation refusal without the explicit permissions. |
| BE-1210 | Isolated MySQL migration tests preserve Finance-era requisition, conveyance and audit records through forward migration and rollback. |
| BE-1211 | The isolated production-like rehearsal and local migration both passed. The product-owner request to complete Phase 12 is the milestone sign-off; production execution still follows the normal deployment/change-window approval. |

## Rehearsal Reconciliation

The isolated rehearsal included a current Finance user, a Finance-era
requisition decision, a Finance-era conveyance decision, and a Finance-role audit
event. Forward migration and recovery both passed.

The local database reconciliation after applying migration 0018 reported:

```text
financeRoleAssignable: false
hrRoleHasCostPermission: false
affectedUsers: 1
hrRolesCreated: 1
costAccessBefore: 1
costGrantsCreated: 1
migrationAuditEvents: 1
```

The local database contained no Finance-era requisition or conveyance rows; the
isolated production-like rehearsal supplies the preservation proof for those
record types.

## Commands and Results

- `npm run db:validate` — 18 forward migrations and matching recovery scripts passed.
- Focused authorization tests — 3/3 passed.
- Shared approval-chain tests — 7/7 passed.
- Finance-role migration integration tests — 2/2 passed.
- `npm run db:migrate` — migration 0018 applied locally.
- `npm run db:role-consolidation-report` — reconciliation shown above.

The final repository-wide typecheck, lint, backend suites, security audit and
production build are recorded in the completion handoff.

