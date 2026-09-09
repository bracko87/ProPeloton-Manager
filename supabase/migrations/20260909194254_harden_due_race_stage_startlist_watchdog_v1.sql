create table if not exists public.race_engine_due_stage_watchdog_v1 (
  stage_id uuid primary key references public.race_stages(id) on delete cascade,
  race_id uuid not null references public.races(id) on delete cascade,
  stage_start_game_at timestamp without time zone not null,
  calculation_due_game_at timestamp without time zone not null,
  last_checked_game_at timestamp without time zone not null,
  ready boolean not null default false,
  reason text not null default 'unknown',
  readiness jsonb not null default '{}'::jsonb,
  repair_result jsonb not null default '{}'::jsonb,
  first_blocked_at timestamptz,
  last_blocked_at timestamptz,
  blocked_check_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.race_engine_due_stage_watchdog_run_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_now timestamp without time zone := public.get_current_game_timestamp()::timestamp without time zone;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_stage record;
  v_before jsonb;
  v_after jsonb;
  v_repair jsonb;
  v_consistency jsonb;
  v_team_finalize jsonb;
  v_captain_finalize jsonb;
  v_ready boolean;
  v_checked integer := 0;
  v_repaired integer := 0;
  v_blocked integer := 0;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  begin
    perform public.process_due_race_startlist_deadlines_v1();
  exception when others then
    null;
  end;

  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      s.stage_number,
      s.stage_date::timestamp + make_interval(hours=>coalesce(s.planned_start_hour_number,12), mins=>coalesce(s.planned_start_minute,0)) as stage_start_game_at,
      s.stage_date::timestamp + make_interval(hours=>coalesce(s.planned_start_hour_number,12), mins=>coalesce(s.planned_start_minute,0)) - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where not coalesce(s.weather_cancelled,false)
      and s.planned_start_hour_number is not null
      and (s.stage_date::timestamp + make_interval(hours=>coalesce(s.planned_start_hour_number,12), mins=>coalesce(s.planned_start_minute,0))) >= v_control.typescript_activation_game_at
      and (s.stage_date::timestamp + make_interval(hours=>coalesce(s.planned_start_hour_number,12), mins=>coalesce(s.planned_start_minute,0)) - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))) <= v_now
      and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      and not exists (
        select 1 from public.race_stage_simulation_runs sr
        where sr.stage_id=s.id
          and sr.engine_version='race_engine_ts_v1'
          and sr.simulation_mode='deterministic_road_race_v1'
          and sr.status in ('running','completed')
          and coalesce(sr.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
    order by
      case when (s.stage_date::timestamp + make_interval(hours=>coalesce(s.planned_start_hour_number,12), mins=>coalesce(s.planned_start_minute,0))) <= v_now then 0 else 1 end,
      s.stage_date, s.planned_start_hour_number, s.planned_start_minute, s.race_id, s.stage_number
    limit 200
  loop
    v_checked := v_checked + 1;
    v_before := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    v_after := v_before;
    v_repair := '{}'::jsonb;
    v_consistency := '{}'::jsonb;
    v_team_finalize := '{}'::jsonb;
    v_captain_finalize := '{}'::jsonb;

    if not coalesce((v_after->>'ready')::boolean,false) then
      begin
        v_repair := public.race_startlist_engine_self_heal_v1(v_stage.race_id);
      exception when others then
        v_repair := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;
      v_after := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    end if;

    if not coalesce((v_after->>'ready')::boolean,false) then
      begin
        v_consistency := public.repair_race_startlist_consistency_v1(v_stage.race_id);
      exception when others then
        v_consistency := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;
      if coalesce(v_after->>'reason','')='team_list_not_finalized' then
        begin
          v_team_finalize := public.finalize_race_team_list_announcement_v1(v_stage.race_id);
        exception when others then
          v_team_finalize := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
        end;
      end if;
      begin
        v_captain_finalize := public.finalize_race_startlist_captains_v1(v_stage.race_id);
      exception when others then
        v_captain_finalize := jsonb_build_object('status','error','sqlstate',sqlstate,'message',sqlerrm);
      end;
      v_after := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    end if;

    v_ready := coalesce((v_after->>'ready')::boolean,false);
    if v_ready and not coalesce((v_before->>'ready')::boolean,false) then v_repaired := v_repaired + 1; end if;
    if not v_ready then v_blocked := v_blocked + 1; end if;

    insert into public.race_engine_due_stage_watchdog_v1(
      stage_id,race_id,stage_start_game_at,calculation_due_game_at,last_checked_game_at,
      ready,reason,readiness,repair_result,first_blocked_at,last_blocked_at,blocked_check_count,updated_at
    ) values (
      v_stage.stage_id,v_stage.race_id,v_stage.stage_start_game_at,v_stage.calculation_due_game_at,v_now,
      v_ready,coalesce(v_after->>'reason','unknown'),v_after,
      jsonb_build_object('self_heal',v_repair,'consistency',v_consistency,'team_finalize',v_team_finalize,'captain_finalize',v_captain_finalize),
      case when v_ready then null else now() end,
      case when v_ready then null else now() end,
      case when v_ready then 0 else 1 end,
      now()
    )
    on conflict(stage_id) do update set
      race_id=excluded.race_id,
      stage_start_game_at=excluded.stage_start_game_at,
      calculation_due_game_at=excluded.calculation_due_game_at,
      last_checked_game_at=excluded.last_checked_game_at,
      ready=excluded.ready,
      reason=excluded.reason,
      readiness=excluded.readiness,
      repair_result=excluded.repair_result,
      first_blocked_at=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.first_blocked_at else coalesce(public.race_engine_due_stage_watchdog_v1.first_blocked_at, now()) end,
      last_blocked_at=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.last_blocked_at else now() end,
      blocked_check_count=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.blocked_check_count else public.race_engine_due_stage_watchdog_v1.blocked_check_count+1 end,
      updated_at=now();
  end loop;

  return jsonb_build_object('status','completed','current_game_at',v_now,'checked',v_checked,'repaired',v_repaired,'blocked',v_blocked);
end;
$function$;

revoke all on function public.race_engine_due_stage_watchdog_run_v1() from public;
grant execute on function public.race_engine_due_stage_watchdog_run_v1() to service_role;

select cron.unschedule(jobid) from cron.job where jobname='race-engine-due-stage-watchdog-v1';
select cron.schedule('race-engine-due-stage-watchdog-v1','* * * * *','select public.race_engine_due_stage_watchdog_run_v1();');
