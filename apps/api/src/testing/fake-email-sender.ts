import type { Email, EmailSender } from '../email/email-sender';

/** Keeps every email it's asked to send, and can be told to fail once. */
export class FakeEmailSender implements EmailSender {
  readonly sent: Email[] = [];
  private failNext = false;

  failOnce() {
    this.failNext = true;
  }

  send(email: Email) {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('SMTP unavailable'));
    }
    this.sent.push(email);
    return Promise.resolve();
  }
}
