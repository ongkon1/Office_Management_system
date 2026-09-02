import * as React from 'react';
import {
  Circle,
  CircleCheck,
  CircleDashed,
  ChevronUp,
  TriangleAlert,
} from 'lucide-react';
import type { DayStatus } from '@/contracts/domain';
import { describeDayStatus } from '@/lib/status';
import { cn } from '@/lib/cn';
import { Badge, type BadgeTone } from './badge';

const SHAPE_ICONS = {
  'circle-empty': CircleDashed,
  'circle-half': Circle,
  'circle-check': CircleCheck,
  'chevron-up': ChevronUp,
  'triangle-alert': TriangleAlert,
} as const;

/**
 * Written out rather than interpolated: Tailwind scans source text, so a class
 * built as `text-${tone}` is never generated and the colour silently vanishes.
 */
const TONE_TEXT_CLASSES = {
  missing: 'text-missing',
  undertime: 'text-undertime',
  complete: 'text-complete',
  overtime: 'text-overtime',
  critical: 'text-critical',
} as const;

export interface StatusIndicatorProps {
  status: DayStatus;
  /**
   * `badge` for tables and cards, `inline` for dense rows, `dot` for calendar
   * cells where the label sits adjacent.
   */
  variant?: 'badge' | 'inline' | 'dot';
  className?: string;
}

/**
 * Renders a day classification as shape + text + colour.
 *
 * The visible label is never omitted in the `badge` and `inline` variants; the
 * `dot` variant carries the full label as an accessible name because a
 * calendar cell shows the text beside it.
 */
export function StatusIndicator({
  status,
  variant = 'badge',
  className,
}: StatusIndicatorProps) {
  const descriptor = describeDayStatus(status);
  const Icon = SHAPE_ICONS[descriptor.shape];

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex', className)}>
        <Icon
          aria-hidden
          className={cn('size-3.5', TONE_TEXT_CLASSES[descriptor.tone])}
          strokeWidth={2.5}
        />
        <span className="sr-only">{descriptor.accessibleLabel}</span>
      </span>
    );
  }

  if (variant === 'inline') {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 text-body-sm font-medium',
          TONE_TEXT_CLASSES[descriptor.tone],
          className,
        )}
      >
        <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
        <span>{descriptor.label}</span>
        <span className="sr-only">{descriptor.accessibleLabel}</span>
      </span>
    );
  }

  return (
    <Badge
      tone={descriptor.tone as BadgeTone}
      className={className}
      icon={<Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />}
    >
      {descriptor.label}
      <span className="sr-only">{descriptor.accessibleLabel}</span>
    </Badge>
  );
}
