import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import { departmentById, resetDepartmentState } from '@/services/mock/department-store';
import { mockStore } from '@/services/mock/store';
import { DepartmentAdministration } from './departments';

/**
 * `OH-FE-0201`–`OH-FE-0210` — the department catalogue on screen.
 *
 * The service's rules are pinned in `department-admin.test.ts`. What is checked
 * here is what an administrator is *offered*: the grouping, the facts each row
 * states, the two appointment flows, retained history, and that a role without
 * the permission reaches no control at all.
 */

const session = vi.hoisted(() => ({ userId: 'usr-9001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/admin/departments',
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: session.userId } }),
}));

function renderScreen() {
  return render(
    <ToastProvider>
      <DepartmentAdministration />
    </ToastProvider>,
  );
}

/**
 * Opens a row's action menu in the table.
 *
 * Scoped to the table deliberately: the shared `DataTable` renders both a table
 * and mobile cards and hides one with CSS, so every row exists twice in the
 * DOM and an unscoped query matches both.
 */
async function openRowMenu(name: string) {
  for (const table of screen.getAllByRole('table')) {
    /* `queryAllByText`: a department's name and its code can be the same text
       (IT / IT), and both live in the same row. */
    const row = within(table).queryAllByText(name)[0]?.closest('tr');
    if (!row) continue;
    await userEvent.click(within(row).getByRole('button', { name: /Row actions/i }));
    return;
  }
  throw new Error(`no table row for ${name}`);
}

beforeEach(() => {
  mockStore.reset();
  resetDepartmentState();
  session.userId = 'usr-9001';
});

describe('the catalogue (OH-FE-0201, OH-FE-0202)', () => {
  it('groups departments under their division and states the required facts', async () => {
    renderScreen();

    const wcf = await screen.findByRole('heading', { name: 'WesternCF', level: 2 });
    expect(wcf).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'PowerInAI', level: 2 })).toBeInTheDocument();

    /* The same name under two divisions, each in its own group. */
    const sales = screen
      .getAllByRole('table')
      .filter((table) => within(table).queryAllByText('Sales').length > 0)
      .map((table) =>
        (table.querySelector('caption')?.textContent ?? '').replace('Departments in ', '').trim(),
      );
    expect(sales).toEqual(['PowerInAI', 'WesternCF']);

    const table = screen.getByRole('table', { name: /Departments in WesternCF/ });
    const clientServices = within(table).getByText('Client Services').closest('tr');
    expect(clientServices).not.toBeNull();
    const cells = within(clientServices as HTMLElement);
    expect(cells.getByText('CLIENT')).toBeInTheDocument();
    expect(cells.getByText('Active')).toBeInTheDocument();
    expect(cells.getByText('Farhana Islam')).toBeInTheDocument();
    expect(cells.getByText('Effective from 1 Jan 2025')).toBeInTheDocument();
    expect(cells.getByText('2')).toBeInTheDocument();
  });

  it('filters by division and search, and offers a way back from an empty result', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });

    await userEvent.selectOptions(screen.getByLabelText('Division'), 'gov');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'WesternCF', level: 2 })).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByRole('heading', { name: 'Government Projects', level: 2 }),
    ).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Search'), 'zzz');
    const empty = await screen.findByText('No department matches these filters');
    expect(empty).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });
  });
});

describe('access (OH-FE-0201 exit criterion)', () => {
  it('offers an HR Manager no catalogue and no controls', async () => {
    session.userId = 'usr-3001';
    renderScreen();

    expect(await screen.findByText('Not available to your role')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'WesternCF', level: 2 })).not.toBeInTheDocument();
    /* The page's own New department button is the only remaining control, and
       the service refuses it — checked in `department-admin.test.ts`. */
    expect(screen.queryByRole('button', { name: /Appoint lead|Deactivate/ })).not.toBeInTheDocument();
  });
});

describe('create and edit (OH-FE-0203)', () => {
  it('states the field and the correction for a duplicate name inside the division', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'New department' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.selectOptions(within(dialog).getByLabelText(/^Division/), 'wcf');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Sales');
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'SALES2');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create department' }));

    /* Stated in the summary and on the field itself. */
    const errors = await within(dialog).findAllByText(
      /WesternCF already has a department with this name\. Use a name that is unique inside this division\./,
    );
    expect(errors.length).toBeGreaterThan(1);
    expect(departmentById('dept-wcf-sales-2')).toBeUndefined();
  });

  it('creates a department and reports it', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });

    await userEvent.click(screen.getByRole('button', { name: 'New department' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^Division/), 'gov');
    await userEvent.type(within(dialog).getByLabelText(/^Name/), 'Procurement');
    await userEvent.type(within(dialog).getByLabelText(/^Code/), 'proc');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create department' }));

    await waitFor(() => expect(departmentById('dept-gov-procurement')?.code).toBe('PROC'));
    expect(await screen.findByText('Department created')).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: /Departments in Government Projects/ });
    expect(within(table).getByText('Procurement')).toBeInTheDocument();
  });

  it('locks the division of a referenced department and says why', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'PowerInAI', level: 2 });

    await openRowMenu('Technical');
    await userEvent.click(await screen.findByRole('menuitem', { name: /Edit department/ }));

    const dialog = await screen.findByRole('dialog');
    const division = within(dialog).getByLabelText(/^Division/);
    expect(division).toBeDisabled();
    expect(
      within(dialog).getByText(/Deactivate it instead/),
    ).toBeInTheDocument();
  });
});

describe('lead appointment (OH-FE-0204, OH-FE-0205, OH-FE-0206)', () => {
  it('offers only employees assigned to the division and appoints from today', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'Government Projects', level: 2 });

    await openRowMenu('Delivery');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Appoint lead' }));

    const dialog = await screen.findByRole('dialog');
    const select = within(dialog).getByLabelText(/^Lead/);
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    const names = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '');
    expect(names.some((name) => name.includes('Nadia Rahman'))).toBe(true);
    /* `emp-1002` works only in Computer Jagat. */
    expect(names.some((name) => name.includes('Tanvir Ahmed'))).toBe(false);

    await userEvent.selectOptions(select, 'emp-1001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Appoint lead' }));

    await waitFor(() => expect(screen.getByText('Lead appointed')).toBeInTheDocument());
    const table = await screen.findByRole('table', { name: /Departments in Government Projects/ });
    const row = within(table).getByText('Delivery').closest('tr') as HTMLElement;
    expect(within(row).getByText('Nadia Rahman')).toBeInTheDocument();
    expect(within(row).getByText('Effective from 2 Sep 2026')).toBeInTheDocument();
  });

  it('schedules a future appointment and keeps the current lead in force', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'PowerInAI', level: 2 });

    await openRowMenu('IT');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Appoint lead' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('radio', { name: /Scheduled for a later date/ }));
    const date = within(dialog).getByLabelText(/^Effective from/);
    await userEvent.clear(date);
    await userEvent.type(date, '2026-11-01');

    const select = within(dialog).getByLabelText(/^Lead/);
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.selectOptions(select, 'emp-1001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Appoint lead' }));

    await waitFor(() => expect(screen.getByText('Lead appointed')).toBeInTheDocument());
    const table = await screen.findByRole('table', { name: 'Departments in PowerInAI' });
    const row = within(table).getAllByText('IT')[0]?.closest('tr') as HTMLElement;
    /* Imran still leads it today; Nusrat is named as the scheduled change. */
    expect(within(row).getByText('Imran Hossain')).toBeInTheDocument();
    expect(within(row).getByText(/Scheduled: Nadia Rahman from 1 Nov 2026/)).toBeInTheDocument();
  });

  it('refuses a past date with guidance and changes nothing', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'PowerInAI', level: 2 });

    await openRowMenu('People');
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Appoint lead' }));
    const dialog = await screen.findByRole('dialog');

    await userEvent.click(within(dialog).getByRole('radio', { name: /Scheduled for a later date/ }));
    const date = within(dialog).getByLabelText(/^Effective from/);
    await userEvent.type(date, '2026-01-01');
    const select = within(dialog).getByLabelText(/^Lead/);
    await waitFor(() => expect(within(select).getAllByRole('option').length).toBeGreaterThan(1));
    await userEvent.selectOptions(select, 'emp-1001');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Appoint lead' }));

    expect(within(dialog).getByLabelText(/^Effective from/)).toHaveValue('2026-01-01');
    /* The summary is the live region a screen reader hears, so it is what the
       assertion reads — and it carries the correction, not only the problem. */
    const summary = await within(dialog).findByRole('alert');
    expect(summary).toHaveTextContent(/An appointment cannot start in the past\./);
    expect(summary).toHaveTextContent(/never rewritten/);
  });

  it('shows leadership history as a record that cannot be edited', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'PowerInAI', level: 2 });

    await openRowMenu('Technical');
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /View placements and leadership/ }),
    );

    const drawer = await screen.findByRole('dialog');

    /* Both periods are listed, the ended one labelled as such. */
    expect(await within(drawer).findByText('Leadership history')).toBeInTheDocument();
    expect(within(drawer).getByText('Current')).toBeInTheDocument();
    expect(within(drawer).getByText('Ended')).toBeInTheDocument();
    expect(within(drawer).getByText(/1 Jan 2024 – 31 Dec 2024/)).toBeInTheDocument();
    expect(
      within(drawer).getByText(/periods already recorded are kept as they were and cannot be edited/),
    ).toBeInTheDocument();
    /* No control offers to change a recorded period. */
    expect(within(drawer).queryByRole('button', { name: /Edit appointment|End period/ })).toBeNull();
  });
});

describe('deactivation and deletion (OH-FE-0207, OH-FE-0208)', () => {
  it('requires a reason, then reports that placements are kept', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });

    await openRowMenu('Client Services');
    await userEvent.click(await screen.findByRole('menuitem', { name: /Deactivate department/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/2 employees keep their placement/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate department' }));
    /* Stated twice on purpose: in the summary above the form and on the field. */
    expect(
      await within(dialog).findAllByText(/Say why the department is being deactivated\./),
    ).not.toHaveLength(0);

    await userEvent.type(within(dialog).getByLabelText(/^Reason/), 'Folded into Operations.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deactivate department' }));

    await waitFor(() => expect(screen.getByText('Department deactivated')).toBeInTheDocument());
    expect(departmentById('dept-wcf-client-services')?.isActive).toBe(false);
    const table = await screen.findByRole('table', { name: /Departments in WesternCF/ });
    const row = within(table).getByText('Client Services').closest('tr') as HTMLElement;
    expect(within(row).getByText('Inactive')).toBeInTheDocument();
  });

  it('offers no delete for a referenced department and says what to do instead', async () => {
    renderScreen();
    await screen.findByRole('heading', { name: 'WesternCF', level: 2 });

    await openRowMenu('Operations');
    const remove = await screen.findByRole('menuitem', { name: /Delete department/ });
    expect(remove).toBeDisabled();

    await userEvent.keyboard('{Escape}');
    await openRowMenu('Operations');
    await userEvent.click(
      await screen.findByRole('menuitem', { name: /View placements and leadership/ }),
    );
    const drawer = await screen.findByRole('dialog');
    expect(
      within(drawer).getByText(/cannot be deleted or moved to another division/),
    ).toBeInTheDocument();
    expect(within(drawer).queryByRole('button', { name: 'Delete' })).toBeNull();
  });
});
