import { createTransport } from 'nodemailer';

import type { Logger } from '../logger';

/** An email in both forms: every client gets something readable. */
export type Email = { to: string; subject: string; text: string; html: string };

/** Sends email (the port). Production gets a provider on our domain (M0b). */
export interface EmailSender {
  send(email: Email): Promise<void>;
}

/**
 * SMTP: local Supabase's Mailpit (smtp://127.0.0.1:54325, never delivers anywhere real), or Gmail
 * with an app password for the demo (smtps://you%40gmail.com:app-password@smtp.gmail.com:465).
 */
export function createSmtpEmailSender({
  smtpUrl,
  from,
}: {
  smtpUrl: string;
  from: string;
}): EmailSender {
  const transport = createTransport(smtpUrl);
  return {
    async send(email) {
      await transport.sendMail({ from, ...email });
    },
  };
}

/** With no SMTP set up: notes that an email wasn't sent, without its address or content. */
export function createLoggingEmailSender(logger: Logger): EmailSender {
  return {
    send(email) {
      logger.info({ subject: email.subject }, 'Email not sent: no SMTP_URL configured');
      return Promise.resolve();
    },
  };
}
