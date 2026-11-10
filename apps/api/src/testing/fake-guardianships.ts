import { randomUUID } from 'node:crypto';

import type { AccountId } from '../accounts/account-id';
import type { Guardianship, GuardianshipId, Guardianships } from '../guardians/guardianship';

/** In-memory guardianships with the real rules: one per address per user, accept only your own invitation. */
export class FakeGuardianships implements Guardianships {
  private readonly rows: Guardianship[] = [];

  all(): readonly Guardianship[] {
    return this.rows;
  }

  listForAccount(accountId: AccountId) {
    return Promise.resolve(this.rows.filter((row) => row.accountId === accountId));
  }

  invite({ accountId, accountEmail, guardianEmail }: Parameters<Guardianships['invite']>[0]) {
    const existing = this.rows.find(
      (row) => row.accountId === accountId && row.guardianEmail === guardianEmail,
    );
    if (existing) return Promise.resolve(existing);
    const row: Guardianship = {
      id: randomUUID() as GuardianshipId,
      accountId,
      accountEmail,
      guardianEmail,
      guardianAccountId: null,
      state: 'invited',
      emailsOptedOut: false,
      optOutToken: randomUUID(),
    };
    this.rows.push(row);
    return Promise.resolve(row);
  }

  listInvitationsFor(guardianEmail: string) {
    return Promise.resolve(
      this.rows.filter((row) => row.state === 'invited' && row.guardianEmail === guardianEmail),
    );
  }

  accept({
    guardianshipId,
    guardianEmail,
    guardianAccountId,
  }: Parameters<Guardianships['accept']>[0]) {
    const row = this.rows.find(
      (candidate) =>
        candidate.id === guardianshipId &&
        candidate.state === 'invited' &&
        candidate.guardianEmail === guardianEmail,
    );
    if (!row) return Promise.resolve(false);
    Object.assign(row, { state: 'active', guardianAccountId });
    return Promise.resolve(true);
  }

  listForGuardian(guardianAccountId: AccountId) {
    return Promise.resolve(
      this.rows.filter(
        (row) => row.state === 'active' && row.guardianAccountId === guardianAccountId,
      ),
    );
  }

  remove({ accountId, guardianshipId }: Parameters<Guardianships['remove']>[0]) {
    this.drop((row) => row.id === guardianshipId && row.accountId === accountId);
    return Promise.resolve();
  }

  stepDown({
    guardianshipId,
    guardianAccountId,
    guardianEmail,
  }: Parameters<Guardianships['stepDown']>[0]) {
    this.drop(
      (row) =>
        row.id === guardianshipId &&
        (row.guardianAccountId === guardianAccountId ||
          (row.state === 'invited' && row.guardianEmail === guardianEmail)),
    );
    return Promise.resolve();
  }

  find(guardianshipId: GuardianshipId) {
    return Promise.resolve(this.rows.find((row) => row.id === guardianshipId));
  }

  optOutOfEmails({ optOutToken }: Parameters<Guardianships['optOutOfEmails']>[0]) {
    const row = this.rows.find((candidate) => candidate.optOutToken === optOutToken);
    if (row) row.emailsOptedOut = true;
    return Promise.resolve(row !== undefined);
  }

  private drop(matches: (row: Guardianship) => boolean) {
    const index = this.rows.findIndex(matches);
    if (index >= 0) this.rows.splice(index, 1);
  }
}
