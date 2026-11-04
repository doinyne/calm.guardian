-- Background activation (ADR-0015): where the next run carries on, and which worker holds the session.

-- The Platform's cursor for the next page of posts. Bluesky's is a record key, so deleting posts
-- between runs doesn't move it.
alter table public.calm_sessions add column resume_cursor text;

-- A worker's claim on the session, so two never work on it at once. It simply runs out if the worker
-- crashes, so no session can be stuck.
alter table public.calm_sessions add column claimed_until timestamptz;
