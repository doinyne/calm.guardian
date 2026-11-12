import { jwtVerify, type JWTVerifyGetKey } from 'jose';
import { z } from 'zod';

/** Google signs the OIDC tokens Cloud Tasks and Cloud Scheduler attach to their requests. */
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
export const GOOGLE_SIGNING_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

const GoogleCallerClaimsSchema = z.object({
  email: z.string(),
  email_verified: z.literal(true),
});

/** The request isn't from our own Cloud Tasks or Scheduler. `reason` is safe to log. */
export class GoogleCallerRejectedError extends Error {
  override name = 'GoogleCallerRejectedError';

  constructor(readonly reason: string) {
    super(`Google caller rejected (${reason})`);
  }
}

export type VerifyGoogleCaller = (token: string) => Promise<void>;

/**
 * Accepts only Google-signed tokens, meant for this API, for our own invoker service account
 * (ADR-0015). That's what keeps `/internal/*` closed to everyone else on the internet.
 */
export function createGoogleCallerVerifier({
  keys,
  audience,
  invokerEmail,
}: {
  keys: JWTVerifyGetKey;
  audience: string;
  invokerEmail: string;
}): VerifyGoogleCaller {
  return async (token) => {
    let payload;
    try {
      ({ payload } = await jwtVerify(token, keys, {
        issuer: GOOGLE_ISSUERS,
        audience,
        algorithms: ['RS256'],
        requiredClaims: ['exp'],
      }));
    } catch (error) {
      throw new GoogleCallerRejectedError(error instanceof Error ? error.name : 'invalid');
    }
    const claims = GoogleCallerClaimsSchema.safeParse(payload);
    if (!claims.success || claims.data.email !== invokerEmail) {
      throw new GoogleCallerRejectedError('wrong_caller');
    }
  };
}
