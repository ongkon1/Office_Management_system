import * as React from 'react';
import NextLink from 'next/link';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'accent'
  | 'danger'
  | 'link';

export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-ink-inverse border border-primary shadow-xs hover:bg-primary-hover hover:shadow-sm active:bg-primary-active active:shadow-xs',
  secondary:
    'bg-surface text-primary border border-primary shadow-xs hover:border-highlight-hover hover:bg-accent-subtle hover:shadow-sm active:bg-brand-light active:shadow-xs',
  ghost: 'bg-transparent text-ink border border-transparent hover:border-border hover:bg-surface-sunken active:bg-brand-light',
  accent:
    'bg-accent text-ink-on-accent border border-accent shadow-xs hover:bg-accent-hover hover:shadow-sm active:bg-primary-active active:shadow-xs',
  danger:
    'bg-danger text-ink-on-accent border border-danger hover:brightness-110 active:brightness-95',
  link: 'bg-transparent text-accent border border-transparent underline underline-offset-2 hover:text-accent-hover',
};

/** Shared by `Button` and `LinkButton` so a link never drifts from a button. */
const BASE_CLASSES =
  'relative inline-flex shrink-0 items-center justify-center rounded-md font-medium ' +
  'transition-[color,background-color,border-color,box-shadow] duration-150 ease-[cubic-bezier(0.2,0,0.15,1)] ' +
  'disabled:cursor-not-allowed disabled:opacity-55 ' +
  // A 44px hit area without a 44px visual box.
  'after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[""]';

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-caption gap-1.5',
  md: 'h-10 px-3.5 text-body-sm gap-2',
  lg: 'h-11 px-5 text-body gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Replaces the leading icon with a spinner and blocks interaction. */
  loading?: boolean;
  iconLeading?: React.ReactNode;
  iconTrailing?: React.ReactNode;
  /** Stretches to the container width — used by mobile sticky action bars. */
  fullWidth?: boolean;
}

/**
 * The one button.
 *
 * A loading button keeps its width so the layout does not shift, stays
 * focusable so screen-reader users are not stranded, and announces its busy
 * state through `aria-busy`.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = 'secondary',
      size = 'md',
      loading = false,
      iconLeading,
      iconTrailing,
      fullWidth = false,
      disabled,
      className,
      children,
      type = 'button',
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          BASE_CLASSES,
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 aria-hidden className="size-4 animate-[spin_1s_linear_infinite]" />
        ) : (
          iconLeading
        )}
        {children}
        {!loading && iconTrailing}
      </button>
    );
  },
);

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'fullWidth'> {
  /** Required: an icon-only control must still have an accessible name. */
  label: string;
  icon: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, icon, size = 'md', className, ...props }, ref) {
    return (
      <Button
        ref={ref}
        size={size}
        aria-label={label}
        title={label}
        className={cn(
          'aspect-square p-0',
          size === 'sm' && 'w-8',
          size === 'md' && 'w-10',
          size === 'lg' && 'w-11',
          className,
        )}
        {...props}
      >
        {icon}
      </Button>
    );
  },
);

export interface LinkButtonProps
  extends Omit<React.ComponentProps<typeof NextLink>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeading?: React.ReactNode;
  iconTrailing?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

/**
 * A navigation control that looks like a button.
 *
 * It is an anchor, not a button with an `onClick` that routes: a destination
 * must be openable in a new tab, reachable by the browser's own link handling,
 * and announced as a link. Sharing `BASE_CLASSES` with `Button` keeps the two
 * visually identical without duplicating the hit-area rule that carries them
 * past the 24 px minimum target size.
 */
export function LinkButton({
  variant = 'secondary',
  size = 'md',
  iconLeading,
  iconTrailing,
  fullWidth = false,
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <NextLink
      className={cn(
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {iconLeading}
      {children}
      {iconTrailing}
    </NextLink>
  );
}
