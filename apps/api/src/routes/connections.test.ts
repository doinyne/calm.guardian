import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import { AccountIdSchema } from '../accounts/account-id';
import { createAccessTokenVerifier } from '../auth/access-token';
import type { ExternalAccountId } from '../connections/connected-account';
import {
  createTestTokenIssuer,
  TEST_AUTH_ISSUER,
  type TestTokenIssuer,
} from '../testing/access-tokens';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { buildTestApp } from '../testing/test-app';

describe('GET /connections', () => {
  let supabase: TestTokenIssuer;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
  });

  function buildApp(connectedAccounts = new FakeConnectedAccounts()) {
    return buildTestApp({
      verifyAccessToken: createAccessTokenVerifier({
        keys: supabase.keys,
        issuer: TEST_AUTH_ISSUER,
      }),
      connectedAccounts,
    }).app;
  }

  const listAs = async (app: ReturnType<typeof buildApp>, accountId?: string) =>
    app.request('/connections', {
      headers: accountId
        ? { authorization: `Bearer ${await supabase.issue({ claims: { sub: accountId } })}` }
        : {},
    });

  const did = () => `did:plc:${randomUUID()}` as ExternalAccountId;

  it('needs a signed-in user', async () => {
    const response = await listAs(buildApp());

    expect(response.status).toBe(401);
  });

  it("lists only the signed-in user's connected accounts", async () => {
    const [me, someoneElse] = [randomUUID(), randomUUID()].map((id) => AccountIdSchema.parse(id));
    const connectedAccounts = new FakeConnectedAccounts();
    await connectedAccounts.connect({
      accountId: me!,
      platform: 'bluesky',
      externalId: did(),
      handle: 'me.bsky.social',
    });
    await connectedAccounts.connect({
      accountId: someoneElse!,
      platform: 'bluesky',
      externalId: did(),
      handle: 'them.bsky.social',
    });

    const response = await listAs(buildApp(connectedAccounts), me);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { connectedAccounts: { handle: string }[] };
    expect(body.connectedAccounts.map(({ handle }) => handle)).toEqual(['me.bsky.social']);
  });

  it('describes each account without its Platform ID, which the app has no use for', async () => {
    const me = AccountIdSchema.parse(randomUUID());
    const connectedAccounts = new FakeConnectedAccounts();
    const externalId = did();
    await connectedAccounts.connect({
      accountId: me,
      platform: 'bluesky',
      externalId,
      handle: 'me.bsky.social',
    });

    const response = await listAs(buildApp(connectedAccounts), me);

    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      connectedAccounts: [
        {
          id: expect.any(String) as string,
          platform: 'bluesky',
          handle: 'me.bsky.social',
          status: 'active',
          connectedAt: expect.any(String) as string,
        },
      ],
    });
    expect(text).not.toContain(externalId);
  });

  it('returns an empty list for someone with nothing connected', async () => {
    const response = await listAs(buildApp(), randomUUID());

    await expect(response.json()).resolves.toEqual({ connectedAccounts: [] });
  });
});
