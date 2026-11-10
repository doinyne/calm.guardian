import type { CalmPeriodPreset } from '@calm-guardian/shared';

import type { CalmAccount } from './use-calm';

/** Calm, plain words for each choice. No judgement, no medical language (product rules 6 and 7). */
export const PERIOD_LABEL: Record<CalmPeriodPreset, string> = {
  'last-24-hours': 'The last 24 hours',
  'last-7-days': 'The last 7 days',
  'last-30-days': 'The last 30 days',
  everything: 'Everything',
};

export const DEFAULT_PERIOD: CalmPeriodPreset = 'last-7-days';

/** What the user chose: a preset, or dates they picked. */
export type PeriodChoice = CalmPeriodPreset | { from: Date; to: Date };

/** How the API takes it. The server checks a picked period against its own clock. */
export function toApiPeriod(choice: PeriodChoice) {
  return typeof choice === 'string'
    ? choice
    : { from: choice.from.toISOString(), to: choice.to.toISOString() };
}

/** Why picked dates can't be used, or `null` if they can. */
export function pickedPeriodProblem({ from, to }: { from: Date; to: Date }, now: Date) {
  if (from >= to) return 'The start needs to be before the end.';
  if (to > now) return "The end can't be in the future.";
  return null;
}

const PLATFORM_NAME: Record<CalmAccount['platform'], string> = { bluesky: 'Bluesky' };

const postsPhrase = (count: number) => (count === 1 ? '1 post' : `${count.toLocaleString()} posts`);

/** The one-line readout under an account's name. */
export function accountReadout({ platform, status, calm }: CalmAccount): string {
  if (calm?.state === 'activating') return `Hiding posts, newest first · ${calm.hidden} hidden`;
  if (calm?.state === 'active') return `Calm Mode on · ${calm.hidden} hidden`;
  if (status === 'needs_reauth') return `${PLATFORM_NAME[platform]} · Sign in again`;
  return `${PLATFORM_NAME[platform]} · Standing by`;
}

export function previewSentence({ posts, more }: { posts: number; more: boolean }): string {
  if (posts === 0) return 'There are no posts from this period to hide.';
  if (more) return `More than ${postsPhrase(posts)} will be backed up and hidden.`;
  return `${postsPhrase(posts)} will be backed up and hidden.`;
}

/**
 * Bluesky lets an account delete about 5,000 posts an hour (ADR-0015), so above this many, hiding
 * takes long enough to say so.
 */
const HIDES_PER_HOUR = 5_000;
const WORTH_MENTIONING = 2_000;
const REASSURANCE = 'Your newest posts are hidden first, and it carries on if you close the app.';

/** A calm, rough time for a long job. `null` when it's quick enough not to mention. */
export function durationSentence({ posts, more }: { posts: number; more: boolean }): string | null {
  if (more) return `This may take a few hours. ${REASSURANCE}`;
  if (posts < WORTH_MENTIONING) return null;
  const hours = Math.max(1, Math.round(posts / HIDES_PER_HOUR));
  return `This will take about ${hours === 1 ? 'an hour' : `${hours} hours`}. ${REASSURANCE}`;
}

export function turnOffMessage(hidden: number): string {
  return hidden === 0
    ? 'Your posts stay as they are.'
    : `Your ${postsPhrase(hidden)} stay safely backed up and hidden. You choose which come back, when you're ready.`;
}
