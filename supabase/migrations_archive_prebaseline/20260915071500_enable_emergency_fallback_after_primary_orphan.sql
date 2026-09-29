-- Ensure a stage that hangs inside the primary TypeScript race engine cannot
-- repeat the same primary attempt forever. Normal first attempts still use the
-- current primary/template engine. Only a prior watchdog-recovered orphan that
-- reached primary_engine_started switches the next retry to the accepted V5.2
-- emergency sporting fallback already bundled in universal-race-stage-runner.
-- This is generic across flat/hilly/mountain/cobbled and does not alter results
-- for stages whose primary calculation succeeds normally.

create or replace function public.universal_race_stage_survival_mode_v1(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_stage record;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_prior_failed_attempts integer := 0;
  v_authoritative_exists boolean := false;
  v_deadline_reached boolean := false;
  v_latest_failed_id uuid;
  v_latest_error_message text;
  v_latest_result_summary jsonb := '{}'::jsonb;
  v_orphaned_primary_engine boolean := false;
  v_use_fallback boolean := false;
begin
  select s.id as stage_id,
         s.race_id,
         s.stage_date,
         s.planned_start_hour_number,
         s.planned_start_minute
    into v_stage
  from public.race_stages s
  where s.id = p_stage_id;

  if not found then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'use_fallback',false,
      'primary_required',false
    );
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  v_stage_start_game_at := v_stage.stage_date::timestamp
    + make_interval(hours=>coalesce(v_stage.planned_start_hour_number,12),
                    mins=>coalesce(v_stage.planned_start_minute,0));

  select count(*)::integer
    into v_prior_failed_attempts
  from public.race_stage_simulation_runs sr
  where sr.stage_id = p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed';

  select sr.id, sr.error_message, coalesce(sr.result_summary_json, '{}'::jsonb)
    into v_latest_failed_id, v_latest_error_message, v_latest_result_summary
  from public.race_stage_simulation_runs sr
  where sr.stage_id = p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
  order by coalesce(sr.failed_at, sr.updated_at, sr.created_at) desc
  limit 1;

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_authoritative_exists;

  v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';

  v_orphaned_primary_engine :=
    not v_authoritative_exists
    and v_latest_failed_id is not null
    and (
      coalesce(v_latest_result_summary->>'survival_phase','') = 'primary_engine_started'
      or coalesce(v_latest_result_summary#>>'{error_details,reason}','') = 'stale_universal_production_run_without_authoritative_result'
    )
    and coalesce(v_latest_error_message,'') = 'Race calculation survival watchdog recovered an orphaned running claim.';

  v_use_fallback := v_orphaned_primary_engine;

  return jsonb_build_object(
    'status','resolved',
    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'current_game_at',v_current_game_at,
    'stage_start_game_at',v_stage_start_game_at,
    'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes',
    'deadline_reached',v_deadline_reached,
    'prior_failed_attempts',v_prior_failed_attempts,
    'latest_failed_simulation_run_id',v_latest_failed_id,
    'latest_failed_survival_phase',nullif(v_latest_result_summary->>'survival_phase',''),
    'latest_failed_reason',nullif(v_latest_result_summary#>>'{error_details,reason}',''),
    'authoritative_exists',v_authoritative_exists,
    'primary_required',not v_authoritative_exists and not v_use_fallback,
    'retry_with_primary',not v_authoritative_exists and v_prior_failed_attempts > 0 and not v_use_fallback,
    'emergency_fallback_allowed_after_current_primary_failure',not v_authoritative_exists,
    'use_fallback',v_use_fallback,
    'fallback_reason',case
      when v_authoritative_exists then 'authoritative_result_exists'
      when v_orphaned_primary_engine then 'prior_primary_engine_orphaned'
      when v_prior_failed_attempts > 0 then 'retry_primary_after_prior_non_orphan_failure'
      when v_deadline_reached then 'primary_required_at_mandatory_deadline'
      else 'normal_engine_first_attempt'
    end,
    'model_version','race_calculation_survival_fallback_after_orphan_v3'
  );
end;
$function$;
