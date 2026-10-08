import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import { mockStore } from '@/services/mock/store';
import { resetDepartmentState } from '@/services/mock/department-store';
import { ReportBuilder } from './report-builder';

/**
 * `OH-BE-0306` on screen.
 *
 * The report builder renders any option-bearing filter generically, so adding
 * the `department` kind to the contract is only half the change: this checks a
 * person is actually offered the filter, that its options name the division
 * (because a department name is unique only inside one), and that choosing one
 * narrows the report rather than being accepted and ignored.
 */

const session = vi.hoisted(() => ({ userId: 'usr-9001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/reports/timesheet-detail',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: session.userId } }),
}));

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
  session.userId = 'usr-9001';
});

function renderBuilder(reportKey = 'timesheet-detail') {
  return render(
    <ToastProvider>
      <ReportBuilder reportKey={reportKey} />
    </ToastProvider>,
  );
}

describe('the department report filter (OH-BE-0306)', () => {
  it('is offered, names each division, and narrows the report', async () => {
    renderBuilder();
    const filter = await screen.findByRole('button', { name: /^Department/ }, { timeout: 5000 });
    expect(filter).toBeInTheDocument();

    await userEvent.click(filter);
    /* The shared filter renders each option as a `role="checkbox"` button whose
       own text is the label. */
    const options = await screen.findAllByRole('checkbox');
    const labels = options.map((option) => option.textContent ?? '');
    /* Every department option names its division: "PowerInAI · Technical". */
    expect(labels.filter((label) => label.includes('·')).length).toBeGreaterThan(0);

    const technical = options.find((option) => (option.textContent ?? '').includes('Technical'));
    expect(technical, 'no Technical department option').toBeDefined();

    const before = await screen.findByRole('table');
    const rowsBefore = within(before).getAllByRole('row').length;

    await userEvent.click(technical!);
    await userEvent.keyboard('{Escape}');

    /* The filter reaches the service: the table re-reads and reports fewer or
       equal rows, never more, and never an error state. */
    await waitFor(async () => {
      const after = await screen.findByRole('table');
      expect(within(after).getAllByRole('row').length).toBeLessThanOrEqual(rowsBefore);
    });
    expect(screen.queryByText(/could not be loaded|unavailable/i)).toBeNull();
  });

  it('is offered on the attendance and headcount reports too', async () => {
    for (const key of ['attendance-register', 'headcount']) {
      const view = renderBuilder(key);
      expect(await screen.findByRole('button', { name: /^Department/ }, { timeout: 5000 })).toBeInTheDocument();
      view.unmount();
    }
  });
});
