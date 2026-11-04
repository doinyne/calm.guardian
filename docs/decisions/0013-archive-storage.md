# 0013: How the Archive stores posts, and what disconnecting does to them

**Status:** Accepted · **Date:** 2026-11-04

## Context
Calm Mode deletes posts from Bluesky after backing them up. While a post is hidden, **our Archive
holds the only copy**. Two questions follow:

1. Posts written during an episode can be very personal. How do we protect their content at rest?
2. What happens when someone disconnects a connected account that still has hidden posts? Disconnecting
   deletes the connection (product rule 8), and the Archive is linked to it, so the hidden posts would
   be deleted too.

## Options
**Content at rest**
1. Plain JSON in Postgres, relying on Supabase's disk encryption.
2. **Encrypt each post's record in the API**, as we already do for OAuth tokens (AES-256-GCM,
   `SecretBox`).

**Disconnecting with hidden posts**
1. Delete them with the connection.
2. Keep them, unlinked, until the same Bluesky account is reconnected.
3. **Refuse the disconnect** until the user has restored those posts or deleted them for good.

## Decision
**Encrypt content (option 2) and refuse the disconnect (option 3).** Dean chose both on 2026-11-04.

- **Encryption:** the whole post record is sealed with `SecretBox`, bound to
  `archived_posts:<connected account>:<post URI>`, so a value copied onto another row won't open. A
  database dump, a leaked backup or a look in Studio shows no post content. The URI, content hash and
  posting time stay readable, because Calm Mode and Restore need them to work.
- **Disconnecting:** the API counts the connected account's hidden posts **before** revoking anything
  and answers `409 connection_has_hidden_posts` ("This account has 3 hidden posts. Restore them, or
  delete them for good, before disconnecting it."). The connection keeps working.
  - **Safety net:** a `BEFORE DELETE` trigger on `connected_accounts` refuses the delete too, so no code
    path can lose hidden posts.
  - **Deleting the whole Account still deletes everything** (product rule 8). That delete reaches
    `connected_accounts` through the cascade from `auth.users`, one trigger level deeper
    (`pg_trigger_depth() > 1`), and the trigger lets it through. Integration tests cover both paths.
  - Backups of posts that are still visible (a delete that failed) go with the connection: the post is
    still on Bluesky, so nothing is lost.

## Consequences
- **We can't search post text in SQL.** Nothing needs to: Review decrypts in the API.
- **Key rotation now covers the Archive too.** The `TOKEN_ENCRYPTION_KEYS` keyring already supports
  rotation. Losing the key loses every hidden post, so in production it lives in Secret Manager with
  a backup procedure (M0b).
- **Images aren't covered yet.** They'll be copied to Supabase Storage in the Bluesky adapter slice,
  and need the same decision (encrypt before upload, or rely on Storage's encryption).
- **The app has to explain the refusal.** Disconnect should show the count and lead the user to Review
  (M5).
- **Other data in this slice:** at most one open Calm session per connected account, enforced by a
  partial unique index, so activating twice, even at the same moment, can't open two (product rule 2).
