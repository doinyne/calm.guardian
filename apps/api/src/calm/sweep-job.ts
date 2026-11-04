import type { JobPayload, JobQueue } from '../jobs/job-queue';
import type { Logger } from '../logger';
import { ACTIVATION_SLICE_MS } from './activation-job';
import type { createCalmMode, SweepResult } from './calm-mode';
import type { CalmSessionId, CalmSessions } from './calm-session';

/** A sweep's claim outlasts its slice, so it can't run out while the sweep is still busy. */
const CLAIM_MS = 10 * 60_000;

type CalmMode = Pick<ReturnType<typeof createCalmMode>, 'sweep'>;

/** What to queue after a sweep, if anything. The next scheduled sweep covers everything else. */
const NEXT_RUN: Record<SweepResult['outcome'], (result: SweepResult, now: Date) => Date | null> = {
  'in-progress': (_, now) => now,
  waiting: (result, now) => (result.outcome === 'waiting' ? result.until : now),
  swept: () => null,
  interrupted: () => null,
  'not-on': () => null,
  'needs-sign-in': () => null,
};

/** The `sweep` job: one sweep of one Calm session, never at the same time as its activation. */
export function createSweepJob({
  calmMode,
  calmSessions,
  jobQueue,
  now,
  logger,
  sliceMs = ACTIVATION_SLICE_MS,
}: {
  calmMode: CalmMode;
  calmSessions: Pick<CalmSessions, 'claim' | 'release'>;
  jobQueue: JobQueue;
  now: () => Date;
  logger: Logger;
  sliceMs?: number;
}) {
  return async function runSweep({ calmSessionId }: JobPayload<'sweep'>) {
    const id = calmSessionId as CalmSessionId;
    const startedAt = now();
    const claimed = await calmSessions.claim({
      calmSessionId: id,
      until: new Date(startedAt.getTime() + CLAIM_MS),
      now: startedAt,
    });
    // Another worker has the session; the next scheduled sweep will come round again.
    if (!claimed) return;

    let result: SweepResult;
    try {
      result = await calmMode.sweep({
        calmSessionId: id,
        deadline: new Date(startedAt.getTime() + sliceMs),
      });
    } finally {
      await calmSessions.release(id);
    }

    if (result.outcome === 'swept' && result.hidden > 0) {
      logger.info({ calmSessionId: id, hidden: result.hidden }, 'The Sweep hid new posts');
    }
    const runAt = NEXT_RUN[result.outcome](result, now());
    if (!runAt) return;
    await jobQueue.enqueue('sweep', { calmSessionId }, runAt > now() ? { runAt } : {});
  };
}

/**
 * Queues a sweep for every Calm session that's on. Locally a timer calls this; deployed, Cloud
 * Scheduler will, through `/internal/sweep` (ADR-0015, M0b).
 */
export function createSweepSchedule({
  calmSessions,
  jobQueue,
}: {
  calmSessions: Pick<CalmSessions, 'listActive'>;
  jobQueue: JobQueue;
}) {
  return async function queueSweeps() {
    for (const calmSessionId of await calmSessions.listActive()) {
      await jobQueue.enqueue('sweep', { calmSessionId });
    }
  };
}
