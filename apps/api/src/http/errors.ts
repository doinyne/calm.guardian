import type { ApiErrorBody, ApiErrorCode } from '@calm-guardian/shared';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

import type { Logger } from '../logger';

const GENERIC_SERVER_ERROR_MESSAGE = 'Something went wrong on our side. Please try again.';
const GENERIC_CLIENT_ERROR_MESSAGE = 'The request could not be processed.';

const CODE_BY_CLIENT_STATUS: Partial<Record<number, ApiErrorCode>> = {
  404: 'not_found',
  413: 'payload_too_large',
};

/** Every error response goes through here, so clients only ever see one shape. */
export function errorResponse<Status extends ContentfulStatusCode>(
  c: Context,
  status: Status,
  error: Omit<ApiErrorBody['error'], 'requestId'>,
) {
  const body: ApiErrorBody = { error: { ...error, requestId: c.get('requestId') } };
  return c.json(body, status);
}

/**
 * Client errors (4xx) are reported as they are. Anything else is logged in full and answered with
 * a generic message, because internal error messages can contain data the client must not see.
 */
export function createErrorHandler(logger: Logger): ErrorHandler {
  return (err, c) => {
    if (err instanceof HTTPException && err.status < 500) {
      return errorResponse(c, err.status, {
        code: CODE_BY_CLIENT_STATUS[err.status] ?? 'bad_request',
        message: err.message || GENERIC_CLIENT_ERROR_MESSAGE,
      });
    }

    logger.error({ err, requestId: c.get('requestId') }, 'Unhandled error');
    return errorResponse(c, 500, { code: 'internal_error', message: GENERIC_SERVER_ERROR_MESSAGE });
  };
}

export const handleNotFound: NotFoundHandler = (c) =>
  errorResponse(c, 404, { code: 'not_found', message: 'There is nothing at this address.' });
