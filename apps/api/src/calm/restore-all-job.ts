import type { AccountId } from '../accounts/account-id';
import type { ConnectedAccountId } from '../connections/connected-account';
import type { JobPayload, JobQueue } from '../jobs/job-queue';
import type { Logger } from '../logger';
import { ACTIVATION_SLICE_MS } from './activation-job';
import type { createRestore, RestoreAllResult } from './restore';

type Restore = Pick<ReturnType<typeof createRestore>, 'restoreAll'>;

/** What to queue after a run, if anything. */
const NEXT_RUN: Record<
  RestoreAllResult['outcome'],
  (result: RestoreAllResult, now: Date) => Date | null
> = {
  'in-progress': (_, now) => now,
  waiting: (result, now) => (result.outcome === 'waiting' ? result.until : now),
  done: () => null,
  // The user turned Calm Mode back on, or must sign in again: Review shows what's left.
  'calm-mode-on': () => null,
  'needs-sign-in': () => null,
};

/**
 * The `restore-all` job: one slice of Restore all, then queue the next if there's more to do. Restore
 * is retry-safe per post, so a repeated or overlapping run can't duplicate a post.
 */
export function createRestoreAllJob({
  restore,
  jobQueue,
  now,
  logger,
  sliceMs = ACTIVATION_SLICE_MS,
}: {
  restore: Restore;
  jobQueue: JobQueue;
  now: () => Date;
  logger: Logger;
  sliceMs?: number;
}) {
  return async function runRestoreAll(payload: JobPayload<'restore-all'>) {
    const startedAt = now();
    const result = await restore.restoreAll({
      accountId: payload.accountId as AccountId,
      connectedAccountId: payload.connectedAccountId as ConnectedAccountId,
      deadline: new Date(startedAt.getTime() + sliceMs),
    });

    logger.info(
      { connectedAccountId: payload.connectedAccountId, outcome: result.outcome },
      'Restore all ran',
    );
    const runAt = NEXT_RUN[result.outcome](result, now());
    if (!runAt) return;
    await jobQueue.enqueue('restore-all', payload, runAt > now() ? { runAt } : {});
  };
}
