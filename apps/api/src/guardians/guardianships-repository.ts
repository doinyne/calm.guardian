import type { Selectable } from 'kysely';

import { AccountIdSchema } from '../accounts/account-id';
import type { Db, GuardianshipsTable } from '../db/database';
import type { Guardianship, GuardianshipId, Guardianships } from './guardianship';

/** Every query is scoped by who's asking: the user, or the Guardian's own sign-in (ADR-0011). */
export function createGuardianshipsRepository(db: Db): Guardianships {
  const select = () => db.selectFrom('guardianships').selectAll();

  return {
    async listForAccount(accountId) {
      const rows = await select()
        .where('account_id', '=', accountId)
        .orderBy('invited_at')
        .execute();
      return rows.map(toGuardianship);
    },

    async invite({ accountId, accountEmail, guardianEmail, invitedAt }) {
      await db
        .insertInto('guardianships')
        .values({
          account_id: accountId,
          account_email: accountEmail,
          guardian_email: guardianEmail,
          invited_at: invitedAt,
        })
        .onConflict((conflict) => conflict.columns(['account_id', 'guardian_email']).doNothing())
        .execute();
      const row = await select()
        .where('account_id', '=', accountId)
        .where('guardian_email', '=', guardianEmail)
        .executeTakeFirstOrThrow();
      return toGuardianship(row);
    },

    async listInvitationsFor(guardianEmail) {
      const rows = await select()
        .where('guardian_email', '=', guardianEmail)
        .where('state', '=', 'invited')
        .orderBy('invited_at')
        .execute();
      return rows.map(toGuardianship);
    },

    async accept({ guardianshipId, guardianEmail, guardianAccountId, acceptedAt }) {
      const result = await db
        .updateTable('guardianships')
        .set({ state: 'active', guardian_account_id: guardianAccountId, accepted_at: acceptedAt })
        .where('id', '=', guardianshipId)
        .where('state', '=', 'invited')
        .where('guardian_email', '=', guardianEmail)
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async listForGuardian(guardianAccountId) {
      const rows = await select()
        .where('guardian_account_id', '=', guardianAccountId)
        .where('state', '=', 'active')
        .orderBy('accepted_at')
        .execute();
      return rows.map(toGuardianship);
    },

    async remove({ accountId, guardianshipId }) {
      await db
        .deleteFrom('guardianships')
        .where('id', '=', guardianshipId)
        .where('account_id', '=', accountId)
        .execute();
    },

    async stepDown({ guardianshipId, guardianAccountId, guardianEmail }) {
      await db
        .deleteFrom('guardianships')
        .where('id', '=', guardianshipId)
        .where((eb) =>
          eb.or([
            eb('guardian_account_id', '=', guardianAccountId),
            eb.and([eb('state', '=', 'invited'), eb('guardian_email', '=', guardianEmail)]),
          ]),
        )
        .execute();
    },

    async find(guardianshipId) {
      const row = await select().where('id', '=', guardianshipId).executeTakeFirst();
      return row ? toGuardianship(row) : undefined;
    },
  };
}

/** The one place a row becomes a Guardianship. */
function toGuardianship(row: Selectable<GuardianshipsTable>): Guardianship {
  return {
    id: row.id as GuardianshipId,
    accountId: AccountIdSchema.parse(row.account_id),
    accountEmail: row.account_email,
    guardianEmail: row.guardian_email,
    guardianAccountId:
      row.guardian_account_id === null ? null : AccountIdSchema.parse(row.guardian_account_id),
    state: row.state === 'active' ? 'active' : 'invited',
    emailsOptedOut: row.emails_opted_out_at !== null,
  };
}
