import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it, vi } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { FakeJobQueue } from '../testing/fake-job-queue';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { createInProcessJobQueue } from '../jobs/in-process-job-queue';
import type { JobQueue } from '../jobs/job-queue';
import { captureLogs } from '../testing/log-capture';
import { NO_JOB_HANDLERS } from '../testing/no-job-handlers';
import { createActivationJob } from './activation-job';
import { createCalmMode } from './calm-mode';
import type { CalmSessionId } from './calm-session';

const NOW = new Date('2026-11-04T12:00:00.000Z');
const ME = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;

/** The real Calm Mode core and job, over fakes, with a clock the test moves. */
async function setUp({
  posts = 3,
  sliceMs = 8 * 60_000,
  queue,
}: { posts?: number; sliceMs?: number; queue?: JobQueue } = {}) {
  const now = () => NOW;
  const connectedAccounts = new FakeConnectedAccounts();
  const platform = new FakePlatformPosts();
  const archive = new FakeArchive();
  const calmSessions = new FakeCalmSessions();
  const jobQueue = new FakeJobQueue();
  const logs = captureLogs();
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive,
    calmSessions,
    now,
    logger: logs.logger,
  });
  const runJob = createActivationJob({
    calmMode,
    calmSessions,
    jobQueue: queue ?? jobQueue,
    now,
    sliceMs,
    logger: logs.logger,
  });

  const account = await connectedAccounts.connect({
    accountId: ME,
    platform: 'bluesky',
    externalId: 'did:plc:dean' as ExternalAccountId,
    handle: 'dean.bsky.social',
  });
  platform.publish(
    account.id,
    ...Array.from({ length: posts }, (_, hour) =>
      aPost(new Date(NOW.getTime() - (hour + 1) * 3_600_000).toISOString()),
    ),
  );
  const start = await calmMode.start({
    accountId: ME,
    connectedAccountId: account.id,
    period: presetCalmPeriod('last-7-days', NOW),
  });
  if (start.outcome !== 'started') throw new Error('expected to start');

  return {
    account,
    platform,
    archive,
    calmSessions,
    jobQueue,
    logs,
    runJob,
    calmSessionId: start.calmSessionId,
  };
}

const activation = (calmSessionId: CalmSessionId) => ({
  job: 'activate-calm-mode',
  payload: { calmSessionId },
});

describe('the activation job', () => {
  it('turns Calm Mode on and queues nothing more once it is done', async () => {
    const { runJob, jobQueue, calmSessions, platform, account, calmSessionId } = await setUp();

    await runJob({ calmSessionId });

    expect(calmSessions.all()[0]?.state).toBe('active');
    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(jobQueue.take()).toEqual([]);
  });

  it('queues the next slice straight away when it runs out of time', async () => {
    // A slice of no time: each run gets through one post, then hands over.
    const { runJob, jobQueue, calmSessions, calmSessionId } = await setUp({ sliceMs: 0 });

    await runJob({ calmSessionId });

    expect(jobQueue.take()).toEqual([activation(calmSessionId)]);
    expect(calmSessions.all()[0]?.state).toBe('activating');
  });

  it('keeps going, slice after slice, until every post is hidden', async () => {
    const { runJob, jobQueue, platform, account, calmSessionId } = await setUp({
      posts: 5,
      sliceMs: 0,
    });

    let runs = 0;
    for (let job: unknown = activation(calmSessionId); job; job = jobQueue.take()[0]) {
      runs += 1;
      await runJob({ calmSessionId });
    }

    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(runs).toBe(5);
  });

  it("waits for Bluesky's limit to reset before carrying on", async () => {
    const { runJob, jobQueue, platform, calmSessionId } = await setUp();
    const resetAt = new Date('2026-11-04T13:00:00.000Z');
    platform.rateLimitNextDelete(resetAt);

    await runJob({ calmSessionId });

    expect(jobQueue.take()).toEqual([{ ...activation(calmSessionId), runAt: resetAt }]);
  });

  it('tries again a minute later when the work was interrupted partway', async () => {
    const { runJob, jobQueue, archive, calmSessionId } = await setUp();
    archive.failSavesAfter(1); // the newest post is backed up and hidden, then storage fails

    await runJob({ calmSessionId });

    expect(jobQueue.take()).toEqual([
      { ...activation(calmSessionId), runAt: new Date(NOW.getTime() + 60_000) },
    ]);
  });

  it('leaves the session alone while another worker has it', async () => {
    const { runJob, jobQueue, calmSessions, platform, account, calmSessionId } = await setUp();
    await calmSessions.claim({
      calmSessionId,
      until: new Date(NOW.getTime() + 60_000),
      now: NOW,
    });

    await runJob({ calmSessionId });

    expect(platform.visibleUris(account.id)).toHaveLength(3);
    expect(jobQueue.take()).toEqual([]);
  });

  it('lets go of the session even when the work throws, so a retry can pick it up', async () => {
    const { runJob, archive, calmSessions, calmSessionId } = await setUp();
    archive.failNextMarkHidden();

    await expect(runJob({ calmSessionId })).rejects.toThrow();

    expect(
      await calmSessions.claim({ calmSessionId, until: new Date(NOW.getTime() + 1), now: NOW }),
    ).toBe(true);
  });

  it('runs to the end by itself on the local queue, one slice after another', async () => {
    vi.useFakeTimers();
    try {
      // The real local queue, delivering to the real job, which queues its next slice back onto it.
      const handlers: { runJob?: ReturnType<typeof createActivationJob> } = {};
      const queue = createInProcessJobQueue({
        handlers: () => ({
          ...NO_JOB_HANDLERS,
          'activate-calm-mode': (payload) =>
            handlers.runJob ? handlers.runJob(payload) : Promise.reject(new Error('not ready')),
        }),
        logger: captureLogs().logger,
        now: () => new Date(),
      });
      const { runJob, platform, account, calmSessions, calmSessionId } = await setUp({
        posts: 4,
        sliceMs: 0,
        queue,
      });
      handlers.runJob = runJob;

      await queue.enqueue('activate-calm-mode', { calmSessionId });
      await vi.runAllTimersAsync();

      expect(platform.visibleUris(account.id)).toEqual([]);
      expect(calmSessions.all()[0]?.state).toBe('active');
    } finally {
      vi.useRealTimers();
    }
  });
});
