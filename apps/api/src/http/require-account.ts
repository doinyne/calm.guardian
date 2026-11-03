import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

import type { AccountId } from '../accounts/account-id';
import { AccessTokenRejectedError, type VerifyAccessToken } from '../auth/access-token';
import type { Logger } from '../logger';
import { errorResponse } from './errors';

export type AccountVariables = { accountId: AccountId };

const BEARER_TOKEN = /^Bearer (\S+)$/;

/**
 * Lets a request through only with a valid Supabase access token, and sets `c.var.accountId` from
 * it. Routes must take the Account ID from here, never from the request body, query or path.
 */
export function requireAccount({
  verifyAccessToken,
  logger,
}: {
  verifyAccessToken: VerifyAccessToken;
  logger: Logger;
}) {
  return createMiddleware<{ Variables: AccountVariables }>(async (c, next) => {
    const token = BEARER_TOKEN.exec(c.req.header('authorization') ?? '')?.[1];
    if (!token) return respondUnauthorized(c);

    try {
      const { accountId } = await verifyAccessToken(token);
      c.set('accountId', accountId);
    } catch (error) {
      if (!(error instanceof AccessTokenRejectedError)) throw error;

      logger.info({ reason: error.reason, requestId: c.get('requestId') }, 'Access token rejected');
      return respondUnauthorized(c);
    }

    return next();
  });
}

export type RequireAccount = ReturnType<typeof requireAccount>;

function respondUnauthorized(c: Context) {
  c.header('WWW-Authenticate', 'Bearer');
  return errorResponse(c, 401, {
    code: 'unauthorized',
    message: 'Your session has ended. Please sign in again.',
  });
}
