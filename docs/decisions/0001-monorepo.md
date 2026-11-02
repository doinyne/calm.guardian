# 0001: Monorepo with npm workspaces

**Status:** Proposed · **Date:** 2026-11-02

## Context
v1 had two repos (backend and Expo app) and copied types between them. The copies drifted, with
different nullability and a guardian limit defined twice. v2 has an API, a mobile app and shared
contracts, and one person maintaining all of them.

## Options
1. **Two repos** (as v1). Simple tooling, but shared types need publishing or copying.
2. **npm workspaces monorepo.** Already set up; Expo supports npm workspaces with no extra Metro config.
3. **pnpm or Turborepo monorepo.** Faster installs and task caching, at the cost of more tooling, and
   pnpm's isolated `node_modules` has historically needed workarounds with React Native.

## Decision
Use npm workspaces:

```
apps/api          Hono API (Node, Cloud Run)
apps/mobile       Expo app
packages/shared   zod schemas, domain types, constants
supabase/         local config + SQL migrations
infra/            Terraform
```

`packages/shared` is **source-only**: its `exports` point at `src/index.ts`, and Metro, tsx and Vitest
all compile it directly. There's no build step to forget.

## Consequences
- One PR can change the API contract and both of its consumers atomically.
- Root scripts fan out with `--workspaces --if-present`.
- If CI gets slow, we can add Turborepo later without restructuring.
- `packages/shared` must stay platform-neutral: no Node or React Native imports.
