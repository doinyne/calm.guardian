import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { createSecretBox, SecretBoxError } from '../crypto/secret-box';
import { createDatabase } from '../db/database';
import { connectToLocalSupabase } from '../testing/local-supabase';
import { createSessionStore, createStateStore } from './encrypted-stores';

type FakeSession = { tokenSet: { access_token: string; refresh_token: string } };

const session = (secret: string): FakeSession => ({
  tokenSet: { access_token: `access-${secret}`, refresh_token: `refresh-${secret}` },
});

const NOW = new Date('2026-11-03T12:00:00Z');
const ONE_HOUR_MS = 60 * 60 * 1000;

describe('encrypted OAuth stores (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const db = createDatabase(supabase.databaseUrl);
  const secretBox = createSecretBox(supabase.tokenEncryptionKeys);
  const sessions = createSessionStore<FakeSession>({ db, secretBox });
  const createdKeys: string[] = [];
  const newKey = () => {
    const key = `did:plc:store${randomUUID().replaceAll('-', '')}`;
    createdKeys.push(key);
    return key;
  };

  afterAll(async () => {
    await db.deleteFrom('atproto_oauth_sessions').where('key', 'in', createdKeys).execute();
    await db.deleteFrom('atproto_oauth_states').where('expires_at', '<', new Date()).execute();
    await db.destroy();
  });

  describe('sessions', () => {
    it('returns what was stored, and the latest value when stored again', async () => {
      const key = newKey();

      await sessions.set(key, session('first'));
      await sessions.set(key, session('second'));

      await expect(sessions.get(key)).resolves.toEqual(session('second'));
    });

    it('returns nothing for an unknown key, and nothing once deleted', async () => {
      const key = newKey();
      await sessions.set(key, session('gone'));

      await sessions.del(key);

      await expect(sessions.get(key)).resolves.toBeUndefined();
      await expect(sessions.get(newKey())).resolves.toBeUndefined();
    });

    it('keeps no token text in the database', async () => {
      const key = newKey();
      await sessions.set(key, session('top-secret'));

      const row = await db
        .selectFrom('atproto_oauth_sessions')
        .selectAll()
        .where('key', '=', key)
        .executeTakeFirstOrThrow();

      expect(JSON.stringify(row)).not.toContain('top-secret');
    });

    it('refuses a value copied onto another row, rather than handing over the wrong tokens', async () => {
      const [mine, theirs] = [newKey(), newKey()];
      await sessions.set(mine, session('mine'));
      await sessions.set(theirs, session('theirs'));
      const { value_encrypted } = await db
        .selectFrom('atproto_oauth_sessions')
        .select('value_encrypted')
        .where('key', '=', theirs)
        .executeTakeFirstOrThrow();

      await db
        .updateTable('atproto_oauth_sessions')
        .set({ value_encrypted })
        .where('key', '=', mine)
        .execute();

      await expect(sessions.get(mine)).rejects.toThrow(SecretBoxError);
    });
  });

  describe('sign-in states', () => {
    const statesAt = (now: Date) =>
      createStateStore<FakeSession>({ db, secretBox, ttlMs: ONE_HOUR_MS, now: () => now });

    it('returns a state that has not expired', async () => {
      const key = randomUUID();
      await statesAt(NOW).set(key, session('state'));

      await expect(statesAt(new Date(NOW.getTime() + ONE_HOUR_MS / 2)).get(key)).resolves.toEqual(
        session('state'),
      );
    });

    it('treats an expired state as gone', async () => {
      const key = randomUUID();
      await statesAt(NOW).set(key, session('state'));

      await expect(
        statesAt(new Date(NOW.getTime() + 2 * ONE_HOUR_MS)).get(key),
      ).resolves.toBeUndefined();
    });

    it('deletes a state once used', async () => {
      const key = randomUUID();
      const states = statesAt(NOW);
      await states.set(key, session('state'));

      await states.del(key);

      await expect(states.get(key)).resolves.toBeUndefined();
    });
  });
});
