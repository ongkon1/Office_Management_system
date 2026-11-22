import { describe, expect, it } from 'vitest';
import { authorize, hasPermission, type ActorPolicyContext } from './policy';

const hr = (permissions: readonly string[] = []): ActorPolicyContext => ({
  userId: 'usr-hr', employeeId: 'emp-hr', roles: ['hr_manager'],
  permissions: new Set(permissions), divisionIds: new Set(), employeeIds: new Set(['emp-hr']),
  projectIds: new Set(), teamIds: new Set(),
});

describe('BE-1203/BE-1206 Finance consolidation permission boundary', () => {
  it('gives HR Finance workflow capability without implicitly exposing cost data', () => {
    expect(hasPermission(hr(), 'report.finance.read')).toBe(true);
    expect(hasPermission(hr(), 'finance.cost.view')).toBe(false);
    expect(authorize(hr(), 'report.finance.read', { sensitivity: 'labour_cost' }, 'report')).toBe(false);
  });

  it('admits protected cost only through the explicit permission', () => {
    const permitted = hr(['finance.cost.view']);
    expect(hasPermission(permitted, 'finance.cost.view')).toBe(true);
    expect(authorize(permitted, 'report.finance.read', { sensitivity: 'labour_cost' }, 'report')).toBe(true);
  });

  it('keeps salary and protected exports independently denied', () => {
    const costOnly = hr(['finance.cost.view']);
    expect(authorize(costOnly, 'report.finance.read', { sensitivity: 'salary' }, 'report')).toBe(false);
    expect(authorize(costOnly, 'report.export', { sensitivity: 'export' }, 'export')).toBe(false);
  });
});

