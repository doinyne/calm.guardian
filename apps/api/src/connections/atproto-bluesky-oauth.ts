import { Agent } from '@atproto/api';
import {
  buildAtprotoLoopbackClientMetadata,
  NodeOAuthClient,
  OAuthCallbackError,
  type NodeSavedSession,
  type NodeSavedState,
} from '@atproto/oauth-client-node';
import { z } from 'zod';

import { AccountIdSchema } from '../accounts/account-id';
import { createAtprotoBlueskyRepo } from '../bluesky/atproto-bluesky-repo';
import type { BlueskyRepoFor } from '../bluesky/bluesky-repo';
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
const AppStateSchema = z.object({ startedBy: AccountIdSchema });

/**
 * AT Protocol OAuth through `@atproto/oauth-client-node`, the only file that knows the library.
 *
 * For now this is Bluesky's development ("loopback") client: a public client that needs no domain or
 * keys, but whose sessions Bluesky limits to about two weeks. A deployed API needs a confidential
 * client with its metadata on our domain (M0b).
 */
export function createAtprotoBlueskyOAuth({
  db,
  secretBox,
  redirectUrl,
  onSessionEnded,
}: {
  db: Db;
  secretBox: SecretBox;
  redirectUrl: URL;
  /** Bluesky stopped honouring a session (refresh failed, or revoked). */
  onSessionEnded: (did: ExternalAccountId) => void;
}): BlueskyOAuth & { repoFor: BlueskyRepoFor } {
  const client = new NodeOAuthClient({
    clientMetadata: buildAtprotoLoopbackClientMetadata({
      scope: SCOPE,
      redirect_uris: [redirectUrl.href],
    }),
    stateStore: createStateStore<NodeSavedState>({ db, secretBox, ttlMs: SIGN_IN_STATE_TTL_MS }),
    sessionStore: createSessionStore<NodeSavedSession>({ db, secretBox }),
    requestLock: createAdvisoryLock(db),
    onSessionDeleted: (did) => onSessionEnded(did as ExternalAccountId),
  });

  return {
    authorizationUrl: (startedBy) =>
      client.authorize(BLUESKY_SIGN_IN, { scope: SCOPE, state: JSON.stringify({ startedBy }) }),

    async completeSignIn(callbackParams) {
      try {
        const { session, state } = await client.callback(callbackParams);
        const { startedBy } = AppStateSchema.parse(JSON.parse(state ?? 'null'));
        const { data } = await new Agent(session).com.atproto.repo.describeRepo({
          repo: session.did,
        });
        return { did: session.did as ExternalAccountId, handle: data.handle, startedBy };
      } catch (error) {
        if (error instanceof OAuthCallbackError && error.params.get('error') === 'access_denied') {
          throw new BlueskySignInCancelledError();
        }
        throw error;
      }
    },

    revoke: (did) => client.revoke(did),

    /** Signs in as the account with its stored session, refreshing tokens if they've expired. */
    repoFor: async (did) => createAtprotoBlueskyRepo(await client.restore(did)),
  };
}
