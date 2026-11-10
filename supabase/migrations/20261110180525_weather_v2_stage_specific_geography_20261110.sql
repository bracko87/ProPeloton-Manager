-- City weather V2 geography disambiguation (research only).
-- The same name can denote different places within one country (Miami FL/TX).
-- Keep earlier name/country seed records as unresolved aliases; stage-specific
-- canonical location choices must be supported with independent evidence.
alter table private.weather_v2_locations
  drop constraint if exists weather_v2_locations_country_code_name_key_key;
create index if not exists weather_v2_locations_name_country_idx
  on private.weather_v2_locations (country_code, name_key);

create table if not exists private.weather_v2_stage_point_resolution (
  stage_id uuid not null references public.race_stages(id) on delete cascade,
  point_role text not null check (point_role in ('start','finish')),
  location_id bigint references private.weather_v2_locations(location_id),
  status text not null default 'unresolved'
    check (status in ('unresolved','ambiguous','verified','not_found')),
  evidence jsonb,
  reviewed_at timestamptz,
  primary key(stage_id, point_role),
  constraint verified_point_has_provenance check (
    status <> 'verified' or
      (location_id is not null and evidence is not null and reviewed_at is not null)
  )
);
create index if not exists weather_v2_stage_point_resolution_by_location
  on private.weather_v2_stage_point_resolution(location_id);

-- Raw alias hint only, *not* verified resolution: 2 rows per dated stage.
insert into private.weather_v2_stage_point_resolution(stage_id,point_role,location_id,status)
select stage_id,'start',start_location_id,'unresolved'
from private.weather_v2_stage_candidate
union all
select stage_id,'finish',finish_location_id,'unresolved'
from private.weather_v2_stage_candidate
on conflict(stage_id,point_role) do nothing;

alter table private.weather_v2_stage_point_resolution enable row level security;
revoke all on private.weather_v2_stage_point_resolution from public,anon,authenticated;
