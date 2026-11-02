y# Store readiness

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
| 1 | In-app account deletion | Apple 5.1.1(v), Google | Settings → Delete Account. Server deletes all data, revokes Platform tokens | M1 | ⬜ |
| 2 | Revoke Sign in with Apple tokens on account deletion | Apple | Account deletion calls Apple's token revocation endpoint | M1 | ⬜ |
| 3 | Web URL for account deletion requests | Google | Page on our domain explaining how to delete, with a request route for users without the app | M1 | ⬜ |
| 4 | Equivalent privacy-preserving login if Google sign-in is offered | Apple 4.8 | Sign in with Apple, plus email one-time code | M1 | ⬜ |
| 5 | Privacy policy URL in the app and in the listing | Both | Website page; linked from onboarding and Settings | M7 | ⬜ |
| 6 | iOS privacy manifest | Apple | `ios.privacyManifests` in `app.config.ts`, kept current as SDKs are added | M0 | 🟨 |
| 7 | Export compliance | Apple | `ios.config.usesNonExemptEncryption: false` (standard HTTPS only) | M0 | 🟨 |
| 8 | App Privacy label / Data safety form | Both | See the data inventory below | M9 | ⬜ |
| 9 | No medical claims; disclaimer | Apple 1.4.1, Google health policy | ADR-0008. "Not a medical device" in onboarding and Settings | M7 | ⬜ |
| 10 | Health apps declaration | Google | Complete honestly in Play Console → App content | M9 | ⬜ |
| 11 | Sensitive data from an individual developer | Apple 5.1.1(ix) | Data minimisation, clear privacy policy, detailed review notes; fallback is a Ltd + app transfer | M9 | ⬜ |
| 12 | Target API level | Google | Keep the Expo SDK current (yearly bump) | Ongoing | 🟨 |
| 13 | Closed test: at least 12 testers for 14 continuous days | Google (new personal accounts) | Recruit testers during M5–M7 | M8 | ⬜ |
| 14 | App completeness and demo account | Apple 2.1, Google | Demo Account plus a **dedicated, seeded test Bluesky account** in review notes | M9 | ⬜ |
| 15 | Universal Links / App Links | Both | `apple-app-site-association` and `assetlinks.json` on our domain | M1 | ⬜ |
| 16 | Age rating / content rating | Both | Apple age rating questionnaire; IARC questionnaire in Play Console | M9 | ⬜ |
| 17 | Target audience: adults | Google (Families policy) | Play Console target audience: 18+ | M9 | ⬜ |
| 18 | Support URL and contact email | Both | Website support page; support email on our domain | M9 | ⬜ |
| 19 | Accessibility | Both (expectation; Apple accessibility labels) | Labels, contrast, font scaling, screen reader pass | M7 | ⬜ |
| 20 | First Android upload by hand | Google | Upload the first AAB in Play Console before using EAS Submit | M0b | ⬜ |
| 21 | Real app icon and splash | Both | 1024×1024 icon, no transparency for iOS; Android adaptive foreground + monochrome. Current assets are Expo placeholders | M7 | ⬜ |

---

## Data inventory (source for the privacy label and data safety form)

Keep this table accurate. Add a row in the same PR as any new data. "Linked" means linked to the
user's identity.

| Data | Why | Linked | Shared with third parties | Stored where | Milestone |
|---|---|---|---|---|---|
| Account email | Sign-in, account emails | Yes | No (processors only: Supabase) | Supabase Auth | M1 |
| Apple / Google user ID | Sign-in | Yes | No | Supabase Auth | M1 |
| Connected account ID (Bluesky DID) and handle | Act on the user's posts | Yes | No | Postgres | M1 |
| Connected account OAuth tokens | Act on the user's posts | Yes | No | Postgres (encrypted) | M1 |
| User content: archived posts and images | Backup and Restore | Yes | No | Postgres + Supabase Storage | M2 |
| Calm session times | Calm Mode state, history | Yes | No | Postgres | M3 |
| Guardian name and email (third party) | Notify guardians | Yes | Emailed to the guardian; processor: email provider | Postgres | M6 |
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
