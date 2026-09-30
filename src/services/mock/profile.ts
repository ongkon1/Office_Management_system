import type {
  OwnProfileView,
  ProfileDensity,
  ProfileService,
} from '@/contracts/services';
import type { WorkMode } from '@/contracts/domain';
import { success } from '@/contracts/results';
import {
  findAccountByUserId,
  listDemoAccounts,
  updateDemoAccount,
} from './accounts';
import { getEmployeeSelfProfile, updateEmployeeSelfProfile } from './hr';

interface ProfilePreferences {
  readonly density: ProfileDensity;
}

const DEFAULT_PREFERENCES: ProfilePreferences = {
  density: 'comfortable',
};

let preferenceOverrides = new Map<string, ProfilePreferences>();

function notFound() {
  return {
    status: 'not_found' as const,
    code: 'NOT_FOUND' as const,
    message: 'Profile not found.',
    resource: 'profile',
  };
}

function invalid(field: string, message: string, guidance: string) {
  return {
    status: 'validation_failure' as const,
    code: 'VALIDATION_FAILED' as const,
    message: 'Review your profile details.',
    focusField: field,
    fieldErrors: [{ field, code: 'INVALID_PROFILE_FIELD', message, guidance }],
  };
}

function view(userId: string): OwnProfileView | null {
  const account = findAccountByUserId(userId);
  if (!account) return null;
  const preferences = preferenceOverrides.get(userId) ?? DEFAULT_PREFERENCES;
  const employee = getEmployeeSelfProfile(account.employeeId);
  return {
    userId: account.userId,
    employeeCode: account.employeeCode,
    fullName: account.fullName,
    email: account.email,
    phone: employee?.phone ?? '',
    designation: account.designation,
    primaryDivisionId: account.primaryDivisionId,
    divisionCount: account.scopedDivisionIds.length,
    normalWorkMode: employee?.normalWorkMode ?? 'office',
    density: preferences.density,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WORK_MODES = new Set<WorkMode>([
  'office',
  'wfh',
  'hybrid',
  'field_work',
  'official_travel',
  'training',
  'client_location',
]);

export const mockProfileService: ProfileService = {
  async getOwnProfile(userId) {
    const profile = view(userId);
    return profile ? success(profile) : notFound();
  },

  async updateOwnProfile(userId, input) {
    const account = findAccountByUserId(userId);
    if (!account || account.status !== 'active') return notFound();

    const fullName = input.fullName.trim().replace(/\s+/g, ' ');
    const email = input.email.trim().toLowerCase();
    const phone = input.phone.trim();

    if (fullName.length < 2 || fullName.length > 100) {
      return invalid('fullName', 'Enter a valid full name.', 'Use between 2 and 100 characters.');
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return invalid('email', 'Enter a valid email address.', 'Use an address such as name@company.com.');
    }
    if (listDemoAccounts().some((item) => item.userId !== userId && item.email.toLowerCase() === email)) {
      return invalid('email', 'That email address is already in use.', 'Use a different email address.');
    }
    if (phone.length > 30) {
      return invalid('phone', 'The phone number is too long.', 'Use no more than 30 characters.');
    }
    if (!WORK_MODES.has(input.normalWorkMode)) {
      return invalid('normalWorkMode', 'Choose a valid work mode.', 'Select one of the available work modes.');
    }
    if (input.density !== 'comfortable' && input.density !== 'dense') {
      return invalid('density', 'Choose a valid table density.', 'Select Comfortable or Compact.');
    }

    updateDemoAccount(userId, (current) => ({ ...current, fullName, email }));
    updateEmployeeSelfProfile(account.employeeId, {
      fullName,
      email,
      phone: phone || null,
      normalWorkMode: input.normalWorkMode,
    });
    preferenceOverrides.set(userId, {
      density: input.density,
    });
    return success(view(userId)!);
  },
};

export function resetProfileState(): void {
  preferenceOverrides = new Map<string, ProfilePreferences>();
}
