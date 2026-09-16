import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { ToastProvider } from '@/components/feedback/toast';
import { mockStore } from '@/services/mock/store';
import { mockTimesheetService, resetTaskWorkflowState } from '@/services/mock/timesheet';
import { WorkLogDrawer } from './work-log-drawer';

function renderDrawer(overrides: Partial<ComponentProps<typeof WorkLogDrawer>> = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  render(
    <ToastProvider>
      <WorkLogDrawer
        open
        onClose={onClose}
        employeeId="emp-1001"
        defaultWorkDate="2026-09-02"
        initialTaskId="tsk-1"
        onSaved={onSaved}
        {...overrides}
      />
    </ToastProvider>,
  );
  return { onClose, onSaved };
}

beforeEach(() => {
  mockStore.reset();
  resetTaskWorkflowState();
});

describe('Log Work form', () => {
  it('shows the complete duration-only form with an eligible task preselected', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Log work' });

    expect(within(dialog).getByLabelText(/Work date/)).toHaveValue('2026-09-02');
    expect(within(dialog).getByRole('textbox', { name: /Duration/ })).toHaveAttribute('placeholder', '0:00');
    expect(within(dialog).getByRole('combobox', { name: /Division/ })).toHaveValue('pia');
    expect(within(dialog).getByRole('combobox', { name: /Project/ })).toHaveValue('prj-vp2');
    expect(within(dialog).getByRole('combobox', { name: /Task/ })).toHaveValue('tsk-1');
    expect(within(dialog).getByRole('combobox', { name: /Task/ })).not.toHaveTextContent('Inference latency profiling');
    expect(within(dialog).getByLabelText('Attach supporting files (optional)')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Start time|End time/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/timer/i)).not.toBeInTheDocument();
  });

  it('clearly identifies a copied draft and requires review before it is saved', async () => {
    renderDrawer({
      initialTaskId: undefined,
      copiedDraft: {
        sourceWorkDate: '2026-09-01',
        input: {
          employeeId: 'emp-1001',
          workDate: '2026-09-02',
          divisionId: 'pia',
          projectId: 'prj-vp2',
          taskId: 'tsk-1',
          durationMinutes: 45,
          workLocation: 'office',
          workDescription: 'Reviewed benchmark output.',
          completedWork: '',
          supportingLink: null,
          attachmentIds: [],
          overtimeReason: null,
          criticalExplanation: null,
          source: 'manual',
        },
      },
    });
    const dialog = screen.getByRole('dialog', { name: 'Review copied work log' });

    expect(within(dialog).getByText('This is a copied draft')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Work date/)).toHaveValue('2026-09-02');
    expect(within(dialog).getByRole('textbox', { name: /Duration/ })).toHaveValue('0:45');
    expect(within(dialog).getByRole('textbox', { name: /Work description/ })).toHaveValue('Reviewed benchmark output.');
    expect(within(dialog).getByRole('textbox', { name: /Completed work/ })).toHaveValue('');

    await act(async () => {
      fireEvent.submit(within(dialog).getByRole('form', { name: 'Log work form' }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect((await within(dialog).findAllByText(/Describe the outcome/)).length).toBeGreaterThan(0);
  });

  it('saves active minutes immediately as a duration work log rather than a draft', async () => {
    const user = userEvent.setup();
    const { onClose, onSaved } = renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Log work' });
    const beforeCount = mockStore.entriesForTask('tsk-1').length;

    await user.type(within(dialog).getByRole('textbox', { name: /Duration/ }), '1:30');
    await user.tab();
    await user.type(within(dialog).getByRole('textbox', { name: /Work description/ }), 'Reviewed model output and investigated failures.');
    await user.type(within(dialog).getByRole('textbox', { name: /Completed work/ }), 'Documented the failed cases and proposed fixes.');

    await act(async () => {
      fireEvent.submit(within(dialog).getByRole('form', { name: 'Log work form' }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    const entries = mockStore.entriesForTask('tsk-1');
    expect(entries).toHaveLength(beforeCount + 1);
    const saved = entries.find((entry) => entry.id.startsWith('wl-'));
    expect(saved).toMatchObject({
      activeMinutes: 90,
      startTime: null,
      endTime: null,
      state: 'saved',
      taskId: 'tsk-1',
    });
  });

  it('edits a saved work log through the same drawer and requires an audit reason', async () => {
    const created = await mockTimesheetService.createWorkLog({
      employeeId: 'emp-1001',
      workDate: '2026-09-02',
      divisionId: 'pia',
      projectId: 'prj-vp2',
      taskId: 'tsk-1',
      durationMinutes: 30,
      workLocation: 'office',
      workDescription: 'Reviewed benchmark output.',
      completedWork: 'Recorded the confirmed findings.',
      supportingLink: null,
      attachmentIds: [],
      overtimeReason: null,
      criticalExplanation: null,
      source: 'manual',
      idempotencyKey: `drawer-edit-${Math.random()}`,
    });
    expect(created.status).toBe('success');
    if (created.status !== 'success') return;

    const user = userEvent.setup();
    const { onClose, onSaved } = renderDrawer({
      initialTaskId: undefined,
      editingWorkLog: created.data,
    });
    const dialog = screen.getByRole('dialog', { name: 'Edit work log' });
    expect(within(dialog).getByText('Every correction is audited')).toBeInTheDocument();
    expect(await within(dialog).findByText(/original saved version/i)).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole('textbox', { name: /Reason for change/ }),
      'Corrected after reviewing my notes.',
    );
    await user.clear(within(dialog).getByRole('textbox', { name: /Completed work/ }));
    await user.type(
      within(dialog).getByRole('textbox', { name: /Completed work/ }),
      'Recorded and verified the confirmed findings.',
    );
    await act(async () => {
      fireEvent.submit(within(dialog).getByRole('form', { name: 'Edit work log form' }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    expect(onSaved).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
    const history = await mockTimesheetService.getWorkLogHistory(created.data.id);
    expect(history.status).toBe('success');
    if (history.status === 'success') {
      expect(history.data[0]?.reason).toBe('Corrected after reviewing my notes.');
      expect(history.data[0]?.before.completedWork).toBe('Recorded the confirmed findings.');
      expect(history.data[0]?.after.completedWork).toBe('Recorded and verified the confirmed findings.');
    }
  });

  it('shows the live projected day totals and status from the shared engine', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Log work' });
    const preview = within(dialog).getByRole('region', {
      name: 'Daily calculation preview',
    });

    expect(within(preview).getByText(/Enter a duration/)).toBeInTheDocument();

    await user.type(within(dialog).getByRole('textbox', { name: /Duration/ }), '5:00');
    await user.tab();

    expect(await within(preview).findByText('Complete')).toBeInTheDocument();
    expect(within(preview).getByText('Task on this date').nextElementSibling).toHaveTextContent('7:00');
    expect(within(preview).getByText('Active').nextElementSibling).toHaveTextContent('7:00');
    expect(within(preview).getByText('Break').nextElementSibling).toHaveTextContent('1:00');
    expect(within(preview).getByText('Total').nextElementSibling).toHaveTextContent('8:00');
    expect(within(preview).getByText('Remaining').nextElementSibling).toHaveTextContent('0:00');
  });

  it('reveals overtime and critical explanations from the projected thresholds', async () => {
    const user = userEvent.setup();
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Log work' });
    const duration = within(dialog).getByRole('textbox', { name: /Duration/ });

    await user.type(duration, '6:00');
    await user.tab();
    expect(await within(dialog).findByLabelText(/Overtime reason/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/Critical-time explanation/)).not.toBeInTheDocument();

    await user.clear(duration);
    await user.type(duration, '10:01');
    await user.tab();
    expect(await within(dialog).findByLabelText(/Critical-time explanation/)).toBeInTheDocument();
    expect(within(dialog).getByText(/notify your Team Lead and HR/)).toBeInTheDocument();
  });

  it('returns field-level corrective guidance when required work details are missing', async () => {
    renderDrawer({ initialTaskId: undefined });
    const dialog = screen.getByRole('dialog', { name: 'Log work' });

    await act(async () => {
      fireEvent.submit(within(dialog).getByRole('form', { name: 'Log work form' }));
      await new Promise((resolve) => setTimeout(resolve, 260));
    });

    expect((await within(dialog).findAllByText(/Enter the active duration as H:MM/)).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Describe what you worked on/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/Describe the outcome, not only the activity/).length).toBeGreaterThan(0);
  });
});
