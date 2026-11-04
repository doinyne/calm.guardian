-- Calm sessions and the Archive (BUILD_PLAN M2, ADR-0011, ADR-0013). Only the API reads these tables
-- (ADR-0002, ADR-0012).

-- One activation-to-deactivation period for one connected account.
create table public.calm_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  state text not null default 'activating' check (state in ('activating', 'active', 'failed')),
  -- The period whose posts are hidden. No start means "since the account began".
  period_from timestamptz,
  period_to timestamptz not null,
  failure text check (failure in ('could-not-read-posts', 'backup-failed')),
  started_at timestamptz not null,
  activated_at timestamptz,
  failed_at timestamptz,
  check (period_from is null or period_from < period_to),
  check ((state = 'failed') = (failure is not null))
);

-- Activating twice must not open two Calm sessions (product rule 2), even when both requests arrive
-- at once: the second insert fails, and the API reads the open session instead.
create unique index calm_sessions_one_open_per_connected_account
  on public.calm_sessions (connected_account_id)
  where state in ('activating', 'active');

create index calm_sessions_account_id_idx on public.calm_sessions (account_id);

-- Backed-up posts. One row per post per connected account, so backing up again updates it.
create table public.archived_posts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  connected_account_id uuid not null references public.connected_accounts (id) on delete cascade,
  calm_session_id uuid not null references public.calm_sessions (id) on delete cascade,
  uri text not null,
  cid text not null,
  posted_at timestamptz not null,
  -- The whole post record, sealed by the API (ADR-0013): posts written during an episode are
  -- sensitive, so a database dump shows no content.
  record_encrypted text not null,
  backed_up_at timestamptz not null,
  -- Set once the post is gone from its Platform.
  hidden_at timestamptz,
  unique (connected_account_id, uri)
);

create index archived_posts_calm_session_not_hidden_idx
  on public.archived_posts (calm_session_id)
  where hidden_at is null;

create index archived_posts_account_id_idx on public.archived_posts (account_id);

-- A connected account with hidden posts can't be disconnected: its posts exist only here, and would
-- be lost (ADR-0013). The API checks first and explains; this is the safety net. Deleting the whole
-- Account is different, because the user asked us to delete everything (product rule 8): that delete
-- arrives through the cascade from auth.users, one trigger level deeper, and is allowed.
create function public.refuse_disconnect_with_hidden_posts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1 from public.archived_posts
    where connected_account_id = old.id and hidden_at is not null
  ) then
    raise exception 'connected account % has hidden posts', old.id
      using errcode = 'P0001', hint = 'connected_account_has_hidden_posts';
  end if;
  return old;
end;
$$;

revoke execute on function public.refuse_disconnect_with_hidden_posts() from public, anon, authenticated;

create trigger connected_accounts_refuse_disconnect_with_hidden_posts
before delete on public.connected_accounts
for each row execute function public.refuse_disconnect_with_hidden_posts();

-- Defence in depth (ADR-0002): no access for the app's roles, and RLS with no policies.
alter table public.calm_sessions enable row level security;
alter table public.archived_posts enable row level security;

revoke all on public.calm_sessions, public.archived_posts from anon, authenticated;
