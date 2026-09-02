'use client';

import * as React from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldContextValue {
  readonly inputId: string;
  readonly describedBy: string | undefined;
  readonly invalid: boolean;
  readonly required: boolean;
  readonly disabled: boolean;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

/**
 * Consumed by every control so labels, helper text, and error text are wired
 * automatically. A control used outside a `Field` still works — it simply
 * carries no generated ids — which keeps controls usable in toolbars and
 * table filters where a visible label lives elsewhere.
 */
export function useField(): FieldContextValue | null {
  return React.useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  children: React.ReactNode;
  /** Guidance shown before the user acts. */
  helperText?: string;
  /** Field-level failure. Its presence marks the control invalid. */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Hides the label visually while keeping it for assistive technology. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * The accessible wrapper every input sits in.
 *
 * Required state is conveyed in text ("Required"), not by an asterisk alone;
 * the error is announced through a live region and referenced by
 * `aria-describedby`, so a screen reader hears what is wrong on focus rather
 * than only on submit (`REQ-NFR-UX-003`, `REQ-TIME-025`).
 */
export function Field({
  label,
  children,
  helperText,
  error,
  required = false,
  disabled = false,
  hideLabel = false,
  className,
}: FieldProps) {
  const reactId = React.useId();
  const inputId = `field-${reactId}`;
  const helperId = helperText ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined;

  const context = React.useMemo<FieldContextValue>(
    () => ({ inputId, describedBy, invalid: Boolean(error), required, disabled }),
    [inputId, describedBy, error, required, disabled],
  );

  return (
    <FieldContext.Provider value={context}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label
          htmlFor={inputId}
          className={cn(
            'flex items-center gap-1.5 text-label text-ink',
            hideLabel && 'sr-only',
            disabled && 'text-ink-subtle',
          )}
        >
          <span>{label}</span>
          {required && (
            <span className="text-caption font-normal text-ink-subtle">Required</span>
          )}
        </label>

        {children}

        {helperText && !error && (
          <p id={helperId} className="text-caption text-ink-muted">
            {helperText}
          </p>
        )}

        {error && (
          <p
            id={errorId}
            className="flex items-start gap-1.5 text-caption font-medium text-danger"
          >
            <CircleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}
      </div>
    </FieldContext.Provider>
  );
}

export interface FormErrorSummaryProps {
  /** Ordered as the fields appear, so focus moves top-down. */
  errors: readonly { readonly field: string; readonly message: string }[];
  title?: string;
  /** Called with a field path when the user activates its link. */
  onFocusField?: (field: string) => void;
  /**
   * Take focus when the summary appears. Correct after a submit, which is why
   * it defaults on — but it also scrolls the page, so pass `false` anywhere the
   * summary is rendered statically rather than in response to the user acting.
   */
  autoFocus?: boolean;
  className?: string;
}

/**
 * The summary shown above a form when more than one field failed.
 *
 * It takes focus on appearance so a keyboard or screen-reader user is told
 * what went wrong immediately, and each entry moves focus to its control.
 */
export function FormErrorSummary({
  errors,
  title,
  onFocusField,
  autoFocus = true,
  className,
}: FormErrorSummaryProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (autoFocus && errors.length > 0) ref.current?.focus();
  }, [autoFocus, errors.length]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className={cn(
        'rounded-md border border-critical-border bg-critical-surface p-4',
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-body-sm font-semibold text-danger">
        <CircleAlert aria-hidden className="size-4 shrink-0" />
        {title ?? `${errors.length} field${errors.length === 1 ? '' : 's'} need attention`}
      </h2>
      <ul className="mt-2 flex flex-col gap-1 pl-6">
        {errors.map((entry) => (
          <li key={entry.field} className="list-disc text-body-sm text-ink">
            <button
              type="button"
              className="inline-flex min-h-6 items-center rounded-xs text-left underline underline-offset-2 hover:text-danger"
              onClick={() => onFocusField?.(entry.field)}
            >
              {entry.message}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
