import { z } from 'zod';

/**
 * Every background job and the payload it carries (ADR-0015). Payloads hold IDs only, never post
 * content, and are checked when a job arrives, because in production they come over HTTP.
 */
export const JOB_PAYLOADS = {
  'activate-calm-mode': z.object({ calmSessionId: z.uuid() }),
  'restore-all': z.object({ accountId: z.uuid(), connectedAccountId: z.uuid() }),
} as const;

export type JobName = keyof typeof JOB_PAYLOADS;
export type JobPayload<Job extends JobName> = z.infer<(typeof JOB_PAYLOADS)[Job]>;

export type JobHandlers = { [Job in JobName]: (payload: JobPayload<Job>) => Promise<void> };

/**
 * Runs work in the background, at least once (ADR-0015). Production uses Cloud Tasks; local dev runs
 * jobs in this process. Every handler must be safe to run twice.
 */
export interface JobQueue {
  enqueue<Job extends JobName>(
    job: Job,
    payload: JobPayload<Job>,
    options?: { runAt?: Date },
  ): Promise<void>;
}
