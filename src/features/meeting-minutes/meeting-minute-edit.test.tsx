import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
} from '@/services/mock/meeting-minutes';
import { MeetingMinuteEdit } from './meeting-minute-edit';

/**
 * `FE-1116` — Edit and Archive.
 *
 * Seed: `min-1001` is Imran's (Team Lead, processed), `min-1002` is Rezaul's,
 * `min-1003` is on a government project, `min-1006` is archived.
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), userId: 'usr-2001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => '/meeting-minutes/min-1001/edit',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const TEAM_LEAD = 'usr-2001';
const HR = 'usr-3001';
const EMPLOYEE = 'usr-1001';

function renderEdit(minuteId = 'min-1001') {
  return render(
    <ToastProvider>
      <MeetingMinuteEdit minuteId={minuteId} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.push.mockReset();
  nav.userId = TEAM_LEAD;
});

describe('Edit Meeting Minute (FE-1116)', () => {
  it('opens with the stored values, as editable text', async () => {
    renderEdit();
    const title = (await screen.findByLabelText(/^Title/)) as HTMLInputElement;
    expect(title.value).toBe('Vision Platform v2 sprint review');
    expect((screen.getByLabelText(/^Client/) as HTMLSelectElement).value).toBe('cli-meghna');
    expect((screen.getByLabelText(/^Project/) as HTMLSelectElement).value).toBe('prj-vp2');

    const content = screen.getByLabelText(/What the meeting covered/) as HTMLTextAreaElement;
    expect(content.value).toContain('Reviewed sprint 14');
    expect(content.value).not.toContain('<p>');
  });

  it('saves a change and returns to the minute', async () => {
    renderEdit();
    const title = await screen.findByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'Sprint 14 review, corrected');
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/meeting-minutes/min-1001'));
    expect(await screen.findByText('Meeting minute updated')).toBeInTheDocument();
  });

  it('keeps the typed text on screen when the version moved on', async () => {
    renderEdit();
    const title = await screen.findByLabelText(/^Title/);
    await userEvent.clear(title);
    await userEvent.type(title, 'My edit');

    // Someone else saves first.
    await mockMeetingMinutesService.update(TEAM_LEAD, {
      title: 'Their edit',
      clientId: 'cli-meghna',
      projectId: 'prj-vp2',
      content: 'Their text',
      minuteId: 'min-1001',
      expectedVersion: 2,
    });

    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));

    expect(await screen.findByText(/changed while you were editing it/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload the minute' })).toBeInTheDocument();
    // Their words are not thrown away by the refusal.
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('My edit');
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('reloads to the current version on request', async () => {
    renderEdit();
    await screen.findByLabelText(/^Title/);
    await mockMeetingMinutesService.update(TEAM_LEAD, {
      title: 'Their edit',
      clientId: 'cli-meghna',
      projectId: 'prj-vp2',
      content: 'Their text',
      minuteId: 'min-1001',
      expectedVersion: 2,
    });
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }));
    await screen.findByText(/changed while you were editing it/);

    await userEvent.click(screen.getByRole('button', { name: 'Reload the minute' }));

    await waitFor(() =>
      expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe('Their edit'),
    );
    expect(screen.queryByText(/changed while you were editing it/)).not.toBeInTheDocument();
  });

  it.each([
    ["someone else's minute", TEAM_LEAD, 'min-1002', 'You cannot change this meeting minute'],
    ['a minute outside the viewer scope', HR, 'min-1003', 'That meeting minute could not be found'],
    ['a nonexistent minute', HR, 'min-nope', 'That meeting minute could not be found'],
    ['an archived minute', TEAM_LEAD, 'min-1006', 'This meeting minute is archived'],
  ])('refuses %s', async (_label, userId, minuteId, message) => {
    nav.userId = userId;
    renderEdit(minuteId);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Save changes/ })).not.toBeInTheDocument();
  });

  it('answers a hidden minute exactly as a nonexistent one', async () => {
    nav.userId = HR;
    const { unmount } = renderEdit('min-1003');
    const hidden = (await screen.findByText('That meeting minute could not be found')).parentElement
      ?.textContent;
    unmount();

    renderEdit('min-nope');
    const missing = (await screen.findByText('That meeting minute could not be found')).parentElement
      ?.textContent;
    expect(hidden).toBe(missing);
  });

  it('shows an Employee nothing to change', async () => {
    nav.userId = EMPLOYEE;
    renderEdit();
    expect(await screen.findByText('You cannot change this meeting minute')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
  });
});

describe('Archive from the edit screen (FE-1116)', () => {
  it('says what archiving keeps before asking', async () => {
    renderEdit();
    await screen.findByLabelText(/^Title/);

    expect(screen.getByText(/Archiving keeps this minute and everything linked to it/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is deleted\./)).toBeInTheDocument();
  });

  it('confirms, archives, and returns to the list', async () => {
    renderEdit();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: 'Archive this minute' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Archive this meeting minute?');
    expect(dialog).toHaveTextContent(/processing history and any generated tasks/);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Archive minute' }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/meeting-minutes'));
    expect(await screen.findByText('Meeting minute archived')).toBeInTheDocument();
  });

  it('returns focus to the trigger when the confirmation is dismissed', async () => {
    renderEdit();
    await screen.findByLabelText(/^Title/);
    const trigger = screen.getByRole('button', { name: 'Archive this minute' });
    await userEvent.click(trigger);
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Keep it active' }));

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('archives nothing when the confirmation is cancelled', async () => {
    const archive = vi.spyOn(mockMeetingMinutesService, 'archive');
    renderEdit();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: 'Archive this minute' }));
    await screen.findByRole('dialog');
    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(archive).not.toHaveBeenCalled();
    archive.mockRestore();
  });

  it('reuses one key so a repeated archive cannot conflict with itself', async () => {
    const archive = vi.spyOn(mockMeetingMinutesService, 'archive');
    renderEdit();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: 'Archive this minute' }));
    const dialog = await screen.findByRole('dialog');

    const confirm = within(dialog).getByRole('button', { name: 'Archive minute' });
    await userEvent.click(confirm);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/meeting-minutes'));

    expect(archive).toHaveBeenCalledTimes(1);
    archive.mockRestore();
  });
});
