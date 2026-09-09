create or replace function public.invalidate_race_startlist_captain_finalization_v1()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_race_id uuid;
begin
  v_race_id := coalesce(new.race_id, old.race_id);
  if v_race_id is null then
    return coalesce(new, old);
  end if;

  update public.races r
  set metadata =
        (coalesce(r.metadata, '{}'::jsonb)
          - 'race_startlist_captains_finalized_at'
          - 'race_startlist_captain_model_version')
        || jsonb_build_object(
             'race_startlist_captains_finalized', false,
             'captains_pending_rider_deadline', true,
             'captain_finalization_invalidated_at', clock_timestamp(),
             'captain_finalization_invalidation_source', tg_table_name
           ),
      updated_at = clock_timestamp()
  where r.id = v_race_id
    and lower(coalesce(r.metadata->>'race_startlist_captains_finalized','false')) in ('true','1','yes')
    and r.status in ('scheduled','active')
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_authoritative_runs a on a.stage_id=s.id
      where s.race_id=v_race_id
    )
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_results rr on rr.stage_id=s.id
      where s.race_id=v_race_id
    )
    and not exists (
      select 1
      from public.race_stages s
      join public.race_stage_simulation_runs sr on sr.stage_id=s.id
      where s.race_id=v_race_id
        and sr.status in ('running','completed')
    );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_invalidate_race_captains_on_team_entry_change_v1 on public.race_team_entries;
create trigger trg_invalidate_race_captains_on_team_entry_change_v1
after insert or delete or update of status, club_id, participating_club_id, missed_startlist_at
on public.race_team_entries
for each row execute function public.invalidate_race_startlist_captain_finalization_v1();

drop trigger if exists trg_invalidate_race_captains_on_participant_change_v1 on public.race_participant_riders;
create trigger trg_invalidate_race_captains_on_participant_change_v1
after insert or delete or update of team_id, rider_id
on public.race_participant_riders
for each row execute function public.invalidate_race_startlist_captain_finalization_v1();

create or replace function public.universal_race_stage_claim_next_due_v1(
  p_worker_id text default 'netlify_phase11b_v1'::text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
  v_readiness jsonb;
  v_repair jsonb;
  v_blocked jsonb := '[]'::jsonb;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id=true;

  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  for v_stage in
    select
      stage.id as stage_id,
      stage.race_id,
      race.name as race_name,
      stage.stage_number,
      stage.stage_date,
      stage.planned_start_hour_number,
      stage.planned_start_minute
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
          and coalesce(run.result_summary_json->>'calculation_contract','') in (
            'phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1'
          )
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '10 minutes'
      )
    order by stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,stage.race_id,stage.stage_number
    limit 100
  loop
    v_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
    v_repair := null;

    if coalesce((v_readiness->>'ready')::boolean,false) is not true
       and coalesce(v_readiness->>'reason','')='invalid_team_captains'
    then
      begin
        select public.finalize_race_startlist_captains_v1(v_stage.race_id)
        into v_repair;
        v_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
      exception when others then
        v_blocked := v_blocked || jsonb_build_array(
          jsonb_build_object(
            'stage_id',v_stage.stage_id,
            'race_id',v_stage.race_id,
            'race_name',v_stage.race_name,
            'stage_number',v_stage.stage_number,
            'reason','automatic_captain_repair_failed',
            'readiness',v_readiness,
            'repair_sqlstate',sqlstate,
            'repair_error',sqlerrm
          )
        );
        continue;
      end;
    end if;

    if coalesce((v_readiness->>'ready')::boolean,false) is not true then
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object(
          'stage_id',v_stage.stage_id,
          'race_id',v_stage.race_id,
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'reason','startlist_engine_not_ready',
          'readiness',v_readiness,
          'repair_result',v_repair
        )
      );
      continue;
    end if;

    begin
      v_claim := public.universal_race_stage_claim_calculation_v1(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(
        jsonb_build_object(
          'stage_id', v_stage.stage_id,
          'race_id',v_stage.race_id,
          'race_name',v_stage.race_name,
          'stage_number',v_stage.stage_number,
          'reason','claim_exception',
          'sqlstate', sqlstate,
          'message', sqlerrm
        )
      );
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_v1'),
        'scheduler_skipped_blocks',v_blocked,
        'startlist_self_heal_applied',v_repair is not null,
        'startlist_self_heal_result',v_repair
      );
    end if;
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked
  );
end;
$$;