-- Premium Youth Academy / U16 - security hardening
-- New Youth Academy tables are RPC-only. RLS denies row access, but TRUNCATE
-- and other table-level privileges are not governed by RLS, so remove direct
-- client privileges from anon/authenticated entirely.

revoke all privileges on table public.youth_academy_equipment_inventory from anon, authenticated;
revoke all privileges on table public.youth_development_weekly_runs from anon, authenticated;
revoke all privileges on table public.youth_graduation_records from anon, authenticated;
revoke all privileges on table public.youth_races from anon, authenticated;
revoke all privileges on table public.youth_race_entries from anon, authenticated;
revoke all privileges on table public.youth_race_results from anon, authenticated;
revoke all privileges on table public.youth_race_reports from anon, authenticated;

-- Keep RLS enabled as defense in depth.
alter table public.youth_academy_equipment_inventory enable row level security;
alter table public.youth_development_weekly_runs enable row level security;
alter table public.youth_graduation_records enable row level security;
alter table public.youth_races enable row level security;
alter table public.youth_race_entries enable row level security;
alter table public.youth_race_results enable row level security;
alter table public.youth_race_reports enable row level security;
