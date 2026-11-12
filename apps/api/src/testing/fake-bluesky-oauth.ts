import type { AccountId } from '../accounts/account-id';
import {
  BlueskySignInCancelledError,
  type BlueskyOAuth,
  type BlueskySignIn,
} from '../connections/bluesky-oauth';
import type { ExternalAccountId } from '../connections/connected-account';

/** A stand-in for Bluesky's sign-in. Tests say in advance which sign-in a callback code completes. */
export class FakeBlueskyOAuth implements BlueskyOAuth {
  readonly revoked: ExternalAccountId[] = [];
  private readonly signIns = new Map<string, BlueskySignIn>();
  private revokesFail = false;

  /** Bluesky will redirect back with `?code=<callbackCode>` once this sign-in is approved. */
  willCompleteSignIn(callbackCode: string, signIn: BlueskySignIn) {
    this.signIns.set(callbackCode, signIn);
  }

  /** Like Bluesky being unreachable. */
  failRevokes() {
    this.revokesFail = true;
  }

  /** The return link from the last sign-in started, which Bluesky would hand back in the state. */
  private lastReturnUrl: string | undefined;

  authorizationUrl({ startedBy, returnUrl }: { startedBy: AccountId; returnUrl?: string }) {
    this.lastReturnUrl = returnUrl;
    return Promise.resolve(
      new URL(`https://bsky.social/oauth/authorize?request_uri=fake-${startedBy}`),
    );
  }

  completeSignIn(callbackParams: URLSearchParams) {
    if (callbackParams.get('error') === 'access_denied') {
      return Promise.reject(new BlueskySignInCancelledError(this.lastReturnUrl));
    }
    const signIn = this.signIns.get(callbackParams.get('code') ?? '');
    return signIn
      ? Promise.resolve({
          ...signIn,
          ...(this.lastReturnUrl ? { returnUrl: this.lastReturnUrl } : {}),
        })
      : Promise.reject(new Error('Bluesky rejected the code'));
  }

  revoke(did: ExternalAccountId) {
    this.revoked.push(did);
    return this.revokesFail ? Promise.reject(new Error('Bluesky unreachable')) : Promise.resolve();
  }
}
