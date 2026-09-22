# Backend Milestone Plan

## Multi-Division Employee Timesheet and Work Management System

| Field | Decision |
|---|---|
| Delivery order | Backend begins after the frontend contracts and priority flows are stable |
| Application model | One full-stack Next.js application, not separate frontend and backend projects |
| Application framework | Next.js App Router with TypeScript |
| Database | MySQL |
| Requirements source | `project_requirement.md` |
| Frontend contract source | `frontend_milestone.md` and the implemented frontend service interfaces |
| Backend goal | Secure, auditable, testable business logic and persistence that replace frontend mock adapters without redesigning approved screens |

## 0. Product Design Alignment

The backend supports a single modern enterprise SaaS product: a role-based employee operations workspace for time, projects, attendance, HR, Finance, and management reporting. The frontend remains the visual source of truth; backend work must preserve its approved information architecture, responsive behavior, and interaction states.

### Frontend milestone handoff

| Frontend phase | Current status | Backend implication |
|---:|---|---|
| 0–7 | Done | Contracts, routes, workflows, and supporting screens are available for service implementation. |
| 8 | Done (17/18; FE-0825 awaiting visual review) | Accessibility, responsive, stress, journey, and performance evidence is available; retain these states in API responses. |
| 9 | Next (0/14) | Demo packaging and final mock-to-service cutover define the integration handoff. |
| 10–12 | 10 done; 11 in progress (9/26); 12 pending (0/25) | Role consolidation, Meeting Minutes and Client Panel are mirrored by Backend Phases 12–14; Frontend Phase 12 and Backend Phase 14 must cut over together. |

### SaaS experience principles (non-functional design contract)

- Preserve the frontend's clean, spacious enterprise layout: predictable navigation, clear page hierarchy, scannable metric cards, and data-dense tables that remain usable on mobile.
- Return explicit loading, empty, validation, error, conflict, permission-denied, and success outcomes so screens can render complete product states without guessing.
- Enforce authorization before aggregation or search; restricted fields must be omitted or marked `Restricted`, never blanked or inferred by the UI.
- Keep domain calculations, status labels, durations, money precision, and audit evidence canonical so every dashboard, table, export, and notification presents consistent information.
- Do not introduce visual, route, workflow, or color-theme changes through backend implementation. Any presentation change belongs in `frontend_milestone.md` and the shared UI tokens.

The detailed frontend plan and task evidence remain in [`frontend_milestone.md`](frontend_milestone.md); this document tracks the server-side work required to make that SaaS experience authoritative.

## 1. Task Status Convention

Use exactly one status marker on every tracked task:

- `[ ]` Pending - work has not started.
- `[~]` In progress - work is actively being implemented or reviewed.
- `[x]` Done - work is implemented, tested, reviewed, and satisfies its acceptance criteria.

Tracking rules:

- Every task must have exactly one marker.
- Change `[ ]` to `[~]` when implementation begins.
- Change `[~]` to `[x]` only after code, automated tests, security checks, and applicable operational checks pass.
- Return a completed task to `[~]` if a material regression or requirement change reopens it.
- Phase progress is calculated from numbered `BE-*` tasks. Exit-criteria checkboxes are gates and are not included in task totals.
- A phase is complete only when every required task and exit criterion in that phase is done.

## 2. Backend Architecture Boundaries

### 2.1 One Next.js Application

- Frontend routes, server-rendered reads, application mutations, external APIs, scheduled jobs, and database access will live in one Next.js repository.
- Server Components should perform authenticated page reads through application services.
- Server Actions should handle first-party UI mutations when they provide a clean form/action boundary.
- Route Handlers should handle external REST endpoints, webhooks, integration callbacks, file delivery, and endpoints that require an HTTP contract.
- Business rules must live in framework-independent domain/application services rather than React components, pages, Server Actions, or Route Handlers.
- Database queries must be isolated behind repositories so business services and tests do not depend directly on the selected ORM/query builder.
- Long-running exports, notifications, imports, and integration synchronization must run outside interactive request latency through a durable job mechanism selected in Phase 0.

### 2.2 Data and Time Rules

- MySQL will be the authoritative operational datastore.
- Store clock instants in UTC and store the applicable local work date, business timezone, and policy version needed to reproduce daily calculations.
- Store durations as integers, never floating-point hours.
- Store financial rates and amounts in fixed-precision decimal columns with an explicit currency.
- Use effective-dated records for assignments, work policies, holidays, evaluation weights, and cost rates.
- Use database transactions for operations that change multiple related records or derived summaries.
- Preserve historical records through deactivation, versioning, or audited amendments; do not cascade-delete business history.

### 2.3 Security Boundaries

- Authentication proves identity; authorization must be checked independently for every query and mutation.
- Authorization must support role, division, project, record ownership, workflow state, and field-level restrictions.
- Government-project, salary, cost, evaluation, export, attachment, and audit data must be denied by default.
- UI visibility is not a security control. Server Components, Actions, Route Handlers, jobs, exports, and search must all enforce the same policies.
- Audit logging must be append-only for application users and must record sensitive reads and material state changes.

### 2.4 Backend Definition of Done

A backend task may be marked `[x]` only when all applicable conditions are true:

- The implementation follows the approved domain and frontend contract.
- Input validation, authentication, authorization, transactions, idempotency, and error handling are present where required.
- Unit, integration, authorization, and workflow tests cover normal and important failure paths.
- Sensitive data is absent from unsafe logs, errors, notifications, caches, and responses.
- Database changes include forward and rollback/recovery guidance and work on an empty database and representative existing data.
- Observability identifies failures without leaking protected content.
- Relevant requirement IDs and backend task IDs are traceable in tests or technical documentation.
- Type checks, lint checks, automated tests, and the production build pass.

## 3. Milestone Overview

| Phase | Name | Demonstrable outcome |
|---:|---|---|
| 0 | Architecture and delivery foundation | Technical decisions, contracts, environments, and quality gates are recorded. |
| 1 | MySQL schema and data foundation | Versioned schema, migrations, seed data, repositories, and transaction conventions work. |
| 2 | Authentication, authorization, and audit | Secure sessions, role/scope policies, protected fields, and immutable audit evidence work. |
| 3 | Organization, projects, and tasks | Employees, divisions, assignments, projects, tasks, and files persist with correct scope rules. |
| 4 | Timesheet calculation and correction | Time entry, timers, breaks, classifications, validation, remarks, corrections, and verification work end to end. |
| 5 | HR, attendance, WFH, leave, workload, and evaluation | HR workflows and periodic evaluation operate on authoritative data. |
| 6 | Reporting, Finance, and exports | Permission-safe reports, costing, payroll summaries, and durable exports reconcile to source data. |
| 7 | Notifications, documents, search, and integrations | Supporting services and controlled external interfaces operate reliably. |
| 8 | Quality, performance, backup, and security hardening | The system passes automated, load, recovery, and security gates. |
| 9 | Production readiness and frontend cutover | Mock services are removed, data is migrated, operations are documented, and release is approved. |
| 10 | Requisition | Employees and Team Leads raise requisitions that route through the correct review chain, visible only to the roles they have reached. |
| 11 | Conveyance | Travel claims with optional receipts travel the same review chain, with attachment access bound to the claim's own visibility. |
| 12 | Role consolidation: Finance into HR | The Finance Manager role is retired without rewriting history or widening anyone's access to cost data. |
| 13 | Meeting Minutes and AI task generation | Every active role can access authorized minutes; queued AI processing produces validated, traceable tasks without losing the original minute. |
| 14 | Client Panel reporting | HR and Super Administrators read authorized employee hours and internal labour cost by client for a verified period, and export the same result. |

## 4. Detailed Phase Tasks

## Phase 0 - Architecture and Delivery Foundation

### Confirmed Foundations

- [x] `BE-0001` Baseline backend scope against `project_requirement.md`.
- [x] `BE-0002` Confirm a single Next.js full-stack repository rather than separate frontend and backend applications.
- [x] `BE-0003` Confirm Next.js with TypeScript as the application framework.
- [x] `BE-0004` Confirm MySQL as the production database.
- [x] `BE-0005` Adopt the shared `[ ]`, `[~]`, and `[x]` task tracking convention.

### Technical Decisions

- [x] `BE-0006` Inventory the implemented frontend mock queries, mutations, view models, validation shapes, pagination, sorting, filters, and permission outcomes. See `docs/backend/phase-0/service-contract-inventory.md`.
- [x] `BE-0007` Select and record the MySQL ORM or query builder after validating transactions, compound indexes, migrations, decimal handling, date/time handling, and Next.js deployment compatibility. Drizzle ORM/Kit with `mysql2`; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0008` Select and record the authentication/session implementation after validating credentials, database sessions, 2FA, reset flows, revocation, and server-side authorization integration. Better Auth with database sessions and 2FA; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0009` Select and record the schema-validation library and establish shared server/client validation ownership. Zod 4; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0010` Select and record the durable job mechanism for exports, notifications, scheduled checks, and integration retries. BullMQ with Redis and a separate worker; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0011` Select and record file/object storage for profile photos, attachments, documents, and generated exports, including local development behavior. Private Amazon S3 plus a development filesystem adapter; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0012` Select and record transactional email and any initial in-app notification delivery provider. Resend plus a development capture adapter; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0013` Define whether the initial deployment uses a persistent Node server, containers, or another Next.js-compatible runtime and document runtime limitations. Persistent Node.js 24 LTS Linux containers with separate web/worker processes; see `docs/backend/phase-0/technology-decisions.md`.
- [x] `BE-0014` Record supported MySQL version, character set, collation, SQL mode, connection-pool strategy, and migration ownership. MySQL 8.4 LTS; see `docs/backend/phase-0/technology-decisions.md`.

### Application Structure and Contracts

- [x] `BE-0015` Define module boundaries for access, organization, work, time, HR, evaluation, reporting, Finance, collaboration, notifications, integrations, files, and audit. See `docs/backend/phase-0/backend-foundation.md`.
- [x] `BE-0016` Define shared layers for domain rules, application services, authorization policies, repositories, job handlers, Server Actions, and Route Handlers. See `docs/backend/phase-0/backend-foundation.md`.
- [x] `BE-0017` Define canonical error codes for validation, unauthenticated, forbidden, not found, conflict, locked period, rate limit, dependency failure, and internal failure. See `src/contracts/results.ts` and `docs/backend/phase-0/backend-foundation.md`.
- [x] `BE-0018` Define request correlation, idempotency key, audit context, actor context, timezone, locale, and policy-version propagation. See `docs/backend/phase-0/backend-foundation.md`.
- [x] `BE-0019` Define transaction boundaries for time entry, timers, corrections, request decisions, overrides, period verification, evaluations, exports, and integration imports. See `docs/backend/phase-0/backend-foundation.md`.
- [x] `BE-0020` Map frontend service interfaces to server-side use cases without exposing database records directly to UI components. See `docs/backend/phase-0/service-contract-inventory.md`.
- [x] `BE-0021` Create a requirement-to-module and requirement-to-test traceability matrix for backend MVP requirements. See `docs/backend/phase-0/traceability.md`.
- [x] `BE-0022` Define development, test, staging, and production configuration ownership and secret handling. See `docs/backend/phase-0/backend-foundation.md`.

### Quality Gates

- [x] `BE-0023` Configure backend unit, database integration, API/action integration, authorization, and end-to-end test layers. See `vitest.backend.config.mts`, `playwright.config.ts`, and `docs/backend/phase-0/quality-gates.md`.
- [x] `BE-0024` Configure type-check, lint, test, migration validation, security scan, and production-build commands for continuous integration. See `package.json`, `scripts/validate-migrations.mjs`, `.github/workflows/quality.yml`, and `docs/backend/phase-0/quality-gates.md`.
- [x] `BE-0025` Define code-review rules for schema changes, authorization changes, financial logic, time calculations, audit behavior, and integrations. See `docs/backend/phase-0/backend-foundation.md`.

### Phase 0 Exit Criteria

- [x] Every frontend mock operation has a named backend use case, owner, permission rule, and expected response/error contract.
- [x] ORM/query, authentication, validation, job, file-storage, email, runtime, and MySQL environment decisions are documented.
- [x] Module boundaries and automated quality gates are approved before schema implementation begins.

## Phase 1 - MySQL Schema and Data Foundation

### Database Tooling and Conventions

- [x] `BE-0101` Configure development and test MySQL connections with least-privilege database users.
- [x] `BE-0102` Configure the selected database library, connection pooling, health checks, timeouts, retry boundaries, and graceful shutdown.
- [x] `BE-0103` Establish versioned migration commands for create, apply, status, rollback/recovery, and CI validation.
- [x] `BE-0104` Define table/column naming, primary-key format, foreign keys, check constraints, unique constraints, timestamps, optimistic versioning, and soft-deactivation conventions.
- [x] `BE-0105` Define UTC instant, local date, local time, timezone, integer duration, fixed decimal, currency, and JSON usage conventions.
- [x] `BE-0106` Prohibit floating-point storage for durations, allocation percentages requiring precision, cost rates, and money.

### Access and Organization Schema

- [x] `BE-0110` Create users, credentials/authentication identity, sessions, login history, roles, permissions, user roles, and scoped grants.
- [x] `BE-0111` Create employees, divisions, teams, employee-division assignments, work policies, policy versions, and holiday calendars.
- [x] `BE-0112` Add effective dates, active states, primary-division constraints, Team Lead relationships, allocation percentage, and expected weekly hours.
- [x] `BE-0113` Add constraints and service validation that protect historical users, employees, divisions, assignments, and policy versions from destructive deletion.

### Work and Time Schema

- [x] `BE-0120` Create projects, project members, tasks, task members, checklist items, and work attachments.
- [x] `BE-0121` Create time entries, timer sessions, daily breaks, daily summaries, timesheet periods, period verifications, unlocks, and amendments.
- [x] `BE-0122` Store work date, UTC instants, timezone, entry method, location, integer duration, descriptions, completed work, status, and policy version needed for reproducibility.
- [x] `BE-0123` Add indexes supporting employee/date overlap checks, daily aggregation, division/project/task reporting, timer uniqueness, exception queries, and verified-period reads.
- [x] `BE-0124` Design the one-running-timer-per-employee invariant so concurrent requests cannot create multiple active timers.

### HR, Finance, and Supporting Schema

- [x] `BE-0130` Create WFH requests, leave types, leave balances, leave requests, attendance days, evaluation periods, evaluations, responses, scores, and general remarks.
- [x] `BE-0131` Create workload allocation, cost rates, budgets, payroll periods, report definitions, export jobs, and export artifacts.
- [x] `BE-0132` Create notifications, delivery attempts, documents, document versions, messages, comments, announcements, attachments, and search metadata needed by enabled phases.
- [x] `BE-0133` Create integration connections, encrypted credential references, sync cursors, webhook endpoints, webhook deliveries, idempotency records, and job records.
- [x] `BE-0134` Create append-only audit event storage with actor, impersonator if applicable, action, resource, scope, timestamp, reason, correlation ID, and protected before/after representation.

### Seed Data and Repository Foundation

- [x] `BE-0140` Seed the five initial divisions through an idempotent seed process.
- [x] `BE-0141` Seed development-only users for all six roles, representative assignments, projects, tasks, time scenarios, requests, evaluations, costs, and reports.
- [x] `BE-0142` Include deterministic complete, under-time, overtime, critical, missing, leave, WFH, correction, locked, and restricted-data scenarios.
- [x] `BE-0143` Implement repository interfaces and database adapters without returning unrestricted database rows to higher layers.
- [x] `BE-0144` Add factories/builders for test data and isolate every automated database test.
- [x] `BE-0145` Test clean migration, upgrade migration, seed idempotency, constraint failures, rollback/recovery guidance, and representative query plans.

### Phase 1 Exit Criteria

- [x] A clean MySQL database can be migrated and seeded deterministically.
- [x] Required entities, effective dates, historical preservation, constraints, and indexes are represented.
- [x] Repository and transaction foundations pass isolated database integration tests.

## Phase 2 - Authentication, Authorization, and Audit

### Authentication

- [x] `BE-0201` Implement credential login using a modern password-hashing configuration and constant-time verification.
- [x] `BE-0202` Implement database-backed sessions with secure, HTTP-only, same-site cookies, rotation, expiration, revocation, and logout.
- [x] `BE-0203` Implement account active/inactive/locked state, failed-attempt throttling, lockout policy, and login history.
- [x] `BE-0204` Implement password reset tokens with single use, short expiry, secure storage, revocation, and non-enumerating responses.
- [x] `BE-0205` Implement two-factor enrollment, verification, recovery, reset, and audit behavior using the selected approach.
- [x] `BE-0206` Implement session-expiry and security-event responses expected by the frontend.
- [x] `BE-0207` Protect first-party mutations against cross-site request forgery and unsafe cross-origin access.
- [x] `BE-0208` Add per-account and per-origin rate limits for login, reset, 2FA, and other sensitive public endpoints.

### Authorization

- [x] `BE-0210` Implement a central authorization policy API used by Server Components, Server Actions, Route Handlers, jobs, search, reports, and exports.
- [x] `BE-0211` Implement role permissions for Super Administrator, Team Lead, Employee, HR Manager, Finance Manager, and Management/View-Only.
- [x] `BE-0212` Implement division-, project-, team-, ownership-, date-effective-, workflow-state-, and field-level scope checks.
- [x] `BE-0213` Implement deny-by-default policies for government projects, salary, cost rate, labour cost, evaluations, exports, documents, attachments, and audit data.
- [x] `BE-0214` Ensure Management/View-Only cannot mutate records through any server boundary.
- [x] `BE-0215` Ensure Team Leads are limited to effective assigned scope and Employees to their own records unless an explicit grant applies.
- [x] `BE-0216` Prevent object-identifier guessing from revealing record existence through status codes, timings, search, counts, exports, or file URLs.
- [x] `BE-0217` Implement permission-aware response mapping so restricted fields are omitted rather than merely hidden by the frontend.

### Audit and Security Operations

- [x] `BE-0220` Implement append-only audit recording for authentication, changes, decisions, overrides, verification, permissions, integration settings, file access, and exports.
- [x] `BE-0221` Redact secrets, password material, tokens, raw integration credentials, and disallowed sensitive values from audit payloads.
- [x] `BE-0222` Implement audited administrative impersonation only if explicitly approved; otherwise prohibit it.
- [x] `BE-0223` Implement encryption/key-management boundaries for application secrets, integration credentials, protected files, and backups.
- [x] `BE-0224` Add authorization matrix tests covering allow and deny cases across all roles, scopes, sensitive fields, record states, and server entry points.
- [x] `BE-0225` Add authentication tests for enumeration, brute force, session fixation, session revocation, reset replay, 2FA recovery, cookie flags, and CSRF.

### Phase 2 Exit Criteria

- [x] All six roles can authenticate and receive server-enforced access matching the approved matrix. *(Requirements-derived matrix approved by the user on 2026-09-06; engineering verification passes.)*
- [x] Direct calls, identifiers, exports, search, jobs, and file access cannot bypass scope or protected-field rules.
- [x] Authentication and authorization security tests pass and material events are auditable.

## Phase 3 - Organization, Projects, and Tasks

### Employees, Divisions, and Assignments

- [x] `BE-0301` Implement division create, update, activate, and deactivate use cases with historical-reference protection.
- [x] `BE-0302` Implement employee create, update, activate, deactivate, profile read, and directory search use cases.
- [x] `BE-0303` Implement profile-photo attachment metadata and authorized delivery through the selected storage adapter.
- [x] `BE-0304` Implement employee-division assignment create, update, end, activate, deactivate, and history queries.
- [x] `BE-0305` Enforce one primary division for an active employee when required and validate effective assignment date ranges.
- [x] `BE-0306` Validate planned allocation and return a warning, rather than silently changing data, when concurrent allocation differs from 100 percent.
- [x] `BE-0307` Implement temporary assignments with required start/end dates and prevent new time outside their effective period.
- [x] `BE-0308` Implement role and Team Lead assignment changes with authorization, effective dates where required, and audit records.

### Projects and Membership

- [x] `BE-0310` Implement project create, update, activate/close, membership, search, filtering, and scoped detail queries.
- [x] `BE-0311` Enforce exactly one division per project and validate manager/member access against effective assignments.
- [x] `BE-0312` Implement project estimates, deadlines, priority, budget visibility, completion percentage, client/stakeholder, notes, and attachment metadata.
- [x] `BE-0313` Calculate actual project hours from valid time entries rather than accepting a manually edited actual-hours total.
- [x] `BE-0314` Protect project deactivation/closure and preserve historical tasks, time, files, and audit references.

### Tasks

- [x] `BE-0320` Implement task create, update, assign, support-member, checklist, attachment, and scoped query use cases.
- [x] `BE-0321` Enforce Pending, In Progress, and Completed as the initial task statuses and validate allowed transitions.
- [x] `BE-0322` Enforce task-project-division consistency and effective employee authorization.
- [x] `BE-0323` Calculate actual task time from valid linked time entries and derive overdue state from status and due date.
- [x] `BE-0324` Implement task list filters, pagination, sorting, due-date views, and employee/team scopes expected by the frontend.
- [x] `BE-0325` Add transaction, conflict, authorization, deactivation, and concurrency tests for organization, project, membership, and task workflows.

### Employee-Raised Tasks

An employee raises a task for themselves and their Team Lead endorses it. A Team Lead may use the same narrow self-task boundary, but their task is stored as `team_lead` origin with `review_state = not_required`; it never enters a review queue. Frontend behaviour is built (`FE-0780`-`FE-0784`); this is the server half.

- [x] `BE-0330` Add the task review state, reviewer, decided-at and note columns, with a constraint that a task created by a non-Team-Lead cannot be persisted as needing no review. Team Lead self-tasks are explicitly persisted as `team_lead` origin and `not_required`.
- [x] `BE-0331` Enforce that only the creator's own current Team Lead may decide, and that nobody may endorse a task they raised.
- [x] `BE-0332` **Refuse a time entry against a task that is not approved**, in the same server-side validation that already refuses an inactive project. This is the rule the whole feature rests on: a filtered task list is a convenience, and the entry endpoint is the control.
- [x] `BE-0333` Make the decision idempotent and conflict-safe, and keep it append-only so who endorsed what stays reproducible.
- [x] `BE-0334` Handle the Team Lead mapping changing while a task is pending, so a raised task can never become unreviewable.
- [x] `BE-0335` Restrict the personal-task create payload to the creator's own assigned divisions and active projects, ignoring any assignee or supporting members it carries. Force self-assignment; require review for Employees and bypass it only for Team Leads.
- [x] `BE-0336` Audit raise, approve and refuse with actor, role, before/after and reason, and notify the Team Lead on raise and the employee on decision.
- [x] `BE-0337` Test the time-entry refusal at every review state, review by the wrong Team Lead, self-endorsement, concurrent decisions, Team Lead reassignment mid-review, and Team Lead self-creation without a review notification.

### Phase 3 Exit Criteria

- [x] The frontend employee, division, project, and task mock adapters can be replaced by real services.
- [x] Effective assignments and project/task scope are enforced for reads and writes.
- [x] Actual project/task hours reconcile to stored valid time entries.
- [x] A task an employee raised accepts no time until their own Team Lead has approved it, enforced at the time-entry endpoint.
- [x] A self-assigned task created by a Team Lead needs no approval and accepts work only after the ordinary transition to In Progress.

Phase 3 evidence is recorded in `docs/backend/phase-3/verification.md`: migration and recovery validation, transaction-aware MySQL repositories, organization/work services, protected profile-photo delivery, and 102 passing backend tests.

## Phase 4 - Timesheet Calculation and Correction

### Authoritative Calculation Engine

- [x] `BE-0401` Implement one framework-independent calculation engine used by entry validation, daily summaries, dashboards, reports, exports, evaluations, and APIs.
- [x] `BE-0402` Implement effective work-policy selection by employee, work date, and policy version.
- [x] `BE-0403` Calculate active time from valid entries across all divisions while retaining employee/division/project/task contribution breakdowns.
- [x] `BE-0404` Calculate recognized daily break separately and default a standard full day to one break hour.
- [x] `BE-0405` Restrict break overrides to the designated permission and require an override reason and audit event.
- [x] `BE-0406` Calculate daily total as active duration plus recognized break using integer duration arithmetic.
- [x] `BE-0407` Classify required days as Missing, Under-time, Complete, Overtime, or Critical using the approved thresholds.
- [x] `BE-0408` Require an overtime reason above eight total hours and a critical explanation above twelve total hours.
- [x] `BE-0409` Implement part-time, half-day leave, holiday, and other policy adjustments without changing the standard policy baseline.
- [x] `BE-0410` Implement business-timezone and cross-midnight attribution/splitting according to the configured policy. **Original scope delivered; under `modify_milestone.md` this remains applicable to historical clock rows only (`MFE-0107`, `MBE-0207`).**
- [x] `BE-0411` Persist the applied policy version so historical and verified results are reproducible after policy changes.

### Time Entry and Timer Use Cases

- [x] `BE-0420` Implement manual clock entry and direct-duration entry create, update, read, list, and permitted delete/deactivate use cases. **Original scope delivered; manual clock writes are superseded by `MBE-0201` and `MBE-0202`; duration writes become task work logs.**
- [x] `BE-0421` Implement copy-previous-entry as a new unverified draft with a new work date and full revalidation. **Original scope delivered; retargeted to work-log drafts by `MBE-0209`.**
- [x] `BE-0422` Implement timer start with an atomic one-running-timer-per-employee invariant. **Original scope delivered; timer writes are retired by `MBE-0103` and `MBE-0202`.**
- [x] `BE-0423` Implement timer read/recovery and idempotent stop-to-draft behavior across refresh, retry, or duplicate submission. **Original scope delivered; timer operations are retired by `MBE-0202`, with cutover handling defined by `MBE-0105`.**
- [x] `BE-0424` Validate required employee, date, division, project/task relationship, work location, description, completed work, and attachment/link information.
- [x] `BE-0425` Reject inactive projects, invalid tasks, unauthorized/effective-date divisions, invalid ranges, duplicates, and overlapping clock entries across divisions. **Original scope delivered; range and overlap checks remain historical-only, while work-log validation is replaced by `MBE-0203`–`MBE-0205`.**
- [x] `BE-0426` Detect approved leave/holiday conflicts and return a field/record-level error or authorized exception workflow as specified.
- [x] `BE-0427` Recalculate affected daily, weekly, monthly, division, project, task, workload, and evaluation projections transactionally or through reliable invalidation/jobs.
- [x] `BE-0428` Return typed validation codes and corrective guidance matching frontend error states.
- [x] `BE-0429` Ensure saving a normal daily entry never creates a Team Lead approval requirement.

### Remarks, Corrections, and Period Verification

- [x] `BE-0440` Implement the single general remark model linked to an employee and optionally a timesheet or task.
- [x] `BE-0441` Implement employee clarification, correction request, resolution state, notification trigger, and complete remark history.
- [x] `BE-0442` Implement correction authorization and immutable before/after history for changed time records.
- [x] `BE-0443` Implement HR reporting/payroll-period completeness checks and exception inventory.
- [x] `BE-0444` Implement HR period verification with transactionally fixed included records, calculation results, and applied policy versions.
- [x] `BE-0445` Implement authorized verified-period unlock or amendment with reason, audit, recalculation, and Finance visibility.
- [x] `BE-0446` Prevent ordinary mutations to verified records and return the frontend's locked-period conflict response.

### Calculation and Concurrency Tests

- [x] `BE-0450` Add boundary tests for 0, 6:59, 7:00, 7:01 active hours and totals of 7:59, 8:00, above 8:00, 12:00, and above 12:00.
- [x] `BE-0451` Add the cross-division acceptance case of 3 hours PowerInAI, 2 hours Government Projects, 2 hours WesternCF, and a separate 1-hour break.
- [x] `BE-0452` Add overlap, duplicate, invalid range, inactive project, unassigned division, leave, holiday, half-day, cross-midnight, daylight-saving, and timezone tests.
- [x] `BE-0453` Add concurrent timer-start, duplicate timer-stop, simultaneous time edit, summary recalculation, verification, and amendment tests.
- [x] `BE-0454` Add reconciliation tests proving entry, dashboard, report, export, evaluation, and Finance calculations use identical results.

### Phase 4 Exit Criteria

- [x] Employee and Team Lead frontend time/remark mock adapters can be replaced without changing approved UI behavior.
- [x] Calculation, validation, timer, correction, verification, amendment, and concurrency tests pass.
- [x] Daily totals are reproducible from source entries, break, leave/holiday context, timezone, and policy version.

Phase 4 evidence and task-to-deliverable mapping: `docs/backend/phase-4/verification.md`. All 33 numbered tasks are implemented; the prior denominator of 32 was corrected. Frontend service wiring remains scheduled for Phase 9.

## Phase 5 - HR, Attendance, WFH, Leave, Workload, and Evaluation

**Implementation:** 26/26 numbered tasks verified. Task evidence and deployment boundaries: `docs/backend/phase-5/verification.md`. Browser cutover remains Backend Phase 9.

### WFH and Leave

- [x] `BE-0501` Implement employee WFH request create, update while draft, submit, cancel where allowed, history, and detail queries.
- [x] `BE-0502` Implement full-day/half-day, reason, planned tasks, division, availability, attachment, and request-date validation.
- [x] `BE-0503` Implement Team Lead approve, reject, and request-information decisions for effective assigned employees.
- [x] `BE-0504` Implement HR oversight and override with required reason, audit, and notification.
- [x] `BE-0505` Ensure approved WFH changes attendance context but never creates time automatically.
- [x] `BE-0506` Implement leave types, balances, request create/update/submit/cancel, Team Lead decision, HR override, and history.
- [x] `BE-0507` Implement full-day/half-day requirement adjustment, balance reservation/consumption, overlap checks, and transaction safety.
- [x] `BE-0508` Implement company, division-specific, and weekly holiday administration with effective calendars.

### Attendance and Missing-Time Processing

- [x] `BE-0510` Implement authoritative attendance-day derivation from employee schedule, holidays, leave, WFH, duty location, and valid time.
- [x] `BE-0511` Distinguish Office, WFH, Official Travel, Field Duty, Training Duty, approved leave, absence, holiday, and missing timesheet.
- [x] `BE-0512` Ensure approved full-day leave and holidays do not create missing-timesheet exceptions.
- [x] `BE-0513` Implement scheduled daily/monthly missing-time and exception detection with idempotent results.
- [x] `BE-0514` Implement HR attendance, leave, WFH, pattern, and exception queries with permission-safe aggregation.

### Workload Planning

- [x] `BE-0520` Implement weekly active capacity from effective work policy, leave, and holidays.
- [x] `BE-0521` Implement planned division/project allocation, actual time, remaining capacity, and over/under-allocation calculations.
- [x] `BE-0522` Keep the default 35 active hours distinct from the 40-hour scheduled week and exclude breaks from task capacity.
- [x] `BE-0523` Implement workload warnings, upcoming-deadline queries, and scoped workload-calendar data.

### Evaluations

- [x] `BE-0530` Implement evaluation periods for monthly, quarterly, half-yearly, annual, project-based, and probation types.
- [x] `BE-0531` Implement eligible employee/reviewer assignment, lifecycle state, due dates, and reminder scheduling.
- [x] `BE-0532` Generate factual evaluation inputs from required/active/break/overtime time, missing records, task outcomes, estimates, division/project contribution, WFH, leave, and remarks.
- [x] `BE-0533` Implement employee self-evaluation drafts and submissions.
- [x] `BE-0534` Implement Team Lead scoring/comments for every required evaluation area.
- [x] `BE-0535` Implement versioned default weighting of 30/25/15/10/10/10 and validate that weights total 100 percent.
- [x] `BE-0536` Calculate evaluation results without treating hours as the sole performance measure.
- [x] `BE-0537` Implement HR review, publication, employee visibility, history, and restrictions on unpublished/private evaluation content.
- [x] `BE-0538` Add workflow, permission, effective-date, balance, capacity, weighting, publication, and concurrency tests for all Phase 5 modules.

### Phase 5 Exit Criteria

- [~] WFH, leave, attendance, holiday, workload, and evaluation frontend adapters use authoritative services. Database-backed adapters are implemented and tested; browser registry cutover and competency-form wiring remain Phase 9.
- [x] Attendance and workload results reconcile to time, assignments, policies, leave, and holidays.
- [x] Evaluation facts are reproducible and private/unpublished content is permission-safe.

## Phase 6 - Reporting, Finance, and Exports

**Implementation evidence:** [Phase 6 verification and operational handoff](docs/backend/phase-6/verification.md). All 19 numbered tasks are implemented and verified; browser registry cutover remains Phase 9.

### Reporting Foundation

- [x] `BE-0601` Implement a permission-aware report query layer that reuses authoritative calculation and authorization services.
- [x] `BE-0602` Implement validated filters for date/period, employee, division, project, task, Team Lead, employment type, work location, WFH/Office, overtime, and status.
- [x] `BE-0603` Implement daily, weekly, monthly, employee, division, project, task, overtime, under-time, missing, critical, and WFH reports.
- [x] `BE-0604` Implement HR attendance, leave, WFH, evaluation, performance history, workload, assignment, and remark reports.
- [x] `BE-0605` Implement pagination, stable sorting, grouping, totals, timezone, applied-policy version, and generated-at metadata.
- [x] `BE-0606` Prevent aggregates, counts, filters, and empty groups from revealing unauthorized records.

### Finance

- [x] `BE-0610` Implement effective-dated employee/project cost rates with currency and separately protected access.
- [x] `BE-0611` Implement billable/non-billable classification and reconciliation to verified active hours.
- [x] `BE-0612` Implement employee, overtime, project, division, labour-cost, payroll-period, and budget-versus-actual reports.
- [x] `BE-0613` Default Finance reporting to HR-verified periods and clearly flag explicitly authorized unverified data.
- [x] `BE-0614` Implement payroll-ready data mapping with configurable approved fields and no implicit external payroll submission.
- [x] `BE-0615` Ensure salary, rate, budget, labour-cost, and payroll fields are omitted without the required financial permission.

### Export Processing

- [x] `BE-0620` Implement durable asynchronous export jobs for Excel, CSV, and PDF plus a server-renderable print dataset.
- [x] `BE-0621` Capture requester, permission snapshot or revalidation strategy, filters, timezone, policy version, format, status, and timestamps.
- [x] `BE-0622` Generate exports with bounded memory, safe temporary storage, formula-injection protection, and consistent formatting.
- [x] `BE-0623` Store export artifacts with protected, expiring access and recheck authorization at download time.
- [x] `BE-0624` Implement queued, processing, ready, expired, cancelled, and failed states with idempotent retry.
- [x] `BE-0625` Audit export request, completion, failure, download, expiry, and deletion events.
- [x] `BE-0626` Add reconciliation, permission, large-data, injection, expiration, retry, and format-content tests.

### Phase 6 Exit Criteria

- [~] Report and Finance frontend mock adapters are replaced by permission-safe services. — Database-backed contract adapters and API are verified; browser registry cutover is tracked in Phase 9, consistent with Phases 4/5.
- [x] Report totals reconcile across grouping dimensions and to verified source records.
- [x] Excel, CSV, PDF, and print data are generated asynchronously or safely, audited, and access-controlled. — Real format and database lifecycle tests pass; production Redis/S3 configuration is a deployment prerequisite.

## Phase 7 - Notifications, Documents, Search, and Integrations

### Notifications and Scheduled Work

- [ ] `BE-0701` Implement in-app notifications with recipient, type, safe payload, related-record reference, read state, and creation timestamp.
- [ ] `BE-0702` Implement role-specific triggers for missing time, under-time, overtime, critical time, tasks, deadlines, remarks, corrections, WFH, leave, workload, and evaluations.
- [ ] `BE-0703` Implement notification deduplication and idempotent scheduled generation.
- [ ] `BE-0704` Implement delivery attempts, retry/backoff, dead-letter/failure handling, and provider-safe logging for configured external channels.
- [ ] `BE-0705` Recheck access when opening related records and keep notification text free of unauthorized sensitive content.

### Files, Documents, and Lightweight Communication

- [ ] `BE-0710` Implement safe upload initiation/completion, size/type validation, malware-scanning integration point, integrity metadata, and storage adapter.
- [ ] `BE-0711` Implement authorized download using short-lived or streamed access and audit protected downloads.
- [ ] `BE-0712` Implement attachment ownership for profiles, time entries, WFH/leave, projects, tasks, remarks, evaluations, messages, and documents.
- [ ] `BE-0713` Implement document create, version, metadata, company/division/project scope, search visibility, and deactivation.
- [ ] `BE-0714` Implement Phase 3 division/project/direct messages, task comments, announcements, mentions, and pins when enabled.
- [ ] `BE-0715` Enforce participant, division, project, government-project, and attachment permissions across documents and communication.

### Search

- [ ] `BE-0720` Implement authorized search across employees, divisions, projects, tasks, timesheets, remarks, and documents.
- [ ] `BE-0721` Implement date, division, employee, project, status, location, and file-type filters with bounded pagination.
- [ ] `BE-0722` Ensure indexes or a future search adapter cannot leak unauthorized titles, snippets, metadata, counts, or file names.
- [ ] `BE-0723` Add relevance, permission, stale-index, special-character, large-result, and injection-resistance tests.

### APIs, Webhooks, and Integrations

- [ ] `BE-0730` Define and document versioned REST API conventions, authentication, scopes, pagination, errors, rate limits, and deprecation policy.
- [ ] `BE-0731` Implement webhook endpoint registration, secret rotation, signed delivery, retry/backoff, idempotency, replay protection, and delivery logs.
- [ ] `BE-0732` Implement calendar connection and sync boundaries for Google Calendar and Outlook when credentials are approved.
- [ ] `BE-0733` Convert external calendar events only into draft time entries requiring employee confirmation before totals change.
- [ ] `BE-0734` Implement secure OAuth/state/callback and credential storage patterns for approved providers.
- [ ] `BE-0735` Define adapters for future email, storage, conferencing, Jira/Slack, biometric, HR, payroll, accounting, SSO, Zapier, and Make integrations.
- [ ] `BE-0736` Ensure imported/external data passes the same authorization, validation, verification, calculation, and audit rules as interactive data.
- [ ] `BE-0737` Add contract, signature, replay, idempotency, rate-limit, provider-failure, retry, and permission tests for enabled integrations.

### Phase 7 Exit Criteria

- [ ] Notifications, files, documents, and search are permission-safe and observable.
- [ ] Enabled jobs and integration operations are durable, idempotent, and auditable.
- [ ] Calendar imports remain drafts until employee confirmation and never bypass time-entry rules.

## Phase 8 - Quality, Performance, Backup, and Security Hardening

### Automated Quality

- [ ] `BE-0801` Complete unit tests for domain rules, policy selection, classification, duration arithmetic, weighting, and financial calculations.
- [ ] `BE-0802` Complete database integration tests for repositories, constraints, indexes, migrations, transactions, locks, and concurrency.
- [ ] `BE-0803` Complete Server Action and Route Handler tests for validation, authentication, authorization, errors, idempotency, and response contracts.
- [ ] `BE-0804` Complete end-to-end tests for primary Employee, Team Lead, HR, Finance, Management, and Administrator workflows.
- [ ] `BE-0805` Complete traceability from MVP backend requirements to automated tests and record justified exceptions.

### Performance and Reliability

- [ ] `BE-0810` Define representative employee, entry, project, task, report, file, and concurrent-user volumes with stakeholders.
- [ ] `BE-0811` Load-test normal reads against the two-second p95 target and writes against the three-second p95 target.
- [ ] `BE-0812` Load-test dashboards and normal reports against the five-second target.
- [ ] `BE-0813` Test large exports, job throughput, retry storms, scheduled exception detection, and provider outages.
- [ ] `BE-0814` Review query plans and add or revise indexes based on measured slow queries rather than assumptions.
- [ ] `BE-0815` Add safe caching only where authorization, invalidation, verification state, timezone, and policy version remain correct.
- [ ] `BE-0816` Add health, readiness, dependency, job-queue, and migration-version checks.

### Observability and Operations

- [ ] `BE-0820` Implement structured logs with correlation ID, safe actor/resource references, severity, duration, and outcome.
- [ ] `BE-0821` Implement error monitoring and alerting for authentication anomalies, authorization denials, job failures, export failures, integration failures, and database health.
- [ ] `BE-0822` Implement metrics for request latency/error rate, connection-pool health, job lag, notification delivery, exports, and integration retries.
- [ ] `BE-0823` Ensure observability data contains no credentials, session tokens, protected files, private evaluations, salary/cost details, or excessive personal data.

### Backup, Recovery, and Security Review

- [ ] `BE-0830` Define and obtain approval for availability, recovery-time objective, recovery-point objective, backup frequency, encryption, retention, and ownership.
- [ ] `BE-0831` Automate and monitor MySQL and protected-file backups in the target environment.
- [ ] `BE-0832` Restore a production-like backup into an isolated environment and reconcile records, files, permissions, and audit history.
- [ ] `BE-0833` Document database, file, job, integration, credential, and application recovery order and responsibilities.
- [ ] `BE-0834` Run dependency, secret, configuration, authorization, injection, file-upload, session, rate-limit, and common web security reviews.
- [ ] `BE-0835` Resolve all critical/high findings and document accepted lower-risk findings with owner and review date.

### Phase 8 Exit Criteria

- [ ] Automated suites pass with stable, isolated data and no unexplained flaky tests.
- [ ] Performance targets pass at approved representative load.
- [ ] Backup restoration and operational recovery are demonstrated.
- [ ] No unresolved critical/high security finding remains.

## Phase 9 - Production Readiness and Frontend Cutover

### Frontend Integration

- [ ] `BE-0901` Replace frontend mock authentication with real server authentication while preserving approved UI states.
- [ ] `BE-0902` Replace mock organization, project, task, timesheet, remark, WFH, leave, attendance, workload, evaluation, report, Finance, notification, search, document, and settings adapters incrementally.
- [ ] `BE-0903` Remove direct fixture dependencies from production paths while retaining deterministic fixtures for tests and demos.
- [ ] `BE-0904` Verify frontend error, permission, loading, locked, retry, job-progress, and success states against real backend responses.
- [ ] `BE-0905` Reconcile dashboard, timesheet, report, evaluation, and Finance totals for the same seeded scenarios.

### Data Migration and Release

- [ ] `BE-0910` Inventory source employee, division, assignment, holiday, leave-balance, project, task, cost, and opening-period data supplied by business owners.
- [ ] `BE-0911` Define mapping, validation, duplicate handling, rejection reporting, dry-run, approval, and rollback strategy for each imported dataset.
- [ ] `BE-0912` Implement idempotent migration/import commands with audit records and no uncontrolled direct production edits.
- [ ] `BE-0913` Run rehearsal migration against a production-like environment and obtain owner sign-off on totals and rejected records.
- [ ] `BE-0914` Define deployment, migration order, maintenance mode if required, smoke tests, rollback triggers, and responsible owners.
- [ ] `BE-0915` Configure production secrets, domains, TLS, cookies, database users, storage, email, jobs, monitoring, alerts, and backups.
- [ ] `BE-0916` Run production smoke tests for authentication, role access, time entry, timer, correction, verification, reporting, export, file access, and audit.

### Documentation and Handoff

- [ ] `BE-0920` Document local setup, environment variables, migrations, seeds, tests, jobs, file storage, email, and integration configuration.
- [ ] `BE-0921` Document domain calculations, authorization policies, period verification/amendment, evaluation weighting, and financial rules.
- [ ] `BE-0922` Document API and webhook contracts, error codes, idempotency, rate limits, and integration recovery.
- [ ] `BE-0923` Create operational runbooks for failed jobs, stuck exports, notification failure, database saturation, storage outage, integration outage, backup failure, and security incident.
- [ ] `BE-0924` Train designated Super Administrator, HR, Finance, support, and operations users on sensitive workflows and recovery paths.
- [ ] `BE-0925` Record stakeholder acceptance, known limitations, deferred items, owners, and post-launch review dates.

### Phase 9 Exit Criteria

- [ ] All production frontend flows use real backend services and no production route depends on mock data.
- [ ] Migration, smoke, security, performance, and recovery gates pass in the target environment.
- [ ] Business owners approve calculation, attendance, verification, evaluation, financial, and permission behavior.
- [ ] Operations can monitor, support, back up, restore, and safely roll back the application.

## Phase 10 - Requisition

Added after the original ten phases were planned. It is written as a self-contained milestone because it introduces a new entity, a new approval chain, and a new notification trigger, none of which the earlier phases cover.

**Depends on** Phase 1 (schema conventions), Phase 2 (authentication, authorization, audit), Phase 3 (employees and Team Lead mapping), and Phase 7 (notifications). It does not depend on Phase 4-6 and can be built in parallel with them once Phase 3 is done.

### Schema and Domain

- [ ] `BE-1001` Create the `requisition` table with submitter, submitter role at submission time, kind (`in_house` | `new`), the shared fields, stage, outcome, timestamps, and standard audit columns.
- [ ] `BE-1002` Store the two form variants without nullable-field sprawl: in-house-only fields (last recover date, model name) must be representable as required for that kind and absent for the other, so an invalid combination cannot be persisted.
- [ ] `BE-1003` Store the approximate amount as a fixed-precision decimal plus a currency code, never a float and never free text, matching the money rules in §2.2.
- [ ] `BE-1004` Store the last recover date as a date, and the requisition's submitted instant as UTC plus the local work date and timezone, matching the time rules in §2.2.
- [ ] `BE-1005` Create the `requisition_review` table recording one row per reviewer decision: reviewer, reviewer role, stage, outcome, reason, and decided-at — appended, never updated in place, so the chain stays reproducible.
- [ ] `BE-1006` Add migrations, indexes for the queue queries (by submitter, by Team Lead, by stage), and seed data covering every stage including a Team Lead's own submission.

### Review Chain

- [ ] `BE-1010` Implement submission restricted to Employee and Team Lead. Every other role is rejected at the service, not hidden in the UI.
- [ ] `BE-1011` Implement routing: an Employee's requisition enters the Team Lead stage addressed to that employee's current Team Lead; a Team Lead's own requisition skips it and enters the reviewer stage directly.
- [ ] `BE-1012` Implement the Team Lead decision, and advance to the HR/Finance/Super Administrator stage only on approval.
- [ ] `BE-1013` Implement the HR, Finance, and Super Administrator decisions, resolving the open question in `frontend_milestone.md` on whether all three must decide or any one settles it.
- [ ] `BE-1014` Make every decision idempotent and conflict-safe: a second decision on an already-decided requisition, or two reviewers deciding at the same instant, must produce a defined conflict result rather than a lost or duplicated decision.
- [ ] `BE-1015` Implement withdrawal by the submitter while the requisition is still undecided, and define whether a decided requisition can be reopened (assumed: no).
- [ ] `BE-1016` Handle the Team Lead mapping changing mid-chain — reassignment, deactivation, or an employee with no current Team Lead — so a requisition can never become unreviewable.

### Authorization and Audit

- [ ] `BE-1017` Enforce visibility: submitter, that submitter's Team Lead, and reviewers the requisition has reached. Apply it before aggregation so counts, queue badges, and search results cannot reveal a requisition the viewer may not see.
- [ ] `BE-1018` Return the same not-found response for an unauthorized requisition id as for a nonexistent one, with no timing difference.
- [ ] `BE-1019` Audit every submission, decision, withdrawal, and amount change with actor, role, before/after, and reason.

### Notifications and Tests

- [ ] `BE-1020` Trigger a Team Lead notification on Employee submission and reviewer notifications when a requisition reaches their stage, reusing the Phase 7 notification service and its deduplication.
- [ ] `BE-1021` Keep notification text free of any field the recipient is not authorized to read.
- [ ] `BE-1022` Add tests for both form kinds, both routing paths, every stage transition, rejection at each stage, withdrawal, concurrent decisions, Team Lead reassignment, and unauthorized access from every role.
- [ ] `BE-1023` Add tests asserting the amount round-trips exactly and that no requisition figure is ever produced by floating-point arithmetic.

### Phase 10 Exit Criteria

- [ ] Only Employees and Team Leads can submit, and the restriction is enforced in the service.
- [ ] An Employee's requisition reaches HR, Finance, and the Super Administrator only after its Team Lead has approved it; a Team Lead's own reaches them directly.
- [ ] A requisition is invisible to every role it has not reached, including through counts and search.
- [ ] Every decision is audited, idempotent, and safe under concurrency.
- [ ] A `REQ-*` requirement exists in `project_requirement.md` covering this feature.

## Phase 11 - Conveyance

A travel-expense claim. The approval chain is **identical to Phase 10's**, which is the defining constraint on this milestone rather than an aside: two independent implementations of one workflow will diverge, and the divergence will show up as a claim that reached a reviewer it should not have.

**Depends on** Phase 1-3 and Phase 7 as Phase 10 does, plus Phase 7's file storage (`BE-0710`, `BE-0711`) for receipts. **It also depends on Phase 10 having landed**, because the shared approval engine below is extracted from it.

### Shared Approval Engine

- [ ] `BE-1101` Extract the requisition stage machine, transition rules and audit shape into one approval component that both requisition and conveyance use, rather than copying it. Re-run the Phase 10 tests unchanged against the extracted version to prove the extraction changed no behaviour.
- [ ] `BE-1102` Model the chain once: submitter role decides whether the Team Lead stage applies, approval advances, any rejection is terminal, and the record of who decided is append-only.
- [ ] `BE-1103` Keep the visibility rule in the shared component too — submitter, that submitter's Team Lead, and reviewers the record has reached — so a change to one workflow's scope cannot silently miss the other.

### Schema and Domain

- [ ] `BE-1110` Create the `conveyance_claim` table with submitter, submitter role at submission, business name, client name, visited instant, travel mode, amount, stage, outcome, timestamps and standard audit columns.
- [ ] `BE-1111` Store the submitted date/time as a server-assigned UTC instant plus local date and timezone. It is never accepted from the client — a claim whose own timestamp the submitter chooses is not evidence of anything.
- [ ] `BE-1112` Store the visited date and time as one instant in the business timezone, and reject a future one.
- [ ] `BE-1113` Store the amount as a fixed-precision decimal plus a currency code, never a float, matching §2.2.
- [ ] `BE-1114` Store travel mode as a constrained value, with the description that "Other" requires (see the frontend open questions) validated as required for that value and absent otherwise.
- [ ] `BE-1115` Add migrations, queue indexes, and seed data covering every stage, a Team Lead's own claim, and claims both with and without a receipt.

### Receipts

- [ ] `BE-1120` Attach receipts through the Phase 7 upload path — size and type validation, malware-scanning integration point, integrity metadata, storage adapter — rather than a second upload mechanism.
- [ ] `BE-1121` Bind receipt access to the claim's own visibility, so a receipt is never reachable by anyone who cannot see the claim, including by guessing a file id or URL.
- [ ] `BE-1122` Serve receipts only through short-lived or streamed authorized access, and audit every protected download (`REQ-WORK-009`).
- [ ] `BE-1123` Keep the upload genuinely optional end to end: absent, present, and failed-upload are three distinct states, and a failed upload must never silently produce a claim that appears to have a receipt.
- [ ] `BE-1124` Decide and enforce whether a receipt may be added or replaced after submission, and whether a decided claim's receipt is immutable (assumed: no changes after the first decision).

### Authorization, Audit and Notifications

- [ ] `BE-1130` Apply authorization before aggregation for claim lists, queue counts, and any expense total, so a count cannot reveal a claim or a receipt the viewer may not see.
- [ ] `BE-1131` Return the same not-found response for an unauthorized claim or receipt id as for a nonexistent one, with no timing difference.
- [ ] `BE-1132` Audit submission, each decision, withdrawal, receipt upload, receipt download and amount change with actor, role, before/after and reason.
- [ ] `BE-1133` Reuse the Phase 7 notification service for the Team Lead and reviewer triggers, keeping notification text free of any field the recipient may not read — the business name, client and amount included.

### Tests

- [ ] `BE-1140` Test both routing paths, every transition, rejection at each stage, withdrawal, concurrent decisions, Team Lead reassignment, and unauthorized access from every role — the Phase 10 suite applied to conveyance, since the chain is the same component.
- [ ] `BE-1141` Test receipt access from every role at every stage, including direct file-id access by someone who cannot see the claim.
- [ ] `BE-1142` Test that the amount round-trips exactly and that no conveyance figure is produced by floating-point arithmetic.
- [ ] `BE-1143` Test that a client-supplied submitted timestamp is ignored, and that a future visited instant is rejected.

### Phase 11 Exit Criteria

- [ ] Requisition and conveyance share one approval implementation, and the Phase 10 tests still pass against it unchanged.
- [ ] Only Employees and Team Leads can submit, enforced in the service.
- [ ] A receipt is reachable by exactly the people who can see its claim, and by no one else, including by direct file id.
- [ ] The submitted timestamp is server-assigned and a future visited instant is refused.
- [ ] A `REQ-*` requirement exists in `project_requirement.md` covering this feature.

## Phase 12 - Role Consolidation: Finance into HR

> **Partly superseded, 20 September 2026.** This phase is still required and still pending. Its cost-permission stance — `finance.cost.view` stays per-user (`BE-1203`) — is superseded by the amended `REQ-RBAC-017`, which grants the permission through the HR Manager and Super Administrator roles. Phase 14 delivers that grant with a reversible, audited migration. Phase 12 keeps the narrower stance so the role consolidation itself widens nobody's access.

The server half of the frontend Phase 10 change. HR absorbs the Finance Manager role and the role is retired.

**Depends on** Phase 2 (authorization and audit) and Phase 6 (Finance and reporting). It touches `src/server/authorization/policy.ts`, which already names `finance_manager`.

### The Constraint That Shapes Everything

A role that has been used cannot simply be deleted. `finance_manager` is recorded in requisition and conveyance review rows, in audit events, in login history and on any export already produced. Removing the value from the enum makes those rows unreadable; keeping it assignable defeats the change. The distinction the schema has to carry is **assignable now** versus **valid historically**.

### Tasks

- [ ] `BE-1201` Retire `finance_manager` as an assignable role while keeping it a legal stored value, so historical rows stay readable and no migration rewrites recorded history.
- [ ] `BE-1202` Write a reversible migration that grants every current Finance Manager the HR role, and record for each user whether they held `finance.cost.view`, so the grant can be reproduced and audited.
- [ ] `BE-1203` **Do not grant `finance.cost.view` to the HR role in this phase.** The consolidation migration carries the permission across only for users who already had it. The amended `REQ-RBAC-017` does grant it through the HR Manager and Super Administrator roles, but that is a separate, wider data-access change delivered by Phase 14 with its own reversible migration and its own frontend cutover; doing it here would widen access during a migration whose purpose is to change nothing but the role.
- [ ] `BE-1204` Update `src/server/authorization/policy.ts` so every rule that admitted a Finance Manager now admits HR, and confirm no rule silently widens beyond that.
- [ ] `BE-1205` Update the approval chain's parallel reviewer set to match the frontend decision in `FE-1001`, and define what happens to a requisition or conveyance that is **mid-chain at migration time** and still waiting on a Finance decision.
- [ ] `BE-1206` Keep every cost, rate, budget, payroll and export endpoint gated on `finance.cost.view` itself rather than on a role name, and re-verify each returns the redacted shape without it. This holds after Phase 14 too: the role changes who *holds* the permission, never how an endpoint checks it.
- [ ] `BE-1207` Preserve audit history: a decision recorded by a Finance Manager keeps its actor role, and the migration itself is audited with actor, reason and before/after.
- [ ] `BE-1208` Update seed data so the demo has an HR account with the financial permission and an HR account without it.
- [ ] `BE-1209` Add authorization tests proving an account without `finance.cost.view` is refused every cost, rate, budget and protected-export endpoint — the regression that would otherwise ship silently. Use an HR account without the permission while this phase's policy stands; once Phase 14 grants it by role, the same tests must be re-pointed at an active role that still lacks it, because an HR account can no longer be that subject.
- [ ] `BE-1210` Add a migration test proving a Finance-era requisition, conveyance and audit row still reads correctly after the role is retired.
- [ ] `BE-1211` Add a rehearsal migration against production-like data with owner sign-off on the resulting role and permission assignments.

### Phase 12 Exit Criteria

- [ ] No new user can be assigned the Finance Manager role.
- [ ] Every former Finance Manager can do their work as an HR user.
- [ ] No HR user gained cost, salary, rate or budget access purely from the migration.
- [ ] Historical records naming the Finance Manager role still read correctly.
- [ ] The migration is reversible and audited, and a rehearsal was signed off.

## Phase 13 - Meeting Minutes and AI Task Generation

This phase adds the Meeting Minutes module and optional AI-assisted task generation to the existing single Next.js application. Every active role can access authorized minutes, while record scope, view-only restrictions, sensitive-project controls, and existing task rules remain authoritative. The original minute is always saved before asynchronous processing begins.

**Depends on** Phases 1-3 (Client, projects, employees, tasks and repositories), Phase 2 authorization/audit, Phase 7 notifications/files, and the frontend contracts from Frontend Phase 11. It requires an approved AI provider, data-processing policy, retention period, and automatic-assignment threshold before production enablement.

### Schema, Client Model, and Contracts

- [ ] `BE-1301` Add a first-class Client model with stable id, name, status, scope, audit fields, and migration mapping for legacy project client labels.
- [ ] `BE-1302` Add the project-to-client relationship and enforce that a meeting minute's project belongs to its selected client; preserve unresolved legacy labels for review.
- [ ] `BE-1303` Add `meeting_minutes` with title, client_id, project_id, description/content, process_with_ai, processing_status, safe processing_error, processed_at, creator, timestamps, active/archive state, and optimistic version.
- [ ] `BE-1304` Add `meeting_minute_processing_attempt` with attempt number, idempotency key, correlation id, provider/schema/model identifiers, status, timestamps, protected raw-response reference, safe error, and retry metadata.
- [ ] `BE-1305` Extend tasks with nullable meeting_minute_id, processing_attempt_id, source, generated-by identity, assignment outcome, and immutable origin constraints.
  - *Note, 22 Sep 2026 (`FE-1130`):* the frontend `Task` contract now allows an unassigned task (`assigneeEmployeeId: string | null`) for `REQ-MTG-014`, and `taskAcceptsTime` plus `validateTaskForTime` in `src/server/organization/rules.ts` refuse time on one (`TASK_UNASSIGNED`). `tasks.assignee_employee_id` has been nullable since migration `0001`, so no migration is needed; the server's task mapping and task services must accept a null assignee, and a Team Lead's save must still require one.
- [ ] `BE-1306` Add decisions, generated-task links, and match-result records so summary, decisions, task provenance, suggestions, automatic assignment, unassigned fallback, and later reassignment remain distinguishable.
- [ ] `BE-1307` Add migrations, indexes, foreign-key restrictions, archive semantics, seed clients, and recovery guidance without physically deleting referenced minutes or tasks.

### Minute Service and Authorization

- [ ] `BE-1310` Implement authorized list/search/filter by client, project, status, and date with authorization applied before rows, counts, grouping, or suggestions.
- [ ] `BE-1311` Implement create/update/read/archive with required-field validation, client-project dependency, sanitized content, ownership rules, optimistic concurrency, and `Result<T>` outcomes.
- [ ] `BE-1312` Make the module reachable to all active roles while preserving Employee and Management/View-Only read-only behavior and current government-project, division, project, and permission boundaries.
- [ ] `BE-1313` Return indistinguishable not-found results for unauthorized direct ids, generated-task links, and archived records outside the caller's scope.
- [ ] `BE-1314` Ensure ordinary responses omit raw prompts, raw AI JSON, provider diagnostics, match internals, and unauthorized task or minute counts.
- [ ] `BE-1315` Audit minute creation, editing, archive, access, AI request, retry, task open, and protected diagnostic access with actor/system identity, correlation id, reason, and before/after state.

### Queue, Provider, and Structured AI Output

- [ ] `BE-1320` Save the original minute transactionally before inspecting `process_with_ai`; never dispatch a job when false and set Not Processed with null AI fields.
- [ ] `BE-1321` When true, set Pending, create an idempotent attempt, enqueue a durable job, and return without waiting for provider completion.
- [ ] `BE-1322` Implement worker transitions Pending -> Processing -> Processed/Failed with retry limits, backoff, timeout, cancellation, dead-letter handling, and safe restart behavior.
- [ ] `BE-1323` Define a versioned provider-neutral AI port and structured response schema for summary, decisions, tasks, title, description, priority, due date, mentioned assignee, department, role, and dependencies.
- [ ] `BE-1324` Validate JSON shape, require a task array, normalize priority, validate dates, remove empty/invalid tasks, deduplicate proposals, and retain protected raw output for authorized diagnostics.
- [ ] `BE-1325` Treat provider output as untrusted input; never accept employee database ids, permissions, project scope, task status, or final access decisions from AI.
- [ ] `BE-1326` On any provider/schema failure, preserve the minute, set Failed, store a safe error plus protected diagnostics, notify the creator, and expose an authorized idempotent retry.

### Matching and Task Creation

- [ ] `BE-1330` Implement explainable matching using a valid explicitly mentioned employee first, then project membership, department, role, availability, current workload, and active status.
- [ ] `BE-1331` Apply current effective assignments, authorization, project membership, leave/WFH availability, and existing task rules before assigning any generated task.
- [ ] `BE-1332` Create unassigned tasks when no candidate meets the approved threshold; never force an unsuitable employee.
- [ ] `BE-1333` Create each valid task transactionally with inherited client/project context, source `meeting_minute_ai`, Todo status, creator/system identity, due date, priority, and immutable minute/attempt link.
- [ ] `BE-1334` Prevent duplicate generated tasks across concurrent workers, retries, replayed jobs, and repeated provider output using idempotency and a normalized proposal fingerprint.
- [ ] `BE-1335` Notify the minute creator on completion/failure and assigned employees on new tasks without including content outside each recipient's authorization scope.
- [ ] `BE-1336` Ensure generated tasks obey task acceptance, time-entry, workload, notification, and authorization rules, including employee-raised-task review where applicable.

### Tests, Operations, and Exit Criteria

- [ ] `BE-1340` Add unit and repository tests for client/project dependency, validation, ownership, archive, authorization-before-aggregation, and safe not-found behavior across every role.
- [ ] `BE-1341` Add queue/provider tests for no-AI, pending, processing, success, malformed output, timeout, retry, worker restart, dead letter, and exactly-once task outcomes.
- [ ] `BE-1342` Add matching tests for explicit valid/invalid people, project/department/role/availability/workload scoring, unassigned fallback, and assignment evidence.
- [ ] `BE-1343` Add security tests proving raw AI artifacts and sensitive meeting content are excluded from ordinary payloads and require audited diagnostic permission.
- [ ] `BE-1344` Add integration/contract tests for frontend list, form, detail, status, retry, linked-task, notification, and archive flows.
- [ ] `BE-1345` Document provider approval, prompt minimization, data region, model-training opt-out, retention/deletion, cost limits, monitoring, and incident response.
- [ ] `BE-1346` Re-run typecheck, lint, migration validation, backend tests, security audit, and production build; record evidence in `docs/backend/phase-13/verification.md`.

### Phase 13 Exit Criteria

- [ ] Every active role can access authorized Meeting Minutes, with Employee and Management/View-Only read-only restrictions enforced server-side.
- [ ] The original minute is durable before AI work and remains available through every processing failure.
- [ ] AI output is validated, deduplicated, provenance-linked, and matched by application logic rather than trusted blindly.
- [ ] Generated tasks are assigned only to eligible people or left unassigned, and every task links back to its source minute and attempt.
- [ ] Retries, worker restarts, permissions, sensitive content, notifications, and diagnostics are idempotent, auditable, and tested.
- [ ] Provider, retention, privacy, and automatic-assignment decisions are approved before production enablement.

## Phase 14 - Client Panel Reporting

The server half of Frontend Phase 12. It answers one authorized question — active hours and internal labour cost per employee per client for a verified payroll period — and it answers it from data the system already calculated (`REQ-CLIENT-001`-`REQ-CLIENT-010`, `AC-CLIENT-001`-`AC-CLIENT-006`).

**Depends on** Phase 6 (reporting, finance, protected exports), Phase 12 (the Finance-into-HR role consolidation this phase amends), and Phase 13 (the first-class `Client` model and the project-to-client relationship). It must ship together with Frontend Phase 12.

### The Two Rules That Shape Everything

**1. This endpoint measures nothing.** Active minutes come from the authoritative work-log calculation, with the applied policy version, exactly as the timesheet and reports read them. A `SUM(...)` over raw rows in report SQL is a second implementation of the calculation engine: it will drift from the verified figures, and the drift will be discovered in a payroll dispute rather than in a test. The reconciliation tests exist to make that drift fail loudly.

**2. The permission change is wider than this feature.** Granting `finance.cost.view` through the HR Manager and Super Administrator roles opens every existing cost, rate, budget, salary and protected-export endpoint to every account holding those roles — that is the amended `REQ-RBAC-017`, and it reverses the decision `BE-1203` recorded in Phase 12. It is a data-access change to the whole product, delivered through a reversible, audited migration, cut over atomically with the frontend.

### Role Capability and Migration

- [ ] `BE-1401` Update role capabilities so active HR Manager and Super Administrator roles carry `finance.cost.view`, leaving every other active role to an explicit per-user grant (amended `REQ-RBAC-017`, `REQ-RBAC-023`, `REQ-RBAC-024`).
- [ ] `BE-1402` Write a reversible, audited migration for the role grant, recording each account's prior permission state so the change can be reproduced, reconciled and rolled back without guessing.
- [ ] `BE-1403` Document the rollback procedure and the cutover order with Frontend Phase 12, so there is no window in which the client and the server disagree about who may see money.
- [ ] `BE-1404` Re-verify every existing cost, rate, budget, payroll and protected-export endpoint under the new grant, and record which surfaces each role gains — the widened access is approved, but it must be enumerated rather than discovered.

### Contracts and Endpoint

- [ ] `BE-1405` Define `ClientPanelQuery` with payroll period, client, employee, sorting and pagination, plus the summary, employee-client row, applied-filter and export contracts, matching the frontend types from `FE-1203`.
- [ ] `BE-1406` Plan `/api/v1/client-costs` as an authorized read: period-scoped, filterable, paginated, sortable, and returning the same `Result` shapes as the rest of the API.
- [ ] `BE-1407` Default to the latest HR-verified payroll period and return an explicit empty state when none exists, never falling back to unverified data (`REQ-CLIENT-002`).

### Calculation and Attribution

- [ ] `BE-1408` Source active minutes from the authoritative work-log calculation results rather than recomputing time in SQL, carrying the applied policy version so verified history stays reproducible (`REQ-CLIENT-004`).
- [ ] `BE-1409` Exclude the recognized daily break and every task-transition timestamp from hours and cost.
- [ ] `BE-1410` Calculate internal labour cost from effective-dated cost rates using exact decimal arithmetic in BDT, with one final rounding step per reported aggregate and no rounding per row (`REQ-CLIENT-005`, `REQ-DATA-005`).
- [ ] `BE-1411` Group by the first-class `Client` through the project relationship, and report work whose project has no mapped client under **Not assigned to a client** rather than dropping or reattributing it (`REQ-CLIENT-006`).
- [ ] `BE-1412` Keep unresolved legacy project client labels readable and reconcilable, so a report grouped by the old label can still be matched to the new records.

### Authorization and Exports

- [ ] `BE-1413` Apply role, record, government-project and field authorization **before** rows, counts, totals, pages, filter options or empty groups are computed (`REQ-CLIENT-008`, `AC-CLIENT-006`).
- [ ] `BE-1414` Return the same safe refusal for an unauthorized role, an unauthorized period and a nonexistent one, with no difference in message, filename or response timing.
- [ ] `BE-1415` Plan durable Excel, CSV and PDF exports through the existing protected export workflow, carrying period, filters, timezone, generation timestamp, currency and policy version.
- [ ] `BE-1416` Record export history and audit every generation and download with actor, filters, correlation id and result, rechecking authorization at download time.

### Tests and Verification

- [ ] `BE-1417` Add authorization tests for role access, record scope, government-project restriction, export refusal and aggregation-before-authorization leaks.
- [ ] `BE-1418` Add reconciliation tests proving hours and labour cost match the authoritative hour and labour-cost reports for identical filters (`AC-CLIENT-002`, `AC-CLIENT-005`).
- [ ] `BE-1419` Add cost-precision tests covering rate changes inside a period, multi-rate employees, rounding once per aggregate, and a rate carrying more precision than BDT holds.
- [ ] `BE-1420` Add legacy-client and unmapped-work tests proving totals stay complete and **Not assigned to a client** is never silently merged into a named client.
- [ ] `BE-1421` Add export and export-history tests proving screen, Excel, CSV and PDF outputs agree for identical filters and carry the required provenance metadata.
- [ ] `BE-1422` Add performance tests for a full verified period at production-like volume, covering pagination, sorting and export generation.
- [ ] `BE-1423` Add integration tests against the Frontend Phase 12 screen, including the permission cutover in both directions.

### Phase 14 Exit Criteria

- [ ] HR Managers and Super Administrators read authorized client hours and cost; every other role is refused identically across screen, API and export.
- [ ] Reported hours and internal labour cost reconcile with the authoritative reports, and unmapped work remains visible in totals.
- [ ] The role-based `finance.cost.view` grant is migrated, audited, reversible, and cut over together with Frontend Phase 12.
- [ ] Exports are durable, authorization-rechecked, audited, and identical in content to the screen.
- [ ] No hour or money figure in this phase is computed anywhere but the authoritative calculation and money helpers.

## 5. Backend Acceptance Scenarios

### Time and Calculation

- [ ] `BAC-TIME-01` Three valid entries totaling 3 hours for PowerInAI, 2 hours for Government Projects, and 2 hours for WesternCF plus one recognized break hour must produce 7 active hours, an 8-hour total, Complete status, and correct contribution totals.
- [ ] `BAC-TIME-02` Active time of 6:59 plus one break hour must produce Under-time.
- [ ] `BAC-TIME-03` Any total above 8:00 must require an overtime reason and produce Overtime until and including exactly 12:00.
- [ ] `BAC-TIME-04` A total above 12:00 must require a critical explanation and enqueue Team Lead and HR notifications exactly once.
- [ ] `BAC-TIME-05` Overlapping entries must be rejected across different divisions as well as within one division.
- [ ] `BAC-TIME-06` Two concurrent timer-start requests must result in exactly one active timer.
- [ ] `BAC-TIME-07` Repeated timer-stop or save requests with the same idempotency key must not duplicate time.
- [ ] `BAC-TIME-08` A verified period must reject ordinary edits; an authorized amendment must preserve old/new values, reason, actor, and recalculated results.

### Access and Privacy

- [ ] `BAC-AUTH-01` An Employee must be unable to read or mutate another employee's private records through actions, routes, search, exports, jobs, or file identifiers.
- [ ] `BAC-AUTH-02` A Team Lead must be limited to effective assigned employee, division, team, and project scope.
- [ ] `BAC-AUTH-03` A Finance user without financial-detail permission must receive hours but no salary, rate, budget, or labour-cost fields.
- [ ] `BAC-AUTH-04` Government-project data must not be discoverable by unauthorized users through counts, errors, timings, search, notifications, files, or exports.
- [ ] `BAC-AUTH-05` Management/View-Only must be unable to mutate any protected business record.
- [ ] `BAC-AUTH-06` Material authentication, permission, financial, evaluation, file, verification, override, and export events must produce protected audit evidence.

### HR and Workflows

- [ ] `BAC-HR-01` Approved full-day leave and holidays must not produce a missing-timesheet exception.
- [ ] `BAC-HR-02` Half-day leave must proportionally adjust required active and scheduled durations.
- [ ] `BAC-HR-03` Approved WFH must affect attendance context but must not create active time or a break record.
- [ ] `BAC-HR-04` Team Lead request decisions and HR overrides must enforce effective scope, reason, audit, and notification rules.
- [ ] `BAC-HR-05` Evaluation facts must reconcile to authoritative time, task, leave, WFH, assignment, and remark data for the period.
- [ ] `BAC-HR-06` Unpublished evaluations must remain inaccessible to Employees until HR publication.

### Reporting and Operations

- [ ] `BAC-RPT-01` Employee-, division-, project-, and task-grouped reports must reconcile to the same authorized active-time total for identical filters.
- [ ] `BAC-RPT-02` Dashboard, report, export, evaluation, and Finance results must agree for the same period, timezone, and policy version.
- [ ] `BAC-RPT-03` Excel, CSV, PDF, and print data must contain only authorized fields and records and must record export history.
- [ ] `BAC-RPT-04` Repeated export and webhook operations must be idempotent and recover safely after worker or provider failure.
- [ ] `BAC-OPS-01` A production-like backup must restore database records, protected file references, permissions, jobs, and audit history within the approved recovery objectives.
- [ ] `BAC-OPS-02` Normal reads, writes, dashboards, and reports must meet the approved p95 targets at representative load.

### Requisition

- [ ] An Employee submits an in-house requisition; only their Team Lead is notified, and no other Employee can retrieve it by id.
- [ ] The Team Lead approves it; HR, Finance, and the Super Administrator can then retrieve it, and not before.
- [ ] A Team Lead's own requisition is visible to HR, Finance, and the Super Administrator immediately, with no Team Lead review row in its chain.
- [ ] Two reviewers deciding simultaneously produce one recorded outcome and a defined conflict for the loser, never two.
- [ ] An approximate amount entered as text is stored as an exact decimal with a currency code and returns identical on read.

### Conveyance

- [ ] An Employee submits a claim with a receipt; only their Team Lead is notified, and no other Employee can retrieve the claim or the receipt.
- [ ] Requesting the receipt's file id directly, as a role that cannot see the claim, returns the same not-found response as a nonexistent file.
- [ ] A claim submitted without a receipt is accepted and shows an absent receipt, not a failed one.
- [ ] A submitted timestamp supplied by the client is ignored in favour of the server's.
- [ ] A visited date and time in the future is rejected with field-level guidance.

### Meeting Minutes and AI

- [ ] `BAC-MTG-01` Every active role can list and view authorized meeting minutes; Employee and Management/View-Only cannot mutate or request AI processing.
- [ ] `BAC-MTG-02` A selected client exposes only its active authorized projects, and an incompatible project cannot be saved.
- [ ] `BAC-MTG-03` A no-AI save stores the original minute as Not Processed and dispatches no job.
- [ ] `BAC-MTG-04` An AI save commits the original minute before returning Pending and queueing work.
- [ ] `BAC-MTG-05` Valid structured output creates deduplicated Todo tasks linked to the minute with normalized priority and safe assignee matching.
- [ ] `BAC-MTG-06` Invalid, timed-out, or failed processing preserves the minute, records Failed, notifies safely, and supports an idempotent retry.
- [ ] `BAC-MTG-07` No eligible match leaves a task unassigned; AI never supplies trusted employee ids or bypasses task/time authorization.
- [ ] `BAC-MTG-08` Replayed jobs, retries, and worker restarts do not duplicate attempts or generated tasks.
- [ ] `BAC-MTG-09` Raw AI content and match evidence are protected, absent from ordinary payloads, and available only through audited diagnostic permission.
- [ ] `BAC-MTG-10` Each generated task retains reciprocal traceability to its source minute and processing attempt after reassignment or archival.

## 6. Dependencies and Required Decisions

| Dependency or decision | Needed by | Owner/approver |
|---|---|---|
| Final frontend service interfaces and view models | Phase 0 and frontend cutover | Frontend lead and backend lead |
| ORM/query builder, migration approach, and MySQL runtime settings | Phase 1 | Backend lead |
| Authentication/session and 2FA implementation | Phase 2 | Backend lead and security owner |
| Job runner and scheduling model | Phases 4, 6, and 7 | Backend/operations leads |
| File/object storage and malware-scanning approach | Phases 3 and 7 | Operations and security owners |
| Email/notification provider | Phase 7 | Product and operations owners |
| Authoritative employee, assignment, holiday, leave, and project data | Phases 1, 5, and 9 | HR and product owner |
| Payroll periods, verification, retention, and amendment policy | Phases 4, 6, and 9 | HR and Finance |
| Cost-rate, currency, billable, budget, and payroll-field rules | Phase 6 | Finance |
| Availability, RTO, RPO, backup retention, and target deployment | Phases 0, 8, and 9 | Product and operations owners |
| Government-project and sensitive-field access policy | Phases 2 onward | Security and business owners |
| External provider credentials and API approvals | Phase 7 | Product, security, and provider owners |

## 7. Risks and Required Mitigations

| Risk | Impact | Required mitigation |
|---|---|---|
| Business logic implemented in UI or route handlers | Divergent calculations and hard-to-test behavior | Centralize rules in domain/application services and share them across every server boundary. |
| Weak cross-division authorization | Exposure of employee or government-project data | Deny by default and test every role, scope, field, file, search, export, and job boundary. |
| Floating-point duration or money storage | Incorrect time and payroll totals | Use integer durations and fixed-precision decimals with explicit currency. |
| Timezone or cross-midnight ambiguity | Incorrect daily status and overtime | Store UTC instants plus local work date, timezone, and policy version; test boundaries. |
| Race conditions in timers or verification | Duplicate time or changing payroll totals | Use database constraints, transactions, idempotency, locks/version checks, and concurrency tests. |
| Policy edits alter history | Reports no longer reproduce | Version policies and bind verified calculations to the applied version. |
| Async work inside request lifecycle | Timeouts and lost exports/notifications | Use a durable job mechanism with retries, idempotency, monitoring, and recovery. |
| Export/search aggregation leaks data | Sensitive information exposure | Apply authorization before aggregation and recheck protected downloads. |
| Direct deletion breaks history | Missing payroll and audit evidence | Use deactivation/versioning and restrict audited hard deletion to safe, unreferenced data. |
| Frontend contracts drift during backend work | Rework and inconsistent errors | Version service contracts, add contract tests, and integrate feature by feature. |

## 8. Current Progress Summary

| Phase | Status | Completed/Total |
|---:|---|---:|
| Phase 0 - Architecture and Delivery Foundation | Done | 25/25 |
| Phase 1 - MySQL Schema and Data Foundation | Done | 26/26 |
| Phase 2 - Authentication, Authorization, and Audit | Done | 23/23 |
| Phase 3 - Organization, Projects, and Tasks | Done | 27/27 |
| Phase 4 - Timesheet Calculation and Correction | Pending | 0/32 |
| Phase 5 - HR, Attendance, WFH, Leave, Workload, and Evaluation | Pending | 0/26 |
| Phase 6 - Reporting, Finance, and Exports | Pending | 0/19 |
| Phase 7 - Notifications, Documents, Search, and Integrations | Pending | 0/23 |
| Phase 8 - Quality, Performance, Backup, and Security Hardening | Pending | 0/23 |
| Phase 9 - Production Readiness and Frontend Cutover | Pending | 0/18 |
| Phase 10 - Requisition | Pending | 0/20 |
| Phase 11 - Conveyance | Pending | 0/22 |
| Phase 12 - Role Consolidation: Finance into HR | Pending | 0/11 |
| Phase 13 - Meeting Minutes and AI Task Generation | Pending | 0/34 |
| Phase 14 - Client Panel Reporting | Pending | 0/23 |

Update this table whenever numbered tasks change status. Acceptance scenarios and phase exit criteria are tracked as gates and are not included in the numbered task totals.
