import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastProvider } from '@/components/feedback/toast';
import { toDurationView } from '@/lib/status';
import { mockStore } from '@/services/mock/store';
import {
  mockTimesheetService,
  resetTaskWorkflowState,
} from '@/services/mock/timesheet';
import {
  TaskWorkflowBoard,
  type WorkflowBoardTask,
} from './task-workflow';

function boardTask(
  overrides: Partial<WorkflowBoardTask> = {},
): WorkflowBoardTask {
  return {
    id: 'tsk-1',
    title: 'Model evaluation harness',
    href: '/tasks/tsk-1',
    project: { name: 'Vision Platform v2', code: 'PIA-VP2' },
    division: { name: 'PowerInAI', code: 'PIA' },
    assignee: { id: 'emp-1001', fullName: 'Nadia Rahman' },
    status: 'in_progress',
    estimated: toDurationView(2400),
    actual: toDurationView(120),
    variance: { minutes: -2280, label: '−38:00' },
    dueDate: '2026-09-10',
    dueDateLabel: '10 Sep 2026',
    isOverdue: false,
    reviewBlockedReason: null,
    canLogWorkWhenInProgress: true,
    ...overrides,
  };
}

function renderBoard(task: WorkflowBoardTask, onMoved = vi.fn()) {
  return {
    onMoved,
    ...render(
      <ToastProvider>
        <TaskWorkflowBoard
          tasks={[task]}
          actorRole="employee"
          onMoved={onMoved}
        />
      </ToastProvider>,
    ),
  };
}

async function settleStoreRefresh() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

async function submitTransition(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button);
    await new Promise((resolve) => setTimeout(resolve, 520));
  });
}

beforeEach(() => {
  mockStore.reset();
  resetTaskWorkflowState();
});

describe('task workflow board', () => {
  it('starts a task with an optional note and offers work logging separately', async () => {
    const user = userEvent.setup();
    renderBoard(boardTask({
      id: 'tsk-9',
      title: 'Data retention review',
      href: '/tasks/tsk-9',
      status: 'pending',
      actual: toDurationView(0),
    }));
    await screen.findAllByText('Latest note:');

    const desktopBoard = screen.getByLabelText('Task status board');
    await user.click(within(desktopBoard).getByRole('button', { name: 'Start' }));
    const dialog = await screen.findByRole('dialog', { name: 'Start task' });
    expect(within(dialog).getByLabelText('Note (optional)')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Note (optional)'), 'Reviewed the source material.');
    await submitTransition(within(dialog).getByRole('button', { name: 'Start' }));

    expect(await within(dialog).findByText(/created no active time/i)).toBeInTheDocument();
    expect(await within(dialog).findByRole('link', { name: "Log today's work" })).toHaveAttribute(
      'href',
      '/timesheets/2026-09-02?task=tsk-9',
    );
    await settleStoreRefresh();
  });

  it('opens Complete from the keyboard and keeps final work separate', async () => {
    const user = userEvent.setup();
    renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    const before = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });

    const desktopBoard = screen.getByLabelText('Task status board');
    const complete = within(desktopBoard).getByRole('button', { name: 'Complete' });
    complete.focus();
    await user.keyboard('{Enter}');

    const dialog = await screen.findByRole('dialog', { name: 'Complete task' });
    expect(within(dialog).getByLabelText('Note (optional)')).toBeInTheDocument();
    expect(await within(dialog).findByRole('link', { name: 'Log final work first' })).toHaveAttribute(
      'href',
      '/timesheets/2026-09-02?task=tsk-1',
    );
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    await screen.findByText('This transition created no active time. It is recorded separately in task history.');

    const after = await mockTimesheetService.getDay({
      employeeId: 'emp-1001',
      date: '2026-09-02',
    });
    expect(before.status).toBe('success');
    expect(after.status).toBe('success');
    if (before.status === 'success' && after.status === 'success') {
      expect(after.data.summary.active.minutes).toBe(before.data.summary.active.minutes);
      expect(after.data.summary.break.minutes).toBe(before.data.summary.break.minutes);
      expect(after.data.summary.total.minutes).toBe(before.data.summary.total.minutes);
    }
    await settleStoreRefresh();
  });

  it('requires a reason before reopening and preserves completion history', async () => {
    const user = userEvent.setup();
    renderBoard(
      boardTask({
        id: 'tsk-8',
        title: 'Benchmark report write-up',
        href: '/tasks/tsk-8',
        status: 'completed',
        canLogWorkWhenInProgress: true,
      }),
    );
    await screen.findAllByText('Latest note:');

    const desktopBoard = screen.getByLabelText('Task status board');
    await user.click(within(desktopBoard).getByRole('button', { name: 'Reopen' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reopen task' });
    await submitTransition(within(dialog).getByRole('button', { name: 'Reopen' }));
    expect(await within(dialog).findByText('Enter a reason for reopening this task.')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox'), 'More evidence is needed.');
    await submitTransition(within(dialog).getByRole('button', { name: 'Reopen' }));
    await screen.findByText('This transition created no active time. It is recorded separately in task history.');

    const history = await mockTimesheetService.getTaskHistory('tsk-8');
    expect(history.status).toBe('success');
    if (history.status !== 'success') return;
    const transitions = history.data.items.filter((item) => item.kind === 'transition');
    expect(transitions.map((item) => item.transition.toStatus)).toEqual([
      'completed',
      'in_progress',
    ]);
    await settleStoreRefresh();
  });

  it('renders a desktop board and a status-grouped mobile list from the same scoped tasks', async () => {
    const { container } = renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    expect(container.querySelector('[data-board-layout="desktop"]')).toHaveClass('md:grid');
    expect(container.querySelector('[data-board-layout="mobile"]')).toHaveClass('md:hidden');
    expect(screen.getAllByText('Model evaluation harness')).toHaveLength(2);
  });

  it('opens the same confirmation panel when a card is dragged to an allowed column', async () => {
    const { container } = renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    const card = container.querySelector<HTMLElement>('[data-board-layout="desktop"] [data-task-id="tsk-1"]');
    const completedColumn = container.querySelector<HTMLElement>('[data-status-column="completed"]');
    if (!card || !completedColumn) throw new Error('Expected task card and Completed column.');
    const dataTransfer = {
      effectAllowed: 'none',
      setData: vi.fn(),
    };

    fireEvent.dragStart(card, { dataTransfer });
    fireEvent.dragOver(completedColumn, { dataTransfer });
    fireEvent.drop(completedColumn, { dataTransfer });

    expect(await screen.findByRole('dialog', { name: 'Complete task' })).toBeInTheDocument();
  });

  it('shows scoped counts only for the tasks supplied by the authorized service', async () => {
    renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /All/ })).toHaveTextContent('1');
      expect(screen.getByRole('tab', { name: /In Progress/ })).toHaveTextContent('1');
      expect(screen.getByRole('tab', { name: 'Pending' })).not.toHaveTextContent(/\d/);
    });
  });

  it('shows the verified-period effect without preventing the status transition', async () => {
    const period = mockStore.findPeriod('per-2026-09');
    if (!period) throw new Error('September demo period is missing.');
    mockStore.updatePeriod(period.id, {
      ...period,
      status: 'verified',
      verifiedAt: '2026-09-15T09:00:00+06:00',
      verifiedBy: { userId: 'usr-3001', displayName: 'Rezaul Haque' },
    });

    const user = userEvent.setup();
    renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    const desktopBoard = screen.getByLabelText('Task status board');
    await user.click(within(desktopBoard).getByRole('button', { name: 'Complete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete task' });

    expect(await within(dialog).findByText(/requires the verified-period amendment process/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Log final work first' })).not.toBeInTheDocument();
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await within(dialog).findByText(/created no active time/i)).toBeInTheDocument();
    await settleStoreRefresh();
  });

  it('surfaces a stale-board conflict and offers a reload action', async () => {
    const user = userEvent.setup();
    renderBoard(boardTask());
    await screen.findAllByText('Latest note:');
    let moved: Awaited<ReturnType<typeof mockTimesheetService.transitionTask>> | undefined;
    await act(async () => {
      moved = await mockTimesheetService.transitionTask({
        taskId: 'tsk-1',
        fromStatus: 'in_progress',
        toStatus: 'completed',
        actorRole: 'employee',
        note: null,
        idempotencyKey: 'external-move',
      });
      await new Promise((resolve) => setTimeout(resolve, 260));
    });
    expect(moved?.status).toBe('success');

    const desktopBoard = screen.getByLabelText('Task status board');
    await user.click(within(desktopBoard).getByRole('button', { name: 'Complete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete task' });
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));

    expect(await within(dialog).findByText('The board is out of date')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Reload board' })).toBeInTheDocument();
    await settleStoreRefresh();
  });
});
