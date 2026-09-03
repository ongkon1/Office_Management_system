'use client';

import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/* -------------------------------------------------------------------------- */
/* Tabs                                                                       */
/* -------------------------------------------------------------------------- */

export interface TabItem {
  readonly key: string;
  readonly label: string;
  readonly badgeCount?: number;
  readonly disabled?: boolean;
}

export interface TabsProps {
  items: readonly TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  label: string;
  className?: string;
}

/**
 * A tab list with arrow-key navigation and a roving tabindex.
 *
 * The strip scrolls horizontally on small screens rather than wrapping, which
 * keeps the selected tab's position predictable on an eleven-tab employee
 * profile.
 */
export function Tabs({ items, activeKey, onChange, label, className }: TabsProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const enabled = items.filter((item) => !item.disabled);
    if (enabled.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % items.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;

    if (nextIndex !== null) {
      event.preventDefault();
      const target = items[nextIndex];
      if (!target.disabled) {
        onChange(target.key);
        refs.current[nextIndex]?.focus();
      }
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex gap-1 overflow-x-auto border-b border-border',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.key === activeKey;
        return (
          <button
            key={item.key}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.key}`}
            aria-selected={active}
            aria-controls={`panel-${item.key}`}
            tabIndex={active ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5',
              'text-body-sm font-medium whitespace-nowrap transition-colors duration-150',
              'disabled:cursor-not-allowed disabled:opacity-55',
              active
                ? 'border-accent text-ink'
                : 'border-transparent text-ink-muted hover:border-border-strong hover:text-ink',
            )}
          >
            {item.label}
            {item.badgeCount !== undefined && item.badgeCount > 0 && (
              <span className="rounded-full bg-surface-sunken px-1.5 text-caption tabular text-ink-muted">
                {item.badgeCount}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  tabKey,
  activeKey,
  children,
  className,
}: {
  tabKey: string;
  activeKey: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (tabKey !== activeKey) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${tabKey}`}
      aria-labelledby={`tab-${tabKey}`}
      tabIndex={0}
      className={className}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Accordion                                                                  */
/* -------------------------------------------------------------------------- */

export interface AccordionItemProps {
  title: string;
  children: React.ReactNode;
  /** Uncontrolled starting state. */
  defaultOpen?: boolean;
  meta?: React.ReactNode;
  className?: string;
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  meta,
  className,
}: AccordionItemProps) {
  const [open, setOpen] = React.useState(defaultOpen);
  const contentId = React.useId();

  return (
    <div className={cn('border-b border-border last:border-b-0', className)}>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen((value) => !value)}
          className="flex w-full items-center justify-between gap-3 py-3 text-left transition-colors duration-150 hover:text-accent"
        >
          <span className="text-body-sm font-medium text-ink">{title}</span>
          <span className="flex shrink-0 items-center gap-2">
            {meta}
            <ChevronDown
              aria-hidden
              className={cn(
                'size-4 text-ink-muted transition-transform duration-200',
                open && 'rotate-180',
              )}
            />
          </span>
        </button>
      </h3>
      <div id={contentId} hidden={!open} className="pb-3 text-body-sm text-ink-muted">
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Step indicator                                                             */
/* -------------------------------------------------------------------------- */

export interface Step {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

export interface StepIndicatorProps {
  steps: readonly Step[];
  /** Zero-based index of the current step. */
  currentIndex: number;
  label: string;
  className?: string;
}

/** Progress is conveyed as an ordered list, so it reads correctly unstyled. */
export function StepIndicator({
  steps,
  currentIndex,
  label,
  className,
}: StepIndicatorProps) {
  return (
    <nav aria-label={label} className={className}>
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0">
        {steps.map((step, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;

          return (
            <li
              key={step.key}
              aria-current={current ? 'step' : undefined}
              className="flex flex-1 items-center gap-3"
            >
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-caption font-semibold',
                  complete && 'border-complete bg-complete text-ink-on-accent',
                  current && 'border-accent bg-accent-subtle text-accent',
                  !complete && !current && 'border-border-strong bg-surface text-ink-subtle',
                )}
              >
                {complete ? <Check aria-hidden className="size-4" /> : index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-body-sm font-medium',
                    current ? 'text-ink' : 'text-ink-muted',
                  )}
                >
                  {step.label}
                </span>
                {step.description && (
                  <span className="block text-caption text-ink-subtle">
                    {step.description}
                  </span>
                )}
                <span className="sr-only">
                  {complete ? 'Completed' : current ? 'Current step' : 'Not started'}
                </span>
              </span>
              {index < steps.length - 1 && (
                <span aria-hidden className="hidden h-px flex-1 bg-border sm:block" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
