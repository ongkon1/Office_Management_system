import * as React from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import type { MetricTileView } from '@/contracts/view-models';
import { RestrictedValue } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `raised` adds elevation for overlays and summary panels. */
  elevation?: 'flat' | 'raised';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
} as const;

export function Card({
  elevation = 'flat',
  padding = 'md',
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        // `min-w-0` is load-bearing: a card is nearly always a grid or flex
        // child, whose default `min-width: auto` lets it grow to its content's
        // min-content width and stretch the whole track past the viewport.
        'min-w-0 rounded-xl border border-border bg-surface shadow-sm',
        elevation === 'raised' && 'border-accent-border/70 shadow-md',
        PADDING_CLASSES[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: string;
  description?: string;
  /** Right-aligned controls: a filter, a link, an overflow menu. */
  actions?: React.ReactNode;
  /**
   * Heading level so the page keeps a correct outline.
   *
   * `h2` by default because a card is a top-level section under the page `h1`
   * on nearly every screen. Pass `h3` only where the card genuinely nests
   * inside a section that already has its own `h2` — skipping a level leaves a
   * screen-reader user unable to tell what a section belongs to.
   */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

export function CardHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
}: CardHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0 flex-1">
        <Heading className="text-h3 text-ink">{title}</Heading>
        {description && (
          <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>
        )}
      </div>
      {/*
        Not `shrink-0`: a header with a long title and several actions has to be
        able to wrap, or it pushes the card wider than the viewport.
      */}
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
} as const;

const TONE_CLASSES = {
  neutral: 'text-ink',
  positive: 'text-complete',
  caution: 'text-undertime',
  negative: 'text-critical',
} as const;

export interface MetricCardProps {
  tile: MetricTileView;
  loading?: boolean;
  className?: string;
}

/**
 * A dashboard metric.
 *
 * Three states matter and are distinct: a real value, a value withheld by
 * permission (label stays, value is replaced by a restricted marker), and a
 * value still loading. A restricted metric is never rendered as zero or blank
 * (`REQ-NFR-SEC-004`).
 */
export function MetricCard({ tile, loading = false, className }: MetricCardProps) {
  const TrendIcon = tile.trend ? TREND_ICONS[tile.trend.direction] : null;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-label text-ink-muted">{tile.label}</span>
        {tile.href && (
          <ArrowUpRight
            aria-hidden
            className="size-4 shrink-0 text-ink-subtle transition-colors group-hover:text-accent"
          />
        )}
      </div>

      {loading ? (
        <div role="status" aria-busy className="mt-2">
          <span className="sr-only">Loading {tile.label}</span>
          <Skeleton height="2rem" width="60%" />
        </div>
      ) : tile.restricted ? (
        <div className="mt-2">
          <RestrictedValue />
        </div>
      ) : (
        <p
          className={cn(
            'mt-1.5 text-metric tabular',
            TONE_CLASSES[tile.tone ?? 'neutral'],
          )}
        >
          {tile.value}
        </p>
      )}

      {!loading && !tile.restricted && (tile.secondaryValue || tile.trend) && (
        <div className="mt-1 flex items-center gap-2 text-caption text-ink-muted">
          {tile.secondaryValue && <span className="tabular">{tile.secondaryValue}</span>}
          {tile.trend && TrendIcon && (
            <span className="inline-flex items-center gap-1">
              <TrendIcon aria-hidden className="size-3.5" />
              {tile.trend.label}
            </span>
          )}
        </div>
      )}
    </>
  );

  if (tile.href && !tile.restricted) {
    return (
      <Link
        href={tile.href}
        className={cn(
          'group relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm',
          'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-brand',
          'transition-[border-color,background-color,box-shadow] duration-200 hover:border-accent-border hover:bg-accent-subtle/30 hover:shadow-md',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        'relative flex flex-col overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm',
        'before:absolute before:inset-x-0 before:top-0 before:h-0.5 before:bg-brand',
        className,
      )}
    >
      {body}
    </div>
  );
}
