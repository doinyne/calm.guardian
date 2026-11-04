import { ResponseType, XRPCError } from '@atproto/xrpc';

import { PlatformRateLimitedError } from '../calm/platform-posts';

/** How long to wait when Bluesky says "slow down" without saying until when. */
const DEFAULT_WAIT_MS = 60_000;

/**
 * Bluesky's "slow down" (HTTP 429) as our own error, waiting until its `ratelimit-reset` (Unix
 * seconds). Any other error is returned unchanged.
 */
export function asRateLimit(error: unknown, now: Date): unknown {
  if (!(error instanceof XRPCError) || error.status !== ResponseType.RateLimitExceeded)
    return error;

  const resetSeconds = Number(error.headers?.['ratelimit-reset']);
  const retryAt =
    Number.isFinite(resetSeconds) && resetSeconds > 0
      ? new Date(resetSeconds * 1000)
      : new Date(now.getTime() + DEFAULT_WAIT_MS);
  return new PlatformRateLimitedError(
    retryAt > now ? retryAt : new Date(now.getTime() + DEFAULT_WAIT_MS),
  );
}
