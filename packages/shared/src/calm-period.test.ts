import { describe, expect, it } from 'vitest';

import {
  customCalmPeriod,
  InvalidCalmPeriodError,
  isInCalmPeriod,
  presetCalmPeriod,
} from './calm-period';

const NOW = new Date('2026-11-04T12:00:00.000Z');

describe('Calm periods', () => {
  it('reach back from now for each preset', () => {
    expect(presetCalmPeriod('last-24-hours', NOW)).toEqual({
      from: new Date('2026-11-03T12:00:00.000Z'),
      to: NOW,
    });
    expect(presetCalmPeriod('last-7-days', NOW).from).toEqual(new Date('2026-10-28T12:00:00.000Z'));
    expect(presetCalmPeriod('last-30-days', NOW).from).toEqual(
      new Date('2026-10-05T12:00:00.000Z'),
    );
  });

  it('have no start for everything', () => {
    expect(presetCalmPeriod('everything', NOW)).toEqual({ from: null, to: NOW });
  });

  it('accept a custom period in the past', () => {
    const period = {
      from: new Date('2026-11-01T21:00:00.000Z'),
      to: new Date('2026-11-02T03:00:00.000Z'),
    };

    expect(customCalmPeriod(period, NOW)).toEqual(period);
  });

  it('refuse a custom period that ends before it starts', () => {
    expect(() =>
      customCalmPeriod({ from: NOW, to: new Date('2026-11-01T00:00:00.000Z') }, NOW),
    ).toThrow(InvalidCalmPeriodError);
  });

  it('refuse a custom period that ends in the future', () => {
    expect(() =>
      customCalmPeriod({ from: null, to: new Date('2026-11-05T00:00:00.000Z') }, NOW),
    ).toThrow(InvalidCalmPeriodError);
  });

  it('include posts at either end', () => {
    const period = presetCalmPeriod('last-24-hours', NOW);

    expect(isInCalmPeriod(period, new Date('2026-11-03T12:00:00.000Z'))).toBe(true);
    expect(isInCalmPeriod(period, NOW)).toBe(true);
    expect(isInCalmPeriod(period, new Date('2026-11-03T11:59:59.999Z'))).toBe(false);
    expect(isInCalmPeriod(period, new Date('2026-11-04T12:00:00.001Z'))).toBe(false);
  });
});
