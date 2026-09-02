'use client';

import * as React from 'react';
import { cn } from '@/lib/cn';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<{ 'aria-describedby'?: string }>;
  side?: 'top' | 'bottom';
  className?: string;
}

/**
 * A supplementary-text tooltip.
 *
 * It opens on hover *and* on focus, closes on Escape, and is wired with
 * `aria-describedby` — so it supplements an accessible name rather than
 * replacing one. Never put essential information here alone.
 */
export function Tooltip({ content, children, side = 'top', className }: TooltipProps) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();

  const handleKeyDown = React.useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') setOpen(false);
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocusCapture={() => setOpen(true)}
      onBlurCapture={() => setOpen(false)}
      onKeyDown={handleKeyDown}
    >
      {React.cloneElement(children, { 'aria-describedby': open ? id : undefined })}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            'pointer-events-none absolute left-1/2 z-[70] -translate-x-1/2',
            'animate-[fade-in_150ms_ease-out] whitespace-nowrap rounded-md px-2 py-1',
            'bg-surface-inverse text-caption text-ink-inverse shadow-md',
            side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}
