-- Project Saturn SAT-01: test-account lifecycle data model only.
-- This migration does NOT enable anonymous Auth, create official clubs, grant
-- Premium or allow anonymous race application. Production guest gate stays OFF.
-- A privileged, separately reviewed server procedure must insert records when
-- the ACTUAL official club is created; no client may write lifecycle timestamps.

create table if not exists public.saturn_test_accounts_v1 (
  user_id uuid primary key references auth.users(id) on delete restrict,
  club_id uuid not null unique references public.clubs(id) on delete restrict,
  created_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  premium_ends_at timestamptz not null,
  expires_at timestamptz not null,
  converted_at timestamptz,
  constraint saturn_test_premium_window_v1 check (
    premium_ends_at = started_at + interval '168 hours'
  ),
  constraint saturn_test_account_window_v1 check (
    expires_at = started_at + interval '336 hours'
  ),
  constraint saturn_test_conversion_after_start_v1 check (
    converted_at is null or converted_at >= started_at
  )
);

alter table public.saturn_test_accounts_v1 enable row level security;
-- Deliberately do NOT FORCE RLS here. FORCE would subject even the
-- privileged SQL function owner to the self-read-only policy and may block
-- its atomic lifecycle INSERT. Only approved SECURITY DEFINER server code
-- may write; browser roles have no DML GRANT and no DML policies.
-- RLS still applies to ordinary authenticated requests.

revoke all on table public.saturn_test_accounts_v1 from public, anon, authenticated;
grant select on table public.saturn_test_accounts_v1 to authenticated;

drop policy if exists saturn_test_accounts_read_self_v1
  on public.saturn_test_accounts_v1;
create policy saturn_test_accounts_read_self_v1
  on public.saturn_test_accounts_v1
  for select to authenticated
  using (user_id = (select auth.uid()));

-- No INSERT, UPDATE or DELETE privileges/policies for client Auth roles.
-- The official real-club creation RPC must atomically insert the lifecycle
-- record and club with a uniqueness check, once the fail-closed guest gate is
-- safely replaced after a complete RLS/gameplay audit.
