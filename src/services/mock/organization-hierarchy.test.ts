import { beforeEach, describe, expect, it } from 'vitest';
import { findAccountByUserId } from './accounts';
import { toSessionUser } from './auth';
import {
  departmentRecords,
  effectiveLeadAssignment,
  resetDepartmentState,
} from './department-store';
import {
  departmentLeadEmployeeIds,
  departmentLeadScopes,
  validateAssignmentDepartment,
  validateLeadCandidate,
} from './organization-hierarchy';
import { mockStore } from './store';

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
});

describe('organization hierarchy mock model', () => {
  it('seeds all five divisions and permits duplicate names across divisions', () => {
    expect(new Set(departmentRecords().map((department) => department.divisionId))).toEqual(
      new Set(['pia', 'pit', 'gov', 'cjg', 'wcf']),
    );
    expect(departmentRecords().filter((department) => department.name === 'Sales')).toHaveLength(2);
  });

  it('rejects a department that does not belong to the assignment division', () => {
    expect(validateAssignmentDepartment('pia', 'dept-wcf-client-services')).toMatchObject({
      field: 'departmentId',
    });
    expect(validateAssignmentDepartment('wcf', 'dept-wcf-client-services')).toBeNull();
  });

  it('requires a lead candidate to have an effective assignment in the same division', () => {
    expect(validateLeadCandidate('dept-gov-delivery', 'emp-2001', '2026-09-02')).toMatchObject({
      field: 'leadEmployeeId',
    });
    expect(validateLeadCandidate('dept-gov-delivery', 'emp-2002', '2026-09-02')).toBeNull();
  });

  it('supports one employee leading multiple departments at the same time', () => {
    const scopes = departmentLeadScopes('emp-2001', '2026-09-02');
    expect(scopes.length).toBeGreaterThan(1);
    expect(new Set(scopes.map((scope) => scope.divisionId))).toEqual(
      new Set(['pia', 'pit', 'cjg']),
    );
    expect(departmentLeadEmployeeIds('emp-2001', '2026-09-02')).toContain('emp-1002');
  });

  it('resolves lead history on inclusive effective-date boundaries', () => {
    expect(effectiveLeadAssignment('dept-pia-technical', '2024-12-31')?.leadEmployeeId)
      .toBe('emp-1001');
    expect(effectiveLeadAssignment('dept-pia-technical', '2025-01-01')?.leadEmployeeId)
      .toBe('emp-2001');
  });

  it('adds department scope to a session without fabricating a Team Lead role', () => {
    const account = findAccountByUserId('usr-1001');
    expect(account).toBeDefined();
    const session = toSessionUser(account!);
    expect(session.roles).toEqual(['employee']);
    expect(session.departmentLeadScopes).toContainEqual(
      expect.objectContaining({ departmentId: 'dept-pia-sales', divisionId: 'pia' }),
    );
  });
});
