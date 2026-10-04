-- Youth Academy competition/security follow-up.
-- Cover the new membership FK, fix the helper search path, and protect the
-- existing scouting-program catalogue which is consumed through owner-scoped
-- SECURITY DEFINER RPCs rather than direct client table access.

create index if not exists youth_academy_memberships_academy_season_idx
on public.youth_academy_competition_memberships(academy_id,season_number);

alter function private.youth_generated_race_name_v1(text,text,integer)
set search_path=pg_temp;

alter table public.youth_academy_scouting_programs enable row level security;
revoke all privileges on table public.youth_academy_scouting_programs
from anon,authenticated;
