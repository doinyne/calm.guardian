/** A worldwide directory of free, confidential helplines, linked from the app and the website. */
export const HELPLINE_DIRECTORY_URL = 'https://findahelpline.com';

/**
 * ⚠️ Safety-critical content. Every number here must be re-checked against the service's own website
 * before each release, and the date below updated. Last checked: 2026-11-12 (from memory, pending
 * Dean's check against the official sites).
 */
export const SUPPORT_LAST_CHECKED = '2026-11-12';

export type SupportLine = {
  name: string;
  /** What it is, in a few calm words. */
  about: string;
  /** Digits to call, if it takes calls. */
  call?: string;
  /** Number to text, and what to send, if it takes texts. */
  text?: { to: string; message?: string };
};

export type RegionalSupport = {
  /** The emergency number, always shown first. */
  emergency: string;
  lines: readonly SupportLine[];
};

const SAMARITANS: SupportLine = {
  name: 'Samaritans',
  about: 'Free, any time, day or night. Someone to talk to.',
  call: '116123',
};

/** By ISO country code. Anywhere else gets the emergency number we know of and the worldwide directory. */
const BY_REGION: Readonly<Record<string, RegionalSupport>> = {
  GB: {
    emergency: '999',
    lines: [
      SAMARITANS,
      {
        name: 'Shout',
        about: 'Free text support, any time.',
        text: { to: '85258', message: 'SHOUT' },
      },
    ],
  },
  IE: { emergency: '112', lines: [SAMARITANS] },
  US: {
    emergency: '911',
    lines: [
      { name: '988 Lifeline', about: 'Call or text, any time.', call: '988', text: { to: '988' } },
    ],
  },
  CA: {
    emergency: '911',
    lines: [{ name: '988', about: 'Call or text, any time.', call: '988', text: { to: '988' } }],
  },
  AU: {
    emergency: '000',
    lines: [{ name: 'Lifeline', about: 'Free, any time, day or night.', call: '131114' }],
  },
};

/** Most countries, including the EU, answer 112. */
const FALLBACK: RegionalSupport = { emergency: '112', lines: [] };

/** Support for a country code (e.g. from the phone's region). Unknown or missing: the fallback. */
export function supportFor(region: string | undefined): RegionalSupport {
  return (region && BY_REGION[region.toUpperCase()]) || FALLBACK;
}
