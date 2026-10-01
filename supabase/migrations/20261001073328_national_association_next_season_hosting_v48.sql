
create table if not exists public.nations_future_host_applications (
  id uuid primary key default gen_random_uuid(),
  target_season_number integer not null check (target_season_number >= 1),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  host_scope text not null check (host_scope in ('qualification','final')),
  ttt_stage_id uuid not null references public.race_stages(id) on delete restrict,
  flat_stage_id uuid not null references public.race_stages(id) on delete restrict,
  mountain_stage_id uuid not null references public.race_stages(id) on delete restrict,
  statement text,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected','selected','withdrawn')),
  submitted_on_game_date date not null default public.get_current_game_date_date(),
  materialized_edition_id uuid references public.nations_competition_editions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_season_number, association_id, host_scope)
);

create table if not exists public.nations_host_route_requests (
  id uuid primary key default gen_random_uuid(),
  target_season_number integer not null check (target_season_number >= 1),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  submitted_by_user_id uuid not null references auth.users(id) on delete cascade,
  requested_types text[] not null,
  note text,
  status text not null default 'submitted'
    check (status in ('submitted','planned','completed','rejected','withdrawn')),
  submitted_on_game_date date not null default public.get_current_game_date_date(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(target_season_number, association_id),
  check (
    cardinality(requested_types) between 1 and 3
    and requested_types <@ array['team_time_trial','flat','hilly_mountain']::text[]
  )
);

create index if not exists nations_future_host_apps_season_status_idx
  on public.nations_future_host_applications(target_season_number,status,host_scope);
create index if not exists nations_host_route_requests_season_status_idx
  on public.nations_host_route_requests(target_season_number,status);

alter table public.nations_future_host_applications enable row level security;
alter table public.nations_host_route_requests enable row level security;
revoke all on public.nations_future_host_applications, public.nations_host_route_requests from anon, authenticated;

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


CREATE OR REPLACE FUNCTION private.materialize_future_nations_host_applications_v1(p_edition_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season integer;
  v_inserted integer:=0;
begin
  select season_number into v_season
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_season is null then
    return 0;
  end if;

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status,
    host_scope,ttt_stage_id,flat_stage_id,mountain_stage_id,submitted_on_game_date
  )
  select
    p_edition_id,h.association_id,h.submitted_by_user_id,h.statement,'eligible',
    h.host_scope,h.ttt_stage_id,h.flat_stage_id,h.mountain_stage_id,h.submitted_on_game_date
  from public.nations_future_host_applications h
  where h.target_season_number=v_season
    and h.status in ('submitted','approved','selected')
  on conflict(edition_id,association_id,host_scope) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='eligible',
      ttt_stage_id=excluded.ttt_stage_id,
      flat_stage_id=excluded.flat_stage_id,
      mountain_stage_id=excluded.mountain_stage_id,
      submitted_on_game_date=excluded.submitted_on_game_date,
      updated_at=now();

  get diagnostics v_inserted=row_count;

  update public.nations_future_host_applications
  set materialized_edition_id=p_edition_id,updated_at=now()
  where target_season_number=v_season
    and status in ('submitted','approved','selected');

  return v_inserted;
end;
$function$


CREATE OR REPLACE FUNCTION private.trg_materialize_future_nations_hosts_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform private.materialize_future_nations_host_applications_v1(new.id);
  return new;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_my_national_association_overview_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid:=auth.uid();
  v_base jsonb;
  v_assoc_id uuid;
  v_season integer;
  v_today date;
  v_events jsonb:='[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required.';
  end if;

  v_base:=public.get_my_national_association_overview_v1();

  if coalesce((v_base->>'association_exists')::boolean,false)=false then
    return v_base||jsonb_build_object('upcoming_events','[]'::jsonb);
  end if;

  v_assoc_id:=nullif(v_base->>'association_id','')::uuid;
  v_season:=nullif(v_base->>'season_number','')::integer;
  v_today:=nullif(v_base->>'current_game_date','')::date;

  select coalesce(jsonb_agg(event_payload order by event_date,race_day),'[]'::jsonb)
  into v_events
  from (
    select
      e.event_date,
      e.race_day,
      jsonb_build_object(
        'event_id',e.id,
        'event_type','world_nations',
        'event_date',e.event_date,
        'race_day',e.race_day,
        'race_type',e.race_type,
        'round_label',r.round_label,
        'group_label',g.group_label,
        'cycle_key',e.cycle_key,
        'status',e.status,
        'label',
          r.round_label||' · '||g.group_label||' · '||
          case e.race_type
            when 'team_time_trial' then 'Team Time Trial'
            when 'flat_road_race' then 'Flat Road Race'
            else 'Hilly / Mountain Road Race'
          end,
        'squad',(
          select case
            when s.id is null then null
            else jsonb_build_object(
              'squad_id',s.id,
              'cycle_key',s.cycle_key,
              'status',s.status,
              'squad_size',s.squad_size,
              'confirmed_on',s.confirmed_on_game_date,
              'duty_start_date',s.duty_start_date,
              'duty_end_date',s.duty_end_date,
              'members',coalesce((
                select jsonb_agg(
                  jsonb_build_object(
                    'rider_id',sm.rider_id,
                    'rider_name',sm.rider_name_snapshot,
                    'club_id',sm.club_id_snapshot,
                    'club_name',sm.club_name_snapshot,
                    'squad_role',sm.squad_role
                  )
                  order by sm.rider_name_snapshot
                )
                from public.national_team_squad_members sm
                where sm.squad_id=s.id
              ),'[]'::jsonb)
            )
          end
          from public.national_team_squads s
          where s.association_id=v_assoc_id
            and s.season_number=v_season
            and s.cycle_key=e.cycle_key
            and s.status in ('confirmed','on_duty','completed')
          order by s.updated_at desc
          limit 1
        )
      ) as event_payload
    from public.nations_group_events e
    join public.nations_competition_groups g on g.id=e.group_id
    join public.nations_competition_rounds r on r.id=g.round_id
    join public.nations_competition_editions ed on ed.id=r.edition_id
    join public.nations_group_entries nge on nge.group_id=g.id
    join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
    where ed.season_number=v_season
      and ce.association_id=v_assoc_id
      and nge.status<>'withdrawn'
      and e.event_date is not null
      and e.event_date>=v_today
  ) q;

  return v_base||jsonb_build_object(
    'upcoming_events',v_events
  );
end;
$function$


drop trigger if exists trg_materialize_future_nations_hosts_v1 on public.nations_competition_editions;
create trigger trg_materialize_future_nations_hosts_v1
after insert on public.nations_competition_editions
for each row execute function private.trg_materialize_future_nations_hosts_v1();

grant execute on function public.get_nations_host_application_workspace_v3() to authenticated;
grant execute on function public.submit_nations_host_application_v3(text,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.submit_nations_host_route_request_v1(text[],text) to authenticated;
grant execute on function public.get_my_national_association_overview_v2() to authenticated;
