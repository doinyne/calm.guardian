# 0003: Connected accounts via Platform adapters; Bluesky via AT Protocol OAuth

**Status:** Proposed · **Date:** 2026-11-02 · **Supersedes:** ticket CG-1 (App Password login)

## Context
Users link their social accounts to their Calm Guardian Account. Bluesky is the only Platform at
launch, and Instagram, LinkedIn and Facebook are wanted later. Calm Mode and Sweep run on the
server, often with the app closed, so **the server must be able to act on the user's behalf for
weeks at a time**.

v1 sent an App Password to the backend and stored the Bluesky session as plain JSON in Postgres.
App Passwords are also poor UX: the user has to find a settings page, create a password and paste it.

## Options for Bluesky
1. **App Password.** Simple to build, but high friction, and the credential has broad access.
2. **AT Protocol OAuth, public client in the app.** No server secrets, but tokens live on the
   device, the server can't sweep with the app closed, and public clients get shorter session lifetimes.
3. **AT Protocol OAuth, confidential client on the API (backend-for-frontend).** The server holds the
   DPoP keys and tokens, gets longer-lived sessions, and can act with the app closed. The app only
   opens a browser sheet.

## Decision
**Option 3.**
1. The app calls `POST /connections/bluesky` (authenticated) and gets back an authorization URL.
2. The app opens it with `WebBrowser.openAuthSessionAsync`.
3. The user approves on their PDS / Bluesky.
4. The PDS redirects to our API's callback.
5. The API completes the exchange, stores the session against the Account, and redirects to the app's
   deep link with a non-sensitive status.

Supporting details:
- Library: `@atproto/oauth-client-node`. **Verify the current API against its `.d.ts`** before
  coding, because it changes often.
- Client metadata and JWKS are served from an HTTPS URL on our domain (the `client_id` *is* that URL).
- Scopes: request the narrowest set that allows reading, creating and deleting posts and uploading
  blobs. Check Bluesky's granular scope support at implementation time.
- OAuth sessions and state are stored **encrypted at rest** (app-level envelope encryption, with the
  key in Secret Manager) and never logged.

**Platform adapter.** Every Platform implements one interface and declares its **capabilities**:

```ts
type PlatformCapabilities = { canBackup: boolean; canHide: boolean; canDelete: boolean; canRestore: boolean };
```

Core logic (Calm Mode, Sweep, Restore) depends only on the interface and checks capabilities. It
never assumes Bluesky's delete-and-recreate model. The `connected_accounts` table records `platform`,
`external_id` (DID for Bluesky), `handle` and `status` (`active | needs_reauth | revoked`).

## Consequences
- Much better onboarding: there's no password to create or paste.
- We need a domain before M1, for the client metadata URL and the redirect.
- When a refresh fails, the connection becomes `needs_reauth`, and the app must prompt the user to
  reconnect **before** they need Calm Mode, not during a crisis.
- One DID can be connected to only one Account.
- Other Platforms each need a feasibility spike. Their APIs may not support hiding or deleting
  personal posts at all, in which case the capability flags make that explicit in the UI.

## Implementation notes (M1, slice 1: storage)
- **Tables** (`supabase/migrations/20261103165922_connected_accounts.sql`): `connected_accounts`,
  `atproto_oauth_states` and `atproto_oauth_sessions`. An Account can connect many accounts, and a DID
  belongs to one Account (unique `platform` + `external_id`). The repository reconnects an Account's
  own account and refuses anyone else's.
- **Encryption at rest:** app-level AES-256-GCM (`apps/api/src/crypto/secret-box.ts`), with a keyring
  in `TOKEN_ENCRYPTION_KEYS` (the first key seals, all open). Each value is bound to its table and key,
  so it can't be moved to another row. Remote keys live in Secret Manager (M0b). This is "envelope"
  encryption only in the loose sense: there's no KMS-wrapped data key yet. Revisit with KMS if the
  threat model needs it.
- **No tokens left behind:** sessions are keyed by DID, so a `SECURITY DEFINER` trigger deletes a
  Bluesky account's session whenever its `connected_accounts` row is deleted, including when Supabase
  Auth deletes the user.

## Implementation notes (M1, slice 2: connecting Bluesky)
- **Development client for now.** The API uses Bluesky's "loopback" client
  (`buildAtprotoLoopbackClientMetadata`, redirect `http://127.0.0.1:3000/connections/bluesky/callback`).
  It's a public client, so Bluesky limits sessions to about two weeks, and it only works on a
  developer's machine. Config refuses any non-loopback redirect, so it can't be deployed by
  accident. **Before beta (M0b):** switch to the confidential client: client metadata and JWKS on our
  domain, a private key in Secret Manager, `private_key_jwt`.
- **The connection is bound to whoever started it.** Bluesky's callback connects nothing. It holds the
  sign-in under a single-use code (hashed, encrypted, 10 minutes) and redirects to the app. The app,
  signed in, completes it, and only the Account that started can. This stops OAuth "login CSRF", where
  someone gets a victim to approve *their* link and captures the victim's Bluesky account.
- **Scope:** `atproto repo:app.bsky.feed.post?action=create&action=delete blob:*/*`, which is enough to
  hide and restore posts and their images. Bluesky accepted it on 2026-11-03; reading is public.
- **Token refresh** goes through a Postgres *transaction* advisory lock (`requestLock`), so instances
  never refresh the same session at once. It's a transaction lock because Supabase's transaction
  pooler may move statements between connections.
- **Ending a connection:** disconnecting and account deletion revoke at Bluesky first. A failed revoke
  is logged, and our copy is deleted anyway. When Bluesky stops honouring a session (refresh failed,
  revoked elsewhere), the connection becomes `needs_reauth`.
- **Known gap:** a sign-in abandoned after Bluesky's redirect, never completed in the app, leaves an
  unused session for that DID. Clean these up with the job runner (M2).
