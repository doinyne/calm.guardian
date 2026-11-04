-- Copies of archived posts' files: images, videos, captions and link previews (ADR-0013, ADR-0014).
-- Each is sealed by the API before it gets here. Kept in Postgres rather than Storage so it's stored
-- in the same transaction as its post, and deleted with it by the cascade: no file can outlive its
-- post, its connection or its Account.

create table public.archived_media (
  id uuid primary key default gen_random_uuid(),
  archived_post_id uuid not null references public.archived_posts (id) on delete cascade,
  -- The file's content hash on its Platform.
  cid text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes >= 0),
  content_encrypted bytea not null,
  unique (archived_post_id, cid)
);

alter table public.archived_media enable row level security;

revoke all on public.archived_media from anon, authenticated;
