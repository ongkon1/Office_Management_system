import * as React from 'react';
import {
  CircleAlert,
  CircleCheck,
  Info,
  Lock,
  SearchX,
  TriangleAlert,
  WifiOff,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const ALERT_CONFIG: Record<
  AlertTone,
  { icon: typeof Info; container: string; icon_: string }
> = {
  info: {
    icon: Info,
    container: 'border-border bg-info-surface',
    icon_: 'text-info',
  },
  success: {
    icon: CircleCheck,
    container: 'border-complete-border bg-success-surface',
    icon_: 'text-success',
  },
  warning: {
    icon: TriangleAlert,
    container: 'border-undertime-border bg-warning-surface',
    icon_: 'text-warning',
  },
  danger: {
    icon: CircleAlert,
    container: 'border-critical-border bg-danger-surface',
    icon_: 'text-danger',
  },
};

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** `alert` interrupts a screen reader; use it only for errors the user caused. */
  live?: boolean;
  className?: string;
}

export function Alert({
  tone = 'info',
  title,
  children,
  actions,
  live = false,
  className,
}: AlertProps) {
  const config = ALERT_CONFIG[tone];
  const Icon = config.icon;

  return (
    <div
      role={live ? 'alert' : undefined}
      className={cn('rounded-md border p-4', config.container, className)}
    >
      <div className="flex gap-3">
        <Icon aria-hidden className={cn('mt-0.5 size-4.5 shrink-0', config.icon_)} />
        <div className="min-w-0 flex-1">
          <p className="text-body-sm font-semibold text-ink">{title}</p>
          {children && <div className="mt-1 text-body-sm text-ink-muted">{children}</div>}
          {actions && <div className="mt-3 flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>
    </div>
  );
}

/** A quieter inline note used inside forms and cards. */
export function Callout({
  tone = 'info',
  children,
  className,
}: {
  tone?: AlertTone;
  children: React.ReactNode;
  className?: string;
}) {
  const config = ALERT_CONFIG[tone];
  const Icon = config.icon;

  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-caption text-ink-muted',
        config.container,
        className,
      )}
    >
      <Icon aria-hidden className={cn('mt-px size-3.5 shrink-0', config.icon_)} />
      <span>{children}</span>
    </p>
  );
}

export type EmptyStateVariant =
  | 'empty'
  | 'no-results'
  | 'error'
  | 'denied'
  | 'offline'
  | 'locked';

const EMPTY_CONFIG: Record<
  EmptyStateVariant,
  { icon: typeof Info; tone: string }
> = {
  empty: { icon: Info, tone: 'text-ink-subtle' },
  'no-results': { icon: SearchX, tone: 'text-ink-subtle' },
  error: { icon: CircleAlert, tone: 'text-danger' },
  denied: { icon: Lock, tone: 'text-ink-muted' },
  offline: { icon: WifiOff, tone: 'text-warning' },
  locked: { icon: Lock, tone: 'text-ink-muted' },
};

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title: string;
  /** Say what to do next, not only what went wrong. */
  description?: string;
  action?: { readonly label: string; readonly onClick: () => void };
  secondaryAction?: React.ReactNode;
  className?: string;
}

/**
 * The one component for every "there is nothing here" case.
 *
 * The variants are deliberately distinct: an empty list, a filtered list with
 * no matches, a failure, a permission denial, an offline state, and a locked
 * period are six different situations and must never look identical.
 */
export function EmptyState({
  variant = 'empty',
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  const config = EMPTY_CONFIG[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed',
        'border-border bg-surface px-6 py-12 text-center',
        className,
      )}
    >
      <Icon aria-hidden className={cn('size-8', config.tone)} />
      <div className="max-w-md">
        <p className="text-body font-semibold text-ink">{title}</p>
        {description && <p className="mt-1 text-body-sm text-ink-muted">{description}</p>}
      </div>
      {(action || secondaryAction) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
