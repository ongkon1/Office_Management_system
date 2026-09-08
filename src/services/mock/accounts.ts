/**
 * Development-only demo accounts (`FE-0007`, `FE-0207`).
 *
 * These mirror `docs/frontend/phase-0/demo-setup.md`. They exist so every role,
 * permission boundary, and account state is demonstrable without a server.
 *
 * No value here is a real credential. This module must never be imported by a
 * production code path — the mock service layer is the only consumer.
 */

import type { PermissionKey, RoleKey } from '@/contracts/domain';
import { SENSITIVE_PERMISSIONS } from '@/contracts/domain';

/** The one password every demo account accepts. Shown in the demo picker. */
export const DEMO_PASSWORD = 'Demo1234!';

/** The demo "today", pinned so every walkthrough starts identically. */
export const DEMO_DATE = '2026-09-02';

export const DIVISIONS = {
  pia: { id: 'pia', name: 'PowerInAI', code: 'PIA', isRestricted: false },
  pit: { id: 'pit', name: 'PowerInAI Training', code: 'PIT', isRestricted: false },
  gov: { id: 'gov', name: 'Government Projects', code: 'GOV', isRestricted: true },
  cjg: { id: 'cjg', name: 'Computer Jagat', code: 'CJG', isRestricted: false },
  wcf: { id: 'wcf', name: 'WesternCF', code: 'WCF', isRestricted: false },
} as const;

export type AccountStatus = 'active' | 'inactive' | 'locked';

export interface DemoAccount {
  readonly userId: string;
  readonly employeeId: string;
  readonly employeeCode: string;
  readonly fullName: string;
  readonly email: string;
  readonly designation: string;
  readonly roles: readonly RoleKey[];
  readonly primaryRole: RoleKey;
  readonly permissions: readonly PermissionKey[];
  readonly primaryDivisionId: string;
  readonly scopedDivisionIds: readonly string[];
  readonly scopedEmployeeIds: readonly string[];
  readonly status: AccountStatus;
  readonly twoFactorEnabled: boolean;
  readonly lastLoginAt: string | null;
  /** One line explaining what this account demonstrates. */
  readonly demonstrates: string;
}

const TIMEZONE = 'Asia/Dhaka';

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    userId: 'usr-1001',
    employeeId: 'emp-1001',
    employeeCode: 'EMP-1001',
    fullName: 'Nadia Rahman',
    email: 'nadia.rahman@demo.local',
    designation: 'Senior ML Engineer',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'gov', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T09:04:00+06:00',
    demonstrates: 'Multi-division employee — 3 divisions, the cross-division complete day',
  },
  {
    userId: 'usr-1002',
    employeeId: 'emp-1002',
    employeeCode: 'EMP-1002',
    fullName: 'Tanvir Ahmed',
    email: 'tanvir.ahmed@demo.local',
    designation: 'Systems Engineer',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'cjg',
    scopedDivisionIds: ['cjg'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T10:22:00+06:00',
    demonstrates: 'Overtime and critical time scenarios',
  },
  {
    userId: 'usr-1003',
    employeeId: 'emp-1003',
    employeeCode: 'EMP-1003',
    fullName: 'Sadia Karim',
    email: 'sadia.karim@demo.local',
    designation: 'Training Coordinator',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'pit',
    scopedDivisionIds: ['pit', 'pia'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-08-31T09:15:00+06:00',
    demonstrates: 'Under-time, missing days, approved leave, half-day leave, WFH',
  },
  {
    userId: 'usr-1004',
    employeeId: 'emp-1004',
    employeeCode: 'EMP-1004',
    fullName: 'Sumaiya Noor',
    email: 'sumaiya.noor@demo.local',
    designation: 'Client Services Associate',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'wcf',
    scopedDivisionIds: ['wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T11:40:00+06:00',
    demonstrates: 'Expired temporary assignment — time against GOV must be rejected',
  },
  {
    userId: 'usr-2001',
    employeeId: 'emp-2001',
    employeeCode: 'EMP-2001',
    fullName: 'Imran Hossain',
    email: 'imran.hossain@demo.local',
    designation: 'Team Lead, Engineering',
    roles: ['team_lead', 'employee'],
    primaryRole: 'team_lead',
    permissions: [],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'cjg'],
    scopedEmployeeIds: ['emp-1001', 'emp-1002', 'emp-1004'],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T08:47:00+06:00',
    demonstrates: 'Team Lead scope — exception review, remarks, projects, requests',
  },
  {
    userId: 'usr-2002',
    employeeId: 'emp-2002',
    employeeCode: 'EMP-2002',
    fullName: 'Farhana Islam',
    email: 'farhana.islam@demo.local',
    designation: 'Team Lead, Government Projects',
    roles: ['team_lead', 'employee'],
    primaryRole: 'team_lead',
    permissions: [SENSITIVE_PERMISSIONS.governmentProjects],
    primaryDivisionId: 'gov',
    scopedDivisionIds: ['gov', 'wcf'],
    scopedEmployeeIds: ['emp-1001', 'emp-1004'],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T09:33:00+06:00',
    demonstrates: 'Authorized view of government-project data',
  },
  {
    userId: 'usr-3001',
    employeeId: 'emp-3001',
    employeeCode: 'EMP-3001',
    fullName: 'Rezaul Haque',
    email: 'rezaul.haque@demo.local',
    designation: 'HR Manager',
    roles: ['hr_manager'],
    primaryRole: 'hr_manager',
    permissions: [
      SENSITIVE_PERMISSIONS.periodVerification,
      SENSITIVE_PERMISSIONS.periodAmendment,
      SENSITIVE_PERMISSIONS.hrOverride,
      SENSITIVE_PERMISSIONS.breakOverride,
    ],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'gov', 'cjg', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-09-01T08:12:00+06:00',
    demonstrates: 'Period verification, overrides, evaluation publication',
  },
  {
    userId: 'usr-4001',
    employeeId: 'emp-4001',
    employeeCode: 'EMP-4001',
    fullName: 'Mahmuda Akter',
    email: 'mahmuda.akter@demo.local',
    designation: 'HR Manager, Finance',
    roles: ['hr_manager'],
    primaryRole: 'hr_manager',
    permissions: [
      SENSITIVE_PERMISSIONS.financialDetail,
      SENSITIVE_PERMISSIONS.exportProtected,
      SENSITIVE_PERMISSIONS.periodVerification,
      SENSITIVE_PERMISSIONS.periodAmendment,
    ],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'gov', 'cjg', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-08-31T14:05:00+06:00',
    demonstrates: 'HR WITH the financial-detail permission — cost fields visible',
  },
  {
    userId: 'usr-4002',
    employeeId: 'emp-4002',
    employeeCode: 'EMP-4002',
    fullName: 'Shakil Chowdhury',
    email: 'shakil.chowdhury@demo.local',
    designation: 'HR Analyst',
    roles: ['hr_manager'],
    primaryRole: 'hr_manager',
    permissions: [],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'gov', 'cjg', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-08-31T14:31:00+06:00',
    demonstrates: 'HR WITHOUT the permission — hours only, cost fields restricted. Proves the merge granted nothing by itself',
  },
  {
    userId: 'usr-5001',
    employeeId: 'emp-5001',
    employeeCode: 'EMP-5001',
    fullName: 'Ayesha Siddika',
    email: 'ayesha.siddika@demo.local',
    designation: 'Director',
    roles: ['management'],
    primaryRole: 'management',
    permissions: [],
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'gov', 'cjg', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    twoFactorEnabled: false,
    lastLoginAt: '2026-08-30T16:20:00+06:00',
    demonstrates: 'View-only — no mutating control anywhere',
  },
  {
    userId: 'usr-9001',
    employeeId: 'emp-9001',
    employeeCode: 'EMP-9001',
    fullName: 'Arif Mahmud',
    email: 'arif.mahmud@demo.local',
    designation: 'Super Administrator',
    roles: ['super_admin'],
    primaryRole: 'super_admin',
    permissions: Object.values(SENSITIVE_PERMISSIONS),
    primaryDivisionId: 'pia',
    scopedDivisionIds: ['pia', 'pit', 'gov', 'cjg', 'wcf'],
    scopedEmployeeIds: [],
    status: 'active',
    // The only account with 2FA, so the verification step is demonstrable.
    twoFactorEnabled: true,
    lastLoginAt: '2026-09-01T07:55:00+06:00',
    demonstrates: 'Full administration — and the only account that requires 2FA',
  },
  {
    userId: 'usr-1090',
    employeeId: 'emp-1090',
    employeeCode: 'EMP-1090',
    fullName: 'Rafiq Chowdhury',
    email: 'rafiq.chowdhury@demo.local',
    designation: 'Field Engineer',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'cjg',
    scopedDivisionIds: ['cjg'],
    scopedEmployeeIds: [],
    status: 'locked',
    twoFactorEnabled: false,
    lastLoginAt: '2026-08-14T09:02:00+06:00',
    demonstrates: 'Locked account state on sign-in',
  },
  {
    userId: 'usr-1091',
    employeeId: 'emp-1091',
    employeeCode: 'EMP-1091',
    fullName: 'Nusrat Jahan',
    email: 'nusrat.jahan@demo.local',
    designation: 'Content Writer (former)',
    roles: ['employee'],
    primaryRole: 'employee',
    permissions: [],
    primaryDivisionId: 'cjg',
    scopedDivisionIds: ['cjg'],
    scopedEmployeeIds: [],
    status: 'inactive',
    twoFactorEnabled: false,
    lastLoginAt: '2026-06-28T17:41:00+06:00',
    demonstrates: 'Deactivated account state on sign-in',
  },
];

export const DEMO_TIMEZONE = TIMEZONE;
export const DEMO_LOCALE = 'en-GB';

/** Matches an identifier against email or employee code, case-insensitively. */
export function findAccountByIdentifier(identifier: string): DemoAccount | undefined {
  const needle = identifier.trim().toLowerCase();
  if (!needle) return undefined;
  return DEMO_ACCOUNTS.find(
    (account) =>
      account.email.toLowerCase() === needle ||
      account.employeeCode.toLowerCase() === needle,
  );
}

export function findAccountByUserId(userId: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.userId === userId);
}
