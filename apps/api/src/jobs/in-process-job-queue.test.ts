import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { captureLogs } from '../testing/log-capture';
import { NO_JOB_HANDLERS } from '../testing/no-job-handlers';
import { createInProcessJobQueue } from './in-process-job-queue';
import type { JobPayload } from './job-queue';

const SESSION = { calmSessionId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' };
const RETRY = { maxAttempts: 3, firstDelayMs: 1_000, maxDelayMs: 10_000 };

function setUp(handle: (payload: JobPayload<'activate-calm-mode'>) => Promise<void>) {
  const logs = captureLogs();
  const queue = createInProcessJobQueue({
    handlers: () => ({ ...NO_JOB_HANDLERS, 'activate-calm-mode': handle }),
    logger: logs.logger,
    now: () => new Date(),
    retry: RETRY,
  });
  return { queue, logs };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T12:00:00.000Z'));
});
afterEach(() => vi.useRealTimers());

describe('the in-process job queue (local dev)', () => {
  it('runs a job soon after it is queued, not during the request that queued it', async () => {
    const handle = vi.fn(() => Promise.resolve());
    const { queue } = setUp(handle);

    await queue.enqueue('activate-calm-mode', SESSION);
    expect(handle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0);

    expect(handle).toHaveBeenCalledWith(SESSION);
  });

  it('runs a job at the time it was asked for', async () => {
    const handle = vi.fn(() => Promise.resolve());
    const { queue } = setUp(handle);

    await queue.enqueue('activate-calm-mode', SESSION, {
      runAt: new Date('2026-11-04T12:10:00.000Z'),
    });
    await vi.advanceTimersByTimeAsync(9 * 60_000);
    expect(handle).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('retries a failing job with growing waits', async () => {
    const handle = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce();
    const { queue } = setUp(handle);

    await queue.enqueue('activate-calm-mode', SESSION);
    await vi.advanceTimersByTimeAsync(0);
    expect(handle).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(RETRY.firstDelayMs);

    expect(handle).toHaveBeenCalledTimes(2);
  });

  it('gives up after its last attempt, and says so in the log without the error details', async () => {
    const handle = vi.fn(() => Promise.reject(new Error('post text that must not be logged')));
    const { queue, logs } = setUp(handle);

    await queue.enqueue('activate-calm-mode', SESSION);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(handle).toHaveBeenCalledTimes(RETRY.maxAttempts);
    expect(logs.output()).toContain('Gave up on a background job');
    expect(logs.output()).not.toContain('post text');
  });

  it('refuses a payload that is not what the job expects', async () => {
    const { queue } = setUp(() => Promise.resolve());

    await expect(
      queue.enqueue('activate-calm-mode', { calmSessionId: 'not-a-uuid' }),
    ).rejects.toThrow();
  });
});
