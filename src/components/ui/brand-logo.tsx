'use client';

import Image from 'next/image';
import type { BrandLogoAsset } from '@/contracts/admin';
import { cn } from '@/lib/cn';
import { useBranding } from '@/features/settings/use-branding';

const SIZE = {
  sm: 'h-9 w-28',
  md: 'h-12 w-40',
  preview: 'h-20 w-56',
} as const;

const FALLBACK_SIZE = {
  sm: 'size-9 text-body-sm',
  md: 'size-12 text-body',
  preview: 'size-16 text-h3',
} as const;

export function BrandLogo({
  size = 'md',
  asset: assetOverride,
  className,
}: {
  size?: keyof typeof SIZE;
  /** Used by the administrator preview before a selected file is saved. */
  asset?: BrandLogoAsset | null;
  className?: string;
}) {
  const branding = useBranding();
  const asset = assetOverride === undefined ? branding.logo : assetOverride;

  if (!asset) {
    return (
      <span
        role="img"
        aria-label={branding.productName}
        className={cn(
          'brand-mark grid shrink-0 place-items-center rounded-md font-bold',
          FALLBACK_SIZE[size],
          className,
        )}
      >
        T
      </span>
    );
  }

  return (
    <span className={cn('relative block shrink-0', SIZE[size], className)}>
      <Image
        unoptimized
        fill
        sizes={size === 'preview' ? '224px' : size === 'md' ? '160px' : '112px'}
        src={asset.dataUrl}
        alt={branding.productName}
        className="object-contain object-left"
      />
    </span>
  );
}
