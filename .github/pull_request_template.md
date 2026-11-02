## What and why

<!-- What changed, and the requirement or ticket it serves. -->

## How to verify

<!-- Commands, screens, or curl calls a reviewer can run. -->

## Checklist

- [ ] Typecheck, lint and tests pass locally
- [ ] Tests cover the new behaviour (test-first for backup / delete / restore / account deletion)
- [ ] No product rule broken (see `CLAUDE.md`), especially: no delete without a confirmed backup; retry-safe
- [ ] No secrets, tokens or personal data in code, logs, `EXPO_PUBLIC_*` values or test fixtures
- [ ] `docs/release/store-readiness.md` updated if this collects new data, adds a sign-in method, permission or SDK
- [ ] UI changes: accessible labels, works in dark mode and with large text, calm copy
- [ ] ADR added or updated for any significant, hard-to-reverse decision
