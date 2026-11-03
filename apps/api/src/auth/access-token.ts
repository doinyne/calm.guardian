import { errors, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

import { AccountIdSchema, type AccountId } from '../accounts/account-id';

/** Supabase Auth issues signed-in users' access tokens for this audience. */
const AUTHENTICATED_AUDIENCE = 'authenticated';

/**
 * Supabase's asymmetric signing algorithms. Shared-secret (HS256) and unsigned tokens are never
 * accepted, so nobody holding a leaked legacy JWT secret can mint a token we trust.
 */
const ALLOWED_ALGORITHMS = ['ES256', 'RS256'];

/** jose error codes that mean "this token is not acceptable". Any other failure is ours. */
const TOKEN_REJECTION_CODES = new Set<string>([
  'ERR_JOSE_ALG_NOT_ALLOWED',
  'ERR_JOSE_NOT_SUPPORTED',
  'ERR_JWKS_MULTIPLE_MATCHING_KEYS',
  'ERR_JWKS_NO_MATCHING_KEY',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
]);

/** The claims we rely on. Supabase adds others, which we ignore. */
const AccessTokenClaimsSchema = z.object({
  sub: AccountIdSchema,
  role: z.literal('authenticated'),
  // Anonymous users also get the `authenticated` role, but they don't have an Account.
  is_anonymous: z.literal(false).optional(),
});

export type VerifiedAccessToken = { accountId: AccountId };
export type VerifyAccessToken = (token: string) => Promise<VerifiedAccessToken>;

export type AccessTokenVerifierDependencies = {
  /** Supabase's public signing keys: `createRemoteJWKSet` in production. */
  keys: JWTVerifyGetKey;
  issuer: string;
  now?: () => Date;
};

/** The token can't be used. `reason` is safe to log; the token itself never is. */
export class AccessTokenRejectedError extends Error {
  override name = 'AccessTokenRejectedError';

  constructor(readonly reason: string) {
    super(`Access token rejected (${reason})`);
  }
}

/**
 * Checks a Supabase access token and returns the Account it belongs to. A token that fails any check
 * is rejected with `AccessTokenRejectedError`. Other failures (e.g. the signing keys can't be
 * fetched) propagate as server errors, so a Supabase outage doesn't look like the user's session ended.
 */
export function createAccessTokenVerifier({
  keys,
  issuer,
  now = () => new Date(),
}: AccessTokenVerifierDependencies): VerifyAccessToken {
  return async (token) => {
    const payload = await verifySignatureAndExpiry(token, { keys, issuer, now });

    const claims = AccessTokenClaimsSchema.safeParse(payload);
    if (!claims.success) throw new AccessTokenRejectedError('unexpected_claims');

    return { accountId: claims.data.sub };
  };
}

async function verifySignatureAndExpiry(
  token: string,
  { keys, issuer, now }: Required<AccessTokenVerifierDependencies>,
): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: AUTHENTICATED_AUDIENCE,
      algorithms: ALLOWED_ALGORITHMS,
      requiredClaims: ['exp'],
      currentDate: now(),
    });
    return payload;
  } catch (error) {
    if (error instanceof errors.JOSEError && TOKEN_REJECTION_CODES.has(error.code)) {
      throw new AccessTokenRejectedError(error.code);
    }
    throw error;
  }
}
