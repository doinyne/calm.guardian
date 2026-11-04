import { sql, type Selectable } from 'kysely';
import { z } from 'zod';

import {
  ConnectedAccountIdSchema,
  type ConnectedAccountId,
} from '../connections/connected-account';
import type { CalmSessionsTable, Db } from '../db/database';
import { AccountIdSchema } from '../accounts/account-id';
import {
  CALM_SESSION_FAILURES,
  CALM_SESSION_STATES,
  type CalmSession,
  type CalmSessionId,
  type CalmSessions,
  type CalmSessionState,
} from './calm-session';

/** Matches the migration's partial unique index, written out so Postgres can match the two. */
const IS_OPEN = sql<boolean>`state in ('activating', 'active')`;

/** A Calm session was asked to move somewhere its state doesn't allow. A bug, not a user error. */
export class CalmSessionTransitionError extends Error {
  override name = 'CalmSessionTransitionError';
}

export function createCalmSessionsRepository(db: Db): CalmSessions {
  const findOpen = (connectedAccountId: ConnectedAccountId) =>
    db
      .selectFrom('calm_sessions')
      .selectAll()
      .where('connected_account_id', '=', connectedAccountId)
      .where(IS_OPEN)
      .executeTakeFirst();

  async function moveFromActivating(
    calmSessionId: CalmSessionId,
    changes: { state: CalmSessionState } & Partial<Selectable<CalmSessionsTable>>,
  ) {
    const result = await db
      .updateTable('calm_sessions')
      .set(changes)
      .where('id', '=', calmSessionId)
      .where('state', '=', 'activating')
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) {
      throw new CalmSessionTransitionError(
        `Calm session ${calmSessionId} is not activating, so it can't become ${changes.state}`,
      );
    }
  }

  return {
    async openFor({ accountId, connectedAccountId, period, startedAt }) {
      const open = await findOpen(connectedAccountId);
      if (open) return toCalmSession(open);

      const opened = await db
        .insertInto('calm_sessions')
        .values({
          account_id: accountId,
          connected_account_id: connectedAccountId,
          period_from: period.from,
          period_to: period.to,
          started_at: startedAt,
        })
        .onConflict((conflict) =>
          conflict.column('connected_account_id').where(IS_OPEN).doNothing(),
        )
        .returningAll()
        .executeTakeFirst();
      if (opened) return toCalmSession(opened);

      // Another request opened one between our read and our insert: use theirs.
      const theirs = await findOpen(connectedAccountId);
      if (!theirs) throw new Error('A Calm session was opened and closed while opening another');
      return toCalmSession(theirs);
    },

    async find(calmSessionId) {
      const row = await db
        .selectFrom('calm_sessions')
        .selectAll()
        .where('id', '=', calmSessionId)
        .executeTakeFirst();
      return row ? toCalmSession(row) : undefined;
    },

    async listActive() {
      const rows = await db
        .selectFrom('calm_sessions')
        .select('id')
        .where('state', '=', 'active')
        .execute();
      return rows.map((row) => row.id as CalmSessionId);
    },

    async findOpenFor(connectedAccountId) {
      const row = await findOpen(connectedAccountId);
      return row ? toCalmSession(row) : undefined;
    },

    async end({ calmSessionId, endedAt }) {
      const result = await db
        .updateTable('calm_sessions')
        .set({ state: 'ended', ended_at: endedAt })
        .where('id', '=', calmSessionId)
        .where('state', '=', 'active')
        .executeTakeFirst();
      if (result.numUpdatedRows === 0n) {
        throw new CalmSessionTransitionError(
          `Calm session ${calmSessionId} is not active, so it can't end`,
        );
      }
    },

    async saveProgress({ calmSessionId, resumeCursor }) {
      await db
        .updateTable('calm_sessions')
        .set({ resume_cursor: resumeCursor })
        .where('id', '=', calmSessionId)
        .execute();
    },

    async claim({ calmSessionId, until, now }) {
      // One statement, so two workers racing for the claim can't both win.
      const result = await db
        .updateTable('calm_sessions')
        .set({ claimed_until: until })
        .where('id', '=', calmSessionId)
        .where((eb) => eb.or([eb('claimed_until', 'is', null), eb('claimed_until', '<=', now)]))
        .executeTakeFirst();
      return result.numUpdatedRows > 0n;
    },

    async release(calmSessionId) {
      await db
        .updateTable('calm_sessions')
        .set({ claimed_until: null })
        .where('id', '=', calmSessionId)
        .execute();
    },

    async markActive({ calmSessionId, activatedAt }) {
      await moveFromActivating(calmSessionId, { state: 'active', activated_at: activatedAt });
    },

    async markFailed({ calmSessionId, reason, failedAt }) {
      await moveFromActivating(calmSessionId, {
        state: 'failed',
        failure: reason,
        failed_at: failedAt,
      });
    },
  };
}

const CalmSessionStateSchema = z.enum(CALM_SESSION_STATES);
const CalmSessionFailureSchema = z.enum(CALM_SESSION_FAILURES);

/** The one place a database row becomes a Calm session. */
function toCalmSession(row: Selectable<CalmSessionsTable>): CalmSession {
  return {
    id: row.id as CalmSessionId,
    accountId: AccountIdSchema.parse(row.account_id),
    connectedAccountId: ConnectedAccountIdSchema.parse(row.connected_account_id),
    state: CalmSessionStateSchema.parse(row.state),
    period: { from: row.period_from, to: row.period_to },
    startedAt: row.started_at,
    failure: row.failure === null ? null : CalmSessionFailureSchema.parse(row.failure),
    resumeCursor: row.resume_cursor,
  };
}
