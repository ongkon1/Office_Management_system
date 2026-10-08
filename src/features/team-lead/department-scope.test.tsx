import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import { mockStore } from '@/services/mock/store';
import {
  departmentLeadAssignments,
  resetDepartmentState,
  saveDepartmentLeadAssignment,
} from '@/services/mock/department-store';
import { mockTeamLeadService } from '@/services/mock/team-lead';
import {
  findAccountByUserId,
  resetDemoAccountState,
  updateDemoAccount,
} from '@/services/mock/accounts';
import { TeamMembers } from './team-overview';

/**
 * `OH-FE-0308`, `OH-FE-0309`, `OH-FE-0311`, `OH-FE-0312` — what a department
 * lead is shown.
 *
 * Three people, three states, from the seeded hierarchy: `usr-2001` leads many
 * departments across two divisions, `usr-1001` holds one appointment over a
 * department nobody is placed in, and `usr-1004` holds an appointment that
 * starts in December. Each needs a different answer, and an empty table is the
 * right answer to none of them.
 */

const session = vi.hoisted(() => ({ userId: 'usr-2001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/team',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: session.userId } }),
}));

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
  session.userId = 'usr-2001';
});

function renderTeam() {
  return render(
    <ToastProvider>
      <TeamMembers />
    </ToastProvider>,
  );
}

describe('the member list is scoped to the departments the viewer leads (OH-FE-0308)', () => {
  it('reports each member through the viewer own departments, not every department they belong to', async () => {
    const members = await mockTeamLeadService.listMembers('usr-2001');
    if (members.status !== 'success') throw new Error(members.message);

    expect(members.data.length).toBeGreaterThan(0);
    for (const member of members.data) {
      expect(member.departments.length, member.employee.fullName).toBeGreaterThan(0);
    }

    /* Nadia works in three divisions; this lead reaches her through PowerInAI
       Technical only, so Client Services must not appear on her row. */
    const nadia = members.data.find((member) => member.employee.employeeCode === 'EMP-1001');
    expect(nadia?.departments.map((department) => department.name)).toEqual(['Technical']);
  });

  it('keeps a restricted division out of an unauthorized lead scope (OH-FE-0311)', async () => {
    /* `usr-2001` has no government permission and leads no government
       department; nothing from Government Projects may appear. */
    const members = await mockTeamLeadService.listMembers('usr-2001');
    if (members.status !== 'success') throw new Error(members.message);
    const divisions = members.data.flatMap((member) => member.divisions.map((division) => division.code));
    expect(divisions).not.toContain('GOV');
    const departments = members.data.flatMap((member) =>
      member.departments.map((department) => department.division.code),
    );
    expect(departments).not.toContain('GOV');
  });
});

describe('the department scope selector (OH-FE-0309)', () => {
  it('explains a multi-department scope and narrows the list to one department', async () => {
    renderTeam();
    const explanation = await screen.findByText(/You lead \d+ departments across \d+ division/, undefined, { timeout: 5000 });
    expect(explanation).toBeInTheDocument();

    const selector = await screen.findByLabelText('Filter team by department');
    const options = within(selector).getAllByRole('option').map((option) => option.textContent ?? '');
    expect(options[0]).toBe('All departments');
    /* Every option names its division, because a name is unique only inside one. */
    expect(options.slice(1).every((label) => label.includes('·'))).toBe(true);

    const table = await screen.findByRole('table');
    const before = within(table).getAllByRole('row').length;
    const technical = options.find((label) => label.startsWith('Technical'));
    expect(technical, 'no Technical option').toBeDefined();

    await userEvent.selectOptions(selector, within(selector).getByRole('option', { name: technical! }));
    await waitFor(async () => {
      const after = await screen.findByRole('table');
      expect(within(after).getAllByRole('row').length).toBeLessThan(before);
    });
    /* The applied filter is listed so it can be removed. */
    expect(screen.getByText(/Department/)).toBeInTheDocument();
  });

  it('says so when the only appointment covers a department with nobody in it (OH-FE-0312)', async () => {
    /* `usr-1001` leads PowerInAI Sales, which has no placements. */
    session.userId = 'usr-1001';
    renderTeam();
    expect(
      await screen.findByText(/You lead Sales in PowerInAI/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(await screen.findByText('No team members assigned')).toBeInTheDocument();
    expect(
      screen.getByText(/A department with no placements yet shows none/),
    ).toBeInTheDocument();
  });

  it('says so when every appointment has ended or not started yet (OH-FE-0312)', async () => {
    /*
     * The expired and future states together. A Team Lead *by role* keeps the
     * screen — the role is what opens it — so they are the person who can be
     * shown "your appointment has not started yet"; an employee whose only
     * appointment is in the future is denied the route outright, which is the
     * permission-loss state covered in
     * `src/features/access/department-capabilities.test.ts`.
     *
     * Driven through the store so the dates are the only thing that changed:
     * every effective appointment is closed yesterday, and one is scheduled.
     */
    for (const assignment of departmentLeadAssignments().filter(
      (candidate) => candidate.leadEmployeeId === 'emp-2001' && candidate.effectiveTo === null,
    )) {
      saveDepartmentLeadAssignment({ ...assignment, effectiveTo: '2026-09-01' });
    }
    saveDepartmentLeadAssignment({
      id: 'lead-dept-pia-technical-future',
      departmentId: 'dept-pia-technical',
      leadEmployeeId: 'emp-2001',
      effectiveFrom: '2026-10-01',
      effectiveTo: null,
      reason: 'Returns in October',
      createdAt: '2026-09-01T09:00:00+06:00',
      createdBy: { userId: 'usr-9001', displayName: 'Arif Mahmud' },
      updatedAt: '2026-09-01T09:00:00+06:00',
      updatedBy: { userId: 'usr-9001', displayName: 'Arif Mahmud' },
    });

    renderTeam();
    expect(
      await screen.findByText(/Your appointment has not started yet/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText(/from 1 Oct 2026/)).toBeInTheDocument();
    /*
     * The list itself still shows the account's legacy scope while no
     * appointment is effective. That is the compatibility fallback the server
     * also applies to an unplaced assignment — the demo must not pretend the
     * database behaves differently — and it is exactly why the notice above has
     * to be explicit about *why* the screen looks the way it does.
     */
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

describe('project authority stays separate from department leadership (OH-FE-0310)', () => {
  it('lets an appointed lead read projects in their division but not change one', async () => {
    /*
     * `usr-1001` leads PowerInAI Sales by appointment and manages no project.
     * Reading the division's projects is ordinary visibility; saving one is
     * project authority, which an appointment does not grant.
     */
    const readable = await mockTeamLeadService.listProjects('usr-1001');
    expect(readable.status).toBe('success');
    if (readable.status === 'success') expect(readable.data.length).toBeGreaterThan(0);

    const refused = await mockTeamLeadService.saveProject('usr-1001', {
      name: 'Appointment should not create this',
      code: 'NOPE',
      divisionId: 'pia',
      managerEmployeeId: 'emp-1001',
      client: null,
      startDate: '2026-09-02',
      endDate: null,
      priority: 'medium',
      status: 'active',
      estimatedHours: 10,
      budgetAmount: null,
      deadline: null,
      memberEmployeeIds: [],
    } as never);
    expect(refused.status).toBe('permission_denied');
  });

  it('still lets a Team Lead by role manage a project in their division', async () => {
    const saved = await mockTeamLeadService.saveProject('usr-2001', {
      name: 'Role-based lead project',
      code: 'ROLE1',
      divisionId: 'pia',
      managerEmployeeId: 'emp-2001',
      client: null,
      startDate: '2026-09-02',
      endDate: null,
      priority: 'medium',
      status: 'active',
      estimatedHours: 10,
      budgetAmount: null,
      deadline: null,
      memberEmployeeIds: [],
    } as never);
    expect(saved.status).toBe('success');
  });
});

describe('a department scope is no way around the government rule (OH-FE-0311)', () => {
  it('omits a restricted department from a lead scope without the permission', async () => {
    /*
     * `usr-2002` leads Government Projects departments *and* holds
     * `organization.government.view`, so they legitimately see them. The rule
     * being checked is that the permission — not the appointment — is what
     * opens them: with the grant removed from the account, the same
     * appointments disclose nothing, including in the viewer's own scope
     * summary.
     */
    const withGrant = await mockTeamLeadService.getDashboard('usr-2002');
    if (withGrant.status !== 'success') throw new Error(withGrant.message);
    expect(
      withGrant.data.leadScope.departments.some((department) => department.isRestricted),
    ).toBe(true);

    const account = findAccountByUserId('usr-2002');
    expect(account, 'no usr-2002 account').toBeDefined();
    updateDemoAccount('usr-2002', (current) => ({ ...current, permissions: [] }));
    try {
      const withoutGrant = await mockTeamLeadService.getDashboard('usr-2002');
      if (withoutGrant.status !== 'success') throw new Error(withoutGrant.message);
      expect(
        withoutGrant.data.leadScope.departments.some((department) => department.isRestricted),
      ).toBe(false);
      expect(
        withoutGrant.data.leadScope.departments.every(
          (department) => department.divisionId !== 'gov',
        ),
      ).toBe(true);

      const members = await mockTeamLeadService.listMembers('usr-2002');
      if (members.status !== 'success') throw new Error(members.message);
      expect(
        members.data.flatMap((member) => member.departments.map((d) => d.division.code)),
      ).not.toContain('GOV');
    } finally {
      resetDemoAccountState();
    }
  });
});
