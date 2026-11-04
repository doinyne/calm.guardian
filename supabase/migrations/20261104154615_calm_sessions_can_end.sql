-- Turning Calm Mode off (M3): a Calm session can end. Its hidden posts stay hidden until Review (M5).

alter table public.calm_sessions drop constraint calm_sessions_state_check;
alter table public.calm_sessions
  add constraint calm_sessions_state_check
  check (state in ('activating', 'active', 'failed', 'ended'));

alter table public.calm_sessions add column ended_at timestamptz;
