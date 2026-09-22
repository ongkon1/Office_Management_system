import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/feedback/toast';
import {
  mockMeetingMinutesService,
  resetMeetingMinutesState,
  setMeetingMinutesCreateFault,
} from '@/services/mock/meeting-minutes';
import { MeetingMinuteForm } from './meeting-minute-form';

/**
 * `FE-1113` — the Add Meeting Minute form.
 *
 * The cases here are the ones the screen owns rather than the service: which
 * options reach the two selects, that the project waits for a client, and that
 * a refusal shows no client or project at all.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), userId: 'usr-2001' }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  usePathname: () => '/meeting-minutes/new',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/features/access/session-provider', () => ({
  useSession: () => ({ user: { userId: nav.userId } }),
}));

const TEAM_LEAD = 'usr-2001'; // pia, pit, cjg
const EMPLOYEE = 'usr-1001';

function renderForm() {
  return render(
    <ToastProvider>
      <MeetingMinuteForm />
    </ToastProvider>,
  );
}

/*
 * Text goes in by paste rather than keystroke by keystroke. These tests are
 * about what the form does with a complete minute, not about typing, and
 * sixty synthetic keystrokes per test made the file slow enough to time out
 * when the whole suite runs in parallel on a busy machine. The tests that are
 * about typing — errors clearing as a field is edited — still type.
 */
async function fillValidMinute() {
  await userEvent.click(await screen.findByLabelText(/^Title/));
  await userEvent.paste('Quarterly review with Meghna Group');
  await userEvent.selectOptions(screen.getByLabelText(/^Client/), 'cli-meghna');
  await waitFor(() =>
    expect(screen.getByLabelText(/^Project/)).not.toBeDisabled(),
  );
  await userEvent.selectOptions(screen.getByLabelText(/^Project/), 'prj-vp2');
  await userEvent.click(screen.getByLabelText(/What the meeting covered/));
  await userEvent.paste('Agreed the October scope.');
}

beforeEach(() => {
  resetMeetingMinutesState();
  nav.replace.mockReset();
  nav.userId = TEAM_LEAD;
});

describe('Add Meeting Minute form (FE-1113)', () => {
  it('offers only the clients the viewer may record against', async () => {
    renderForm();
    const client = await screen.findByLabelText(/^Client/);
    expect(
      [...client.querySelectorAll('option')].map((option) => option.textContent),
    ).toEqual([
      'Choose a client',
      'Bengal Institute of Technology',
      'Meghna Group',
    ]);
    // A government client is out of this viewer's scope entirely.
    expect(document.body.textContent).not.toContain('Ministry of Public Administration');
  });

  it('waits for a client before offering a project, and offers only active ones', async () => {
    renderForm();
    const project = await screen.findByLabelText(/^Project/);
    expect(project).toBeDisabled();
    expect(screen.getByText('Choose a client first.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText(/^Client/), 'cli-meghna');
    await waitFor(() => expect(screen.getByLabelText(/^Project/)).not.toBeDisabled());
    expect(
      [...screen.getByLabelText(/^Project/).querySelectorAll('option')].map(
        (option) => option.textContent,
      ),
    ).toEqual(['Choose a project', 'Vision Platform v2 (PIA-VP2)']);
    // `prj-lsm` is the same client's inactive project.
    expect(document.body.textContent).not.toContain('Legacy Site Maintenance');
  });

  it('clears the project when the client changes, so a stale pair cannot be sent', async () => {
    renderForm();
    await userEvent.selectOptions(await screen.findByLabelText(/^Client/), 'cli-meghna');
    await waitFor(() => expect(screen.getByLabelText(/^Project/)).not.toBeDisabled());
    await userEvent.selectOptions(screen.getByLabelText(/^Project/), 'prj-vp2');

    await userEvent.selectOptions(screen.getByLabelText(/^Client/), 'cli-bit');
    await waitFor(() =>
      expect((screen.getByLabelText(/^Project/) as HTMLSelectElement).value).toBe(''),
    );
  });

  it('saves without AI and opens the new minute', async () => {
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    // `FE-1120` made the detail page real, so the redirect the information
    // architecture specifies is back.
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/meeting-minutes\/min-/)),
    );
    expect(await screen.findByText('Meeting minute saved')).toBeInTheDocument();
    // No AI was asked for, so the notice says nothing about a run. (The form
    // stays mounted here because the router is a mock.)
    expect(screen.queryByText(/Task generation is queued/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Task generation could not be started/)).not.toBeInTheDocument();
  });

  it('says task generation is queued only when Process with AI was chosen', async () => {
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('checkbox', { name: /Process with AI/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    expect(await screen.findByText(/Task generation is queued/)).toBeInTheDocument();
  });

  it('shows each field message with its corrective guidance', async () => {
    renderForm();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    const summary = await screen.findByRole('alert');
    expect(summary).toHaveTextContent('This meeting minute could not be saved');
    expect(
      (await screen.findAllByText(/Enter a title for this meeting minute\. Fill this in before saving\./))
        .length,
    ).toBeGreaterThan(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('moves focus to the field a summary entry names', async () => {
    renderForm();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await screen.findByRole('alert');

    const [summaryEntry] = await screen.findAllByRole('button', {
      name: /Enter a title for this meeting minute/,
    });
    await userEvent.click(summaryEntry);
    expect(screen.getByLabelText(/^Title/)).toHaveFocus();
  });

  it('refuses a read-only role without naming a client or project', async () => {
    nav.userId = EMPLOYEE;
    renderForm();
    expect(await screen.findByText('You cannot add meeting minutes')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Client/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Meghna|Westbridge|Bengal|Ministry/);
  });
});

/**
 * `FE-1114` — how the form presents a refusal, and what it does to keep one
 * from happening.
 */
describe('Add Meeting Minute validation (FE-1114)', () => {
  it('shows the message and its corrective guidance on the field itself', async () => {
    renderForm();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    // The service answers asynchronously; wait for its answer before reading
    // the field's wiring.
    await screen.findAllByText(/Enter a title for this meeting minute/);

    const title = screen.getByLabelText(/^Title/);
    const described = title.getAttribute('aria-describedby') ?? '';
    const wiring = described
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ');

    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(wiring).toContain('Enter a title for this meeting minute.');
    expect(wiring).toContain('Fill this in before saving.');
  });

  it('drops a field error as soon as that field is edited, leaving the others', async () => {
    renderForm();
    await screen.findByLabelText(/^Title/);
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await screen.findAllByText(/Enter a title for this meeting minute/);

    await userEvent.type(screen.getByLabelText(/^Title/), 'A');

    await waitFor(() =>
      expect(screen.queryByText(/Enter a title for this meeting minute/)).not.toBeInTheDocument(),
    );
    // The content error was not touched, so it stays.
    expect(screen.getAllByText(/Write what the meeting covered/).length).toBeGreaterThan(0);
  });

  it('clears the project and its error when the client changes', async () => {
    renderForm();
    await userEvent.selectOptions(await screen.findByLabelText(/^Client/), 'cli-meghna');
    await waitFor(() => expect(screen.getByLabelText(/^Project/)).not.toBeDisabled());
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await screen.findAllByText(/Choose the project this meeting was about/);

    await userEvent.selectOptions(screen.getByLabelText(/^Client/), 'cli-bit');

    await waitFor(() =>
      expect((screen.getByLabelText(/^Project/) as HTMLSelectElement).value).toBe(''),
    );
    expect(screen.queryByText(/Choose the project this meeting was about/)).not.toBeInTheDocument();
  });

  it('lets an over-length title be typed and says how far over it is', async () => {
    renderForm();
    const title = await screen.findByLabelText(/^Title/);
    // Not capped by the control: a silently truncated paste is worse than an
    // error that says what to do.
    expect(title).not.toHaveAttribute('maxlength');

    await userEvent.click(title);
    await userEvent.paste('x'.repeat(205));

    expect((title as HTMLInputElement).value).toHaveLength(205);
    expect(await screen.findByText(/5 characters over the limit\. Shorten it and save again\./)).toBeInTheDocument();
  });

  it('states an over-long minute in words, not only in colour', async () => {
    renderForm();
    const content = await screen.findByLabelText(/What the meeting covered/);
    expect(content).not.toHaveAttribute('maxlength');

    await userEvent.click(content);
    await userEvent.paste('y'.repeat(50_010));

    expect(await screen.findByText(/10 over the limit/)).toBeInTheDocument();
    expect(
      screen.getAllByText(/The minute is over the character limit\. Shorten it and save again\./).length,
    ).toBeGreaterThan(0);
  });

  it('sends a single failure to its own field and several to the summary', async () => {
    renderForm();
    await fillValidMinute();

    // One bad field: focus lands on the control, not on a one-item summary.
    await userEvent.clear(screen.getByLabelText(/^Title/));
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await waitFor(() => expect(screen.getByLabelText(/^Title/)).toHaveFocus());

    // Several: the summary takes focus and lists each one.
    await userEvent.clear(screen.getByLabelText(/What the meeting covered/));
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    const summary = await screen.findByRole('alert');
    await waitFor(() => expect(summary).toHaveFocus());
    expect(within(summary).getAllByRole('button')).toHaveLength(2);
  });
});


/**
 * `FE-1115` — what Save communicates. The minute is stored first, and the AI
 * run is reported after it, never as a condition of it.
 */
describe('Add Meeting Minute save outcome (FE-1115)', () => {
  afterEach(() => {
    setMeetingMinutesCreateFault(null);
  });

  it('reports the save, whatever happened to AI', async () => {
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    expect(await screen.findByText('Meeting minute saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/meeting-minutes\/min-/)),
    );
  });

  it('says a queued run is queued, and that the minute is saved either way', async () => {
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('checkbox', { name: /Process with AI/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    expect(
      await screen.findByText('Task generation is queued. The minute is saved either way.'),
    ).toBeInTheDocument();
  });

  it('says the minute is saved even when the run could not be started', async () => {
    setMeetingMinutesCreateFault('queue');
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('checkbox', { name: /Process with AI/ }));
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    // The save succeeded, so this must not read as a failed save. The minute's
    // own page carries the safe error and the retry (`FE-1125`).
    expect(await screen.findByText('Meeting minute saved')).toBeInTheDocument();
    expect(
      screen.getByText('Task generation could not be started. The minute is saved.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(expect.stringMatching(/^\/meeting-minutes\/min-/)),
    );
  });

  it('keeps the user on the form, with their input, when the save fails', async () => {
    setMeetingMinutesCreateFault('error');
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));

    expect(await screen.findByText(/The meeting minute could not be saved/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Meeting minute saved' })).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^Title/) as HTMLInputElement).value).toBe(
      'Quarterly review with Meghna Group',
    );
  });

  it('reuses one idempotency key across a retry, so a lost answer cannot double-save', async () => {
    const create = vi.spyOn(mockMeetingMinutesService, 'create');
    setMeetingMinutesCreateFault('error');
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await screen.findByText(/The meeting minute could not be saved/);

    setMeetingMinutesCreateFault(null);
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    const keys = create.mock.calls.map(([, input]) => input.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    create.mockRestore();
  });

  it('takes a fresh key once the content changes', async () => {
    const create = vi.spyOn(mockMeetingMinutesService, 'create');
    renderForm();
    await fillValidMinute();
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    // Editing after a save is a different minute, so it may not reuse the key.
    await userEvent.type(screen.getByLabelText(/^Title/), ' again');
    await userEvent.click(screen.getByRole('button', { name: /Save meeting minute/ }));
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));

    const keys = create.mock.calls.map(([, input]) => input.idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    create.mockRestore();
  });

  it('ignores a second click while the first save is in flight', async () => {
    const create = vi.spyOn(mockMeetingMinutesService, 'create');
    renderForm();
    await fillValidMinute();

    const save = screen.getByRole('button', { name: /Save meeting minute/ });
    await userEvent.click(save);
    await userEvent.click(save);
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());

    expect(create).toHaveBeenCalledTimes(1);
    create.mockRestore();
  });

});
