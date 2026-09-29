create or replace function public.game_world_reset_preflight_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_baseline_rows bigint;
  v_baseline_clubs bigint;
  v_missing_clubs bigint;
  v_duplicate_riders bigint;
  v_national_violations bigint;
  v_transition_present boolean;
  v_transition_armed boolean;
  v_transition_functions jsonb;
  v_state jsonb;
  v_clock jsonb;
  v_ready boolean;
begin
  select count(*),count(distinct club_id)
  into v_baseline_rows,v_baseline_clubs
  from public.game_world_reset_s1_competition_baseline_v1;

  select count(*) into v_missing_clubs
  from public.game_world_reset_s1_competition_baseline_v1 b
  left join public.clubs c on c.id=b.club_id
  where c.id is null;

  select count(*) into v_duplicate_riders
  from (
    select rider_id from public.club_riders group by rider_id having count(*)>1
  ) d;

  select count(*) into v_national_violations
  from public.club_roster_country_rules rr
  join public.clubs c on c.id=rr.club_id
  join public.club_riders cr on cr.club_id=c.id
  join public.riders r on r.id=cr.rider_id
  where rr.rule_key='national_team_country_lock_v1'
    and rr.is_active=true
    and c.deleted_at is null
    and r.country_code is distinct from rr.allowed_country_code;

  select exists(
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='season_transition_engine_execute_v2'
  ) into v_transition_present;

  select coalesce(is_armed,false) into v_transition_armed
  from public.season_transition_control_v1 where id=true;

  select coalesce(jsonb_agg(jsonb_build_object(
      'name',p.proname,
      'identity_arguments',pg_get_function_identity_arguments(p.oid),
      'definition_md5',md5(pg_get_functiondef(p.oid))
    ) order by p.proname),'[]'::jsonb)
  into v_transition_functions
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'season_transition_engine_execute_v2','verify_new_season_fresh_state_v1',
    'process_rider_contract_negotiation_rollover_v1','run_ai_roster_season_transition_v1'
  );

  select jsonb_build_object(
    'season',season_number,'month',month_number,'day',day_number,
    'hour',hour_number,'minute',minute_number,'paused',is_paused,
    'tick_version',tick_version,'last_advanced_at',last_advanced_at
  ) into v_state from public.game_state where id=true;

  select jsonb_build_object(
    'base_game_at',base_game_at,'base_season',base_season,
    'speed_multiplier',speed_multiplier,'paused',is_paused
  ) into v_clock from public.game_clock_config where id=true;

  v_ready:=v_baseline_clubs>0
    and v_baseline_rows=v_baseline_clubs
    and v_missing_clubs=0
    and v_duplicate_riders=0
    and v_national_violations=0
    and v_transition_present
    and not coalesce(v_transition_armed,false);

  return jsonb_build_object(
    'status',case when v_ready then 'ready_for_reset' else 'blocked' end,
    'read_only',true,
    'repeatable_reset_preflight',true,
    'target_game_state',jsonb_build_object('season',1,'month',1,'day',1,'hour',1,'minute',0,'paused',true),
    'current_game_state',coalesce(v_state,'{}'::jsonb),
    'game_clock_config',coalesce(v_clock,'{}'::jsonb),
    'canonical_s1_baseline',jsonb_build_object(
      'rows',v_baseline_rows,'distinct_clubs',v_baseline_clubs,'missing_clubs',v_missing_clubs
    ),
    'roster_integrity',jsonb_build_object(
      'duplicate_rider_assignments',v_duplicate_riders,'national_team_violations',v_national_violations
    ),
    'season_transition_engine',jsonb_build_object(
      'present',v_transition_present,'armed',coalesce(v_transition_armed,false),'functions',v_transition_functions,
      'modified_by_preflight',false
    ),
    'runtime_reset_policy',jsonb_build_object(
      'clear_hourly_daily_run_guards',true,
      'clear_daily_backlog',true,
      'clear_race_execution_runs',true,
      'clear_runtime_race_metadata',true,
      'rebase_forward_automation_to','S1 Jan 1 01:00',
      'daily_processing_starts_on','S1 Jan 2',
      'rebase_typescript_engine_to','S1 Jan 1 01:00'
    )
  );
end;
$function$;