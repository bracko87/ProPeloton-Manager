-- Make a Full Game World Reset also reset all forward/runtime execution memory.

create or replace function public.game_world_reset_clear_runtime_execution_state_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_cleared integer := 0;
begin
  -- Daily/hourly idempotency and backlog state must never survive a full world reset.
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','hourly_game_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_day_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_processor_runs_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_log');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_job_runtime_guard');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','cron_guard_run_log_v1');

  -- Old/legacy race execution run memory. Install/config audit tables are deliberately preserved.
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_scheduler_tick_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_process_runs_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_processor_shadow_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_runner_handoff_history_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_runner_handoff_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_prize_adapter_test_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_stage_ranking_adapter_test_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_prize_finance_execution_run_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_prize_sporting_plan_run_v2');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_engine_phase3aa_report_reconciliation_plan_run_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','universal_race_integration_test_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','race_timeline_rollback_audit_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','rider_health_condition_effect_runs_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','rider_market_daily_runs');

  -- Rebase forward automation to this fresh Season 1 timeline.
  update public.automation_forward_activation_v1
  set activated_at_real = clock_timestamp(),
      activated_game_timestamp = timestamptz '2000-01-01 01:00:00+00',
      activated_game_date = date '2000-01-01',
      daily_processing_starts_on = date '2000-01-02',
      note = 'Fresh Season 1 activation created by Full Game World Reset. Daily processing starts Jan 2; future backlog is never processed early.',
      updated_at = clock_timestamp()
  where id=true;

  -- Rebase the authoritative TypeScript lifecycle too.
  update public.race_engine_runtime_control_v1
  set typescript_activation_game_at = timestamp '2000-01-01 01:00:00',
      updated_at = clock_timestamp(),
      updated_by = 'game_world_reset_v1',
      notes = coalesce(notes,'') || E'\nFull Game World Reset: all runtime execution memory cleared and TypeScript activation rebased to S1 Jan 1 01:00.'
  where singleton_id=true
    and active_engine='typescript_v1'
    and coalesce(typescript_lifecycle_enabled,false)=true;

  -- Legacy automation state is not authoritative, but remove its old-cycle timestamps as well.
  if to_regclass('public.race_stage_automation_settings') is not null then
    update public.race_stage_automation_settings
    set activation_game_at = timestamp '2000-01-01 01:00:00',
        last_processor_at = null,
        last_processor_result = null,
        updated_at = clock_timestamp();
  end if;

  -- Preserve static race metadata, remove only runtime/team-list/startlist markers from prior timelines.
  update public.races
  set metadata = coalesce(metadata,'{}'::jsonb) - array[
        'captains_pending_rider_deadline',
        'team_list_announcement_finalized',
        'team_list_announcement_finalized_at',
        'team_list_announcement_processed',
        'team_list_announcement_processed_at',
        'team_list_announcement_team_count',
        'race_startlist_captain_model_version',
        'race_startlist_captains_finalized',
        'race_startlist_captains_finalized_at',
        'race_startlist_expected_team_count',
        'race_startlist_rider_count',
        'ai_startlist_remaining_unfillable_team_count',
        'ai_startlist_replaced_team_count',
        'ai_startlist_replacement_checked_at',
        'forward_only_terminal_closed_at',
        'forward_only_terminal_closed_on_game_date',
        'forward_only_terminal_closure',
        'forward_only_terminal_closure_reason',
        'test_weather_override',
        'test_weather_override_applied_at',
        'test_weather_override_reason'
      ]::text[],
      updated_at = clock_timestamp()
  where start_date >= date '2000-01-01'
    and start_date < date '2001-01-01';

  return jsonb_build_object(
    'ok',true,
    'cleared_runtime_table_count',v_cleared,
    'forward_activation_game_at','2000-01-01 01:00:00+00',
    'daily_processing_starts_on','2000-01-02',
    'typescript_activation_game_at','2000-01-01 01:00:00'
  );
end;
$function$;

create or replace function public.trg_game_world_reset_clear_runtime_execution_state_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.base_season=1
     and new.base_game_at=timestamp '2000-01-01 01:00:00'
     and new.is_paused=true
     and exists(select 1 from public.game_world_reset_runs r where r.status='source_frozen') then
    perform public.game_world_reset_clear_runtime_execution_state_v1();
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_game_world_reset_clear_runtime_execution_state_v1 on public.game_clock_config;
create trigger trg_game_world_reset_clear_runtime_execution_state_v1
after update of base_game_at,base_season,is_paused on public.game_clock_config
for each row execute function public.trg_game_world_reset_clear_runtime_execution_state_v1();

-- Safe wrapper: never let a stale future backlog row be processed before the live game date.
create or replace function public.process_forward_daily_automation_safe_v2()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_activation public.automation_forward_activation_v1%rowtype;
  v_live_date date;
begin
  select * into v_activation from public.automation_forward_activation_v1 where id=true;
  if not found then
    return jsonb_build_object('status','blocked_missing_forward_activation','success',false);
  end if;

  select public.get_current_game_date_date() into v_live_date;

  if not exists (
    select 1
    from public.game_daily_tick_backlog_v1 b
    where b.status='pending'
      and b.current_game_date >= v_activation.daily_processing_starts_on
      and b.current_game_date <= v_live_date
  ) then
    return jsonb_build_object(
      'status','no_due_live_daily_backlog',
      'success',true,
      'live_game_date',v_live_date,
      'daily_processing_starts_on',v_activation.daily_processing_starts_on
    );
  end if;

  return public.process_forward_daily_automation_v1();
end;
$function$;

do $do$
declare v_jobid bigint;
begin
  select jobid into v_jobid from cron.job where jobname='forward-daily-automation-every-minute' limit 1;
  if v_jobid is not null then
    perform cron.alter_job(v_jobid, command := 'select public.process_forward_daily_automation_safe_v2();');
  end if;
end
$do$;

-- Authoritative TypeScript worker may claim only after the race-wide startlist is finalized.
create or replace function public.universal_race_stage_claim_next_due_v1(p_worker_id text default 'netlify_phase11b_v1')
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_id uuid;
  v_claim jsonb;
begin
  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;

  for v_stage_id in
    select stage.id
    from public.race_stages stage
    join public.races race on race.id=stage.race_id
    where not coalesce(stage.weather_cancelled,false)
      and stage.planned_start_hour_number is not null
      and coalesce((race.metadata->>'team_list_announcement_finalized')::boolean,false)=true
      and coalesce((race.metadata->>'race_startlist_captains_finalized')::boolean,false)=true
      and exists (
        select 1 from public.race_participant_riders pr
        where pr.race_id=stage.race_id
      )
      and (
        stage.stage_date::timestamp
          + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))
      ) >= v_control.typescript_activation_game_at
      and (
        stage.stage_date::timestamp
          + make_interval(hours=>coalesce(stage.planned_start_hour_number,12),mins=>coalesce(stage.planned_start_minute,0))
          - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))
      ) <= v_current_game_at
      and not exists (
        select 1 from public.race_stage_authoritative_runs authority where authority.stage_id=stage.id
      )
      and not exists (
        select 1 from public.race_stage_simulation_runs run
        where run.stage_id=stage.id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','') in (
            'phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1'
          )
      )
      and not exists (
        select 1 from public.race_stage_simulation_runs failed_run
        where failed_run.stage_id=stage.id
          and failed_run.engine_version='race_engine_ts_v1'
          and failed_run.simulation_mode='deterministic_road_race_v1'
          and failed_run.status='failed'
          and failed_run.failed_at is not null
          and failed_run.failed_at > clock_timestamp()-interval '10 minutes'
      )
    order by stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,stage.race_id,stage.stage_number
    limit 20
  loop
    v_claim:=public.universal_race_stage_claim_calculation_v1(v_stage_id);
    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object('worker_id',coalesce(nullif(p_worker_id,''),'netlify_phase11b_v1'));
    end if;
  end loop;

  return jsonb_build_object('status','no_due_stage','current_game_at',v_current_game_at);
end;
$function$;

-- Extend the canonical reset validator so a reset cannot report success while runtime memory is stale.
create or replace function public.game_world_reset_validate_v2()
returns jsonb
language plpgsql
security definer
set search_path to 'public','finance'
as $function$
declare
  v_base jsonb;
  v_bad_club_cash bigint;
  v_bad_account_cash bigint;
  v_bad_summary bigint;
  v_backlog_rows bigint;
  v_hourly_rows bigint;
  v_day_rows bigint;
  v_race_runtime_flags bigint;
  v_forward_activation_bad bigint;
  v_race_activation_bad bigint;
  v_ok boolean;
begin
  v_base:=public.game_world_reset_validate_v1();

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash,
      c.cash_balance
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_club_cash from expected where coalesce(cash_balance,0)<>expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ), acct as (
    select a.club_id,coalesce(ab.balance,0)::numeric as balance
    from finance.accounts a join finance.account_balances ab on ab.account_id=a.id
    where a.currency='CASH' and a.kind='main' and a.club_id is not null
  ) select count(*) into v_bad_account_cash from expected e left join acct a on a.club_id=e.id
    where coalesce(a.balance,0)<>e.expected_cash;

  with expected as (
    select c.id,
      case when c.is_ai or c.owner_user_id is null or c.club_type='developing' then 0::numeric
           else coalesce(tbp.starting_cash_user,0)::numeric end as expected_cash
    from public.clubs c
    join public.game_world_reset_s1_competition_baseline_v1 b on b.club_id=c.id
    left join public.team_tier_balance_profiles tbp on tbp.tier_key=public._get_club_balance_tier_key(c.id)
  ) select count(*) into v_bad_summary from expected e left join public.club_finance_summary s on s.club_id=e.id
    where coalesce(s.current_balance,0)<>e.expected_cash;

  select count(*) into v_backlog_rows from public.game_daily_tick_backlog_v1;
  select count(*) into v_hourly_rows from public.hourly_game_processor_runs;
  select count(*) into v_day_rows from public.game_day_processor_runs;

  select count(*) into v_race_runtime_flags
  from public.races r
  where r.start_date>=date '2000-01-01' and r.start_date<date '2001-01-01'
    and coalesce(r.metadata,'{}'::jsonb) ?| array[
      'team_list_announcement_finalized','team_list_announcement_processed',
      'race_startlist_captains_finalized','captains_pending_rider_deadline',
      'forward_only_terminal_closure'
    ];

  select count(*) into v_forward_activation_bad
  from public.automation_forward_activation_v1 a
  where a.id=true and (
    a.activated_game_date<>date '2000-01-01'
    or a.daily_processing_starts_on<>date '2000-01-02'
    or a.activated_game_timestamp<>timestamptz '2000-01-01 01:00:00+00'
  );

  select count(*) into v_race_activation_bad
  from public.race_engine_runtime_control_v1 c
  where c.singleton_id=true
    and c.active_engine='typescript_v1'
    and coalesce(c.typescript_lifecycle_enabled,false)=true
    and c.typescript_activation_game_at is distinct from timestamp '2000-01-01 01:00:00';

  v_ok:=coalesce((v_base->>'ok')::boolean,false)
        and v_bad_club_cash=0 and v_bad_account_cash=0 and v_bad_summary=0
        and v_backlog_rows=0 and v_hourly_rows=0 and v_day_rows=0
        and v_race_runtime_flags=0 and v_forward_activation_bad=0 and v_race_activation_bad=0;

  return v_base || jsonb_build_object(
    'ok',v_ok,
    'bad_club_starting_cash',v_bad_club_cash,
    'bad_finance_account_starting_cash',v_bad_account_cash,
    'bad_finance_summary_starting_cash',v_bad_summary,
    'runtime_backlog_rows',v_backlog_rows,
    'runtime_hourly_processor_runs',v_hourly_rows,
    'runtime_daily_processor_runs',v_day_rows,
    'runtime_race_metadata_flags',v_race_runtime_flags,
    'forward_activation_bad',v_forward_activation_bad,
    'typescript_activation_bad',v_race_activation_bad
  );
end;
$function$;