/**
 * Fixed-precision money arithmetic.
 *
 * Every value here is a decimal **string** plus a currency code
 * (`REQ-DATA-005`). Nothing in this module converts to `number` — labour cost
 * is an hourly rate multiplied by a duration, and a rate like `"1250.75"` per
 * hour applied to `419` minutes is exactly the shape that produces a
 * half-paisa drift in floating point and a payroll dispute a month later.
 *
 * The arithmetic runs on `bigint` in minor units (paisa for BDT), which is
 * exact for every operation except the final division. That one division is
 * rounded half-up once, at the end, so a total is never the accumulation of
 * many separately-rounded parts.
 *
 * `src/lib/format.ts` remains the only place a money value is turned into
 * display text; this module only produces the value.
 */

import type { DecimalString, Money } from '@/contracts/domain';

/** Minor units per major unit. BDT, like most currencies here, uses 2. */
const SCALE = 2n;
const SCALE_FACTOR = 100n;

/** Minutes in an hour, as a bigint so rate-per-hour maths stays exact. */
const MINUTES_PER_HOUR = 60n;

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `Cannot combine ${a.currency} with ${b.currency}. Convert before summing.`,
    );
  }
}

/**
 * Parses a decimal string into minor units.
 *
 * Rejects rather than truncates a value with more precision than the currency
 * has: silently dropping a third decimal place would make the stored rate and
 * the computed cost disagree.
 */
export function toMinorUnits(amount: DecimalString): bigint {
  const trimmed = amount.trim();
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Not a decimal amount: "${amount}"`);
  }

  const negative = trimmed.startsWith('-');
  const [whole, fraction = ''] = trimmed.replace('-', '').split('.');
  if (fraction.length > Number(SCALE)) {
    throw new Error(
      `"${amount}" has more than ${SCALE} decimal places, which this currency cannot represent.`,
    );
  }

  const padded = fraction.padEnd(Number(SCALE), '0');
  const value = BigInt(whole) * SCALE_FACTOR + BigInt(padded || '0');
  return negative ? -value : value;
}

/** Renders minor units back to a fixed-precision decimal string. */
export function fromMinorUnits(minor: bigint): DecimalString {
  const negative = minor < 0n;
  const absolute = negative ? -minor : minor;
  const whole = absolute / SCALE_FACTOR;
  const fraction = absolute % SCALE_FACTOR;
  return `${negative ? '-' : ''}${whole}.${fraction.toString().padStart(Number(SCALE), '0')}`;
}

export function money(amount: DecimalString, currency: string): Money {
  // Round-trip through minor units so an out-of-range value fails here rather
  // than at the point it is displayed.
  return { amount: fromMinorUnits(toMinorUnits(amount)), currency };
}

export const ZERO_BDT: Money = { amount: '0.00', currency: 'BDT' };

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return {
    amount: fromMinorUnits(toMinorUnits(a.amount) + toMinorUnits(b.amount)),
    currency: a.currency,
  };
}

export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return {
    amount: fromMinorUnits(toMinorUnits(a.amount) - toMinorUnits(b.amount)),
    currency: a.currency,
  };
}

export function sumMoney(values: readonly Money[], currency = 'BDT'): Money {
  if (values.length === 0) return { amount: '0.00', currency };
  return values.reduce((total, value) => addMoney(total, value));
}

/** Half-up division, applied once so a total is not a sum of rounded parts. */
function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const absNumerator = numerator < 0n ? -numerator : numerator;
  const absDenominator = denominator < 0n ? -denominator : denominator;

  const quotient = absNumerator / absDenominator;
  const remainder = absNumerator % absDenominator;
  const rounded = remainder * 2n >= absDenominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

/**
 * Labour cost for a duration at an hourly rate.
 *
 * Cost = rate × minutes ÷ 60, computed in minor units and rounded once at the
 * end. `420` minutes at `"1250.75"` per hour is exactly `8755.25`, not
 * `8755.249999999999`.
 */
export function costOfMinutes(hourlyRate: Money, minutes: number): Money {
  if (!Number.isInteger(minutes)) {
    throw new Error(`Durations are integer minutes; received ${minutes}.`);
  }
  const product = toMinorUnits(hourlyRate.amount) * BigInt(minutes);
  return {
    amount: fromMinorUnits(divideRoundHalfUp(product, MINUTES_PER_HOUR)),
    currency: hourlyRate.currency,
  };
}

/**
 * Percentage variance of `actual` against `budget`, as a whole percent.
 *
 * Returns `null` when there is no budget to vary from — a variance against
 * zero is undefined, and rendering it as `0%` or `100%` would both be wrong.
 */
export function variancePercent(actual: Money, budget: Money): number | null {
  assertSameCurrency(actual, budget);
  const budgetMinor = toMinorUnits(budget.amount);
  if (budgetMinor === 0n) return null;
  const actualMinor = toMinorUnits(actual.amount);
  const ratio = ((actualMinor - budgetMinor) * 10000n) / budgetMinor;
  return Math.round(Number(ratio) / 100);
}
