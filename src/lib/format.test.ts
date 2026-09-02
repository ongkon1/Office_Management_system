import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  formatDate,
  formatDateRange,
  formatDuration,
  formatDurationAccessible,
  formatDurationDelta,
  formatMoney,
  formatMonth,
  initialsOf,
  parseDurationInput,
} from './format';

describe('formatDuration', () => {
  it('formats integer minutes as H:MM', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(420)).toBe('7:00');
    expect(formatDuration(480)).toBe('8:00');
    expect(formatDuration(750)).toBe('12:30');
  });

  it('never rounds a duration up to the next threshold', () => {
    // 6:59 reading as 7:00 would turn an Under-time day into a Complete one.
    expect(formatDuration(419)).toBe('6:59');
    expect(formatDuration(479)).toBe('7:59');
    expect(formatDuration(721)).toBe('12:01');
  });

  it('does not pad hours, so aggregates stay readable', () => {
    expect(formatDuration(8550)).toBe('142:30');
  });

  it('handles negative and non-finite input without producing NaN', () => {
    expect(formatDuration(-90)).toBe('-1:30');
    expect(formatDuration(Number.NaN)).toBe('0:00');
  });
});

describe('formatDurationDelta', () => {
  it('signs variances explicitly', () => {
    expect(formatDurationDelta(90)).toBe('+1:30');
    expect(formatDurationDelta(-45)).toBe('−0:45');
    expect(formatDurationDelta(0)).toBe('0:00');
  });
});

describe('formatDurationAccessible', () => {
  it('spells durations out for assistive technology', () => {
    expect(formatDurationAccessible(420)).toBe('7 hours');
    expect(formatDurationAccessible(419)).toBe('6 hours 59 minutes');
    expect(formatDurationAccessible(60)).toBe('1 hour');
    expect(formatDurationAccessible(1)).toBe('1 minute');
    expect(formatDurationAccessible(0)).toBe('0 minutes');
  });
});

describe('parseDurationInput', () => {
  it('accepts every documented entry format and returns integer minutes', () => {
    expect(parseDurationInput('7:30')).toBe(450);
    expect(parseDurationInput('7.5h')).toBe(450);
    expect(parseDurationInput('7h30')).toBe(450);
    expect(parseDurationInput('7h 30m')).toBe(450);
    expect(parseDurationInput('90m')).toBe(90);
    expect(parseDurationInput('450')).toBe(450);
  });

  it('returns null for empty or unparseable input', () => {
    expect(parseDurationInput('')).toBeNull();
    expect(parseDurationInput('   ')).toBeNull();
    expect(parseDurationInput('lunch')).toBeNull();
    expect(parseDurationInput('7:75')).toBeNull();
  });
});

describe('date formatting', () => {
  it('uses the unambiguous D MMM YYYY form', () => {
    expect(formatDate('2026-09-02')).toBe('2 Sep 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('collapses shared month and year in a range', () => {
    expect(formatDateRange('2026-09-01', '2026-09-30')).toBe('1 – 30 Sep 2026');
    expect(formatDateRange('2026-08-28', '2026-09-03')).toBe('28 Aug – 3 Sep 2026');
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe('30 Dec 2025 – 2 Jan 2026');
  });

  it('formats month headings', () => {
    expect(formatMonth('2026-09')).toBe('September 2026');
    expect(formatMonth('2026-09-02')).toBe('September 2026');
  });

  it('computes calendar distance without timezone drift', () => {
    expect(daysBetween('2026-09-01', '2026-09-30')).toBe(29);
    expect(daysBetween('2026-09-30', '2026-09-01')).toBe(-29);
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('formatMoney', () => {
  it('always shows the currency code alongside the amount', () => {
    expect(formatMoney({ amount: '125000.00', currency: 'BDT' })).toBe('BDT 125,000.00');
    expect(formatMoney({ amount: '0', currency: 'BDT' })).toBe('BDT 0.00');
  });
});

describe('initialsOf', () => {
  it('takes the first and last name initials', () => {
    expect(initialsOf('Nadia Rahman')).toBe('NR');
    expect(initialsOf('Shakil Ahmed Chowdhury')).toBe('SC');
    expect(initialsOf('Prince')).toBe('PR');
  });
});
