/**
 * The span of time whose posts Calm Mode hides. Posts made after it are the Sweep's job.
 * `from: null` means "since the account began".
 */
export type CalmPeriod = { from: Date | null; to: Date };

/** Quick choices for the period. A custom period can be anything `customCalmPeriod` accepts. */
export const CALM_PERIOD_PRESETS = [
  'last-24-hours',
  'last-7-days',
  'last-30-days',
  'everything',
] as const;
export type CalmPeriodPreset = (typeof CALM_PERIOD_PRESETS)[number];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** How far back each preset reaches. `null`: no limit. */
const PRESET_LOOKBACK_MS: Record<CalmPeriodPreset, number | null> = {
  'last-24-hours': 24 * HOUR_MS,
  'last-7-days': 7 * DAY_MS,
  'last-30-days': 30 * DAY_MS,
  everything: null,
};

export function presetCalmPeriod(preset: CalmPeriodPreset, now: Date): CalmPeriod {
  const lookbackMs = PRESET_LOOKBACK_MS[preset];
  return { from: lookbackMs === null ? null : new Date(now.getTime() - lookbackMs), to: now };
}

export class InvalidCalmPeriodError extends Error {
  override readonly name = 'InvalidCalmPeriodError';
}

/** A period the user picked. It has to start before it ends, and can't reach into the future. */
export function customCalmPeriod({ from, to }: CalmPeriod, now: Date): CalmPeriod {
  if (from !== null && from.getTime() >= to.getTime()) {
    throw new InvalidCalmPeriodError('A Calm period must start before it ends.');
  }
  if (to.getTime() > now.getTime()) {
    throw new InvalidCalmPeriodError("A Calm period can't end in the future.");
  }
  return { from, to };
}

/** Both ends are included. */
export function isInCalmPeriod(period: CalmPeriod, at: Date): boolean {
  const time = at.getTime();
  return (period.from === null || time >= period.from.getTime()) && time <= period.to.getTime();
}
