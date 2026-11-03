import type { SecretBox } from '../crypto/secret-box';
import type { Db } from '../db/database';

/**
 * The key-value store shape `@atproto/oauth-client-node` asks for (its `SimpleStore`). Values are
 * JSON-serialisable, and hold OAuth tokens and DPoP private keys, so they're always sealed.
 */
export type EncryptedStore<Value> = {
  get: (key: string) => Promise<Value | undefined>;
  set: (key: string, value: Value) => Promise<void>;
  del: (key: string) => Promise<void>;
};

type StoreDependencies = { db: Db; secretBox: SecretBox };

/** Sealed with the table and key as context, so a value copied onto another row won't open. */
const sealFor = (table: string, key: string) => `${table}:${key}`;

/** Bluesky OAuth sessions, keyed by DID. Deleted with their connected account (see the migration). */
export function createSessionStore<Value>({
  db,
  secretBox,
}: StoreDependencies): EncryptedStore<Value> {
  const table = 'atproto_oauth_sessions';

  return {
    async get(key) {
      const row = await db
        .selectFrom(table)
        .select('value_encrypted')
        .where('key', '=', key)
        .executeTakeFirst();
      return row
        ? (JSON.parse(secretBox.open(row.value_encrypted, sealFor(table, key))) as Value)
        : undefined;
    },

    async set(key, value) {
      const value_encrypted = secretBox.seal(JSON.stringify(value), sealFor(table, key));
      await db
        .insertInto(table)
        .values({ key, value_encrypted })
        .onConflict((conflict) =>
          conflict.column('key').doUpdateSet({ value_encrypted, updated_at: new Date() }),
        )
        .execute();
    },

    async del(key) {
      await db.deleteFrom(table).where('key', '=', key).execute();
    },
  };
}

/** Short-lived OAuth sign-in states, keyed by the OAuth `state` value. Expired ones read as gone. */
export function createStateStore<Value>({
  db,
  secretBox,
  ttlMs,
  now = () => new Date(),
}: StoreDependencies & { ttlMs: number; now?: () => Date }): EncryptedStore<Value> {
  const table = 'atproto_oauth_states';

  return {
    async get(key) {
      const row = await db
        .selectFrom(table)
        .select('value_encrypted')
        .where('key', '=', key)
        .where('expires_at', '>', now())
        .executeTakeFirst();
      return row
        ? (JSON.parse(secretBox.open(row.value_encrypted, sealFor(table, key))) as Value)
        : undefined;
    },

    async set(key, value) {
      const value_encrypted = secretBox.seal(JSON.stringify(value), sealFor(table, key));
      const expires_at = new Date(now().getTime() + ttlMs);
      await db
        .insertInto(table)
        .values({ key, value_encrypted, expires_at })
        .onConflict((conflict) =>
          conflict.column('key').doUpdateSet({ value_encrypted, expires_at }),
        )
        .execute();
    },

    async del(key) {
      await db.deleteFrom(table).where('key', '=', key).execute();
    },
  };
}
