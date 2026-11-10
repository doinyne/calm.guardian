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

type PlatformAccount = { platform: Platform; externalId: ExternalAccountId };
type AccountsConnection = { accountId: AccountId; connectedAccountId: ConnectedAccountId };

export type ConnectedAccountsRepository = {
  listForAccount: (accountId: AccountId) => Promise<ConnectedAccount[]>;
  findForAccount: (details: AccountsConnection) => Promise<ConnectedAccount | undefined>;
  /** Whether any Account has this Platform account connected. */
  isConnected: (details: PlatformAccount) => Promise<boolean>;
  /** The Platform stopped accepting our tokens; the user needs to sign in again. */
  markNeedsReauth: (details: PlatformAccount) => Promise<void>;
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
  disconnect: (details: AccountsConnection) => Promise<void>;
  /** Any Account's connected account. Only for checks that then confirm who may act on it. */
  findById: (connectedAccountId: ConnectedAccountId) => Promise<ConnectedAccount | undefined>;
  /** Returns false if the Account has no such connected account. */
  setGuardiansCanTurnOn: (details: AccountsConnection & { allowed: boolean }) => Promise<boolean>;
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

    async findForAccount({ accountId, connectedAccountId }) {
      const row = await db
        .selectFrom('connected_accounts')
        .selectAll()
        .where('id', '=', connectedAccountId)
        .where('account_id', '=', accountId)
        .executeTakeFirst();
      return row ? toConnectedAccount(row) : undefined;
    },

    async isConnected({ platform, externalId }) {
      const row = await db
        .selectFrom('connected_accounts')
        .select('id')
        .where('platform', '=', platform)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
      return row !== undefined;
    },

    async markNeedsReauth({ platform, externalId }) {
      await db
        .updateTable('connected_accounts')
        .set({ status: 'needs_reauth', updated_at: sql`now()` })
        .where('platform', '=', platform)
        .where('external_id', '=', externalId)
        .where('status', '=', 'active')
        .execute();
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

    async findById(connectedAccountId) {
      const row = await db
        .selectFrom('connected_accounts')
        .selectAll()
        .where('id', '=', connectedAccountId)
        .executeTakeFirst();
      return row ? toConnectedAccount(row) : undefined;
    },

    async setGuardiansCanTurnOn({ accountId, connectedAccountId, allowed }) {
      const result = await db
        .updateTable('connected_accounts')
        .set({ guardians_can_turn_on: allowed, updated_at: sql`now()` })
        .where('id', '=', connectedAccountId)
        .where('account_id', '=', accountId)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
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
    guardiansCanTurnOn: row.guardians_can_turn_on,
  };
}
