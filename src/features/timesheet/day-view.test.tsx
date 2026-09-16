import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import type { WorkLogInput } from '@/contracts/work-log';
import { mockStore } from '@/services/mock/store';
import { mockTimesheetService } from '@/services/mock/timesheet';
import { DayView } from './day-view';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const sourceInput = (): WorkLogInput => ({
  employeeId: 'emp-1001',
  workDate: '2026-09-02',
  divisionId: 'pia',
  projectId: 'prj-vp2',
  taskId: 'tsk-1',
  durationMinutes: 35,
  workLocation: 'office',
  workDescription: 'Prepared a reusable benchmark review.',
  completedWork: 'Published the source-day findings.',
  supportingLink: null,
  attachmentIds: [],
  overtimeReason: null,
  criticalExplanation: null,
  source: 'manual',
  idempotencyKey: `copy-picker-source:${crypto.randomUUID()}`,
});

beforeEach(() => {
  mockStore.reset();
});

describe('timesheet day copy-work flow', () => {
  it('shows preserved historical ranges as explicitly read-only records', async () => {
    render(
      <ToastProvider>
        <DayView employeeId="emp-1001" date="2026-09-01" />
      </ToastProvider>,
    );

    const rows = await screen.findByRole('list', { name: 'Work logs by task' });
    expect(within(rows).getAllByText('Recorded before task-based logging').length).toBeGreaterThan(0);
    expect(within(rows).getAllByText(/Original range: .*Read-only historical record/).length).toBeGreaterThan(0);
    expect(within(rows).queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument();
  });

  it('presents the day as responsive task rows with the authoritative daily summary', async () => {
    const saved = await mockTimesheetService.createWorkLog({
      ...sourceInput(),
      workDescription: 'Prepared the task-row verification sample.',
      completedWork: 'Confirmed the responsive daily layout.',
    });
    expect(saved.status).toBe('success');

    render(
      <ToastProvider>
        <DayView employeeId="emp-1001" date="2026-09-02" />
      </ToastProvider>,
    );

    expect(await screen.findByRole('heading', { name: 'Work by task' })).toBeInTheDocument();
    const rows = screen.getByRole('list', { name: 'Work logs by task' });
    const description = within(rows).getByText('Prepared the task-row verification sample.');
    const row = description.closest('li');
    expect(row).not.toBeNull();
    if (!row) return;
    expect(within(row).getByRole('link', { name: 'Model evaluation harness' })).toBeInTheDocument();
    expect(within(row).getByText('PowerInAI')).toBeInTheDocument();
    expect(within(row).getByText('0:35')).toBeInTheDocument();
    expect(within(row).getByText('Office')).toBeInTheDocument();
    expect(within(row).getByText('Confirmed the responsive daily layout.')).toBeInTheDocument();

    expect(screen.getByText('Active work')).toBeInTheDocument();
    expect(screen.getByText('Break')).toBeInTheDocument();
    expect(screen.getByText('Daily total')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    expect(screen.getByText(/Recognized break — shown once/)).toBeInTheDocument();
    expect(screen.queryByText('Start time')).not.toBeInTheDocument();
    expect(screen.queryByText('End time')).not.toBeInTheDocument();
  });

  it('opens a previous work log as an unsaved target-date draft in Log Work', async () => {
    const source = await mockTimesheetService.createWorkLog(sourceInput());
    expect(source.status).toBe('success');

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <DayView employeeId="emp-1001" date="2026-09-03" />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Copy previous' }));
    const picker = await screen.findByRole('dialog', { name: 'Copy a previous work log' });
    const sourceDescription = await within(picker).findByText(
      'Prepared a reusable benchmark review.',
    );
    await user.click(sourceDescription.closest('button')!);

    const drawer = await screen.findByRole('dialog', { name: 'Review copied work log' });
    expect(within(drawer).getByText('This is a copied draft')).toBeInTheDocument();
    expect(within(drawer).getByLabelText(/Work date/)).toHaveValue('2026-09-03');
    expect(within(drawer).getByRole('textbox', { name: /Duration/ })).toHaveValue('0:35');
    expect(within(drawer).getByRole('textbox', { name: /Completed work/ })).toHaveValue('');
    expect(screen.queryByRole('dialog', { name: 'Add time entry' })).not.toBeInTheDocument();
  });
});
