import { presetCalmPeriod } from '@calm-guardian/shared';
import { describe, expect, it } from 'vitest';

import type { AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from '../connections/connected-account';
import { FakeArchive } from '../testing/fake-archive';
import { FakeCalmSessions } from '../testing/fake-calm-sessions';
import { FakeConnectedAccounts } from '../testing/fake-connected-accounts';
import { FakeJobQueue } from '../testing/fake-job-queue';
import { aPost, FakePlatformPosts } from '../testing/fake-platform-posts';
import { captureLogs } from '../testing/log-capture';
import { createCalmMode } from './calm-mode';
import { createSweepJob, createSweepSchedule } from './sweep-job';

const ACTIVATED_AT = new Date('2026-11-04T12:00:00.000Z');
const ME = '2b0c8a52-3f7e-4d1a-9c6b-5e8f7a1d2c30' as AccountId;

/** Calm Mode on for one account, then the clock moves on to the sweep. */
async function setUp() {
  let clock = ACTIVATED_AT;
  const now = () => clock;
  const connectedAccounts = new FakeConnectedAccounts();
  const platform = new FakePlatformPosts();
  const calmSessions = new FakeCalmSessions();
  const jobQueue = new FakeJobQueue();
  const logger = captureLogs().logger;
  const calmMode = createCalmMode({
    connectedAccounts,
    platformPosts: platform,
    archive: new FakeArchive(),
    calmSessions,
    now,
    logger,
  });
  const runSweep = createSweepJob({ calmMode, calmSessions, jobQueue, now, logger });
  const queueSweeps = createSweepSchedule({ calmSessions, jobQueue });

  const account = await connectedAccounts.connect({
    accountId: ME,
    platform: 'bluesky',
    externalId: 'did:plc:dean' as ExternalAccountId,
    handle: 'dean.bsky.social',
  });
  const activation = await calmMode.activate({
    accountId: ME,
    connectedAccountId: account.id,
    period: presetCalmPeriod('last-24-hours', ACTIVATED_AT),
  });
  if (activation.outcome !== 'active') throw new Error('expected Calm Mode on');
  clock = new Date(ACTIVATED_AT.getTime() + 30 * 60_000);

  return {
    account,
    platform,
    calmSessions,
    jobQueue,
    runSweep,
    queueSweeps,
    calmSessionId: activation.calmSessionId,
  };
}

describe('the Sweep schedule', () => {
  it('queues a sweep for each Calm session that is on', async () => {
    const { queueSweeps, jobQueue, calmSessionId } = await setUp();

    await queueSweeps();

    expect(jobQueue.take()).toEqual([{ job: 'sweep', payload: { calmSessionId } }]);
  });
});

describe('the sweep job', () => {
  it('hides a post made while Calm Mode is on', async () => {
    const { runSweep, platform, account, calmSessionId, jobQueue } = await setUp();
    platform.publish(account.id, aPost('2026-11-04T12:10:00.000Z'));

    await runSweep({ calmSessionId });

    expect(platform.visibleUris(account.id)).toEqual([]);
    expect(jobQueue.take()).toEqual([]);
  });

  it("carries on when Bluesky's limit resets", async () => {
    const { runSweep, platform, account, calmSessionId, jobQueue } = await setUp();
    platform.publish(account.id, aPost('2026-11-04T12:10:00.000Z'));
    const resetAt = new Date('2026-11-04T13:00:00.000Z');
    platform.rateLimitNextDelete(resetAt);

    await runSweep({ calmSessionId });

    expect(jobQueue.take()).toEqual([{ job: 'sweep', payload: { calmSessionId }, runAt: resetAt }]);
  });

  it('leaves the session alone while another worker has it', async () => {
    const { runSweep, platform, account, calmSessions, calmSessionId } = await setUp();
    platform.publish(account.id, aPost('2026-11-04T12:10:00.000Z'));
    await calmSessions.claim({
      calmSessionId,
      until: new Date('2026-11-04T13:00:00.000Z'),
      now: new Date('2026-11-04T12:30:00.000Z'),
    });

    await runSweep({ calmSessionId });

    expect(platform.visibleUris(account.id)).toHaveLength(1);
  });
});
