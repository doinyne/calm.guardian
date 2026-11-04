import { XRPCError } from '@atproto/xrpc';
import { describe, expect, it } from 'vitest';

import { PlatformRateLimitedError } from '../calm/platform-posts';
import { asRateLimit } from './atproto-rate-limit';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const IN_TEN_MINUTES = new Date('2026-11-04T12:10:00.000Z');

describe("Bluesky's rate limit", () => {
  it('becomes a wait until the time Bluesky gives', () => {
    const error = new XRPCError(429, 'RateLimitExceeded', 'Rate Limit Exceeded', {
      'ratelimit-reset': String(IN_TEN_MINUTES.getTime() / 1000),
    });

    const mapped = asRateLimit(error, NOW);

    expect(mapped).toBeInstanceOf(PlatformRateLimitedError);
    expect((mapped as PlatformRateLimitedError).retryAt).toEqual(IN_TEN_MINUTES);
  });

  it('waits a minute when Bluesky gives no usable time', () => {
    for (const headers of [{}, { 'ratelimit-reset': 'soon' }, { 'ratelimit-reset': '0' }]) {
      const mapped = asRateLimit(new XRPCError(429, 'RateLimitExceeded', '', headers), NOW);

      expect((mapped as PlatformRateLimitedError).retryAt).toEqual(
        new Date('2026-11-04T12:01:00.000Z'),
      );
    }
  });

  it('leaves every other error as it was', () => {
    const notFound = new XRPCError(400, 'InvalidRequest');
    const network = new TypeError('fetch failed');

    expect(asRateLimit(notFound, NOW)).toBe(notFound);
    expect(asRateLimit(network, NOW)).toBe(network);
  });
});
