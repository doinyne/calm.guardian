import { Agent } from '@atproto/api';
import {
  buildAtprotoLoopbackClientMetadata,
  NodeOAuthClient,
  OAuthCallbackError,
  type NodeSavedSession,
  type NodeSavedState,
} from '@atproto/oauth-client-node';
import { z } from 'zod';

import { isAppReturnUrl } from '@calm-guardian/shared';

import { AccountIdSchema } from '../accounts/account-id';
import { createAtprotoBlueskyRepo } from '../bluesky/atproto-bluesky-repo';
import type { BlueskyRepoFor } from '../bluesky/bluesky-repo';
import type { BlueskyClient } from '../config';
import type { SecretBox } from '../crypto/secret-box';
import { createAdvisoryLock } from '../db/advisory-lock';
import type { Db } from '../db/database';
import { BlueskySignInCancelledError, type BlueskyOAuth } from './bluesky-oauth';
import type { ExternalAccountId } from './connected-account';
import { createSessionStore, createStateStore } from './encrypted-stores';

/**
 * The narrowest permissions that let Calm Mode hide (delete) and Restore (re-create) posts and their
 * images. Reading posts needs none: they're public.
 */
const SCOPE = 'atproto repo:app.bsky.feed.post?action=create&action=delete blob:*/*';

/**
 * Bluesky's own sign-in service, where most accounts live. Signing in by handle, for accounts on
 * other servers, comes with the connect screen.
 */
const BLUESKY_SIGN_IN = 'https://bsky.social';

/** An unfinished sign-in is forgotten after an hour. */
const SIGN_IN_STATE_TTL_MS = 60 * 60 * 1000;

/** Kept by the library in our encrypted state store; it never leaves the server. */
const AppStateSchema = z.object({
  startedBy: AccountIdSchema,
  returnUrl: z.string().refine(isAppReturnUrl).optional(),
});

/**
 * AT Protocol OAuth through `@atproto/oauth-client-node`, the only file that knows the library.
 *
 * Locally this is Bluesky's development ("loopback") client. Deployed, it's a public web client whose
 * details the API publishes itself (ADR-0017). Both are public clients: no keys, and Bluesky limits
 * their sessions to about two weeks, after which the user signs in again (`needs_reauth`).
 */
export function createAtprotoBlueskyOAuth({
  db,
  secretBox,
  client: kind,
  onSessionEnded,
}: {
  db: Db;
  secretBox: SecretBox;
  client: BlueskyClient;
  /** Bluesky stopped honouring a session (refresh failed, or revoked). */
  onSessionEnded: (did: ExternalAccountId) => void;
}): BlueskyOAuth & { repoFor: BlueskyRepoFor; clientMetadata: Readonly<Record<string, unknown>> } {
  const clientMetadata = metadataFor(kind);
  const client = new NodeOAuthClient({
    clientMetadata,
    stateStore: createStateStore<NodeSavedState>({ db, secretBox, ttlMs: SIGN_IN_STATE_TTL_MS }),
    sessionStore: createSessionStore<NodeSavedSession>({ db, secretBox }),
    requestLock: createAdvisoryLock(db),
    onSessionDeleted: (did) => onSessionEnded(did as ExternalAccountId),
  });

  return {
    authorizationUrl: ({ startedBy, returnUrl }) =>
      client.authorize(BLUESKY_SIGN_IN, {
        scope: SCOPE,
        state: JSON.stringify({ startedBy, ...(returnUrl ? { returnUrl } : {}) }),
      }),

    async completeSignIn(callbackParams) {
      try {
        const { session, state } = await client.callback(callbackParams);
        const { startedBy, returnUrl } = AppStateSchema.parse(JSON.parse(state ?? 'null'));
        const { data } = await new Agent(session).com.atproto.repo.describeRepo({
          repo: session.did,
        });
        return {
          did: session.did as ExternalAccountId,
          handle: data.handle,
          startedBy,
          ...(returnUrl ? { returnUrl } : {}),
        };
      } catch (error) {
        if (error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied') {
          throw new BlueskySignInCancelledError(returnUrlIn(error.state));
        }
        throw error;
      }
    },

    revoke: (did) => client.revoke(did),

    /** What the API publishes at its client ID, for Bluesky to read (only used by a public client). */
    clientMetadata,

    /** Signs in as the account with its stored session, refreshing tokens if they've expired. */
    repoFor: async (did) => createAtprotoBlueskyRepo(await client.restore(did)),
  };
}

/** The return link kept in a sign-in's state, if it's there and allowed. */
function returnUrlIn(state: string | undefined): string | undefined {
  if (!state) return undefined;
  try {
    return AppStateSchema.parse(JSON.parse(state)).returnUrl;
  } catch {
    // Unreadable state: the callback falls back to the configured link.
    return undefined;
  }
}

/** The client details Bluesky checks: the development client, or our own public web client. */
function metadataFor(kind: BlueskyClient) {
  if (kind.kind === 'development') {
    return buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [kind.redirectUrl.href],
    });
  }
  return {
    client_id: kind.clientId.href,
    client_name: 'Calm Guardian',
    client_uri: new URL('/', kind.clientId).href,
    application_type: 'web' as const,
    grant_types: ['authorization_code', 'refresh_token'] as ['authorization_code', 'refresh_token'],
    response_types: ['code'] as ['code'],
    redirect_uris: [kind.redirectUrl.href] as [string],
    scope: SCOPE,
    token_endpoint_auth_method: 'none' as const,
    dpop_bound_access_tokens: true,
  };
}
