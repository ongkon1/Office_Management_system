import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DayStatus } from '@/contracts/domain';
import type { MinuteProcessingStatus } from '@/contracts/meeting-minutes';
import { MINUTE_PROCESSING_STATUSES } from '@/contracts/meeting-minutes';
import { describeMinuteProcessingStatus } from '@/lib/status';
import { ProcessingStatusIndicator, StatusIndicator } from './status-indicator';

const ALL_STATUSES: readonly DayStatus[] = [
  'missing',
  'under_time',
  'complete',
  'overtime',
  'critical',
];

describe('StatusIndicator', () => {
  it('renders a visible text label for every status, not colour alone', () => {
    const expected: Record<DayStatus, string> = {
      missing: 'Missing',
      under_time: 'Under-time',
      complete: 'Complete',
      overtime: 'Overtime',
      critical: 'Critical',
    };

    for (const status of ALL_STATUSES) {
      const { unmount } = render(<StatusIndicator status={status} />);
      expect(screen.getByText(expected[status])).toBeInTheDocument();
      unmount();
    }
  });

  it('exposes a fuller description to assistive technology', () => {
    render(<StatusIndicator status="critical" />);
    expect(screen.getByText('Critical: above twelve hours')).toBeInTheDocument();
  });

  it('keeps the accessible label in the dot variant, where no text is shown', () => {
    render(<StatusIndicator status="missing" variant="dot" />);
    expect(screen.queryByText('Missing')).not.toBeInTheDocument();
    expect(screen.getByText('Missing timesheet')).toBeInTheDocument();
  });

  it('renders a distinct icon per status so shape carries meaning too', () => {
    const shapes = new Set<string>();
    for (const status of ALL_STATUSES) {
      const { container, unmount } = render(<StatusIndicator status={status} />);
      const icon = container.querySelector('svg');
      expect(icon).not.toBeNull();
      shapes.add(icon?.getAttribute('class') ?? '');
      unmount();
    }
    // Icons differ by lucide class name; all five must be distinguishable.
    expect(shapes.size).toBe(ALL_STATUSES.length);
  });
});

/**
 * `FE-1121` — the five processing states, each carried by text, shape and
 * colour so that no state depends on colour alone.
 */
describe('ProcessingStatusIndicator', () => {
  const PROCESSING: readonly MinuteProcessingStatus[] = MINUTE_PROCESSING_STATUSES;

  it.each(PROCESSING.map((status) => [status]))('renders %s with visible text and an icon', (status) => {
    const descriptor = describeMinuteProcessingStatus(status);
    const { container } = render(<ProcessingStatusIndicator status={status} />);

    expect(screen.getByText(descriptor.label)).toBeInTheDocument();
    // Shape: an icon, hidden from assistive technology because the text says it.
    const icon = container.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    // The fuller description reaches assistive technology.
    expect(screen.getByText(descriptor.accessibleLabel)).toHaveClass('sr-only');
  });

  it('gives every state its own label and its own shape', () => {
    const descriptors = PROCESSING.map(describeMinuteProcessingStatus);
    expect(new Set(descriptors.map((d) => d.label)).size).toBe(PROCESSING.length);
    expect(new Set(descriptors.map((d) => d.shape)).size).toBe(PROCESSING.length);
  });

  it('never lets two states differ by colour alone', () => {
    // Pending and Processing share a tone; they must still differ in shape
    // and text, which is what makes the shared colour acceptable.
    for (const a of PROCESSING) {
      for (const b of PROCESSING) {
        if (a === b) continue;
        const left = describeMinuteProcessingStatus(a);
        const right = describeMinuteProcessingStatus(b);
        if (left.tone === right.tone) {
          expect(left.shape).not.toBe(right.shape);
          expect(left.label).not.toBe(right.label);
        }
      }
    }
  });

  it('says what each state means and how a move into it is announced', () => {
    for (const status of PROCESSING) {
      const descriptor = describeMinuteProcessingStatus(status);
      expect(descriptor.meaning.length).toBeGreaterThan(20);
      expect(descriptor.announcement.length).toBeGreaterThan(10);
    }
    // A failure is announced with the reassurance `REQ-MTG-007` guarantees.
    expect(describeMinuteProcessingStatus('failed').announcement).toMatch(/minute is saved/i);
    expect(describeMinuteProcessingStatus('failed').meaning).toMatch(/saved/i);
  });

  it('keeps the loader static, so reduced-motion users are not shown a spinner', () => {
    const { container } = render(<ProcessingStatusIndicator status="processing" />);
    expect(container.querySelector('svg')?.getAttribute('class') ?? '').not.toMatch(/animate-/);
  });
});
