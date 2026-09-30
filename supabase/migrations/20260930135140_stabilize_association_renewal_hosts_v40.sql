-- Stabilize Association renewal activation and World Nations host reassignment.

create or replace function private.set_national_association_initial_renewal_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_season integer;
begin
  if new.status='active'
     and coalesce(new.renewal_paid_through_season,0)=0
  then
    select season_number into v_season
    from public.game_state
    where id=true;

    new.renewal_paid_through_season:=v_season;
  end if;

  return new;
end;
$function$;

drop trigger if exists national_association_initial_renewal_v1
on public.national_associations;

create trigger national_association_initial_renewal_v1
before insert or update of status
on public.national_associations
for each row
execute function private.set_national_association_initial_renewal_v1();

create or replace function public.assign_nations_event_hosts_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_edition public.nations_competition_editions%rowtype;
  v_group record;
  v_scope text;
  v_application public.nations_host_applications%rowtype;
  v_host_country text;
  v_host_association uuid;
  v_ttt_stage uuid;
  v_flat_stage uuid;
  v_mountain_stage uuid;
  v_previous_host text:=null;
  v_used_hosts text[]:='{}'::text[];
  v_assigned integer:=0;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  update public.nations_host_applications
  set status='eligible',updated_at=now()
  where edition_id=v_edition.id
    and status in ('submitted','eligible','selected');

  for v_group in
    select
      g.id,
      g.group_number,
      r.round_index,
      r.round_type
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    where r.edition_id=v_edition.id
    order by r.round_index,g.group_number
  loop
    perform private.ensure_nations_group_runtime_v1(v_group.id);

    v_scope:=case when v_group.round_type='world_final' then 'final' else 'qualification' end;
    v_application:=null;
    v_host_country:=null;
    v_host_association:=null;
    v_ttt_stage:=null;
    v_flat_stage:=null;
    v_mountain_stage:=null;

    -- Applications are selected deterministically from the current application
    -- set. Re-running the scheduler with the same applications is stable, while
    -- a newly submitted application can participate before hosting is finalized.
    select h.*
    into v_application
    from public.nations_host_applications h
    join public.national_associations a on a.id=h.association_id
    where h.edition_id=v_edition.id
      and h.host_scope=v_scope
      and h.status in ('eligible','selected')
      and a.status='active'
      and h.ttt_stage_id is not null
      and h.flat_stage_id is not null
      and h.mountain_stage_id is not null
    order by
      case when upper(a.country_code)=v_previous_host then 1 else 0 end,
      case when upper(a.country_code)=any(v_used_hosts) then 1 else 0 end,
      md5(v_edition.id::text||':'||v_group.id::text||':'||h.id::text)
    limit 1;

    if v_application.id is not null then
      select upper(country_code) into v_host_country
      from public.national_associations
      where id=v_application.association_id;

      v_host_association:=v_application.association_id;
      v_ttt_stage:=v_application.ttt_stage_id;
      v_flat_stage:=v_application.flat_stage_id;
      v_mountain_stage:=v_application.mountain_stage_id;
    else
      with eligible_country as (
        select
          upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,''))) as country_code
        from public.race_stages s
        join public.races r on r.id=s.race_id
        where coalesce((r.metadata->>'nations_competition')::boolean,false)=false
          and coalesce((r.metadata->>'national_championship')::boolean,false)=false
          and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
          and coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')) is not null
        group by upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))
        having count(*) filter(
          where s.stage_format='team_time_trial'
            and s.distance_km between 18 and 48
        )>0
        and count(*) filter(
          where s.stage_format='road_race'
            and s.terrain_type='flat'
            and s.distance_km between 140 and 220
        )>0
        and count(*) filter(
          where s.stage_format='road_race'
            and s.terrain_type in ('hilly','mountain')
            and s.distance_km between 135 and 220
        )>0
      )
      select country_code
      into v_host_country
      from eligible_country
      order by
        case when country_code=v_previous_host then 1 else 0 end,
        case when country_code=any(v_used_hosts) then 1 else 0 end,
        md5(v_edition.id::text||':'||v_group.id::text||':'||country_code)
      limit 1;

      if v_host_country is null then
        raise exception 'No World Nations host country has a complete TTT, Flat and Hilly/Mountain stage bundle.';
      end if;

      select ce.association_id
      into v_host_association
      from public.nations_competition_entries ce
      where ce.edition_id=v_edition.id
        and upper(ce.country_code)=v_host_country
      limit 1;

      select s.id into v_ttt_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='team_time_trial'
        and s.distance_km between 18 and 48
      order by md5(v_edition.id::text||':'||v_group.id::text||':ttt:'||s.id::text)
      limit 1;

      select s.id into v_flat_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='road_race'
        and s.terrain_type='flat'
        and s.distance_km between 140 and 220
      order by md5(v_edition.id::text||':'||v_group.id::text||':flat:'||s.id::text)
      limit 1;

      select s.id into v_mountain_stage
      from public.race_stages s
      join public.races r on r.id=s.race_id
      where upper(coalesce(nullif(s.host_country_code,''),nullif(r.country_code,'')))=v_host_country
        and coalesce((r.metadata->>'nations_competition')::boolean,false)=false
        and coalesce((r.metadata->>'national_championship')::boolean,false)=false
        and coalesce((r.metadata->>'world_road_championship')::boolean,false)=false
        and s.stage_format='road_race'
        and s.terrain_type in ('hilly','mountain')
        and s.distance_km between 135 and 220
      order by md5(v_edition.id::text||':'||v_group.id::text||':mountain:'||s.id::text)
      limit 1;
    end if;

    update public.nations_competition_groups
    set host_application_id=v_application.id,
        host_association_id=v_host_association,
        host_country_code=v_host_country,
        host_assignment_source=case when v_application.id is null then 'system_bundle' else 'host_application' end,
        updated_at=now()
    where id=v_group.id;

    update public.nations_group_events
    set source_stage_id=case race_type
          when 'team_time_trial' then v_ttt_stage
          when 'flat_road_race' then v_flat_stage
          else v_mountain_stage
        end,
        host_association_id=v_host_association,
        host_country_code=v_host_country,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
          'group_host',true,
          'host_country_code',v_host_country,
          'host_association_id',v_host_association,
          'host_application_id',v_application.id,
          'host_scope',v_scope
        ),
        updated_at=now()
    where group_id=v_group.id;

    if v_application.id is not null then
      update public.nations_host_applications
      set status='selected',updated_at=now()
      where id=v_application.id;
    end if;

    v_previous_host:=v_host_country;
    if not (v_host_country=any(v_used_hosts)) then
      v_used_hosts:=array_append(v_used_hosts,v_host_country);
    end if;
    v_assigned:=v_assigned+1;
  end loop;

  update public.nations_competition_editions
  set host_association_id=null,
      host_country_code=null,
      updated_at=now()
  where id=v_edition.id;

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'group_hosts',true,
    'assigned_groups',v_assigned
  );
end;
$function$;

revoke all on function public.assign_nations_event_hosts_v1(uuid)
from public,anon,authenticated;

create or replace function public.submit_nations_host_application_v2(
  p_edition_id uuid,
  p_host_scope text,
  p_ttt_stage_id uuid,
  p_flat_stage_id uuid,
  p_mountain_stage_id uuid,
  p_statement text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_ctx record;
  v_edition public.nations_competition_editions%rowtype;
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

  select * into v_ctx
  from private.current_national_coach_context_v1(v_uid);

  if v_ctx.association_id is null then
    raise exception 'Only the active National Coach can submit a host application.';
  end if;

  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null or v_edition.season_number<>v_ctx.season_number then
    raise exception 'World Nations edition not found for the current season.';
  end if;

  if v_edition.status not in ('planned','qualification') then
    raise exception 'Host applications are closed for this edition.';
  end if;

  v_country:=upper(v_ctx.country_code);

  select count(*)::integer
  into v_valid
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

  select count(*)::integer
  into v_valid
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

  select count(*)::integer
  into v_valid
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

  insert into public.nations_host_applications(
    edition_id,association_id,submitted_by_user_id,statement,status,
    host_scope,ttt_stage_id,flat_stage_id,mountain_stage_id
  )
  values(
    v_edition.id,v_ctx.association_id,v_uid,
    nullif(btrim(coalesce(p_statement,'')),''),
    'submitted',p_host_scope,p_ttt_stage_id,p_flat_stage_id,p_mountain_stage_id
  )
  on conflict(edition_id,association_id,host_scope) do update
  set submitted_by_user_id=excluded.submitted_by_user_id,
      statement=excluded.statement,
      status='submitted',
      ttt_stage_id=excluded.ttt_stage_id,
      flat_stage_id=excluded.flat_stage_id,
      mountain_stage_id=excluded.mountain_stage_id,
      submitted_on_game_date=public.get_current_game_date_date(),
      updated_at=now()
  returning id into v_id;

  perform public.assign_nations_event_hosts_v1(v_edition.id);

  return v_id;
end;
$function$;

revoke all on function public.submit_nations_host_application_v2(uuid,text,uuid,uuid,uuid,text)
from public,anon;
grant execute on function public.submit_nations_host_application_v2(uuid,text,uuid,uuid,uuid,text)
to authenticated;
