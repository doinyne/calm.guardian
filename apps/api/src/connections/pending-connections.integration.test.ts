import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { AccountIdSchema } from '../accounts/account-id';
import { createSecretBox } from '../crypto/secret-box';
import { createDatabase } from '../db/database';
import { connectToLocalSupabase } from '../testing/local-supabase';
import type { ExternalAccountId } from './connected-account';
import { createPendingConnections } from './pending-connections';

const NOW = new Date('2026-11-03T12:00:00Z');
const minutesAfter = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

describe('pending connections (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const db = createDatabase(supabase.databaseUrl);
  const secretBox = createSecretBox(supabase.tokenEncryptionKeys);
  const pendingAt = (now: Date) => createPendingConnections({ db, secretBox, now: () => now });

  const signIn = () => ({
    startedBy: AccountIdSchema.parse(randomUUID()),
    did: `did:plc:${randomUUID()}` as ExternalAccountId,
    handle: 'someone.bsky.social',
  });

  afterAll(async () => {
    // Codes are stored hashed, so clear what these tests left by its (past) expiry instead.
    await db.deleteFrom('atproto_oauth_states').where('expires_at', '<', new Date()).execute();
    await db.destroy();
  });

  it('hands back the sign-in behind a code, once', async () => {
    const pending = pendingAt(NOW);
    const held = signIn();
    const code = await pending.hold(held);

    await expect(pending.take(code)).resolves.toEqual(held);
    await expect(pending.take(code)).resolves.toBeUndefined();
  });

  it('forgets a sign-in nobody completed within 10 minutes', async () => {
    const code = await pendingAt(NOW).hold(signIn());

    await expect(pendingAt(minutesAfter(11)).take(code)).resolves.toBeUndefined();
  });

  it('knows nothing about a code it never issued', async () => {
    await expect(pendingAt(NOW).take('made-up-code')).resolves.toBeUndefined();
  });

  it('stores neither the code nor the sign-in in readable form', async () => {
    const held = signIn();
    const code = await pendingAt(NOW).hold(held);

    const rows = await db.selectFrom('atproto_oauth_states').selectAll().execute();
    const stored = JSON.stringify(rows);

    expect(stored).not.toContain(code);
    expect(stored).not.toContain(held.did);
    expect(stored).not.toContain(held.startedBy);
  });
});
