# Store readiness

Living checklist of what the App Store and Google Play require, and where we meet each requirement.
**Update this in the same PR** whenever a feature collects new data, adds a sign-in method or
permission, or adds a third-party SDK (product rule 7).

Store rules change, so re-check the official sources before M8 and M9:
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play Developer Policy Center: https://play.google/developer-content-policy/

Status: ⬜ not started · 🟨 in progress · ✅ done

---

## Requirements

| # | Requirement | Store | How we meet it | Milestone | Status |
|---|---|---|---|---|---|
| 1 | In-app account deletion | Apple 5.1.1(v), Google | Settings → Delete account → confirm → `DELETE /account` deletes the auth user, and our tables cascade from it. Idempotent. Revoking Platform tokens lands with Bluesky connect | M1 | 🟨 |
| 2 | Revoke Sign in with Apple tokens on account deletion | Apple | Account deletion calls Apple's token revocation endpoint | M1 | ⬜ |
| 3 | Web URL for account deletion requests | Google | `apps/web` `/delete-account`: how to delete in the app, or by email without it. Needs the real domain and support email | M1 | 🟨 |
| 4 | Equivalent privacy-preserving login if Google sign-in is offered | Apple 4.8 | Sign in with Apple, plus email one-time code. The email code is built; Apple and Google sign-in come together | M1 | 🟨 |
| 5 | Privacy policy URL in the app and in the listing | Both | `apps/web` `/privacy` (draft from the data inventory; legal review in M7); link from onboarding and Settings | M7 | 🟨 |
| 6 | iOS privacy manifest | Apple | `ios.privacyManifests` in `app.config.ts`, kept current as SDKs are added | M0 | 🟨 |
| 7 | Export compliance | Apple | `ios.config.usesNonExemptEncryption: false` (standard HTTPS only) | M0 | 🟨 |
| 8 | App Privacy label / Data safety form | Both | See the data inventory below | M9 | ⬜ |
| 9 | No medical claims; disclaimer | Apple 1.4.1, Google health policy | ADR-0008. "Not a medical device" in onboarding and Settings | M7 | ⬜ |
| 10 | Health apps declaration | Google | Complete honestly in Play Console → App content | M9 | ⬜ |
| 11 | Sensitive data from an individual developer | Apple 5.1.1(ix) | Data minimisation, clear privacy policy, detailed review notes; fallback is a Ltd + app transfer | M9 | ⬜ |
| 12 | Target API level | Google | Keep the Expo SDK current (yearly bump) | Ongoing | 🟨 |
| 13 | Closed test: at least 12 testers for 14 continuous days | Google (new personal accounts) | Recruit testers during M5–M7 | M8 | ⬜ |
| 14 | App completeness and demo account | Apple 2.1, Google | Demo Account plus a **dedicated, seeded test Bluesky account** in review notes. ⚠️ Reviewers can't receive our sign-in emails, so before M9 the demo Account needs a way in that works for them (e.g. a review mailbox whose login we share, or a fixed code for one review address, set on the server) | M9 | ⬜ |
| 15 | Universal Links / App Links | Both | `apple-app-site-association` and `assetlinks.json` on our domain | M1 | ⬜ |
| 16 | Age rating / content rating | Both | Apple age rating questionnaire; IARC questionnaire in Play Console | M9 | ⬜ |
| 17 | Target audience: adults | Google (Families policy) | Play Console target audience: 18+ | M9 | ⬜ |
| 18 | Support URL and contact email | Both | `apps/web` `/support`; support email on our domain (placeholder in `apps/web/src/lib/site.ts`) | M9 | 🟨 |
| 19 | Accessibility | Both (expectation; Apple accessibility labels) | Labels, contrast, font scaling, screen reader pass | M7 | ⬜ |
| 20 | First Android upload by hand | Google | Upload the first AAB in Play Console before using EAS Submit | M0b | ⬜ |
| 21 | Real app icon and splash | Both | 1024×1024 icon, no transparency for iOS; Android adaptive foreground + monochrome. Current assets are Expo placeholders | M7 | ⬜ |
| 22 | No placeholder or "coming soon" features, and no other companies' names without need | Apple 2.1, 2.3; Google impersonation and IP policy | The "Not available yet" Platforms on Connect an account (Mastodon, Threads, Instagram, Facebook, LinkedIn, X) show only in development and preview builds (`upcomingPlatformsShownIn`). Check a production build before M9 | M9 | 🟨 |

---

## Data inventory (source for the privacy label and data safety form)

Keep this table accurate. Add a row in the same PR as any new data. "Linked" means linked to the
user's identity.

| Data | Why | Linked | Shared with third parties | Stored where | Milestone |
|---|---|---|---|---|---|
| Account email | Sign-in, account emails | Yes | No (processors only: Supabase) | Supabase Auth | M1 |
| Apple / Google user ID | Sign-in | Yes | No | Supabase Auth | M1 |
| Sign-in metadata: IP address and device user agent | Session security and abuse prevention | Yes | No (processor: Supabase) | Supabase Auth sessions and audit log | M1 |
| Connected account ID (Bluesky DID) and handle | Act on the user's posts | Yes | No | Postgres | M1 |
| Connected account OAuth tokens | Act on the user's posts | Yes | No | Postgres (encrypted) | M1 |
| User content: archived posts (the whole post record: text, links, mentions, replies) and images | Backup and Restore | Yes | No | Postgres + Supabase Storage, all encrypted by the API (ADR-0013; images arrive later in M2) | M2 |
| Calm session times and chosen period | Calm Mode state, history | Yes | No | Postgres | M2 |
| Guardian name and email (third party) | Notify guardians | Yes | Emailed to the guardian; processor: email provider | Postgres | M6 |
| Guardian's own Account and which connected accounts they may protect | Let Guardians turn on Calm Mode (ADR-0011) | Yes | No | Supabase Auth + Postgres | M6 |
| Who started each Calm session (the user or a Guardian) | Tell the user who turned Calm Mode on | Yes | No | Postgres | M3/M6 |
| Crash diagnostics | Fix crashes | No (PII scrubbed) | Processor: crash reporting | Crash reporting vendor | M7 |

**Not collected:** diagnoses, symptoms, the reason for Calm Mode, location, contacts, advertising
identifiers, analytics or tracking. Keep it that way unless Dean decides otherwise.

---

## Review notes template (M9)

> Calm Guardian lets people temporarily hide their own Bluesky posts during a difficult period and
> restore them later. It is a social media privacy tool, not a medical app.
>
> **Demo Account:** `<email>` / one-time code via `<instructions>`
> **Test Bluesky account (already connected):** `<handle>`. Contains seeded posts; safe to hide.
>
> To test: open the app → tap **Turn on Calm Mode** → confirm. Posts are backed up and removed from
> Bluesky. Open **Review** to restore them.
>
> Bluesky is connected through Bluesky's official OAuth screen; we never see the user's Bluesky password.
>
> **Guardians:** a user can invite trusted contacts. For each connected account, the user decides
> whether Guardians may turn Calm Mode on for it (off by default). A Guardian can only turn it on,
> never off; they never see posts; the user is told immediately and can turn it off or remove the
> Guardian at any time. A Guardian can't turn it on again until the user has gone through the posts
> from last time in Review.
