import * as React from 'react';
import { cn } from '@/lib/cn';

export type ProgressTone = 'accent' | 'complete' | 'undertime' | 'overtime' | 'critical';

const TONE_CLASSES: Record<ProgressTone, string> = {
  accent: 'bg-accent',
  complete: 'bg-complete',
  undertime: 'bg-undertime',
  overtime: 'bg-overtime',
  critical: 'bg-critical',
};

export interface ProgressBarProps {
  /** 0-100. Values outside the range are clamped. */
  value: number;
  label: string;
  /** Text shown beside the label, e.g. `7:00 of 8:00`. */
  valueText?: string;
  tone?: ProgressTone;
  /** Hides the label row when the surrounding card already states it. */
  hideLabel?: boolean;
  className?: string;
}

/**
 * A determinate progress bar.
 *
 * `valueText` exists because progress toward a schedule is meaningful as a
 * duration, not as a percentage — a screen reader should hear "7:00 of 8:00",
 * not "88 percent".
 */
export function ProgressBar({
  value,
  label,
  valueText,
  tone = 'accent',
  hideLabel = false,
  className,
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {!hideLabel && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-label text-ink-muted">{label}</span>
          {valueText && (
            <span className="text-label font-medium text-ink tabular">{valueText}</span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(clamped)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={valueText}
        aria-label={hideLabel ? label : undefined}
        className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0,0,0.15,1)]',
            TONE_CLASSES[tone],
          )}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export interface SpinnerProps {
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center', className)}>
      <span
        aria-hidden
        className={cn(
          'inline-block animate-[spin_0.8s_linear_infinite] rounded-full',
          'border-2 border-border border-t-accent',
          size === 'sm' ? 'size-4' : 'size-6',
        )}
      />
      <span className="sr-only">{label}</span>
    </span>
  );
}
