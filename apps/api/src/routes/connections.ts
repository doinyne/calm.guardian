import { isAppReturnUrl } from '@calm-guardian/shared';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { BlueskySignInCancelledError, type BlueskyOAuth } from '../connections/bluesky-oauth';
import { ConnectedAccountIdSchema, type ConnectedAccount } from '../connections/connected-account';
import {
  ConnectedElsewhereError,
  type ConnectedAccountsRepository,
} from '../connections/connected-accounts-repository';
import { ConnectionHasHiddenPostsError, type Disconnect } from '../connections/connection-removal';
import type { PendingConnections } from '../connections/pending-connections';
import { errorResponse } from '../http/errors';
import type { RequireAccount } from '../http/require-account';
import { validate } from '../http/validation';
import type { Logger } from '../logger';

export type ConnectionsDependencies = {
  connectedAccounts: ConnectedAccountsRepository;
  bluesky: BlueskyOAuth;
  pendingConnections: PendingConnections;
  disconnect: Disconnect;
  /** Where Bluesky's callback sends the user back into the app. */
  appReturnUrl: URL;
};

/** What the callback tells the app when there's no sign-in to claim. */
type CallbackStatus = 'cancelled' | 'failed';

/** The app says where to come back to: Expo Go's link or its own (ADR-0017). */
const StartConnectionSchema = z.object({
  returnUrl: z.string().max(2000).refine(isAppReturnUrl, "must be the app's own link").optional(),
});

const CompleteConnectionSchema = z.object({ code: z.string().min(1).max(200) });
const ConnectionParamsSchema = z.object({ id: ConnectedAccountIdSchema });

/**
 * Connecting (ADR-0003):
 * 1. The app starts a sign-in and opens Bluesky's page.
 * 2. Bluesky redirects to our callback, which hands the app a single-use code.
 * 3. The app, signed in as the Account that started, completes the connection with that code.
 *
 * Step 3 is what binds the connection to the person who asked for it.
 */
export function connectionsRoutes({
  requireAccount,
  logger,
  connectedAccounts,
  bluesky,
  pendingConnections,
  disconnect,
  appReturnUrl,
}: ConnectionsDependencies & { requireAccount: RequireAccount; logger: Logger }) {
  const backToApp = (c: Context, params: Record<string, string>, returnUrl?: string) => {
    const url = new URL(returnUrl ?? appReturnUrl);
    for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
    return c.redirect(url.href, 302);
  };

  return (
    new Hono()
      .get('/connections', requireAccount, async (c) => {
        const accounts = await connectedAccounts.listForAccount(c.var.accountId);
        return c.json({ connectedAccounts: accounts.map(toConnectionResponse) });
      })

      .post(
        '/connections/bluesky',
        requireAccount,
        validate('json', StartConnectionSchema),
        async (c) => {
          const { returnUrl } = c.req.valid('json');
          const authorizationUrl = await bluesky.authorizationUrl({
            startedBy: c.var.accountId,
            ...(returnUrl ? { returnUrl } : {}),
          });
          return c.json({ authorizationUrl: authorizationUrl.href });
        },
      )

      // Public: Bluesky's redirect lands here. It connects nothing; it only holds the sign-in for the
      // app to claim. The request logger never records the query, which carries Bluesky's code.
      .get('/connections/bluesky/callback', async (c) => {
        try {
          const signIn = await bluesky.completeSignIn(new URL(c.req.url).searchParams);
          const code = await pendingConnections.hold(signIn);
          return backToApp(c, { code }, signIn.returnUrl);
        } catch (error) {
          const status: CallbackStatus =
            error instanceof BlueskySignInCancelledError ? 'cancelled' : 'failed';
          if (status === 'failed') {
            logger.warn({ err: error, requestId: c.get('requestId') }, 'Bluesky sign-in failed');
          }
          const returnUrl =
            error instanceof BlueskySignInCancelledError ? error.returnUrl : undefined;
          return backToApp(c, { status }, returnUrl);
        }
      })

      .post(
        '/connections/bluesky/complete',
        requireAccount,
        validate('json', CompleteConnectionSchema),
        async (c) => {
          const pending = await pendingConnections.take(c.req.valid('json').code);
          if (!pending) {
            return errorResponse(c, 400, {
              code: 'connection_code_invalid',
              message: 'That sign-in has expired. Please connect your account again.',
            });
          }

          if (pending.startedBy !== c.var.accountId) {
            logger.warn(
              { requestId: c.get('requestId') },
              'Refused a Bluesky sign-in started by a different Account',
            );
            // Drop tokens nobody will use, unless they're already someone's connection.
            const owned = await connectedAccounts.isConnected({
              platform: 'bluesky',
              externalId: pending.did,
            });
            if (!owned) await bluesky.revoke(pending.did);
            return errorResponse(c, 403, {
              code: 'connection_started_elsewhere',
              message:
                'This sign-in was started on another account. Please connect again from here.',
            });
          }

          try {
            const connected = await connectedAccounts.connect({
              accountId: c.var.accountId,
              platform: 'bluesky',
              externalId: pending.did,
              handle: pending.handle,
            });
            return c.json({ connectedAccount: toConnectionResponse(connected) }, 201);
          } catch (error) {
            if (!(error instanceof ConnectedElsewhereError)) throw error;
            return errorResponse(c, 409, {
              code: 'connected_elsewhere',
              message:
                'That Bluesky account is already connected to another Calm Guardian account.',
            });
          }
        },
      )

      .delete(
        '/connections/:id',
        requireAccount,
        validate('param', ConnectionParamsSchema),
        async (c) => {
          try {
            await disconnect({
              accountId: c.var.accountId,
              connectedAccountId: c.req.valid('param').id,
            });
          } catch (error) {
            if (!(error instanceof ConnectionHasHiddenPostsError)) throw error;
            return errorResponse(c, 409, {
              code: 'connection_has_hidden_posts',
              message: `This account has ${hiddenPostsPhrase(error.hiddenPosts)}. Restore them, or delete them for good, before disconnecting it.`,
            });
          }
          return c.body(null, 204);
        },
      )
  );
}

function hiddenPostsPhrase(count: number) {
  return count === 1 ? '1 hidden post' : `${count} hidden posts`;
}

/** What the app sees. The Platform's own ID stays on the server: the app has no use for it. */
function toConnectionResponse({ id, platform, handle, status, connectedAt }: ConnectedAccount) {
  return { id, platform, handle, status, connectedAt: connectedAt.toISOString() };
}
