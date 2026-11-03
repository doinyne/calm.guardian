-- Connected accounts: a user's accounts on social Platforms (ADR-0003), plus the encrypted AT Protocol
-- OAuth state and sessions the API keeps for Bluesky. Only the API reads these tables (ADR-0002,
-- ADR-0012).

create table public.connected_accounts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('bluesky')),
  -- The account's permanent ID on its Platform: a DID for Bluesky. Handles can change; this can't.
  external_id text not null,
  handle text not null,
  status text not null default 'active' check (status in ('active', 'needs_reauth', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One Platform account belongs to one Calm Guardian Account.
  unique (platform, external_id)
);

create index connected_accounts_account_id_idx on public.connected_accounts (account_id);

-- Short-lived OAuth sign-in state, keyed by the OAuth `state` value. The API encrypts the value.
create table public.atproto_oauth_states (
  key text primary key,
  value_encrypted text not null,
  expires_at timestamptz not null
);

-- OAuth sessions (tokens and the DPoP private key), keyed by DID. The API encrypts the value.
create table public.atproto_oauth_sessions (
  key text primary key,
  value_encrypted text not null,
  updated_at timestamptz not null default now()
);

-- Sessions are keyed by DID, so they can't reference auth.users. Whenever a Bluesky connected account
-- is deleted (disconnected, or its Account deleted), its session goes too, so no tokens are left
-- behind. SECURITY DEFINER because Account deletion cascades from Supabase Auth's own role, which has
-- no rights on our tables.
create function public.delete_atproto_session_of_connected_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.platform = 'bluesky' then
    delete from public.atproto_oauth_sessions where key = old.external_id;
  end if;
  return old;
end;
$$;

revoke execute on function public.delete_atproto_session_of_connected_account() from public, anon, authenticated;

create trigger connected_accounts_delete_atproto_session
after delete on public.connected_accounts
for each row execute function public.delete_atproto_session_of_connected_account();

-- Defence in depth (ADR-0002): the app's roles get no access at all, and RLS with no policies would
-- hide every row even if a grant slipped back in.
alter table public.connected_accounts enable row level security;
alter table public.atproto_oauth_states enable row level security;
alter table public.atproto_oauth_sessions enable row level security;

revoke all on public.connected_accounts, public.atproto_oauth_states, public.atproto_oauth_sessions
  from anon, authenticated;
