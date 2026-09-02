/**
 * FE-0017 - Standard result shapes.
 *
 * Every mock service operation and, later, every server action or route handler
 * resolves to one of these shapes. UI components branch on `status` alone and
 * never inspect transport details, so the MySQL implementation can replace the
 * mock adapters without changing a single screen.
 */

/** Canonical failure codes shared by the frontend and the future backend. */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PERIOD_LOCKED'
  | 'RATE_LIMITED'
  | 'DEPENDENCY_FAILED'
  | 'INTERNAL_ERROR';

/**
 * A single field-level validation failure.
 *
 * `REQ-TIME-025` requires every validation response to identify the affected
 * field or entry and state how the user can correct it, so `guidance` is not
 * optional.
 */
export interface FieldError {
  /** Dot/bracket path into the submitted payload, e.g. `entries[1].endTime`. */
  readonly field: string;
  /** Machine-readable reason, e.g. `OVERLAPPING_ENTRY`. */
  readonly code: string;
  /** Plain-language statement of what is wrong. */
  readonly message: string;
  /** Plain-language statement of how to fix it. */
  readonly guidance: string;
  /** Identifier of a related record, such as the entry an overlap collides with. */
  readonly relatedRecordId?: string;
}

export interface ValidationFailure {
  readonly status: 'validation_failure';
  readonly code: 'VALIDATION_FAILED';
  /** Summary shown above the form when more than one field failed. */
  readonly message: string;
  readonly fieldErrors: readonly FieldError[];
  /** Field path that should receive focus first. */
  readonly focusField?: string;
}

export interface PermissionDenied {
  readonly status: 'permission_denied';
  readonly code: 'FORBIDDEN';
  readonly message: string;
  /** What the viewer would need, e.g. `finance.cost.view`. Safe to display. */
  readonly requiredPermission?: string;
  /** Never contains the protected content itself. */
  readonly guidance?: string;
}

export interface Unauthenticated {
  readonly status: 'unauthenticated';
  readonly code: 'UNAUTHENTICATED';
  readonly message: string;
  /** Distinguishes an expired session from never having been signed in. */
  readonly reason: 'no_session' | 'session_expired' | 'two_factor_required';
  /** Route to return to after re-authentication. */
  readonly returnTo?: string;
}

export interface NotFound {
  readonly status: 'not_found';
  readonly code: 'NOT_FOUND';
  readonly message: string;
  readonly resource?: string;
}

export interface Conflict {
  readonly status: 'conflict';
  readonly code: 'CONFLICT' | 'PERIOD_LOCKED';
  readonly message: string;
  readonly guidance: string;
  /** Set when the conflict is a verified/locked period (`REQ-TIME-027`). */
  readonly lockedPeriod?: {
    readonly periodId: string;
    readonly label: string;
    readonly verifiedAt: string;
    readonly amendmentPathAvailable: boolean;
  };
}

export interface UnexpectedError {
  readonly status: 'error';
  readonly code: 'RATE_LIMITED' | 'DEPENDENCY_FAILED' | 'INTERNAL_ERROR';
  readonly message: string;
  /** Correlation identifier safe to show in a support message. */
  readonly reference?: string;
  readonly retryable: boolean;
}

export interface Success<TData> {
  readonly status: 'success';
  readonly data: TData;
  /** Optional non-blocking warnings, e.g. allocation not equal to 100% (`REQ-ORG-010`). */
  readonly warnings?: readonly ResultWarning[];
}

export interface ResultWarning {
  readonly code: string;
  readonly message: string;
  readonly field?: string;
}

/** Every failure a service operation may return. */
export type Failure =
  | ValidationFailure
  | PermissionDenied
  | Unauthenticated
  | NotFound
  | Conflict
  | UnexpectedError;

/** The result of any query or mutation. */
export type Result<TData> = Success<TData> | Failure;

/**
 * Client-side request state, including the loading phase that a `Result`
 * cannot express because it exists before the operation settles.
 */
export type RequestState<TData> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | Result<TData>;

export function isSuccess<TData>(result: Result<TData>): result is Success<TData> {
  return result.status === 'success';
}

export function isFailure<TData>(result: Result<TData>): result is Failure {
  return result.status !== 'success';
}

export function isValidationFailure<TData>(
  result: Result<TData>,
): result is ValidationFailure {
  return result.status === 'validation_failure';
}

export function isPermissionDenied<TData>(
  result: Result<TData>,
): result is PermissionDenied {
  return result.status === 'permission_denied';
}

export function isConflict<TData>(result: Result<TData>): result is Conflict {
  return result.status === 'conflict';
}

/** Convenience constructor used by mock adapters and tests. */
export function success<TData>(
  data: TData,
  warnings?: readonly ResultWarning[],
): Success<TData> {
  return warnings && warnings.length > 0
    ? { status: 'success', data, warnings }
    : { status: 'success', data };
}
