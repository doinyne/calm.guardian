import type { JobPayload, JobQueue } from '../jobs/job-queue';
import type { Logger } from '../logger';
import type { ActivationResult, createCalmMode } from './calm-mode';
import type { CalmSessionId, CalmSessions } from './calm-session';

/** How long one run works before handing over (ADR-0015: inside Cloud Tasks' 10-minute deadline). */
export const ACTIVATION_SLICE_MS = 8 * 60_000;
/** A worker's claim outlasts its slice, so it can't run out while the worker is still busy. */
const CLAIM_MS = 10 * 60_000;
/** After an error partway, the next try. Calm Mode keeps going until it's done (ADR-0015). */
const INTERRUPTED_RETRY_MS = 60_000;

type CalmMode = Pick<ReturnType<typeof createCalmMode>, 'continueActivation'>;

/** What to queue after a run, if anything. */
const NEXT_RUN: Record<
  ActivationResult['outcome'],
  (result: ActivationResult, now: Date) => Date | null
> = {
  'in-progress': (_, now) => now,
  waiting: (result, now) => (result.outcome === 'waiting' ? result.until : now),
  interrupted: (_, now) => new Date(now.getTime() + INTERRUPTED_RETRY_MS),
  active: () => null,
  'already-active': () => null,
  failed: () => null,
  off: () => null,
  // Paused until the user signs in to the Platform again; starting Calm Mode then resumes it.
  'needs-sign-in': () => null,
};

/**
 * The `activate-calm-mode` job: one slice of turning Calm Mode on, then queue the next if there's
 * more to do. Concurrency, timing and retries live here; what to do with posts lives in the core.
 */
export function createActivationJob({
  calmMode,
  calmSessions,
  jobQueue,
  now,
  logger,
  sliceMs = ACTIVATION_SLICE_MS,
  onCalmModeOn,
}: {
  calmMode: CalmMode;
  calmSessions: Pick<CalmSessions, 'claim' | 'release'>;
  jobQueue: JobQueue;
  now: () => Date;
  logger: Logger;
  sliceMs?: number;
  /** Once Calm Mode is on: tell the Guardians. Must be safe to call more than once. */
  onCalmModeOn?: (calmSessionId: CalmSessionId) => Promise<void>;
}) {
  return async function runActivation({ calmSessionId }: JobPayload<'activate-calm-mode'>) {
    const id = calmSessionId as CalmSessionId;
    const startedAt = now();
    const claimed = await calmSessions.claim({
      calmSessionId: id,
      until: new Date(startedAt.getTime() + CLAIM_MS),
      now: startedAt,
    });
    // Another worker has it, and queues whatever comes next itself.
    if (!claimed) return;

    let result: ActivationResult;
    try {
      result = await calmMode.continueActivation({
        calmSessionId: id,
        deadline: new Date(startedAt.getTime() + sliceMs),
      });
    } finally {
      await calmSessions.release(id);
    }

    logger.info({ calmSessionId: id, outcome: result.outcome }, 'Calm Mode activation ran');
    // On a retry the session is already on: the notice is sent once, so asking again is safe.
    if (result.outcome === 'active' || result.outcome === 'already-active') {
      await onCalmModeOn?.(id);
    }
    const runAt = NEXT_RUN[result.outcome](result, now());
    if (!runAt) return;
    await jobQueue.enqueue('activate-calm-mode', { calmSessionId }, runAt > now() ? { runAt } : {});
  };
}
