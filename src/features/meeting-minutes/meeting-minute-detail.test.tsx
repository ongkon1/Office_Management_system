import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
} from '@/services/mock/meeting-minutes';
import { MeetingMinuteDetail } from './meeting-minute-detail';

/**
 * `FE-1120` — the minute's detail page.
 *
 * Seed: `min-1001` is Imran's processed pia minute, `min-1002` is Rezaul's
 * not-processed pit minute, `min-1003` is on a government project, `min-1004`
 * failed and is retryable, `min-1006` is archived.
 */

const nav = vi.hoisted(() => ({ userId: 'usr-2001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/meeting-minutes/min-1001',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const TEAM_LEAD = 'usr-2001';
const HR = 'usr-3001';
const EMPLOYEE = 'usr-1001';
const ADMIN = 'usr-9001';

function renderDetail(minuteId = 'min-1001') {
  return render(<MeetingMinuteDetail minuteId={minuteId} />);
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.userId = TEAM_LEAD;
});

describe('Meeting minute detail (FE-1120)', () => {
  it('shows the minute, its context and its processing facts', async () => {
    renderDetail();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Vision Platform v2 sprint review' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Meghna Group')).toBeInTheDocument();
    expect(screen.getByText('Vision Platform v2')).toBeInTheDocument();
    expect(screen.getByText('Imran Hossain')).toBeInTheDocument();

    // The AI choice and the outcome are separate facts.
    expect(screen.getByText('AI requested')).toBeInTheDocument();
    expect(screen.getByText('Yes')).toBeInTheDocument();
    expect(screen.getAllByText('Processed').length).toBeGreaterThan(0);
  });

  it('renders the stored content as markup, not as escaped text', async () => {
    renderDetail();
    const paragraph = await screen.findByText(/Reviewed sprint 14 with Meghna Group/);
    // The service sanitized it; the page renders what it was given.
    expect(paragraph.tagName).toBe('P');
    expect(document.body.textContent).not.toContain('<p>');
  });

  it('announces that it is loading before the service answers', async () => {
    renderDetail();
    expect(screen.getByRole('status')).toHaveTextContent('Loading the meeting minute');
    await screen.findByRole('heading', { level: 1, name: 'Vision Platform v2 sprint review' });
  });

  it('writes a missing processed time as an em dash, never as a blank or a zero', async () => {
    renderDetail('min-1002'); // never processed
    expect(await screen.findByText('Processed')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('shows the safe processing error, and no provider detail, for a failed run', async () => {
    nav.userId = HR; // `min-1004` is Rezaul's
    renderDetail('min-1004');
    expect(
      await screen.findByText(/The AI service took too long to respond\. Your meeting minute was saved\./),
    ).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/provider|timeout_ms|stack/i);
  });

  it('says what archiving kept, and still shows the minute', async () => {
    renderDetail('min-1006');
    expect(await screen.findByRole('heading', { level: 1, name: 'Legacy site handover' })).toBeInTheDocument();
    expect(screen.getByText(/kept exactly as it was/)).toBeInTheDocument();
    expect(screen.getByText(/Handed the legacy site over/)).toBeInTheDocument();
  });

  it.each([
    ['its creator', TEAM_LEAD, 'min-1001', true],
    ['the Super Administrator', ADMIN, 'min-1001', true],
    ['an Employee', EMPLOYEE, 'min-1001', false],
    ['another creator', HR, 'min-1001', false],
  ])('offers Edit to %s: %s', async (_label, userId, minuteId, expected) => {
    nav.userId = userId;
    renderDetail(minuteId);
    // The loading state has an `h1` too, so wait for the minute's own title.
    await screen.findByRole('heading', { level: 1, name: 'Vision Platform v2 sprint review' });

    const edit = screen.queryByRole('link', { name: 'Edit' });
    expect(Boolean(edit)).toBe(expected);
    if (edit) expect(edit).toHaveAttribute('href', `/meeting-minutes/${minuteId}/edit`);
  });

  it('answers an out-of-scope minute exactly as a nonexistent one', async () => {
    nav.userId = HR; // no government-project permission
    const { unmount } = renderDetail('min-1003');
    await screen.findByText('That meeting minute could not be found');
    const hidden = document.body.textContent;
    unmount();

    renderDetail('min-nope');
    await screen.findByText('That meeting minute could not be found');
    expect(document.body.textContent).toBe(hidden);
  });

  it('leaks nothing about a minute it will not show', async () => {
    nav.userId = HR;
    renderDetail('min-1003');
    await screen.findByText('That meeting minute could not be found');

    expect(document.body.textContent).not.toMatch(
      /Records digitisation|Ministry|National Records|Arif/,
    );
    // The heading stays generic, so no title reaches it either.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Meeting minute');
  });

  it('recovers from a failed load', async () => {
    const get = vi
      .spyOn(mockMeetingMinutesService, 'get')
      .mockResolvedValueOnce({
        status: 'error',
        code: 'DEPENDENCY_FAILED',
        message: 'Temporarily unavailable.',
        reference: 'MM-TEST-503',
        retryable: true,
      });

    renderDetail();
    expect(await screen.findByText('The meeting minute could not be loaded')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { level: 1, name: 'Vision Platform v2 sprint review' }),
      ).toBeInTheDocument(),
    );
    get.mockRestore();
  });
});
