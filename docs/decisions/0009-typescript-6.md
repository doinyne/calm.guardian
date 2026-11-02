# 0009: Pin TypeScript 6.0 and ESLint 9 for now

**Status:** Proposed · **Date:** 2026-11-02

## Context
The repo started on TypeScript `^7.0.2`, the native Go compiler. On 2026-11-02:
- `typescript-eslint@8.72` declares `typescript: >=4.8.4 <6.1.0` as a peer dependency, because typed
  linting needs the compiler's JavaScript API.
- The Expo SDK 58 template ships `typescript: ~6.0.3`.
- `eslint-config-expo@58` depends on `eslint-plugin-react` and `eslint-plugin-import`, which support
  ESLint up to 9, not 10.

## Decision
- Pin `typescript@~6.0.3` in every workspace.
- Pin `eslint@^9`.

## Consequences
- Typed lint rules (e.g. `no-floating-promises`) work. They catch real bugs in async code like
  Calm Mode activation.
- Type-checking is slower than on TS 7. That's acceptable at our size.
- Revisit both pins at each Expo SDK upgrade.
