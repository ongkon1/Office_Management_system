import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MinuteProcessingStatus } from '@/contracts/meeting-minutes';
import { ProcessingStatusAnnouncer } from './processing-status-announcer';

/**
 * `FE-1121` — what the live region says, and when it says nothing.
 *
 * Every case drives the component the way a page would: by re-rendering it
 * with whatever the service most recently returned.
 */

function region() {
  return screen.getByRole('status');
}

function renderAnnouncer(
  recordId: string,
  status: MinuteProcessingStatus | null,
  subject?: string,
) {
  const view = render(
    <ProcessingStatusAnnouncer recordId={recordId} status={status} subject={subject} />,
  );
  return {
    ...view,
    update(nextId: string, next: MinuteProcessingStatus | null, nextSubject = subject) {
      view.rerender(
        <ProcessingStatusAnnouncer recordId={nextId} status={next} subject={nextSubject} />,
      );
    },
  };
}

describe('ProcessingStatusAnnouncer (FE-1121)', () => {
  it('is a polite, atomic live region that exists before it has anything to say', () => {
    renderAnnouncer('min-1', 'pending');
    expect(region()).toHaveAttribute('aria-live', 'polite');
    expect(region()).toHaveAttribute('aria-atomic', 'true');
    expect(region()).toHaveTextContent('');
  });

  it('says nothing on first sight of a record, because the badge already shows it', () => {
    for (const status of ['not_processed', 'pending', 'processing', 'processed', 'failed'] as const) {
      const view = renderAnnouncer('min-1', status);
      expect(region()).toHaveTextContent('');
      view.unmount();
    }
  });

  it.each([
    ['pending', 'processing', 'Task generation has started.'],
    ['processing', 'processed', 'Task generation has finished.'],
    ['processing', 'failed', 'Task generation failed. Your meeting minute is saved.'],
    ['failed', 'pending', 'Task generation is queued.'],
    ['not_processed', 'pending', 'Task generation is queued.'],
  ] as const)('announces %s → %s', (from, to, expected) => {
    const view = renderAnnouncer('min-1', from);
    view.update('min-1', to);
    expect(region()).toHaveTextContent(expected);
  });

  it('says nothing when the status is unchanged', () => {
    const view = renderAnnouncer('min-1', 'pending');
    view.update('min-1', 'processing');
    expect(region()).toHaveTextContent('Task generation has started.');

    // A later refresh returning the same status is not news.
    view.update('min-1', 'processing');
    expect(region()).toHaveTextContent('Task generation has started.');
  });

  it('treats a different record as navigation, not a change', () => {
    const view = renderAnnouncer('min-1', 'pending');
    view.update('min-2', 'failed');
    expect(region()).toHaveTextContent('');
  });

  it('holds the last known status through a reload, and announces the change it lands on', () => {
    const view = renderAnnouncer('min-1', 'pending');
    // Reloading: the page does not know the status for a moment.
    view.update('min-1', null);
    expect(region()).toHaveTextContent('');
    // It comes back changed, which is a real change, not first sight.
    view.update('min-1', 'processed');
    expect(region()).toHaveTextContent('Task generation has finished.');
  });

  it('says nothing when a reload comes back unchanged', () => {
    const view = renderAnnouncer('min-1', 'pending');
    view.update('min-1', null);
    view.update('min-1', 'pending');
    expect(region()).toHaveTextContent('');
  });

  it('starts silent when the first render is still loading', () => {
    const view = renderAnnouncer('min-1', null);
    view.update('min-1', 'processing');
    // The first status it ever learns is first sight, not a change.
    expect(region()).toHaveTextContent('');
  });

  it('names the record when a subject is given, for pages with more than one', () => {
    const view = renderAnnouncer('min-1', 'processing', 'Sprint review');
    view.update('min-1', 'failed');
    expect(region()).toHaveTextContent(
      'Sprint review: Task generation failed. Your meeting minute is saved.',
    );
  });

  it('clears an old announcement when the record changes, so it is not re-read', () => {
    const view = renderAnnouncer('min-1', 'pending');
    view.update('min-1', 'processing');
    expect(region()).toHaveTextContent('Task generation has started.');
    view.update('min-2', 'processing');
    expect(region()).toHaveTextContent('');
  });
});
