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

export function turnOffMessage(hidden: number): string {
  return hidden === 0
    ? 'Your posts stay as they are.'
    : `Your ${postsPhrase(hidden)} stay safely backed up and hidden. You choose which come back, when you're ready.`;
}
