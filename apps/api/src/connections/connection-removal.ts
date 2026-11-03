import type { AccountId } from '../accounts/account-id';
import type { Logger } from '../logger';
import type {
  ConnectedAccount,
  ConnectedAccountId,
  ExternalAccountId,
  Platform,
} from './connected-account';
import type { ConnectedAccountsRepository } from './connected-accounts-repository';

/** How to revoke our tokens on each Platform. */
export type TokenRevokers = Record<Platform, (externalId: ExternalAccountId) => Promise<void>>;

export type Disconnect = (details: {
  accountId: AccountId;
  connectedAccountId: ConnectedAccountId;
}) => Promise<void>;

export type RevokeAllConnections = (accountId: AccountId) => Promise<void>;

/**
 * Ending connections (product rule 8): revoke our tokens at the Platform, then delete our copy.
 *
 * A failed revoke is logged and the deletion goes ahead. What we promise is to stop holding the
 * tokens, and deleting them does that; the Platform expires them on its own. Blocking the
 * disconnect on a Platform outage would keep tokens the user asked us to drop.
 */
export function createConnectionRemoval({
  connectedAccounts,
  revokeTokens,
  logger,
}: {
  connectedAccounts: ConnectedAccountsRepository;
  revokeTokens: TokenRevokers;
  logger: Logger;
}): { disconnect: Disconnect; revokeAll: RevokeAllConnections } {
  async function revokeAtPlatform(account: ConnectedAccount) {
    try {
      await revokeTokens[account.platform](account.externalId);
    } catch (error) {
      logger.warn(
        {
          connectedAccountId: account.id,
          platform: account.platform,
          errorName: error instanceof Error ? error.name : typeof error,
        },
        'Could not revoke tokens at the Platform; deleting our copy anyway',
      );
    }
  }

  return {
    async disconnect({ accountId, connectedAccountId }) {
      const account = await connectedAccounts.findForAccount({ accountId, connectedAccountId });
      if (!account) return;
      await revokeAtPlatform(account);
      await connectedAccounts.disconnect({ accountId, connectedAccountId });
    },

    async revokeAll(accountId) {
      for (const account of await connectedAccounts.listForAccount(accountId)) {
        await revokeAtPlatform(account);
      }
    },
  };
}
