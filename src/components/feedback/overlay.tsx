'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { IconButton } from '@/components/ui/button';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/*
 * Scroll lock.
 *
 * `document.body.style.overflow = 'hidden'` alone does not hold: in this app
 * the scrolling element is `<html>`, so the page kept scrolling behind an open
 * dialog — the backdrop stayed put while the content slid under it, which is
 * what made a confirmation look like it had come loose from the page. Both
 * elements are locked, and the scrollbar's width is handed back as padding so
 * the layout underneath does not jump sideways when it disappears.
 *
 * The count exists because overlays nest: a drawer that opens a dialog must
 * not unlock the page when the inner one closes.
 */
let scrollLockCount = 0;
let restoreScroll: (() => void) | null = null;

function lockPageScroll(): () => void {
  scrollLockCount += 1;

  if (scrollLockCount === 1) {
    const html = document.documentElement;
    const { body } = document;
    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPaddingRight: body.style.paddingRight,
    };
    const scrollbarWidth = window.innerWidth - html.clientWidth;

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    restoreScroll = () => {
      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.paddingRight = previous.bodyPaddingRight;
    };
  }

  return () => {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
      restoreScroll?.();
      restoreScroll = null;
    }
  };
}

/**
 * Renders overlay markup into `document.body`.
 *
 * An overlay is `fixed`, and a `fixed` element is positioned against the
 * nearest ancestor carrying a transform, filter or containment — not the
 * viewport. Feature screens use all three, so an overlay opened from inside
 * one would be clipped or offset. Portalling removes the possibility.
 */
const subscribeToNothing = () => () => {};

function useOverlayPortal(): HTMLElement | null {
  /*
   * `useSyncExternalStore` rather than a mount flag in an effect: it answers
   * "is this the client?" without a render-phase state write, which the React
   * Compiler rules correctly reject.
   */
  const isClient = React.useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  return isClient ? document.body : null;
}

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

  /*
   * `onClose` is held in a ref so the effect below can depend on `open` alone.
   *
   * Callers write it inline — `onClose={() => setOpen(false)}` — so it is a new
   * function on every render of the component that owns the dialog. With it in
   * the dependency array, every keystroke in a dialog form re-ran this effect:
   * the cleanup returned focus to whatever opened the dialog and the setup
   * moved it to the dialog's first control, so the second character onward went
   * to a button instead of the field. The form looked frozen and the trap
   * flickered. Depending on `open` means the trap is armed once per opening.
   */
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const unlockScroll = lockPageScroll();

    /*
     * `preventScroll` and this ordering are both load-bearing. Focusing the
     * first control makes the browser scroll its nearest scrollable ancestor
     * to reveal it — and for a bottom sheet sitting low in the viewport that
     * ancestor is the document, which jumped ~135px the moment the dialog
     * opened. The panel is fixed, so the scroll revealed nothing and only
     * dragged the page out from under the backdrop.
     */
    const container = ref.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? container)?.focus({ preventScroll: true });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
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
      unlockScroll();
      previouslyFocused.current?.focus({ preventScroll: true });
    };
  }, [open]);

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

/* Width applies from `sm` up only: below it the panel is a full-width sheet,
   and a capped one leaves a few pixels of page showing down each side. */
const DIALOG_SIZES = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
} as const;

/**
 * A centred dialog on a pointer-sized screen; a bottom sheet below `sm`.
 *
 * Two sizing details are load-bearing on a phone. The panel is capped in
 * `dvh`, not `vh` — `vh` ignores the retracting browser chrome, so the footer
 * (which is where the confirm button lives) could sit under the address bar
 * and be untappable. And the footer stacks its actions full width instead of
 * wrapping them, because two wrapped buttons in a narrow sheet end up as one
 * per line anyway, at half width and hard against the edge.
 */
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
  const portal = useOverlayPortal();
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open || !portal) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[50] flex items-end justify-center sm:items-center sm:p-4 md:p-6"
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
          'relative flex w-full min-w-0 flex-col overflow-hidden bg-surface shadow-lg',
          'max-h-[92dvh] rounded-t-2xl sm:max-h-[min(90dvh,44rem)] sm:rounded-xl',
          'animate-[slide-up_200ms_cubic-bezier(0,0,0.15,1)]',
          DIALOG_SIZES[size],
        )}
      >
        {/* Sheet affordance: the panel meets the bottom edge below `sm`. */}
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 rounded-full bg-border sm:hidden" />

        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
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

        {children && (
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 break-words sm:px-5">
            {children}
          </div>
        )}

        {footer && (
          <div
            className={cn(
              'flex flex-col-reverse gap-2 border-t border-border px-4 py-3.5 safe-bottom',
              'sm:flex-row sm:flex-wrap sm:justify-end sm:px-5',
              '[&>*]:w-full sm:[&>*]:w-auto',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    portal,
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
  const portal = useOverlayPortal();
  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open || !portal) return null;

  return createPortal(
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

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 break-words">
          {children}
        </div>

        {footer && (
          <div
            className={cn(
              'sticky bottom-0 flex flex-col-reverse gap-2 border-t border-border bg-surface p-4 safe-bottom',
              'sm:flex-row sm:flex-wrap sm:justify-end',
              '[&>*]:w-full sm:[&>*]:w-auto',
            )}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    portal,
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
