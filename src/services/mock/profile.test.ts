import { beforeEach, describe, expect, it } from 'vitest';
import { listDemoAccounts, resetDemoAccountState } from './accounts';
import { mockProfileService, resetProfileState } from './profile';

const validUpdate = {
  fullName: 'Updated Person',
  email: 'updated.person@example.com',
  phone: '+880 1700 123456',
  normalWorkMode: 'hybrid' as const,
  density: 'dense' as const,
};

describe('self-service profiles', () => {
  beforeEach(() => {
    resetDemoAccountState();
    resetProfileState();
  });

  it('lets every active role update its own permitted profile fields', async () => {
    const representatives = ['usr-1001', 'usr-2001', 'usr-3001', 'usr-5001', 'usr-9001'];

    for (const [index, userId] of representatives.entries()) {
      const result = await mockProfileService.updateOwnProfile(userId, {
        ...validUpdate,
        fullName: `Updated Person ${index}`,
        email: `updated.person.${index}@example.com`,
      });
      expect(result.status).toBe('success');
      if (result.status === 'success') {
        expect(result.data.phone).toBe(validUpdate.phone);
        expect(result.data.normalWorkMode).toBe('hybrid');
        expect(result.data.density).toBe('dense');
      }
    }
  });

  it('updates identity fields without changing employment or access fields', async () => {
    const before = listDemoAccounts().find((account) => account.userId === 'usr-2001')!;
    const result = await mockProfileService.updateOwnProfile('usr-2001', validUpdate);
    const after = listDemoAccounts().find((account) => account.userId === 'usr-2001')!;

    expect(result.status).toBe('success');
    expect(after.fullName).toBe(validUpdate.fullName);
    expect(after.email).toBe(validUpdate.email);
    expect(after.roles).toEqual(before.roles);
    expect(after.designation).toBe(before.designation);
    expect(after.primaryDivisionId).toBe(before.primaryDivisionId);
    expect(after.status).toBe(before.status);
  });

  it('rejects an email already used by another account', async () => {
    const result = await mockProfileService.updateOwnProfile('usr-1001', {
      ...validUpdate,
      email: 'imran.hossain@demo.local',
    });

    expect(result.status).toBe('validation_failure');
    if (result.status === 'validation_failure') {
      expect(result.focusField).toBe('email');
    }
  });

  it('does not expose an inactive account as an editable profile', async () => {
    const result = await mockProfileService.updateOwnProfile('usr-1091', validUpdate);
    expect(result.status).toBe('not_found');
  });
});
