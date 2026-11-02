import { Hono } from 'hono';

import { errorResponse } from '../http/errors';
import type { Logger } from '../logger';

/** Something the API needs before it can serve traffic, e.g. the database (from M1). */
export type ReadinessCheck = {
  name: string;
  check: () => Promise<void>;
};

type HealthDependencies = {
  readinessChecks: ReadinessCheck[];
  logger: Logger;
};

export function healthRoutes({ readinessChecks, logger }: HealthDependencies) {
  return (
    new Hono()
      // Liveness: the process is up. Never checks dependencies, so a database blip doesn't get
      // healthy instances restarted.
      .get('/health', (c) => c.json({ status: 'ok' as const }))

      // Readiness: the instance can do useful work right now.
      .get('/ready', async (c) => {
        const failures = await findFailedChecks(readinessChecks);

        if (failures.length > 0) {
          logger.warn({ failures }, 'Readiness check failed');
          return errorResponse(c, 503, {
            code: 'service_unavailable',
            message: 'The service is temporarily unavailable. Please try again shortly.',
          });
        }

        return c.json({ status: 'ok' as const });
      })
  );
}

async function findFailedChecks(readinessChecks: ReadinessCheck[]) {
  const results = await Promise.allSettled(readinessChecks.map(({ check }) => check()));

  return readinessChecks.flatMap(({ name }, index) => {
    const result = results[index];
    return result?.status === 'rejected' ? [{ name, err: result.reason as unknown }] : [];
  });
}
