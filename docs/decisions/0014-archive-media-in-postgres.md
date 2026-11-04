# 0014: Archived images and files live in Postgres, encrypted

**Status:** Accepted · **Date:** 2026-11-04

## Context
A post can carry images, a video with captions, or a link preview. Restore must put them back, so
Calm Mode copies every file before deleting the post (product rule 1). The files are encrypted like
everything else in the Archive (ADR-0013). The build plan assumed Supabase Storage.

## Options
1. **Supabase Storage**, one encrypted object per file. Cheap per GB and built for files, but it sits
   outside the database: an object isn't deleted when its post, connection or Account is, so every
   deletion path needs its own clean-up, and a failure halfway leaves files behind. Storing a post and
   its files isn't atomic either.
2. **Postgres**, an `archived_media` row per file with the encrypted bytes. It's stored in the same
   transaction as its post, and deleted by the same cascade. Database storage costs more per GB, and
   very large files are awkward.

## Decision
**Option 2, for now.**
- A post and all its files are saved in **one transaction**: the backup is whole or it isn't there.
- **Deletion is automatic.** Deleting a post, disconnecting an account (when allowed) or deleting the
  Account removes every file with it. Nothing can be orphaned, which keeps product rule 8 simple.
- Each file is sealed with `SecretBox.sealBytes` (AES-256-GCM, binary, no text-encoding overhead),
  bound to `archived_media:<connected account>:<post URI>:<file CID>`.

## Consequences
- **Revisit before launch if volume grows, and for videos.** Bluesky allows videos of tens of
  megabytes. Today the API holds a whole file in memory to encrypt it, and Cloud Run instances have
  limited memory. If that or the database size becomes a problem, move to Storage with streaming
  encryption, plus a clean-up job.
- **Files are fetched one at a time** while backing up, so a post's files never fill a page's worth of
  memory.
- **We trust the bytes Bluesky returns for a CID** without re-hashing them. Checking the hash before
  storing is a cheap follow-up that would catch a corrupted download.

## Bluesky adapter notes
- Listing uses `com.atproto.repo.listRecords` on `app.bsky.feed.post` (posts and replies), 100 a
  page, newest first. It stops once a whole page is older than the period. It compares the time the
  app gave each post, so one backdated post can't end the search early.
- Records that aren't this account's posts are skipped and counted in the log, without their content.
- A post is deleted only if its URI is a post in **this** account's own repository.
- Files are found by searching the whole record for blobs, so new kinds of attachment are covered
  without code changes.
- `@atproto/api` returns files as objects. `lexToJson` (`@atproto/lexicon`) turns records back into
  the plain JSON Bluesky stores, which is what Restore must send back.
