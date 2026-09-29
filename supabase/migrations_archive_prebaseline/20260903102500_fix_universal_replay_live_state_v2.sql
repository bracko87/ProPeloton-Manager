CREATE OR REPLACE FUNCTION public.get_race_stage_live_state_v1(p_stage_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with lifecycle as (
    select
      state.stage_id,
      state.simulation_run_id,
      state.last_status,
      nullif(state.details ->> 'replay_opened_at_real', '')::timestamptz as replay_opened_at_real,
      nullif(state.details ->> 'replay_closes_at_real', '')::timestamptz as replay_closes_at_real
    from public.race_stage_automation_state state
    where state.stage_id = p_stage_id
    limit 1
  ),
  latest_run as (
    select
      run.id as simulation_run_id,
      run.status as run_status,
      run.created_at
    from public.race_stage_simulation_runs run
    where run.stage_id = p_stage_id
      and run.engine_version = 'race_engine_ts_v1'
      and run.simulation_mode = 'deterministic_road_race_v1'
      and run.status in ('running','completed')
    order by run.created_at desc
    limit 1
  ),
  resolved as (
    select
      coalesce(lifecycle.simulation_run_id, latest_run.simulation_run_id) as simulation_run_id,
      lifecycle.last_status,
      latest_run.run_status,
      coalesce(lifecycle.replay_opened_at_real, latest_run.created_at) as live_started_at,
      coalesce(
        lifecycle.replay_closes_at_real,
        latest_run.created_at + interval '15 minutes'
      ) as live_ends_at
    from (select 1) seed
    left join lifecycle on true
    left join latest_run on true
  )
  select jsonb_build_object(
    'stage_id', p_stage_id,
    'has_simulation', resolved.simulation_run_id is not null,
    'simulation_run_id', resolved.simulation_run_id,
    'live_started_at', resolved.live_started_at,
    'live_ends_at', resolved.live_ends_at,
    'is_live', case
      when resolved.simulation_run_id is null then false
      when resolved.last_status = 'replay_live' and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,
    'results_visible', case
      when resolved.simulation_run_id is null then false
      when resolved.run_status = 'completed' then true
      when resolved.last_status = 'replay_live' and resolved.live_ends_at is not null
        then now() >= resolved.live_ends_at
      else false
    end,
    'speed_locked', case
      when resolved.simulation_run_id is null then false
      when resolved.last_status = 'replay_live' and resolved.live_ends_at is not null
        then now() < resolved.live_ends_at
      else false
    end,
    'progress', case
      when resolved.simulation_run_id is null then 0
      when resolved.run_status = 'completed' then 1
      when resolved.last_status = 'replay_live'
       and resolved.live_started_at is not null
       and resolved.live_ends_at is not null then
        greatest(
          0,
          least(
            1,
            extract(epoch from (now() - resolved.live_started_at)) /
            greatest(1, extract(epoch from (resolved.live_ends_at - resolved.live_started_at)))
          )
        )
      else 0
    end
  )
  from resolved;
$function$;
