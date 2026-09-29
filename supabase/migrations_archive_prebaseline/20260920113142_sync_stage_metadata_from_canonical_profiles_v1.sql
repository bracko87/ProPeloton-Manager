create or replace function public.normalize_race_stage_terrain_split_v1(
  p_split jsonb,
  p_terrain_type text
)
returns jsonb
language plpgsql
immutable
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_flat numeric := greatest(0, coalesce(nullif(p_split->>'flat','')::numeric, 0));
  v_hilly numeric := greatest(0, coalesce(nullif(p_split->>'hilly','')::numeric, 0));
  v_mountain numeric := greatest(0, coalesce(nullif(p_split->>'mountain','')::numeric, 0));
  v_cobbled numeric := greatest(0, coalesce(nullif(p_split->>'cobbled','')::numeric, 0));
  v_total numeric;
  n_flat numeric;
  n_hilly numeric;
  n_mountain numeric;
  n_cobbled numeric;
begin
  v_total := v_flat + v_hilly + v_mountain + v_cobbled;

  if v_total <= 0 then
    v_flat := case when p_terrain_type='flat' then 100 else 0 end;
    v_hilly := case when p_terrain_type='hilly' then 100 else 0 end;
    v_mountain := case when p_terrain_type='mountain' then 100 else 0 end;
    v_cobbled := case when p_terrain_type='cobbled' then 100 else 0 end;
    v_total := 100;
  end if;

  n_hilly := round((v_hilly / v_total) * 100, 6);
  n_mountain := round((v_mountain / v_total) * 100, 6);
  n_cobbled := round((v_cobbled / v_total) * 100, 6);
  n_flat := round(100 - n_hilly - n_mountain - n_cobbled, 6);

  return jsonb_build_object(
    'flat', n_flat,
    'hilly', n_hilly,
    'mountain', n_mountain,
    'cobbled', n_cobbled
  );
end;
$function$;

create or replace function public.sync_race_stage_profile_metadata_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_summit_finish boolean := false;
  v_split jsonb;
begin
  v_split := public.normalize_race_stage_terrain_split_v1(
    new.terrain_split,
    new.terrain_type
  );

  v_summit_finish :=
    coalesce(new.terrain_type, '') = 'mountain'
    and exists (
      select 1
      from jsonb_array_elements(coalesce(new.mountain_climbs, '[]'::jsonb)) climb
      where abs(
        coalesce(nullif(climb->>'km','')::numeric, -999999)
        - coalesce(new.distance_km, 0)
      ) <= 0.25
      and upper(
        regexp_replace(
          coalesce(climb->>'category', climb->>'kom_category', ''),
          '^CAT(EGORY)?[[:space:]]*',
          '',
          'i'
        )
      ) in ('HC','1','2')
    );

  update public.race_stages stage
  set
    terrain_type = coalesce(new.terrain_type, stage.terrain_type),
    profile_type = coalesce(new.profile_type, stage.profile_type),
    flat_pct = (v_split->>'flat')::numeric,
    hilly_pct = (v_split->>'hilly')::numeric,
    mountain_pct = (v_split->>'mountain')::numeric,
    cobbled_pct = (v_split->>'cobbled')::numeric,
    elevation_gain_m = coalesce(new.elevation_gain_m, stage.elevation_gain_m),
    finish_type = case when v_summit_finish then 'summit_finish' else stage.finish_type end,
    is_summit_finish = case when v_summit_finish then true else stage.is_summit_finish end,
    updated_at = clock_timestamp()
  where stage.id = new.stage_id
    and not exists (
      select 1
      from public.race_stage_authoritative_runs authority
      where authority.stage_id = stage.id
    );

  return new;
end;
$function$;

drop trigger if exists trg_sync_race_stage_profile_metadata_v1
  on public.race_stage_profile_details;

create trigger trg_sync_race_stage_profile_metadata_v1
after insert or update of
  terrain_type,
  profile_type,
  terrain_split,
  elevation_gain_m,
  mountain_climbs,
  distance_km
on public.race_stage_profile_details
for each row
execute function public.sync_race_stage_profile_metadata_v1();

with profile_source as (
  select
    profile.*,
    public.normalize_race_stage_terrain_split_v1(
      profile.terrain_split,
      profile.terrain_type
    ) as normalized_split,
    (
      coalesce(profile.terrain_type,'')='mountain'
      and exists (
        select 1
        from jsonb_array_elements(coalesce(profile.mountain_climbs,'[]'::jsonb)) climb
        where abs(
          coalesce(nullif(climb->>'km','')::numeric, -999999)
          - profile.distance_km
        ) <= 0.25
        and upper(
          regexp_replace(
            coalesce(climb->>'category', climb->>'kom_category', ''),
            '^CAT(EGORY)?[[:space:]]*',
            '',
            'i'
          )
        ) in ('HC','1','2')
      )
    ) as summit_finish
  from public.race_stage_profile_details profile
)
update public.race_stages stage
set
  terrain_type = coalesce(profile.terrain_type, stage.terrain_type),
  profile_type = coalesce(profile.profile_type, stage.profile_type),
  flat_pct = (profile.normalized_split->>'flat')::numeric,
  hilly_pct = (profile.normalized_split->>'hilly')::numeric,
  mountain_pct = (profile.normalized_split->>'mountain')::numeric,
  cobbled_pct = (profile.normalized_split->>'cobbled')::numeric,
  elevation_gain_m = coalesce(profile.elevation_gain_m, stage.elevation_gain_m),
  finish_type = case when profile.summit_finish then 'summit_finish' else stage.finish_type end,
  is_summit_finish = case when profile.summit_finish then true else stage.is_summit_finish end,
  updated_at = clock_timestamp()
from profile_source profile
where profile.stage_id = stage.id
  and not exists (
    select 1
    from public.race_stage_authoritative_runs authority
    where authority.stage_id = stage.id
  )
  and (
    stage.terrain_type is distinct from profile.terrain_type
    or stage.profile_type is distinct from profile.profile_type
    or stage.flat_pct is distinct from (profile.normalized_split->>'flat')::numeric
    or stage.hilly_pct is distinct from (profile.normalized_split->>'hilly')::numeric
    or stage.mountain_pct is distinct from (profile.normalized_split->>'mountain')::numeric
    or stage.cobbled_pct is distinct from (profile.normalized_split->>'cobbled')::numeric
    or stage.elevation_gain_m is distinct from coalesce(profile.elevation_gain_m, stage.elevation_gain_m)
    or (
      profile.summit_finish
      and (
        stage.finish_type is distinct from 'summit_finish'
        or stage.is_summit_finish is distinct from true
      )
    )
  );

comment on function public.normalize_race_stage_terrain_split_v1(jsonb,text) is
'Normalizes profile terrain weights or percentages to safe percentages summing to 100.';
comment on function public.sync_race_stage_profile_metadata_v1() is
'Keeps uncalculated race_stages terrain percentages and summit-finish flags aligned with canonical race_stage_profile_details.';
