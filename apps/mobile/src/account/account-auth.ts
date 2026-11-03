/** The signed-in person's Calm Guardian Account, as the app sees it. */
export type SignedInAccount = { id: string; email: string | null };

export type SignInErrorKind =
  'invalid-email' | 'invalid-code' | 'rate-limited' | 'network' | 'unknown';

/** Why sending or checking a sign-in code failed, in our terms rather than the provider's. */
export class SignInError extends Error {
  override name = 'SignInError';

  constructor(
    readonly kind: SignInErrorKind,
    options?: ErrorOptions,
  ) {
    super(`Sign-in failed (${kind})`, options);
  }
}

/**
 * Everything the app needs from the sign-in provider. Only `supabase-account-auth.ts` knows the
 * provider is Supabase; tests use `FakeAccountAuth`.
 */
export type AccountAuth = {
  /**
   * Calls `listener` once the saved session has been restored (with `null` if there isn't one),
   * then whenever the user signs in or out, including when a session can no longer be refreshed.
   * Returns a function that stops listening.
   */
  onSessionChange: (listener: (account: SignedInAccount | null) => void) => () => void;
  /** Emails a one-time code. Creates the Account if the email is new, so sign-up and sign-in are one flow. */
  sendSignInCode: (email: string) => Promise<void>;
  /** Signs in with the emailed code. The session change listener then reports the Account. */
  verifySignInCode: (details: { email: string; code: string }) => Promise<void>;
  /** A current access token for our API (refreshed if needed), or `null` when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Ends the session on this device only. Other devices stay signed in. */
  signOutThisDevice: () => Promise<void>;
};
