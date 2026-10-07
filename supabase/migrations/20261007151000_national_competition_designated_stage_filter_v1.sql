-- Keep multi-stage hidden races reusable while exposing only explicitly
-- designated stages to the three-route National Competition bundle.
--
-- If a stage has national_competition_eligible=false it is excluded.
-- If the race defines national_competition_designated_stage_numbers, only
-- those stages are eligible. Existing races without either marker retain
-- their current behaviour.

begin;

create or replace function public.national_competition_stage_is_eligible_v1(
  p_stage_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when lower(coalesce(s.metadata->>'national_competition_eligible','true'))='false'
        then false
      when jsonb_typeof(r.metadata->'national_competition_designated_stage_numbers')='array'
       and jsonb_array_length(r.metadata->'national_competition_designated_stage_numbers')>0
        then exists (
          select 1
          from jsonb_array_elements_text(
            r.metadata->'national_competition_designated_stage_numbers'
          ) as designated(stage_number)
          where designated.stage_number::integer=s.stage_number
        )
      else true
    end,
    false
  )
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;
$$;

revoke all on function public.national_competition_stage_is_eligible_v1(uuid) from public;
grant execute on function public.national_competition_stage_is_eligible_v1(uuid) to authenticated;


CREATE OR REPLACE FUNCTION public.national_championship_pick_source_stage_v1(p_country_code text, p_season_number integer, p_event_key text, p_exclude_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    and public.national_competition_stage_is_eligible_v1(s.id)
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
$function$
;

CREATE OR REPLACE FUNCTION public.national_championship_pick_source_stage_for_window_v2(p_country_code text, p_season_number integer, p_event_key text, p_window_start date, p_window_end date, p_exclude_stage_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
    and public.national_competition_stage_is_eligible_v1(s.id)
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_nations_host_application_workspace_v3()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_club record;
  v_ctx record;
  v_assoc public.national_associations%rowtype;
  v_current_season integer;
  v_target_season integer;
  v_can_apply boolean:=false;
  v_ttt jsonb:='[]'::jsonb;
  v_flat jsonb:='[]'::jsonb;
  v_mountain jsonb:='[]'::jsonb;
  v_applications jsonb:='[]'::jsonb;
  v_my_apps jsonb:='[]'::jsonb;
  v_route_request jsonb:=null;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select gs.season_number
  into v_current_season
  from public.game_state gs
  where gs.id=true;

  v_target_season:=v_current_season+1;

  select * into v_club
  from private.national_association_eligible_main_club_v1(v_uid);

  if v_club.club_id is not null then
    select * into v_assoc
    from public.national_associations a
    where upper(a.country_code)=upper(v_club.country_code)
    limit 1;
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  v_can_apply:=v_ctx.association_id is not null
    and v_assoc.id is not null
    and v_ctx.association_id=v_assoc.id
    and v_ctx.season_number=v_current_season;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'application_id',h.id,
      'target_season_number',h.target_season_number,
      'association_id',h.association_id,
      'association_name',a.name,
      'country_code',a.country_code,
      'host_scope',h.host_scope,
      'status',h.status,
      'submitted_on',h.submitted_on_game_date
    )
    order by h.host_scope,a.country_code
  ),'[]'::jsonb)
  into v_applications
  from public.nations_future_host_applications h
  join public.national_associations a on a.id=h.association_id
  where h.target_season_number=v_target_season
    and h.status<>'withdrawn';

  if v_assoc.id is not null then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'application_id',h.id,
        'target_season_number',h.target_season_number,
        'host_scope',h.host_scope,
        'status',h.status,
        'ttt_stage_id',h.ttt_stage_id,
        'flat_stage_id',h.flat_stage_id,
        'mountain_stage_id',h.mountain_stage_id,
        'statement',h.statement,
        'submitted_on',h.submitted_on_game_date
      )
      order by h.host_scope
    ),'[]'::jsonb)
    into v_my_apps
    from public.nations_future_host_applications h
    where h.target_season_number=v_target_season
      and h.association_id=v_assoc.id
      and h.status<>'withdrawn';

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_ttt
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=upper(v_assoc.country_code)
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='team_time_trial'
      and s.distance_km between 18 and 48;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_flat
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=upper(v_assoc.country_code)
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='road_race'
      and s.terrain_type='flat'
      and s.distance_km between 140 and 220;

    select coalesce(jsonb_agg(
      jsonb_build_object(
        'stage_id',s.id,
        'stage_name',s.name,
        'race_name',r.name,
        'route_label',concat_ws(' → ',
          nullif(coalesce(s.start_city_name,s.start_city),''),
          nullif(coalesce(s.finish_city_name,s.finish_city),'')
        ),
        'distance_km',s.distance_km,
        'terrain_type',s.terrain_type,
        'stage_format',s.stage_format
      )
      order by r.name,s.stage_number
    ),'[]'::jsonb)
    into v_mountain
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=upper(v_assoc.country_code)
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='road_race'
      and s.terrain_type in ('hilly','mountain')
      and s.distance_km between 135 and 220;

    select jsonb_build_object(
      'request_id',q.id,
      'target_season_number',q.target_season_number,
      'requested_types',to_jsonb(q.requested_types),
      'note',q.note,
      'status',q.status,
      'submitted_on',q.submitted_on_game_date
    )
    into v_route_request
    from public.nations_host_route_requests q
    where q.target_season_number=v_target_season
      and q.association_id=v_assoc.id
      and q.status<>'withdrawn'
    limit 1;
  end if;

  return jsonb_build_object(
    'current_season_number',v_current_season,
    'target_season_number',v_target_season,
    'viewer_can_apply',v_can_apply,
    'viewer_association_id',v_assoc.id,
    'viewer_country_code',v_assoc.country_code,
    'country_has_complete_bundle',
      jsonb_array_length(v_ttt)>0
      and jsonb_array_length(v_flat)>0
      and jsonb_array_length(v_mountain)>0,
    'missing_types',to_jsonb(array_remove(ARRAY[
      case when jsonb_array_length(v_ttt)=0 then 'team_time_trial' end,
      case when jsonb_array_length(v_flat)=0 then 'flat' end,
      case when jsonb_array_length(v_mountain)=0 then 'hilly_mountain' end
    ]::text[],null)),
    'stage_options',jsonb_build_object(
      'team_time_trial',v_ttt,
      'flat',v_flat,
      'hilly_mountain',v_mountain
    ),
    'applications',v_applications,
    'my_applications',v_my_apps,
    'route_request',v_route_request
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_nations_host_application_v3(p_host_scope text, p_ttt_stage_id uuid, p_flat_stage_id uuid, p_mountain_stage_id uuid, p_statement text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_target_season integer;
  v_country text;
  v_id uuid;
  v_valid integer;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  if p_host_scope not in ('qualification','final') then
    raise exception 'Host application scope must be qualification or final.';
  end if;

  if p_ttt_stage_id is null or p_flat_stage_id is null or p_mountain_stage_id is null then
    raise exception 'Exactly three host races are required: one Team Time Trial, one Flat road race and one Hilly/Mountain road race.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  v_target_season:=v_ctx.season_number+1;
  v_country:=upper(v_ctx.country_code);

  select count(*)::integer into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_ttt_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and public.national_competition_stage_is_eligible_v1(s.id)
    and s.stage_format='team_time_trial'
    and s.distance_km between 18 and 48;
  if v_valid<>1 then
    raise exception 'Select a valid Team Time Trial stage from your Association country.';
  end if;

  select count(*)::integer into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_flat_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and public.national_competition_stage_is_eligible_v1(s.id)
    and s.stage_format='road_race'
    and s.terrain_type='flat'
    and s.distance_km between 140 and 220;
  if v_valid<>1 then
    raise exception 'Select a valid Flat road stage from your Association country.';
  end if;

  select count(*)::integer into v_valid
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_mountain_stage_id
    and upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
    and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
    and coalesce((r.metadata->>'national_championship')::boolean,false)=false
    and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
    and public.national_competition_stage_is_eligible_v1(s.id)
    and s.stage_format='road_race'
    and s.terrain_type in ('hilly','mountain')
    and s.distance_km between 135 and 220;
  if v_valid<>1 then
    raise exception 'Select a valid Hilly/Mountain road stage from your Association country.';
  end if;

  insert into public.nations_future_host_applications(
    target_season_number,association_id,submitted_by_user_id,
    host_scope,ttt_stage_id,flat_stage_id,mountain_stage_id,
    statement,status,submitted_on_game_date,updated_at
  )
  values(
    v_target_season,v_ctx.association_id,v_uid,
    p_host_scope,p_ttt_stage_id,p_flat_stage_id,p_mountain_stage_id,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted',public.get_current_game_date_date(),now()
  )
  on conflict(target_season_number,association_id,host_scope) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      ttt_stage_id=excluded.ttt_stage_id,
      flat_stage_id=excluded.flat_stage_id,
      mountain_stage_id=excluded.mountain_stage_id,
      statement=excluded.statement,
      status='submitted',
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  begin
    perform control_center_private.request_admin_module_snapshot('world-nations-hosts',0);
  exception when others then
    null;
  end;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_nations_host_route_request_v1(p_requested_types text[], p_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_target_season integer;
  v_country text;
  v_missing text[]:='{}'::text[];
  v_requested text[];
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid)
  limit 1;

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a race-creation request.';
  end if;

  v_target_season:=v_ctx.season_number+1;
  v_country:=upper(v_ctx.country_code);

  if not exists(
    select 1
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='team_time_trial'
      and s.distance_km between 18 and 48
  ) then
    v_missing:=array_append(v_missing,'team_time_trial');
  end if;

  if not exists(
    select 1
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='road_race'
      and s.terrain_type='flat'
      and s.distance_km between 140 and 220
  ) then
    v_missing:=array_append(v_missing,'flat');
  end if;

  if not exists(
    select 1
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_country
      and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
      and coalesce((r.metadata->>'national_championship')::boolean,false)=false
      and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
      and public.national_competition_stage_is_eligible_v1(s.id)
      and s.stage_format='road_race'
      and s.terrain_type in ('hilly','mountain')
      and s.distance_km between 135 and 220
  ) then
    v_missing:=array_append(v_missing,'hilly_mountain');
  end if;

  select coalesce(array_agg(distinct x order by x),'{}'::text[])
  into v_requested
  from unnest(coalesce(p_requested_types,'{}'::text[])) x
  where x=any(array['team_time_trial','flat','hilly_mountain']::text[])
    and x=any(v_missing);

  if cardinality(v_requested)=0 then
    raise exception 'Select at least one race type that is currently missing for your country.';
  end if;

  insert into public.nations_host_route_requests(
    target_season_number,association_id,submitted_by_user_id,
    requested_types,note,status,submitted_on_game_date,updated_at
  )
  values(
    v_target_season,v_ctx.association_id,v_uid,
    v_requested,nullif(btrim(coalesce(p_note,'')),''),
    'submitted',public.get_current_game_date_date(),now()
  )
  on conflict(target_season_number,association_id) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      requested_types=excluded.requested_types,
      note=excluded.note,
      status='submitted',
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  begin
    perform control_center_private.request_admin_module_snapshot('world-nations-hosts',0);
  exception when others then
    null;
  end;

  return v_id;
end;
$function$
;

commit;
