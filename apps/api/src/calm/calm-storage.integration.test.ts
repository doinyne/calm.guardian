import { randomUUID } from 'node:crypto';

import { presetCalmPeriod } from '@calm-guardian/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';
import type { ConnectedAccount, ExternalAccountId } from '../connections/connected-account';
import { createConnectedAccountsRepository } from '../connections/connected-accounts-repository';
import { createSecretBox } from '../crypto/secret-box';
import { createDatabase } from '../db/database';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { connectToLocalSupabase } from '../testing/local-supabase';
import { captureLogs } from '../testing/log-capture';
import type { ArchivedPostId } from './archive';
import { createArchiveRepository } from './archive-repository';
import { createCalmMode } from './calm-mode';
import { createCalmSessionsRepository } from './calm-sessions-repository';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const PERIOD = presetCalmPeriod('last-7-days', NOW);

describe('Calm sessions and the Archive (local Supabase)', () => {
  const supabase = connectToLocalSupabase();
  const db = createDatabase(supabase.databaseUrl);
  const secretBox = createSecretBox(supabase.tokenEncryptionKeys);
  const connectedAccounts = createConnectedAccountsRepository(db);
  const calmSessions = createCalmSessionsRepository(db);
  const archive = createArchiveRepository({ db, secretBox });
  const createdUsers: string[] = [];

  async function newAccount(): Promise<AccountId> {
    const user = await supabase.createTestUser();
    createdUsers.push(user.id);
    return AccountIdSchema.parse(user.id);
  }

  let accountId: AccountId;

  beforeAll(async () => {
    accountId = await newAccount();
  });

  afterAll(async () => {
    await Promise.all(createdUsers.map((id) => supabase.admin.auth.admin.deleteUser(id)));
    await db.destroy();
  });

  const connectBluesky = (owner = accountId) =>
    connectedAccounts.connect({
      accountId: owner,
      platform: 'bluesky',
      externalId: `did:plc:test${randomUUID().replaceAll('-', '')}` as ExternalAccountId,
      handle: 'someone.bsky.social',
    });

  const openSession = (connected: ConnectedAccount) =>
    calmSessions.openFor({
      accountId: connected.accountId,
      connectedAccountId: connected.id,
      period: PERIOD,
      startedAt: NOW,
    });

  /** Backs up the posts in a new Calm session and returns their Archive entries. */
  async function backUp(connected: ConnectedAccount, ...posts: ReturnType<typeof aPost>[]) {
    const session = await openSession(connected);
    await archive.saveAll({
      accountId: connected.accountId,
      calmSessionId: session.id,
      connectedAccountId: connected.id,
      posts,
      backedUpAt: NOW,
    });
    return { session, entries: await archive.listNotHidden(session.id) };
  }

  const rowCount = async (table: 'archived_posts' | 'calm_sessions', connectedAccountId: string) =>
    Number(
      (
        await db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll<string>().as('count'))
          .where('connected_account_id', '=', connectedAccountId)
          .executeTakeFirstOrThrow()
      ).count,
    );

  describe('Calm sessions', () => {
    it('open once per connected account, however often they are asked for', async () => {
      const connected = await connectBluesky();

      const first = await openSession(connected);
      const again = await openSession(connected);

      expect(again.id).toBe(first.id);
      expect(first).toMatchObject({ state: 'activating', period: PERIOD });
    });

    it('open once even when many requests arrive at the same moment', async () => {
      const connected = await connectBluesky();

      const sessions = await Promise.all(Array.from({ length: 8 }, () => openSession(connected)));

      expect(new Set(sessions.map((session) => session.id)).size).toBe(1);
      expect(await rowCount('calm_sessions', connected.id)).toBe(1);
    });

    it('open a new session after a failed one', async () => {
      const connected = await connectBluesky();
      const failed = await openSession(connected);
      await calmSessions.markFailed({
        calmSessionId: failed.id,
        reason: 'backup-failed',
        failedAt: NOW,
      });

      const next = await openSession(connected);

      expect(next.id).not.toBe(failed.id);
    });

    it('refuse to become active twice', async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);
      await calmSessions.markActive({ calmSessionId: session.id, activatedAt: NOW });

      await expect(
        calmSessions.markActive({ calmSessionId: session.id, activatedAt: NOW }),
      ).rejects.toThrow(/not activating/);
    });
  });

  describe('the Archive', () => {
    it('stores post content encrypted, and gives it back exactly', async () => {
      const connected = await connectBluesky();
      const post = aPost('2026-11-04T09:00:00.000Z');
      const {
        entries: [entry],
      } = await backUp(connected, post);
      if (!entry) throw new Error('expected a backup');

      const row = await db
        .selectFrom('archived_posts')
        .select('record_encrypted')
        .where('id', '=', entry.id)
        .executeTakeFirstOrThrow();
      expect(row.record_encrypted).not.toContain(String(post.record.text));
      expect(await archive.readPost(entry.id)).toEqual(post);
    });

    it('holds each post once, however often it is backed up', async () => {
      const connected = await connectBluesky();
      const post = aPost('2026-11-04T09:00:00.000Z');

      await backUp(connected, post);
      await backUp(connected, post);

      expect(await rowCount('archived_posts', connected.id)).toBe(1);
    });

    it('counts hidden posts', async () => {
      const connected = await connectBluesky();
      const { session, entries } = await backUp(
        connected,
        aPost('2026-11-04T08:00:00.000Z'),
        aPost('2026-11-04T09:00:00.000Z'),
      );
      const [first] = entries;
      if (!first) throw new Error('expected backups');

      await archive.markHidden({ archivedPostId: first.id, hiddenAt: NOW });

      expect(await archive.countHidden(session.id)).toBe(1);
      expect(await archive.countHiddenForConnectedAccount(connected.id)).toBe(1);
      expect(await archive.listNotHidden(session.id)).toHaveLength(1);
    });

    it('has nothing for an unknown post', async () => {
      expect(await archive.readPost(randomUUID() as ArchivedPostId)).toBeUndefined();
    });
  });

  describe('disconnecting', () => {
    it('is refused by the database while the connected account has hidden posts', async () => {
      const connected = await connectBluesky();
      const {
        entries: [entry],
      } = await backUp(connected, aPost('2026-11-04T09:00:00.000Z'));
      if (!entry) throw new Error('expected a backup');
      await archive.markHidden({ archivedPostId: entry.id, hiddenAt: NOW });

      await expect(
        connectedAccounts.disconnect({ accountId, connectedAccountId: connected.id }),
      ).rejects.toThrow(/hidden posts/);
      expect(await archive.readPost(entry.id)).toBeDefined();
    });

    it('goes ahead when every backed-up post is still visible, and drops those backups', async () => {
      const connected = await connectBluesky();
      await backUp(connected, aPost('2026-11-04T09:00:00.000Z'));

      await connectedAccounts.disconnect({ accountId, connectedAccountId: connected.id });

      expect(await rowCount('archived_posts', connected.id)).toBe(0);
      expect(await rowCount('calm_sessions', connected.id)).toBe(0);
    });

    it('never stops the whole Account being deleted, which deletes every post', async () => {
      const owner = await newAccount();
      const connected = await connectBluesky(owner);
      const {
        entries: [entry],
      } = await backUp(connected, aPost('2026-11-04T09:00:00.000Z'));
      if (!entry) throw new Error('expected a backup');
      await archive.markHidden({ archivedPostId: entry.id, hiddenAt: NOW });

      const { error } = await supabase.admin.auth.admin.deleteUser(owner);

      expect(error).toBeNull();
      expect(await rowCount('archived_posts', connected.id)).toBe(0);
      expect(await rowCount('calm_sessions', connected.id)).toBe(0);
    });
  });

  it('turns Calm Mode on end to end: posts backed up, encrypted and hidden', async () => {
    const connected = await connectBluesky();
    const platform = new FakePlatformPosts([], 2);
    const posts = [
      aPost('2026-11-04T07:00:00.000Z'),
      aPost('2026-11-04T08:00:00.000Z'),
      aPost('2026-11-04T09:00:00.000Z'),
    ];
    platform.publish(connected.id, ...posts);
    const calmMode = createCalmMode({
      connectedAccounts,
      platformPosts: platform,
      archive,
      calmSessions,
      now: () => NOW,
      logger: captureLogs().logger,
    });
    const activation = { accountId, connectedAccountId: connected.id, period: PERIOD };

    const result = await calmMode.activate(activation);
    const again = await calmMode.activate(activation);

    expect(result).toMatchObject({ outcome: 'active', hidden: 3, stillVisible: 0 });
    expect(again.outcome).toBe('already-active');
    expect(platform.visibleUris(connected.id)).toEqual([]);
    expect(await archive.countHiddenForConnectedAccount(connected.id)).toBe(3);
  });
});
