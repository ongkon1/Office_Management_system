import { beforeEach, describe, expect, it } from 'vitest';
import type { DepartmentAdminDetailView } from '@/contracts/organization-hierarchy';
import type { Result } from '@/contracts/results';
import { departmentById, resetDepartmentState } from './department-store';
import { mockDepartmentAdminService } from './department-admin';
import { validateAssignmentDepartment } from './organization-hierarchy';
import { mockStore } from './store';

/**
 * `OH-FE-0201`–`OH-FE-0209` — department administration rules.
 *
 * Every case here is a rule from §2 of the organization hierarchy milestone
 * that the screen must not be able to decide for itself: who may administer,
 * what "unique" means, and what happens to history.
 */

const ADMIN = 'usr-9001';
const HR = 'usr-3001';
const EMPLOYEE = 'usr-1001';
const TEAM_LEAD = 'usr-2001';
const MANAGEMENT = 'usr-5001';

const TODAY = '2026-09-02';

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
});

function expectSuccess<T>(result: Result<T>): T {
  if (result.status !== 'success') {
    throw new Error(`expected success, got ${result.status}: ${result.message}`);
  }
  return result.data;
}

function fieldError<T>(result: Result<T>, field: string) {
  if (result.status !== 'validation_failure') {
    throw new Error(`expected a validation failure, got ${result.status}`);
  }
  const error = result.fieldErrors.find((candidate) => candidate.field === field);
  expect(error, `no error on ${field}`).toBeDefined();
  return error!;
}

const NEW_DEPARTMENT = {
  divisionId: 'wcf',
  name: 'Customer Success',
  code: 'CS',
  description: 'Adoption and retention.',
};

describe('department administration access (OH-FE-0201)', () => {
  it('is limited to Super Administrators on every operation', async () => {
    for (const userId of [HR, EMPLOYEE, TEAM_LEAD, MANAGEMENT]) {
      const results = await Promise.all([
        mockDepartmentAdminService.catalogue(userId),
        mockDepartmentAdminService.get(userId, 'dept-pia-technical'),
        mockDepartmentAdminService.create(userId, NEW_DEPARTMENT),
        mockDepartmentAdminService.update(userId, 'dept-pia-technical', NEW_DEPARTMENT),
        mockDepartmentAdminService.setStatus(userId, {
          departmentId: 'dept-pia-technical',
          isActive: false,
          reason: 'Reorganisation',
        }),
        mockDepartmentAdminService.remove(userId, 'dept-pia-technical'),
        mockDepartmentAdminService.listEligibleLeads(userId, 'dept-pia-technical'),
        mockDepartmentAdminService.appointLead(userId, {
          departmentId: 'dept-pia-technical',
          leadEmployeeId: 'emp-1001',
          effectiveFrom: TODAY,
          reason: '',
        }),
      ]);
      for (const result of results) expect(result.status).toBe('permission_denied');
    }
    /* Nothing changed through any of those calls. */
    expect(departmentById('dept-pia-technical')?.isActive).toBe(true);
    expect(departmentById('dept-wcf-customer-success')).toBeUndefined();
  });

  it('answers a signed-out caller with unauthenticated and a return route', async () => {
    const result = await mockDepartmentAdminService.catalogue('');
    expect(result.status).toBe('unauthenticated');
    if (result.status === 'unauthenticated') expect(result.returnTo).toBe('/admin/departments');
  });

  it('answers an unknown department with not found', async () => {
    const result = await mockDepartmentAdminService.get(ADMIN, 'dept-nope');
    expect(result.status).toBe('not_found');
  });
});

describe('the catalogue (OH-FE-0201, OH-FE-0202)', () => {
  it('groups departments by division and counts only effective placements', async () => {
    const view = expectSuccess(await mockDepartmentAdminService.catalogue(ADMIN));
    expect(view.groups.map((group) => group.division.id)).toEqual([
      'pia',
      'pit',
      'gov',
      'cjg',
      'wcf',
    ]);
    expect(view.departmentCount).toBe(16);
    expect(view.asOf).toBe(TODAY);

    const clientServices = view.groups
      .find((group) => group.division.id === 'wcf')
      ?.departments.find((row) => row.department.code === 'CLIENT');
    expect(clientServices?.activeEmployeeCount).toBe(2);
    expect(clientServices?.currentAppointment?.lead.id).toBe('emp-2002');
    expect(clientServices?.currentAppointment?.effectiveFromLabel).toBe('1 Jan 2025');
    expect(clientServices?.currentAppointment?.isScheduled).toBe(false);

    /* An ended placement is history, not a current member. */
    const editorial = view.groups
      .find((group) => group.division.id === 'cjg')
      ?.departments.find((row) => row.department.code === 'EDIT');
    expect(editorial?.placementCount).toBe(1);
    expect(editorial?.activeEmployeeCount).toBe(0);
  });

  it('lists the same department name under two divisions without ambiguity', async () => {
    const view = expectSuccess(await mockDepartmentAdminService.catalogue(ADMIN));
    const sales = view.groups.flatMap((group) =>
      group.departments
        .filter((row) => row.department.name === 'Sales')
        .map((row) => row.division.id),
    );
    expect(sales).toEqual(['pia', 'wcf']);
  });

  it('narrows by division, status and search without changing the total', async () => {
    const byDivision = expectSuccess(
      await mockDepartmentAdminService.catalogue(ADMIN, { divisionId: 'gov' }),
    );
    expect(byDivision.groups).toHaveLength(1);
    expect(byDivision.departmentCount).toBe(2);
    expect(byDivision.totalCount).toBe(16);

    const bySearch = expectSuccess(
      await mockDepartmentAdminService.catalogue(ADMIN, { search: 'sale' }),
    );
    expect(bySearch.departmentCount).toBe(2);

    expectSuccess(
      await mockDepartmentAdminService.setStatus(ADMIN, {
        departmentId: 'dept-pia-sales',
        isActive: false,
        reason: 'Merged into Client Services.',
      }),
    );
    const inactive = expectSuccess(
      await mockDepartmentAdminService.catalogue(ADMIN, { status: 'inactive' }),
    );
    expect(inactive.departmentCount).toBe(1);
    const active = expectSuccess(
      await mockDepartmentAdminService.catalogue(ADMIN, { status: 'active' }),
    );
    expect(active.departmentCount).toBe(15);
  });
});

describe('create and edit (OH-FE-0203)', () => {
  it('states the field and how to correct it for every refusal', async () => {
    const empty = await mockDepartmentAdminService.create(ADMIN, {
      divisionId: 'nope',
      name: '',
      code: 'a b',
      description: 'x'.repeat(241),
    });
    if (empty.status !== 'validation_failure') throw new Error('expected a validation failure');
    expect(empty.fieldErrors.map((error) => error.field)).toEqual([
      'divisionId',
      'name',
      'code',
      'description',
    ]);
    for (const error of empty.fieldErrors) expect(error.guidance.length).toBeGreaterThan(0);
    expect(empty.focusField).toBe('divisionId');
  });

  it('refuses a duplicate name inside the division and names that division', async () => {
    const result = await mockDepartmentAdminService.create(ADMIN, {
      divisionId: 'wcf',
      name: 'sales',
      code: 'SALES-2',
      description: '',
    });
    const error = fieldError(result, 'name');
    expect(error.message).toContain('WesternCF');
    expect(error.guidance).toContain('unique inside this division');
  });

  it('refuses a duplicate code inside the division', async () => {
    const result = await mockDepartmentAdminService.create(ADMIN, {
      divisionId: 'wcf',
      name: 'Renewals',
      code: 'ops',
      description: '',
    });
    expect(fieldError(result, 'code').message).toContain('WesternCF');
  });

  it('accepts a name that already exists in another division', async () => {
    const created = expectSuccess(
      await mockDepartmentAdminService.create(ADMIN, {
        divisionId: 'gov',
        name: 'Sales',
        code: 'GSALES',
        description: '',
      }),
    );
    expect(created.division.id).toBe('gov');
    expect(created.department.name).toBe('Sales');
    expect(created.currentLead).toBeNull();
  });

  it('creates an active department with an upper-cased code and no lead', async () => {
    const result = await mockDepartmentAdminService.create(ADMIN, {
      ...NEW_DEPARTMENT,
      code: 'cs',
    });
    const created = expectSuccess(result);
    expect(created.department.id).toBe('dept-wcf-customer-success');
    expect(created.department.code).toBe('CS');
    expect(created.department.isActive).toBe(true);
    expect(created.isReferenced).toBe(false);
    expect(created.canDelete).toBe(true);
    if (result.status === 'success') {
      expect(result.warnings?.[0]?.code).toBe('LEAD_NOT_APPOINTED');
    }

    const renamed = expectSuccess(
      await mockDepartmentAdminService.update(ADMIN, created.department.id, {
        divisionId: 'wcf',
        name: 'Customer Experience',
        code: 'CX',
        description: '',
      }),
    );
    expect(renamed.department.name).toBe('Customer Experience');
    expect(renamed.department.description).toBeNull();
  });
});

describe('deletion and division movement (OH-FE-0208)', () => {
  it('refuses to move a referenced department to another division, with guidance', async () => {
    const result = await mockDepartmentAdminService.update(ADMIN, 'dept-pia-technical', {
      divisionId: 'wcf',
      name: 'Technical',
      code: 'TECH',
      description: '',
    });
    expect(result.status).toBe('conflict');
    if (result.status === 'conflict') expect(result.guidance).toContain('Deactivate it instead');
    expect(departmentById('dept-pia-technical')?.divisionId).toBe('pia');
  });

  it('refuses to delete a referenced department and keeps it readable', async () => {
    const result = await mockDepartmentAdminService.remove(ADMIN, 'dept-wcf-client-services');
    expect(result.status).toBe('conflict');
    expect(departmentById('dept-wcf-client-services')).toBeDefined();
  });

  it('treats leadership history alone as a reference', async () => {
    /* `dept-pia-sales` has no placements, only an appointment. */
    const view = expectSuccess(await mockDepartmentAdminService.get(ADMIN, 'dept-pia-sales'));
    expect(view.placementCount).toBe(0);
    expect(view.isReferenced).toBe(true);
    expect(view.canDelete).toBe(false);
    expect(view.canChangeDivision).toBe(false);
    expect(await mockDepartmentAdminService.remove(ADMIN, 'dept-pia-sales')).toMatchObject({
      status: 'conflict',
    });
  });

  it('deletes a department nothing has referenced', async () => {
    const created = expectSuccess(await mockDepartmentAdminService.create(ADMIN, NEW_DEPARTMENT));
    const removed = expectSuccess(
      await mockDepartmentAdminService.remove(ADMIN, created.department.id),
    );
    expect(removed.removedId).toBe(created.department.id);
    expect(departmentById(created.department.id)).toBeUndefined();
  });

  it('allows moving a department it has just created', async () => {
    const created = expectSuccess(await mockDepartmentAdminService.create(ADMIN, NEW_DEPARTMENT));
    const moved = expectSuccess(
      await mockDepartmentAdminService.update(ADMIN, created.department.id, {
        ...NEW_DEPARTMENT,
        divisionId: 'cjg',
      }),
    );
    expect(moved.division.id).toBe('cjg');
  });
});

describe('deactivation (OH-FE-0207)', () => {
  it('requires a reason, then blocks new placements while keeping current ones', async () => {
    const noReason = await mockDepartmentAdminService.setStatus(ADMIN, {
      departmentId: 'dept-wcf-client-services',
      isActive: false,
      reason: '  ',
    });
    expect(fieldError(noReason, 'reason').guidance).toContain('reason');

    const result = await mockDepartmentAdminService.setStatus(ADMIN, {
      departmentId: 'dept-wcf-client-services',
      isActive: false,
      reason: 'Folded into Operations.',
    });
    const detail = expectSuccess(result);
    expect(detail.department.isActive).toBe(false);
    expect(detail.activeEmployeeCount).toBe(2);
    expect(detail.canDeactivate).toBe(false);
    if (result.status === 'success') {
      expect(result.warnings?.[0]?.code).toBe('MEMBERS_REMAIN');
      expect(result.warnings?.[0]?.message).toContain('2 employees keep their placement');
    }

    /* The placement rule and this screen read the same state. */
    expect(validateAssignmentDepartment('wcf', 'dept-wcf-client-services')).toMatchObject({
      field: 'departmentId',
    });
  });

  it('refuses a status change that is already in force', async () => {
    const result = await mockDepartmentAdminService.setStatus(ADMIN, {
      departmentId: 'dept-gov-delivery',
      isActive: true,
      reason: '',
    });
    expect(result.status).toBe('conflict');
  });

  it('reactivates without a reason and accepts placements again', async () => {
    expectSuccess(
      await mockDepartmentAdminService.setStatus(ADMIN, {
        departmentId: 'dept-gov-compliance',
        isActive: false,
        reason: 'Paused.',
      }),
    );
    const detail = expectSuccess(
      await mockDepartmentAdminService.setStatus(ADMIN, {
        departmentId: 'dept-gov-compliance',
        isActive: true,
        reason: '',
      }),
    );
    expect(detail.department.isActive).toBe(true);
    expect(validateAssignmentDepartment('gov', 'dept-gov-compliance')).toBeNull();
  });

  it('refuses to appoint a lead into an inactive department', async () => {
    expectSuccess(
      await mockDepartmentAdminService.setStatus(ADMIN, {
        departmentId: 'dept-gov-compliance',
        isActive: false,
        reason: 'Paused.',
      }),
    );
    const result = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-gov-compliance',
      leadEmployeeId: 'emp-1001',
      effectiveFrom: TODAY,
      reason: '',
    });
    expect(fieldError(result, 'departmentId').guidance).toContain('Reactivate');
  });
});

describe('the eligible-lead list (OH-FE-0204)', () => {
  it('offers only active employees with an effective assignment in that division', async () => {
    const options = expectSuccess(
      await mockDepartmentAdminService.listEligibleLeads(ADMIN, 'dept-wcf-operations'),
    );
    expect(options.map((option) => option.employee.id).sort()).toEqual([
      'emp-1001',
      'emp-1004',
      'emp-2002',
    ]);
    for (const option of options) expect(option.divisionId).toBe('wcf');
    /* One entry per employee, even for an employee with two assignments. */
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
  });

  it('excludes an employee whose assignment to the division has ended', async () => {
    const options = expectSuccess(
      await mockDepartmentAdminService.listEligibleLeads(ADMIN, 'dept-gov-delivery'),
    );
    /* `emp-1004`'s GOV assignment ended on 2026-08-31. */
    expect(options.map((option) => option.employee.id)).not.toContain('emp-1004');
    expect(options.map((option) => option.employee.id)).toContain('emp-2002');
  });

  it('refuses a candidate from another division on save, not only in the list', async () => {
    const result = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-gov-delivery',
      leadEmployeeId: 'emp-1002',
      effectiveFrom: TODAY,
      reason: '',
    });
    expect(fieldError(result, 'leadEmployeeId').guidance).toContain('effective assignment');
  });
});

describe('lead appointment (OH-FE-0205, OH-FE-0206)', () => {
  function history(detail: DepartmentAdminDetailView) {
    return detail.leadHistory.map((row) => [
      row.lead.id,
      row.assignment.effectiveFrom,
      row.assignment.effectiveTo,
      row.isEffective,
    ]);
  }

  it('takes effect today and closes the previous period without rewriting it', async () => {
    const before = expectSuccess(await mockDepartmentAdminService.get(ADMIN, 'dept-pia-technical'));
    expect(history(before)).toEqual([
      ['emp-2001', '2025-01-01', null, true],
      ['emp-1001', '2024-01-01', '2024-12-31', false],
    ]);

    const after = expectSuccess(
      await mockDepartmentAdminService.appointLead(ADMIN, {
        departmentId: 'dept-pia-technical',
        leadEmployeeId: 'emp-1001',
        effectiveFrom: TODAY,
        reason: 'Imran moves to Programs.',
      }),
    );
    expect(history(after)).toEqual([
      ['emp-1001', '2026-09-02', null, true],
      ['emp-2001', '2025-01-01', '2026-09-01', false],
      /* The 2024 row is untouched. */
      ['emp-1001', '2024-01-01', '2024-12-31', false],
    ]);
    expect(after.currentLead?.id).toBe('emp-1001');
    expect(after.currentAppointment?.effectiveFromLabel).toBe('2 Sep 2026');
    expect(after.scheduledAppointment).toBeNull();
  });

  it('schedules a future appointment and leaves the current lead in force', async () => {
    const result = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-pia-technical',
      leadEmployeeId: 'emp-1001',
      effectiveFrom: '2026-10-01',
      reason: '',
    });
    const detail = expectSuccess(result);
    expect(detail.currentLead?.id).toBe('emp-2001');
    expect(detail.scheduledAppointment?.lead.id).toBe('emp-1001');
    expect(detail.scheduledAppointment?.isScheduled).toBe(true);
    expect(detail.scheduledAppointment?.effectiveFromLabel).toBe('1 Oct 2026');
    /* The outgoing period ends the day before the new one starts. */
    expect(detail.leadHistory[1]?.assignment.effectiveTo).toBe('2026-09-30');
    if (result.status === 'success') {
      expect(result.warnings?.[0]?.code).toBe('APPOINTMENT_SCHEDULED');
      expect(result.warnings?.[0]?.message).toContain('Imran Hossain remains the effective lead');
    }
  });

  it('refuses a date in the past', async () => {
    const result = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-pia-technical',
      leadEmployeeId: 'emp-1001',
      effectiveFrom: '2026-01-01',
      reason: '',
    });
    expect(fieldError(result, 'effectiveFrom').guidance).toContain('never rewritten');
  });

  it('refuses a second appointment starting on or after a scheduled one', async () => {
    expectSuccess(
      await mockDepartmentAdminService.appointLead(ADMIN, {
        departmentId: 'dept-pia-technical',
        leadEmployeeId: 'emp-1001',
        effectiveFrom: '2026-10-01',
        reason: '',
      }),
    );
    const clash = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-pia-technical',
      leadEmployeeId: 'emp-3001',
      effectiveFrom: '2026-10-01',
      reason: '',
    });
    expect(clash.status).toBe('conflict');
    if (clash.status === 'conflict') expect(clash.guidance).toContain('later effective date');
  });

  it('refuses reappointing the employee who already leads the department', async () => {
    const result = await mockDepartmentAdminService.appointLead(ADMIN, {
      departmentId: 'dept-pia-technical',
      leadEmployeeId: 'emp-2001',
      effectiveFrom: TODAY,
      reason: '',
    });
    expect(fieldError(result, 'leadEmployeeId').message).toContain('already leads');
  });

  it('lets one employee lead departments in more than one division', async () => {
    const pia = expectSuccess(
      await mockDepartmentAdminService.appointLead(ADMIN, {
        departmentId: 'dept-pia-it',
        leadEmployeeId: 'emp-1001',
        effectiveFrom: TODAY,
        reason: '',
      }),
    );
    const wcf = expectSuccess(
      await mockDepartmentAdminService.appointLead(ADMIN, {
        departmentId: 'dept-wcf-operations',
        leadEmployeeId: 'emp-1001',
        effectiveFrom: TODAY,
        reason: '',
      }),
    );
    expect(pia.currentLead?.id).toBe('emp-1001');
    expect(wcf.currentLead?.id).toBe('emp-1001');
  });
});
