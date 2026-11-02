# 0006: Testing strategy

**Status:** Proposed · **Date:** 2026-11-02

## Context
v1 had only Cypress E2E against the web build and no unit tests on the code that deletes posts. v2
has no web target, and its most important logic (backup → delete → restore) must be proven before
it touches a real account.

## Decision
| Layer | Tool | Scope |
|---|---|---|
| Domain and core logic | **Vitest** | `packages/shared`, API services with in-memory fakes for adapters and repositories. **TDD** for the archive core and account deletion. |
| API routes | **Vitest** + Hono `app.request()` | Status codes, error shape, validation, auth. No port, no network. |
| DB | Vitest against **local Supabase** (from M1) | Repositories and migrations against real Postgres. |
| Mobile components and hooks | **jest-expo** + **React Native Testing Library** | Rendering, interaction, loading, empty and error states. |
| End-to-end | **Maestro** | Flows on real dev or preview builds (simulator, emulator, device). |

Rules:
- **Fakes over mocks** for our own interfaces. Fakes are small classes implementing the interface.
- The whole unit and route suite runs with **no network**.
- Every bug fix gets a test that would have caught it.

## Consequences
- Two unit test runners (Vitest for Node and shared code, Jest for React Native) because jest-expo is
  the supported path for Expo. The test style stays the same in both.
- Maestro needs a built app. CI runs it later (M8) on EAS or a macOS runner. Until then it runs locally.
