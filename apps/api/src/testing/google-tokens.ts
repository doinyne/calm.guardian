import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';

export const TEST_API_AUDIENCE = 'https://calm-guardian-api-123.europe-west2.run.app';
export const TEST_INVOKER = 'calm-guardian-tasks@calm-guardian-demo.iam.gserviceaccount.com';

/** A stand-in for Google: RS256 keys that sign OIDC tokens shaped like Cloud Tasks'. */
export async function createGoogleTokenIssuer(): Promise<{
  keys: JWTVerifyGetKey;
  issue: (claims?: JWTPayload) => Promise<string>;
}> {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'google-test', alg: 'RS256', use: 'sig' };
  return {
    keys: createLocalJWKSet({ keys: [jwk] }),
    issue: (claims = {}) => {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        iss: 'https://accounts.google.com',
        aud: TEST_API_AUDIENCE,
        email: TEST_INVOKER,
        email_verified: true,
        iat: now,
        exp: now + 3600,
        ...claims,
      })
        .setProtectedHeader({ alg: 'RS256', kid: 'google-test' })
        .sign(privateKey);
    },
  };
}
