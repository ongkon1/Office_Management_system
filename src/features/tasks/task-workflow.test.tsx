import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/lib/business-date', () => ({ businessToday: () => '2026-09-02' }));

import { ToastProvider } from '@/components/feedback/toast';
import type { RoleKey } from '@/contracts/domain';
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
    version: 1,
    title: 'Model evaluation harness',
    href: '/tasks/tsk-1',
    project: { name: 'Vision Platform v2', code: 'PIA-VP2' },
    division: { name: 'PowerInAI', code: 'PIA' },
    assignee: { id: 'emp-1001', fullName: 'Nadia Rahman' },
    status: 'in_progress',
    reviewState: 'approved',
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

function renderBoard(
  task: WorkflowBoardTask,
  onMoved = vi.fn(),
  viewerEmployeeId: string | null = null,
  actorRole: RoleKey = 'employee',
) {
  return {
    onMoved,
    ...render(
      <ToastProvider>
        <TaskWorkflowBoard
          tasks={[task]}
          actorRole={actorRole}
          viewerUserId="usr-test"
          viewerEmployeeId={viewerEmployeeId}
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
      expect(screen.getByRole('tab', { name: /Workflow board/ })).toHaveTextContent('1');
      expect(screen.getByRole('tab', { name: 'Rejected' })).not.toHaveTextContent(/\d/);
      const board = screen.getByLabelText('Task status board');
      expect(within(board).getAllByLabelText('0 tasks')).toHaveLength(2);
      expect(within(board).getByLabelText('1 tasks')).toBeInTheDocument();
    });
  });

  it('keeps rejected work out of Pending and exposes reopen only to Team Leads', async () => {
    const rejected = boardTask({
      status: 'pending',
      reviewState: 'rejected',
      reviewBlockedReason: 'Your Team Lead did not approve this task.',
    });
    const employeeUser = userEvent.setup();
    const employeeView = renderBoard(rejected);
    expect(screen.getByRole('tab', { name: /Rejected/ })).toHaveTextContent('1');
    expect(screen.queryByLabelText('Task status board')).toBeInTheDocument();
    await employeeUser.click(screen.getByRole('tab', { name: /Rejected/ }));
    await screen.findAllByText('Latest note:');
    const rejectedCard = screen.getByRole('article');
    expect(within(rejectedCard).getByText('Rejected')).toBeInTheDocument();
    expect(within(rejectedCard).queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reopen review' })).not.toBeInTheDocument();
    employeeView.unmount();

    const user = userEvent.setup();
    renderBoard(rejected, vi.fn(), null, 'team_lead');
    await user.click(screen.getByRole('tab', { name: /Rejected/ }));
    await user.click(await screen.findByRole('button', { name: 'Reopen review' }));
    const dialog = await screen.findByRole('dialog', { name: 'Reopen task review' });
    await user.click(within(dialog).getByRole('button', { name: 'Reopen review' }));
    expect(await within(dialog).findByText('Enter a reason for reopening review.')).toBeInTheDocument();
  });

  it('prevents an owned task completion when today is in a verified period', async () => {
    const period = mockStore.findPeriod('per-2026-09');
    if (!period) throw new Error('September demo period is missing.');
    mockStore.updatePeriod(period.id, {
      ...period,
      status: 'verified',
      verifiedAt: '2026-09-15T09:00:00+06:00',
      verifiedBy: { userId: 'usr-3001', displayName: 'Rezaul Haque' },
    });

    const user = userEvent.setup();
    renderBoard(boardTask({
      project: { id: 'prj-vp2', name: 'Vision Platform v2', code: 'PIA-VP2' },
      division: { id: 'pia', name: 'PowerInAI', code: 'PIA' },
    }), vi.fn(), 'emp-1001');
    await screen.findAllByText('Latest note:');
    const desktopBoard = screen.getByLabelText('Task status board');
    await user.click(within(desktopBoard).getByRole('button', { name: 'Complete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete task' });

    expect(await within(dialog).findByText(/request a verified-period amendment/i)).toBeInTheDocument();
    expect(within(dialog).queryByRole('link', { name: 'Log final work first' })).not.toBeInTheDocument();
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await within(dialog).findByText(/today is in a verified period/i)).toBeInTheDocument();
    expect(within(dialog).queryByText(/task status updated/i)).not.toBeInTheDocument();
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
        expectedVersion: 1,
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

describe('completing a task can log its final work', () => {
  const owned = () => boardTask({
    project: { id: 'prj-vp2', name: 'Vision Platform v2', code: 'PIA-VP2' },
    division: { id: 'pia', name: 'PowerInAI', code: 'PIA' },
  });
  const activeToday = async () => {
    const day = await mockTimesheetService.getDay({ employeeId: 'emp-1001', date: '2026-09-02' });
    if (day.status !== 'success') throw new Error('day');
    return day.data.summary.active.minutes;
  };
  async function openComplete() {
    const user = userEvent.setup();
    renderBoard(owned(), vi.fn(), 'emp-1001');
    await screen.findAllByText('Latest note:');
    await user.click(within(screen.getByLabelText('Task status board')).getByRole('button', { name: 'Complete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Complete task' });
    return { user, dialog, field: await within(dialog).findByLabelText(/Time spent today/) };
  }

  it('saves the time as a work log for today, then completes the task', async () => {
    const before = await activeToday();
    const { user, dialog, field } = await openComplete();
    await user.type(field, '1:30');
    await user.tab();
    await user.type(within(dialog).getByLabelText(/What you finished/), 'Benchmark results written up');
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    await screen.findByText('1:30 was saved as a work log for today; the status change itself added no time.');
    expect(await activeToday()).toBe(before + 90);
    const history = await mockTimesheetService.getTaskHistory('tsk-1');
    if (history.status !== 'success') throw new Error('history');
    expect(history.data.items.filter((item) => item.kind === 'transition').map((item) => item.transition.toStatus)).toContain('completed');
    await settleStoreRefresh();
  });

  it('requires actual time before completing an owned task', async () => {
    const before = await activeToday();
    const { dialog } = await openComplete();
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await within(dialog).findByText('Actual time is required to complete your task.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/task status updated/i)).not.toBeInTheDocument();
    expect(await activeToday()).toBe(before);
    await settleStoreRefresh();
  });

  it('asks what was finished before logging, and logs nothing until it is given', async () => {
    const before = await activeToday();
    const { user, dialog, field } = await openComplete();
    await user.type(field, '0:45');
    await user.tab();
    await submitTransition(within(dialog).getByRole('button', { name: 'Complete' }));
    expect(await within(dialog).findByText('Describe the work you finished today.')).toBeInTheDocument();
    expect(await activeToday()).toBe(before);
    await settleStoreRefresh();
  });
});
