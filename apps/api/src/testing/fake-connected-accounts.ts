import { randomUUID } from 'node:crypto';

import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccount, ConnectedAccountId } from '../connections/connected-account';
import {
  ConnectedElsewhereError,
  type ConnectedAccountsRepository,
} from '../connections/connected-accounts-repository';

/** An in-memory connected accounts repository with the real one's rules. */
export class FakeConnectedAccounts implements ConnectedAccountsRepository {
  private readonly accounts: ConnectedAccount[] = [];

  listForAccount(accountId: AccountId) {
    return Promise.resolve(this.accounts.filter((account) => account.accountId === accountId));
  }

  findForAccount({
    accountId,
    connectedAccountId,
  }: Parameters<ConnectedAccountsRepository['findForAccount']>[0]) {
    return Promise.resolve(
      this.accounts.find(
        (account) => account.id === connectedAccountId && account.accountId === accountId,
      ),
    );
  }

  isConnected({ platform, externalId }: Parameters<ConnectedAccountsRepository['isConnected']>[0]) {
    return Promise.resolve(
      this.accounts.some(
        (account) => account.platform === platform && account.externalId === externalId,
      ),
    );
  }

  markNeedsReauth({
    platform,
    externalId,
  }: Parameters<ConnectedAccountsRepository['markNeedsReauth']>[0]) {
    for (const account of this.accounts) {
      if (account.platform === platform && account.externalId === externalId) {
        account.status = 'needs_reauth';
      }
    }
    return Promise.resolve();
  }

  connect({
    accountId,
    platform,
    externalId,
    handle,
  }: Parameters<ConnectedAccountsRepository['connect']>[0]) {
    const existing = this.accounts.find(
      (account) => account.platform === platform && account.externalId === externalId,
    );
    if (existing && existing.accountId !== accountId) {
      return Promise.reject(new ConnectedElsewhereError());
    }
    if (existing) {
      Object.assign(existing, { handle, status: 'active' });
      return Promise.resolve(existing);
    }

    const connected: ConnectedAccount = {
      id: randomUUID() as ConnectedAccountId,
      accountId,
      platform,
      externalId,
      handle,
      status: 'active',
      connectedAt: new Date(),
      guardiansCanTurnOn: false,
    };
    this.accounts.push(connected);
    return Promise.resolve(connected);
  }

  disconnect({
    accountId,
    connectedAccountId,
  }: Parameters<ConnectedAccountsRepository['disconnect']>[0]) {
    const index = this.accounts.findIndex(
      (account) => account.id === connectedAccountId && account.accountId === accountId,
    );
    if (index >= 0) this.accounts.splice(index, 1);
    return Promise.resolve();
  }

  findById(connectedAccountId: ConnectedAccountId) {
    return Promise.resolve(this.accounts.find((account) => account.id === connectedAccountId));
  }

  setGuardiansCanTurnOn({
    accountId,
    connectedAccountId,
    allowed,
  }: Parameters<ConnectedAccountsRepository['setGuardiansCanTurnOn']>[0]) {
    const account = this.accounts.find(
      (candidate) => candidate.id === connectedAccountId && candidate.accountId === accountId,
    );
    if (account) account.guardiansCanTurnOn = allowed;
    return Promise.resolve(account !== undefined);
  }
}
