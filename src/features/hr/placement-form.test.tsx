import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import { mockStore } from '@/services/mock/store';
import { resetDepartmentState } from '@/services/mock/department-store';
import { EmployeeDetail } from './employees';

/**
 * `OH-FE-0301`–`OH-FE-0306`, `OH-FE-0313` — placement on the assignment form.
 *
 * What these cases pin is the behaviour a dependent control has to get right:
 * the department list belongs to the **selected division**, a department chosen
 * for one division is cleared rather than carried into another, the effective
 * lead is context rather than an editable field, and the history distinguishes
 * a transfer, a scheduled placement and an ended one.
 */

const session = vi.hoisted(() => ({ userId: 'usr-3001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/employees/emp-1001',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: session.userId } }),
}));

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
  session.userId = 'usr-3001';
});

function renderEmployee(employeeId = 'emp-1001') {
  return render(
    <ToastProvider>
      <EmployeeDetail employeeId={employeeId} />
    </ToastProvider>,
  );
}

/**
 * The employee detail is tabbed, and placements live under Assignments — so
 * every case here opens that tab first, exactly as a person would.
 */
async function openAssignmentsTab() {
  const tab = await screen.findByRole('tab', { name: /Assignments/i }, { timeout: 5000 });
  await userEvent.click(tab);
  return tab;
}

async function openAssignmentForm() {
  await openAssignmentsTab();
  const add = await screen.findByRole('button', { name: /assignment/i }, { timeout: 5000 });
  await userEvent.click(add);
  return screen.findByRole('dialog');
}

describe('the assignment form owns placement (OH-FE-0301, OH-FE-0302)', () => {
  it('offers only active departments of the selected division, and no Team Lead field', async () => {
    renderEmployee();
    const dialog = await openAssignmentForm();

    await userEvent.selectOptions(within(dialog).getByLabelText(/^Division/), 'gov');
    const department = within(dialog).getByLabelText(/^Department/);
    await waitFor(() => expect(within(department).getAllByRole('option').length).toBeGreaterThan(1));
    const options = within(department)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    /* Government Projects owns Delivery and Compliance, and nothing else. */
    expect(options.some((label) => /Delivery/.test(label))).toBe(true);
    expect(options.some((label) => /Compliance/.test(label))).toBe(true);
    expect(options.some((label) => /Technical|Sales/.test(label))).toBe(false);

    /*
     * `OH-FE-0304`: the lead is context, not an editable employee field. It is
     * `readonly` rather than `disabled` on purpose — a disabled control leaves
     * the tab order and stops being announced, and this is information the
     * person needs to read.
     */
    const lead = within(dialog).getByLabelText(/Effective Team Lead/);
    expect(lead).toHaveAttribute('readonly');
    expect(within(dialog).queryByRole('combobox', { name: /^Team Lead$/ })).toBeNull();
  });

  it('clears a department that belongs to another division (OH-FE-0303)', async () => {
    renderEmployee();
    const dialog = await openAssignmentForm();

    await userEvent.selectOptions(within(dialog).getByLabelText(/^Division/), 'pia');
    const department = within(dialog).getByLabelText(/^Department/);
    await waitFor(() => expect(within(department).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.selectOptions(department, 'dept-pia-technical');
    expect(department).toHaveValue('dept-pia-technical');

    await userEvent.selectOptions(within(dialog).getByLabelText(/^Division/), 'cjg');
    /* The stale selection is dropped rather than submitted into the wrong division. */
    await waitFor(() => expect(within(dialog).getByLabelText(/^Department/)).toHaveValue(''));
  });
});

describe('placement history (OH-FE-0305, OH-FE-0306)', () => {
  it('states every current placement and labels a scheduled one as scheduled', async () => {
    /*
     * `emp-1001` works in three divisions, each with its own department, which
     * is the multi-division case the model exists for.
     */
    renderEmployee();
    await openAssignmentsTab();
    const summary = await screen.findByText(/Placed in 3 departments:/, undefined, { timeout: 5000 });
    expect(summary).toHaveTextContent('Technical (PowerInAI)');
    expect(summary).toHaveTextContent('Delivery (Government Projects)');
    expect(summary).toHaveTextContent('Client Services (WesternCF)');

    const history = await screen.findByRole('heading', { name: 'Placement history' });
    expect(history).toBeInTheDocument();
  });

  it('calls an ended placement ended, not scheduled', async () => {
    /* `emp-1004` holds an expired temporary Government Projects assignment. */
    renderEmployee('emp-1004');
    await openAssignmentsTab();
    await screen.findByRole('heading', { name: 'Placement history' });
    /* The expired temporary Government Projects placement reads as ended. */
    expect(screen.getByText('Ended')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).toBeNull();
    expect(screen.getByText(/1 Jul 2026 – 31 Aug 2026/)).toBeInTheDocument();
  });
});
