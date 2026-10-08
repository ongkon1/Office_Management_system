# BE-0901 Verification — Server Authentication Cutover

## Outcome

`BE-0901` is complete. Production browser authentication no longer imports or restores the mock authentication service. The browser now uses `/api/auth`; the durable credential is an opaque MySQL-backed session token held only in an HttpOnly, SameSite cookie. The client retains only a memory copy of the authorized `SessionUser` view and does not write identity or session tokens to `localStorage`.

## Delivered behavior

- Credential login accepts email or employee identifier and uses the existing constant-time password verification, durable lockout, login history, rate limiting, and security-event services.
- Active sessions are loaded from MySQL on application hydration, rotated on refresh, revoked on logout/password change, and removed from the browser when invalid or expired.
- Cookie names and flags follow the existing environment boundary: `office_session` locally and a Secure `__Host-office_session` cookie in production.
- Same-origin mutation checks protect every authentication POST operation.
- Account-inactive and account-locked responses retain their approved explanatory routes, while unknown account and invalid-password responses remain non-enumerating.
- Two-factor login uses a short-lived signed HttpOnly challenge cookie, encrypted TOTP secrets, a one-window clock tolerance, and single-use recovery codes. No authenticated session is issued before successful verification.
- Password-reset requests retain the non-enumerating response. The reset page and server contract accept both the opaque token and account identifier required by the single-use backend verifier.
- Password changes verify the current password, enforce the 12-character minimum, revoke existing sessions transactionally, audit the event, and issue a replacement session.
- The approved loading, validation, permission-denied, session-expired, two-factor, and dependency-error UI states remain represented through the shared `Result<T>` contract.

## Principal files

| Area | Files |
|---|---|
| Route and browser adapter | `src/app/api/auth/route.ts`, `src/services/server/auth.ts` |
| Browser session boundary | `src/features/access/session-provider.tsx`, `src/features/access/session-store.ts` |
| Identity projection | `src/server/authentication/session-user.ts` |
| Authentication composition | `src/server/authentication/composition.ts` |
| Credential/session store | `src/server/authentication/service.ts`, `src/server/authentication/mysql-store.ts` |
| Two-factor provider | `src/server/authentication/totp-provider.ts` |
| Existing screens cut over | password forms, two-factor form, and password settings |

## Verification evidence

Executed on 2026-09-30:

- TypeScript: `tsc --noEmit` — passed.
- Targeted ESLint over every changed authentication/client file — passed.
- Browser adapter tests — 2/2 passed.
- Backend unit suite — 17 files and 96 tests passed, including authentication, session, password-change, encryption, and TOTP coverage.
- Migration status — migrations `0001` through `0011` reported applied against the configured local MySQL database.
- Production build — Next.js 16.3.4 compiled, type-checked, generated all 63 static pages, and registered `/api/auth` as a dynamic server route.
- Live route smoke check — `/api/auth` reached the configured MySQL authentication path and returned the approved non-enumerating invalid-credential response without exposing account details.

The local database's current demo passwords were intentionally not overwritten during verification; running the development seeder would reset user-owned test data and is not part of this cutover.

## Scope boundary

This task cuts over authentication only. The remaining organization, time, HR, reporting, and supporting frontend adapters remain tracked by `BE-0902`; direct production fixture removal remains `BE-0903`.
