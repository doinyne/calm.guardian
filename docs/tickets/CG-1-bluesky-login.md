# CG-1 — Authenticate a user against Bluesky

**Type:** Story
**Milestone:** M2 (Authentication)
**Estimate:** 1 day
**Depends on:** M1 skeleton (`createApp` factory, `/health`) — done

---

## Summary

As a user, I can send my Bluesky handle and App Password to the API and get back my
account identity, so that later work can establish a session for me.

## Context

This is the first slice of M2, deliberately cut thin. It proves we can talk to Bluesky
and that credentials are handled safely, **without** committing to how sessions are
stored or how our own auth tokens work — both of which are separate decisions that need
a database.

v1 sent the App Password to the backend and stored the resulting Bluesky session as
plain JSON in Postgres. We are not repeating that, but we are also not solving it in
this ticket: nothing is persisted here at all.

## Scope

**In scope**
- `POST /auth/login` accepting `{ identifier, password }`
- Request body validation at the boundary
- A Bluesky gateway with its own interface, injected into the app
- Mapping Bluesky's response to our own DTO
- Mapping a failed login to a sensible HTTP status
- Unit tests using a fake gateway (no network)

**Out of scope** — do not build these here
- Persisting the user or the Bluesky session (no database yet)
- Issuing our own session token or JWT
- Token refresh, logout, revocation
- Auth middleware / protected routes
- Anything on the frontend

## Acceptance criteria

1. `POST /auth/login` with valid credentials returns **200** and a body containing the
   user's `did` and `handle`, and nothing else.
2. `POST /auth/login` with wrong credentials returns **401** and a JSON error body. The
   response does not reveal whether the handle exists.
3. `POST /auth/login` with a missing or malformed body returns **400** and a JSON error
   body naming which field is wrong.
4. The App Password appears in **no** log line, **no** response body, and **no** error
   message. Verified by reading the dev-server output after a failed login.
5. The route depends on an interface, not on `@atproto/api` directly. The whole test
   suite runs with no network access.
6. `npm run typecheck` and `npm test` are clean. No `any`.

## Technical notes

- Client: `@atproto/api`. Use **`AtpAgent`** — v1 used `BskyAgent`, which newer versions
  deprecate. Check the `.d.ts` for the real signature of `login()` rather than trusting
  a tutorial.
- Validation: `zod` (not yet installed). This is the first route with a body, so it sets
  the pattern every later route will copy. Get the shape right.
- `identifier` is Bluesky's term and can be a handle *or* an email. Keep their word for
  it at the boundary; use our own vocabulary inside.
- The gateway returns **our** type, not Bluesky's. Bluesky's shape is mapped in exactly
  one place (a v1 mistake: `as any` on every record, mapping duplicated).
- Credentials must be validated as *strings* only — do not add length or character rules
  for a password you do not own the policy for.

## Tasks

- [ ] `npm i -w apps/api @atproto/api zod`
- [ ] Define the gateway interface and our identity DTO
- [ ] Write the failing tests first, with a fake gateway (success, wrong password, bad body)
- [ ] Implement the real gateway against `AtpAgent`
- [ ] Add the route; wire the gateway through `createApp()` and `server.ts`
- [ ] Verify by hand with `curl` against a throwaway Bluesky account
- [ ] Read the dev-server log and confirm AC 4

## Questions to answer before writing code

1. What is the gateway's interface — method name, arguments, return type? What does it
   return when the password is wrong: a thrown error, or a result object?
2. Where does the mapping from Bluesky's response to our DTO live?
3. `createApp()` currently takes no arguments. What is its signature now, and who
   constructs the real gateway?

## Definition of done

Typecheck clean, tests green, manually verified with `curl`, committed on a branch, and
you can explain to someone else why the route does not import `@atproto/api`.
