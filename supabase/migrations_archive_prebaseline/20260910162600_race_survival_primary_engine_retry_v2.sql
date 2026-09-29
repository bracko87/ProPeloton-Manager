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

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_authoritative_exists;

  v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';

  return jsonb_build_object(
    'status','resolved',
    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'current_game_at',v_current_game_at,
    'stage_start_game_at',v_stage_start_game_at,
    'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes',
    'deadline_reached',v_deadline_reached,
    'prior_failed_attempts',v_prior_failed_attempts,
    'authoritative_exists',v_authoritative_exists,
    'primary_required',not v_authoritative_exists,
    'retry_with_primary',not v_authoritative_exists and v_prior_failed_attempts > 0,
    'emergency_fallback_allowed_after_current_primary_failure',not v_authoritative_exists,
    'use_fallback',false,
    'fallback_reason',case
      when v_authoritative_exists then 'authoritative_result_exists'
      when v_prior_failed_attempts > 0 then 'retry_primary_after_prior_failure'
      when v_deadline_reached then 'primary_required_at_mandatory_deadline'
      else 'normal_engine_first_attempt'
    end,
    'model_version','race_calculation_survival_primary_retry_v2'
  );
end;
$function$;
