create index if not exists race_participant_riders_rider_id_idx
  on public.race_participant_riders (rider_id);

create or replace view public.race_rider_public_identity_v1
with (security_barrier = true)
as
select
  r.id,
  r.first_name,
  r.last_name,
  r.display_name,
  r.country_code
from public.riders r
where exists (
  select 1
  from public.race_participant_riders rpr
  where rpr.rider_id = r.id
);

comment on view public.race_rider_public_identity_v1 is
  'Read-only race participant identity surface. Intentionally exposes only rider id, name fields, and country code for riders that have appeared in a race; avoids weakening public.riders RLS.';

revoke all on table public.race_rider_public_identity_v1 from public;
revoke all on table public.race_rider_public_identity_v1 from anon;
grant select on table public.race_rider_public_identity_v1 to authenticated;
