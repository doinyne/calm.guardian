import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import { createErrorHandler, errorResponse, handleNotFound } from './http/errors';
import { requestLogger } from './http/request-logger';
import type { Logger } from './logger';
import { healthRoutes, type ReadinessCheck } from './routes/health';

/** Clients only send small commands; post content is backed up server-side, never uploaded. */
const MAX_REQUEST_BODY_BYTES = 100 * 1024;

export type AppDependencies = {
  logger: Logger;
  readinessChecks: ReadinessCheck[];
};

/**
 * Builds the app without starting a server, so tests can call `app.request()` directly and every
 * collaborator can be swapped for a fake.
 */
export function createApp({ logger, readinessChecks }: AppDependencies) {
  const app = new Hono()
    .use(requestId())
    .use(requestLogger(logger))
    .use(secureHeaders())
    .use(
      bodyLimit({
        maxSize: MAX_REQUEST_BODY_BYTES,
        onError: (c) =>
          errorResponse(c, 413, {
            code: 'payload_too_large',
            message: 'The request was too large.',
          }),
      }),
    )
    .route('/', healthRoutes({ readinessChecks, logger }));

  app.onError(createErrorHandler(logger));
  app.notFound(handleNotFound);

  return app;
}

/** The API's route types, for the mobile app's typed client (`hono/client`). */
export type AppType = ReturnType<typeof createApp>;
