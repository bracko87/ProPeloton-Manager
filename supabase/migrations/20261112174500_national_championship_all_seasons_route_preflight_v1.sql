-- Permanent National Championship route safeguard for ALL seasons, including
-- a clean restart from Season 1. Hidden/unpublished reserve routes are allowed;
-- time trials, unsuitable terrain, wrong country and disallowed courses are not.
-- Captured from tested production function definitions. No game/race data writes.
--
-- Existing Season 1 historical editions/results are intentionally untouched.
--

-- public.national_championship_source_stage_eligible_v1(uuid,text)
CREATE OR REPLACE FUNCTION public.national_championship_source_stage_eligible_v1(p_stage_id uuid, p_country_code text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
SELECT EXISTS (
  SELECT 1
  FROM public.race_stages s
  JOIN public.races r ON r.id=s.race_id
  JOIN public.national_championship_config cfg ON cfg.id=true
  LEFT JOIN public.race_reserve_pool rp ON rp.race_id=r.id
  WHERE s.id=p_stage_id
    AND upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))
      =upper(trim(p_country_code))
    AND coalesce((r.metadata->>'national_championship')::boolean,false)=false
    AND coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    AND coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
    AND coalesce(s.metadata->>'national_competition_eligible','true')<>'false'
    AND (
      jsonb_typeof(r.metadata->'national_competition_designated_stage_numbers') IS DISTINCT FROM 'array'
      OR jsonb_array_length(r.metadata->'national_competition_designated_stage_numbers')=0
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(
          r.metadata->'national_competition_designated_stage_numbers'
        ) designated(stage_number)
        WHERE designated.stage_number::integer=s.stage_number
      )
    )
    AND (rp.race_id IS NULL OR (
      rp.active=true AND (
         'national_championship'=any(rp.intended_uses)
         OR 'final'=any(rp.intended_uses)
         OR 'final-fallback'=any(rp.intended_uses)
         OR 'general_reserve'=any(rp.intended_uses)
      )
    ))
    AND lower(coalesce(s.stage_format,'road_race')) NOT IN (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    AND lower(coalesce(s.terrain_type,'flat')) NOT IN (
      'individual_time_trial','team_time_trial','prologue','time_trial'
    )
    AND coalesce(s.mountain_pct,0)<=cfg.preferred_route_mountain_pct_max
    AND coalesce(s.elevation_gain_m,0)<=cfg.preferred_route_elevation_gain_max
    AND (
      coalesce(s.distance_km,0)<=0
      OR coalesce(s.elevation_gain_m,0)
        <=coalesce(s.distance_km,0)*cfg.preferred_route_elevation_per_km_max
    )
);
$function$

-- public.national_championship_route_preflight_v1(integer)
CREATE OR REPLACE FUNCTION public.national_championship_route_preflight_v1(p_season_number integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
WITH country_pool AS (
  SELECT DISTINCT upper(trim(country_code)) AS country_code
  FROM public.riders
  WHERE nullif(trim(country_code),'') IS NOT NULL
), checked AS (
  SELECT cp.country_code,n.status AS edition_status,n.route_status,
    CASE
      WHEN n.id IS NULL THEN 'edition_not_created'
      WHEN n.climate_status IS DISTINCT FROM 'ready' THEN 'climate_not_ready'
      WHEN n.route_status IS DISTINCT FROM 'ready' THEN 'route_not_ready'
      WHEN n.final_source_stage_id IS NULL THEN 'source_stage_missing'
      WHEN s.id IS NULL THEN 'source_stage_deleted'
      WHEN upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code))) IS DISTINCT FROM cp.country_code
        THEN 'source_stage_wrong_country'
      WHEN coalesce((r.metadata->>'national_championship')::boolean,false)=true
        OR coalesce(r.metadata->>'national_championship_host_eligibility','allowed')='excluded'
        OR coalesce(s.metadata->>'national_championship_host_eligibility','allowed')='excluded'
        THEN 'source_stage_ineligible'
      WHEN NOT public.national_championship_source_stage_eligible_v1(n.final_source_stage_id,cp.country_code)
        THEN 'source_stage_ineligible'
      ELSE NULL
    END AS reason
  FROM country_pool cp
  LEFT JOIN public.national_championship_editions n
    ON n.country_code=cp.country_code AND n.season_number=p_season_number AND n.discipline='road'
  LEFT JOIN public.race_stages s ON s.id=n.final_source_stage_id
  LEFT JOIN public.races r ON r.id=s.race_id
)
SELECT jsonb_build_object(
 'season_number',p_season_number,
 'ok',count(*) FILTER(WHERE reason IS NOT NULL)=0 AND count(*)>0,
 'expected_countries',count(*),
 'ready_countries',count(*) FILTER(WHERE reason IS NULL),
 'blocked_countries',count(*) FILTER(WHERE reason IS NOT NULL),
 'problems',coalesce(jsonb_agg(jsonb_build_object(
   'country_code',country_code,
   'reason',reason,
   'edition_status',edition_status,
   'route_status',route_status
 ) ORDER BY country_code) FILTER(WHERE reason IS NOT NULL),'[]'::jsonb)
)
FROM checked;
$function$

-- public.national_championship_require_route_before_lock_v1()
CREATE OR REPLACE FUNCTION public.national_championship_require_route_before_lock_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NEW.discipline='road'
    AND NEW.schedule_draw_status='locked'
    AND (TG_OP='INSERT' OR OLD.schedule_draw_status IS DISTINCT FROM 'locked')
  THEN
    IF NEW.route_status IS DISTINCT FROM 'ready'
      OR NEW.climate_status IS DISTINCT FROM 'ready'
      OR NEW.final_source_stage_id IS NULL
      OR NOT public.national_championship_source_stage_eligible_v1(NEW.final_source_stage_id,NEW.country_code)
      OR NOT EXISTS (
        SELECT 1 FROM public.race_stages s
        JOIN public.races r ON r.id=s.race_id
        WHERE s.id=NEW.final_source_stage_id
          AND upper(trim(coalesce(nullif(s.host_country_code,''),r.country_code)))
              =upper(trim(NEW.country_code))
          AND coalesce((r.metadata->>'national_championship')::boolean,false)=false
          AND coalesce(r.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
          AND coalesce(s.metadata->>'national_championship_host_eligibility','allowed')<>'excluded'
      )
    THEN
      RAISE EXCEPTION USING ERRCODE='P0001',
        MESSAGE=format('Cannot lock Season %s national championship for %s: eligible route stage not ready',
          NEW.season_number,NEW.country_code);
    END IF;
  END IF;
  RETURN NEW;
END
$function$

-- public.process_championship_calendar_draw_v1()
CREATE OR REPLACE FUNCTION public.process_championship_calendar_draw_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season integer;
  v_game_date date;
  v_month integer;
  v_batch_size integer:=15;
  v_locked_now integer:=0;
  v_total integer:=0;
  v_locked integer:=0;
  v_world_id uuid;
  v_world_locked boolean:=false;
  v_last_batch date;
  v_health jsonb;
  v_route_preflight jsonb;
  v_expected_editions integer:=0;
  v_existing_editions integer:=0;
  r record;
begin
  select season_number,
         public.game_date_from_parts(season_number,month_number,day_number),
         month_number
  into v_season,v_game_date,v_month
  from public.game_state
  where id=true;

  select count(distinct upper(country_code))::int
  into v_expected_editions
  from public.riders
  where nullif(trim(country_code),'') is not null;

  select count(*)::int
  into v_existing_editions
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  if v_existing_editions<v_expected_editions then
    perform public.ensure_national_championship_editions_for_season_v1(v_season);
  end if;

  -- An old missing-route decision must never be frozen just because the
  -- route library arrived after the initial schedule was created.
  -- Pending editions are safe to refresh; locked/completed history is not.
  if exists (
    select 1
    from public.national_championship_editions nc
    where nc.season_number=v_season
      and nc.discipline='road'
      and nc.status='planned'
      and nc.schedule_draw_status='pending'
      and (nc.route_status is distinct from 'ready'
        or nc.climate_status is distinct from 'ready'
        or nc.final_source_stage_id is null)
  ) then
    perform public.national_championship_refresh_planned_editions_v1(v_season);
  end if;

  -- Fail closed for EVERY season number, including a newly created Season 1.
  -- Do not consume any country slots or lock any national draw until each
  -- represented nationality has a real suitable stage and stored source ID.
  v_route_preflight:=public.national_championship_route_preflight_v1(v_season);
  if coalesce((v_route_preflight->>'ok')::boolean,false)=false then
    raise warning 'National championship draw blocked in Season %: %',
      v_season,v_route_preflight::text;
    return jsonb_build_object(
      'status','blocked_routes',
      'season_number',v_season,
      'game_date',v_game_date,
      'route_preflight',v_route_preflight,
      'locked_this_game_day',0
    );
  end if;

  v_world_id:=public.ensure_world_road_championship_for_season_v1(v_season);

  update public.world_road_championship_editions
  set schedule_draw_status='locked',
      schedule_locked_at=coalesce(schedule_locked_at,now()),
      decision_deadline=least(coalesce(decision_deadline,race_date-10),race_date-10),
      final_confirmation_open_date=coalesce(final_confirmation_open_date,race_date-7),
      final_decision_deadline=coalesce(final_decision_deadline,race_date-3),
      updated_at=now()
  where id=v_world_id
    and schedule_draw_status<>'locked';

  select last_batch_game_date
  into v_last_batch
  from public.championship_calendar_draw_state_v1
  where season_number=v_season;

  -- The normal draw remains limited to 15 countries per January game day.
  if v_month=1 and v_last_batch is distinct from v_game_date then
    for r in
      select id
      from public.national_championship_editions
      where season_number=v_season
        and discipline='road'
        and schedule_draw_status='pending'
        and climate_status='ready'
        and route_status='ready'
      order by md5(v_season::text||':'||country_code)
      limit v_batch_size
    loop
      update public.national_championship_editions
      set schedule_draw_status='locked',
          schedule_drawn_on_game_date=v_game_date,
          schedule_locked_at=now(),
          final_participation_decision_deadline=
            coalesce(final_participation_decision_deadline,final_date-7),
          updated_at=now()
      where id=r.id;
      v_locked_now:=v_locked_now+1;
    end loop;
  elsif v_month<>1 then
    -- Editions can appear later when a newly generated rider introduces a
    -- nationality. Catch up only ready, still-future editions. Dates and any
    -- previously locked schedule are preserved.
    for r in
      select id
      from public.national_championship_editions
      where season_number=v_season
        and discipline='road'
        and schedule_draw_status='pending'
        and climate_status='ready'
        and route_status='ready'
        and final_date>=v_game_date
      order by md5(v_season::text||':'||country_code)
      limit v_batch_size
    loop
      update public.national_championship_editions
      set schedule_draw_status='locked',
          schedule_drawn_on_game_date=v_game_date,
          schedule_locked_at=coalesce(schedule_locked_at,now()),
          final_participation_decision_deadline=
            coalesce(final_participation_decision_deadline,final_date-7),
          updated_at=now()
      where id=r.id
        and schedule_draw_status='pending';
      if found then
        v_locked_now:=v_locked_now+1;
      end if;
    end loop;
  end if;

  select count(*)::int,
         count(*) filter (where schedule_draw_status='locked')::int
  into v_total,v_locked
  from public.national_championship_editions
  where season_number=v_season
    and discipline='road';

  select exists(
    select 1
    from public.world_road_championship_editions
    where season_number=v_season
      and schedule_draw_status='locked'
  ) into v_world_locked;

  insert into public.championship_calendar_draw_state_v1(
    season_number,status,batch_size,total_country_editions,locked_country_editions,
    world_draw_locked,last_batch_game_date,completed_at,last_error
  )
  values(
    v_season,
    case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    v_batch_size,
    v_total,
    v_locked,
    v_world_locked,
    case when v_locked_now>0 then v_game_date else v_last_batch end,
    case when v_locked=v_total and v_world_locked then now() else null end,
    null
  )
  on conflict (season_number) do update
  set status=excluded.status,
      batch_size=excluded.batch_size,
      total_country_editions=excluded.total_country_editions,
      locked_country_editions=excluded.locked_country_editions,
      world_draw_locked=excluded.world_draw_locked,
      last_batch_game_date=coalesce(excluded.last_batch_game_date,public.championship_calendar_draw_state_v1.last_batch_game_date),
      completed_at=coalesce(public.championship_calendar_draw_state_v1.completed_at,excluded.completed_at),
      last_error=null,
      updated_at=now();

  begin
    v_health:=public.championship_calendar_draw_health_check_v1();
  exception when undefined_function then
    v_health:=jsonb_build_object('status','health_check_not_installed_yet');
  end;

  return jsonb_build_object(
    'status',case when v_locked=v_total and v_world_locked then 'completed' else 'in_progress' end,
    'season_number',v_season,
    'game_date',v_game_date,
    'january_only',true,
    'late_catch_up_enabled',true,
    'batch_size',v_batch_size,
    'locked_this_game_day',v_locked_now,
    'country_editions_total',v_total,
    'country_editions_locked',v_locked,
    'world_draw_locked',v_world_locked,
    'health',v_health
  );
end;
$function$

-- Protect every new schedule lock, including non-calendar-draw callers.
DROP TRIGGER IF EXISTS national_championship_require_route_before_lock_v1
  ON public.national_championship_editions;
CREATE TRIGGER national_championship_require_route_before_lock_v1
BEFORE INSERT OR UPDATE OF schedule_draw_status
ON public.national_championship_editions
FOR EACH ROW
EXECUTE FUNCTION public.national_championship_require_route_before_lock_v1();

-- Internal helpers are intentionally not callable by player roles.
REVOKE ALL ON FUNCTION public.national_championship_source_stage_eligible_v1(uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.national_championship_source_stage_eligible_v1(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.national_championship_route_preflight_v1(integer)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.national_championship_route_preflight_v1(integer) TO service_role;
REVOKE ALL ON FUNCTION public.national_championship_require_route_before_lock_v1()
  FROM PUBLIC,anon,authenticated;
