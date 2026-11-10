import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from '../connections/connected-account';
import { createConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import { createDatabase } from '../db/database';
import { connectToLocalSupabase } from '../testing/local-supabase';
import { createGuardianshipsRepository } from './guardianships-repository';

const NOW = new Date('2026-11-10T12:00:00.000Z');

describe('guardianships (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const db = createDatabase(supabase.databaseUrl);
  const guardianships = createGuardianshipsRepository(db);
  const connectedAccounts = createConnectedAccountsRepository(db);
  const createdUsers: string[] = [];

  async function newAccount(): Promise<{ id: AccountId; email: string }> {
    const user = await supabase.createTestUser();
    createdUsers.push(user.id);
    return { id: AccountIdSchema.parse(user.id), email: user.email.toLowerCase() };
  }

  afterAll(async () => {
    await Promise.all(createdUsers.map((id) => supabase.admin.auth.admin.deleteUser(id)));
    await db.destroy();
  });

  const invite = (user: { id: AccountId; email: string }, guardianEmail: string) =>
    guardianships.invite({
      accountId: user.id,
      accountEmail: user.email,
      guardianEmail,
      invitedAt: NOW,
    });

  it('invites once per address, however often it is asked', async () => {
    const user = await newAccount();
    const email = `g-${randomUUID()}@example.com`;

    const first = await invite(user, email);
    const again = await invite(user, email);

    expect(again.id).toBe(first.id);
    expect(await guardianships.listForAccount(user.id)).toHaveLength(1);
  });

  it('accepts only for the invited address, and then lists it for the Guardian', async () => {
    const user = await newAccount();
    const guardian = await newAccount();
    const invited = await invite(user, guardian.email);

    const wrongAddress = await guardianships.accept({
      guardianshipId: invited.id,
      guardianEmail: 'someone-else@example.com',
      guardianAccountId: guardian.id,
      acceptedAt: NOW,
    });
    const rightAddress = await guardianships.accept({
      guardianshipId: invited.id,
      guardianEmail: guardian.email,
      guardianAccountId: guardian.id,
      acceptedAt: NOW,
    });

    expect([wrongAddress, rightAddress]).toEqual([false, true]);
    expect(await guardianships.listForGuardian(guardian.id)).toMatchObject([
      { id: invited.id, state: 'active', accountEmail: user.email },
    ]);
  });

  it('lets only the user remove their Guardian, and only the Guardian step down', async () => {
    const user = await newAccount();
    const guardian = await newAccount();
    const stranger = await newAccount();
    const invited = await invite(user, guardian.email);
    await guardianships.accept({
      guardianshipId: invited.id,
      guardianEmail: guardian.email,
      guardianAccountId: guardian.id,
      acceptedAt: NOW,
    });

    await guardianships.remove({ accountId: stranger.id, guardianshipId: invited.id });
    await guardianships.stepDown({
      guardianshipId: invited.id,
      guardianAccountId: stranger.id,
      guardianEmail: stranger.email,
    });
    expect(await guardianships.find(invited.id)).toBeDefined();

    await guardianships.stepDown({
      guardianshipId: invited.id,
      guardianAccountId: guardian.id,
      guardianEmail: guardian.email,
    });
    expect(await guardianships.find(invited.id)).toBeUndefined();
  });

  it("goes when the user's Account is deleted", async () => {
    const user = await newAccount();
    const invited = await invite(user, `g-${randomUUID()}@example.com`);

    await supabase.admin.auth.admin.deleteUser(user.id);

    expect(await guardianships.find(invited.id)).toBeUndefined();
  });

  it('keeps "Guardians can turn this on" off until the user turns it on', async () => {
    const user = await newAccount();
    const account = await connectedAccounts.connect({
      accountId: user.id,
      platform: 'bluesky',
      externalId: `did:plc:test${randomUUID().replaceAll('-', '')}` as ExternalAccountId,
      handle: 'someone.bsky.social',
    });
    const stranger = await newAccount();

    const byStranger = await connectedAccounts.setGuardiansCanTurnOn({
      accountId: stranger.id,
      connectedAccountId: account.id,
      allowed: true,
    });
    const before = (await connectedAccounts.findById(account.id))?.guardiansCanTurnOn;
    await connectedAccounts.setGuardiansCanTurnOn({
      accountId: user.id,
      connectedAccountId: account.id,
      allowed: true,
    });

    expect([byStranger, before]).toEqual([false, false]);
    expect((await connectedAccounts.findById(account.id))?.guardiansCanTurnOn).toBe(true);
  });

  it('opts a Guardian out of emails with their token, and ignores an unknown one', async () => {
    const user = await newAccount();
    const invited = await invite(user, `g-${randomUUID()}@example.com`);

    const unknown = await guardianships.optOutOfEmails({ optOutToken: 'not-a-token', at: NOW });
    const known = await guardianships.optOutOfEmails({ optOutToken: invited.optOutToken, at: NOW });

    expect([unknown, known]).toEqual([false, true]);
    expect((await guardianships.find(invited.id))?.emailsOptedOut).toBe(true);
    expect(invited.optOutToken).toMatch(/^[0-9a-f]{48}$/);
  });
});
