import { randomUUID } from 'node:crypto';

import { presetCalmPeriod } from '@calm-guardian/shared';
import { beforeAll, describe, expect, it } from 'vitest';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';
import { createAccessTokenVerifier } from '../auth/access-token';
import type { ExternalAccountId } from '../connections/connected-account';
import {
  createTestTokenIssuer,
  TEST_AUTH_ISSUER,
  type TestTokenIssuer,
} from '../testing/access-tokens';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { aPost } from '../testing/fake-platform-posts';
import { buildTestApp, TEST_NOW } from '../testing/test-app';

const hoursAgo = (hours: number, options?: { mediaCount?: number }) =>
  aPost(new Date(TEST_NOW.getTime() - hours * 3_600_000).toISOString(), options);

type ReviewBody = {
  posts: { id: string; text: string; state: string; files: string[]; isReply: boolean }[];
  toReview: number;
};

describe('Review routes', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  /** An Account with one Bluesky account whose posts have been hidden and Calm Mode turned off. */
  async function setUp(...posts: ReturnType<typeof aPost>[]) {
    const connectedAccounts = new FakeConnectedAccounts();
    const { app, calm } = buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      connectedAccounts,
    });
    const me = AccountIdSchema.parse(randomUUID());
    const account = await connectedAccounts.connect({
      accountId: me,
      platform: 'bluesky',
      externalId: `did:plc:${randomUUID()}` as ExternalAccountId,
      handle: 'me.bsky.social',
    });
    calm.platform.publish(account.id, ...posts);
    const turnOn = () =>
      calm.calmMode.activate({
        accountId: me,
        connectedAccountId: account.id,
        period: presetCalmPeriod('last-7-days', TEST_NOW),
      });
    await turnOn();
    await calm.calmMode.turnOff({ accountId: me, connectedAccountId: account.id });

    async function call(method: string, path: string, as: AccountId = me) {
      const token = await supabase.issue({ claims: { sub: as } });
      return app.request(path, { method, headers: { authorization: `Bearer ${token}` } });
    }
    const review = async (as: AccountId = me) =>
      (await (await call('GET', '/review', as)).json()) as ReviewBody;

    return { calm, me, account, call, review, turnOn };
  }

  it('lists the hidden posts in their own words, with how many are still to review', async () => {
    const reply = { ...hoursAgo(1), record: { text: 'A reply', reply: {}, createdAt: '' } };
    const { review } = await setUp(reply, hoursAgo(2, { mediaCount: 2 }));

    const body = await review();

    expect(body.toReview).toBe(2);
    expect(
      body.posts.map(({ text, isReply, files, state }) => ({ text, isReply, files, state })),
    ).toEqual([
      { text: 'A reply', isReply: true, files: [], state: 'to-review' },
      {
        text: expect.stringMatching(/^Post \d+$/) as string,
        isReply: false,
        files: ['image/jpeg', 'image/jpeg'],
        state: 'to-review',
      },
    ]);
  });

  it("never shows anyone else's posts", async () => {
    const { review } = await setUp(hoursAgo(1));

    expect((await review(AccountIdSchema.parse(randomUUID()))).posts).toEqual([]);
  });

  it('restores a post exactly as it was, and is safe to repeat', async () => {
    const post = hoursAgo(1);
    const { calm, account, call, review } = await setUp(post);
    const [hidden] = (await review()).posts;

    const first = await call('POST', `/review/${hidden?.id}/restore`);
    const again = await call('POST', `/review/${hidden?.id}/restore`);

    expect(await first.json()).toEqual({ outcome: 'restored' });
    expect(await again.json()).toEqual({ outcome: 'already-restored' });
    expect(calm.platform.visibleUris(account.id)).toEqual([post.uri]);
    expect((await review()).posts).toEqual([]);
  });

  it('waits to restore while Calm Mode is on for that account', async () => {
    const { call, review, turnOn } = await setUp(hoursAgo(1));
    const [hidden] = (await review()).posts;
    await turnOn();

    const response = await call('POST', `/review/${hidden?.id}/restore`);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'calm_mode_on' } });
  });

  it('asks the user to try again later when Bluesky says to slow down', async () => {
    const { calm, call, review } = await setUp(hoursAgo(1));
    const [hidden] = (await review()).posts;
    calm.platform.rateLimitNextRestore(new Date('2026-11-04T13:00:00.000Z'));

    const response = await call('POST', `/review/${hidden?.id}/restore`);

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'platform_busy' } });
  });

  it('keeps a post hidden, so it no longer needs reviewing', async () => {
    const { call, review } = await setUp(hoursAgo(1));
    const [hidden] = (await review()).posts;

    const response = await call('POST', `/review/${hidden?.id}/keep-hidden`);

    expect(response.status).toBe(204);
    const after = await review();
    expect(after.toReview).toBe(0);
    expect(after.posts.map((post) => post.state)).toEqual(['kept-hidden']);
  });

  it('deletes a post for good', async () => {
    const { call, review } = await setUp(hoursAgo(1));
    const [hidden] = (await review()).posts;

    const response = await call('DELETE', `/review/${hidden?.id}`);

    expect(response.status).toBe(204);
    expect((await review()).posts).toEqual([]);
  });

  it("refuses to act on another Account's post", async () => {
    const { call, review } = await setUp(hoursAgo(1));
    const [hidden] = (await review()).posts;
    const someoneElse = AccountIdSchema.parse(randomUUID());

    for (const [method, path] of [
      ['POST', `/review/${hidden?.id}/restore`],
      ['POST', `/review/${hidden?.id}/keep-hidden`],
      ['DELETE', `/review/${hidden?.id}`],
    ] as const) {
      expect((await call(method, path, someoneElse)).status).toBe(404);
    }
    expect((await review()).posts).toHaveLength(1);
  });

  describe('Restore all', () => {
    it('starts in the background', async () => {
      const { calm, account, call } = await setUp(hoursAgo(1), hoursAgo(2));

      const response = await call('POST', `/connections/${account.id}/restore-all`);

      expect(response.status).toBe(202);
      expect(calm.jobQueue.take().map((queued) => queued.job)).toEqual(['restore-all']);
    });

    it('waits while Calm Mode is on for that account', async () => {
      const { calm, account, call, turnOn } = await setUp(hoursAgo(1));
      calm.jobQueue.take();
      await turnOn();

      const response = await call('POST', `/connections/${account.id}/restore-all`);

      expect(response.status).toBe(409);
      expect(calm.jobQueue.take()).toEqual([]);
    });
  });
});
