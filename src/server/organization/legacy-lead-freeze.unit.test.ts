import { describe, expect, it, vi } from 'vitest';

import { OrganizationWorkService, type AssignmentRow, type OrganizationWorkRepository } from '@/server/organization-work/service';

/**
 * `OH-BE-0111` — the legacy assignment lead is frozen in the service, not only
 * by migration 0013's trigger.
 *
 * The trigger preserves the stored value whatever a writer sends, which keeps a
 * compatibility deployment from crashing; this test is about the path a person
 * actually uses, where the submitted value has to be ignored rather than
 * silently dropped at the database. Department leadership is an effective-dated
 * appointment, so an assignment save must not be able to grant it.
 */

const assignment = (overrides: Partial<AssignmentRow> = {}): AssignmentRow => ({
  id: 'asg-1',
  employeeId: 'emp-1',
  divisionId: 'div-1',
  leadEmployeeId: 'emp-stored-lead',
  from: '2026-01-01',
  to: null,
  isActive: true,
  primary: true,
  temporary: false,
  allocationPercent: 100,
  version: 1,
  ...overrides,
});

function repository(existing: AssignmentRow | null): OrganizationWorkRepository {
  const saved: AssignmentRow[] = [];
  return {
    employee: vi.fn(),
    saveEmployee: vi.fn(),
    assignments: vi.fn().mockResolvedValue(existing ? [existing] : []),
    getAssignment: vi.fn().mockResolvedValue(existing),
    saveAssignment: vi.fn(async (row: AssignmentRow) => {
      saved.push(row);
      return true;
    }),
    getProject: vi.fn(),
    saveProject: vi.fn(),
    projectActualMinutes: vi.fn().mockResolvedValue(0),
    getTask: vi.fn(),
    saveTask: vi.fn(),
    taskActualMinutes: vi.fn().mockResolvedValue(0),
    effectiveLead: vi.fn().mockResolvedValue(null),
    appendTaskDecision: vi.fn(),
    division: vi.fn(),
    saveDivision: vi.fn(),
    searchEmployees: vi.fn().mockResolvedValue([]),
    setRoles: vi.fn(),
    profileAttachment: vi.fn(),
    transaction: vi.fn(async (work: () => Promise<unknown>) => work()),
  } as unknown as OrganizationWorkRepository;
}

const effects = { audit: vi.fn(), notify: vi.fn(), profilePhotoExists: vi.fn().mockResolvedValue(true) };
const actor = {
  userId: 'usr-hr',
  employeeId: 'emp-hr',
  roles: ['hr_manager'] as const,
  permissions: new Set<string>(),
  divisionIds: new Set<string>(['div-1']),
  employeeIds: new Set<string>(),
  projectIds: new Set<string>(),
};

describe('the legacy assignment lead is frozen (OH-BE-0111)', () => {
  it('keeps the stored lead when an update submits a different one', async () => {
    const existing = assignment();
    const repo = repository(existing);
    const service = new OrganizationWorkService(repo, effects as never);

    const result = await service.saveAssignment(
      actor as never,
      assignment({ leadEmployeeId: 'emp-submitted-lead', allocationPercent: 80 }),
      1,
    );

    expect(result.status).toBe('success');
    const sent = vi.mocked(repo.saveAssignment).mock.calls[0]?.[0];
    expect(sent?.leadEmployeeId).toBe('emp-stored-lead');
    /* The rest of the submitted change still applies. */
    expect(sent?.allocationPercent).toBe(80);
    if (result.status === 'success') expect(result.data.leadEmployeeId).toBe('emp-stored-lead');
  });

  it('leaves the submitted lead on a new assignment, because routing still reads it', async () => {
    const repo = repository(null);
    const service = new OrganizationWorkService(repo, effects as never);

    await service.saveAssignment(actor as never, assignment({ leadEmployeeId: 'emp-new-lead' }));

    expect(vi.mocked(repo.saveAssignment).mock.calls[0]?.[0]?.leadEmployeeId).toBe('emp-new-lead');
  });
});
