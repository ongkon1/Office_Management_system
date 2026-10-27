import type { BrandLogoAsset } from '@/contracts/admin';

const ALLOWED_TYPES = new Set<BrandLogoAsset['mediaType']>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export function isBrandLogoAsset(value: unknown): value is BrandLogoAsset {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BrandLogoAsset>;
  return (
    typeof candidate.dataUrl === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.mediaType === 'string' &&
    ALLOWED_TYPES.has(candidate.mediaType as BrandLogoAsset['mediaType']) &&
    candidate.dataUrl.startsWith(`data:${candidate.mediaType};base64,`) &&
    Number.isSafeInteger(candidate.sizeBytes) &&
    Number(candidate.sizeBytes) > 0 &&
    Number(candidate.sizeBytes) <= 1_048_576
  );
}

export function parseStoredBrandLogo(value: unknown): BrandLogoAsset | null {
  if (value === null || value === undefined || value === '') return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return isBrandLogoAsset(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
