# 0016: Restore puts a post back exactly as it was

**Status:** Accepted (Dean, 2026-11-04) · **Date:** 2026-11-04

## Context
Calm Mode hides a post by deleting it from Bluesky after backing up its whole record and files
(ADR-0013, ADR-0014). Restore has to bring it back. The build plan assumed a new post dated today, as
v1 did. That loses likes and replies, needs replies to the user's own restored posts remapped to new
addresses, and needs careful bookkeeping to avoid duplicates.

On Bluesky, a post's address is `at://<account>/app.bsky.feed.post/<record key>`. The account can
create a record with a chosen record key. Re-creating the identical record at the identical key gives
back the same address, and, because the content is identical, the same content hash (CID).

## Options
1. **A new post dated today**, at a new address.
2. **The same record at the same address**, with its original date.

## Decision
**Option 2.**
- **Files go first:** each backed-up file is uploaded again (its CID is unchanged, so the record's
  references still match), then the record is created with `createRecord({ rkey })`.
- **Everything reconnects:** likes, replies, quotes and threads all point at the post's address and
  hash, so they reconnect on their own. Nothing needs remapping.
- **Retry-safe** (product rule 2):
  - Before creating, we check whether the record is already there.
  - The post is recorded as restored straight after it's re-created.
  - A retry after a half-finished attempt finds it and just records it.
  - Restoring twice can never make two posts.
- **Restore all** runs as a background job (ADR-0015), **oldest first**, and skips posts the user
  chose to keep hidden. Creating costs 3 of Bluesky's write points (deleting costs 1), so a large
  restore takes about three times as long as hiding did.
- **Not while Calm Mode is on** for that account, because it would just hide the post again.
- **Our copy stays after a restore** until the user deletes it, so a problem with Bluesky's copy can
  still be put right.

## Consequences
- **The original date is kept.** Bluesky may show old-dated posts with an "archived" note, because
  they were indexed long after their stated date. The copy says posts come back as they were.
- **Review states:** to review, kept hidden, or restored. "Review is clear" (no posts still to review)
  is what ADR-0011 needs before a Guardian can turn Calm Mode on again.
- **Disconnecting:** only posts still hidden block a disconnect (the trigger now ignores restored
  ones).
- **Not yet verified against Bluesky:** that it accepts re-creating a post at a deleted post's record
  key. Restore relies on this, so check it on a test post before anyone uses Restore for real.
