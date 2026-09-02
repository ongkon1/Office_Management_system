import * as React from 'react';
import { cn } from '@/lib/cn';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'missing'
  | 'undertime'
  | 'complete'
  | 'overtime'
  | 'critical';

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-border',
  accent: 'bg-accent-subtle text-accent border-accent-border',
  success: 'bg-success-surface text-success border-complete-border',
  warning: 'bg-warning-surface text-warning border-undertime-border',
  danger: 'bg-danger-surface text-danger border-critical-border',
  info: 'bg-info-surface text-info border-border',
  missing: 'bg-missing-surface text-missing border-missing-border',
  undertime: 'bg-undertime-surface text-undertime border-undertime-border',
  complete: 'bg-complete-surface text-complete border-complete-border',
  overtime: 'bg-overtime-surface text-overtime border-overtime-border',
  critical: 'bg-critical-surface text-critical border-critical-border',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  icon?: React.ReactNode;
}

export function Badge({
  tone = 'neutral',
  icon,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
        'text-caption font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export interface CountBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  count: number;
  /** Values above this render as `99+`. */
  max?: number;
  label?: string;
}

export function CountBadge({
  count,
  max = 99,
  label,
  className,
  ...props
}: CountBadgeProps) {
  if (count <= 0) return null;
  const display = count > max ? `${max}+` : String(count);
  return (
    <span
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded-full px-1.5',
        'bg-accent text-caption font-semibold text-white tabular',
        className,
      )}
      aria-label={label ? `${count} ${label}` : undefined}
      {...props}
    >
      {display}
    </span>
  );
}
