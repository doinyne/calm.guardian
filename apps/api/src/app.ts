import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';

import type { DeleteAccount } from './accounts/delete-account';
import type { VerifyAccessToken } from './auth/access-token';
import type { ConnectedAccountsRepository } from './connections/connected-accounts-repository';
import { createErrorHandler, errorResponse, handleNotFound } from './http/errors';
import { requestLogger } from './http/request-logger';
import { requireAccount } from './http/require-account';
import type { Logger } from './logger';
import { accountRoutes } from './routes/account';
import { connectionsRoutes } from './routes/connections';
import { healthRoutes, type ReadinessCheck } from './routes/health';

/** Clients only send small commands; post content is backed up server-side, never uploaded. */
const MAX_REQUEST_BODY_BYTES = 100 * 1024;

export type AppDependencies = {
  logger: Logger;
  readinessChecks: ReadinessCheck[];
  verifyAccessToken: VerifyAccessToken;
  deleteAccount: DeleteAccount;
  connectedAccounts: ConnectedAccountsRepository;
};

/**
 * Builds the app without starting a server, so tests can call `app.request()` directly and every
 * collaborator can be swapped for a fake.
 */
export function createApp({
  logger,
  readinessChecks,
  verifyAccessToken,
  deleteAccount,
  connectedAccounts,
}: AppDependencies) {
  const signedIn = requireAccount({ verifyAccessToken, logger });

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
    .route('/', healthRoutes({ readinessChecks, logger }))
    .route('/', accountRoutes({ requireAccount: signedIn, deleteAccount }))
    .route('/', connectionsRoutes({ requireAccount: signedIn, connectedAccounts }));

  app.onError(createErrorHandler(logger));
  app.notFound(handleNotFound);

  return app;
}

/** The API's route types, for the mobile app's typed client (`hono/client`). */
export type AppType = ReturnType<typeof createApp>;
