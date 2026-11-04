import type { Logger } from '../logger';
import {
  JOB_PAYLOADS,
  type JobHandlers,
  type JobName,
  type JobPayload,
  type JobQueue,
} from './job-queue';

export type RetryPolicy = { maxAttempts: number; firstDelayMs: number; maxDelayMs: number };

/** Roughly what the Cloud Tasks queues will do (ADR-0015). */
export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 10,
  firstDelayMs: 5_000,
  maxDelayMs: 5 * 60_000,
};

/**
 * Local dev's job queue: runs each job in this process, on a timer, with retries and growing waits.
 * Same handlers as production, so the work is identical; only the delivery differs. Jobs don't
 * survive a restart, which is fine locally: Calm sessions resume when started again.
 *
 * `handlers` is a function so the queue can be created before the handlers that use it.
 */
export function createInProcessJobQueue({
  handlers,
  logger,
  now,
  retry = DEFAULT_RETRY,
}: {
  handlers: () => JobHandlers;
  logger: Logger;
  now: () => Date;
  retry?: RetryPolicy;
}): JobQueue {
  function schedule<Job extends JobName>(
    job: Job,
    payload: JobPayload<Job>,
    delayMs: number,
    attempt: number,
  ) {
    setTimeout(() => void run(job, payload, attempt), Math.max(0, delayMs));
  }

  async function run<Job extends JobName>(job: Job, payload: JobPayload<Job>, attempt: number) {
    const handle = handlers()[job] as (payload: JobPayload<Job>) => Promise<void>;
    try {
      await handle(payload);
    } catch (error) {
      const errorName = error instanceof Error ? error.name : typeof error;
      if (attempt >= retry.maxAttempts) {
        logger.error({ job, attempt, errorName }, 'Gave up on a background job');
        return;
      }
      const delayMs = Math.min(retry.firstDelayMs * 2 ** (attempt - 1), retry.maxDelayMs);
      logger.warn({ job, attempt, errorName, delayMs }, 'Background job failed; retrying');
      schedule(job, payload, delayMs, attempt + 1);
    }
  }

  return {
    async enqueue(job, payload, options = {}) {
      const checked = (await JOB_PAYLOADS[job].parseAsync(payload)) as JobPayload<typeof job>;
      const delayMs = options.runAt ? options.runAt.getTime() - now().getTime() : 0;
      schedule(job, checked, delayMs, 1);
    },
  };
}
