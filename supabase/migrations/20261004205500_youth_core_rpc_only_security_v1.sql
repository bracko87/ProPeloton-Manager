-- Harden original Youth Academy core tables as RPC-only browser data.
-- The frontend uses authenticated RPCs; no direct table reads/writes are required.

alter table public.youth_academy_season_budgets enable row level security;
alter table public.youth_academy_ledger enable row level security;
alter table public.youth_riders enable row level security;
alter table public.youth_rider_agreements enable row level security;

revoke all privileges on table public.youth_academy_season_budgets from anon, authenticated;
revoke all privileges on table public.youth_academy_ledger from anon, authenticated;
revoke all privileges on table public.youth_riders from anon, authenticated;
revoke all privileges on table public.youth_rider_agreements from anon, authenticated;
