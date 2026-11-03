import type { AccountId } from '../accounts/account-id';
import type { ExternalAccountId } from './connected-account';

/** A finished sign-in on Bluesky: who signed in, and which Account started it. */
export type BlueskySignIn = {
  did: ExternalAccountId;
  handle: string;
  startedBy: AccountId;
};

/** The user chose not to approve Calm Guardian on Bluesky. Not an error worth logging. */
export class BlueskySignInCancelledError extends Error {
  override name = 'BlueskySignInCancelledError';

  constructor() {
    super('The user cancelled signing in to Bluesky');
  }
}

/**
 * Signing in to Bluesky with AT Protocol OAuth (ADR-0003). The adapter in
 * `atproto-bluesky-oauth.ts` is the only code that knows the library; tests use a fake.
 */
export type BlueskyOAuth = {
  /** Where to send the user to approve Calm Guardian. The Account is remembered server-side. */
  authorizationUrl: (startedBy: AccountId) => Promise<URL>;
  /**
   * Finishes Bluesky's redirect: swaps its code for tokens (stored encrypted) and says who signed in.
   * Throws `BlueskySignInCancelledError` if the user said no.
   */
  completeSignIn: (callbackParams: URLSearchParams) => Promise<BlueskySignIn>;
  /** Revokes our tokens at Bluesky and forgets the stored session. */
  revoke: (did: ExternalAccountId) => Promise<void>;
};
