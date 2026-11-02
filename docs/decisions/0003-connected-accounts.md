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
