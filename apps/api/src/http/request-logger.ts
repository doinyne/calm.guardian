import type { MiddlewareHandler } from 'hono';

import type { Logger } from '../logger';

/**
 * Logs one line per request. It deliberately leaves out the query string, headers and body: OAuth
 * callbacks carry one-time codes in the query, and headers carry bearer tokens.
 */
export function requestLogger(logger: Logger): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();

    await next();

    logger.info(
      {
        requestId: c.get('requestId'),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Math.round(performance.now() - startedAt),
      },
      'request completed',
    );
  };
}
