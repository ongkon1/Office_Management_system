/**
 * Display formatters.
 *
 * These are the single implementation of the rules in
 * `docs/frontend/phase-0/terminology-and-formats.md` (FE-0013). No component
 * builds one of these strings by hand — a duration rendered two different ways
 * is a defect, and rounding one is a calculation defect.
 */

import type { DurationMinutes, IsoDate, Money } from '@/contracts/domain';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The placeholder for a value that was never recorded. Never used for zero. */
export const NOT_RECORDED = '—';
export const NOT_RECORDED_LABEL = 'Not recorded';

/* -------------------------------------------------------------------------- */
/* Durations                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Formats integer minutes as `H:MM`.
 *
 * Never rounds: 419 minutes is `6:59`, not `7:00`. Hours are not padded, so a
 * monthly aggregate reads `142:30`.
 */
export function formatDuration(minutes: DurationMinutes): string {
  const safe = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `${sign}${hours}:${String(mins).padStart(2, '0')}`;
}

/** Formats a variance with an explicit sign, e.g. `+1:30`, `−0:45`. */
export function formatDurationDelta(minutes: DurationMinutes): string {
  const safe = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  if (safe === 0) return '0:00';
  const sign = safe > 0 ? '+' : '−';
  return `${sign}${formatDuration(Math.abs(safe))}`;
}

/** Spells a duration out for assistive technology, e.g. `7 hours 30 minutes`. */
export function formatDurationAccessible(minutes: DurationMinutes): string {
  const safe = Number.isFinite(minutes) ? Math.trunc(minutes) : 0;
  const abs = Math.abs(safe);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (mins > 0 || hours === 0) parts.push(`${mins} ${mins === 1 ? 'minute' : 'minutes'}`);
  const body = parts.join(' ');
  return safe < 0 ? `minus ${body}` : body;
}

/** Parses `7:30`, `7.5h`, `90m`, or `450` into integer minutes. */
export function parseDurationInput(input: string): DurationMinutes | null {
  const value = input.trim().toLowerCase();
  if (value === '') return null;

  const clock = /^(\d{1,3}):([0-5]?\d)$/.exec(value);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  const hoursAndMinutes = /^(\d{1,3})\s*h(?:\s*([0-5]?\d)\s*m?)?$/.exec(value);
  if (hoursAndMinutes) {
    return Number(hoursAndMinutes[1]) * 60 + Number(hoursAndMinutes[2] ?? 0);
  }

  const minutesOnly = /^(\d{1,5})\s*m$/.exec(value);
  if (minutesOnly) return Number(minutesOnly[1]);

  const decimalHours = /^(\d{1,3})[.](\d{1,2})\s*h?$/.exec(value);
  if (decimalHours) {
    return Math.round(Number(`${decimalHours[1]}.${decimalHours[2]}`) * 60);
  }

  const bare = /^(\d{1,5})$/.exec(value);
  if (bare) return Number(bare[1]);

  return null;
}

/* -------------------------------------------------------------------------- */
/* Dates and times                                                            */
/* -------------------------------------------------------------------------- */

interface DateParts {
  readonly year: number;
  /** 1-12. */
  readonly month: number;
  readonly day: number;
}

/** Parses `YYYY-MM-DD` without constructing a timezone-sensitive `Date`. */
export function parseIsoDate(date: IsoDate): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function weekdayOf(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

/** `2 Sep 2026`. */
export function formatDate(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return NOT_RECORDED;
  return `${parts.day} ${MONTHS[parts.month - 1]} ${parts.year}`;
}

/** `Wed, 2 Sep 2026`. */
export function formatDateWithWeekday(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return NOT_RECORDED;
  return `${WEEKDAYS[weekdayOf(parts)]}, ${formatDate(date)}`;
}

/** `02 Sep` — for dense table columns. */
export function formatDateShort(date: IsoDate): string {
  const parts = parseIsoDate(date);
  if (!parts) return NOT_RECORDED;
  return `${String(parts.day).padStart(2, '0')} ${MONTHS[parts.month - 1]}`;
}

/** `September 2026`. Accepts `YYYY-MM` or a full ISO date. */
export function formatMonth(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return NOT_RECORDED;
  return `${MONTHS_LONG[Number(match[2]) - 1]} ${match[1]}`;
}

/** `1 – 30 Sep 2026`, collapsing shared month and year. */
export function formatDateRange(from: IsoDate, to: IsoDate): string {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return NOT_RECORDED;
  if (a.year === b.year && a.month === b.month) {
    return `${a.day} – ${b.day} ${MONTHS[a.month - 1]} ${a.year}`;
  }
  if (a.year === b.year) {
    return `${a.day} ${MONTHS[a.month - 1]} – ${b.day} ${MONTHS[b.month - 1]} ${a.year}`;
  }
  return `${formatDate(from)} – ${formatDate(to)}`;
}

/** `9:15 AM` from an ISO instant, rendered in the business timezone. */
export function formatTime(instant: string, timeZone?: string): string {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return NOT_RECORDED;
  return new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
    .format(parsed)
    .replace(/ /g, ' ');
}

/**
 * `9:15 AM – 12:30 PM`, marking a range that ends on the following day.
 */
export function formatTimeRange(
  start: string,
  end: string,
  timeZone?: string,
): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NOT_RECORDED;
  }
  const crossesMidnight =
    endDate.getTime() - startDate.getTime() > 0 &&
    startDate.toISOString().slice(0, 10) !== endDate.toISOString().slice(0, 10);
  const range = `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`;
  return crossesMidnight ? `${range} (+1)` : range;
}

/** `2 Sep 2026, 9:15 AM`. */
export function formatTimestamp(instant: string, timeZone?: string): string {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return NOT_RECORDED;
  return `${formatDate(parsed.toISOString().slice(0, 10))}, ${formatTime(instant, timeZone)}`;
}

/**
 * `Today`, `in 3 days`, `3 days ago`. Secondary information only — the absolute
 * date must remain present nearby.
 */
export function formatRelativeDay(date: IsoDate, today: IsoDate): string | null {
  const a = parseIsoDate(date);
  const b = parseIsoDate(today);
  if (!a || !b) return null;
  const diffDays = Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) /
      86_400_000,
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  if (diffDays > 1 && diffDays <= 7) return `in ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -7) return `${Math.abs(diffDays)} days ago`;
  return null;
}

/** Whole days between two ISO dates; negative when `date` is in the past. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (!a || !b) return 0;
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) /
      86_400_000,
  );
}

/** Adds days to an ISO date and returns an ISO date. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const parts = parseIsoDate(date);
  if (!parts) return date;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return shifted.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Money, percentages, counts                                                 */
/* -------------------------------------------------------------------------- */

/** `BDT 125,000.00`. The currency code is always present. */
export function formatMoney(money: Money): string {
  const value = Number(money.amount);
  if (!Number.isFinite(value)) return NOT_RECORDED;
  return `${money.currency} ${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** `BDT 1.25M` — for chart labels and narrow tiles only. */
export function formatMoneyCompact(money: Money): string {
  const value = Number(money.amount);
  if (!Number.isFinite(value)) return NOT_RECORDED;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${money.currency} ${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${money.currency} ${(value / 1_000).toFixed(1)}K`;
  return formatMoney(money);
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

export function formatPercentDelta(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Up to two initials for an avatar fallback. */
export function initialsOf(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}
