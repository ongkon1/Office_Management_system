'use client';
import { SettingsScreens } from '@/features/admin/settings';

/**
 * Work policies live inside Settings. This route exists because the
 * administration navigation names them separately, and a nav entry must reach
 * an intentional page rather than a placeholder.
 */
export default function AdminPoliciesPage() { return <SettingsScreens />; }
