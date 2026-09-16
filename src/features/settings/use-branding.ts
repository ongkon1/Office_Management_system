'use client';

import * as React from 'react';
import {
  getBrandingServerSnapshot,
  getBrandingSnapshot,
  subscribeBranding,
} from '@/lib/branding-store';

export function useBranding() {
  return React.useSyncExternalStore(
    subscribeBranding,
    getBrandingSnapshot,
    getBrandingServerSnapshot,
  );
}
