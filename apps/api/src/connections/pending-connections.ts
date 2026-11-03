import { createHash, randomBytes } from 'node:crypto';

import type { AccountId } from '../accounts/account-id';
import type { SecretBox } from '../crypto/secret-box';
import type { Db } from '../db/database';
import type { ExternalAccountId } from './connected-account';
import { createStateStore } from './encrypted-stores';

/** A finished Bluesky sign-in, waiting for the Account that started it to claim it. */
export type PendingConnection = {
  startedBy: AccountId;
  did: ExternalAccountId;
  handle: string;
};

export type PendingConnections = {
  /** Holds a sign-in and returns the single-use code that claims it. */
  hold: (pending: PendingConnection) => Promise<string>;
  /** Returns the sign-in behind a code and forgets it. Undefined if unknown, used or expired. */
  take: (code: string) => Promise<PendingConnection | undefined>;
};

/** Long enough to finish signing in on a slow phone, short enough that a leaked code soon dies. */
const PENDING_FOR_MS = 10 * 60 * 1000;

const CODE_BYTES = 32;

/**
 * Binds a Bluesky sign-in to the app that started it. The callback can't connect anything by itself:
 * it hands the app this code, and only the Account that started the sign-in can claim it. Without
 * that, someone could get a victim to approve *their* sign-in link and capture the victim's
 * Bluesky account (login CSRF).
 *
 * Kept in the encrypted states table, keyed by a hash of the code, so the database never holds a
 * usable code.
 */
export function createPendingConnections({
  db,
  secretBox,
  now,
}: {
  db: Db;
  secretBox: SecretBox;
  now?: () => Date;
}): PendingConnections {
  const store = createStateStore<PendingConnection>({ db, secretBox, ttlMs: PENDING_FOR_MS, now });
  const keyFor = (code: string) =>
    `pending-connection:${createHash('sha256').update(code).digest('base64url')}`;

  return {
    async hold(pending) {
      const code = randomBytes(CODE_BYTES).toString('base64url');
      await store.set(keyFor(code), pending);
      return code;
    },

    async take(code) {
      const key = keyFor(code);
      const pending = await store.get(key);
      if (pending) await store.del(key);
      return pending;
    },
  };
}
