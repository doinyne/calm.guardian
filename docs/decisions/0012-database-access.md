# 0012: Database access with Kysely and SQL migrations

**Status:** Accepted · **Date:** 2026-11-03

## Context
M1 adds our first tables (connected accounts and encrypted OAuth state). M2 needs more: the Archive,
Calm sessions and the backup-then-delete bookkeeping, which has to be **transactional**. A post's
backup and its "deleted" mark must commit together or not at all. ADR-0002 says the API is the only
thing that talks to the database, using its own credentials.

## Options
1. **supabase-js** (PostgREST over HTTP with the secret key). It's already a dependency, but there are
   no transactions, every query is an HTTP call, and the secret key bypasses RLS anyway.
2. **Drizzle.** Good TypeScript, but its schema and migrations live in TypeScript, which would be a
   second source of truth beside Supabase's SQL migrations.
3. **Kysely + `pg`.** A type-safe SQL query builder over node-postgres: real transactions and plain
   SQL semantics. The schema stays in SQL migrations.

## Decision
**Option 3.**
- **The schema is SQL in `supabase/migrations/`,** managed by the Supabase CLI (`supabase migration
  new`, `supabase migration up --local`, `supabase db push` for remote projects, which needs Dean's
  OK). It's schema as code, reviewed like any other change.
- **Kysely** for queries, over a `pg` Pool from `DATABASE_URL`. In production that's Supabase's
  transaction pooler. We don't use named prepared statements, so the pooler is safe.
- **Table types live in `apps/api/src/db/database.ts`.** They're written by hand while the schema is
  small; every column is exercised by the integration tests, so drift fails tests. Switch to
  `kysely-codegen` when the schema outgrows that.
- **Rows become domain types in the repository**, and nowhere else (Law of Demeter). Repository
  functions take the `AccountId` as a required argument (ADR-0002).
- Every table has **RLS enabled with no policies**, so the app's `anon` and `authenticated` roles can
  read nothing even with a leaked publishable key. The API connects as a role that bypasses RLS.

## Consequences
- Integration tests need local Supabase running (`npm run test:integration -w @calm-guardian/api`).
- A migration that's been applied remotely must never be edited; write a new one.
- **M0b:** create a least-privilege database role for the API instead of `postgres`, and give it a
  small pool size suited to Cloud Run's concurrency.
