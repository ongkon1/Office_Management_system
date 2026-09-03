# Demo Roles, Accounts, and Sample Organization

Covers `FE-0007` (demo roles and sample accounts) and `FE-0008` (sample organization and demo dataset).

All values below are **development-only fixtures**. They must never be seeded into a production environment, and no fixture password is a real credential.

## 1. Demo Accounts (`FE-0007`)

| # | Name | Employee ID | Email | Role | Primary division | Notes |
|---|---|---|---|---|---|---|
| 1 | Nadia Rahman | `EMP-1001` | `nadia.rahman@demo.local` | Employee | PowerInAI | Multi-division: PowerInAI 50%, Government Projects 30%, WesternCF 20%. Drives `DEMO-01`. |
| 2 | Tanvir Ahmed | `EMP-1002` | `tanvir.ahmed@demo.local` | Employee | Computer Jagat | Overtime and critical scenarios (`DEMO-02`, `DEMO-03`). |
| 3 | Sadia Karim | `EMP-1003` | `sadia.karim@demo.local` | Employee | PowerInAI Training | Under-time, missing days, approved leave, and WFH scenarios. |
| 4 | Imran Hossain | `EMP-2001` | `imran.hossain@demo.local` | Team Lead | PowerInAI | Team Lead for `EMP-1001`, `EMP-1002`, `EMP-1004`. Drives `DEMO-04`, `DEMO-05`. |
| 5 | Farhana Islam | `EMP-2002` | `farhana.islam@demo.local` | Team Lead | Government Projects | Government-project scope owner. Drives `DEMO-09` restricted-data checks. |
| 6 | Rezaul Haque | `EMP-3001` | `rezaul.haque@demo.local` | HR Manager | PowerInAI | Verification and evaluation publication. Drives `DEMO-06`. |
| 7 | Mahmuda Akter | `EMP-4001` | `mahmuda.akter@demo.local` | Finance Manager **with** financial permission | PowerInAI | Sees cost, rate, and payroll fields. Drives `DEMO-07`. |
| 8 | Shakil Chowdhury | `EMP-4002` | `shakil.chowdhury@demo.local` | Finance Manager **without** financial permission | PowerInAI | Sees verified hours only; every cost field renders redacted. Drives `AC-AUTH-003`. |
| 9 | Ayesha Siddika | `EMP-5001` | `ayesha.siddika@demo.local` | Management / View-Only | — | No mutating control anywhere. Drives `DEMO-08`. |
| 10 | Arif Mahmud | `EMP-9001` | `arif.mahmud@demo.local` | Super Administrator | — | Divisions, users, roles, policies, holidays, audit. |
| 11 | Sumaiya Noor | `EMP-1004` | `sumaiya.noor@demo.local` | Employee | WesternCF | Temporary assignment plus expired-assignment validation case. |
| 12 | Rafiq Chowdhury | `EMP-1090` | `rafiq.chowdhury@demo.local` | Employee | Computer Jagat | **Locked** account. Added in Phase 2 so the locked sign-in state is demonstrable. |
| 13 | Nusrat Jahan | `EMP-1091` | `nusrat.jahan@demo.local` | Employee | Computer Jagat | **Inactive** account. Added in Phase 2 so the deactivated sign-in state is demonstrable. |

### 1.1 Credentials and Auth Fixtures (added in Phase 2)

| Item | Value | Purpose |
|---|---|---|
| Password, every account | `Demo1234!` | Shown in the demo account picker on `/login`. |
| Two-factor code | `123456` | Only Arif Mahmud (Super Administrator) has 2FA enabled, so the verification step is reachable without forcing it on every sign-in. |
| Failed-attempt lockout | 5 attempts | Demonstrates the lockout path without a fixture account. |
| Session length | 30 minutes | Long enough to work, short enough to demo. The expiry warning appears at 5 minutes remaining; the demo tools panel can shorten it on demand. |
| Reset link, valid | `/reset-password?token=demo-valid-token` | Successful reset. |
| Reset link, expired | `/reset-password?token=demo-expired-token` | Expired-link state. |
| Reset link, invalid | `/reset-password?token=demo-invalid-token` | Invalid or already-used link state. |

Accounts 12 and 13 are additions to the original Phase 0 set. They exist only to make the locked and inactive sign-in screens (`FE-0204`) demonstrable, and they hold no time, task, or request data.

Rules:

- The demo account picker is rendered only when `NEXT_PUBLIC_DEMO_MODE` is enabled and is never present in a production build.
- Two Finance accounts exist deliberately so the separately granted financial permission (`REQ-RBAC-017`, `REQ-NFR-SEC-004`) is demonstrable side by side.
- Account 5 exists so government-project scoping (`AC-AUTH-004`) can be shown from both an authorized and an unauthorized viewpoint.
- Every account resolves to exactly one default dashboard route as listed in `information-architecture.md`.

## 2. Divisions

| Division | Code | Team Lead | Government data | Notes |
|---|---|---|---|---|
| PowerInAI | `PIA` | Imran Hossain | No | Primary product division. |
| PowerInAI Training | `PIT` | Imran Hossain | No | Training delivery. |
| Government Projects | `GOV` | Farhana Islam | **Yes** | Restricted by default (`REQ-NFR-SEC-004`). |
| Computer Jagat | `CJG` | Imran Hossain | No | Publishing/editorial work. |
| WesternCF | `WCF` | Farhana Islam | No | Client services. |

## 3. Assignments

| Employee | Division | Primary | Allocation | Expected weekly hours | Start | End | Active |
|---|---|---:|---:|---:|---|---|---|
| Nadia Rahman | PowerInAI | Yes | 50% | 17.5 | 2025-01-01 | — | Yes |
| Nadia Rahman | Government Projects | No | 30% | 10.5 | 2025-03-01 | — | Yes |
| Nadia Rahman | WesternCF | No | 20% | 7 | 2025-06-01 | — | Yes |
| Tanvir Ahmed | Computer Jagat | Yes | 100% | 35 | 2024-09-15 | — | Yes |
| Sadia Karim | PowerInAI Training | Yes | 80% | 28 | 2025-02-01 | — | Yes |
| Sadia Karim | PowerInAI | No | 20% | 7 | 2025-02-01 | — | Yes |
| Sumaiya Noor | WesternCF | Yes | 100% | 35 | 2025-04-01 | — | Yes |
| Sumaiya Noor | Government Projects | No | 25% | 8.75 | 2026-07-01 | 2026-08-31 | No (expired temporary assignment) |

Sumaiya Noor's expired temporary assignment exists to demonstrate `REQ-ORG-009`: a time entry dated after 2026-08-31 against Government Projects must be rejected with a field-level explanation.

Nadia Rahman's concurrent allocation totals exactly 100%. Sadia Karim's totals 100%. A deliberate over-allocation case is created during the demo by adding a temporary 30% assignment, which must raise the `REQ-ORG-010` warning without blocking the save.

## 4. Projects

| Project | Code | Division | Manager | Status | Estimated hours | Budget visible to |
|---|---|---|---|---|---:|---|
| Vision Platform v2 | `PIA-VP2` | PowerInAI | Imran Hossain | Active | 640 | Finance with `F` |
| AI Literacy Bootcamp | `PIT-ALB` | PowerInAI Training | Imran Hossain | Active | 220 | Finance with `F` |
| National Records Digitisation | `GOV-NRD` | Government Projects | Farhana Islam | Active | 900 | Finance with `F`, restricted otherwise |
| Monthly Issue Production | `CJG-MIP` | Computer Jagat | Imran Hossain | Active | 160 | Finance with `F` |
| Westbridge Portal Rollout | `WCF-WPR` | WesternCF | Farhana Islam | Active | 380 | Finance with `F` |
| Legacy Site Maintenance | `PIA-LSM` | PowerInAI | Imran Hossain | **Inactive** | 90 | — |

`PIA-LSM` is inactive so `REQ-WORK-008` (no new time against an inactive project) is demonstrable.

## 5. Tasks

| Task | Project | Assignee | Status | Estimate | Due | Demo purpose |
|---|---|---|---|---:|---|---|
| Model evaluation harness | `PIA-VP2` | Nadia Rahman | In Progress | 40 h | 2026-09-10 | Estimate vs actual |
| Inference latency profiling | `PIA-VP2` | Tanvir Ahmed | In Progress | 24 h | 2026-09-04 | Overtime source |
| Records intake schema | `GOV-NRD` | Nadia Rahman | In Progress | 60 h | 2026-09-18 | Restricted-data view |
| Cohort 7 curriculum update | `PIT-ALB` | Sadia Karim | Pending | 18 h | 2026-09-12 | Pending state |
| September layout pass | `CJG-MIP` | Tanvir Ahmed | Completed | 30 h | 2026-08-28 | Completed + actual time |
| Portal accessibility audit | `WCF-WPR` | Nadia Rahman | In Progress | 26 h | 2026-08-25 | **Overdue** state |
| Onboarding checklist | `WCF-WPR` | Sumaiya Noor | Pending | 8 h | 2026-09-30 | Checklist rendering |

## 6. Periods

| Period | Range | State |
|---|---|---|
| July 2026 payroll period | 2026-07-01 – 2026-07-31 | **Verified and locked** by HR, with one audited amendment on 2026-07-14. Carries 46 locked complete days across all four reported employees and five projects, so Finance has a substantive verified period to analyse (`FE-0601`–`FE-0606`) |
| August 2026 payroll period | 2026-08-01 – 2026-08-31 | Closed for entry, pending HR verification, 4 open exceptions |
| September 2026 payroll period | 2026-09-01 – 2026-09-30 | **Current and open** |

The demo "today" is **2026-09-02**. All relative states (today's summary, running timer, upcoming deadlines, overdue tasks) are computed against this fixed date so every presentation is reproducible.

## 7. Time Scenarios (`FE-0008`, feeding `FE-0902`/`FE-0903`)

| Scenario | Employee | Date | Composition | Expected result |
|---|---|---|---|---|
| Cross-division complete day | Nadia Rahman | 2026-09-01 | PowerInAI 3:00, Government Projects 2:00, WesternCF 2:00, break 1:00 | 7:00 active, 1:00 break, 8:00 total, **Complete**, three division contributions |
| Under-time | Sadia Karim | 2026-08-27 | Active 6:59, break 1:00 | 7:59 total, **Under-time** |
| Overtime | Tanvir Ahmed | 2026-08-26 | Active 8:30, break 1:00 | 9:30 total, **Overtime**, reason required and present |
| Boundary overtime | Tanvir Ahmed | 2026-08-25 | Active 11:00, break 1:00 | Exactly 12:00 total, **Overtime**, not Critical |
| Critical | Tanvir Ahmed | 2026-08-24 | Active 11:30, break 1:00 | 12:30 total, **Critical**, explanation required, Team Lead + HR notification preview |
| Missing | Sadia Karim | 2026-08-20 | No entry, working day, no leave | **Missing** |
| Approved full-day leave | Sadia Karim | 2026-08-19 | Annual leave approved | Not missing, no time requirement |
| Half-day leave | Sadia Karim | 2026-08-18 | Half-day sick leave + 3:30 active | Requirement adjusted to 3:30 active / 4:00 total, **Complete** |
| Company holiday | All | 2026-08-15 | Holiday calendar entry | Not missing |
| WFH day | Nadia Rahman | 2026-08-28 | Approved WFH, 7:00 active recorded with WFH location | Attendance = WFH, normal Complete day, no auto-generated hours |
| Overlap rejection | Nadia Rahman | 2026-09-02 (attempt) | PowerInAI 09:00–11:00 and Government Projects 10:00–12:00 | Rejected across divisions with field-level error |
| Inactive project rejection | Nadia Rahman | 2026-09-02 (attempt) | Time against `PIA-LSM` | Rejected with corrective guidance |
| Expired assignment rejection | Sumaiya Noor | 2026-09-02 (attempt) | Time against Government Projects | Rejected: assignment not effective on work date |
| Correction cycle | Tanvir Ahmed | 2026-08-26 | Team Lead remark → correction request → employee clarification → corrected entry | Full remark history preserved |
| Locked period | Nadia Rahman | 2026-07-14 | Verified period edit attempt | Locked state with amendment path shown |
| Running timer | Nadia Rahman | 2026-09-02 | Timer started 09:15 on `PIA-VP2` | Global running-timer indicator, recovery after refresh |

## 8. Requests and Evaluations

| Item | Employee | Detail | State |
|---|---|---|---|
| WFH request | Nadia Rahman | 2026-09-04, full day, client-portal work | Pending Team Lead decision |
| WFH request | Sadia Karim | 2026-08-28, full day | Approved by Imran Hossain |
| WFH request | Tanvir Ahmed | 2026-09-01, half day | Information requested |
| Leave request | Sadia Karim | 2026-08-19, annual, full day | Approved |
| Leave request | Sadia Karim | 2026-08-18, sick, half day | Approved |
| Leave request | Sumaiya Noor | 2026-09-15 – 2026-09-17, annual | Pending, with balance check |
| Leave balances | All employees | Annual 20, Sick 14, Casual 10, Unpaid unlimited | Partially consumed |
| Evaluation period | Q3 2026 (quarterly) | 2026-07-01 – 2026-09-30 | Open; Nadia and Tanvir assigned to Imran Hossain |
| Evaluation | Nadia Rahman, Q2 2026 | Complete with default 30/25/15/10/10/10 weighting | **Published** |
| Evaluation | Tanvir Ahmed, Q3 2026 | Team Lead draft in progress | **Unpublished** — invisible to the employee |

## 9. Reset Behavior

A development-only reset control (`FE-0904`) restores every fixture above to the state described here, including the fixed demo date of 2026-09-02, so each stakeholder walkthrough begins identically.
