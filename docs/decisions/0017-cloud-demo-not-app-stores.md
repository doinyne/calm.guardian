# 0017: A cloud demo on Expo Go, not the app stores

**Status:** Accepted (Dean, 2026-11-12) · **Date:** 2026-11-12

## Context
Calm Guardian no longer needs to be released on the App Store or Google Play. Dean wants it hosted in
the cloud so he can run it on his iPhone and show colleagues at work, and so colleagues can sign in
and try it with their own (test) Bluesky accounts. He doesn't have a paid Apple Developer account.

## Decision
- **The app runs in Expo Go** (free, from the App Store). Everything it uses is part of Expo Go for
  SDK 58, so no native build or Apple account is needed. The JavaScript is published with **EAS
  Update**, so Expo Go opens it from a link or QR code, on any iPhone, with no Mac running. The
  `preview` variant uses the SDK runtime version that Expo Go requires.
- **The API runs on Cloud Run** in `europe-west2`, from `infra/` (Terraform). Its secrets live in
  Secret Manager, added with gcloud so they never reach Terraform state. **Supabase is a hosted
  project** in London (database and sign-in).
- **Bluesky:** a deployed API is its own **public OAuth client**. It publishes its client details at
  `https://<run.app address>/oauth/client-metadata.json`, so no domain purchase is needed. Locally
  it stays Bluesky's development client.
- **Coming back from Bluesky:** the app tells the API its own return link (`exp://`/`exps://` in Expo
  Go). The API accepts only app links from an allow-list, never web addresses.
- **Email** (sign-in codes from Supabase, Guardian emails from the API) goes through **Gmail's SMTP
  with an app password**. Free, and plenty for a demo.
- **Background work stays inside the API** for now: one Cloud Run instance, always on, so hiding,
  the Sweep and Guardian emails keep running (roughly £35–45 a month). Moving to Cloud Tasks
  (ADR-0015) would let it scale to zero and cost almost nothing; that's the next step if the cost
  matters.

## What we park
App Store and Google Play work: store listings, privacy labels, the data safety form, Apple and
Google sign-in, the Play closed test, a permanent bundle ID, EAS Submit. `docs/release/store-readiness.md`
stays for reference, but nothing waits on it.

## What we keep, because colleagues' real accounts and posts are involved
Every product rule still applies: backups before deletes, encryption at rest, tokens never logged,
Guardians never seeing posts, deleting an Account deleting everything. The app asks people to connect
a test Bluesky account. A short privacy note and a way to delete everything (already in Settings)
matter more, not less, when the users are people you work with.

## Consequences
- Expo Go only runs JavaScript, so any future native module must be one Expo Go includes, or the
  demo moves to a development build (which needs a paid Apple account for iPhones).
- Public Bluesky clients have sessions of about two weeks; after that the app asks the user to sign
  in to Bluesky again.
- Gmail limits sending (about 500 emails a day) and shows Dean's address as the sender.
