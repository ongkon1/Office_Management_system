import { describe, expect, it } from 'vitest';
import {
  addMoney,
  costOfMinutes,
  fromMinorUnits,
  money,
  subtractMoney,
  sumMoney,
  toMinorUnits,
  variancePercent,
} from './money';

const BDT = (amount: string) => ({ amount, currency: 'BDT' });

describe('parsing', () => {
  it('round-trips a decimal string through minor units', () => {
    expect(fromMinorUnits(toMinorUnits('1250.75'))).toBe('1250.75');
    expect(fromMinorUnits(toMinorUnits('0'))).toBe('0.00');
    expect(fromMinorUnits(toMinorUnits('-45.5'))).toBe('-45.50');
  });

  it('rejects more precision than the currency can hold', () => {
    // Truncating silently would make the stored rate and the computed cost
    // disagree, which is exactly the class of defect this module prevents.
    expect(() => money('10.005', 'BDT')).toThrow(/decimal places/);
  });

  it('rejects a value that is not a decimal', () => {
    expect(() => toMinorUnits('1,250.75')).toThrow(/Not a decimal amount/);
    expect(() => toMinorUnits('abc')).toThrow(/Not a decimal amount/);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts exactly', () => {
    expect(addMoney(BDT('0.10'), BDT('0.20')).amount).toBe('0.30');
    expect(subtractMoney(BDT('1000.00'), BDT('333.33')).amount).toBe('666.67');
  });

  it('refuses to combine different currencies', () => {
    expect(() => addMoney(BDT('1.00'), { amount: '1.00', currency: 'USD' })).toThrow(
      /Cannot combine/,
    );
  });

  it('sums an empty list to zero rather than throwing', () => {
    expect(sumMoney([]).amount).toBe('0.00');
  });
});

describe('cost of minutes', () => {
  it('is exact where floating point is not', () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; this path must not care.
    expect(sumMoney([BDT('0.10'), BDT('0.20')]).amount).toBe('0.30');
    // 1250.75/hour over a 7-hour day.
    expect(costOfMinutes(BDT('1250.75'), 420).amount).toBe('8755.25');
  });

  it('rounds half-up once, at the end', () => {
    // 100.00/hour for 1 minute is 1.666..., which rounds to 1.67.
    expect(costOfMinutes(BDT('100.00'), 1).amount).toBe('1.67');
    // A hundred separately-rounded minutes would give 167.00; one division
    // over the whole duration gives the correct 166.67.
    expect(costOfMinutes(BDT('100.00'), 100).amount).toBe('166.67');
  });

  it('refuses a fractional duration', () => {
    expect(() => costOfMinutes(BDT('100.00'), 30.5)).toThrow(/integer minutes/);
  });

  it('costs a zero duration as zero, not as a missing value', () => {
    expect(costOfMinutes(BDT('1250.75'), 0).amount).toBe('0.00');
  });
});

describe('variance', () => {
  it('reports over and under budget with the right sign', () => {
    expect(variancePercent(BDT('110.00'), BDT('100.00'))).toBe(10);
    expect(variancePercent(BDT('90.00'), BDT('100.00'))).toBe(-10);
  });

  it('returns null against a zero budget rather than a misleading number', () => {
    // Neither 0% nor 100% is true when there is no budget to vary from.
    expect(variancePercent(BDT('500.00'), BDT('0.00'))).toBeNull();
  });
});
