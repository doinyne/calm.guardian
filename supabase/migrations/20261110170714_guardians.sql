-- Guardians (M6, ADR-0011): trusted contacts who can turn Calm Mode on, and nothing else.

create table public.guardianships (
  id uuid primary key default gen_random_uuid(),
  -- The user who asked for a Guardian. Deleting their Account removes every Guardian.
  account_id uuid not null references auth.users (id) on delete cascade,
  -- Shown to the Guardian, so they know who's asking.
  account_email text not null,
  -- Where the invitation went, lower-cased. Accepting needs a sign-in with this address.
  guardian_email text not null check (guardian_email = lower(guardian_email)),
  -- Set when the Guardian accepts. Deleting the Guardian's own Account ends the guardianship.
  guardian_account_id uuid references auth.users (id) on delete cascade,
  state text not null default 'invited' check (state in ('invited', 'active')),
  invited_at timestamptz not null,
  accepted_at timestamptz,
  -- The Guardian stopped Calm Guardian's emails (they can still act in the app).
  emails_opted_out_at timestamptz,
  check ((state = 'active') = (guardian_account_id is not null)),
  unique (account_id, guardian_email)
);

create index guardianships_guardian_email_idx on public.guardianships (guardian_email);
create index guardianships_guardian_account_id_idx on public.guardianships (guardian_account_id);

-- Per connected account: may the user's Guardians turn Calm Mode on for it? Off by default.
alter table public.connected_accounts
  add column guardians_can_turn_on boolean not null default false;

-- Who started each Calm session: null for the user, otherwise the Guardian. A removed Guardian leaves
-- the history, without the link.
alter table public.calm_sessions
  add column started_by_guardianship_id uuid references public.guardianships (id) on delete set null;

alter table public.guardianships enable row level security;
revoke all on public.guardianships from anon, authenticated;
