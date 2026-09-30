CREATE OR REPLACE FUNCTION public.assign_nations_event_hosts_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_preserved integer:=0;
begin
  select * into v_edition
  from public.nations_competition_editions
  where id=p_edition_id;

  if v_edition.id is null then
    raise exception 'World Nations edition not found.';
  end if;

  -- A selected host is final for that group/Final. Only newly submitted
  -- applications remain eligible for groups that do not yet have a host.
  update public.nations_host_applications
  set status='eligible',updated_at=now()
  where edition_id=v_edition.id
    and status='submitted';

  select coalesce(array_agg(distinct upper(g.host_country_code)), '{}'::text[])
  into v_used_hosts
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  where r.edition_id=v_edition.id
    and g.host_country_code is not null;

  select upper(g.host_country_code)
  into v_previous_host
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  where r.edition_id=v_edition.id
    and g.host_country_code is not null
  order by r.round_index desc,g.group_number desc
  limit 1;

  select count(*)::integer
  into v_preserved
  from public.nations_competition_rounds r
  join public.nations_competition_groups g on g.round_id=r.id
  where r.edition_id=v_edition.id
    and g.host_country_code is not null;

  for v_group in
    select
      g.id,
      g.group_number,
      r.round_index,
      r.round_type
    from public.nations_competition_rounds r
    join public.nations_competition_groups g on g.round_id=r.id
    where r.edition_id=v_edition.id
      and g.host_country_code is null
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
    where id=v_group.id
      and host_country_code is null;

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
    where group_id=v_group.id
      and host_country_code is null;

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

  return jsonb_build_object(
    'edition_id',v_edition.id,
    'group_hosts',true,
    'preserved_groups',v_preserved,
    'newly_assigned_groups',v_assigned
  );
end;
$function$

