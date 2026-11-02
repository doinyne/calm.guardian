# 0002: Accounts via Supabase Auth; the app talks only to our API

**Status:** Proposed · **Date:** 2026-11-02

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
- Session storage on the device must be secure. SecureStore has value-size limits, so M1 must check
  Supabase's current Expo guidance (e.g. an encrypted value in AsyncStorage with the key in SecureStore).
- Account deletion is a multi-step server operation (revoke Platform tokens, revoke Apple tokens,
  delete data, delete the auth user). It must be idempotent and tested first.
- We depend on Supabase Auth's availability. That's acceptable at our scale.
