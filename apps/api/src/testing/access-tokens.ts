import { randomUUID } from 'node:crypto';

import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export const TEST_AUTH_ISSUER = 'http://127.0.0.1:54321/auth/v1';

const KEY_ID = 'test-signing-key';
const ONE_HOUR_IN_SECONDS = 60 * 60;

type IssueOptions = {
  /** Merged over a valid Supabase-shaped payload. Set a claim to `undefined` to leave it out. */
  claims?: JWTPayload;
  issuedAt?: Date;
};

export type TestTokenIssuer = {
  /** The public keys the API should trust: our stand-in for Supabase's JWKS endpoint. */
  keys: JWTVerifyGetKey;
  /** Signs an access token shaped like the ones Supabase Auth issues to signed-in users. */
  issue: (options?: IssueOptions) => Promise<string>;
};

/** A stand-in for Supabase Auth: a fresh ES256 key pair that signs tokens like Supabase's. */
export async function createTestTokenIssuer(): Promise<TestTokenIssuer> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const publicJwk = { ...(await exportJWK(publicKey)), kid: KEY_ID, alg: 'ES256', use: 'sig' };

  return {
    keys: createLocalJWKSet({ keys: [publicJwk] }),
    issue: ({ claims = {}, issuedAt = new Date() } = {}) => {
      const iat = Math.floor(issuedAt.getTime() / 1000);
      const payload: JWTPayload = {
        iss: TEST_AUTH_ISSUER,
        sub: randomUUID(),
        aud: 'authenticated',
        role: 'authenticated',
        is_anonymous: false,
        email: 'person@example.com',
        session_id: randomUUID(),
        iat,
        exp: iat + ONE_HOUR_IN_SECONDS,
        ...claims,
      };
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
        .sign(privateKey);
    },
  };
}
