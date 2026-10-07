-- Hidden / reserve race pool foundation.
-- Reserve races use the same public.races / public.race_stages /
-- public.race_stage_profile_details model as normal races, but have no
-- scheduled calendar date until a competition explicitly clones/assigns them.

begin;

alter table public.races
  alter column start_date drop not null,
  alter column end_date drop not null;

alter table public.race_stages
  alter column stage_date drop not null;

create table if not exists public.race_reserve_pool (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null unique references public.races(id) on delete cascade,
  country_code text references public.countries(code),
  pool_key text not null default 'hidden',
  active boolean not null default true,
  is_calendar_public boolean not null default false,
  intended_uses text[] not null default array[
    'national_championship',
    'national_association',
    'general_reserve'
  ]::text[],
  difficulty text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint race_reserve_pool_pool_key_chk
    check (pool_key in ('hidden','reserve')),
  constraint race_reserve_pool_difficulty_chk
    check (
      difficulty is null
      or difficulty in ('easy','moderate','hard','very_hard')
    )
);

comment on table public.race_reserve_pool is
  'Registry for unscheduled race templates kept outside the normal calendar. The linked race and stages remain standard race-engine records and can be cloned/assigned by National Championships, National Associations and future special competitions.';

comment on column public.race_reserve_pool.is_calendar_public is
  'False for hidden reserve races. Such races must not be returned by the normal race calendar.';

comment on column public.race_reserve_pool.intended_uses is
  'Systems allowed to use the reserve route, e.g. national_championship, qualification, final, national_association, general_reserve, youth_eligible.';

create index if not exists race_reserve_pool_country_active_idx
  on public.race_reserve_pool(country_code, active);

create index if not exists race_reserve_pool_calendar_visibility_idx
  on public.race_reserve_pool(is_calendar_public, active);

drop trigger if exists trg_race_reserve_pool_set_updated_at on public.race_reserve_pool;
create trigger trg_race_reserve_pool_set_updated_at
before update on public.race_reserve_pool
for each row execute function public.set_updated_at();

alter table public.race_reserve_pool enable row level security;

revoke all on table public.race_reserve_pool from anon, authenticated;

-- Unscheduled reserve stages intentionally have no weather snapshot until
-- they are cloned into a scheduled real competition.
create or replace function public.auto_generate_race_stage_weather_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if coalesce(current_setting('app.season_calendar_clone',true),'')='1' then
    return new;
  end if;

  if new.stage_date is null then
    return new;
  end if;

  perform public.generate_race_stage_weather_v1(new.id,false);
  return new;
end;
$$;

create or replace function public.auto_regenerate_race_stage_weather_v1()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if new.stage_date is null then
    return new;
  end if;

  if
    old.stage_date is distinct from new.stage_date
    or old.host_country_code is distinct from new.host_country_code
    or old.host_city is distinct from new.host_city
    or old.start_city is distinct from new.start_city
    or old.finish_city is distinct from new.finish_city
  then
    perform public.generate_race_stage_weather_v1(new.id, true);
  end if;

  return new;
end;
$$;

-- Normal calendar: reserve races are excluded explicitly, not merely because
-- they happen to have no date.
create or replace function public.get_race_calendar_entries_v1()
returns jsonb
language sql
stable
set search_path = 'public', 'pg_temp'
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', race_data.id,
        'name', race_data.name,
        'short_name', race_data.short_name,
        'country_code', race_data.country_code,
        'host_city', race_data.host_city,
        'category', race_data.category,
        'race_type', race_data.race_type,
        'is_stage_race', race_data.is_stage_race,
        'stage_count', race_data.resolved_stage_count,
        'stored_stage_count', race_data.stored_stage_count,
        'actual_stage_count', race_data.actual_stage_count,
        'first_start_city', race_data.first_start_city,
        'final_finish_city', race_data.final_finish_city,
        'start_date', race_data.start_date,
        'end_date', race_data.end_date,
        'status', race_data.status,
        'description', race_data.description,
        'logo_url', race_data.logo_url,
        'logo_image_url', race_data.logo_url,
        'image_url', race_data.logo_url
      )
      order by race_data.start_date, race_data.name, race_data.id
    ),
    '[]'::jsonb
  )
  from (
    select
      race_row.id,
      race_row.name,
      race_row.short_name,
      race_row.country_code,
      race_row.host_city,
      race_row.category,
      race_row.race_type,
      race_row.is_stage_race,
      race_row.stage_count as stored_stage_count,
      coalesce(stage_summary.actual_stage_count,0) as actual_stage_count,
      case
        when coalesce(stage_summary.actual_stage_count,0)>0
          then stage_summary.actual_stage_count
        else race_row.stage_count
      end as resolved_stage_count,
      stage_summary.first_start_city,
      stage_summary.final_finish_city,
      race_row.start_date,
      race_row.end_date,
      race_row.status,
      race_row.description,
      race_row.logo_url
    from public.races race_row
    left join lateral (
      select
        count(*)::integer as actual_stage_count,
        (array_agg(stage_row.start_city order by stage_row.stage_number))[1]
          as first_start_city,
        (array_agg(stage_row.finish_city order by stage_row.stage_number desc))[1]
          as final_finish_city
      from public.race_stages stage_row
      where stage_row.race_id=race_row.id
    ) stage_summary on true
    where coalesce(race_row.status,'')<>'archived'
      and race_row.start_date is not null
      and race_row.end_date is not null
      and lower(coalesce(race_row.metadata->>'calendar_visibility','public'))<>'hidden'
      and not exists (
        select 1
        from public.race_reserve_pool reserve_row
        where reserve_row.race_id=race_row.id
          and reserve_row.is_calendar_public=false
      )
  ) race_data;
$$;

-- Temporary administrator test view used by the Hidden Races page.
create or replace function public.get_hidden_reserve_races_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_app_admin_v1() then
    raise exception 'Administrator access required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'pool_id', p.id,
        'race_id', r.id,
        'name', r.name,
        'short_name', r.short_name,
        'country_code', coalesce(p.country_code,r.country_code),
        'country_name', c.name,
        'host_city', r.host_city,
        'category', r.category,
        'race_type', r.race_type,
        'stage_count', r.stage_count,
        'status', r.status,
        'active', p.active,
        'is_calendar_public', p.is_calendar_public,
        'pool_key', p.pool_key,
        'intended_uses', to_jsonb(p.intended_uses),
        'difficulty', p.difficulty,
        'pool_notes', p.notes,
        'start_date', r.start_date,
        'end_date', r.end_date,
        'stage_id', s.id,
        'stage_name', s.name,
        'stage_number', s.stage_number,
        'start_city', coalesce(s.start_city_name,s.start_city),
        'finish_city', coalesce(s.finish_city_name,s.finish_city),
        'distance_km', s.distance_km,
        'terrain_type', s.terrain_type,
        'profile_type', s.profile_type,
        'stage_format', s.stage_format,
        'elevation_gain_m', s.elevation_gain_m,
        'flat_pct', s.flat_pct,
        'hilly_pct', s.hilly_pct,
        'mountain_pct', s.mountain_pct,
        'route_label', d.route_label,
        'created_at', p.created_at,
        'updated_at', p.updated_at
      )
      order by coalesce(c.name,coalesce(p.country_code,r.country_code)), r.name, r.id
    ),
    '[]'::jsonb
  )
  into v_result
  from public.race_reserve_pool p
  join public.races r on r.id=p.race_id
  left join public.countries c
    on c.code=coalesce(p.country_code,r.country_code)
  left join lateral (
    select stage.*
    from public.race_stages stage
    where stage.race_id=r.id
    order by stage.stage_number
    limit 1
  ) s on true
  left join public.race_stage_profile_details d on d.stage_id=s.id;

  return v_result;
end;
$$;

revoke all on function public.get_hidden_reserve_races_v1() from public;
grant execute on function public.get_hidden_reserve_races_v1() to authenticated;

-- National Championship route selection prefers an eligible hidden reserve
-- route for the country, then falls back to the existing regular-stage pool.
create or replace function public.national_championship_pick_source_stage_v1(
  p_country_code text,
  p_season_number integer,
  p_event_key text,
  p_exclude_stage_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  v_country text := upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  left join public.race_reserve_pool rp on rp.race_id=r.id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and (
      rp.race_id is null
      or (
        rp.active=true
        and (
          'national_championship'=any(rp.intended_uses)
          or lower(coalesce(p_event_key,''))=any(rp.intended_uses)
          or 'general_reserve'=any(rp.intended_uses)
        )
      )
    )
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    )
  order by
    case
      when rp.race_id is not null and rp.is_calendar_public=false then 0
      else 1
    end,
    md5(
      s.id::text||':'||v_country||':'||
      p_season_number::text||':'||coalesce(p_event_key,'event')
    )
  limit 1;

  return v_stage;
end;
$$;

revoke execute on function public.national_championship_pick_source_stage_v1(text,integer,text,uuid)
  from anon,authenticated;

create or replace function public.national_championship_pick_source_stage_for_window_v2(
  p_country_code text,
  p_season_number integer,
  p_event_key text,
  p_window_start date,
  p_window_end date,
  p_exclude_stage_id uuid default null
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  cfg public.national_championship_config%rowtype;
  v_country text:=upper(trim(coalesce(p_country_code,'')));
  v_stage uuid;
  v_week_start date;
  v_week_end date;
begin
  select * into cfg
  from public.national_championship_config
  where id=true;

  v_week_start:=date_trunc('week',p_window_start::timestamp)::date;
  v_week_end:=date_trunc('week',p_window_end::timestamp)::date+6;

  select s.id
  into v_stage
  from public.race_stages s
  join public.races r on r.id=s.race_id
  left join public.race_reserve_pool rp on rp.race_id=r.id
  where upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))=v_country
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    and (
      rp.race_id is null
      or (
        rp.active=true
        and (
          'national_championship'=any(rp.intended_uses)
          or lower(coalesce(p_event_key,''))=any(rp.intended_uses)
          or 'general_reserve'=any(rp.intended_uses)
        )
      )
    )
    and lower(coalesce(s.stage_format,'road_race')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and lower(coalesce(s.terrain_type,'flat')) not in (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    and s.id is distinct from p_exclude_stage_id
    and coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    and coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    and (
      coalesce(s.distance_km,0)<=0
      or coalesce(s.elevation_gain_m,0)
         <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    )
    and (
      (rp.race_id is not null and rp.is_calendar_public=false)
      or not (
        coalesce(r.end_date,r.start_date)>=v_week_start
        and r.start_date<=v_week_end
      )
    )
  order by
    case
      when rp.race_id is not null and rp.is_calendar_public=false then 0
      else 1
    end,
    md5(
      s.id::text||':'||v_country||':'||p_season_number::text||':'||
      coalesce(p_event_key,'event')||':'||p_window_start::text
    )
  limit 1;

  return v_stage;
end;
$$;

revoke execute on function public.national_championship_pick_source_stage_for_window_v2(text,integer,text,date,date,uuid)
  from anon,authenticated;

commit;
