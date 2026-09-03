import * as React from 'react';
import { cn } from '@/lib/cn';

/**
 * The shell for every unauthenticated screen.
 *
 * A two-column split at `lg` and up: the form on the left at a readable
 * measure, a quiet brand panel on the right. Below `lg` the panel is dropped
 * entirely rather than stacked — on a phone it would push the form below the
 * fold for no benefit.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
  aside,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra content under the card, e.g. the demo account picker. */
  aside?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6"
      >
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-body-sm font-bold text-ink-inverse"
            >
              T
            </span>
            <span className="text-body font-semibold text-ink">Timesheet</span>
          </div>

          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h1 className="text-h2 text-ink">{title}</h1>
            {description && (
              <p className="mt-1.5 text-body-sm text-ink-muted">{description}</p>
            )}
            <div className="mt-5">{children}</div>
          </div>

          {footer && <div className="mt-4 text-center text-body-sm">{footer}</div>}
          {aside && <div className="mt-6">{aside}</div>}
        </div>
      </main>

      <aside
        aria-hidden
        className={cn(
          'hidden w-[42%] max-w-2xl shrink-0 flex-col justify-between',
          'border-l border-border bg-surface-sunken p-10 lg:flex',
        )}
      >
        <div />
        <div className="max-w-md">
          <p className="text-display text-ink">
            One record of time,
            <br />
            across every division.
          </p>
          <p className="mt-4 text-body text-ink-muted">
            Record work against divisions, projects, and tasks. Seven active hours
            plus a separate break hour makes a complete eight-hour day.
          </p>
          <dl className="mt-8 grid grid-cols-3 gap-4 border-t border-border pt-6">
            {[
              { term: 'Active work', detail: '7:00' },
              { term: 'Break', detail: '1:00' },
              { term: 'Daily total', detail: '8:00' },
            ].map((item) => (
              <div key={item.term}>
                <dt className="text-caption text-ink-subtle">{item.term}</dt>
                <dd className="mt-0.5 text-h2 text-ink tabular">{item.detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-caption text-ink-subtle">
          Internal system. Authorized users only.
        </p>
      </aside>
    </div>
  );
}
