import { randomUUID } from 'node:crypto';

import { MAX_GUARDIANS } from '@calm-guardian/shared';
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

type Person = { id: AccountId; email: string };
const person = (name: string): Person => ({
  id: AccountIdSchema.parse(randomUUID()),
  email: `${name}-${randomUUID().slice(0, 8)}@example.com`,
});

describe('Guardian routes', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  async function setUp() {
    const connectedAccounts = new FakeConnectedAccounts();
    const { app, calm } = buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      connectedAccounts,
    });
    const dean = person('dean');
    const alex = person('alex');
    const account = await connectedAccounts.connect({
      accountId: dean.id,
      platform: 'bluesky',
      externalId: `did:plc:${randomUUID()}` as ExternalAccountId,
      handle: 'dean.bsky.social',
    });

    async function as(who: Person, method: string, path: string, body?: unknown) {
      const token = await supabase.issue({ claims: { sub: who.id, email: who.email } });
      return app.request(path, {
        method,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    }

    /** Dean invites Alex, Alex accepts, and Dean lets Guardians turn Calm Mode on for the account. */
    async function alexIsDeansGuardian() {
      await as(dean, 'POST', '/guardians', { email: alex.email });
      const { invitations } = (await (await as(alex, 'GET', '/guardian/invitations')).json()) as {
        invitations: { id: string }[];
      };
      await as(alex, 'POST', `/guardian/invitations/${invitations[0]?.id}/accept`);
      await as(dean, 'PUT', `/connections/${account.id}/guardians-can-turn-on`, { allowed: true });
      return invitations[0]?.id ?? '';
    }

    return { app, calm, dean, alex, account, as, alexIsDeansGuardian };
  }

  describe('inviting', () => {
    it('invites a Guardian by email', async () => {
      const { dean, alex, as } = await setUp();

      const response = await as(dean, 'POST', '/guardians', { email: alex.email });

      expect(response.status).toBe(201);
      expect(await (await as(dean, 'GET', '/guardians')).json()).toEqual({
        guardians: [{ id: expect.any(String) as string, email: alex.email, state: 'invited' }],
        max: MAX_GUARDIANS,
      });
    });

    it(`stops at ${MAX_GUARDIANS}`, async () => {
      const { dean, as } = await setUp();
      for (let index = 0; index < MAX_GUARDIANS; index += 1) {
        await as(dean, 'POST', '/guardians', { email: person('g').email });
      }

      const response = await as(dean, 'POST', '/guardians', { email: person('g').email });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'guardian_limit_reached' } });
    });

    it("won't make you your own Guardian", async () => {
      const { dean, as } = await setUp();

      const response = await as(dean, 'POST', '/guardians', { email: dean.email.toUpperCase() });

      expect(await response.json()).toMatchObject({ error: { code: 'guardian_is_you' } });
    });
  });

  describe('accepting', () => {
    it('shows the invitation only to someone signed in with the invited address', async () => {
      const { dean, alex, as } = await setUp();
      await as(dean, 'POST', '/guardians', { email: alex.email });

      const forAlex: unknown = await (await as(alex, 'GET', '/guardian/invitations')).json();
      const forSomeoneElse: unknown = await (
        await as(person('x'), 'GET', '/guardian/invitations')
      ).json();

      expect(forAlex).toEqual({
        invitations: [{ id: expect.any(String) as string, from: dean.email }],
      });
      expect(forSomeoneElse).toEqual({ invitations: [] });
    });

    it("can't be accepted by anyone else", async () => {
      const { dean, alex, as } = await setUp();
      await as(dean, 'POST', '/guardians', { email: alex.email });
      const { invitations } = (await (await as(alex, 'GET', '/guardian/invitations')).json()) as {
        invitations: { id: string }[];
      };

      const response = await as(
        person('x'),
        'POST',
        `/guardian/invitations/${invitations[0]?.id}/accept`,
      );

      expect(response.status).toBe(404);
    });
  });

  describe('a Guardian turning Calm Mode on', () => {
    it('sees only the accounts they may protect, with no posts', async () => {
      const { alex, as, alexIsDeansGuardian, account } = await setUp();
      await alexIsDeansGuardian();

      const body: unknown = await (await as(alex, 'GET', '/guardian/protecting')).json();

      expect(body).toMatchObject({
        protecting: [
          {
            connectedAccounts: [
              {
                connectedAccountId: account.id,
                handle: 'dean.bsky.social',
                calm: 'off',
                canTurnOn: 'yes',
              },
            ],
          },
        ],
      });
    });

    it('turns it on in the background, and the user sees who did', async () => {
      const { calm, dean, alex, as, alexIsDeansGuardian, account } = await setUp();
      await alexIsDeansGuardian();

      const response = await as(alex, 'POST', `/guardian/connections/${account.id}/calm`, {
        period: 'last-24-hours',
      });

      expect(response.status).toBe(202);
      expect(calm.jobQueue.take().map((queued) => queued.job)).toEqual(['activate-calm-mode']);
      const status = (await (await as(dean, 'GET', '/calm')).json()) as {
        connectedAccounts: { calm: { startedByGuardian: string } | null }[];
      };
      expect(status.connectedAccounts[0]?.calm?.startedByGuardian).toBe(alex.email);
    });

    it('is refused once the user stops allowing it', async () => {
      const { dean, alex, as, alexIsDeansGuardian, account } = await setUp();
      await alexIsDeansGuardian();
      await as(dean, 'PUT', `/connections/${account.id}/guardians-can-turn-on`, { allowed: false });

      const response = await as(alex, 'POST', `/guardian/connections/${account.id}/calm`, {
        period: 'last-24-hours',
      });

      expect(response.status).toBe(403);
    });

    it('is refused once the user removes them', async () => {
      const { dean, alex, as, alexIsDeansGuardian, account } = await setUp();
      const guardianshipId = await alexIsDeansGuardian();
      await as(dean, 'DELETE', `/guardians/${guardianshipId}`);

      const response = await as(alex, 'POST', `/guardian/connections/${account.id}/calm`, {
        period: 'last-24-hours',
      });

      expect(response.status).toBe(403);
    });

    it('waits until the user has been through Review', async () => {
      const { calm, dean, alex, as, alexIsDeansGuardian, account } = await setUp();
      await alexIsDeansGuardian();
      calm.platform.publish(
        account.id,
        aPost(new Date(TEST_NOW.getTime() - 3_600_000).toISOString()),
      );
      await as(dean, 'POST', `/connections/${account.id}/calm`, { period: 'last-24-hours' });
      for (const queued of calm.jobQueue.take()) {
        if ('calmSessionId' in queued.payload) {
          await calm.calmMode.continueActivation({
            calmSessionId: queued.payload.calmSessionId as never,
          });
        }
      }
      await as(dean, 'DELETE', `/connections/${account.id}/calm`);

      const response = await as(alex, 'POST', `/guardian/connections/${account.id}/calm`, {
        period: 'last-24-hours',
      });

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: { code: 'review_waiting' } });
    });
  });

  describe('what a Guardian can never do', () => {
    it("can't turn Calm Mode off, or see the user's Review", async () => {
      const { calm, dean, alex, as, alexIsDeansGuardian, account } = await setUp();
      await alexIsDeansGuardian();
      calm.platform.publish(
        account.id,
        aPost(new Date(TEST_NOW.getTime() - 3_600_000).toISOString()),
      );
      await as(alex, 'POST', `/guardian/connections/${account.id}/calm`, {
        period: 'last-24-hours',
      });
      for (const queued of calm.jobQueue.take()) {
        if ('calmSessionId' in queued.payload) {
          await calm.calmMode.continueActivation({
            calmSessionId: queued.payload.calmSessionId as never,
          });
        }
      }

      const turnOff = await as(alex, 'DELETE', `/connections/${account.id}/calm`);
      const review = (await (await as(alex, 'GET', '/review')).json()) as { posts: unknown[] };

      expect(turnOff.status).toBe(404);
      expect(review.posts).toEqual([]);
      // Dean, meanwhile, sees the hidden post in his own Review.
      const deansReview = (await (await as(dean, 'GET', '/review')).json()) as { posts: unknown[] };
      expect(deansReview.posts).toHaveLength(1);
    });
  });

  it('lets a Guardian step down', async () => {
    const { dean, alex, as, alexIsDeansGuardian } = await setUp();
    const guardianshipId = await alexIsDeansGuardian();

    await as(alex, 'DELETE', `/guardian/guardianships/${guardianshipId}`);

    expect(await (await as(dean, 'GET', '/guardians')).json()).toMatchObject({ guardians: [] });
  });
});
