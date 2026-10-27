import type { OrganizationBrandingView } from '@/contracts/admin';
import { isBrandLogoAsset } from '@/lib/branding';

const STORAGE_KEY = 'oms.organization-branding';

export const DEFAULT_BRANDING: OrganizationBrandingView = Object.freeze({
  productName: 'Timesheet',
  logo: null,
});

function read(): OrganizationBrandingView {
  if (typeof window === 'undefined') return DEFAULT_BRANDING;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BRANDING;
    const parsed = JSON.parse(raw) as Partial<OrganizationBrandingView>;
    return Object.freeze({
      productName: 'Timesheet',
      logo: parsed.logo === null || isBrandLogoAsset(parsed.logo) ? parsed.logo : null,
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
