import { randomUUID } from 'node:crypto';

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

const newAccountId = () => AccountIdSchema.parse(randomUUID());
const hoursAgo = (hours: number) =>
  aPost(new Date(TEST_NOW.getTime() - hours * 3_600_000).toISOString());

describe('Calm Mode routes', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  function setUp() {
    const connectedAccounts = new FakeConnectedAccounts();
    const { app, calm } = buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      connectedAccounts,
    });
    const me = newAccountId();
    const connect = (accountId: AccountId = me) =>
      connectedAccounts.connect({
        accountId,
        platform: 'bluesky',
        externalId: `did:plc:${randomUUID()}` as ExternalAccountId,
        handle: 'me.bsky.social',
      });

    async function call(method: string, path: string, body?: unknown, as: AccountId = me) {
      const token = await supabase.issue({ claims: { sub: as } });
      return app.request(path, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }

    /** Runs the queued activation jobs, as the job runner would. */
    async function runQueuedJobs() {
      for (const queued of calm.jobQueue.take()) {
        if ('calmSessionId' in queued.payload) {
          await calm.calmMode.continueActivation({
            calmSessionId: queued.payload.calmSessionId as never,
          });
        }
      }
    }

    return { app, calm, me, connect, call, runQueuedJobs, connectedAccounts };
  }

  it('needs a signed-in user', async () => {
    const { app } = setUp();

    expect((await app.request('/calm')).status).toBe(401);
  });

  describe('turning on', () => {
    it('starts in the background and answers at once', async () => {
      const { calm, connect, call } = setUp();
      const account = await connect();
      calm.platform.publish(account.id, hoursAgo(1), hoursAgo(2));

      const response = await call('POST', `/connections/${account.id}/calm`, {
        period: 'last-7-days',
      });

      expect(response.status).toBe(202);
      expect(await response.json()).toMatchObject({ calm: { state: 'activating' } });
      expect(calm.platform.visibleUris(account.id)).toHaveLength(2);
      expect(calm.jobQueue.queued).toHaveLength(1);
    });

    it('starts one Calm session however often it is asked', async () => {
      const { calm, connect, call } = setUp();
      const account = await connect();

      const first = await call('POST', `/connections/${account.id}/calm`, {
        period: 'last-7-days',
      });
      const second = await call('POST', `/connections/${account.id}/calm`, {
        period: 'last-7-days',
      });

      expect([first.status, second.status]).toEqual([202, 202]);
      expect(calm.calmSessions.all()).toHaveLength(1);
    });

    it('turns on for every connected account at once', async () => {
      const { calm, connect, call } = setUp();
      await connect();
      await connect();

      const response = await call('POST', '/calm', { period: 'last-24-hours' });

      expect(response.status).toBe(202);
      expect(calm.calmSessions.all()).toHaveLength(2);
      expect(calm.jobQueue.queued).toHaveLength(2);
    });

    it('asks the user to sign in again when the Platform stopped accepting us', async () => {
      const { connect, call, connectedAccounts } = setUp();
      const account = await connect();
      await connectedAccounts.markNeedsReauth({
        platform: 'bluesky',
        externalId: account.externalId,
      });

      const response = await call('POST', `/connections/${account.id}/calm`, {
        period: 'last-7-days',
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'connection_needs_sign_in' } });
    });

    it('accepts only the preset periods', async () => {
      const { connect, call } = setUp();
      const account = await connect();

      const response = await call('POST', `/connections/${account.id}/calm`, { period: 'forever' });

      expect(response.status).toBe(400);
    });

    it("refuses another Account's connected account", async () => {
      const { connect, call } = setUp();
      const theirs = await connect(newAccountId());

      const response = await call('POST', `/connections/${theirs.id}/calm`, {
        period: 'last-7-days',
      });

      expect(response.status).toBe(404);
    });
  });

  it('previews how many posts would be hidden, without touching them', async () => {
    const { calm, connect, call } = setUp();
    const account = await connect();
    calm.platform.publish(account.id, hoursAgo(1), hoursAgo(30), hoursAgo(24 * 10));

    const response = await call('POST', `/connections/${account.id}/calm/preview`, {
      period: 'last-7-days',
    });

    expect(await response.json()).toEqual({ posts: 2, more: false });
    expect(calm.platform.visibleUris(account.id)).toHaveLength(3);
  });

  describe('status', () => {
    it("shows each account's Calm Mode, from the server's own state", async () => {
      const { calm, connect, call, runQueuedJobs } = setUp();
      const account = await connect();
      const standingBy = await connect();
      calm.platform.publish(account.id, hoursAgo(1), hoursAgo(2));
      await call('POST', `/connections/${account.id}/calm`, { period: 'last-7-days' });
      await runQueuedJobs();

      const response = await call('GET', '/calm');

      expect(await response.json()).toEqual({
        connectedAccounts: [
          {
            id: account.id,
            platform: 'bluesky',
            handle: 'me.bsky.social',
            status: 'active',
            calm: {
              calmSessionId: expect.any(String) as string,
              state: 'active',
              period: { from: '2026-10-28T12:00:00.000Z', to: TEST_NOW.toISOString() },
              startedAt: TEST_NOW.toISOString(),
              hidden: 2,
            },
          },
          {
            id: standingBy.id,
            platform: 'bluesky',
            handle: 'me.bsky.social',
            status: 'active',
            calm: null,
          },
        ],
      });
    });
  });

  describe('turning off', () => {
    it('ends Calm Mode and keeps the hidden posts hidden', async () => {
      const { calm, connect, call, runQueuedJobs } = setUp();
      const account = await connect();
      calm.platform.publish(account.id, hoursAgo(1));
      await call('POST', `/connections/${account.id}/calm`, { period: 'last-7-days' });
      await runQueuedJobs();

      const response = await call('DELETE', `/connections/${account.id}/calm`);

      expect(response.status).toBe(204);
      expect(calm.calmSessions.all()[0]?.state).toBe('ended');
      expect(calm.platform.visibleUris(account.id)).toEqual([]);
    });

    it('is refused, kindly, while posts are still being hidden', async () => {
      const { connect, call } = setUp();
      const account = await connect();
      await call('POST', `/connections/${account.id}/calm`, { period: 'last-7-days' });

      const response = await call('DELETE', `/connections/${account.id}/calm`);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'calm_mode_still_activating' },
      });
    });

    it('is safe to repeat', async () => {
      const { connect, call } = setUp();
      const account = await connect();

      const response = await call('DELETE', `/connections/${account.id}/calm`);

      expect(response.status).toBe(204);
    });
  });
});
