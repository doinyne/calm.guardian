import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { errorResponse } from '../http/errors';
import { GoogleCallerRejectedError, type VerifyGoogleCaller } from '../internal/google-caller';
import { JOB_PAYLOADS, type JobHandlers, type JobName } from '../jobs/job-queue';
import type { Logger } from '../logger';

export type InternalDependencies = {
  verifyGoogleCaller: VerifyGoogleCaller;
  /** A function, so the routes can exist before the handlers that queue more work. */
  handlers: () => JobHandlers;
  queueSweeps: () => Promise<void>;
};

const BEARER_TOKEN = /^Bearer (\S+)$/;
const JobParamsSchema = z.object({
  job: z.enum(Object.keys(JOB_PAYLOADS) as [JobName, ...JobName[]]),
});

/**
 * Where Cloud Tasks delivers jobs and Cloud Scheduler starts the Sweep (ADR-0015). Only for requests
 * Google signed for our own invoker account. A failing job answers 500, so the queue retries it.
 */
export function internalRoutes({
  verifyGoogleCaller,
  handlers,
  queueSweeps,
  logger,
}: InternalDependencies & { logger: Logger }) {
  async function fromGoogle(c: Context) {
    const token = BEARER_TOKEN.exec(c.req.header('authorization') ?? '')?.[1];
    try {
      if (!token) throw new GoogleCallerRejectedError('missing');
      await verifyGoogleCaller(token);
      return true;
    } catch (error) {
      if (!(error instanceof GoogleCallerRejectedError)) throw error;
      logger.warn({ reason: error.reason }, 'Refused an internal request');
      return false;
    }
  }

  const unauthorized = (c: Context) =>
    errorResponse(c, 401, { code: 'unauthorized', message: 'Not for you.' });

  return new Hono()
    .post('/internal/jobs/:job', async (c) => {
      if (!(await fromGoogle(c))) return unauthorized(c);
      const params = JobParamsSchema.safeParse(c.req.param());
      if (!params.success)
        return errorResponse(c, 404, { code: 'not_found', message: 'No such job.' });
      const { job } = params.data;
      const payload = JOB_PAYLOADS[job].safeParse(await c.req.json().catch(() => null));
      // A payload that can't be right won't become right on a retry: say so, so the queue drops it.
      if (!payload.success) {
        logger.error({ job }, 'Dropped a background job with an invalid payload');
        return c.body(null, 204);
      }
      const handle = handlers()[job] as (payload: unknown) => Promise<void>;
      await handle(payload.data);
      return c.body(null, 204);
    })

    .post('/internal/sweep', async (c) => {
      if (!(await fromGoogle(c))) return unauthorized(c);
      await queueSweeps();
      return c.body(null, 204);
    });
}
