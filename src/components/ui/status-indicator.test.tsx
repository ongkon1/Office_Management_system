import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DayStatus } from '@/contracts/domain';
import { StatusIndicator } from './status-indicator';

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
