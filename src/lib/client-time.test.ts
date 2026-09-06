import { describe, expect, it } from 'vitest';
import { sumClientContributions, toClientContributions } from './client-time';

describe('toClientContributions', () => {
  it('groups project minutes under the client the project is delivered for', () => {
    const result = toClientContributions(480, [
      { clientId: 'Meghna Group', activeMinutes: 300 },
      { clientId: 'Westbridge Capital', activeMinutes: 180 },
    ]);

    expect(result.map((item) => [item.clientLabel, item.active.display])).toEqual([
      ['Meghna Group', '5:00'],
      ['Westbridge Capital', '3:00'],
    ]);
  });

  it('merges two projects sharing one client into a single bucket', () => {
    const result = toClientContributions(420, [
      { clientId: 'Meghna Group', activeMinutes: 240 },
      { clientId: 'Meghna Group', activeMinutes: 180 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].active.minutes).toBe(420);
    expect(result[0].sharePercent).toBe(100);
  });

  it('reports time with no client rather than dropping it, so the parts sum to the day', () => {
    const result = toClientContributions(420, [
      { clientId: 'Meghna Group', activeMinutes: 300 },
    ]);

    const unattributed = result.find((item) => item.clientId === null);
    expect(unattributed?.clientLabel).toBe('Not recorded');
    expect(unattributed?.active.display).toBe('2:00');
    expect(result.reduce((total, item) => total + item.active.minutes, 0)).toBe(420);
  });

  it('never rounds a duration up', () => {
    const [only] = toClientContributions(419, [{ clientId: 'Meghna Group', activeMinutes: 419 }]);
    expect(only.active.display).toBe('6:59');
  });

  it('returns nothing for a day with no active time', () => {
    expect(toClientContributions(0, [])).toEqual([]);
  });

  it('orders by time descending, then by name so the order is stable', () => {
    const result = toClientContributions(360, [
      { clientId: 'Zenith Labs', activeMinutes: 120 },
      { clientId: 'Acme Holdings', activeMinutes: 120 },
      { clientId: 'Meghna Group', activeMinutes: 120 },
    ]);

    expect(result.map((item) => item.clientLabel)).toEqual([
      'Acme Holdings',
      'Meghna Group',
      'Zenith Labs',
    ]);
  });
});

describe('sumClientContributions', () => {
  const day = (activeMinutes: number, attributed: { clientId: string | null; activeMinutes: number }[]) => ({
    active: { minutes: activeMinutes, display: '', accessibleLabel: '' },
    clientContributions: toClientContributions(activeMinutes, attributed),
  });

  it('adds each day split into one period split', () => {
    const result = sumClientContributions([
      day(420, [{ clientId: 'Meghna Group', activeMinutes: 420 }]),
      day(420, [
        { clientId: 'Meghna Group', activeMinutes: 120 },
        { clientId: 'Westbridge Capital', activeMinutes: 300 },
      ]),
    ]);

    expect(result.map((item) => [item.clientLabel, item.active.display])).toEqual([
      ['Meghna Group', '9:00'],
      ['Westbridge Capital', '5:00'],
    ]);
  });

  it('keeps the period total equal to the sum of its days', () => {
    const days = [
      day(420, [{ clientId: 'Meghna Group', activeMinutes: 300 }]),
      day(455, [{ clientId: 'Westbridge Capital', activeMinutes: 455 }]),
      day(0, []),
    ];

    const result = sumClientContributions(days);
    expect(result.reduce((total, item) => total + item.active.minutes, 0)).toBe(875);
  });

  it('is empty when nothing was recorded', () => {
    expect(sumClientContributions([])).toEqual([]);
  });
});
