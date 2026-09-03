/**
 * FE-0206 — Mock authentication adapter.
 *
 * Implements `AuthService` from `src/contracts/services.ts`. Screens consume
 * this through the same interface the server implementation will satisfy, so
 * the backend milestone replaces this file without touching a screen.
 *
 * It deliberately reproduces server behaviours that shape the UI:
 *  - non-enumerating password reset (`REQ-NFR-SEC-002`)
 *  - failed-attempt lockout
 *  - a two-factor step for accounts that require it
 *  - account status refused at sign-in, not after
 */

import type { SessionUser } from '@/contracts/domain';
import type { AuthService, LoginInput } from '@/contracts/services';
import { success, type Result } from '@/contracts/results';
import {
  DEMO_LOCALE,
  DEMO_PASSWORD,
  DEMO_TIMEZONE,
  findAccountByIdentifier,
  findAccountByUserId,
  type AccountStatus,
  type DemoAccount,
} from './accounts';

/** How long a mock session lasts. Short enough to demo the expiry warning. */
export const SESSION_DURATION_MS = 30 * 60 * 1000;

/** Failed attempts before the account locks. */
export const MAX_FAILED_ATTEMPTS = 5;

/** The code every 2FA-enabled demo account accepts. */
export const DEMO_TWO_FACTOR_CODE = '123456';

export const TWO_FACTOR_RESEND_SECONDS = 30;

/** Reset tokens the demo recognises, so each state is reachable by URL. */
export const DEMO_RESET_TOKENS = {
  valid: 'demo-valid-token',
  expired: 'demo-expired-token',
  invalid: 'demo-invalid-token',
} as const;

/** Simulated latency, so loading states are visible rather than theoretical. */
const LATENCY_MS = 350;

function delay(ms = LATENCY_MS): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function toSessionUser(account: DemoAccount): SessionUser {
  return {
    userId: account.userId,
    employeeId: account.employeeId,
    displayName: account.fullName,
    email: account.email,
    avatarUrl: null,
    roles: account.roles,
    primaryRole: account.primaryRole,
    permissions: account.permissions,
    scopedDivisionIds: account.scopedDivisionIds,
    scopedEmployeeIds: account.scopedEmployeeIds,
    timezone: DEMO_TIMEZONE,
    locale: DEMO_LOCALE,
    sessionExpiresAt: new Date(Date.now() + SESSION_DURATION_MS).toISOString(),
  };
}

/** Statuses that block sign-in, with the route that explains each one. */
const BLOCKED_STATUS_ROUTE: Record<Exclude<AccountStatus, 'active'>, string> = {
  locked: '/account-locked',
  inactive: '/account-inactive',
};

export interface MockLoginBlocked {
  readonly reason: 'locked' | 'inactive';
  readonly route: string;
}

/**
 * In-memory failed-attempt counter. Resets on a successful sign-in and on page
 * reload — a real implementation persists this per account.
 */
const failedAttempts = new Map<string, number>();

export class MockAuthService implements AuthService {
  /** Set between a successful password check and 2FA verification. */
  private pendingTwoFactorUserId: string | null = null;

  /** The session the provider restored, if any. */
  private currentSession: SessionUser | null = null;

  setRestoredSession(session: SessionUser | null): void {
    this.currentSession = session;
  }

  async getSession(): Promise<Result<SessionUser | null>> {
    return success(this.currentSession);
  }

  async login(
    input: LoginInput,
  ): Promise<Result<{ requiresTwoFactor: boolean; user: SessionUser | null }>> {
    await delay();

    const account = findAccountByIdentifier(input.identifier);

    // Unknown identifier and wrong password fail identically, so the form
    // cannot be used to discover which accounts exist.
    if (!account || input.password !== DEMO_PASSWORD) {
      const key = input.identifier.trim().toLowerCase();
      const attempts = (failedAttempts.get(key) ?? 0) + 1;
      failedAttempts.set(key, attempts);

      if (account && attempts >= MAX_FAILED_ATTEMPTS) {
        return {
          status: 'validation_failure',
          code: 'VALIDATION_FAILED',
          message: 'This account is now locked.',
          fieldErrors: [
            {
              field: 'identifier',
              code: 'ACCOUNT_LOCKED',
              message: `Too many failed sign-in attempts.`,
              guidance: 'Contact your administrator to unlock this account.',
            },
          ],
          focusField: 'identifier',
        };
      }

      const remaining = MAX_FAILED_ATTEMPTS - attempts;
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'Sign-in failed.',
        fieldErrors: [
          {
            field: 'password',
            code: 'INVALID_CREDENTIALS',
            message: 'That email or employee ID and password do not match.',
            guidance:
              remaining > 0 && remaining <= 2
                ? `Check both fields and try again. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining before the account locks.`
                : 'Check both fields and try again.',
          },
        ],
        focusField: 'password',
      };
    }

    failedAttempts.delete(input.identifier.trim().toLowerCase());

    if (account.status !== 'active') {
      const blocked = BLOCKED_STATUS_ROUTE[account.status];
      return {
        status: 'permission_denied',
        code: 'FORBIDDEN',
        message:
          account.status === 'locked'
            ? 'This account is locked.'
            : 'This account is no longer active.',
        guidance: blocked,
      };
    }

    if (account.twoFactorEnabled) {
      this.pendingTwoFactorUserId = account.userId;
      return success({ requiresTwoFactor: true, user: null });
    }

    const session = toSessionUser(account);
    this.currentSession = session;
    return success({ requiresTwoFactor: false, user: session });
  }

  async verifyTwoFactor(input: { code: string }): Promise<Result<SessionUser>> {
    await delay();

    if (!this.pendingTwoFactorUserId) {
      return {
        status: 'unauthenticated',
        code: 'UNAUTHENTICATED',
        message: 'Your sign-in attempt has expired.',
        reason: 'session_expired',
      };
    }

    if (input.code.trim() !== DEMO_TWO_FACTOR_CODE) {
      return {
        status: 'validation_failure',
        code: 'VALIDATION_FAILED',
        message: 'That code is not valid.',
        fieldErrors: [
          {
            field: 'code',
            code: 'INVALID_CODE',
            message: 'That code is not valid or has expired.',
            guidance: 'Check the latest code in your authenticator app, or request a new one.',
          },
        ],
        focusField: 'code',
      };
    }

    const account = findAccountByUserId(this.pendingTwoFactorUserId);
    if (!account) {
      return {
        status: 'unauthenticated',
        code: 'UNAUTHENTICATED',
        message: 'Your sign-in attempt has expired.',
        reason: 'session_expired',
      };
    }

    this.pendingTwoFactorUserId = null;
    const session = toSessionUser(account);
    this.currentSession = session;
    return success(session);
  }

  async resendTwoFactorCode(): Promise<Result<{ nextResendAvailableAt: string }>> {
    await delay(200);
    return success({
      nextResendAvailableAt: new Date(
        Date.now() + TWO_FACTOR_RESEND_SECONDS * 1000,
      ).toISOString(),
    });
  }

  /**
   * Always reports success. Telling the user whether an address exists turns
   * this form into an account-enumeration oracle (`REQ-NFR-SEC-002`).
   */
  async requestPasswordReset(input: { email: string }): Promise<Result<void>> {
    await delay();
    // The address is deliberately unused: the response must not depend on it.
    void input;
    return success(undefined);
  }

  async resetPassword(input: { token: string; password: string }): Promise<Result<void>> {
    await delay();

    if (input.token === DEMO_RESET_TOKENS.expired) {
      return {
        status: 'conflict',
        code: 'CONFLICT',
        message: 'This reset link has expired.',
        guidance: 'Request a new link and use it within one hour.',
      };
    }

    if (input.token !== DEMO_RESET_TOKENS.valid) {
      return {
        status: 'not_found',
        code: 'NOT_FOUND',
        message: 'This reset link is not valid.',
        resource: 'password_reset_token',
      };
    }

    return success(undefined);
  }

  async logout(): Promise<Result<void>> {
    await delay(150);
    this.pendingTwoFactorUserId = null;
    this.currentSession = null;
    return success(undefined);
  }

  /** Development-only. Absent from the interface a production build satisfies. */
  async switchDemoAccount(input: { userId: string }): Promise<Result<SessionUser>> {
    await delay(150);
    const account = findAccountByUserId(input.userId);
    if (!account) {
      return {
        status: 'not_found',
        code: 'NOT_FOUND',
        message: 'Unknown demo account.',
      };
    }
    const session = toSessionUser(account);
    this.currentSession = session;
    return success(session);
  }

  /** Test seam: clears the failed-attempt counter. */
  static resetAttempts(): void {
    failedAttempts.clear();
  }
}

export const mockAuthService = new MockAuthService();
