# 0002: Accounts via Supabase Auth; the app talks only to our API

**Status:** Accepted · **Date:** 2026-11-02 · **Accepted:** 2026-11-03

## Context
Users need a Calm Guardian **Account** that is separate from any social Platform, so they can
connect Bluesky now and other Platforms later. The sign-in has to be as frictionless as possible,
because it's the first thing every user sees.

v1 signed its own 30-day JWTs with no refresh or revocation, and used the Supabase service-role key,
so its RLS policies never applied.

Store rules that apply:
- **Apple 4.8:** if we offer a third-party login (e.g. Google), we must also offer an equivalent
  privacy-preserving option. Sign in with Apple qualifies.
- **Apple 5.1.1(v) and Google Play:** account deletion must be available in the app. Google also
  requires a web URL for it. For Sign in with Apple, we must revoke the user's Apple tokens on deletion.

## Options
1. **Roll our own** (email + password, our own JWTs). Full control, but we'd own password storage,
   resets, refresh rotation and revocation. That's a lot of security surface for a solo developer.
2. **Supabase Auth.** Managed sessions with refresh-token rotation and revocation, native Apple and
   Google ID-token sign-in, and email one-time codes. It's already part of our stack.
3. **Another identity provider** (Clerk, Auth0, Firebase Auth). Good, but it adds a vendor and its
   pricing tiers.

## Decision
- Use **Supabase Auth** with three methods:
  - **Sign in with Apple:** native on iOS.
  - **Google:** native on Android, and also offered on iOS.
  - **Email one-time code:** works everywhere, with no passwords to manage.
- The app uses Supabase **only for authentication**. All data goes through our API, which:
  - verifies the Supabase access token (JWT) against Supabase's JWKS on every request
  - derives the Account ID from the token, never from the request body
  - uses its own server-side DB credentials
- RLS is enabled on every table with **no policies** for the `anon` and `authenticated` roles, so a
  leaked anon key can read nothing. This is defence in depth, not our primary control.

## Consequences
- One data path (app → API → DB) is easier to reason about, test and audit than mixing direct
  Supabase queries with API calls.
- The API is responsible for scoping every query by Account. Repository functions take `accountId`
  as a required argument.
- Session storage on the device must be secure. See "Implementation notes" for how.
- Account deletion is a multi-step server operation (revoke Platform tokens, revoke Apple tokens,
  delete data, delete the auth user). It must be idempotent and tested first.
- We depend on Supabase Auth's availability. That's acceptable at our scale.

## Implementation notes (M1, email sign-in)

- **Session storage.** Supabase sessions are 2–4 KB, and some iOS versions have rejected Keychain items
  over 2 KB. Supabase's Expo recipe encrypts the session with `aes-js` (unmaintained, unauthenticated
  AES-CTR) and keeps the ciphertext in AsyncStorage. Instead, `chunked-secure-storage.ts` splits the
  session across Keychain/Keystore items of at most 2 KB each, with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`, so
  tokens never move to another phone through a backup. A missing piece reads as signed out.
- **Token verification.** The API accepts only asymmetric tokens (ES256 or RS256) for the
  `authenticated` audience and role, with an expiry, from our project's issuer, and never anonymous
  users. Signing keys come from JWKS, cached for 10 minutes. If the keys can't be fetched, the request
  fails as a server error, never as "signed out". Local Supabase signs with an ES256 key too
  (`npm run supabase:signing-key`). **M0b:** check the hosted projects use asymmetric signing keys.
- **Revocation.** Access tokens are stateless and stay valid until they expire (1 hour), even after
  sign-out or account deletion. That's acceptable today because our tables cascade from `auth.users`,
  so writes for a deleted Account fail. If an endpoint ever needs instant revocation, check the token's
  `session_id` against Supabase.
- **Sign-out** ends the session on this device only. Supabase's default would sign the user out on
  every device.
