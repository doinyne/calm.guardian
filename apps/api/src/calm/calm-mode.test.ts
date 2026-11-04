import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { captureLogs } from '../testing/log-capture';
import type { CalmSessionId } from './calm-session';
import { ConnectedAccountNotFoundError, createCalmMode, type ActivationResult } from './calm-mode';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const LAST_7_DAYS = presetCalmPeriod('last-7-days', NOW);
const ME = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;
const SOMEONE_ELSE = '9d4e1f60-7a2b-4c8d-8e3f-1a2b3c4d5e6f' as AccountId;

/** Calm Mode wired to fakes that share one log of what happened, in order. */
function setUp({ pageSize }: { pageSize?: number } = {}) {
  const operations: string[] = [];
  const connectedAccounts = new FakeConnectedAccounts();
  const platform = new FakePlatformPosts(operations, pageSize);
  const archive = new FakeArchive(operations);
  const calmSessions = new FakeCalmSessions();
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive,
    calmSessions,
    now: () => NOW,
    logger: captureLogs().logger,
  });

  const connect = (handle: string, accountId = ME) =>
    connectedAccounts.connect({
      accountId,
      platform: 'bluesky',
      externalId: `did:plc:${handle}` as ExternalAccountId,
      handle: `${handle}.bsky.social`,
    });

  return { calmMode, connectedAccounts, platform, archive, calmSessions, operations, connect };
}

/** `count` posts, one an hour, going back from just before now. */
function recentPosts(count: number) {
  return Array.from({ length: count }, (_, hour) =>
    aPost(new Date(NOW.getTime() - (hour + 1) * 60 * 60 * 1000).toISOString()),
  );
}

describe('turning Calm Mode on for a connected account', () => {
  it('deletes each post only after it has been backed up', async () => {
    const { calmMode, platform, operations, connect } = setUp({ pageSize: 2 });
    const account = await connect('dean');
    const posts = recentPosts(5);
    platform.publish(account.id, ...posts);

    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    for (const post of posts) {
      const backedUpAt = operations.indexOf(`back up ${post.uri}`);
      expect(backedUpAt).toBeGreaterThanOrEqual(0);
      expect(backedUpAt).toBeLessThan(operations.indexOf(`delete ${post.uri}`));
    }
  });

  it('hides the newest posts first, so a recent post is hidden without waiting for older ones', async () => {
    const { calmMode, platform, operations, connect } = setUp({ pageSize: 2 });
    const account = await connect('dean');
    const posts = recentPosts(5); // newest first
    platform.publish(account.id, ...[...posts].reverse());

    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    const deletes = operations.filter((operation) => operation.startsWith('delete'));
    expect(deletes).toEqual(posts.map((post) => `delete ${post.uri}`));
    // The newest post is gone before the oldest is even backed up.
    const [newest] = posts;
    const oldest = posts.at(-1);
    expect(operations.indexOf(`delete ${newest?.uri}`)).toBeLessThan(
      operations.indexOf(`back up ${oldest?.uri}`),
    );
  });

  it('hides the backed-up posts and says how many', async () => {
    const { calmMode, platform, archive, calmSessions, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(3));

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'active', hidden: 3, stillVisible: 0 });
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(archive.all().every((entry) => entry.hiddenAt)).toBe(true);
    expect(calmSessions.all().map((session) => session.state)).toEqual(['active']);
  });

  it('keeps the whole post, so it can be restored as it was', async () => {
    const { calmMode, platform, archive, connect } = setUp();
    const account = await connect('dean');
    const post = aPost('2026-11-04T09:00:00.000Z');
    platform.publish(account.id, post);

    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    expect(archive.all()[0]?.post).toEqual(post);
  });

  it('leaves posts outside the period alone', async () => {
    const { calmMode, platform, archive, connect } = setUp();
    const account = await connect('dean');
    const older = aPost('2026-10-01T09:00:00.000Z');
    platform.publish(account.id, older, aPost('2026-11-04T09:00:00.000Z'));

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'active', hidden: 1 });
    expect(platform.visibleUris(account.id)).toEqual([older.uri]);
    expect(archive.all()).toHaveLength(1);
  });

  it('covers every page of posts, not just the first', async () => {
    const { calmMode, platform, connect } = setUp({ pageSize: 100 });
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(150));

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'active', hidden: 150 });
    expect(platform.visibleUris(account.id)).toEqual([]);
  });

  it('turns on with nothing to hide when the period has no posts', async () => {
    const { calmMode, connect } = setUp();
    const account = await connect('dean');

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'active', hidden: 0, stillVisible: 0 });
  });
});

describe("a post's images and other files", () => {
  it('are copied into the Archive with their post, before anything is deleted', async () => {
    const { calmMode, platform, archive, operations, connect } = setUp();
    const account = await connect('dean');
    const post = aPost('2026-11-04T09:00:00.000Z', { mediaCount: 2 });
    platform.publish(account.id, post);

    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    expect(archive.all()[0]?.media.map((copy) => copy.cid)).toEqual(
      post.media.map((media) => media.cid),
    );
    expect(archive.all()[0]?.media.map((copy) => Buffer.from(copy.bytes).toString())).toEqual(
      post.media.map((media) => `bytes of ${media.cid}`),
    );
    const fetches = operations.filter((operation) => operation.startsWith('fetch'));
    expect(fetches).toHaveLength(2);
    expect(operations.indexOf(`back up ${post.uri}`)).toBeLessThan(
      operations.indexOf(`delete ${post.uri}`),
    );
  });

  it("stop everything when one can't be fetched: nothing is deleted", async () => {
    const { calmMode, platform, calmSessions, operations, connect } = setUp();
    const account = await connect('dean');
    const withImage = aPost('2026-11-04T09:00:00.000Z', { mediaCount: 1 });
    platform.publish(account.id, aPost('2026-11-04T08:00:00.000Z'), withImage);
    const [image] = withImage.media;
    if (!image) throw new Error('expected an image');
    platform.failToFetchMedia(image.cid);

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'failed', reason: 'could-not-read-posts' });
    expect(operations.filter((operation) => operation.startsWith('delete'))).toEqual([]);
    expect(platform.visibleUris(account.id)).toHaveLength(2);
    expect(calmSessions.all()[0]?.state).toBe('failed');
  });
});

describe('when something goes wrong', () => {
  it('changes nothing when the first backup fails, and the Calm session fails', async () => {
    const { calmMode, platform, archive, calmSessions, operations, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(5));
    archive.failSavesAfter(0);

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'failed', reason: 'backup-failed' });
    expect(operations.filter((operation) => operation.startsWith('delete'))).toEqual([]);
    expect(platform.visibleUris(account.id)).toHaveLength(5);
    expect(calmSessions.all()[0]).toMatchObject({ state: 'failed', failure: 'backup-failed' });
  });

  it('keeps hidden posts hidden when a backup fails partway, and carries on next time', async () => {
    const { calmMode, platform, archive, calmSessions, connect } = setUp({ pageSize: 2 });
    const account = await connect('dean');
    const posts = recentPosts(5);
    platform.publish(account.id, ...posts);
    archive.failSavesAfter(2); // the two newest are stored and hidden, then storage fails
    const activation = { accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS };

    const interrupted = await calmMode.activate(activation);

    expect(interrupted).toMatchObject({
      outcome: 'interrupted',
      hidden: 2,
      reason: 'backup-failed',
    });
    expect(platform.visibleUris(account.id)).toEqual(posts.slice(2).map((post) => post.uri));
    expect(calmSessions.all()[0]?.state).toBe('activating');

    archive.failSavesAfter(Infinity);
    const finished = await calmMode.activate(activation);

    expect(finished).toMatchObject({ outcome: 'active', hidden: 5, stillVisible: 0 });
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(calmSessions.all()).toHaveLength(1);
  });

  it("deletes nothing when the Platform can't list the posts", async () => {
    const { calmMode, platform, calmSessions, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(2));
    platform.failToList();

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'failed', reason: 'could-not-read-posts' });
    expect(platform.visibleUris(account.id)).toHaveLength(2);
    expect(calmSessions.all()[0]?.state).toBe('failed');
  });

  it('reports a post it could not delete as still visible, and keeps its backup', async () => {
    const { calmMode, platform, archive, connect } = setUp();
    const account = await connect('dean');
    const [stuck, ...others] = recentPosts(3);
    if (!stuck) throw new Error('expected posts');
    platform.publish(account.id, stuck, ...others);
    platform.failToDelete(stuck.uri);

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toMatchObject({ outcome: 'active', hidden: 2, stillVisible: 1 });
    expect(platform.visibleUris(account.id)).toEqual([stuck.uri]);
    const stuckBackup = archive.all().find((entry) => entry.uri === stuck.uri);
    expect(stuckBackup).toBeDefined();
    expect(stuckBackup?.hiddenAt).toBeUndefined();
  });

  it('finishes an interrupted activation when retried, without backing anything up twice', async () => {
    const { calmMode, platform, archive, calmSessions, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(3));
    archive.failNextMarkHidden(); // the first post is deleted, then the work stops
    const activation = { accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS };

    await expect(calmMode.activate(activation)).rejects.toThrow();
    const result = await calmMode.activate(activation);

    expect(result).toMatchObject({ outcome: 'active', hidden: 3, stillVisible: 0 });
    expect(archive.all()).toHaveLength(3);
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(calmSessions.all()).toHaveLength(1);
  });
});

describe('running in the background, a slice at a time (ADR-0015)', () => {
  /** Continues the Calm session until it's no longer in progress, like the job runner. */
  async function runUntilSettled(
    calmMode: ReturnType<typeof setUp>['calmMode'],
    calmSessionId: CalmSessionId,
    deadline?: Date,
  ) {
    const results: ActivationResult[] = [];
    for (let run = 0; run < 20; run += 1) {
      const result = await calmMode.continueActivation({
        calmSessionId,
        ...(deadline ? { deadline } : {}),
      });
      results.push(result);
      if (result.outcome !== 'in-progress' && result.outcome !== 'waiting') return results;
    }
    throw new Error('Never settled');
  }

  async function started(setup: ReturnType<typeof setUp>, accountId = ME) {
    const account = await setup.connect('dean', accountId);
    const start = await setup.calmMode.start({
      accountId,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });
    if (start.outcome !== 'started') throw new Error(`Expected to start, got ${start.outcome}`);
    return { account, calmSessionId: start.calmSessionId };
  }

  it('stops at its deadline, always after some progress, and the next run carries on', async () => {
    const setup = setUp();
    const { account, calmSessionId } = await started(setup);
    setup.platform.publish(account.id, ...recentPosts(3));

    const results = await runUntilSettled(setup.calmMode, calmSessionId, NOW);

    expect(results).toEqual([
      { outcome: 'in-progress', calmSessionId, hidden: 1 },
      { outcome: 'in-progress', calmSessionId, hidden: 2 },
      { outcome: 'active', calmSessionId, hidden: 3, stillVisible: 0 },
    ]);
  });

  it("isn't held up by a post that won't delete: it's tried again once, at the end", async () => {
    const setup = setUp({ pageSize: 2 });
    const { account, calmSessionId } = await started(setup);
    const [stuck, ...others] = recentPosts(5);
    if (!stuck) throw new Error('expected posts');
    setup.platform.publish(account.id, stuck, ...others);
    setup.platform.failToDelete(stuck.uri);

    const results = await runUntilSettled(setup.calmMode, calmSessionId, NOW);

    expect(results.at(-1)).toEqual({
      outcome: 'active',
      calmSessionId,
      hidden: 4,
      stillVisible: 1,
    });
    expect(setup.platform.visibleUris(account.id)).toEqual([stuck.uri]);
  });

  it('waits when the Platform asks it to slow down, then carries on', async () => {
    const setup = setUp();
    const { account, calmSessionId } = await started(setup);
    setup.platform.publish(account.id, ...recentPosts(3));
    const resetAt = new Date('2026-11-04T13:00:00.000Z');
    setup.platform.rateLimitNextDelete(resetAt);

    const waiting = await setup.calmMode.continueActivation({ calmSessionId });
    const finished = await setup.calmMode.continueActivation({ calmSessionId });

    expect(waiting).toEqual({ outcome: 'waiting', calmSessionId, hidden: 0, until: resetAt });
    expect(setup.calmSessions.all()[0]?.state).toBe('active');
    expect(finished).toMatchObject({ outcome: 'active', hidden: 3, stillVisible: 0 });
    expect(setup.platform.visibleUris(account.id)).toEqual([]);
  });

  it('leaves a session alone once it is on', async () => {
    const setup = setUp();
    const { calmSessionId } = await started(setup);
    await setup.calmMode.continueActivation({ calmSessionId });

    expect(await setup.calmMode.continueActivation({ calmSessionId })).toEqual({
      outcome: 'already-active',
      calmSessionId,
    });
  });

  it('pauses, keeping the session open, when the user needs to sign in to the Platform again', async () => {
    const setup = setUp();
    const { account, calmSessionId } = await started(setup);
    setup.platform.publish(account.id, ...recentPosts(1));
    await setup.connectedAccounts.markNeedsReauth({
      platform: 'bluesky',
      externalId: account.externalId,
    });

    const result = await setup.calmMode.continueActivation({ calmSessionId });

    expect(result).toEqual({ outcome: 'needs-sign-in' });
    expect(setup.calmSessions.all()[0]?.state).toBe('activating');
    expect(setup.platform.visibleUris(account.id)).toHaveLength(1);
  });
});

describe('retrying and safety', () => {
  it('gives one Calm session when turned on twice', async () => {
    const { calmMode, platform, calmSessions, operations, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(2));
    const activation = { accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS };

    await calmMode.activate(activation);
    const operationsAfterFirst = operations.length;
    const second = await calmMode.activate(activation);

    expect(second).toEqual({ outcome: 'already-active', calmSessionId: calmSessions.all()[0]?.id });
    expect(calmSessions.all()).toHaveLength(1);
    expect(operations).toHaveLength(operationsAfterFirst);
  });

  it("refuses another Account's connected account and touches nothing", async () => {
    const { calmMode, platform, calmSessions, connect } = setUp();
    const theirs = await connect('someone', SOMEONE_ELSE);
    platform.publish(theirs.id, ...recentPosts(2));

    await expect(
      calmMode.activate({ accountId: ME, connectedAccountId: theirs.id, period: LAST_7_DAYS }),
    ).rejects.toThrow(ConnectedAccountNotFoundError);
    expect(platform.visibleUris(theirs.id)).toHaveLength(2);
    expect(calmSessions.all()).toEqual([]);
  });

  it('asks the user to sign in again when the Platform stopped accepting us', async () => {
    const { calmMode, connectedAccounts, platform, calmSessions, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(2));
    await connectedAccounts.markNeedsReauth({
      platform: 'bluesky',
      externalId: account.externalId,
    });

    const result = await calmMode.activate({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(result).toEqual({ outcome: 'needs-sign-in' });
    expect(calmSessions.all()).toEqual([]);
  });
});

describe('turning Calm Mode on for all connected accounts', () => {
  it('starts one Calm session for each', async () => {
    const { calmMode, platform, calmSessions, connect } = setUp();
    const work = await connect('work');
    const personal = await connect('personal');
    platform.publish(work.id, ...recentPosts(2));
    platform.publish(personal.id, ...recentPosts(1));

    const results = await calmMode.activateAll({ accountId: ME, period: LAST_7_DAYS });

    expect(results).toMatchObject([
      { connectedAccountId: work.id, result: { outcome: 'active', hidden: 2 } },
      { connectedAccountId: personal.id, result: { outcome: 'active', hidden: 1 } },
    ]);
    expect(calmSessions.all().map((session) => session.connectedAccountId)).toEqual([
      work.id,
      personal.id,
    ]);
  });

  it("carries on with the others when one account can't be protected", async () => {
    const { calmMode, connectedAccounts, platform, connect } = setUp();
    const stale = await connect('stale');
    const fine = await connect('fine');
    platform.publish(fine.id, ...recentPosts(1));
    await connectedAccounts.markNeedsReauth({ platform: 'bluesky', externalId: stale.externalId });

    const results = await calmMode.activateAll({ accountId: ME, period: LAST_7_DAYS });

    expect(results.map(({ result }) => result.outcome)).toEqual(['needs-sign-in', 'active']);
    expect(platform.visibleUris(fine.id)).toEqual([]);
  });

  it("leaves other Accounts' connected accounts alone", async () => {
    const { calmMode, platform, connect } = setUp();
    await connect('dean');
    const theirs = await connect('someone', SOMEONE_ELSE);
    platform.publish(theirs.id, ...recentPosts(1));

    const results = await calmMode.activateAll({ accountId: ME, period: LAST_7_DAYS });

    expect(results).toHaveLength(1);
    expect(platform.visibleUris(theirs.id)).toHaveLength(1);
  });
});

describe('previewing what will be hidden', () => {
  it('counts the posts in the period without touching them', async () => {
    const { calmMode, platform, operations, connect } = setUp({ pageSize: 2 });
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(5), aPost('2026-10-01T09:00:00.000Z'));

    const preview = await calmMode.preview({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
    });

    expect(preview).toEqual({ posts: 5, more: false });
    expect(operations.some((operation) => /back up|delete|fetch/.test(operation))).toBe(false);
  });

  it('stops counting at the limit and says there are more', async () => {
    const { calmMode, platform, connect } = setUp({ pageSize: 2 });
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(7));

    const preview = await calmMode.preview({
      accountId: ME,
      connectedAccountId: account.id,
      period: LAST_7_DAYS,
      limit: 4,
    });

    expect(preview).toEqual({ posts: 4, more: true });
  });
});

describe('turning Calm Mode off', () => {
  it('ends the Calm session and leaves the hidden posts hidden, for Review', async () => {
    const { calmMode, platform, archive, calmSessions, connect } = setUp();
    const account = await connect('dean');
    platform.publish(account.id, ...recentPosts(2));
    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    const result = await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });

    expect(result).toBe('off');
    expect(calmSessions.all()[0]?.state).toBe('ended');
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(archive.all().every((entry) => entry.hiddenAt)).toBe(true);
  });

  it('is not allowed while posts are still being hidden', async () => {
    const { calmMode, calmSessions, connect } = setUp();
    const account = await connect('dean');
    await calmMode.start({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    const result = await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });

    expect(result).toBe('still-activating');
    expect(calmSessions.all()[0]?.state).toBe('activating');
  });

  it('is safe to repeat', async () => {
    const { calmMode, connect } = setUp();
    const account = await connect('dean');
    await calmMode.activate({ accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS });

    await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });
    const again = await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });

    expect(again).toBe('already-off');
  });

  it('can be turned on again afterwards, as a new Calm session', async () => {
    const { calmMode, calmSessions, connect } = setUp();
    const account = await connect('dean');
    const activation = { accountId: ME, connectedAccountId: account.id, period: LAST_7_DAYS };
    await calmMode.activate(activation);
    await calmMode.turnOff({ accountId: ME, connectedAccountId: account.id });

    const result = await calmMode.activate(activation);

    expect(result.outcome).toBe('active');
    expect(calmSessions.all().map((session) => session.state)).toEqual(['ended', 'active']);
  });

  it("refuses another Account's connected account", async () => {
    const { calmMode, connect } = setUp();
    const theirs = await connect('someone', SOMEONE_ELSE);

    await expect(
      calmMode.turnOff({ accountId: ME, connectedAccountId: theirs.id }),
    ).rejects.toThrow(ConnectedAccountNotFoundError);
  });
});

describe('the status of each connected account', () => {
  it('shows each account with its open Calm session, if any', async () => {
    const { calmMode, platform, connect } = setUp();
    const calm = await connect('calm');
    const standingBy = await connect('standing-by');
    platform.publish(calm.id, ...recentPosts(2));
    await calmMode.activate({ accountId: ME, connectedAccountId: calm.id, period: LAST_7_DAYS });

    const status = await calmMode.status(ME);

    expect(status).toMatchObject([
      { connectedAccount: calm, calm: { state: 'active', hidden: 2, period: LAST_7_DAYS } },
      { connectedAccount: standingBy, calm: null },
    ]);
  });
});
