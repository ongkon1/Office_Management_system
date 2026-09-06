'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Traps focus inside a container, restores it on close, and closes on Escape.
 *
 * Focus restoration matters as much as trapping: a keyboard user who closes a
 * dialog must land back on the control that opened it, not at the top of the
 * document.
 */
function useOverlayBehavior(open: boolean, onClose: () => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const container = ref.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container)?.focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !ref.current) return;

      /*
       * Visibility, not layout position. `offsetParent` was the obvious test
       * and the wrong one: it is `null` for descendants of a fixed-position
       * container in some engines, which silently empties this list and
       * disables the trap altogether. Checking the computed style asks the
       * question actually being asked — can this be focused and seen.
       */
      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((element) => {
        if (element.hasAttribute('hidden')) return false;
        if (element.getAttribute('aria-hidden') === 'true') return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = originalOverflow;
      previouslyFocused.current?.focus();
    };
  }, [open, onClose]);

  return ref;
}

/* -------------------------------------------------------------------------- */
/* Dialog                                                                     */
/* -------------------------------------------------------------------------- */

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Set for confirmations so the backdrop cannot dismiss unsaved intent. */
  dismissOnBackdrop?: boolean;
}

const DIALOG_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
} as const;

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissOnBackdrop = true,
}: DialogProps) {
  const ref = useOverlayBehavior(open, onClose);
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[50] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-surface-inverse/40 animate-[fade-in_150ms_ease-out]"
        onClick={dismissOnBackdrop ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col rounded-t-xl bg-surface shadow-lg',
          'animate-[slide-up_200ms_cubic-bezier(0,0,0.15,1)] sm:rounded-xl',
          DIALOG_SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h3 text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-body-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="Close dialog"
            variant="ghost"
            size="sm"
            icon={<X aria-hidden className="size-4" />}
            onClick={onClose}
          />
        </div>

        {children && <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>}

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border p-4 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Drawer                                                                     */
/* -------------------------------------------------------------------------- */

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg';
}

const DRAWER_SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-xl',
  lg: 'sm:max-w-3xl',
} as const;

/**
 * A side panel that becomes a full-screen sheet below the `sm` breakpoint.
 *
 * The footer is sticky and respects the safe area so a mobile action bar stays
 * reachable above the on-screen keyboard.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = 'right',
  size = 'md',
}: DrawerProps) {
  const ref = useOverlayBehavior(open, onClose);
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[40]" role="presentation">
      <div
        className="absolute inset-0 bg-surface-inverse/40 animate-[fade-in_150ms_ease-out]"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col bg-surface shadow-lg',
          side === 'right'
            ? 'right-0 animate-[slide-in-right_200ms_cubic-bezier(0,0,0.15,1)]'
            : 'left-0 animate-[slide-in-left_200ms_cubic-bezier(0,0,0.15,1)]',
          DRAWER_SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-h3 text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-body-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <IconButton
            label="Close panel"
            variant="ghost"
            size="sm"
            icon={<X aria-hidden className="size-4" />}
            onClick={onClose}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>

        {footer && (
          <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-surface p-4 safe-bottom">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Popover and dropdown menu                                                  */
/* -------------------------------------------------------------------------- */

export interface PopoverProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  /** Accessible name for the popover surface. */
  label: string;
  align?: 'start' | 'end';
  className?: string;
}

/**
 * A non-modal popover for filters and pickers.
 *
 * Non-modal is intentional: focus is not trapped, so a user can tab out of a
 * filter popover into the table it filters. It still closes on Escape and on
 * an outside click.
 */
export function Popover({
  trigger,
  children,
  label,
  align = 'start',
  className,
}: PopoverProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <span onClick={() => setOpen((value) => !value)} className="contents">
        {React.isValidElement(trigger)
          ? React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
              'aria-expanded': open,
              'aria-haspopup': 'dialog',
            })
          : trigger}
      </span>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className={cn(
            'absolute top-[calc(100%+0.375rem)] z-[30] min-w-56 rounded-lg border border-border',
            'bg-surface p-3 shadow-md animate-[slide-up_150ms_ease-out]',
            align === 'end' ? 'right-0' : 'left-0',
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export interface MenuItem {
  readonly key: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly onSelect: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}

export interface DropdownMenuProps {
  trigger: React.ReactNode;
  items: readonly MenuItem[];
  label: string;
  align?: 'start' | 'end';
}

/** A menu with roving arrow-key navigation, as a menu is expected to have. */
export function DropdownMenu({
  trigger,
  items,
  label,
  align = 'end',
}: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  React.useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open]);

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      itemRefs.current[(index + 1) % items.length]?.focus();
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      itemRefs.current[(index - 1 + items.length) % items.length]?.focus();
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <span onClick={() => setOpen((value) => !value)} className="contents">
        {React.isValidElement(trigger)
          ? React.cloneElement(trigger as React.ReactElement<Record<string, unknown>>, {
              'aria-expanded': open,
              'aria-haspopup': 'menu',
            })
          : trigger}
      </span>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-[calc(100%+0.375rem)] z-[30] min-w-48 rounded-lg border border-border',
            'bg-surface p-1 shadow-md animate-[slide-up_150ms_ease-out]',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onKeyDown={(event) => handleKeyDown(event, index)}
              onClick={() => {
                item.onSelect();
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-body-sm',
                'transition-colors duration-150 hover:bg-surface-sunken',
                'disabled:cursor-not-allowed disabled:opacity-55',
                item.destructive ? 'text-danger' : 'text-ink',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
