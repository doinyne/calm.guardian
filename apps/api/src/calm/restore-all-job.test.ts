import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import { FakeJobQueue } from '../testing/fake-job-queue';
import { captureLogs } from '../testing/log-capture';
import type { RestoreAllResult } from './restore';
import { createRestoreAllJob } from './restore-all-job';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const PAYLOAD = {
  accountId: '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId,
  connectedAccountId: '0b6c1e7a-4f2d-4a8e-9b3c-7d1e2f3a4b5c',
};

/** The job with a Restore that answers `result`. */
async function runWith(result: RestoreAllResult) {
  const jobQueue = new FakeJobQueue();
  const run = createRestoreAllJob({
    restore: { restoreAll: () => Promise.resolve(result) },
    jobQueue,
    now: () => NOW,
    logger: captureLogs().logger,
  });
  await run(PAYLOAD);
  return jobQueue.take();
}

describe('the restore-all job', () => {
  it('queues the next slice straight away while there is more to restore', async () => {
    expect(await runWith({ outcome: 'in-progress' })).toEqual([
      { job: 'restore-all', payload: PAYLOAD },
    ]);
  });

  it("carries on when Bluesky's limit resets", async () => {
    const until = new Date('2026-11-04T13:00:00.000Z');

    expect(await runWith({ outcome: 'waiting', until })).toEqual([
      { job: 'restore-all', payload: PAYLOAD, runAt: until },
    ]);
  });

  it.each<RestoreAllResult>([
    { outcome: 'done' },
    { outcome: 'done', notRestored: 2 },
    { outcome: 'calm-mode-on' },
    { outcome: 'needs-sign-in' },
  ])('stops when the result is $outcome', async (result) => {
    expect(await runWith(result)).toEqual([]);
  });
});
