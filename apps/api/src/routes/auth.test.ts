import { describe, expect, it } from 'vitest';

import { createApp } from '../app';
import type { BlueskyGateway, LoginResult } from '../services/bluesky';

const CREDENTIALS = { identifier: 'dean.bsky.social', password: 'abcd-efgh-ijkl-mnop' };
const IDENTITY = { did: 'did:plc:7iza6de2dwap2sbkpav7c6c6', handle: 'dean.bsky.social' };

function fakeBluesky(result: LoginResult) {
  const receivedCredentials: unknown[] = [];

  const gateway: BlueskyGateway = {
    login: async (credentials) => {
      receivedCredentials.push(credentials);
      return result;
    },
  };

  return { gateway, receivedCredentials };
}

function postLogin(gateway: BlueskyGateway, body: unknown) {
  return createApp({ bluesky: gateway }).request('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /auth/login', () => {
  describe('when Bluesky accepts the credentials', () => {
    it('responds 200', async () => {
      const { gateway } = fakeBluesky({ ok: true, identity: IDENTITY });

      const response = await postLogin(gateway, CREDENTIALS);

      expect(response.status).toBe(200);
    });

    it('responds with the did and handle, and nothing else', async () => {
      const { gateway } = fakeBluesky({ ok: true, identity: IDENTITY });

      const response = await postLogin(gateway, CREDENTIALS);

      await expect(response.json()).resolves.toEqual(IDENTITY);
    });

    it('passes the submitted credentials through to Bluesky', async () => {
      const { gateway, receivedCredentials } = fakeBluesky({ ok: true, identity: IDENTITY });

      await postLogin(gateway, CREDENTIALS);

      expect(receivedCredentials).toEqual([CREDENTIALS]);
    });
  });

  describe('when Bluesky rejects the credentials', () => {
    it('responds 401', async () => {
      const { gateway } = fakeBluesky({ ok: false, reason: 'invalid-credentials' });

      const response = await postLogin(gateway, CREDENTIALS);

      expect(response.status).toBe(401);
    });

    it('does not reveal whether the identifier exists', async () => {
      const { gateway } = fakeBluesky({ ok: false, reason: 'invalid-credentials' });

      const response = await postLogin(gateway, CREDENTIALS);

      await expect(response.text()).resolves.not.toContain(CREDENTIALS.identifier);
    });
  });

  describe('when the request body is invalid', () => {
    it('responds 400 when the password is missing', async () => {
      const { gateway } = fakeBluesky({ ok: true, identity: IDENTITY });

      const response = await postLogin(gateway, { identifier: CREDENTIALS.identifier });

      expect(response.status).toBe(400);
    });

    it('does not attempt to log in', async () => {
      const { gateway, receivedCredentials } = fakeBluesky({ ok: true, identity: IDENTITY });

      await postLogin(gateway, { identifier: CREDENTIALS.identifier });

      expect(receivedCredentials).toEqual([]);
    });

    it('responds 400 when the identifier is not a string', async () => {
      const { gateway } = fakeBluesky({ ok: true, identity: IDENTITY });

      const response = await postLogin(gateway, { ...CREDENTIALS, identifier: 42 });

      expect(response.status).toBe(400);
    });
  });
});
