import { randomUUID } from 'node:crypto';
import type { Failure, Result } from '@/contracts/results';

/**
 * Result constructors for the Phase 7 supporting services. Every refusal a
 * person can act on carries corrective guidance (`REQ-TIME-025`), and a record
 * the viewer may not see is the same `not_found` a missing one is.
 */
export const invalid = (field: string, message: string, guidance: string): Failure => ({
  status: 'validation_failure', code: 'VALIDATION_FAILED', message, focusField: field,
  fieldErrors: [{ field, code: 'INVALID_VALUE', message, guidance }],
});
export const conflict = (message: string, guidance: string): Failure => ({ status: 'conflict', code: 'CONFLICT', message, guidance });
export const notFound = (resource = 'record'): Failure => ({ status: 'not_found', code: 'NOT_FOUND', message: `${resource} was not found.`, resource });
export const denied = (message = 'You cannot perform this operation.'): Failure => ({ status: 'permission_denied', code: 'FORBIDDEN', message });
export const unauthenticated = (): Failure => ({ status: 'unauthenticated', code: 'UNAUTHENTICATED', message: 'Sign in to continue.', reason: 'no_session' });
export const unavailable = (message: string): Failure => ({ status: 'error', code: 'DEPENDENCY_FAILED', message, retryable: true, reference: randomUUID() });

/** Run a service operation so an infrastructure failure becomes a Result, never a throw. */
export async function guarded<T>(work: () => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await work();
  } catch {
    return unavailable('The operation could not be completed.');
  }
}

/** Today in the business timezone. */
export const businessDate = (instant = new Date().toISOString()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
