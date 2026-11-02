# 0005: Mobile stack: Expo SDK 58, dev builds, EAS, phones only

**Status:** Proposed · **Date:** 2026-11-02

## Context
The app ships to the App Store and Google Play. v1 used Expo Go and a web build for Cypress, which
hid native problems until late and gave us no store pipeline.

## Decision
- **Expo SDK 58** (React Native 0.88, React 19.3) with **Expo Router** (file-based routes, typed routes).
- **Development builds** (`expo-dev-client`), not Expo Go. Native config (bundle IDs, privacy manifest,
  sign-in modules) is exercised from day one.
- **EAS Build, Submit and Update.** We use three build variants, each with its own bundle ID and app
  name, so they can be installed side by side:

  | Variant | Bundle ID suffix | Distribution | API |
  |---|---|---|---|
  | `development` | `.dev` | dev client on simulators and our devices | local |
  | `preview` | `.preview` | EAS internal distribution (iOS ad hoc, Android APK) | staging |
  | `production` | none | TestFlight, Play testing tracks, then the stores | production |

  TestFlight and Play testing tracks only accept store-signed builds of the real app record, so beta
  testers (M8) use **production** builds against the production API.

- Versions are managed remotely by EAS (`appVersionSource: remote`, `autoIncrement` on production).
- **EAS Update** uses one channel per profile and a `fingerprint` runtime version, so an update can
  never reach a binary with incompatible native code.
- **Data fetching:** TanStack Query, plus a typed client from the API's Hono `AppType` (`hono/client`).
- **State:** server state lives in TanStack Query. Add local UI state (e.g. Zustand) only when a
  real need appears.
- **No web target.** **iPhone and Android phones only** (`supportsTablet: false`), **portrait only**.
- `ios.config.usesNonExemptEncryption: false`: we use only standard HTTPS/TLS.
- The iOS **privacy manifest** is declared in app config and kept current as SDKs are added.

## Consequences
- Local builds need Xcode and Android Studio, or EAS cloud builds. The free EAS tier has a monthly quota.
- The iPad is out of scope. Apple still runs iPhone apps on iPad in compatibility mode, so layouts must not break there.
- Bumping the SDK yearly keeps us above Google Play's target API level requirement.
- Bundle IDs are permanent once uploaded. The production values are set once in `app.config.ts`
  (see `docs/release/accounts-setup.md`).
