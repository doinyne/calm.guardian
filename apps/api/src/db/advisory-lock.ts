import { sql } from 'kysely';

import type { Db } from './database';

/** The lock shape `@atproto/oauth-client-node` asks for (`requestLock`). */
export type RequestLock = <T>(name: string, fn: () => T | PromiseLike<T>) => Promise<T>;

/**
 * A lock shared by every API instance, so two instances never refresh the same Bluesky session at
 * once. Bluesky rotates refresh tokens, so a race would leave one instance holding a dead token.
 *
 * It's a *transaction* advisory lock, released when the transaction ends, because Supabase's
 * transaction pooler can move each statement to a different connection. A session-level lock taken
 * through it would be held on, or released from, the wrong connection.
 */
export function createAdvisoryLock(db: Db): RequestLock {
  return (name, fn) =>
    db.transaction().execute(async (transaction) => {
      await sql`select pg_advisory_xact_lock(hashtext(${name}))`.execute(transaction);
      return await fn();
    });
}
