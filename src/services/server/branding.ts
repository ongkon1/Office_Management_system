import type { OrganizationBrandingView } from '@/contracts/admin';
import { serverGet } from './http';

export const serverBrandingService = {
  getBranding: () => serverGet<OrganizationBrandingView>('/api/branding'),
};
