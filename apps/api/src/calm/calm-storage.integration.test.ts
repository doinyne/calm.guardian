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
import { createRestore } from './restore';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const PERIOD = presetCalmPeriod('last-7-days', NOW);
const imageBytes = (cid: string) => new Uint8Array(Buffer.from(`pretend JPEG for ${cid}`));

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
    for (const post of posts) {
      await archive.save({
        accountId: connected.accountId,
        calmSessionId: session.id,
        connectedAccountId: connected.id,
        post,
        media: post.media.map((media) => ({ ...media, bytes: imageBytes(media.cid) })),
        backedUpAt: NOW,
      });
    }
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

    it('can be claimed by only one worker at a time, even when several race', async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);
      const until = new Date(NOW.getTime() + 60_000);

      const claims = await Promise.all(
        Array.from({ length: 6 }, () =>
          calmSessions.claim({ calmSessionId: session.id, until, now: NOW }),
        ),
      );

      expect(claims.filter(Boolean)).toHaveLength(1);
    });

    it("can be claimed again once a worker's claim runs out, or is released", async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);
      const claim = (now: Date) =>
        calmSessions.claim({
          calmSessionId: session.id,
          until: new Date(now.getTime() + 60_000),
          now,
        });

      await claim(NOW);
      const afterExpiry = await claim(new Date(NOW.getTime() + 61_000));
      await calmSessions.release(session.id);
      const afterRelease = await claim(NOW);

      expect([afterExpiry, afterRelease]).toEqual([true, true]);
    });

    it('remember where the next run carries on', async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);

      await calmSessions.saveProgress({ calmSessionId: session.id, resumeCursor: '3kabc' });

      expect(await calmSessions.find(session.id)).toMatchObject({
        accountId,
        resumeCursor: '3kabc',
        failure: null,
      });
    });

    it('end once Calm Mode is turned off, and a new one can open', async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);
      await calmSessions.markActive({ calmSessionId: session.id, activatedAt: NOW });

      await calmSessions.end({ calmSessionId: session.id, endedAt: NOW });

      expect(await calmSessions.findOpenFor(connected.id)).toBeUndefined();
      expect((await calmSessions.find(session.id))?.state).toBe('ended');
      expect((await openSession(connected)).id).not.toBe(session.id);
    });

    it('are listed for the Sweep only while Calm Mode is on', async () => {
      const activating = await openSession(await connectBluesky());
      const on = await openSession(await connectBluesky());
      await calmSessions.markActive({ calmSessionId: on.id, activatedAt: NOW });
      const ended = await openSession(await connectBluesky());
      await calmSessions.markActive({ calmSessionId: ended.id, activatedAt: NOW });
      await calmSessions.end({ calmSessionId: ended.id, endedAt: NOW });

      const active = await calmSessions.listActive();

      expect(active).toContain(on.id);
      expect(active).not.toContain(activating.id);
      expect(active).not.toContain(ended.id);
    });

    it("can't end while still activating", async () => {
      const connected = await connectBluesky();
      const session = await openSession(connected);

      await expect(calmSessions.end({ calmSessionId: session.id, endedAt: NOW })).rejects.toThrow(
        /not active/,
      );
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

    it("stores the post's files encrypted, and gives them back exactly", async () => {
      const connected = await connectBluesky();
      const post = aPost('2026-11-04T09:00:00.000Z', { mediaCount: 2 });
      const {
        entries: [entry],
      } = await backUp(connected, post);
      if (!entry) throw new Error('expected a backup');

      const rows = await db
        .selectFrom('archived_media')
        .select('content_encrypted')
        .where('archived_post_id', '=', entry.id)
        .execute();
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.content_encrypted.includes('pretend JPEG')).toBe(false);
      expect(
        (await archive.readMedia(entry.id)).map((copy) => Buffer.from(copy.bytes).toString()),
      ).toEqual(post.media.map((media) => `pretend JPEG for ${media.cid}`).sort());
      expect((await archive.readPost(entry.id))?.media).toEqual(post.media);
    });

    it('holds each post once, however often it is backed up', async () => {
      const connected = await connectBluesky();
      const post = aPost('2026-11-04T09:00:00.000Z', { mediaCount: 1 });

      await backUp(connected, post);
      const {
        entries: [entry],
      } = await backUp(connected, post);

      expect(await rowCount('archived_posts', connected.id)).toBe(1);
      expect(await archive.readMedia(entry?.id ?? ('' as ArchivedPostId))).toHaveLength(1);
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

  describe('Review and Restore', () => {
    /** Hides the posts as a whole Calm session would, then turns it off. Returns their Archive IDs. */
    async function hidden(connected: ConnectedAccount, ...posts: ReturnType<typeof aPost>[]) {
      const { session, entries } = await backUp(connected, ...posts);
      for (const entry of entries) {
        await archive.markHidden({ archivedPostId: entry.id, hiddenAt: NOW });
      }
      // Calm Mode turned on, then off: Review happens once it's off.
      await calmSessions.markActive({ calmSessionId: session.id, activatedAt: NOW });
      await calmSessions.end({ calmSessionId: session.id, endedAt: NOW });
      return posts.map(
        (post) => entries.find((entry) => entry.uri === post.uri)?.id as ArchivedPostId,
      );
    }

    it('lists hidden posts decrypted, to review first, newest first, with their files', async () => {
      const owner = await newAccount();
      const connected = await connectBluesky(owner);
      const older = aPost('2026-11-03T09:00:00.000Z', { mediaCount: 1 });
      const newer = aPost('2026-11-04T09:00:00.000Z');
      const kept = aPost('2026-11-04T10:00:00.000Z');
      const [, , keptId] = await hidden(connected, older, newer, kept);
      await archive.markKeptHidden({ archivedPostId: keptId!, keptAt: NOW });

      const { items, more } = await archive.listHidden({ accountId: owner, limit: 10 });

      expect(more).toBe(false);
      expect(items.map((item) => [item.post.uri, item.state])).toEqual([
        [newer.uri, 'to-review'],
        [older.uri, 'to-review'],
        [kept.uri, 'kept-hidden'],
      ]);
      expect(items[1]?.post.record).toEqual(older.record);
      expect(items[1]?.post.media).toEqual(older.media);
      expect(await archive.countToReview(owner)).toBe(2);
    });

    it("never shows one Account another Account's posts", async () => {
      const owner = await newAccount();
      const [id] = await hidden(await connectBluesky(owner), aPost('2026-11-04T09:00:00.000Z'));

      expect(
        (await archive.listHidden({ accountId, limit: 10 })).items.map((item) => item.id),
      ).not.toContain(id);
      expect(await archive.find({ accountId, archivedPostId: id! })).toBeUndefined();
    });

    it('restores end to end: files uploaded, the exact post back, recorded once', async () => {
      const owner = await newAccount();
      const connected = await connectBluesky(owner);
      const post = aPost('2026-11-04T09:00:00.000Z', { mediaCount: 1 });
      const [id] = await hidden(connected, post);
      const operations: string[] = [];
      const platform = new FakePlatformPosts(operations);
      const restore = createRestore({
        connectedAccounts,
        calmSessions,
        archive,
        platformPosts: platform,
        now: () => NOW,
        logger: captureLogs().logger,
      });

      const first = await restore.restore({ accountId: owner, archivedPostId: id! });
      const again = await restore.restore({ accountId: owner, archivedPostId: id! });

      expect([first.outcome, again.outcome]).toEqual(['restored', 'already-restored']);
      expect(operations).toEqual([`upload ${post.media[0]?.cid}`, `restore ${post.uri}`]);
      expect(platform.visibleUris(connected.id)).toEqual([post.uri]);
      expect(await archive.countHiddenForConnectedAccount(connected.id)).toBe(0);
    });

    it('lets an account be disconnected once all its posts are restored', async () => {
      const owner = await newAccount();
      const connected = await connectBluesky(owner);
      const [id] = await hidden(connected, aPost('2026-11-04T09:00:00.000Z'));
      await archive.markRestored({ archivedPostId: id!, restoredAt: NOW });

      await connectedAccounts.disconnect({ accountId: owner, connectedAccountId: connected.id });

      expect(await rowCount('archived_posts', connected.id)).toBe(0);
    });

    it('deletes a post and its files for good', async () => {
      const owner = await newAccount();
      const connected = await connectBluesky(owner);
      const [id] = await hidden(connected, aPost('2026-11-04T09:00:00.000Z', { mediaCount: 2 }));

      await archive.deleteForGood({ accountId: owner, archivedPostId: id! });

      expect(await rowCount('archived_posts', connected.id)).toBe(0);
      const files = await db
        .selectFrom('archived_media')
        .select('id')
        .where('archived_post_id', '=', id!)
        .execute();
      expect(files).toEqual([]);
    });
  });
});
