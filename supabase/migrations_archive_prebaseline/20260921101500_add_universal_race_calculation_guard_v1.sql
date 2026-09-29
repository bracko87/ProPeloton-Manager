-- Automatic race-calculation self-healing guard.
-- Production-applied on 2026-09-21.
--
-- Runs every five real minutes. Once a road stage is 15 game minutes past its
-- calculation deadline and is still not hidden-calculated/replay-ready, it:
--   * repairs start-list readiness;
--   * invokes stale-lease recovery;
--   * wakes the lifecycle runner;
--   * wakes Pass 1 when appropriate;
--   * wakes Pass 2, whose claim path may use emergency recovery/fallback.
-- Healthy stages are untouched.

create or replace function public.universal_race_calculation_guard_v1()
returns jsonb
language plpgsql
security definer
set search_path = 'public','pg_temp'
as $function$
declare
  v_game_now timestamp without time zone := public.get_current_game_timestamp()::timestamp without time zone;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_stage record;
  v_latest record;
  v_checked integer := 0;
  v_healthy integer := 0;
  v_recovery_needed integer := 0;
  v_runner_kicks integer := 0;
  v_pass1_kicks integer := 0;
  v_pass2_kicks integer := 0;
  v_survival jsonb := '{}'::jsonb;
  v_secret text;
begin
  if not pg_try_advisory_xact_lock(hashtext('universal_race_calculation_guard_v1')::bigint) then
    return jsonb_build_object('status','already_running');
  end if;

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name='universal_race_worker_secret_v1'
  limit 1;

  begin
    perform public.race_engine_due_stage_watchdog_run_v1();
  exception when others then
    null;
  end;

  begin
    v_survival := public.universal_race_stage_survival_recover_v1();
  exception when others then
    v_survival := jsonb_build_object('status','error','message',sqlerrm);
  end;

  for v_stage in
    select
      s.id as stage_id,
      s.race_id,
      r.name as race_name,
      s.stage_number,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone as stage_start_game_at,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
        - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where coalesce(s.stage_format,'road_race')='road_race'
      and not coalesce(s.weather_cancelled,false)
      and public.race_stage_planned_start_game_at_v1(s.id) is not null
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            >= v_control.typescript_activation_game_at
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
            + interval '15 minutes' <= v_game_now
      and public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone
            + interval '30 minutes' >= v_game_now
      and not exists (
        select 1 from public.race_stage_authoritative_runs a
        where a.stage_id=s.id
      )
    order by calculation_due_game_at, s.id
    limit 100
  loop
    v_checked := v_checked + 1;

    select sr.id, sr.status, sr.updated_at, sr.started_at, sr.created_at,
           coalesce(sr.result_summary_json->>'calculation_contract','') as calculation_contract,
           coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
           coalesce(sr.result_summary_json->>'pass2_scenario_mode','') as pass2_scenario_mode
    into v_latest
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_stage.stage_id
    order by sr.created_at desc, sr.id
    limit 1;

    if exists (
      select 1
      from public.race_stage_automation_state a
      where a.stage_id=v_stage.stage_id
        and (
          a.last_status in ('calculated_hidden','replay_live','published','completed')
          or coalesce((a.details->>'manifest_ready')::boolean,false)
        )
    ) then
      v_healthy := v_healthy + 1;
      continue;
    end if;

    v_recovery_needed := v_recovery_needed + 1;

    perform net.http_post(
      url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-runner',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-universal-race-worker-secret',v_secret
      ),
      body := '{"action":"tick"}'::jsonb,
      timeout_milliseconds := 30000
    );
    v_runner_kicks := v_runner_kicks + 1;

    if v_latest.id is not null and (
      v_latest.status='failed'
      or v_latest.survival_phase in (
        'pass1_pending','pass1_resume_claimed','pass1_payload_loading',
        'pass1_started','pass1_resume_failed','pass1_ready_no_scenario'
      )
    ) then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass1-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass1_kicks := v_pass1_kicks + 1;
    end if;

    if v_latest.id is not null then
      perform net.http_post(
        url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-universal-race-worker-secret',v_secret
        ),
        body := '{"action":"tick"}'::jsonb,
        timeout_milliseconds := 30000
      );
      v_pass2_kicks := v_pass2_kicks + 1;

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      )
      values (
        v_stage.stage_id,
        v_stage.race_id,
        v_latest.id,
        'deadline_guard_recovery_kick',
        'calculation_not_ready_15_game_minutes_after_due_time',
        jsonb_build_object(
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'calculation_due_game_at',v_stage.calculation_due_game_at,
          'current_game_at',v_game_now,
          'run_status',v_latest.status,
          'survival_phase',v_latest.survival_phase,
          'calculation_contract',v_latest.calculation_contract,
          'pass2_scenario_mode',v_latest.pass2_scenario_mode
        )
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_game_now,
    'checked',v_checked,
    'healthy',v_healthy,
    'recovery_needed',v_recovery_needed,
    'runner_kicks',v_runner_kicks,
    'pass1_kicks',v_pass1_kicks,
    'pass2_kicks',v_pass2_kicks,
    'survival_recovery',v_survival,
    'model_version','universal_race_calculation_guard_v1'
  );
end;
$function$;

select cron.schedule(
  'universal-race-calculation-guard-v1',
  '*/5 * * * *',
  'select public.universal_race_calculation_guard_v1();'
);
