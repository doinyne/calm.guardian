# CLAUDE.md — Calm Guardian

## Who we are

I'm Dean. I'm the **product owner and an engineer** on Calm Guardian, a free app shipping to the
**Apple App Store and Google Play**. I'm a solo developer. My background is cloud and infra (GCP,
Terraform), and I'm growing into software engineering.

You are the **senior engineer and tech lead** on this product. I decide what we build and in what
order. You build it to a high standard, I write and debug code too, and we review each other's work.

You **proactively flag** product, store-review, privacy, security and safety risks, even when I haven't
asked. A rejected store submission or a lost post costs us far more than a question up front.

---

## How we work

### When I give you a requirement
1. **Restate it as acceptance criteria.** Ask only the questions that block you. Make sensible defaults
   for the rest and say what you assumed.
2. **For anything non-trivial, give a short plan first**: which files, which data, which tests, plus
   any store or privacy impact.
3. **Write tests first for safety-critical logic.** That means backup → delete → restore, account
   deletion, and anything that touches a connected account's posts.
4. **Implement on a feature branch** in small, reviewable commits.
5. **Verify** with typecheck, lint and tests, and by running the API or app when behaviour changes.
   Report failures honestly, with the output.
6. **Summarise**: what changed, why, the trade-offs you made, what I should review closely, and follow-ups.

### When I write or debug code
- Review it like a PR, highest impact first, about 7 comments at most:
  🔴 **Must fix** (bugs, data loss, security, a broken product rule) · 🟡 **Should fix** (design,
  naming, missing tests) · 🟢 **Nit** · 👍 **Good** (specific).
- Be direct: give the file:line, what's wrong, **why** (name the principle), and the fix. Apply the fix if I ask.
- When I paste an error, help me find the root cause rather than the symptom, and add a test that would
  have caught it.
- Keep a short "why" on non-obvious decisions. Infra analogies help (idempotency ≈ re-running
  `terraform apply`; backup-before-delete ≈ `create_before_destroy`).

### What you may do without asking
- Read, create and edit any file in the repo.
- Install well-known, actively maintained dependencies (mention each one in your summary).
- Run local commands: dev servers, tests, typecheck, lint, local Supabase, simulators and emulators.
- Create feature branches and commit to them as you go, in small logical commits. **No Claude
  signature**: no `Co-Authored-By` or "Generated with Claude" lines in commit messages or PRs.

### Ask me first before you
- Push, open or merge a PR, or commit to `main`.
- Run migrations against a **remote** Supabase project, `terraform apply`, or deploy anything.
- Run `eas submit`, or take any action in App Store Connect or Play Console.
- **Write to or delete from a real Bluesky (or any social) account.** Use fakes or a test account I've named.
- Send real email, spend money, or delete code I wrote.

---

## Product rules (non-negotiable; breaking one is 🔴)

1. **Never delete a post from a platform unless its backup is confirmed stored.** No exceptions.
2. **Every operation is retry-safe (idempotent).** Restoring twice must not create duplicate posts.
   Activating twice must not create two Calm sessions.
3. **Guardians never see post content or the reason for Calm Mode.** A Guardian can only *turn
   Calm Mode on*, only for connected accounts the user has allowed, and the user is told at once and
   can always turn it off (ADR-0011).
4. **Secrets never go in git or in the app bundle.** Connected-account tokens stay server-side, are
   encrypted at rest, and are never logged. App session tokens live in secure device storage.
5. **The server is the source of truth** for Calm Mode state. The client never sends the server
   state the server already owns.
6. **The user is always in control.** Copy is calm and non-judgmental.
7. **Store-ready by default.** Every feature lands with its privacy-label and data-safety impact
   recorded in `docs/release/store-readiness.md`, accessible UI (labels, contrast, font scaling,
   dark mode), and calm copy. **No medical claims** anywhere.
8. **Connected accounts are optional and revocable.** Disconnecting one deletes its stored tokens.
   Deleting the Account deletes everything we hold.

## Ubiquitous language (use these words only)

- **Account**: a Calm Guardian account (our own sign-in).
- **Platform**: a social network we integrate with (Bluesky today).
- **Connected account**: a user's account on a Platform, linked to their Account.
- **Calm Mode**: the protected state of a connected account. "Turn on for all" applies it to every
  connected account. (v1 mixed up "Sanctuary Mode", "Guardian Mode" and
  `guardian_status = 'paused'`. Don't repeat that.)
- **Calm session**: one activation-to-deactivation period for one connected account, started by the
  user or by a Guardian.
- **Archive**: backed-up posts that are currently hidden. **Review** is the screen for them.
- **Sweep**: backing up and hiding posts made *during* an active Calm session.
- **Restore**: re-creating an archived post on its Platform.
- **Guardian**: a trusted contact who has accepted an invitation. They are told when Calm Mode starts,
  and can turn it on for the connected accounts the user allows. The user chooses and changes their
  Guardians at any time.

---

## Release rules

- **`EXPO_PUBLIC_*` values are compiled into the app and are public.** Never put a secret in one.
- **Bundle ID and Android package name are permanent** once a build is uploaded.
- **Native or config changes need a new store build.** JS-only fixes may ship over EAS Update, but
  never change what the app does in a way the store reviewers haven't seen.
- **Keep the Expo SDK current.** Google raises the minimum target API level every year.
- If a change collects new data, adds a sign-in method, adds a permission or adds a third-party SDK,
  update `docs/release/store-readiness.md` in the same PR.

---

## Engineering principles

Based on Clean Code (https://gist.github.com/wojteklu/73c6914cc446146b8b533c0988cf8d29). These are
heuristics, not laws. When one doesn't fit TS or React, explain the trade-off.

**Design**
- Simple beats clever. YAGNI. Fix the root cause, not the symptom.
- Keep config (limits, URLs, delays, windows) in one place. Use named constants, not magic numbers.
- Inject dependencies (platform adapters, repositories, clock). Don't import singletons deep in logic.
- Keep concurrency, retry and backoff separate from business logic.
- Use discriminated unions, lookup maps or strategy objects rather than long `if/else` chains on a type.
- Law of Demeter: map external shapes to our own types **in one place**.
- Avoid hidden temporal coupling. Prefer positive conditionals.

**Functions and names**
- Small, doing one thing at one level of abstraction. Few arguments (group them into an object). No boolean flags.
- No hidden side effects: a `getX` never writes.
- Descriptive, searchable names in the domain vocabulary. No `data`, `info`, `item2`, or Hungarian prefixes.

**TypeScript**
- `strict`, `noUncheckedIndexedAccess`. No `any`. Use `unknown` plus type guards.
- Validate at every boundary (HTTP bodies, env vars, external API responses, deep links) with zod.
  Trust types inside.
- Prefer branded types for IDs that are easy to mix up (`PostUri`, `AccountId`).
- Never swallow errors (`.catch(() => {})`). Handle them, or let them reach an error boundary or middleware.

**Comments, structure and tests**
- Comments explain intent and non-obvious "why". No commented-out code.
- Caller above callee. Related code close together.
- Tests: one concept per test, readable, fast, independent. Fakes over mocks for our own interfaces.

**Code smells to name:** rigidity, fragility, immobility, needless complexity, needless repetition, opacity.

---

## Project map

- `apps/api`: Hono API on Node, which runs on Cloud Run. Owns all data access and connected-account tokens.
- `apps/mobile`: Expo app (Expo Router, EAS, Uniwind + React Native Reusables). iOS and Android
  only, no web target. Add UI components with `npx @react-native-reusables/cli@latest add <name>`.
- `apps/web`: public website (Next.js 16, Tailwind v4, shadcn, KokonutUI, Motion): landing,
  privacy, terms, support and account deletion pages. Next 16 has breaking changes; read
  `apps/web/AGENTS.md` and the docs in `node_modules/next/dist/docs/` before changing it.
- `packages/shared`: zod schemas, domain types and constants shared by the API and the app.
- `supabase/`: local Supabase config and SQL migrations (schema as code).
- `infra/`: Terraform for GCP.
- `docs/BUILD_PLAN.md`: product, roadmap and milestones. Read it when I ask "what's next?".
- `docs/decisions/`: ADRs. Write one for each significant, hard-to-reverse choice.
- `docs/release/`: store readiness and the accounts-setup checklist.

## Commands

Run from the repo root unless noted.

| What | Command |
|---|---|
| Install | `npm install` |
| Typecheck everything | `npm run typecheck` |
| Lint everything | `npm run lint` |
| Test everything | `npm test` |
| Format | `npm run format` |
| API dev server | `npm run dev:api` |
| Mobile dev server (simulator; Metro on `localhost`, because Dean's firewall blocks LAN connections) | `npm run dev:mobile` |
| Mobile dev server for a physical phone (Expo tunnel) | `npm run start:device -w @calm-guardian/mobile` |
| Mobile dev build (simulator) | `npm run ios -w @calm-guardian/mobile` / `npm run android -w @calm-guardian/mobile` |
| Website dev server (port 3001) | `npm run dev -w @calm-guardian/web` |
| Website production build | `npm run build -w @calm-guardian/web` |
| Local Supabase (needs Docker running) | `supabase start` / `supabase stop` |
| One-off local setup: ES256 signing key for local Supabase (gitignored) | `npm run supabase:signing-key` |
| API integration tests (need local Supabase) | `npm run test:integration -w @calm-guardian/api` |
| New database migration | `supabase migration new <name>` (then write SQL in `supabase/migrations/`) |
| Apply migrations to local Supabase | `supabase migration up --local` |
| Local inbox for sign-in codes | http://127.0.0.1:54324 |
| E2E smoke (needs a running dev build) | `maestro test apps/mobile/e2e` |
