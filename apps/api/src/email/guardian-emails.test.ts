import { describe, expect, it } from 'vitest';

import { guardianEmails } from './guardian-emails';

describe('Guardian emails', () => {
  it('escape what users typed, in the HTML', () => {
    const invitation = guardianEmails.invitation({
      to: 'alex@example.com',
      from: '<script>alert(1)</script>@example.com',
    });

    expect(invitation.html).not.toContain('<script>');
    expect(invitation.html).toContain('&lt;script&gt;');
  });

  it('come as plain text too', () => {
    const notice = guardianEmails.calmModeOnForGuardian({
      to: 'alex@example.com',
      accountEmail: 'dean@example.com',
      handle: 'dean.bsky.social',
      optOutUrl: 'http://localhost:3000/guardian/emails/opt-out?token=abc',
    });

    expect(notice.text).toContain('Calm Mode is now on for @dean.bsky.social');
    expect(notice.text).toContain(
      'Stop these emails: http://localhost:3000/guardian/emails/opt-out?token=abc',
    );
  });

  it('say nothing about posts, reasons or health', () => {
    const all = [
      guardianEmails.invitation({ to: 'a@example.com', from: 'd@example.com' }),
      guardianEmails.calmModeOnForGuardian({
        to: 'a@example.com',
        accountEmail: 'd@example.com',
        handle: 'h',
        optOutUrl: 'http://x',
      }),
      guardianEmails.turnedOnByGuardian({
        to: 'd@example.com',
        guardian: 'a@example.com',
        handle: 'h',
      }),
    ];

    for (const message of all) {
      expect(`${message.subject} ${message.text}`).not.toMatch(
        /because|reason|unwell|health|mental|episode|crisis/i,
      );
    }
  });
});
