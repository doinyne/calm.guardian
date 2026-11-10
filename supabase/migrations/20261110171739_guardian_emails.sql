-- Guardian emails (M6): a private opt-out link per guardianship, and a once-only notice per Calm session.

-- Unguessable, so the opt-out link in an email works without signing in and can't be guessed.
alter table public.guardianships
  add column opt_out_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex');

-- Set when the "Calm Mode is on" emails were sent, so a retried job never sends them twice.
alter table public.calm_sessions add column notified_at timestamptz;
