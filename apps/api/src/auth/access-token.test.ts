import { randomUUID } from 'node:crypto';

import { decodeJwt, SignJWT, UnsecuredJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  createTestTokenIssuer,
  TEST_AUTH_ISSUER,
  type TestTokenIssuer,
} from '../testing/access-tokens';
import {
  AccessTokenRejectedError,
  createAccessTokenVerifier,
  type VerifyAccessToken,
} from './access-token';

const NOW = new Date('2026-11-03T12:00:00Z');
const TWO_HOURS_AGO = new Date(NOW.getTime() - 2 * 60 * 60 * 1000);

describe('verifying an access token', () => {
  let supabase: TestTokenIssuer;
  let verify: VerifyAccessToken;

  beforeAll(async () => {
    supabase = await createTestTokenIssuer();
    verify = createAccessTokenVerifier({
      keys: supabase.keys,
      issuer: TEST_AUTH_ISSUER,
      now: () => NOW,
    });
  });

  const issue = (claims = {}, issuedAt = NOW) => supabase.issue({ claims, issuedAt });

  it('returns the Account the token was issued to', async () => {
    const accountId = randomUUID();

    await expect(verify(await issue({ sub: accountId }))).resolves.toEqual({
      accountId,
      email: 'person@example.com',
    });
  });

  it('returns the signed-in email address, lower-cased', async () => {
    await expect(verify(await issue({ email: 'Alex@Example.com' }))).resolves.toMatchObject({
      email: 'alex@example.com',
    });
  });

  it('rejects an expired token', async () => {
    await expect(verify(await issue({}, TWO_HOURS_AGO))).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects a token that never expires', async () => {
    await expect(verify(await issue({ exp: undefined }))).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects a token from another issuer', async () => {
    const token = await issue({ iss: 'https://another-project.supabase.co/auth/v1' });

    await expect(verify(token)).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects a token meant for another audience', async () => {
    await expect(verify(await issue({ aud: 'another-service' }))).rejects.toThrow(
      AccessTokenRejectedError,
    );
  });

  it('rejects a token signed by a key we do not trust', async () => {
    const impostor = await createTestTokenIssuer();

    await expect(verify(await impostor.issue({ issuedAt: NOW }))).rejects.toThrow(
      AccessTokenRejectedError,
    );
  });

  it('rejects a token signed with a shared secret (HS256), even with valid claims', async () => {
    const validClaims = decodeJwt(await issue());
    const token = await new SignJWT(validClaims)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new TextEncoder().encode('a-legacy-shared-jwt-secret-of-32-chars+'));

    await expect(verify(token)).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects an unsigned token', async () => {
    const token = new UnsecuredJWT({ role: 'authenticated', aud: 'authenticated' })
      .setIssuer(TEST_AUTH_ISSUER)
      .setSubject(randomUUID())
      .setIssuedAt(NOW)
      .setExpirationTime('1h')
      .encode();

    await expect(verify(token)).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects a token for the anon role', async () => {
    await expect(verify(await issue({ role: 'anon' }))).rejects.toThrow(AccessTokenRejectedError);
  });

  it('rejects an anonymous user', async () => {
    await expect(verify(await issue({ is_anonymous: true }))).rejects.toThrow(
      AccessTokenRejectedError,
    );
  });

  it('rejects a subject that is not an Account ID', async () => {
    await expect(verify(await issue({ sub: 'service-worker' }))).rejects.toThrow(
      AccessTokenRejectedError,
    );
  });

  it('rejects text that is not a token at all', async () => {
    await expect(verify('not-a-token')).rejects.toThrow(AccessTokenRejectedError);
  });

  it('says why a token was rejected, without repeating the token', async () => {
    const token = await issue({}, TWO_HOURS_AGO);

    const error = await verify(token).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AccessTokenRejectedError);
    expect((error as AccessTokenRejectedError).reason).toBe('ERR_JWT_EXPIRED');
    expect((error as Error).message).not.toContain(token);
  });

  it('treats an outage fetching the signing keys as a server error, not a bad token', async () => {
    const outage = new Error('JWKS endpoint unreachable');
    const verifyDuringOutage = createAccessTokenVerifier({
      keys: () => Promise.reject(outage),
      issuer: TEST_AUTH_ISSUER,
      now: () => NOW,
    });

    await expect(verifyDuringOutage(await issue())).rejects.toBe(outage);
  });
});
