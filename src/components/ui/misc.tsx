import * as React from 'react';
import NextLink from 'next/link';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { DurationView } from '@/contracts/view-models';
import { NOT_RECORDED, NOT_RECORDED_LABEL } from '@/lib/format';

export function Divider({
  orientation = 'horizontal',
  className,
}: {
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}) {
  return (
    <hr
      aria-orientation={orientation}
      className={cn(
        'border-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}

export interface LinkProps extends React.ComponentProps<typeof NextLink> {
  variant?: 'default' | 'subtle';
}

export function Link({ variant = 'default', className, ...props }: LinkProps) {
  return (
    <NextLink
      className={cn(
        'rounded-xs underline underline-offset-2 transition-colors duration-150',
        variant === 'default'
          ? 'text-accent hover:text-accent-hover'
          : 'text-ink-muted hover:text-ink',
        className,
      )}
      {...props}
    />
  );
}

/**
 * Renders a duration with tabular numerals and a spelled-out accessible name.
 *
 * Durations are right-aligned wherever they sit in a column, which is why the
 * display element is inline-block with a stable numeric width.
 */
export function Duration({
  value,
  className,
  emphasis = false,
}: {
  value: DurationView | null;
  className?: string;
  emphasis?: boolean;
}) {
  if (!value) return <NotRecorded />;
  return (
    <span
      className={cn('tabular whitespace-nowrap', emphasis && 'font-semibold', className)}
    >
      <span aria-hidden>{value.display}</span>
      <span className="sr-only">{value.accessibleLabel}</span>
    </span>
  );
}

/** An absent measurement. Never used where zero is the real value. */
export function NotRecorded({ className }: { className?: string }) {
  return (
    <span className={cn('text-ink-subtle', className)}>
      <span aria-hidden>{NOT_RECORDED}</span>
      <span className="sr-only">{NOT_RECORDED_LABEL}</span>
    </span>
  );
}

/**
 * A field the viewer is not authorized to see.
 *
 * The label stays visible so the viewer knows the field exists — hiding it
 * entirely would misrepresent the record as having no such value.
 */
export function RestrictedValue({
  reason = 'You do not have permission to view this value.',
  className,
}: {
  reason?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-body-sm text-ink-subtle italic',
        className,
      )}
      title={reason}
    >
      <Lock aria-hidden className="size-3.5 shrink-0" />
      <span>Restricted</span>
      <span className="sr-only">{reason}</span>
    </span>
  );
}

export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
