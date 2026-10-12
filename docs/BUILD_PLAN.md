# Calm Guardian v2: Build Plan

> **For Claude:** this is the roadmap and background for the rebuild. Use it to answer "what's
> next?", to check my plan when I start a milestone, and as a source of "have you thought
> about…?" questions. **Don't dump the "v1 mistakes" list on me in one go.** Bring each item up
> when I reach the milestone it belongs to, or when my code repeats it. Tick-boxes show my progress.
> I tick them myself.

---

## 1. The product in one page

**Mission:** a temporary mental health episode should never define someone's permanent
professional reputation.

**Who it's for:** professionals with episodic conditions (bipolar disorder, anxiety, PTSD and
others), and anyone who has ever posted something they regretted.

**Core mechanic (Bluesky / AT Protocol):** Bluesky has no "hide post" feature, so:
1. **Back up** the post (full record plus media) to Supabase.
2. **Delete** it from Bluesky.
3. Later, **restore** it by re-creating it from the backup. Restored posts get a new
   timestamp, and the user is told this up front.

**Main user journey:**
Onboard → connect Bluesky (App Password) → (optional) add guardians → **activate Calm Mode**
(choose a window, e.g. the last 24h) → posts hidden, guardians emailed → any posts made during
Calm Mode are swept as well → **deactivate** → **Review** each archived post: *Make public
(restore)* / *Keep hidden* / *Delete for good*, or *Restore all*.

**Platform roadmap:** Bluesky first (free, open API). X, LinkedIn and Instagram are much later
and need paid or partner API access. Keep the platform integration behind an interface, so
adding another platform means writing a new adapter, not rewriting the core.

---

## 2. Decisions to make first (write an ADR for each)

Ask me to write these in `docs/decisions/` before or during M0. For each one, give me the
trade-offs and let me choose. v1's choice is shown so we can discuss why it might or might not
have been right.

| # | Decision | v1 did | Alternatives to weigh |
|---|----------|--------|-----------------------|
| 1 | Repo layout | Two repos (backend + Expo), types copied between them | Monorepo (npm/pnpm workspaces) with a shared `packages/shared` for types and zod schemas |
| 2 | App auth model | Backend signs its own 30-day JWT; Supabase used with the service-role key | Supabase Auth (makes RLS meaningful); short-lived access token + refresh token |
| 3 | Bluesky auth | App Password sent to backend; session stored as plain JSON in Postgres | AT Protocol OAuth; encrypt stored sessions (e.g. Supabase Vault / app-level encryption) |
| 4 | Where long work runs | Inside the HTTP request (activation with 100+ deletes and delays) | Background job + status/progress endpoint |
| 5 | How the sweep is triggered | Client `setInterval` every 30s, only while the Review screen is open | Server-side schedule (Supabase Cron / Railway cron); Bluesky Jetstream subscription |
| 6 | Client data fetching | `useState` + `useEffect` by hand | TanStack Query (caching, retries, loading/error states) |
| 7 | Testing strategy | Cypress E2E only, no unit tests | Vitest unit tests for the core, Hono `app.request()` route tests, RN Testing Library, Maestro or Cypress for E2E |
| 8 | Styling | `StyleSheet` + `Colors.ts` tokens | NativeWind (Tailwind for RN) |

---

## 3. Milestones

Each milestone ends with: typecheck clean, lint clean, tests passing, a PR I've self-reviewed,
and a short note on what I learned.

### M0: Foundations
- [ ] ADRs 1–3 written (others can wait until they matter)
- [ ] Repo(s) set up with TypeScript `strict`, ESLint + Prettier, pre-commit hook
- [ ] Vitest running with one real test; CI runs typecheck + lint + test on every PR
- [ ] Config module validates env vars at startup and fails fast if something is missing
- [ ] Supabase CLI local dev; schema managed as **migrations** (not pasted into the SQL editor); generated DB types
- [ ] `.env` gitignored, `.env.example` committed; branch protection on `main`; PR template with a self-review checklist

*You'll learn:* tooling, CI, migrations as code (think Terraform for your schema), fail-fast config.
*Ask yourself:* how will I know my local schema matches production?

### M1: Backend skeleton
- [ ] Hono app built in a factory, separate from the code that starts the server (so tests can call `app.request()` without opening a port)
- [ ] `/health`, a consistent JSON error shape, a central error handler, 404 handler, request logging
- [ ] A request-validation pattern (zod) used for every body and param
- [ ] Route tests for health, 404 and a validation failure

*Ask yourself:* what must never appear in logs? What does a client see when something throws unexpectedly?

### M2: Authentication
Backend
- [ ] Log in with handle + App Password → create the Bluesky session → **upsert the user by DID**
- [ ] Issue the app's own session/token; auth middleware attaches the user to the request context
- [ ] Bluesky session stored server-side and protected; refreshed tokens are saved back
- [ ] Logout actually invalidates something on the server
- [ ] Tests: missing / malformed / expired token rejected; logging in twice doesn't create two users

Frontend
- [ ] Expo app (Expo Router, tabs) scaffolded; login screen with an App Password explanation and a link to Bluesky settings
- [ ] Token stored in SecureStore (with a deliberate decision about web); auth gate / protected routes
- [ ] Session restored on launch with a loading state; friendly error messages

*Ask yourself:* why the DID and not the handle? What happens when the Bluesky refresh token
expires? Can I revoke a token I've issued? Why is AsyncStorage not OK for tokens on native?

### M3: Feed (read-only)
- [ ] Fetch the user's own posts **with pagination** (cursor), so it isn't capped at one page
- [ ] Map Bluesky's shape to my own DTO **in one place**, using type guards (no `any`)
- [ ] Separate posts from replies; leave out reposts
- [ ] Feed screen + `PostCard`: loading, empty, error, pull-to-refresh, infinite scroll

*Ask yourself:* `getAuthorFeed` or `com.atproto.repo.listRecords`, and why? What if there
are 3,000 posts in the window? Where does the "Bluesky → my model" mapping live?

### M4: Calm Mode activation ⭐ (the heart of the app)
Design before code. Ask me to sketch a `CalmMode` service that depends on **interfaces**
(e.g. a Bluesky gateway, an archive repository, a session repository, a clock), then write the
tests **with fakes before the implementation**:
- [ ] Every post in the window is backed up **before any** delete
- [ ] If the backup fails, nothing is deleted and the session ends up in a failed state
- [ ] Deletes are retried with exponential backoff on rate limits; failures are **reported**, never swallowed
- [ ] Activating while already active doesn't create a second session
- [ ] The result tells the user the truth: "X hidden, Y could not be hidden (still visible)"
- [ ] Backup keeps the **full record** (text, facets/links/mentions, embeds, langs, reply refs) and copies image blobs to Supabase Storage
- [ ] A session state machine I've designed (e.g. activating → active / failed → ending → ended)
- [ ] Frontend: confirmation dialog, progress or working state, double-tap prevented, honest summary

*Ask yourself:* what if the server crashes after deleting 40 of 100 posts? Does "backup
confirmed" just mean the insert didn't error? Should a multi-minute operation live inside one
HTTP request? Where does retry logic live so it doesn't tangle the business rules?

### M5: Status + deactivation
- [ ] `GET` status endpoint is the source of truth; the UI reads it on launch, and status survives an app restart
- [ ] A Calm Mode indicator is visible on every screen ("active since 3:45pm")
- [ ] Deactivate: the server finds the active session **itself**, runs a final sweep and ends the session; posts stay in the Archive for Review
- [ ] Tests: deactivating with no active session; deactivating twice

### M6: Sweep (posts made during Calm Mode)
- [ ] Posts made during an active session are backed up and then deleted, **without the app being open**
- [ ] Trigger chosen via ADR 5
- [ ] Reuses the M4 core. **No duplicated backup/delete logic.**

*Ask yourself:* how often should it run? What's my rate-limit budget
(see docs.bsky.app → Rate Limits)? What if the user deletes a post themselves between sweeps?

### M7: Review & restore
- [ ] Archive list (posts + replies), with *Restore*, *Keep hidden*, *Delete for good* (confirm; irreversible) and *Restore all*
- [ ] Idempotent: each post is marked restored **right after** its own create succeeds, so retrying never duplicates
- [ ] Restore in chronological order. A reply to my own archived post needs its parent restored first, with references **remapped** to the new URI/CID
- [ ] Images re-uploaded from Storage before the post is re-created
- [ ] Clear copy: "Restored posts will show today's date"
- [ ] **Spike:** what `createdAt` should a restored post have, and how does Bluesky treat back-dated posts?

*Ask yourself:* what if "Restore all" fails at post 37 of 80? What about a reply whose parent
(someone else's post) has since been deleted?

### M8: Guardians
- [ ] Guardian CRUD with validation; the maximum count is defined once and enforced **on the server**
- [ ] Settings: custom guardian message, notifications on/off
- [ ] The notification is sent **only when activation succeeds**
- [ ] Email escapes every user-supplied value, includes no posts and no reason, and has HTML and plain-text versions
- [ ] Decide: Supabase Edge Function + Resend (v1) or send from the backend

*Ask yourself:* could someone use my app to send emails to any address they like? What
happens if a guardian's name is `<img src=x onerror=alert(1)>`?

### M9: Onboarding & settings
- [ ] Onboarding: welcome → how it works → App Password guide → login → default window → guardians (skippable) → done
- [ ] Completion persisted; can be re-run from Settings
- [ ] Settings: default window (24h / 7d / 30d / all), notifications, guardian message, log out

*Ask yourself:* should "onboarding done" live on the device or on the server? What happens after a reinstall?

### M10: Quality, safety & polish
- [ ] Error boundary, offline handling, logs with no personal data
- [ ] Accessibility: labels, contrast, font scaling, screen reader pass; dark mode
- [ ] E2E for the critical path: login → activate → review → restore
- [ ] Crisis resources / SOS that actually does something (region-aware); privacy policy; "not a medical device" disclaimer

### Stretch
Timed auto-exit · push notifications · AI risk alerts (v1 sketched an `ai_alerts` table) ·
second platform via the adapter interface · typed API client (Hono RPC) · EAS builds / TestFlight.

---

## 4. v1 reference

v1 code lives in `~/dev/calm-guardian` (backend) and `~/dev/calm-guardian-fe` (Expo app).
**Read it for reference. Don't copy the logic.** Rewrite it, then compare.

**Stack:** Expo SDK 54 / RN 0.81 / React 19 / Expo Router 6 / Zustand 5 / expo-secure-store
(AsyncStorage on web) · Node 20 + Hono 4 + `@atproto/api` (`BskyAgent`, which newer versions mark
deprecated in favour of `AtpAgent`, so check) · Supabase (Postgres, Storage, Edge Functions) ·
Resend for email · Railway for hosting · Cypress E2E on the web build with page objects and
`data-testid` selectors · GitHub Actions.

**v1 API:** `POST /auth/login` · `GET /posts/feed` · `GET /posts/comments` ·
`GET /posts/archived` · `POST /posts/restore/:uri` · `POST /posts/restore-all` ·
`DELETE /posts/:uri` · `GET|POST /guardian/contacts` · `DELETE /guardian/contacts/:id` ·
`POST /guardian/activate` · `POST /guardian/deactivate` · `POST /guardian/sweep`
(Good exercise: design cleaner, resource-oriented routes for v2.)

**v1 data (conceptual):** user profile (DID, handle, stored Bluesky session, status) ·
archived post (URI, CID, text, reply refs, backed-up / restored timestamps) · calm session
(activated / deactivated timestamps, count) · settings (notifications, guardian message,
auto-restore) · guardian contact (name, email, phone) · AI alert (risk level, reason). Treat
this as a starting point to critique, not a spec.

**v1 screens:** Onboarding (6 steps) · Login · tabs: Home (big Calm Mode button, window
picker, status, emergency help, breathing, log out) · Feed (posts / comments) · Review
(archive actions + restore all) · Guardian (support circle, add modal) · Privacy
(placeholder per-platform toggles in local state only; YAGNI for v2?).

**Worth reusing as-is (not logic):** design tokens in `calm-guardian-fe/constants/Colors.ts`
(Material 3 teal palette from Stitch), `assets/`, the Stitch designs
(https://stitch.withgoogle.com/projects/12954805997176746027), onboarding and email copy,
and the Cypress page-object / `data-testid` conventions.

---

## 5. v1 mistakes not to repeat

> **For Claude:** use these one at a time, at the right milestone, as questions first.

**Data safety** (🔴)
- The sweep/deactivate path never checked the backup insert's error and **deleted posts anyway**. That's possible permanent data loss.
- Failed deletes were ignored, but the count reported every post as hidden, so the user believed posts were hidden when they weren't.
- "Restore all" marked posts restored only after the whole loop finished. A failure halfway meant duplicates on retry.
- Only `text` was backed up. Images, links, mentions and embeds were lost on restore.
- Only one page (100 posts) was fetched. Anything beyond that wasn't protected.

**Correctness / design**
- Calm Mode state lived only in client memory, and deactivate needed the client to send `calmSessionId`. After an app restart, the user **couldn't deactivate**.
- The guardian email fired on the session row INSERT, which happened *before* the backup. A failed activation still emailed guardians.
- The sweep ran via `setInterval` on one screen, so it only worked while the app was open on that screen.
- Activation did all its work inside one long HTTP request.
- Business logic lived in route handlers. The backup mapping was duplicated in two places, and there were no unit tests on the most critical code.

**Security**
- RLS policies used `auth.uid()`, but the backend used the service-role key (which bypasses RLS) and custom JWTs. The policies never actually applied.
- Bluesky access/refresh tokens were stored as plain JSON in Postgres.
- 30-day JWT with no refresh or revocation; `process.env.X!` instead of validated config.
- Guardian email HTML interpolated user-supplied name, handle and message without escaping.
- No request validation; `c.req.json()` was destructured directly.

**Clean code**
- Mixed vocabulary: "Sanctuary Mode", "Calm Mode", "Guardian Mode", and `guardian_status: 'active' | 'paused'`, where "active" meant Calm Mode was *off*.
- Schema file drifted from the real database (columns used in code were missing from the SQL; `trusted_contact_*` columns were superseded but never removed).
- `as any` on every Bluesky record; types duplicated across repos with different nullability.
- Magic numbers (300ms, 100, 50, 5, 24, 30 000) scattered around, and the guardian limit defined in both frontend and backend.
- Errors swallowed with `.catch(() => {})`; screen files of 400–630 lines; `Review.tsx` capitalised while every other route is lowercase.
