import { randomUUID } from 'node:crypto';

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';
import { createDatabase } from '../db/database';
import { connectToLocalSupabase } from '../testing/local-supabase';
import type { ExternalAccountId } from './connected-account';
import {
  ConnectedElsewhereError,
  createConnectedAccountsRepository,
} from './connected-accounts-repository';

describe('connected accounts repository (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const db = createDatabase(supabase.databaseUrl);
  const repository = createConnectedAccountsRepository(db);
  const createdUsers: string[] = [];

  async function newAccount(): Promise<AccountId> {
    const user = await supabase.createTestUser();
    createdUsers.push(user.id);
    return AccountIdSchema.parse(user.id);
  }

  const newDid = () => `did:plc:test${randomUUID().replaceAll('-', '')}` as ExternalAccountId;

  const connectBluesky = (
    accountId: AccountId,
    externalId = newDid(),
    handle = 'someone.bsky.social',
  ) => repository.connect({ accountId, platform: 'bluesky', externalId, handle });

  const storedSessionCount = async (key: string) =>
    (
      await db
        .selectFrom('atproto_oauth_sessions')
        .select((eb) => eb.fn.countAll<string>().as('count'))
        .where('key', '=', key)
        .executeTakeFirstOrThrow()
    ).count;

  const storeSessionFor = (did: string) =>
    db
      .insertInto('atproto_oauth_sessions')
      .values({ key: did, value_encrypted: 'v1.sealed' })
      .execute();

  let accountId: AccountId;

  beforeAll(async () => {
    accountId = await newAccount();
  });

  afterAll(async () => {
    await Promise.all(createdUsers.map((id) => supabase.admin.auth.admin.deleteUser(id)));
    await db.destroy();
  });

  it('lets an Account connect several accounts, including two on the same Platform', async () => {
    const owner = await newAccount();

    await connectBluesky(owner, newDid(), 'first.bsky.social');
    await connectBluesky(owner, newDid(), 'second.bsky.social');

    const handles = (await repository.listForAccount(owner)).map(({ handle }) => handle);
    expect(handles).toEqual(['first.bsky.social', 'second.bsky.social']);
  });

  it('starts a new connection as active', async () => {
    const connected = await connectBluesky(accountId);

    expect(connected).toMatchObject({ accountId, platform: 'bluesky', status: 'active' });
  });

  it("lists only the Account's own connected accounts", async () => {
    const [mine, theirs] = [await newAccount(), await newAccount()];
    await connectBluesky(mine);
    await connectBluesky(theirs);

    const listed = await repository.listForAccount(mine);

    expect(listed.map((account) => account.accountId)).toEqual([mine]);
  });

  it('updates an account connected again, instead of adding a duplicate', async () => {
    const owner = await newAccount();
    const did = newDid();
    const first = await connectBluesky(owner, did, 'old-handle.bsky.social');
    await db
      .updateTable('connected_accounts')
      .set({ status: 'needs_reauth' })
      .where('id', '=', first.id)
      .execute();

    const again = await connectBluesky(owner, did, 'new-handle.bsky.social');

    expect(again).toMatchObject({
      id: first.id,
      handle: 'new-handle.bsky.social',
      status: 'active',
    });
    expect(await repository.listForAccount(owner)).toHaveLength(1);
  });

  it('refuses an account already connected to another Account, and leaves it as it was', async () => {
    const [owner, someoneElse] = [await newAccount(), await newAccount()];
    const did = newDid();
    await connectBluesky(owner, did, 'owners-handle.bsky.social');

    await expect(connectBluesky(someoneElse, did, 'taken.bsky.social')).rejects.toThrow(
      ConnectedElsewhereError,
    );

    expect(await repository.listForAccount(someoneElse)).toEqual([]);
    expect((await repository.listForAccount(owner))[0]?.handle).toBe('owners-handle.bsky.social');
  });

  it('disconnects an account and deletes its stored session, safely when repeated', async () => {
    const did = newDid();
    const connected = await connectBluesky(accountId, did);
    await storeSessionFor(did);

    await repository.disconnect({ accountId, connectedAccountId: connected.id });
    await repository.disconnect({ accountId, connectedAccountId: connected.id });

    expect((await repository.listForAccount(accountId)).map(({ id }) => id)).not.toContain(
      connected.id,
    );
    expect(await storedSessionCount(did)).toBe('0');
  });

  it("never disconnects another Account's connected account", async () => {
    const [owner, someoneElse] = [await newAccount(), await newAccount()];
    const connected = await connectBluesky(owner);

    await repository.disconnect({ accountId: someoneElse, connectedAccountId: connected.id });

    expect(await repository.listForAccount(owner)).toHaveLength(1);
  });

  it('deletes connected accounts and their sessions when the Account is deleted', async () => {
    const owner = await newAccount();
    const did = newDid();
    await connectBluesky(owner, did);
    await storeSessionFor(did);

    const { error } = await supabase.admin.auth.admin.deleteUser(owner);

    expect(error).toBeNull();
    expect(await repository.listForAccount(owner)).toEqual([]);
    expect(await storedSessionCount(did)).toBe('0');
  });

  it("finds an Account's own connected account, and nobody else's", async () => {
    const [owner, someoneElse] = [await newAccount(), await newAccount()];
    const connected = await connectBluesky(owner);

    await expect(
      repository.findForAccount({ accountId: owner, connectedAccountId: connected.id }),
    ).resolves.toEqual(connected);
    await expect(
      repository.findForAccount({ accountId: someoneElse, connectedAccountId: connected.id }),
    ).resolves.toBeUndefined();
  });

  it('marks a connection as needing a fresh sign-in when the Platform stops accepting it', async () => {
    const did = newDid();
    await connectBluesky(accountId, did);

    await repository.markNeedsReauth({ platform: 'bluesky', externalId: did });

    const marked = (await repository.listForAccount(accountId)).find(
      ({ externalId }) => externalId === did,
    );
    expect(marked?.status).toBe('needs_reauth');
  });

  it('says whether any Account has a Platform account connected', async () => {
    const did = newDid();

    await expect(repository.isConnected({ platform: 'bluesky', externalId: did })).resolves.toBe(
      false,
    );
    await connectBluesky(accountId, did);
    await expect(repository.isConnected({ platform: 'bluesky', externalId: did })).resolves.toBe(
      true,
    );
  });

  it.each(['anon', 'authenticated'])(
    'gives the app’s %s database role no access at all',
    async (role) => {
      // One connection, outside a transaction, so the expected error doesn't abort anything.
      await db.connection().execute(async (connection) => {
        await sql`set role ${sql.raw(role)}`.execute(connection);
        try {
          for (const table of ['connected_accounts', 'atproto_oauth_sessions'] as const) {
            await expect(connection.selectFrom(table).selectAll().execute()).rejects.toThrow(
              /permission denied/,
            );
          }
        } finally {
          await sql`reset role`.execute(connection);
        }
      });
    },
  );
});
