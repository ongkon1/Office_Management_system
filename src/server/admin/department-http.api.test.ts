import { describe, expect, it, vi } from 'vitest';

import type { DepartmentAdministrationService } from '@/contracts/organization-hierarchy';
import { success } from '@/contracts/results';
import { handleAdminRequest, type AdminRequestServices } from './http';
import type { BackendUserRoleAdmin } from './user-role-views';

/**
 * `OH-BE-0216` — department administration travels through the existing
 * administration envelope.
 *
 * What is checked here is the boundary itself: the origin check, the command
 * whitelist, the argument limits, and that a department command reaches the
 * department service and nothing else. A method that is not on the list must be
 * refused by name rather than reflected onto whatever object happens to have
 * it, which is how a command envelope becomes an arbitrary-call surface.
 */

const ORIGIN = 'https://office.test';

function services(): AdminRequestServices & { departments: Record<keyof DepartmentAdministrationService, ReturnType<typeof vi.fn>> } {
  const departments = {
    catalogue: vi.fn().mockResolvedValue(success({ groups: [] })),
    get: vi.fn().mockResolvedValue(success({ id: 'dept-1' })),
    create: vi.fn().mockResolvedValue(success({ id: 'dept-new' })),
    update: vi.fn().mockResolvedValue(success({ id: 'dept-1' })),
    setStatus: vi.fn().mockResolvedValue(success({ id: 'dept-1' })),
    remove: vi.fn().mockResolvedValue(success({ removedId: 'dept-1' })),
    listEligibleLeads: vi.fn().mockResolvedValue(success([])),
    appointLead: vi.fn().mockResolvedValue(success({ id: 'dept-1' })),
  };
  const admin = { listDivisions: vi.fn().mockResolvedValue(success([])) } as unknown as BackendUserRoleAdmin;
  return { admin, departments: departments as never } as never;
}

function post(body: unknown, origin = ORIGIN): Request {
  return new Request(`${origin}/api/admin`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function send(body: unknown, origin = ORIGIN) {
  const target = services();
  const response = await handleAdminRequest(post(body, origin), target, ORIGIN);
  return { target, response, payload: await response.json() };
}

describe('the administration command envelope', () => {
  it('dispatches a department command to the department service with its arguments', async () => {
    const { target, payload } = await send({
      method: 'department.appointLead',
      args: ['usr-9001', { departmentId: 'dept-1', leadEmployeeId: 'emp-1', effectiveFrom: '2026-09-02', reason: '' }],
    });
    expect(target.departments.appointLead).toHaveBeenCalledWith('usr-9001', {
      departmentId: 'dept-1',
      leadEmployeeId: 'emp-1',
      effectiveFrom: '2026-09-02',
      reason: '',
    });
    expect(payload.status).toBe('success');
  });

  it('keeps an optional argument optional rather than passing null', async () => {
    const { target } = await send({ method: 'department.catalogue', args: ['usr-9001'] });
    expect(target.departments.catalogue).toHaveBeenCalledWith('usr-9001');
  });

  it('refuses a method that is not on the list, without calling anything', async () => {
    for (const method of ['department.drop', 'constructor', 'toString', 'then', '__proto__']) {
      const { target, payload } = await send({ method, args: ['usr-9001'] });
      expect(payload.status).toBe('validation_failure');
      for (const call of Object.values(target.departments)) expect(call).not.toHaveBeenCalled();
    }
  });

  it('refuses a cross-origin request before reading the body', async () => {
    const { target, payload } = await send(
      { method: 'department.remove', args: ['usr-9001', 'dept-1'] },
      'https://attacker.test',
    );
    expect(payload.status).toBe('permission_denied');
    expect(target.departments.remove).not.toHaveBeenCalled();
  });

  it('refuses malformed JSON and an empty or oversized argument list', async () => {
    const malformed = new Request(`${ORIGIN}/api/admin`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body: '{not json',
    });
    const response = await handleAdminRequest(malformed, services(), ORIGIN);
    expect((await response.json()).status).toBe('validation_failure');

    expect((await send({ method: 'department.get', args: [] })).payload.status).toBe('validation_failure');
    expect(
      (await send({ method: 'department.get', args: ['a', 'b', 'c', 'd', 'e'] })).payload.status,
    ).toBe('validation_failure');
  });

  it('still routes the user and role commands to their own service', async () => {
    const { target, payload } = await send({ method: 'listDivisions', args: ['usr-9001'] });
    expect(payload.status).toBe('success');
    expect(target.departments.catalogue).not.toHaveBeenCalled();
  });
});
