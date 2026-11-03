# Calm Guardian

Calm Guardian helps professionals with episodic mental health conditions protect their Bluesky presence. One tap turns on **Calm Mode**: recent posts are backed up to Supabase and then deleted from Bluesky, so they're invisible while you're unwell. Posts made during an active calm session are swept the same way. Later, you review your **archive** and either **restore** a post to Bluesky or delete it for good. Trusted **guardians** receive a calm email when Calm Mode starts. A post is never deleted from Bluesky until its backup is confirmed stored, and every operation is safe to retry.

## Running it locally

Everything runs on your Mac: the API, a local Supabase (auth and database) and the app in the iOS
Simulator. You don't need any cloud accounts.

**What works today:**
- sign in with an emailed code
- connect and disconnect a Bluesky account
- sign out and delete your account

Calm Mode itself is still being built (see [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md)).

### 1. Install the tools (once)

| Tool | Why | Install |
|---|---|---|
| **Node 26** (24.3 or later works) | API, app tooling, tests | `nvm install` (reads `.nvmrc`) |
| **Xcode 27** with an iOS 27 simulator | Builds and runs the app | App Store, then Xcode → Settings → Components |
| **CocoaPods** | iOS native dependencies | `brew install cocoapods` |
| **Docker Desktop** | Runs local Supabase | [docker.com](https://www.docker.com/products/docker-desktop/) |
| **Supabase CLI** | Starts local Supabase, applies migrations | `brew install supabase/tap/supabase` |

The app targets iPhone and Android phones. Only the iOS Simulator is set up and tested so far.

### 2. Get the code and dependencies

```bash
git clone https://github.com/doinyne/calm.guardian.git
cd calm.guardian
npm install
```

`npm install` also applies the patches in `patches/` and sets up the git hooks.

### 3. Start local Supabase

Make sure Docker Desktop is running, then:

```bash
npm run supabase:signing-key   # once: the key local Supabase signs sign-ins with (gitignored)
supabase start                 # the first run downloads images and applies every migration
```

When you pull new database migrations later, apply them with `supabase migration up --local`.

### 4. Create your local settings

Both apps read a `.env` file that's never committed. Start from the examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/mobile/.env.example apps/mobile/.env
supabase status -o env   # shows the local keys you need below
```

Then fill in the empty values:

| File | Setting | Value |
|---|---|---|
| `apps/api/.env` | `SUPABASE_SECRET_KEY` | `SECRET_KEY` from `supabase status -o env` |
| `apps/api/.env` | `TOKEN_ENCRYPTION_KEYS` | Generate one: `echo "k1:$(openssl rand -base64 32)"` |
| `apps/mobile/.env` | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `PUBLISHABLE_KEY` from `supabase status -o env` |

The other values in the examples already point at your local services. Never put the secret key
in `apps/mobile/.env`: anything there is built into the app, and the app refuses to start with one.

### 5. Build the app (once)

```bash
npm run ios -w @calm-guardian/mobile
```

This builds the development app, installs it on the simulator and starts Metro. It takes a few
minutes the first time. Once the app opens, press Ctrl+C: from then on, step 6 is all you need.
Build again whenever native dependencies change (a pull that changes `apps/mobile/package.json` or
`app.config.ts`).

### 6. Run it

In two terminals:

```bash
npm run dev:api      # terminal 1: the API on http://localhost:3000
npm run dev:mobile   # terminal 2: Metro; press i to open the app in the simulator
```

### 7. Try it

- **Sign in:** use any email address. Local Supabase doesn't send real email; read the 6-digit code
  in its test inbox at http://127.0.0.1:54324.
- **Connect Bluesky:** tap **Connect Bluesky** and sign in on Bluesky's own page. Use an account
  you're happy to test with, because Calm Mode will delete and re-create posts once it lands.
  Bluesky's approval screen shows a development app at localhost: that's expected until we move to
  the production client.
- **See the database:** Supabase Studio at http://127.0.0.1:54323.

### Stopping

```bash
# Ctrl+C in the API and Metro terminals, then:
supabase stop
```

## Tests and checks

```bash
npm run typecheck   # every workspace
npm run lint
npm test            # unit tests: API, app, website, shared
npm run test:integration -w @calm-guardian/api   # against local Supabase (must be running)
```

CI runs format, lint, typecheck and the unit tests on every pull request.

## The website

```bash
npm run dev -w @calm-guardian/web   # http://localhost:3001
```

## Troubleshooting

- **"Failed to load app from http://192.168…"**: a firewall is blocking connections on your network
  address. `npm run dev:mobile` serves Metro on localhost; start it, then press `i` to reopen the app.
- **Port 8081 is in use**: another Metro is already running. Stop it, or use that one.
- **The API exits with "Invalid environment configuration"**: it names the missing or invalid
  setting. Compare `apps/api/.env` with `apps/api/.env.example`.
- **`supabase start` says it can't read the signing keys**: run `npm run supabase:signing-key`.
- **The website shows old colours after a pull**: delete `apps/web/.next` and build again.
- **A physical phone can't reach the API**: phones aren't supported yet, because the API, Supabase
  and Bluesky's development client all live on your Mac's localhost. Use the simulator.

## Repository map

| Path | What |
|---|---|
| `apps/api` | Hono API (Node, Cloud Run). Owns all data access and connected accounts' tokens |
| `apps/mobile` | Expo app for iOS and Android |
| `apps/web` | Public website (Next.js): landing, privacy, terms, support, account deletion |
| `packages/shared` | Types and constants shared by the API and the app |
| `supabase/` | Local Supabase config and SQL migrations |
| `docs/` | The build plan, decision records (ADRs) and release checklists |

How we work, including product rules and commands, is in [CLAUDE.md](CLAUDE.md).
