-- Review and Restore (M5): what the user decided about each hidden post.

-- Back on its Platform, exactly as it was. Our copy stays until the user deletes it, so a mistake in
-- Bluesky's copy can still be put right.
alter table public.archived_posts add column restored_at timestamptz;

-- The user chose to keep it hidden. It can still be restored later.
alter table public.archived_posts add column kept_hidden_at timestamptz;

-- Review lists an Account's hidden posts, newest first.
create index archived_posts_review_idx
  on public.archived_posts (account_id, posted_at desc)
  where hidden_at is not null and restored_at is null;

-- A restored post is back on its Platform, so it no longer stops a disconnect (ADR-0013).
create or replace function public.refuse_disconnect_with_hidden_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1 from public.archived_posts
    where connected_account_id = old.id and hidden_at is not null and restored_at is null
  ) then
    raise exception 'connected account % has hidden posts', old.id
      using errcode = 'P0001', hint = 'connected_account_has_hidden_posts';
  end if;
  return old;
end;
$$;
