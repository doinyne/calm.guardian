import { beforeAll, describe, expect, it } from 'vitest';

import { createGoogleTokenIssuer, TEST_API_AUDIENCE, TEST_INVOKER } from '../testing/google-tokens';
import {
  createGoogleCallerVerifier,
  GoogleCallerRejectedError,
  type VerifyGoogleCaller,
} from './google-caller';

describe('requests from our Cloud Tasks and Scheduler', () => {
  let google: Awaited<ReturnType<typeof createGoogleTokenIssuer>>;
  let verify: VerifyGoogleCaller;

  beforeAll(async () => {
    google = await createGoogleTokenIssuer();
    verify = createGoogleCallerVerifier({
      keys: google.keys,
      audience: TEST_API_AUDIENCE,
      invokerEmail: TEST_INVOKER,
    });
  });

  it('are accepted when Google signed them for this API and our invoker', async () => {
    await expect(verify(await google.issue())).resolves.toBeUndefined();
  });

  it.each([
    ['another service account', { email: 'someone-else@other.iam.gserviceaccount.com' }],
    ['another audience', { aud: 'https://someone-elses-api.run.app' }],
    ['another issuer', { iss: 'https://evil.example' }],
    ['an unverified email', { email_verified: false }],
    ['an expired token', { exp: Math.floor(Date.now() / 1000) - 60 }],
  ])('are refused from %s', async (_, claims) => {
    await expect(verify(await google.issue(claims))).rejects.toThrow(GoogleCallerRejectedError);
  });

  it('are refused when signed with a key Google never published', async () => {
    const impostor = await createGoogleTokenIssuer();

    await expect(verify(await impostor.issue())).rejects.toThrow(GoogleCallerRejectedError);
  });
});
