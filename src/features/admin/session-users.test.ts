import { describe, expect, it } from 'vitest';
import type { AdminSessionView } from '@/contracts/admin';
import { groupSessionsByUser } from './session-users';

const employee = {
  id: 'emp-1', employeeCode: 'EMP-0001', fullName: 'Nadia Rahman',
  designation: 'Engineer', avatarUrl: null,
};

function session(
  sessionId: string,
  status: AdminSessionView['status'],
  deviceLabel: string,
  browserLabel: string,
): AdminSessionView {
  return {
    sessionId, userId: 'usr-1', employee, roleLabel: 'Employee',
    deviceLabel, browserLabel, status,
    statusLabel: status === 'online' ? 'Online' : status === 'idle' ? 'Idle' : 'Expired',
    lastActivityLabel: '19 Nov 2026, 12:00', expiresAtLabel: '20 Nov 2026, 12:00',
    isCurrentSession: false, canForceLogout: status !== 'expired',
  };
}

describe('admin user presence', () => {
  it('shows one user once and uses their strongest current status', () => {
    const rows = groupSessionsByUser([
      session('ses-1', 'idle', 'Windows computer', 'Google Chrome'),
      session('ses-2', 'online', 'iPhone', 'Safari'),
      session('ses-3', 'expired', 'Windows computer', 'Google Chrome'),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      userId: 'usr-1', status: 'online', statusLabel: 'Online',
      deviceLabel: 'iPhone, Windows computer', browserLabel: 'Safari, Google Chrome',
      canForceLogout: true,
    });
    expect(rows[0].sessions).toHaveLength(3);
  });

  it('reports expired only when every known session is expired', () => {
    const rows = groupSessionsByUser([
      session('ses-1', 'expired', 'Windows computer', 'Google Chrome'),
      session('ses-2', 'expired', 'iPhone', 'Safari'),
    ]);
    expect(rows[0]).toMatchObject({ status: 'expired', canForceLogout: false });
  });
});
