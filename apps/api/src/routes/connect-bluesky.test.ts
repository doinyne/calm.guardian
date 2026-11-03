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
import { FakeBlueskyOAuth } from '../testing/fake-bluesky-oauth';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { buildTestApp, TEST_APP_RETURN_URL } from '../testing/test-app';

const newAccountId = () => AccountIdSchema.parse(randomUUID());
const newDid = () => `did:plc:${randomUUID().replaceAll('-', '')}` as ExternalAccountId;

describe('connecting Bluesky', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  function setUp() {
    const bluesky = new FakeBlueskyOAuth();
    const connectedAccounts = new FakeConnectedAccounts();
    const { app, logs } = buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      bluesky,
      connectedAccounts,
    });

    const signedInAs = async (accountId: AccountId) => ({
      authorization: `Bearer ${await supabase.issue({ claims: { sub: accountId } })}`,
    });

    /** Runs Bluesky's redirect back to us and returns where we sent the user next. */
    async function blueskyRedirectsBack(query: string) {
      const response = await app.request(`/connections/bluesky/callback?${query}`);
      expect(response.status).toBe(302);
      return new URL(response.headers.get('location') ?? '');
    }

    /** A sign-in Bluesky has approved, waiting in the app as a code. */
    async function approvedSignIn(signIn: { startedBy: AccountId; did?: ExternalAccountId }) {
      const did = signIn.did ?? newDid();
      bluesky.willCompleteSignIn('bluesky-code', {
        did,
        handle: 'me.bsky.social',
        startedBy: signIn.startedBy,
      });
      const backInApp = await blueskyRedirectsBack(
        'code=bluesky-code&state=opaque&iss=https://bsky.social',
      );
      return { code: backInApp.searchParams.get('code') ?? '', did };
    }

    async function complete(accountId: AccountId, body: unknown) {
      return app.request('/connections/bluesky/complete', {
        method: 'POST',
        headers: { ...(await signedInAs(accountId)), 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    return {
      app,
      logs,
      bluesky,
      connectedAccounts,
      signedInAs,
      blueskyRedirectsBack,
      approvedSignIn,
      complete,
    };
  }

  describe('starting: POST /connections/bluesky', () => {
    it('needs a signed-in user', async () => {
      const { app } = setUp();

      const response = await app.request('/connections/bluesky', { method: 'POST' });

      expect(response.status).toBe(401);
    });

    it("returns Bluesky's page where the user approves Calm Guardian", async () => {
      const { app, signedInAs } = setUp();

      const response = await app.request('/connections/bluesky', {
        method: 'POST',
        headers: await signedInAs(newAccountId()),
      });

      expect(response.status).toBe(200);
      const { authorizationUrl } = (await response.json()) as { authorizationUrl: string };
      expect(new URL(authorizationUrl).origin).toBe('https://bsky.social');
    });
  });

  describe("Bluesky's redirect back: GET /connections/bluesky/callback", () => {
    it('hands the app a single-use code, and connects nothing by itself', async () => {
      const { approvedSignIn, connectedAccounts } = setUp();
      const me = newAccountId();

      const { code } = await approvedSignIn({ startedBy: me });

      expect(code).not.toBe('');
      expect(await connectedAccounts.listForAccount(me)).toEqual([]);
    });

    it('sends the user back to the app, not to a web page', async () => {
      const { bluesky, blueskyRedirectsBack } = setUp();
      bluesky.willCompleteSignIn('bluesky-code', {
        did: newDid(),
        handle: 'me.bsky.social',
        startedBy: newAccountId(),
      });

      const backInApp = await blueskyRedirectsBack('code=bluesky-code');

      expect(backInApp.protocol).toBe(TEST_APP_RETURN_URL.protocol);
      expect(backInApp.pathname).toBe(TEST_APP_RETURN_URL.pathname);
    });

    it('tells the app the user cancelled, with no code', async () => {
      const { blueskyRedirectsBack } = setUp();

      const backInApp = await blueskyRedirectsBack('error=access_denied&state=opaque');

      expect(backInApp.searchParams.get('status')).toBe('cancelled');
      expect(backInApp.searchParams.has('code')).toBe(false);
    });

    it('tells the app it failed when Bluesky rejects the sign-in, without logging the code', async () => {
      const { blueskyRedirectsBack, logs } = setUp();

      const backInApp = await blueskyRedirectsBack('code=forged-bluesky-code&state=opaque');

      expect(backInApp.searchParams.get('status')).toBe('failed');
      expect(logs.output()).not.toContain('forged-bluesky-code');
    });
  });

  describe('completing: POST /connections/bluesky/complete', () => {
    it('connects the account for the Account that started the sign-in', async () => {
      const { approvedSignIn, complete, connectedAccounts } = setUp();
      const me = newAccountId();
      const { code } = await approvedSignIn({ startedBy: me });

      const response = await complete(me, { code });

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({
        connectedAccount: { platform: 'bluesky', handle: 'me.bsky.social', status: 'active' },
      });
      expect(await connectedAccounts.listForAccount(me)).toHaveLength(1);
    });

    it('refuses a sign-in someone else started, connects nothing, and drops its tokens', async () => {
      const { approvedSignIn, complete, connectedAccounts, bluesky } = setUp();
      const [attacker, victim] = [newAccountId(), newAccountId()];
      const { code, did } = await approvedSignIn({ startedBy: attacker });

      const response = await complete(victim, { code });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'connection_started_elsewhere' },
      });
      expect(await connectedAccounts.listForAccount(attacker)).toEqual([]);
      expect(await connectedAccounts.listForAccount(victim)).toEqual([]);
      expect(bluesky.revoked).toEqual([did]);
    });

    it("keeps the tokens when refusing, if that Bluesky account is already someone's connection", async () => {
      const { approvedSignIn, complete, connectedAccounts, bluesky } = setUp();
      const [owner, startedBy, completedBy] = [newAccountId(), newAccountId(), newAccountId()];
      const did = newDid();
      await connectedAccounts.connect({
        accountId: owner,
        platform: 'bluesky',
        externalId: did,
        handle: 'owner.bsky.social',
      });
      const { code } = await approvedSignIn({ startedBy, did });

      await complete(completedBy, { code });

      expect(bluesky.revoked).toEqual([]);
    });

    it('accepts each code only once', async () => {
      const { approvedSignIn, complete } = setUp();
      const me = newAccountId();
      const { code } = await approvedSignIn({ startedBy: me });

      await complete(me, { code });
      const again = await complete(me, { code });

      expect(again.status).toBe(400);
      await expect(again.json()).resolves.toMatchObject({
        error: { code: 'connection_code_invalid' },
      });
    });

    it('refuses a code it never issued', async () => {
      const { complete } = setUp();

      const response = await complete(newAccountId(), { code: 'made-up' });

      expect(response.status).toBe(400);
    });

    it('refuses an account that is already connected to another Account', async () => {
      const { approvedSignIn, complete, connectedAccounts } = setUp();
      const [owner, me] = [newAccountId(), newAccountId()];
      const did = newDid();
      await connectedAccounts.connect({
        accountId: owner,
        platform: 'bluesky',
        externalId: did,
        handle: 'owner.bsky.social',
      });
      const { code } = await approvedSignIn({ startedBy: me, did });

      const response = await complete(me, { code });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'connected_elsewhere' },
      });
    });

    it('rejects a request with no code', async () => {
      const { complete } = setUp();

      const response = await complete(newAccountId(), {});

      expect(response.status).toBe(400);
    });

    it('never logs the code', async () => {
      const { approvedSignIn, complete, logs } = setUp();
      const me = newAccountId();
      const { code } = await approvedSignIn({ startedBy: me });

      await complete(me, { code });

      expect(logs.output()).not.toContain(code);
    });
  });

  describe('disconnecting: DELETE /connections/:id', () => {
    async function connected(setup: ReturnType<typeof setUp>, accountId: AccountId) {
      return setup.connectedAccounts.connect({
        accountId,
        platform: 'bluesky',
        externalId: newDid(),
        handle: 'me.bsky.social',
      });
    }

    async function disconnect(setup: ReturnType<typeof setUp>, accountId: AccountId, id: string) {
      return setup.app.request(`/connections/${id}`, {
        method: 'DELETE',
        headers: await setup.signedInAs(accountId),
      });
    }

    it('revokes our tokens at Bluesky, then removes the connection', async () => {
      const setup = setUp();
      const me = newAccountId();
      const account = await connected(setup, me);

      const response = await disconnect(setup, me, account.id);

      expect(response.status).toBe(204);
      expect(setup.bluesky.revoked).toEqual([account.externalId]);
      expect(await setup.connectedAccounts.listForAccount(me)).toEqual([]);
    });

    it('still removes the connection when Bluesky cannot be reached', async () => {
      const setup = setUp();
      const me = newAccountId();
      const account = await connected(setup, me);
      setup.bluesky.failRevokes();

      const response = await disconnect(setup, me, account.id);

      expect(response.status).toBe(204);
      expect(await setup.connectedAccounts.listForAccount(me)).toEqual([]);
    });

    it('is safe to repeat', async () => {
      const setup = setUp();
      const me = newAccountId();
      const account = await connected(setup, me);

      const statuses = [
        (await disconnect(setup, me, account.id)).status,
        (await disconnect(setup, me, account.id)).status,
      ];

      expect(statuses).toEqual([204, 204]);
    });

    it("leaves another Account's connection alone", async () => {
      const setup = setUp();
      const [owner, someoneElse] = [newAccountId(), newAccountId()];
      const account = await connected(setup, owner);

      await disconnect(setup, someoneElse, account.id);

      expect(setup.bluesky.revoked).toEqual([]);
      expect(await setup.connectedAccounts.listForAccount(owner)).toHaveLength(1);
    });

    it('rejects an id that is not a connection id', async () => {
      const setup = setUp();

      const response = await disconnect(setup, newAccountId(), 'not-a-uuid');

      expect(response.status).toBe(400);
    });
  });
});
