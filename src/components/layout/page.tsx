import * as React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

/**
 * Breadcrumbs.
 *
 * Hidden below `md`, where a back control in the page header replaces them.
 * The trailing crumb is the current page and is never a link, so it does not
 * offer a route to where the user already is.
 */
export function Breadcrumbs({
  crumbs,
  className,
}: {
  crumbs: readonly Crumb[];
  className?: string;
}) {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn('hidden md:block', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="inline-flex min-h-6 items-center rounded-xs transition-colors hover:text-ink hover:underline"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined} className="text-ink">
                  {crumb.label}
                </span>
              )}
              {!isLast && <ChevronRight aria-hidden className="size-3.5 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  crumbs?: readonly Crumb[];
  /** Explicit parent link; on mobile it replaces the breadcrumb trail. */
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  /** Status badges, period selectors, or verification state. */
  meta?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  crumbs,
  backHref,
  backLabel = 'Back',
  actions,
  meta,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3', className)}>
      {crumbs && <Breadcrumbs crumbs={crumbs} />}

      {backHref && (
        <Link
          href={backHref}
          className="inline-flex min-h-6 w-fit items-center gap-1 rounded-xs text-caption text-ink-muted hover:text-ink md:hidden"
        >
          <ChevronRight aria-hidden className="size-3.5 rotate-180" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-h1 text-ink">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">{description}</p>
          )}
          {meta && <div className="mt-2 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && (
          // Not `shrink-0`: a header with several actions must be able to
          // shrink and wrap, or it pushes the document wider than the viewport.
          <div
            className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end"
            data-print="hide"
          >
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
  as: Heading = 'h2',
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <Heading className="text-h2 text-ink">{title}</Heading>
        {description && (
          <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Constrains and pads page content consistently across every route. */
export function PageContainer({
  children,
  width = 'default',
  className,
}: {
  children: React.ReactNode;
  /** `narrow` for forms and reading; `full` for dense grids and tables. */
  width?: 'narrow' | 'default' | 'full';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-5 sm:px-6 lg:px-8',
        width === 'narrow' && 'max-w-3xl',
        width === 'default' && 'max-w-[var(--content-max-width)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A responsive dashboard grid: 1 column, then 2, then 4. */
export function DashboardGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}
    >
      {children}
    </div>
  );
}

/** Main content beside a secondary panel that drops below it on mobile. */
export function SplitPanel({
  main,
  aside,
  asideWidth = 'md',
  className,
}: {
  main: React.ReactNode;
  aside: React.ReactNode;
  asideWidth?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-5 lg:flex-row', className)}>
      <div className="min-w-0 flex-1">{main}</div>
      <aside
        className={cn(
          'shrink-0 lg:w-full',
          asideWidth === 'sm' ? 'lg:max-w-72' : 'lg:max-w-96',
        )}
      >
        {aside}
      </aside>
    </div>
  );
}

/**
 * A sticky action bar for forms.
 *
 * It sits above the mobile bottom navigation and inside the safe area, so the
 * primary action stays reachable with the on-screen keyboard open — the single
 * most common mobile form failure.
 */
export function StickyActionBar({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-print="hide"
      className={cn(
        'sticky bottom-0 z-10 -mx-4 mt-5 flex flex-wrap items-center justify-end gap-2',
        'border-t border-border bg-surface/95 px-4 py-3 backdrop-blur',
        'sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        'mb-[var(--shell-bottom-nav-height)] md:mb-0 safe-bottom',
        className,
      )}
    >
      {children}
    </div>
  );
}
