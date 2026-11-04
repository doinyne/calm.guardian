import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { captureLogs } from '../testing/log-capture';
import type { ArchivedPostId } from './archive';
import { createCalmMode } from './calm-mode';
import { ArchivedPostNotFoundError, createRestore } from './restore';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const ME = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;
const SOMEONE_ELSE = '9d4e1f60-7a2b-4c8d-8e3f-1a2b3c4d5e6f' as AccountId;
const hoursAgo = (hours: number, options?: { mediaCount?: number }) =>
  aPost(new Date(NOW.getTime() - hours * 3_600_000).toISOString(), options);

/**
 * Real Calm Mode and Restore over shared fakes. `hide` turns Calm Mode on and off for an account, so
 * its posts end up hidden and ready for Review.
 */
async function setUp() {
  const operations: string[] = [];
  const connectedAccounts = new FakeConnectedAccounts();
  const platform = new FakePlatformPosts(operations);
  const archive = new FakeArchive(operations);
  const calmSessions = new FakeCalmSessions();
  const logger = captureLogs().logger;
  const now = () => NOW;
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive,
    calmSessions,
    now,
    logger,
  });
  const restore = createRestore({
    connectedAccounts,
    calmSessions,
    archive,
    platformPosts: platform,
    now,
    logger,
  });

  const account = await connectedAccounts.connect({
    accountId: ME,
    platform: 'bluesky',
    externalId: 'did:plc:dean' as ExternalAccountId,
    handle: 'dean.bsky.social',
  });

  async function hide(...posts: ReturnType<typeof aPost>[]) {
    platform.publish(account.id, ...posts);
    await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-7-days', NOW),
    });
    await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });
    operations.length = 0;
    const idOf = (uri: string) =>
      archive.all().find((entry) => entry.uri === uri)?.id as ArchivedPostId;
    return posts.map((post) => idOf(post.uri));
  }

  return { restore, calmMode, platform, archive, operations, account, hide, connectedAccounts };
}

describe('restoring a hidden post', () => {
  it('puts it back exactly as it was, at its original address', async () => {
    const { restore, platform, archive, account, hide } = await setUp();
    const post = hoursAgo(2);
    const [id] = await hide(post);

    const result = await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(result).toEqual({ outcome: 'restored' });
    expect(platform.visibleUris(account.id)).toEqual([post.uri]);
    expect(archive.all()[0]?.restoredAt).toEqual(NOW);
  });

  it('uploads its files before the post that uses them', async () => {
    const { restore, operations, hide } = await setUp();
    const post = hoursAgo(2, { mediaCount: 2 });
    const [id] = await hide(post);

    await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(operations).toEqual([
      ...post.media.map((media) => `upload ${media.cid}`),
      `restore ${post.uri}`,
      `mark restored ${post.uri}`,
    ]);
  });

  it('never creates a duplicate, even when retried after a half-finished attempt', async () => {
    const { restore, platform, archive, account, hide } = await setUp();
    const post = hoursAgo(2);
    const [id] = await hide(post);
    // An earlier attempt re-created the post, then stopped before recording it.
    platform.publish(account.id, post);

    const result = await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(result).toEqual({ outcome: 'restored' });
    expect(platform.visibleUris(account.id)).toEqual([post.uri]);
    expect(archive.all()[0]?.restoredAt).toEqual(NOW);
  });

  it('is safe to repeat once restored', async () => {
    const { restore, operations, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));
    await restore.restore({ accountId: ME, archivedPostId: id! });
    operations.length = 0;

    const again = await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(again).toEqual({ outcome: 'already-restored' });
    expect(operations).toEqual([]);
  });

  it('waits while Calm Mode is on for that account, so it is not hidden again straight away', async () => {
    const { restore, calmMode, platform, account, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));
    await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });

    const result = await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(result).toEqual({ outcome: 'calm-mode-on' });
    expect(platform.visibleUris(account.id)).toEqual([]);
  });

  it('asks the user to sign in again when the Platform stopped accepting us', async () => {
    const { restore, connectedAccounts, account, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));
    await connectedAccounts.markNeedsReauth({
      platform: 'bluesky',
      externalId: account.externalId,
    });

    expect(await restore.restore({ accountId: ME, archivedPostId: id! })).toEqual({
      outcome: 'needs-sign-in',
    });
  });

  it('waits when the Platform asks it to slow down, and stays hidden until then', async () => {
    const { restore, platform, archive, account, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));
    const resetAt = new Date('2026-11-04T13:00:00.000Z');
    platform.rateLimitNextRestore(resetAt);

    const result = await restore.restore({ accountId: ME, archivedPostId: id! });

    expect(result).toEqual({ outcome: 'waiting', until: resetAt });
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(archive.all()[0]?.restoredAt).toBeUndefined();
  });

  it("refuses another Account's post", async () => {
    const { restore, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));

    await expect(restore.restore({ accountId: SOMEONE_ELSE, archivedPostId: id! })).rejects.toThrow(
      ArchivedPostNotFoundError,
    );
  });
});

describe('keeping hidden, and deleting for good', () => {
  it('keeps a post hidden, which clears it from Review without restoring it', async () => {
    const { restore, archive, platform, account, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));

    await restore.keepHidden({ accountId: ME, archivedPostId: id! });

    expect(await archive.countToReview(ME)).toBe(0);
    expect(platform.visibleUris(account.id)).toEqual([]);
  });

  it('deletes our copy for good', async () => {
    const { restore, archive, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));

    await restore.deleteForGood({ accountId: ME, archivedPostId: id! });

    expect(archive.all()).toEqual([]);
  });

  it("refuses another Account's post", async () => {
    const { restore, archive, hide } = await setUp();
    const [id] = await hide(hoursAgo(2));

    await expect(
      restore.deleteForGood({ accountId: SOMEONE_ELSE, archivedPostId: id! }),
    ).rejects.toThrow(ArchivedPostNotFoundError);
    expect(archive.all()).toHaveLength(1);
  });
});

describe('restoring everything for an account', () => {
  it('restores oldest first, so threads come back in order, and skips posts kept hidden', async () => {
    const { restore, operations, account, hide } = await setUp();
    const posts = [hoursAgo(1), hoursAgo(3), hoursAgo(2)];
    const [, , keep] = await hide(...posts);
    await restore.keepHidden({ accountId: ME, archivedPostId: keep! });

    const result = await restore.restoreAll({ accountId: ME, connectedAccountId: account.id });

    expect(result).toEqual({ outcome: 'done' });
    expect(operations.filter((operation) => operation.startsWith('restore'))).toEqual([
      `restore ${posts[1]?.uri}`,
      `restore ${posts[0]?.uri}`,
    ]);
  });

  it('stops at its deadline after some progress, so the job can carry on', async () => {
    const { restore, account, hide, platform } = await setUp();
    await hide(hoursAgo(1), hoursAgo(2), hoursAgo(3));

    const first = await restore.restoreAll({
      accountId: ME,
      connectedAccountId: account.id,
      deadline: NOW,
    });

    expect(first).toEqual({ outcome: 'in-progress' });
    expect(platform.visibleUris(account.id)).toHaveLength(1);
  });

  it("waits for the Platform's limit to reset", async () => {
    const { restore, account, hide, platform } = await setUp();
    await hide(hoursAgo(1));
    const resetAt = new Date('2026-11-04T13:00:00.000Z');
    platform.rateLimitNextRestore(resetAt);

    expect(await restore.restoreAll({ accountId: ME, connectedAccountId: account.id })).toEqual({
      outcome: 'waiting',
      until: resetAt,
    });
  });

  it("doesn't stop for one post the Platform refuses; it's left for Review", async () => {
    const { restore, account, hide, platform } = await setUp();
    const refused = hoursAgo(3);
    await hide(refused, hoursAgo(2));
    platform.failToRestore(refused.uri);

    const result = await restore.restoreAll({ accountId: ME, connectedAccountId: account.id });

    expect(result).toEqual({ outcome: 'done', notRestored: 1 });
    expect(platform.visibleUris(account.id)).toHaveLength(1);
  });

  it('can start only while Calm Mode is off for the account', async () => {
    const { restore, calmMode, account, hide } = await setUp();
    await hide(hoursAgo(1));
    const canRestore = () =>
      restore.canRestoreAll({ accountId: ME, connectedAccountId: account.id });

    const whileOff = await canRestore();
    await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: presetCalmPeriod('last-24-hours', NOW),
    });

    expect([whileOff, await canRestore()]).toEqual(['yes', 'calm-mode-on']);
  });
});
