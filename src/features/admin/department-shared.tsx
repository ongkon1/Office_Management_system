'use client';

import * as React from 'react';
import { CircleCheck, CircleSlash } from 'lucide-react';
import type { Failure } from '@/contracts/results';
import type { DepartmentLeadAppointmentView } from '@/contracts/organization-hierarchy';
import { Badge } from '@/components/ui/badge';

/**
 * What a department screen shows after a refused save (`OH-FE-0209`).
 *
 * The service answers with a `Result`; this is the same information arranged
 * the way a form renders it. Field failures carry their guidance into the field
 * itself, because `REQ-TIME-025` requires the correction to be stated where the
 * problem is — not only in a summary at the top.
 */
export interface DepartmentFormFailure {
  readonly fieldErrors: readonly { readonly field: string; readonly message: string }[];
  /** A refusal that belongs to the form as a whole, with its guidance. */
  readonly blocking: { readonly title: string; readonly detail: string } | null;
}

export const NO_FORM_FAILURE: DepartmentFormFailure = { fieldErrors: [], blocking: null };

export function toFormFailure(failure: Failure): DepartmentFormFailure {
  if (failure.status === 'validation_failure') {
    return {
      fieldErrors: failure.fieldErrors.map((error) => ({
        field: error.field,
        message: `${error.message} ${error.guidance}`.trim(),
      })),
      blocking: null,
    };
  }
  if (failure.status === 'conflict') {
    return {
      fieldErrors: [],
      blocking: { title: failure.message, detail: failure.guidance },
    };
  }
  if (failure.status === 'permission_denied') {
    return {
      fieldErrors: [],
      blocking: {
        title: failure.message,
        detail: failure.guidance ?? 'Ask a Super Administrator to make this change.',
      },
    };
  }
  if (failure.status === 'unauthenticated') {
    return {
      fieldErrors: [],
      blocking: { title: failure.message, detail: 'Sign in again and repeat the change.' },
    };
  }
  if (failure.status === 'not_found') {
    return {
      fieldErrors: [],
      blocking: {
        title: failure.message,
        detail: 'Reload the catalogue — it may have been changed by someone else.',
      },
    };
  }
  return {
    fieldErrors: [],
    blocking: { title: failure.message, detail: 'Try again in a moment.' },
  };
}

export function fieldErrorFor(
  failure: DepartmentFormFailure,
  field: string,
): string | undefined {
  return failure.fieldErrors.find((error) => error.field === field)?.message;
}

/** Status as shape + text + colour, never colour alone. */
export function DepartmentStatusBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <Badge tone="success" icon={<CircleCheck aria-hidden className="size-3.5 shrink-0" />}>
      Active
    </Badge>
  ) : (
    <Badge tone="neutral" icon={<CircleSlash aria-hidden className="size-3.5 shrink-0" />}>
      Inactive
    </Badge>
  );
}

/**
 * The current lead and the date their appointment took effect
 * (`OH-FE-0202`), with a scheduled successor named separately so the two are
 * never read as one fact.
 */
export function LeadSummary({
  current,
  scheduled,
}: {
  current: DepartmentLeadAppointmentView | null;
  scheduled: DepartmentLeadAppointmentView | null;
}) {
  return (
    <div className="min-w-0">
      <p className="text-body-sm text-ink break-words">
        {current ? current.lead.fullName : 'Not appointed'}
      </p>
      <p className="mt-0.5 text-caption text-ink-muted">
        {current ? `Effective from ${current.effectiveFromLabel}` : 'No appointment on record'}
      </p>
      {scheduled && (
        <p className="mt-1 text-caption text-accent break-words">
          Scheduled: {scheduled.lead.fullName} from {scheduled.effectiveFromLabel}
        </p>
      )}
    </div>
  );
}
