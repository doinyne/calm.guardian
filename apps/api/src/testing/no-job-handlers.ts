import type { JobHandlers } from '../jobs/job-queue';

const doNothing = () => Promise.resolve();

/** Handlers that do nothing, for tests about one job: spread it, then override that job. */
export const NO_JOB_HANDLERS: JobHandlers = {
  'activate-calm-mode': doNothing,
  'restore-all': doNothing,
  sweep: doNothing,
};
