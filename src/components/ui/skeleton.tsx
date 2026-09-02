import * as React from 'react';
import { cn } from '@/lib/cn';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Matches the height of the content that will replace it. */
  height?: string;
  width?: string;
  rounded?: 'sm' | 'md' | 'full';
}

/**
 * A loading placeholder.
 *
 * It reserves the final content's space so nothing shifts when data arrives,
 * and it is hidden from assistive technology because the surrounding region
 * announces the loading state once via `aria-busy`.
 */
export function Skeleton({
  height = '1rem',
  width = '100%',
  rounded = 'sm',
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'bg-surface-sunken',
        'bg-[linear-gradient(90deg,var(--color-surface-sunken)_0%,var(--color-border)_50%,var(--color-surface-sunken)_100%)]',
        'bg-[length:200%_100%] animate-[shimmer_1.6s_ease-in-out_infinite]',
        rounded === 'sm' && 'rounded-xs',
        rounded === 'md' && 'rounded-md',
        rounded === 'full' && 'rounded-full',
        className,
      )}
      style={{ height, width, ...style }}
      {...props}
    />
  );
}

export interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          height="0.875rem"
          width={index === lines - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

/**
 * Wraps a region that is loading. Announces once rather than per skeleton, so
 * a screen reader hears "Loading" instead of a wall of placeholders.
 */
export function LoadingRegion({
  label = 'Loading',
  children,
  className,
}: {
  label?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
