import * as React from 'react';
import { cn } from '@/lib/cn';
import { initialsOf } from '@/lib/format';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-caption',
  md: 'size-10 text-body-sm',
  lg: 'size-14 text-h3',
};

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

/**
 * The initials fallback is decorative when the name is already rendered beside
 * it, so the image carries an empty alt and the name is exposed via the title.
 */
export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  return (
    <span
      title={name}
      className={cn(
        'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full',
        'border border-border bg-surface-sunken font-semibold text-ink-muted select-none',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- fixture avatars are remote/data URLs during the frontend milestone
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        <span aria-hidden>{initialsOf(name)}</span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export interface AvatarGroupProps {
  people: readonly { readonly name: string; readonly src?: string | null }[];
  max?: number;
  size?: AvatarSize;
  className?: string;
}

export function AvatarGroup({
  people,
  max = 4,
  size = 'sm',
  className,
}: AvatarGroupProps) {
  const shown = people.slice(0, max);
  const overflow = people.length - shown.length;

  return (
    <span className={cn('inline-flex items-center', className)}>
      {shown.map((person, index) => (
        <Avatar
          key={`${person.name}-${index}`}
          name={person.name}
          src={person.src}
          size={size}
          className="-ml-1.5 ring-2 ring-surface first:ml-0"
        />
      ))}
      {overflow > 0 && (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full border border-border',
            '-ml-1.5 bg-surface-sunken font-semibold text-ink-muted ring-2 ring-surface',
            SIZE_CLASSES[size],
          )}
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}
