-- Prevent production races from reaching the worker with contradictory
-- route markers and scoring catalogues. This never manufactures or deletes points.
create or replace function public.monitor_future_race_scoring_profile_integrity_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
set statement_timeout = '30s'
as $$
declare
  v_game_day date := public.get_current_game_date_date();
  v_issue_count integer := 0;
  v_issue_details jsonb := '[]'::jsonb;
begin
  with stage_sources as (
    select
      s.id as stage_id, s.stage_date, s.stage_format,
      s.stage_number, r.name as race_name,
      coalesce(jsonb_array_length(d.intermediate_sprints), 0) as explicit_sprints,
      coalesce(jsonb_array_length(d.mountain_climbs), 0) as explicit_koms,
      (select count(*)::integer
       from jsonb_array_elements(coalesce(d.route_markers, '[]'::jsonb)) m
       where lower(coalesce(m->>'type', m->>'point_type', '')) like '%sprint%'
         and lower(btrim(coalesce(m->>'label',m->>'title',''))) !~
             '^((intermediate|mid[ -]?course)[[:space:]]+)?(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))$'
      ) as route_sprints,
      (select count(*)::integer
       from jsonb_array_elements(coalesce(d.route_markers, '[]'::jsonb)) m
       where lower(coalesce(m->>'type',m->>'point_type','')) ~ '(kom|climb|mountain)'
      ) as route_koms,
      (select count(*)::integer from public.race_stage_points p
       where p.stage_id=s.id and p.point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
      ) as scored_sprints,
      (select count(*)::integer from public.race_stage_points p
       where p.stage_id=s.id and p.point_type='KOM'
      ) as scored_koms,
      (exists (
        select 1 from jsonb_array_elements(coalesce(d.route_markers,'[]'::jsonb)) m
        where lower(coalesce(m->>'type','')) like '%sprint%'
          and lower(btrim(coalesce(m->>'label',m->>'title',''))) ~
              '^((intermediate|mid[ -]?course)[[:space:]]+)?(time[ -]?(check|split|checkpoint)|timing[ -]?(gate|check|split|point))$'
       ) or exists (
        select 1 from jsonb_array_elements(coalesce(d.intermediate_sprints,'[]'::jsonb)) m
        where lower(coalesce(m->>'points','')) in ('time_check','time_split','timing_gate')
       )) as timing_gate_labelled_sprint
    from public.race_stages s
    join public.race_stage_profile_details d on d.stage_id=s.id
    join public.races r on r.id=s.race_id
    where s.stage_date >= v_game_day - 3
      and coalesce(s.weather_cancelled,false)=false
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id
      )
  ), compared as (
    select *,
      case when explicit_sprints+explicit_koms>0 then explicit_sprints else route_sprints end as profile_sprints,
      case when explicit_sprints+explicit_koms>0 then explicit_koms else route_koms end as profile_koms
    from stage_sources
  )
  select count(*)::integer,
     coalesce(jsonb_agg(jsonb_build_object(
       'stage_id',stage_id,'race_name',race_name,
       'stage_number',stage_number,'stage_date',stage_date,
       'stage_format',stage_format,
       'scoring_sprints',scored_sprints,'profile_sprints',profile_sprints,
       'scoring_koms',scored_koms,'profile_koms',profile_koms,
       'timing_gate_scoring_conflict',timing_gate_labelled_sprint and scored_sprints>0
     ) order by stage_date,stage_id),'[]'::jsonb)
  into v_issue_count,v_issue_details
  from compared
  where profile_sprints<>scored_sprints
     or profile_koms<>scored_koms
     or (timing_gate_labelled_sprint and scored_sprints>0);

  if v_issue_count>0 then
    perform public.raise_system_incident_v1(
      'check:race_stage_scoring_profiles',
      'high',
      'Upcoming race stage scoring/profile mismatch',
      format('%s upcoming or recently due stage(s) have inconsistent route markers and competition scoring; correct source data before calculation.',v_issue_count),
      'business:race-stage-scoring-profiles-v1',
      jsonb_build_object('issue_count',v_issue_count,'stages',v_issue_details,'game_date',v_game_day)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:race-stage-scoring-profiles-v1',
      'Upcoming race route markers and competition scoring catalogues are consistent.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_issue_count>0 then 'warning' else 'ok' end,
    'game_date',v_game_day,'issue_count',v_issue_count,'stages',v_issue_details
  );
end;
$$;

revoke all on function public.monitor_future_race_scoring_profile_integrity_v1()
from public, anon, authenticated;
grant execute on function public.monitor_future_race_scoring_profile_integrity_v1()
to service_role;

do $do$
begin
  if not exists(select 1 from cron.job where jobname='ppm-race-scoring-profile-preflight-v1') then
    perform cron.schedule(
      'ppm-race-scoring-profile-preflight-v1',
      '*/15 * * * *',
      'select public.monitor_future_race_scoring_profile_integrity_v1();'
    );
  end if;
end
$do$;
