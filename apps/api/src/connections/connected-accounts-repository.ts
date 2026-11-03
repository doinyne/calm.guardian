import { sql, type Selectable } from 'kysely';
import { z } from 'zod';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';
import type { ConnectedAccountsTable, Db } from '../db/database';
import {
  CONNECTION_STATUSES,
  ConnectedAccountIdSchema,
  PLATFORMS,
  type ConnectedAccount,
  type ConnectedAccountId,
  type ExternalAccountId,
  type Platform,
} from './connected-account';

/** The Platform account is already connected to a different Calm Guardian Account. */
export class ConnectedElsewhereError extends Error {
  override name = 'ConnectedElsewhereError';

  constructor() {
    super('This account is already connected to another Calm Guardian account');
  }
}

export type ConnectedAccountsRepository = {
  listForAccount: (accountId: AccountId) => Promise<ConnectedAccount[]>;
  /**
   * Connects a Platform account, or reconnects it (new handle, back to `active`) if this Account
   * already has it. Throws `ConnectedElsewhereError` if another Account has it.
   */
  connect: (details: {
    accountId: AccountId;
    platform: Platform;
    externalId: ExternalAccountId;
    handle: string;
  }) => Promise<ConnectedAccount>;
  /** Removes the connection and its stored session. Does nothing if it's already gone. */
  disconnect: (details: {
    accountId: AccountId;
    connectedAccountId: ConnectedAccountId;
  }) => Promise<void>;
};

/** Every query is scoped by the Account it acts for (ADR-0002). */
export function createConnectedAccountsRepository(db: Db): ConnectedAccountsRepository {
  return {
    async listForAccount(accountId) {
      const rows = await db
        .selectFrom('connected_accounts')
        .selectAll()
        .where('account_id', '=', accountId)
        .orderBy('created_at')
        .execute();
      return rows.map(toConnectedAccount);
    },

    async connect({ accountId, platform, externalId, handle }) {
      const row = await db
        .insertInto('connected_accounts')
        .values({ account_id: accountId, platform, external_id: externalId, handle })
        .onConflict((conflict) =>
          conflict
            .columns(['platform', 'external_id'])
            .doUpdateSet({ handle, status: 'active', updated_at: sql`now()` })
            // Only the Account that already owns it can reconnect it; for anyone else nothing
            // changes and no row comes back.
            .where('connected_accounts.account_id', '=', accountId),
        )
        .returningAll()
        .executeTakeFirst();

      if (!row) throw new ConnectedElsewhereError();
      return toConnectedAccount(row);
    },

    async disconnect({ accountId, connectedAccountId }) {
      await db
        .deleteFrom('connected_accounts')
        .where('id', '=', connectedAccountId)
        .where('account_id', '=', accountId)
        .execute();
    },
  };
}

const PlatformSchema = z.enum(PLATFORMS);
const ConnectionStatusSchema = z.enum(CONNECTION_STATUSES);

/** The one place a database row becomes a domain object. */
function toConnectedAccount(row: Selectable<ConnectedAccountsTable>): ConnectedAccount {
  return {
    id: ConnectedAccountIdSchema.parse(row.id),
    accountId: AccountIdSchema.parse(row.account_id),
    platform: PlatformSchema.parse(row.platform),
    externalId: row.external_id as ExternalAccountId,
    handle: row.handle,
    status: ConnectionStatusSchema.parse(row.status),
    connectedAt: row.created_at,
  };
}
