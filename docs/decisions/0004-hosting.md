# 0004: API on Cloud Run (europe-west2), Supabase in London, managed with Terraform

**Status:** Proposed · **Date:** 2026-11-02

## Context
The API needs HTTPS hosting, secrets, and later a way to run background jobs (activation, Sweep,
Restore). Users are mainly in the UK, and the data is sensitive and mental-health-adjacent, so it
should stay in the UK under UK GDPR. It's a free app run by one person, so idle cost and operational
load both matter. Dean already knows GCP and Terraform well.

## Options
1. **Railway** (as v1). Very easy, but less control over region, IAM and secrets, and we'd have to
   build our own job scheduling.
2. **Supabase Edge Functions only.** One vendor, but it's a Deno runtime with wall-clock limits, which
   is risky for long Platform operations and for the Node-first atproto OAuth client.
3. **GCP Cloud Run + Terraform.** Scales to zero, gives us Secret Manager and IAM, and Cloud Tasks
   and Cloud Scheduler are available for jobs with built-in retry and rate limiting. It's also
   Dean's existing strength.

## Decision
- The API runs on **Cloud Run in `europe-west2` (London)** as a container built from
  `apps/api/Dockerfile`.
- **Supabase** (Postgres, Auth and Storage) runs in its London region.
- There are two environments, **staging** and **production**, with separate Supabase projects and
  separate Cloud Run services.
- Infrastructure lives in `infra/` as Terraform with remote state in GCS.
- GitHub Actions deploys through **Workload Identity Federation**, so there are no JSON service-account keys.
- Secrets live in **Secret Manager** and are mounted as env vars. They're validated at startup by
  `apps/api/src/config.ts`.

## Consequences
- Low idle cost. Supabase production should be on the Pro plan (free projects pause when idle and
  have no point-in-time recovery).
- The background job design (ADR in M2) can use Cloud Tasks for per-Account work queues and
  Cloud Scheduler for Sweep, which keeps retry and backoff out of business logic.
- Cloud Run instances are ephemeral. Nothing important may live in memory between requests.
- Data processors (Google, Supabase) must be listed in the privacy policy.
