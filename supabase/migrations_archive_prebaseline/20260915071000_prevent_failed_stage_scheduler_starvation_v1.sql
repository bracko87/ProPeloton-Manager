-- Prevent a repeatedly failing race stage from starving every later due race.
--
-- Sporting behaviour is unchanged. This only changes scheduler priority:
-- stages with a recent failed production attempt are moved behind healthy due stages.
-- The failed stage remains eligible for later retry, but it can no longer monopolize
-- the one-calculation-per-runner-tick queue.

create or replace function public.universal_race_stage_claim_next_due_v1(
  p_worker_id text default 'netlify_phase11b_v1'::text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
  v_readiness jsonb;
  v_repair jsonb;
  v_blocked jsonb := '[]'::jsonb;
  v_survival jsonb;
begin
  v_survival := public.universal_race_stage_survival_recover_v1();

  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','survival',v_survival);
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  for v_stage in
    select stage.id as stage_id,
           stage.race_id,
           race.name as race_name,
           stage.stage_number,
           stage.stage_date,
           stage.planned_start_hour_number,
           stage.planned_start_minute,
           stage.stage_date::timestamp
             + make_interval(
                 hours=>coalesce(stage.planned_start_hour_number,12),
                 mins=>coalesce(stage.planned_start_minute,0)
               ) as stage_start_game_at
    from public.race_stages stage
    join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and (
        stage.stage_date::timestamp
        + make_interval(
            hours=>coalesce(stage.planned_start_hour_number,12),
            mins=>coalesce(stage.planned_start_minute,0)
          )
      ) >= v_control.typescript_activation_game_at
      and (
        stage.stage_date::timestamp
        + make_interval(
            hours=>coalesce(stage.planned_start_hour_number,12),
            mins=>coalesce(stage.planned_start_minute,0)
          )
        - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
      ) <= v_current_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id=stage.id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id=stage.id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','')
              in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '2 minutes'
          and (
            stage.stage_date::timestamp
            + make_interval(
                hours=>coalesce(stage.planned_start_hour_number,12),
                mins=>coalesce(stage.planned_start_minute,0)
              )
          ) > v_current_game_at + interval '15 minutes'
      )
    order by
      -- A stage that has just failed is non-blocking. Keep it retryable, but let
      -- every healthy due stage go first so one broken race cannot freeze the calendar.
      case when exists (
        select 1
        from public.race_stage_simulation_runs recent_failed
        where recent_failed.stage_id=stage.id
          and recent_failed.engine_version='race_engine_ts_v1'
          and recent_failed.simulation_mode='deterministic_road_race_v1'
          and recent_failed.status='failed'
          and recent_failed.failed_at is not null
          and recent_failed.failed_at > clock_timestamp()-interval '10 minutes'
      ) then 1 else 0 end,
      case when (
        stage.stage_date::timestamp
        + make_interval(
            hours=>coalesce(stage.planned_start_hour_number,12),
            mins=>coalesce(stage.planned_start_minute,0)
          )
      ) <= v_current_game_at + interval '15 minutes' then 0 else 1 end,
      stage.stage_date,
      stage.planned_start_hour_number,
      stage.planned_start_minute,
      stage.race_id,
      stage.stage_number
    limit 100
  loop
    v_repair := public.race_startlist_engine_self_heal_v1(v_stage.race_id);
    v_readiness := coalesce(
      v_repair->'readiness_after',
      public.race_startlist_engine_readiness_v1(v_stage.race_id)
    );

    if coalesce((v_readiness->>'ready')::boolean,false) is not true then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'race_name',v_stage.race_name,
        'stage_number',v_stage.stage_number,
        'reason','startlist_engine_not_ready',
        'readiness',v_readiness,
        'repair_result',v_repair
      ));
      continue;
    end if;

    begin
      v_claim := public.universal_race_stage_claim_calculation_v1(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'race_name',v_stage.race_name,
        'stage_number',v_stage.stage_number,
        'reason','claim_exception',
        'sqlstate',sqlstate,
        'message',sqlerrm,
        'repair_result',v_repair
      ));
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_v1'),
        'scheduler_skipped_blocks',v_blocked,
        'startlist_self_heal_applied',
          coalesce((v_repair->>'team_list_repair_attempted')::boolean,false)
          or coalesce((v_repair->>'startlist_repair_attempted')::boolean,false),
        'startlist_self_heal_result',v_repair,
        'survival',v_survival,
        'survival_mode',public.universal_race_stage_survival_mode_v1(v_stage.stage_id)
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked,
    'survival',v_survival
  );
end;
$function$;
