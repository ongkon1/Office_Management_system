import type { RoleKey } from '@/contracts/domain';

/**
 * Accounts created by `npm run db:seed`.
 *
 * Keep this list aligned with `scripts/seed-development.sql`. The login picker
 * uses the real credential flow, so displaying the older frontend-only fixture
 * identities here makes every click fail even though authentication is healthy.
 */
export interface RuntimeDemoAccount {
  readonly userId: string;
  readonly fullName: string;
  readonly email: string;
  readonly primaryRole: RoleKey;
  readonly status: 'active' | 'inactive' | 'locked';
  readonly twoFactorEnabled: boolean;
  readonly lastLoginAt: string | null;
  readonly demonstrates: string;
}

export const DEMO_PASSWORD = 'Demo1234!';
export const DEMO_DATE = '2026-09-02';

export const DEMO_ACCOUNTS: readonly RuntimeDemoAccount[] = [
  {
    userId: '30000000-0000-4000-8000-000000000001',
    fullName: 'Amina Rahman',
    email: 'admin@powerin.ai',
    primaryRole: 'super_admin',
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: null,
    demonstrates: 'Full administration, users, roles, divisions and settings',
  },
  {
    userId: '30000000-0000-4000-8000-000000000002',
    fullName: 'Tanvir Hasan',
    email: 'lead@powerin.ai',
    primaryRole: 'team_lead',
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: null,
    demonstrates: 'Team dashboard, projects, tasks and employee review',
  },
  {
    userId: '30000000-0000-4000-8000-000000000003',
    fullName: 'Nadia Islam',
    email: 'employee@powerin.ai',
    primaryRole: 'employee',
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: null,
    demonstrates: 'Employee dashboard, tasks and multi-division timesheet',
  },
  {
    userId: '30000000-0000-4000-8000-000000000004',
    fullName: 'Farhana Akter',
    email: 'hr@powerin.ai',
    primaryRole: 'hr_manager',
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: null,
    demonstrates: 'Employees, attendance, requests and period verification',
  },
  {
    userId: '30000000-0000-4000-8000-000000000006',
    fullName: 'Rafiq Ahmed',
    email: 'management@powerin.ai',
    primaryRole: 'management',
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: null,
    demonstrates: 'Read-only management dashboard and reports',
  },
];

export function findAccountByUserId(userId: string) {
  return DEMO_ACCOUNTS.find((account) => account.userId === userId);
}

export function listDemoAccounts() {
  return DEMO_ACCOUNTS;
}

export { resetDemoData } from '@/services/mock/reset';
