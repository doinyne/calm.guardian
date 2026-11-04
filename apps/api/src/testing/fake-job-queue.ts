import type { JobName, JobPayload, JobQueue } from '../jobs/job-queue';

export type QueuedJob = { job: JobName; payload: JobPayload<JobName>; runAt?: Date };

/** Records what was queued, and runs nothing, so tests can check what happens next. */
export class FakeJobQueue implements JobQueue {
  readonly queued: QueuedJob[] = [];

  enqueue<Job extends JobName>(job: Job, payload: JobPayload<Job>, options: { runAt?: Date } = {}) {
    this.queued.push({ job, payload, ...(options.runAt ? { runAt: options.runAt } : {}) });
    return Promise.resolve();
  }

  /** Takes the queued jobs, leaving the queue empty. */
  take(): QueuedJob[] {
    return this.queued.splice(0);
  }
}
