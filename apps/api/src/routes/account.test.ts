import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { createAccountDeletion } from '../accounts/delete-account';
import { createAccessTokenVerifier } from '../auth/access-token';
import {
  createTestTokenIssuer,
  TEST_AUTH_ISSUER,
  type TestTokenIssuer,
} from '../testing/access-tokens';
import { FakeAuthAdmin } from '../testing/fake-auth-admin';
import { buildTestApp } from '../testing/test-app';

describe('DELETE /account', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  function buildApp(authAdmin = new FakeAuthAdmin()) {
    const built = buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      deleteAccount: createAccountDeletion({ authAdmin }),
    });
    return { ...built, authAdmin };
  }

  const tokenFor = (accountId: string) => supabase.issue({ claims: { sub: accountId } });

  const deleteAccount = (
    app: ReturnType<typeof buildApp>['app'],
    { authorization, body }: { authorization?: string; body?: unknown } = {},
  ) =>
    app.request('/account', {
      method: 'DELETE',
      headers: {
        ...(authorization ? { authorization } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

  describe('without a usable access token', () => {
    it('responds 401 in the error shape with a Bearer challenge', async () => {
      const { app } = buildApp();

      const response = await deleteAccount(app);

      expect(response.status).toBe(401);
      expect(response.headers.get('www-authenticate')).toBe('Bearer');
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'unauthorized',
          message: expect.any(String) as string,
          requestId: response.headers.get('x-request-id'),
        },
      });
    });

    it.each(['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer ', 'bearer-without-a-space'])(
      'responds 401 to the Authorization header "%s"',
      async (authorization) => {
        const { app } = buildApp();

        const response = await deleteAccount(app, { authorization });

        expect(response.status).toBe(401);
      },
    );

    it('responds 401 to a token signed by someone else, and deletes nothing', async () => {
      const accountId = randomUUID();
      const { app, authAdmin } = buildApp(new FakeAuthAdmin([accountId]));
      const impostor = await createTestTokenIssuer();
      const forged = await impostor.issue({ claims: { sub: accountId } });

      const response = await deleteAccount(app, { authorization: `Bearer ${forged}` });

      expect(response.status).toBe(401);
      expect(authAdmin.has(accountId)).toBe(true);
    });

    it('logs why the token was rejected, but never the token', async () => {
      const { app, logs } = buildApp();
      const expired = await supabase.issue({ issuedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) });

      await deleteAccount(app, { authorization: `Bearer ${expired}` });

      expect(logs.entries()).toContainEqual(expect.objectContaining({ reason: 'ERR_JWT_EXPIRED' }));
      expect(logs.output()).not.toContain(expired);
    });
  });

  describe('with a valid access token', () => {
    it('deletes the Account the token belongs to and responds 204', async () => {
      const accountId = randomUUID();
      const { app, authAdmin } = buildApp(new FakeAuthAdmin([accountId]));

      const response = await deleteAccount(app, {
        authorization: `Bearer ${await tokenFor(accountId)}`,
      });

      expect(response.status).toBe(204);
      expect(authAdmin.has(accountId)).toBe(false);
    });

    it('ignores any other Account ID in the request', async () => {
      const [accountId, someoneElse] = [randomUUID(), randomUUID()];
      const { app, authAdmin } = buildApp(new FakeAuthAdmin([accountId, someoneElse]));

      await app.request(`/account?accountId=${someoneElse}`, {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${await tokenFor(accountId)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ accountId: someoneElse }),
      });

      expect(authAdmin.has(accountId)).toBe(false);
      expect(authAdmin.has(someoneElse)).toBe(true);
    });

    it('succeeds again when retried after the Account is already gone', async () => {
      const accountId = randomUUID();
      const { app } = buildApp(new FakeAuthAdmin([accountId]));
      const authorization = `Bearer ${await tokenFor(accountId)}`;

      const first = await deleteAccount(app, { authorization });
      const retry = await deleteAccount(app, { authorization });

      expect([first.status, retry.status]).toEqual([204, 204]);
    });

    it('responds with a generic 500 and keeps the Account when Supabase fails', async () => {
      const accountId = randomUUID();
      const authAdmin = new FakeAuthAdmin([accountId]);
      authAdmin.failNextCallWith(new Error('Supabase Auth admin API timed out'));
      const { app } = buildApp(authAdmin);

      const response = await deleteAccount(app, {
        authorization: `Bearer ${await tokenFor(accountId)}`,
      });

      expect(response.status).toBe(500);
      await expect(response.text()).resolves.not.toContain('Supabase');
      expect(authAdmin.has(accountId)).toBe(true);
    });
  });
});
