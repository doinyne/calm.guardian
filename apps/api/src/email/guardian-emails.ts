import type { Email } from './email-sender';

/** Escapes everything we put into HTML: addresses and handles come from users. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const paragraphs = (lines: readonly string[]) =>
  lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n');

function email(
  to: string,
  subject: string,
  lines: readonly string[],
  footer?: { text: string; url: string },
): Email {
  const text = [...lines, ...(footer ? ['', `${footer.text}: ${footer.url}`] : [])].join('\n\n');
  const html = [
    paragraphs(lines),
    footer
      ? `<p style="color:#666;font-size:12px"><a href="${escapeHtml(footer.url)}">${escapeHtml(footer.text)}</a></p>`
      : '',
  ].join('\n');
  return { to, subject, text, html };
}

/**
 * The emails Guardians and users get (M6). Calm and plain. They never contain posts, the reason for
 * Calm Mode, or anything medical (product rules 3 and 7).
 */
export const guardianEmails = {
  invitation: ({ to, from }: { to: string; from: string }) =>
    email(to, `${from} asked you to be their Guardian`, [
      `${from} would like you to be one of their Guardians on Calm Guardian.`,
      'A Guardian can turn on Calm Mode for them, which quietly hides their social media posts for a while. You never see their posts, and they can turn it off whenever they like.',
      `To accept, open Calm Guardian and sign in with this email address (${to}). If you'd rather not, you can ignore this email.`,
    ]),

  calmModeOnForGuardian: ({
    to,
    accountEmail,
    handle,
    optOutUrl,
  }: {
    to: string;
    accountEmail: string;
    handle: string;
    optOutUrl: string;
  }) =>
    email(
      to,
      `Calm Mode is on for @${handle}`,
      [
        `Calm Mode is now on for @${handle}, one of ${accountEmail}'s accounts. Their posts there are safely backed up and hidden.`,
        'You don’t need to do anything. This is just to let you know.',
      ],
      { text: 'Stop these emails', url: optOutUrl },
    ),

  turnedOnByGuardian: ({
    to,
    guardian,
    handle,
  }: {
    to: string;
    guardian: string;
    handle: string;
  }) =>
    email(to, `${guardian} turned on Calm Mode for @${handle}`, [
      `${guardian}, one of your Guardians, turned on Calm Mode for @${handle}. Your posts there are safely backed up and hidden.`,
      'You can turn it off at any time in Calm Guardian, and change what your Guardians can do.',
    ]),
};
