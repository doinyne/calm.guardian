# Calm Guardian: Build Plan

> The product, the roadmap to the App Store and Google Play, and the lessons from v1.
> Dean owns the scope and ticks the boxes. Decisions live in `docs/decisions/`; store
> requirements live in `docs/release/store-readiness.md`.

---

## 1. The product in one page

**Mission:** a temporary mental health episode should never define someone's permanent
professional reputation.

**Who it's for:** professionals with episodic conditions (bipolar disorder, anxiety, PTSD and
others), and anyone who has ever posted something they regretted.

**Core mechanic (Bluesky / AT Protocol):** Bluesky has no "hide post" feature, so:
1. **Back up** the post (full record plus media).
2. **Delete** it from Bluesky.
3. Later, **restore** it by re-creating it from the backup. Restored posts get a new
   timestamp, and the user is told this up front.

**Main user journey:**
Sign up (Apple / Google / email code) → **connect accounts** (as many as you like) → (optional)
invite Guardians and choose which accounts they may protect → **activate Calm Mode** for one account
or all of them, or a Guardian does it for the allowed ones (preview what will be hidden, choose a
window) → posts hidden, Guardians emailed → posts made during Calm Mode are swept too → **deactivate** → **Review** each archived
post: *Restore* / *Keep hidden* / *Delete for good*, or *Restore all*.

**Accounts and Platforms:** users have a Calm Guardian **Account**. Social networks are
**Connected accounts** behind a Platform adapter. Bluesky is the only Platform at launch.

**Platform roadmap (be honest):** Instagram, LinkedIn and Facebook are wanted, but their APIs are
very different from Bluesky's. Meta's APIs mainly cover Business/Creator accounts and Pages, and
none of these Platforms clearly allow an app to hide or delete a *personal* account's posts.
**Each Platform gets a spike before we promise it to users.** The adapter is designed around
**capabilities** (`canBackup`, `canHide`, `canDelete`, `canRestore`) rather than assuming every
Platform works like Bluesky.

**Distribution:** free, published from personal Apple and Google developer accounts, positioned as
a social media privacy tool (Social Networking / Utilities), not a medical app.

---

## 2. Decisions

| ADR | Decision | Status |
|---|---|---|
| [0001](decisions/0001-monorepo.md) | npm workspaces monorepo | Proposed |
| [0002](decisions/0002-app-accounts.md) | Supabase Auth for Accounts; the app talks only to our API | Accepted |
| [0003](decisions/0003-connected-accounts.md) | Platform adapters; Bluesky via AT Protocol OAuth on the server | Proposed |
| [0004](decisions/0004-hosting.md) | Cloud Run (europe-west2) + Supabase (London), via Terraform | Proposed |
| [0005](decisions/0005-mobile-stack.md) | Expo SDK 58, dev builds, EAS, iPhone + Android phones only | Proposed |
| [0006](decisions/0006-testing.md) | Vitest, jest-expo + RNTL, Maestro | Proposed |
| [0007](decisions/0007-styling.md) | Uniwind + React Native Reusables + Reanimated; mission control look, dark only | Accepted |
| [0008](decisions/0008-store-positioning.md) | Personal accounts, free, not a medical app | Proposed |
| [0009](decisions/0009-typescript-6.md) | Pin TypeScript 6.0 and ESLint 9 until the toolchain catches up | Proposed |
| [0010](decisions/0010-website.md) | Public website in `apps/web`: Next.js, KokonutUI, Motion | Proposed |
| [0011](decisions/0011-guardian-calm-mode.md) | Calm Mode per connected account; Guardians may turn it on for accounts the user allows | Accepted |
| [0012](decisions/0012-database-access.md) | Kysely + `pg`; schema in Supabase SQL migrations | Accepted |

**Deferred until the milestone that needs them:** job execution (Cloud Tasks + Scheduler vs
pg-boss), DB access library (Kysely vs Drizzle vs supabase-js), email provider (Resend),
crash reporting (Sentry), analytics (none at launch?).

---

## 3. Milestones

Every milestone ends with typecheck, lint and tests green, the store-readiness doc updated, and a
self-reviewed PR.

### M0a: Foundations (no store accounts needed)
- [ ] New working agreement (`CLAUDE.md`), roadmap, ADRs, release docs
- [ ] Monorepo: `apps/api`, `apps/mobile`, `packages/shared`, `supabase/`
- [ ] TypeScript strict everywhere, ESLint + Prettier, pre-commit hook
- [ ] API: validated config, request IDs, redacted structured logs, one error shape, `/health` + `/ready`, Dockerfile
- [ ] Mobile: Expo SDK 58 + Expo Router, Uniwind + React Native Reusables theme (light + dark), build variants, `eas.json`, typed API client, API status screen
- [ ] Website: `apps/web` (Next.js + KokonutUI + Motion) with landing, privacy, terms, support and account deletion placeholders
- [ ] Tests: Vitest (API, shared), jest-expo (mobile), Maestro smoke flow
- [ ] CI: typecheck + lint + test on every PR

### M0b: Release pipeline (needs Dean's accounts; see `docs/release/accounts-setup.md`)
- [x] Store name decided: **Calm Guardian**
- [ ] Domain and bundle ID decided
- [ ] Apple Developer, Play Console, Expo, Supabase (staging + prod), GCP
- [ ] `infra/` Terraform: state bucket, Artifact Registry, Cloud Run, Secret Manager, WIF for GitHub
- [ ] API auto-deploys to Cloud Run staging from `main`
- [ ] Preview build installed on our own devices via EAS internal distribution (staging API)
- [ ] Production build installed via **TestFlight (internal)** and the **Play internal testing** track
  (the first AAB is uploaded by hand)

### M1: Accounts and connections
- [x] Supabase Auth: email one-time code; session stored securely on device
- [ ] Supabase Auth: Sign in with Apple and Google
- [x] Auth gate, session restore on launch, sign out
- [x] API verifies Supabase JWTs (JWKS); tests for missing / expired / forged tokens
- [x] `connected_accounts` + encrypted OAuth session store (migrations), `GET /connections`
- [x] Bluesky connect via AT Protocol OAuth (development client), bound to the Account that started it; disconnect; `needs_reauth` when Bluesky stops honouring a session
- [ ] Switch to the confidential client on our domain (needs the domain, M0b)
- [x] Connecting the same DID twice upserts; one DID ↔ one Account
- [x] **In-app account deletion**: deletes the auth user and everything that cascades from it; idempotent
- [x] Account deletion revokes Bluesky tokens first
- [ ] Account deletion also revokes Apple tokens and warns about archived posts; web deletion page on the domain
- [ ] Universal Links / App Links files served from the domain

### M2: Archive core ⭐ (TDD, fakes first)
- [x] `CalmMode` service depending on interfaces (Platform adapter, archive repo, session repo, clock), per connected account plus "turn on for all" (ADR-0011)
- [x] Every post in the period is backed up **before any** delete; backup failure → nothing deleted, session failed (core, with fakes)
- [ ] Full record kept (text, facets, embeds, langs, reply refs); image blobs copied to Storage
- [ ] Session state machine (e.g. activating → active / failed → ending → ended)
- [x] Period: presets (24 hours, 7 days, 30 days, everything) or a custom from–to (`packages/shared`; the picker lands in M3)
- [ ] Database tables and repositories for Calm sessions and the Archive
- [ ] Job runner (ADR), rate-limit-aware retries with backoff, failures reported, never swallowed
- [x] Honest result: "X hidden, Y could not be hidden (still visible)" (core)

### M3: Calm Mode
- [ ] Calm Mode **per connected account**, plus "turn on / off for all"; each Calm session records who started it
- [ ] Activate (with a "preview what will be hidden" step, replacing v1's Feed tab), status, deactivate
- [ ] Honest per-account results: an account that needs signing in again is reported as not protected
- [ ] Progress UI, double-tap prevented, Calm Mode indicator on every screen
- [ ] Status survives an app restart; deactivate finds the active session server-side

### M4: Sweep
- [ ] Server-side schedule backs up and hides posts made during an active session, app closed or not
- [ ] Reuses the M2 core. **No duplicated backup/delete logic.**

### M5: Review and Restore
- [ ] Archive list with *Restore*, *Keep hidden*, *Delete for good* (confirm) and *Restore all*
- [ ] Idempotent: each post marked restored **right after** its own create succeeds
- [ ] Chronological restore; replies to own archived posts remapped to new URI/CID
- [ ] Images re-uploaded; copy: "Restored posts will show today's date"

### M6: Guardians
- [ ] Invite flow: the guardian **accepts by email** before they're notified (anti-abuse, GDPR consent)
- [ ] The user adds and removes Guardians at any time; a Guardian can step down
- [ ] Guardians sign in with their own Account (ADR-0011) and see only the accounts they may protect
- [ ] Per connected account, "Guardians can turn this on" (**off by default**)
- [ ] A Guardian can only turn Calm Mode **on**, for allowed accounts; the user is told at once and can always turn it off
- [ ] A Guardian can turn Calm Mode on for an account only when none of its posts are waiting in Review
- [ ] Turning off a Guardian-started session offers "Change what <Guardian> can do?"
- [ ] Tests: Guardian without permission, removed Guardian, Guardian with posts waiting in Review, and Guardian turning it off or reading the Archive are all refused
- [ ] Max guardians defined once in `packages/shared`, enforced on the server
- [ ] Notification sent **only after activation succeeds**; escaped HTML + plain text; no posts, no reason
- [ ] Guardian can opt out from any email

### M7: Safety, compliance and polish
- [ ] Onboarding and settings; region-aware crisis resources; "not a medical device" disclaimer
- [ ] Privacy policy and terms (legally reviewed), linked in the app and on the website
- [ ] Accessibility pass (labels, contrast, font scaling, screen reader), dark mode QA
- [ ] Crash reporting with PII scrubbing; error boundary; offline handling
- [ ] UK GDPR DPIA; check whether the ICO data protection fee applies

### M8: Beta
- [ ] TestFlight external testing (Beta App Review)
- [ ] **Google Play closed test: at least 12 testers opted in for 14 continuous days** (required for new
  personal accounts before production access). Recruit testers during M5–M7.
- [ ] Maestro E2E for the critical path: sign in → connect → activate → review → restore

### M9: Store submission and launch
- [ ] Listings, screenshots, support URL
- [ ] Apple privacy label; Google data safety form; Google health apps declaration
- [ ] Age ratings (Apple questionnaire, IARC); adult target audience
- [ ] Review notes with a demo Account and a **dedicated, seeded test Bluesky account**
  (the reviewer will activate Calm Mode, which deletes posts)

### Not in the MVP
Feed tab · push notifications · AI risk alerts · other Platforms · timed auto-exit · web app ·
iPad layout.

---

## 4. v1 reference

v1 code lives in `~/dev/calm-guardian` (backend) and `~/dev/calm-guardian-fe` (Expo app). Use it
for reference only; the logic has known data-safety bugs (section 5).

**Worth reusing:** design tokens in `calm-guardian-fe/constants/Colors.ts` (Material 3 teal
palette from Stitch), `assets/`, the Stitch designs
(https://stitch.withgoogle.com/projects/12954805997176746027), and onboarding and email copy.

**v1 API:** `POST /auth/login` · `GET /posts/feed` · `GET /posts/comments` ·
`GET /posts/archived` · `POST /posts/restore/:uri` · `POST /posts/restore-all` ·
`DELETE /posts/:uri` · `GET|POST /guardian/contacts` · `DELETE /guardian/contacts/:id` ·
`POST /guardian/activate` · `POST /guardian/deactivate` · `POST /guardian/sweep`.
v2 uses resource-oriented routes instead.

**v1 data (conceptual):** user profile (DID, handle, stored Bluesky session, status) ·
archived post (URI, CID, text, reply refs, backed-up / restored timestamps) · calm session
(activated / deactivated timestamps, count) · settings (notifications, guardian message,
auto-restore) · guardian contact (name, email, phone) · AI alert (risk level, reason).

**v1 screens:** Onboarding (6 steps) · Login · tabs: Home (big Calm Mode button, window
picker, status, emergency help, breathing, log out) · Feed · Review · Guardian · Privacy.

---

## 5. v1 mistakes not to repeat (standing checklist)

**Data safety** (🔴)
- The sweep/deactivate path never checked the backup insert's error and **deleted posts anyway**.
- Failed deletes were ignored, but the count reported every post as hidden.
- "Restore all" marked posts restored only after the whole loop finished, so a failure halfway
  meant duplicates on retry.
- Only `text` was backed up. Images, links, mentions and embeds were lost on restore.
- Only one page (100 posts) was fetched. Anything beyond that wasn't protected.

**Correctness and design**
- Calm Mode state lived only in client memory, and deactivate needed the client to send
  `calmSessionId`. After an app restart, the user couldn't deactivate.
- The guardian email fired on the session INSERT, *before* the backup. A failed activation still
  emailed guardians.
- The sweep ran via `setInterval` on one screen, so it only worked while that screen was open.
- Activation did all its work inside one long HTTP request.
- Business logic lived in route handlers; the backup mapping was duplicated; no unit tests on the
  critical code.

**Security**
- RLS policies used `auth.uid()`, but the backend used the service-role key and custom JWTs, so
  the policies never applied.
- Bluesky access and refresh tokens were stored as plain JSON in Postgres.
- 30-day JWT with no refresh or revocation; `process.env.X!` instead of validated config.
- Guardian email HTML interpolated user-supplied values without escaping.
- No request validation; `c.req.json()` was destructured directly.

**Clean code**
- Mixed vocabulary ("Sanctuary Mode", "Calm Mode", "Guardian Mode", `guardian_status`).
- The schema file drifted from the real database.
- `as any` on every Bluesky record; types duplicated across repos with different nullability.
- Magic numbers scattered around; the guardian limit defined in both frontend and backend.
- Errors swallowed with `.catch(() => {})`; 400–630 line screen files.
