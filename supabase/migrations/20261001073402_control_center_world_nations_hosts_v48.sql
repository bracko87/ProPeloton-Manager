alter function control_center_private.build_admin_module_snapshot(text)
  rename to build_admin_module_snapshot_legacy_v48;

alter function control_center_private.admin_module_status(text)
  rename to admin_module_status_legacy_v48;

CREATE OR REPLACE FUNCTION control_center_private.build_world_nations_hosts_snapshot_v1()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'generated_at',now(),
    'counts',jsonb_build_object(
      'host_applications',(
        select count(*) from public.nations_future_host_applications
        where status<>'withdrawn'
      ),
      'submitted_host_applications',(
        select count(*) from public.nations_future_host_applications
        where status='submitted'
      ),
      'qualification_applications',(
        select count(*) from public.nations_future_host_applications
        where status<>'withdrawn' and host_scope='qualification'
      ),
      'final_applications',(
        select count(*) from public.nations_future_host_applications
        where status<>'withdrawn' and host_scope='final'
      ),
      'race_requests',(
        select count(*) from public.nations_host_route_requests
        where status<>'withdrawn'
      ),
      'submitted_race_requests',(
        select count(*) from public.nations_host_route_requests
        where status='submitted'
      ),
      'needs_admin_attention',(
        (select count(*) from public.nations_future_host_applications where status='submitted')
        +
        (select count(*) from public.nations_host_route_requests where status='submitted')
      )
    ),
    'applications',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.target_season_number desc,x.created_at desc)
      from (
        select
          h.id,
          h.target_season_number,
          h.host_scope,
          h.status,
          h.submitted_on_game_date,
          h.created_at,
          h.updated_at,
          a.name as association_name,
          a.country_code,
          coalesce(c.name,a.country_code) as country_name,
          rt.name as ttt_race_name,
          st.name as ttt_stage_name,
          concat_ws(' → ',nullif(coalesce(st.start_city_name,st.start_city),''),nullif(coalesce(st.finish_city_name,st.finish_city),'')) as ttt_route,
          rf.name as flat_race_name,
          sf.name as flat_stage_name,
          concat_ws(' → ',nullif(coalesce(sf.start_city_name,sf.start_city),''),nullif(coalesce(sf.finish_city_name,sf.finish_city),'')) as flat_route,
          rm.name as mountain_race_name,
          sm.name as mountain_stage_name,
          concat_ws(' → ',nullif(coalesce(sm.start_city_name,sm.start_city),''),nullif(coalesce(sm.finish_city_name,sm.finish_city),'')) as mountain_route,
          h.statement
        from public.nations_future_host_applications h
        join public.national_associations a on a.id=h.association_id
        left join public.countries c on upper(c.code)=upper(a.country_code)
        left join public.race_stages st on st.id=h.ttt_stage_id
        left join public.races rt on rt.id=st.race_id
        left join public.race_stages sf on sf.id=h.flat_stage_id
        left join public.races rf on rf.id=sf.race_id
        left join public.race_stages sm on sm.id=h.mountain_stage_id
        left join public.races rm on rm.id=sm.race_id
        where h.status<>'withdrawn'
        order by h.target_season_number desc,h.created_at desc
        limit 150
      ) x
    ),'[]'::jsonb),
    'race_requests',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.target_season_number desc,x.created_at desc)
      from (
        select
          q.id,
          q.target_season_number,
          q.status,
          q.requested_types,
          q.note,
          q.submitted_on_game_date,
          q.created_at,
          q.updated_at,
          a.name as association_name,
          a.country_code,
          coalesce(c.name,a.country_code) as country_name
        from public.nations_host_route_requests q
        join public.national_associations a on a.id=q.association_id
        left join public.countries c on upper(c.code)=upper(a.country_code)
        where q.status<>'withdrawn'
        order by q.target_season_number desc,q.created_at desc
        limit 150
      ) x
    ),'[]'::jsonb)
  );
$function$


CREATE OR REPLACE FUNCTION control_center_private.build_admin_module_snapshot(p_module_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_module_key='world-nations-hosts' then
    return control_center_private.build_world_nations_hosts_snapshot_v1();
  end if;

  return control_center_private.build_admin_module_snapshot_legacy_v48(p_module_key);
end;
$function$


CREATE OR REPLACE FUNCTION control_center_private.admin_module_status(p_module_key text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count integer:=0;
begin
  if p_module_key='world-nations-hosts' then
    select
      (select count(*) from public.nations_future_host_applications where status='submitted')
      +
      (select count(*) from public.nations_host_route_requests where status='submitted')
    into v_count;

    return case when v_count>0 then 'warning' else 'healthy' end;
  end if;

  return control_center_private.admin_module_status_legacy_v48(p_module_key);
end;
$function$


CREATE OR REPLACE FUNCTION control_center_private.push_admin_modules_safety()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_key text;
begin
  foreach v_key in array array[
    'analytics',
    'system-health',
    'race-operations',
    'migration-process',
    'bug-reports',
    'player-reviews',
    'contact-messages',
    'world-nations-hosts'
  ]
  loop
    begin
      perform control_center_private.request_admin_module_snapshot(v_key,0);
    exception when others then
      null;
    end;
  end loop;
end;
$function$


select control_center_private.request_admin_module_snapshot('world-nations-hosts',0);
