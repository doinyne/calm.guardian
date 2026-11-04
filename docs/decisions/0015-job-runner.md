# 0015: Background jobs with Cloud Tasks, behind a queue port

**Status:** Proposed · **Date:** 2026-11-04

## Context
Calm Mode can't run inside one HTTP request (v1 did, and it was one of its bugs):

- **It can take hours.** Bluesky limits each account to **5,000 write points an hour and 35,000 a
  day**. A delete costs 1 point and a create costs 3 ([Bluesky rate limits](https://docs.bsky.app/docs/advanced-guides/rate-limits)).
  Hiding everything on a busy account, or restoring it (about 1,666 posts an hour at most), can't
  finish in one go.
- **The Sweep has to run on a schedule**, whether or not the app is open.
- **Cloud Run scales to zero** and throttles CPU once a response is sent, so "carry on after
  replying" isn't reliable (ADR-0004).
- **Retries and backoff must stay out of business logic.** The Calm Mode core is already safe to
  re-run: its state lives in the database, and an interrupted activation resumes where it stopped.

Jobs we know of: **activate** (back up, then hide), **Sweep** (posts made during an active Calm
session), **Restore**, and later Guardian emails (M6).

## Options
1. **Cloud Tasks + Cloud Scheduler.** Tasks push an HTTP request to our API with retry, backoff and
   rate limiting set per queue. Scheduler triggers the Sweep. Scales to zero, nothing to run, and
   ADR-0004 already planned for it. An HTTP task can take up to 30 minutes
   ([Cloud Tasks `dispatchDeadline`](https://cloud.google.com/tasks/docs/reference/rest/v2beta3/projects.locations.queues.tasks)).
   Locally there's no Cloud Tasks, so dev and tests need a stand-in.
2. **A Postgres queue (pg-boss or similar).** One less service, and it works the same locally. But it
   needs a worker that's always running: a Cloud Run instance kept warm with CPU always on (a monthly
   cost even when nobody uses the app), or a separate worker service. pg-boss also wants a direct
   database connection, not Supabase's transaction pooler (ADR-0012).
3. **Cloud Run Jobs.** Good for batch work, but each run starts a container, so there are tens of
   seconds before anything happens. It's heavy for "this user just tapped Calm".
4. **Supabase Edge Functions or cron.** A second runtime (Deno) with wall-clock limits, which ADR-0004
   already turned down.

## Decision (proposed)
**Option 1: Cloud Tasks for jobs, Cloud Scheduler for the Sweep, behind a `JobQueue` port.**

**1. A port, so business logic never sees Cloud Tasks.** `jobQueue.enqueue({ job, payload, runAt? })`
with named, typed jobs (`activate-calm-mode`, `sweep`, `restore`), validated with zod when they arrive.
- **Production:** a Cloud Tasks adapter. Each job is an HTTP `POST /internal/jobs/:job` to the API.
- **Local dev:** an in-process adapter that runs the job straight after the response, with the same
  handler code. No emulator to install.
- **Tests:** call the handlers directly, or use a fake queue that records what was enqueued.

**2. Every job is safe to run twice** (product rule 2). Cloud Tasks delivers at least once, so a job
can arrive again. Handlers already build on that: the Calm session state, the Archive keys and
"delete a deleted post = done" make a repeat harmless.

**3. One worker per connected account at a time.** Each Calm session gets a **lease** column: a
handler claims it with `update … where lease_until < now()`, and gives it up when done. A crashed
worker's lease simply expires. (An advisory lock won't do: it would have to stay open for minutes
through the transaction pooler.)

**4. Long jobs run in slices.** A handler works for a time budget (about 8 minutes, inside a
10-minute deadline). If it isn't finished, it **enqueues its own continuation**. Because the core
resumes from the database, a slice is just "carry on".

**5. When Bluesky says "slow down", we wait instead of hammering.** A 429 response carries
`ratelimit-reset`. The handler enqueues the continuation for that time and answers 200, so Cloud Tasks
doesn't count it as a failure. Queue-level retries (exponential backoff, capped attempts) handle real
errors: network failures, 5xx and crashes.

**6. Only Cloud Tasks and Scheduler can call `/internal/*`.** Each task carries a Google OIDC token
for a dedicated service account. The API checks its issuer, audience and service account email, and
refuses everything else. Locally, the in-process adapter doesn't use HTTP at all.

**7. The Sweep:** Cloud Scheduler calls `POST /internal/sweep` every few minutes (interval kept in
config). It enqueues one `sweep` job for each active Calm session.

**8. Failures are never swallowed.** A job that runs out of retries leaves its Calm session in a
state the app can show honestly ("We couldn't finish hiding 12 posts; they're still visible"). It's
logged with IDs only, never content.

## Consequences
- **Activation is asynchronous.** `POST` to activate creates the Calm session, enqueues the job and
  answers at once. The app shows progress from the session's state (M3: the "progress UI" item).
- **Core change:** the Calm Mode core gains a time budget, and reports "in progress" so the caller can
  continue it. Rate-limit errors become a typed result from the Bluesky adapter.
- **Infra (M0b, needs Dean's OK to apply):**
  - Terraform: Cloud Tasks queues, a Scheduler job, an invoker service account, and IAM
    (`roles/run.invoker` on the API, `roles/cloudtasks.enqueuer` for the API's own service account).
  - All in `europe-west2`.
- **Cost:** expected to stay in the free tiers at our scale (Cloud Tasks' first million operations a
  month; Cloud Scheduler's free jobs per billing account). Check when setting up billing alerts.
- **Data processors:** Google already processes our data (Cloud Run); task payloads carry IDs only,
  never post content.
- **The local adapter isn't Cloud Tasks.** Deadlines, OIDC and real retries are only exercised in
  staging, so staging gets a smoke test of a full activation before production.

## Open questions
- **The Sweep interval.** More often hides new posts sooner, but costs more requests. Proposal: every
  5 minutes.
- **What to tell the user** when a big activation will take hours because of Bluesky's limits
  ("Hiding 8,000 posts. This will take about 2 hours. You can close the app.").
