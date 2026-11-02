# Accounts and setup checklist (Dean)

Everything outside the repo that the release pipeline needs, in the order to do it. Prices were
correct as of late 2026; check them when you sign up.

## 1. Decide (free, but permanent)

- [ ] **Store name.** "Calm Guardian" or "Sanctuary"? It must be unique on the App Store. Avoid
  other companies' trademarks in the name (e.g. "for Bluesky").
- [ ] **Domain** (around £10–£40 a year). We need it for:
  - privacy policy, terms and support pages (both stores)
  - the account deletion web page (Google)
  - the Bluesky OAuth client metadata URL (the `client_id` *is* a URL on our domain)
  - Universal Links and App Links files
  - a support email address
- [ ] **Bundle ID / Android package name.** This is **permanent** once a build is uploaded. Use the
  reverse-DNS of the domain, e.g. domain `calmguardian.app` → `app.calmguardian`. The dev and preview
  variants append `.dev` and `.preview` automatically. Put the value in `apps/mobile/app.config.ts`
  (`PRODUCTION_BUNDLE_ID`).

## 2. Store developer accounts

- [ ] **Apple Developer Program, as an individual.** USD 99 a year; free apps still pay. Needs an
  Apple ID with two-factor authentication. Enrolment can take a day or two.
  - Your legal name is shown as the seller on the App Store.
- [ ] **Google Play Console, personal account.** USD 25 one-off, with identity verification.
  - **Before production access**, new personal accounts must run a **closed test with at least 12 testers
    opted in for 14 continuous days**. Start collecting tester emails early: friends, family, peer
    support communities.
  - The first Android build must be **uploaded by hand** in Play Console. After that, EAS Submit can automate it.

## 3. Build and hosting

- [ ] **Expo account** (free). Create it at expo.dev, then run `npx eas-cli login` and `npx eas-cli init`
  in `apps/mobile` (Claude pairs on this).
- [ ] **Supabase.** Two projects in the **London** region:
  - `calm-guardian-staging`: free tier is fine.
  - `calm-guardian-prod`: **Pro plan** (about USD 25 a month). Free projects pause after inactivity and
    have no point-in-time recovery, which isn't acceptable for users' archived posts.
- [ ] **GCP project with billing.** Cloud Run, Artifact Registry and Secret Manager in `europe-west2`.
  Expect near-zero cost at low traffic. Set a **budget alert**.
- [ ] **GitHub.** Branch protection on `main` (require CI to pass, require a PR).

## 4. Later

- [ ] **Email provider** (M6), e.g. Resend. Verify the sending domain (SPF, DKIM, DMARC).
- [ ] **Crash reporting** (M7), e.g. Sentry. Free tier; configure PII scrubbing.
- [ ] **Legal review** of the privacy policy and terms (M7).
- [ ] **ICO data protection fee** (M7): check whether it applies to you (ico.org.uk). The app
  processes personal data, and the context is mental-health-adjacent.
- [ ] **Test Bluesky account** for development and App Review, with seeded posts. Never use a real
  personal account for tests.

## Rough running cost at launch

| Item | Cost |
|---|---|
| Apple Developer Program | USD 99 / year |
| Google Play | USD 25 once |
| Domain | ~£10–£40 / year |
| Supabase prod (Pro) | ~USD 25 / month |
| GCP, Expo, email, crash reporting | free tiers to start |
