import type { BrandLogoAsset, OrganizationBrandingView } from '@/contracts/admin';

const STORAGE_KEY = 'oms.organization-branding';
const ALLOWED_TYPES = new Set<BrandLogoAsset['mediaType']>([
  'image/png',
  'image/jpeg',
  'image/webp',
]);

export const DEFAULT_BRANDING: OrganizationBrandingView = Object.freeze({
  productName: 'Timesheet',
  logo: null,
});

function isLogo(value: unknown): value is BrandLogoAsset {
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

function read(): OrganizationBrandingView {
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<OrganizationBrandingView>;
    return Object.freeze({
      productName: 'Timesheet',
      logo: parsed.logo === null || isLogo(parsed.logo) ? parsed.logo : null,
    });
  } catch {
    return DEFAULT_BRANDING;
  }
}

let snapshot = typeof window === 'undefined' ? DEFAULT_BRANDING : read();
const listeners = new Set<() => void>();

export function subscribeBranding(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBrandingSnapshot(): OrganizationBrandingView {
  return snapshot;
}

export function getBrandingServerSnapshot(): OrganizationBrandingView {
  return DEFAULT_BRANDING;
}

export function commitBranding(next: OrganizationBrandingView): void {
  snapshot = Object.freeze(next);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // The visible change remains active for this browser session.
    }
  }
  for (const listener of listeners) listener();
}

export function resetBranding(): void {
  snapshot = DEFAULT_BRANDING;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage may be unavailable; the in-memory reset still succeeds.
    }
  }
  for (const listener of listeners) listener();
}
