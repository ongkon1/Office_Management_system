import * as React from 'react';
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
    'bg-primary text-ink-inverse border border-primary hover:bg-primary-hover active:bg-primary-active',
  secondary:
    'bg-surface text-ink border border-border-strong hover:bg-surface-sunken active:bg-surface-sunken',
  ghost: 'bg-transparent text-ink border border-transparent hover:bg-surface-sunken',
  accent:
    'bg-accent text-white border border-accent hover:bg-accent-hover active:bg-accent-hover',
  danger:
    'bg-danger text-white border border-danger hover:brightness-110 active:brightness-95',
  link: 'bg-transparent text-accent border border-transparent underline underline-offset-2 hover:text-accent-hover',
};

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
          'relative inline-flex shrink-0 items-center justify-center rounded-md font-medium',
          'transition-colors duration-150 ease-[cubic-bezier(0.2,0,0.15,1)]',
          'disabled:cursor-not-allowed disabled:opacity-55',
          // A 44px hit area without a 44px visual box.
          'after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[""]',
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
