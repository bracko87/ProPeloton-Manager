CREATE OR REPLACE FUNCTION public.trg_game_world_reset_rebase_race_engine_activation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.base_season=1
     and new.base_game_at=timestamp '2000-01-01 01:00:00'
     and new.is_paused=true
     and exists(select 1 from public.game_world_reset_runs r where r.status='source_frozen') then
    update public.race_engine_runtime_control_v1
    set typescript_activation_game_at=new.base_game_at,
        updated_at=clock_timestamp(),
        updated_by='game_world_reset_v1',
        notes=coalesce(notes,'') || E'\nFull Game World Reset: TypeScript race lifecycle activation rebased to S1 Jan 1 01:00.'
    where singleton_id=true
      and active_engine='typescript_v1'
      and coalesce(typescript_lifecycle_enabled,false)=true;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_clear_runtime_execution_state_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cleared integer := 0;
begin
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','hourly_game_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_day_processor_runs');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_backlog_processor_runs_v1');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_daily_tick_log');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','game_job_runtime_guard');
  v_cleared := v_cleared + public.game_world_reset_truncate_if_exists_v1('public','cron_guard_run_log_v1');
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

  update public.automation_forward_activation_v1
  set activated_at_real = clock_timestamp(),
      activated_game_timestamp = timestamptz '2000-01-01 01:00:00+00',
      activated_game_date = date '2000-01-01',
      daily_processing_starts_on = date '2000-01-02',
      note = 'Fresh Season 1 activation created by Full Game World Reset. Daily processing starts Jan 2; future backlog is never processed early.',
      updated_at = clock_timestamp()
  where id=true;

  update public.race_engine_runtime_control_v1
  set typescript_activation_game_at = timestamp '2000-01-01 01:00:00',
      updated_at = clock_timestamp(),
      updated_by = 'game_world_reset_v1',
      notes = coalesce(notes,'') || E'\nFull Game World Reset: all runtime execution memory cleared and TypeScript activation rebased to S1 Jan 1 01:00.'
  where singleton_id=true
    and active_engine='typescript_v1'
    and coalesce(typescript_lifecycle_enabled,false)=true;

  if to_regclass('public.race_stage_automation_settings') is not null then
    update public.race_stage_automation_settings
    set activation_game_at = timestamp '2000-01-01 01:00:00',
        last_processor_at = null,
        last_processor_result = '{}'::jsonb,
        updated_at = clock_timestamp();
  end if;

  update public.races
  set metadata = coalesce(metadata,'{}'::jsonb) - array[
        'captains_pending_rider_deadline','team_list_announcement_finalized',
        'team_list_announcement_finalized_at','team_list_announcement_processed',
        'team_list_announcement_processed_at','team_list_announcement_team_count',
        'race_startlist_captain_model_version','race_startlist_captains_finalized',
        'race_startlist_captains_finalized_at','race_startlist_expected_team_count',
        'race_startlist_rider_count','ai_startlist_remaining_unfillable_team_count',
        'ai_startlist_replaced_team_count','ai_startlist_replacement_checked_at',
        'forward_only_terminal_closed_at','forward_only_terminal_closed_on_game_date',
        'forward_only_terminal_closure','forward_only_terminal_closure_reason',
        'test_weather_override','test_weather_override_applied_at','test_weather_override_reason'
      ]::text[],
      updated_at = clock_timestamp()
  where start_date >= date '2000-01-01' and start_date < date '2001-01-01';

  return jsonb_build_object(
    'ok',true,
    'cleared_runtime_table_count',v_cleared,
    'forward_activation_game_at','2000-01-01 01:00:00+00',
    'daily_processing_starts_on','2000-01-02',
    'typescript_activation_game_at','2000-01-01 01:00:00'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_game_world_reset_clear_runtime_execution_state_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.base_season=1
     and new.base_game_at=timestamp '2000-01-01 01:00:00'
     and new.is_paused=true
     and exists(select 1 from public.game_world_reset_runs r where r.status='source_frozen') then
    perform public.game_world_reset_clear_runtime_execution_state_v1();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_forward_daily_automation_safe_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_preflight_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.game_world_reset_execute_v1(p_reset_run_id uuid, p_confirm text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'auth', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_inbox_cleanup jsonb := '{}'::jsonb;
  v_cleanup jsonb := '{}'::jsonb;
  v_validation jsonb;
begin
  -- Keep the already-proven world rebuild as the core operation.
  v_result := public.game_world_reset_execute_core_v1(p_reset_run_id,p_confirm);

  -- Core failures are already audited by the core function. Do not erase
  -- runtime history unless the actual world rebuild succeeded.
  if coalesce((v_result->>'ok')::boolean,false) is not true then
    return v_result;
  end if;

  -- A reset to Season 1 must not retain system inbox broadcasts from a later
  -- season/timeline. Private user-to-user conversations are preserved.
  v_inbox_cleanup := public.inbox_clear_future_season_system_state_v1(1);

  -- A successful full reset must start a fresh execution timeline too.
  v_cleanup := public.game_world_reset_clear_runtime_execution_state_v1();

  -- Revalidate after cleanup/rebase. A failure here aborts the outer statement,
  -- rolling the successful core rebuild back as one atomic reset transaction.
  v_validation := public.game_world_reset_validate_v2();
  if coalesce((v_validation->>'ok')::boolean,false) is not true then
    raise exception 'Post-runtime-cleanup reset validation failed: %',v_validation;
  end if;

  update public.game_world_reset_runs
  set execution_report = coalesce(execution_report,'{}'::jsonb)
        || jsonb_build_object(
          'inbox_cleanup',v_inbox_cleanup,
          'runtime_cleanup',v_cleanup,
          'runtime_cleanup_atomic',true
        ),
      validation_report = v_validation,
      updated_at = clock_timestamp()
  where id=p_reset_run_id;

  return v_result
    || jsonb_build_object(
      'inbox_cleanup',v_inbox_cleanup,
      'runtime_cleanup',v_cleanup,
      'post_runtime_cleanup_validation',v_validation
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sponsor_secondary_offer_balance_guard_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tier text;
  v_min bigint;
  v_max bigint;
  v_factor numeric;
  v_coverage integer;
begin
  if new.sponsor_kind <> 'secondary' or new.status <> 'offered' then
    return new;
  end if;

  select c.club_tier::text into v_tier
  from public.clubs c
  where c.id=new.club_id;

  if v_tier is null then
    return new;
  end if;

  select b.min_amount,b.max_amount into v_min,v_max
  from public.sponsor_secondary_full_guaranteed_bounds_v2(v_tier) b;

  if coalesce(v_max,0)<=0 then
    return new;
  end if;

  if new.full_season_guaranteed_amount is null
     or new.full_season_guaranteed_amount < v_min
     or new.full_season_guaranteed_amount > v_max then
    new.full_season_guaranteed_amount := public.sponsor_roll_secondary_full_guaranteed(v_tier);
  end if;

  v_factor := greatest(0.01,least(1.0,coalesce(new.proration_factor,1.0)));
  v_coverage := greatest(1,coalesce(new.coverage_months,12));

  new.full_season_bonus_pool_amount := 0;
  new.guaranteed_amount := round(new.full_season_guaranteed_amount::numeric * v_factor)::bigint;
  new.bonus_pool_amount := 0;
  new.monthly_amount := round(new.guaranteed_amount::numeric / v_coverage)::bigint;
  new.metadata := coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
    'secondary_economic_model_version','v2_rebalanced_tier_ranges',
    'secondary_full_season_min',v_min,
    'secondary_full_season_max',v_max,
    'secondary_balance_guard_applied_at',now()
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.equipment_ensure_starter_race_supplies_for_club_v1(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_club record;
  v_game_date date;
  v_supply record;
  v_catalog record;
  v_current integer;
  v_delta integer;
  v_total_granted integer := 0;
  v_items jsonb := '[]'::jsonb;
begin
  select c.id,c.owner_user_id,coalesce(c.is_ai,false) as is_ai,
         coalesce(c.club_type,'main') as club_type,c.deleted_at
  into v_club
  from public.clubs c
  where c.id=p_club_id;

  if not found then
    raise exception 'Club not found: %',p_club_id;
  end if;

  -- Starter race-supply stock belongs only to active user-owned main teams.
  -- Developing teams use the main-team resource pool; AI teams keep their own policy.
  if v_club.deleted_at is not null
     or v_club.owner_user_id is null
     or v_club.is_ai
     or v_club.club_type <> 'main' then
    return jsonb_build_object(
      'ok',true,
      'club_id',p_club_id,
      'eligible',false,
      'total_granted',0
    );
  end if;

  v_game_date := public.get_current_game_date_date();

  for v_supply in
    select * from (values
      ('bidons_water_bottles'::text,50::integer),
      ('energy_gels'::text,50::integer),
      ('nutrition_packs'::text,30::integer),
      ('race_jersey_complete'::text,10::integer),
      ('rain_jackets'::text,10::integer)
    ) as x(supply_key,baseline_quantity)
  loop
    select ec.display_name,ec.brand_company_id,ec.item_key
    into v_catalog
    from public.equipment_catalog ec
    where ec.equipment_kind='race_supply'
      and ec.equipment_category=v_supply.supply_key
      and ec.is_active=true
    order by ec.base_price_cash asc,ec.display_name asc
    limit 1;

    if v_catalog.display_name is null then
      raise exception 'Active race supply catalog item missing for %',v_supply.supply_key;
    end if;

    select crs.quantity_available
    into v_current
    from public.club_race_supplies crs
    where crs.club_id=p_club_id
      and crs.supply_key=v_supply.supply_key
    for update;

    if not found then
      v_current := 0;
      v_delta := v_supply.baseline_quantity;

      insert into public.club_race_supplies(
        club_id,supply_key,display_name,preferred_brand_company_id,
        quantity_available,total_purchased,total_used,
        last_purchased_game_date,last_used_game_date,metadata
      ) values (
        p_club_id,v_supply.supply_key,v_catalog.display_name,v_catalog.brand_company_id,
        v_supply.baseline_quantity,0,0,
        null,null,
        jsonb_build_object(
          'starter_race_supply',true,
          'starter_race_supply_version','starter_race_supplies_v1',
          'starter_baseline_quantity',v_supply.baseline_quantity,
          'starter_granted_quantity_total',v_delta,
          'starter_last_grant_delta',v_delta,
          'starter_granted_game_date',v_game_date,
          'starter_granted_at',now(),
          'catalog_item_key',v_catalog.item_key,
          'grant_cost_cash',0
        )
      );
    else
      v_delta := greatest(v_supply.baseline_quantity-coalesce(v_current,0),0);

      if v_delta>0 then
        update public.club_race_supplies crs
        set quantity_available=v_supply.baseline_quantity,
            display_name=v_catalog.display_name,
            preferred_brand_company_id=coalesce(crs.preferred_brand_company_id,v_catalog.brand_company_id),
            metadata=coalesce(crs.metadata,'{}'::jsonb) || jsonb_build_object(
              'starter_race_supply',true,
              'starter_race_supply_version','starter_race_supplies_v1',
              'starter_baseline_quantity',v_supply.baseline_quantity,
              'starter_granted_quantity_total',
                coalesce(nullif(crs.metadata->>'starter_granted_quantity_total','')::integer,0)+v_delta,
              'starter_last_grant_delta',v_delta,
              'starter_granted_game_date',v_game_date,
              'starter_granted_at',now(),
              'catalog_item_key',v_catalog.item_key,
              'grant_cost_cash',0
            ),
            updated_at=now()
        where crs.club_id=p_club_id
          and crs.supply_key=v_supply.supply_key;
      end if;
    end if;

    v_total_granted := v_total_granted+v_delta;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'supply_key',v_supply.supply_key,
      'baseline_quantity',v_supply.baseline_quantity,
      'quantity_before',v_current,
      'granted_quantity',v_delta,
      'quantity_after',greatest(coalesce(v_current,0),v_supply.baseline_quantity)
    ));
  end loop;

  -- Jerseys and rain jackets are durable supply units. Keep unit rows aligned
  -- with the summary quantities so race preparation/engine availability is exact.
  perform 1
  from public.sync_race_supply_units_from_summary_v1(p_club_id);

  return jsonb_build_object(
    'ok',true,
    'club_id',p_club_id,
    'eligible',true,
    'starter_version','starter_race_supplies_v1',
    'total_granted',v_total_granted,
    'items',v_items
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.referral_notify_reward_v1(p_user_id uuid, p_referral_id uuid, p_reward_coins integer, p_reward_kind text, p_conversion_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type_id bigint;
  v_notification_id bigint;
  v_message text;
begin
  select id into v_type_id
  from public.notification_types
  where code = 'REFERRAL_REWARD_GRANTED'
    and is_active = true
  limit 1;

  if v_type_id is null then
    return;
  end if;

  if p_reward_kind = 'activity' then
    v_message := 'Your invited friend became an active player. You received ' || p_reward_coins || ' coins.';
  else
    v_message := 'Your invited friend completed their first paid conversion (' ||
      case when p_conversion_type = 'premium' then 'Premium' else 'Coin package' end ||
      '). You received ' || p_reward_coins || ' coins.';
  end if;

  insert into public.notifications (
    type_id, title, message, source, created_by_user_id,
    action_url, payload_json, expires_at, created_at
  ) values (
    v_type_id,
    'Referral reward received',
    v_message,
    'game',
    null,
    '/dashboard/invite-friends',
    jsonb_build_object(
      'system_key', 'referral_reward_notification_' || p_reward_kind || '_' || p_referral_id::text,
      'club_referral_id', p_referral_id,
      'reward_coins', p_reward_coins,
      'reward_kind', p_reward_kind,
      'conversion_type', p_conversion_type
    ),
    null,
    now()
  ) returning id into v_notification_id;

  insert into public.user_notifications (
    user_id, notification_id, status, read_at, deleted_at, created_at
  ) values (
    p_user_id, v_notification_id, 'unread', null, null, now()
  ) on conflict (user_id, notification_id) do nothing;
exception
  when others then
    -- Referral reward must never be rolled back because a notification failed.
    raise warning 'Referral reward notification failed for referral %: %', p_referral_id, sqlerrm;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.grant_referral_paid_conversion_reward_v1(p_user_id uuid, p_conversion_type text, p_conversion_system_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_referral public.club_referrals%rowtype;
  v_referrer_user_id uuid;
  v_reward_coins integer;
  v_reward_system_key text;
begin
  if p_user_id is null then return false; end if;
  if p_conversion_type not in ('coin_package','premium') then
    raise exception 'Unsupported referral conversion type: %', p_conversion_type;
  end if;

  select * into v_referral
  from public.club_referrals
  where referred_user_id = p_user_id
    and status <> 'rejected'
  order by created_at asc
  limit 1
  for update;

  if v_referral.id is null then return false; end if;

  -- Exactly one 40-coin paid conversion reward per referred user.
  if v_referral.reward_granted_at is not null then return false; end if;

  select c.owner_user_id into v_referrer_user_id
  from public.clubs c
  where c.id = v_referral.referrer_club_id
    and c.deleted_at is null
    and c.is_ai = false
    and c.club_type = 'main'
    and c.owner_user_id is not null
  limit 1;

  if v_referrer_user_id is null then
    update public.club_referrals
    set status = 'rejected'
    where id = v_referral.id;
    return false;
  end if;

  v_reward_coins := coalesce(v_referral.reward_coins, 40);
  v_reward_system_key := 'referral_paid_reward_' || v_referral.id::text;

  perform public.apply_coin_delta(
    v_referrer_user_id,
    v_reward_coins,
    'referral_reward',
    jsonb_build_object(
      'system_key', v_reward_system_key,
      'club_referral_id', v_referral.id,
      'referred_user_id', p_user_id,
      'conversion_type', p_conversion_type,
      'conversion_system_key', p_conversion_system_key
    )
  );

  update public.club_referrals
  set
    status = 'completed',
    completed_at = coalesce(completed_at, now()),
    reward_granted_at = coalesce(reward_granted_at, now()),
    paid_conversion_type = coalesce(paid_conversion_type, p_conversion_type),
    paid_conversion_at = coalesce(paid_conversion_at, now()),
    paid_conversion_system_key = coalesce(paid_conversion_system_key, p_conversion_system_key),
    qualifying_purchase_at = case
      when p_conversion_type = 'coin_package' then coalesce(qualifying_purchase_at, now())
      else qualifying_purchase_at
    end,
    qualifying_purchase_system_key = case
      when p_conversion_type = 'coin_package' then coalesce(qualifying_purchase_system_key, p_conversion_system_key)
      else qualifying_purchase_system_key
    end
  where id = v_referral.id;

  perform public.referral_notify_reward_v1(
    v_referrer_user_id,
    v_referral.id,
    v_reward_coins,
    'paid',
    p_conversion_type
  );

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.referral_try_paid_conversion_from_history_v1(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_coin_at timestamptz;
  v_coin_key text;
  v_premium_at timestamptz;
  v_premium_key text;
begin
  if p_user_id is null then return false; end if;

  if exists (
    select 1 from public.club_referrals r
    where r.referred_user_id = p_user_id
      and r.reward_granted_at is not null
  ) then
    return false;
  end if;

  select l.created_at, l.payload_json->>'system_key'
  into v_coin_at, v_coin_key
  from public.user_coin_ledger l
  where l.user_id = p_user_id
    and l.reason = 'purchase'
    and l.delta > 0
  order by l.created_at asc
  limit 1;

  select p.processed_at, 'stripe_invoice_' || p.stripe_invoice_id
  into v_premium_at, v_premium_key
  from public.premium_invoice_payments p
  where p.user_id = p_user_id
    and coalesce(p.amount_paid_cents,0) > 0
  order by p.processed_at asc
  limit 1;

  if v_coin_at is null and v_premium_at is null then return false; end if;

  if v_premium_at is not null and (v_coin_at is null or v_premium_at <= v_coin_at) then
    return public.grant_referral_paid_conversion_reward_v1(p_user_id, 'premium', v_premium_key);
  end if;

  return public.grant_referral_paid_conversion_reward_v1(p_user_id, 'coin_package', v_coin_key);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.referral_record_activity_day_v1(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_referral public.club_referrals%rowtype;
  v_today date := (now() at time zone 'UTC')::date;
  v_day_count integer := 0;
  v_referrer_user_id uuid;
  v_month_reward_count integer := 0;
  v_reward_system_key text;
  v_email_confirmed boolean := false;
begin
  select * into v_referral
  from public.club_referrals
  where referred_user_id = p_user_id
    and status <> 'rejected'
  order by created_at asc
  limit 1
  for update;

  if v_referral.id is null then
    return jsonb_build_object('tracked', false, 'reason', 'no_referral');
  end if;

  -- Referred account must be verified and still own an active real main club.
  select (u.email_confirmed_at is not null)
  into v_email_confirmed
  from auth.users u
  where u.id = p_user_id;

  if not coalesce(v_email_confirmed,false)
     or not exists (
       select 1 from public.clubs c
       where c.id = v_referral.referred_club_id
         and c.owner_user_id = p_user_id
         and c.deleted_at is null
         and c.is_ai = false
         and c.club_type = 'main'
     ) then
    update public.club_referrals
    set activity_reward_status = 'ineligible'
    where id = v_referral.id
      and activity_reward_status = 'pending';
    return jsonb_build_object('tracked', false, 'reason', 'referred_club_not_eligible');
  end if;

  insert into public.referral_activity_days (referral_id, referred_user_id, activity_date)
  values (v_referral.id, p_user_id, v_today)
  on conflict (referral_id, activity_date) do nothing;

  select count(*) into v_day_count
  from public.referral_activity_days d
  where d.referral_id = v_referral.id;

  update public.club_referrals
  set activity_day_count = v_day_count
  where id = v_referral.id;

  if v_day_count < 3 or v_referral.activity_reward_status <> 'pending' then
    return jsonb_build_object(
      'tracked', true,
      'activity_days', v_day_count,
      'activity_reward_status', v_referral.activity_reward_status
    );
  end if;

  update public.club_referrals
  set activity_qualified_at = coalesce(activity_qualified_at, now())
  where id = v_referral.id;

  select c.owner_user_id into v_referrer_user_id
  from public.clubs c
  where c.id = v_referral.referrer_club_id
    and c.deleted_at is null
    and c.is_ai = false
    and c.club_type = 'main'
    and c.owner_user_id is not null
  limit 1;

  if v_referrer_user_id is null then
    update public.club_referrals
    set activity_reward_status = 'ineligible'
    where id = v_referral.id;
    return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'ineligible');
  end if;

  select count(*) into v_month_reward_count
  from public.user_coin_ledger l
  where l.user_id = v_referrer_user_id
    and l.reason = 'referral_activity_reward'
    and l.delta > 0
    and l.created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC'
    and l.created_at < (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';

  if v_month_reward_count >= 10 then
    update public.club_referrals
    set activity_reward_status = 'capped'
    where id = v_referral.id;
    return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'capped');
  end if;

  v_reward_system_key := 'referral_activity_reward_' || v_referral.id::text;

  perform public.apply_coin_delta(
    v_referrer_user_id,
    coalesce(v_referral.activity_reward_coins,2),
    'referral_activity_reward',
    jsonb_build_object(
      'system_key', v_reward_system_key,
      'club_referral_id', v_referral.id,
      'referred_user_id', p_user_id,
      'activity_days', v_day_count,
      'monthly_reward_number', v_month_reward_count + 1
    )
  );

  update public.club_referrals
  set
    activity_reward_status = 'granted',
    activity_reward_granted_at = coalesce(activity_reward_granted_at, now())
  where id = v_referral.id;

  perform public.referral_notify_reward_v1(
    v_referrer_user_id,
    v_referral.id,
    coalesce(v_referral.activity_reward_coins,2),
    'activity',
    null
  );

  return jsonb_build_object('tracked', true, 'activity_days', v_day_count, 'activity_reward_status', 'granted');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_premium_invoice_referral_reward_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform public.grant_referral_paid_conversion_reward_v1(
      new.user_id,
      'premium',
      'stripe_invoice_' || new.stripe_invoice_id
    );
  exception
    when others then
      -- Never fail a Premium payment because referral bookkeeping failed.
      raise warning 'Premium referral reward failed for user % invoice %: %', new.user_id, new.stripe_invoice_id, sqlerrm;
  end;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_create_club_house_rebate_v1(p_club_id uuid, p_source_transaction_id uuid, p_transaction_type text, p_base_amount bigint, p_rate_bps integer, p_source_system_code text DEFAULT 'SINK'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_amount bigint;
  v_existing uuid;
  v_tx uuid;
  v_club_account uuid;
  v_source_account uuid;
  v_source_metadata jsonb := '{}'::jsonb;
begin
  if p_club_id is null or p_source_transaction_id is null or coalesce(p_base_amount,0)<=0 or coalesce(p_rate_bps,0)<=0 then
    return jsonb_build_object('ok',true,'created',false,'amount',0);
  end if;

  v_amount := round((p_base_amount::numeric * p_rate_bps::numeric)/10000.0)::bigint;
  if v_amount<=0 then
    return jsonb_build_object('ok',true,'created',false,'amount',0);
  end if;

  select t.id into v_existing
  from finance.transactions t
  where t.idempotency_key='club_house_rebate:'||p_transaction_type||':'||p_source_transaction_id::text
  limit 1;

  if v_existing is not null then
    return jsonb_build_object('ok',true,'created',false,'already_exists',true,'transaction_id',v_existing,'amount',v_amount);
  end if;

  select coalesce(t.metadata,'{}'::jsonb) into v_source_metadata
  from finance.transactions t where t.id=p_source_transaction_id;

  v_club_account := public.finance_get_or_create_club_account(p_club_id,'CASH','main');
  v_source_account := public.finance_get_or_create_system_account(p_source_system_code,'CASH','main');

  insert into finance.transactions(type,idempotency_key,metadata)
  values(
    p_transaction_type,
    'club_house_rebate:'||p_transaction_type||':'||p_source_transaction_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'club_id',p_club_id,
      'source_transaction_id',p_source_transaction_id,
      'base_amount',p_base_amount,
      'rate_bps',p_rate_bps,
      'rebate_amount',v_amount,
      'source','club_house_financial_benefit',
      'game_date',v_source_metadata->'game_date',
      'in_game_date',v_source_metadata->'in_game_date',
      'week_key',v_source_metadata->>'week_key'
    ))
  ) returning id into v_tx;

  insert into finance.entries(transaction_id,account_id,amount,memo)
  values
    (v_tx,v_source_account,-v_amount,'Club House benefit funded'),
    (v_tx,v_club_account,v_amount,'Club House financial benefit');

  return jsonb_build_object('ok',true,'created',true,'transaction_id',v_tx,'amount',v_amount,'rate_bps',p_rate_bps);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_apply_club_house_transaction_savings_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_base bigint := 0;
  v_rate integer := 0;
  v_type text;
  v_effect record;
begin
  if new.type not in (
    'staff_salary_payday','rider_salary_payday',
    'team_policy_housing_cost','team_policy_nutrition_cost',
    'team_policy_recovery_support_cost','team_policy_logistics_cost'
  ) then
    return new;
  end if;

  begin
    v_club_id := coalesce(
      nullif(new.metadata->>'finance_club_id','')::uuid,
      nullif(new.metadata->>'charged_club_id','')::uuid,
      nullif(new.metadata->>'club_id','')::uuid
    );

    if v_club_id is null and new.type like 'team_policy_%' then
      v_club_id := nullif(split_part(coalesce(new.idempotency_key,''),':',2),'')::uuid;
    end if;
  exception when others then
    return new;
  end;

  if v_club_id is null then return new; end if;

  select * into v_effect from public.get_club_house_finance_effects(v_club_id);
  if not found then return new; end if;

  if new.type='staff_salary_payday' then
    v_base := coalesce((new.metadata->>'total_wages')::numeric,0)::bigint;
    v_rate := coalesce(v_effect.staff_payroll_discount_bps,0);
    v_type := 'club_house_staff_payroll_saving';
  elsif new.type='rider_salary_payday' then
    v_base := coalesce((new.metadata->>'total_wages')::numeric,0)::bigint;
    v_rate := coalesce(v_effect.rider_payroll_discount_bps,0);
    v_type := 'club_house_rider_payroll_saving';
  else
    v_base := case new.type
      when 'team_policy_housing_cost' then coalesce((new.metadata->>'housing_weekly_cost')::numeric,0)::bigint
      when 'team_policy_nutrition_cost' then coalesce((new.metadata->>'nutrition_weekly_cost')::numeric,0)::bigint
      when 'team_policy_recovery_support_cost' then coalesce((new.metadata->>'recovery_weekly_cost')::numeric,0)::bigint
      when 'team_policy_logistics_cost' then coalesce((new.metadata->>'logistics_weekly_cost')::numeric,0)::bigint
      else 0 end;
    v_rate := coalesce(v_effect.operating_cost_rebate_bps,0);
    v_type := 'club_house_operating_cost_rebate';
  end if;

  if v_base>0 and v_rate>0 then
    perform public.finance_create_club_house_rebate_v1(v_club_id,new.id,v_type,v_base,v_rate,'SINK');
  end if;

  return new;
exception when others then
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_apply_club_house_tax_rebate_v1(p_club_id uuid, p_period_start date, p_period_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_effect record;
  v_expected_tax bigint := 0;
  v_rate integer := 0;
  v_amount bigint := 0;
  v_existing uuid;
  v_tx uuid;
  v_club_account uuid;
  v_tax_account uuid;
begin
  select * into v_effect from public.get_club_house_finance_effects(p_club_id);
  if not found then return jsonb_build_object('ok',true,'created',false,'amount',0); end if;
  v_rate := coalesce(v_effect.tax_rebate_bps,0);
  if v_rate<=0 then return jsonb_build_object('ok',true,'created',false,'amount',0,'rate_bps',v_rate); end if;

  select coalesce(a.expected_tax,0)::bigint into v_expected_tax
  from finance.monthly_tax_audits a
  where a.club_id=p_club_id and a.period_start=p_period_start and a.period_end=p_period_end
  order by a.id desc limit 1;

  v_amount := round((coalesce(v_expected_tax,0)::numeric*v_rate::numeric)/10000.0)::bigint;
  if v_amount<=0 then return jsonb_build_object('ok',true,'created',false,'amount',0,'rate_bps',v_rate); end if;

  select t.id into v_existing from finance.transactions t
  where t.idempotency_key='club_house_tax_rebate:'||p_club_id::text||':'||p_period_start::text||':'||p_period_end::text limit 1;
  if v_existing is not null then
    return jsonb_build_object('ok',true,'created',false,'already_exists',true,'transaction_id',v_existing,'amount',v_amount,'rate_bps',v_rate);
  end if;

  v_club_account := public.finance_get_or_create_club_account(p_club_id,'CASH','main');
  v_tax_account := public.finance_get_or_create_system_account('TAX_AUTHORITY','CASH','main');

  insert into finance.transactions(type,idempotency_key,metadata)
  values('club_house_tax_rebate',
    'club_house_tax_rebate:'||p_club_id::text||':'||p_period_start::text||':'||p_period_end::text,
    jsonb_build_object('club_id',p_club_id,'period_start',p_period_start,'period_end',p_period_end,'expected_tax',v_expected_tax,'rate_bps',v_rate,'rebate_amount',v_amount,'source','club_house_tax_efficiency'))
  returning id into v_tx;

  insert into finance.entries(transaction_id,account_id,amount,memo)
  values
    (v_tx,v_tax_account,-v_amount,'Club House tax rebate paid'),
    (v_tx,v_club_account,v_amount,'Club House tax rebate received');

  return jsonb_build_object('ok',true,'created',true,'transaction_id',v_tx,'amount',v_amount,'rate_bps',v_rate,'expected_tax',v_expected_tax);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_club_house_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then return jsonb_build_object('ok',false,'reason','game_date_missing'); end if;
  if extract(day from v_game_date)::integer<>1 then return jsonb_build_object('ok',true,'did_run',false,'reason','not_month_start','game_date',v_game_date); end if;
  v_period_key := to_char(v_game_date,'YYYY-MM');

  for r in
    select c.id as club_id,e.club_house_level,e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_club_house_finance_effects(c.id) e on true
    where c.club_type='main' and c.deleted_at is null and coalesce(c.is_active,true)=true
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
      and coalesce(e.monthly_maintenance_cash,0)>0
  loop
    v_processed := v_processed+1;
    select t.id into v_existing from finance.transactions t
    where t.idempotency_key='club_house_monthly_maintenance:'||r.club_id::text||':'||v_period_key limit 1;
    if v_existing is not null then v_skipped:=v_skipped+1; continue; end if;

    v_funds := public.finance_ensure_mandatory_funds(r.club_id,r.monthly_maintenance_cash,'club_house_monthly_maintenance',v_period_key,
      'mandatory_funds:club_house_monthly_maintenance:'||r.club_id::text||':'||v_period_key);
    if coalesce((v_funds->>'ok')::boolean,false) is not true then v_failed:=v_failed+1; continue; end if;

    v_tx := public.finance_spend_from_club(r.club_id,r.monthly_maintenance_cash,'club_house_monthly_maintenance','SINK',
      'club_house_monthly_maintenance:'||r.club_id::text||':'||v_period_key,
      jsonb_build_object('club_id',r.club_id,'club_house_level',r.club_house_level,'monthly_maintenance_cash',r.monthly_maintenance_cash,'period_key',v_period_key,'game_date',v_game_date,'source','club_house_monthly_maintenance'));
    v_charged:=v_charged+1;
    v_total:=v_total+r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object('ok',v_failed=0,'did_run',true,'game_date',v_game_date,'period_key',v_period_key,'processed',v_processed,'charged',v_charged,'skipped',v_skipped,'failed',v_failed,'total_charged',v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_training_center_regular_training_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_effect record;
  v_development_before numeric := 0;
  v_staff_bonus_added numeric := 0;
  v_staff_bonus_extra numeric := 0;
  v_development_after numeric := 0;
  v_fatigue_before integer := 0;
begin
  if new.source is distinct from 'regular_training'
     or coalesce(new.activity_type, '') <> 'training'
     or coalesce(new.participated, false) = false then
    return new;
  end if;

  if lower(coalesce(new.metadata->>'training_center_effect_applied', 'false')) in ('true', '1', 'yes') then
    return new;
  end if;

  select cr.club_id
  into v_club_id
  from public.club_riders cr
  where cr.rider_id = new.rider_id
  limit 1;

  if v_club_id is null then return new; end if;

  select * into v_effect
  from public.get_training_center_effects(v_club_id);

  if not found then return new; end if;

  v_development_before := coalesce(nullif(new.metadata->>'development_value_base', '')::numeric, 0);
  v_staff_bonus_added := coalesce(nullif(new.metadata->>'staff_bonus_added', '')::numeric, 0);
  v_staff_bonus_extra := round(
    v_staff_bonus_added * coalesce(v_effect.coaching_effectiveness_bonus_bps, 0)::numeric / 10000.0,
    4
  );
  v_development_after := round(
    (v_development_before + v_staff_bonus_extra)
    * (1 + coalesce(v_effect.training_development_bonus_bps, 0)::numeric / 10000.0),
    4
  );

  v_fatigue_before := coalesce(new.fatigue_load, 0);
  new.fatigue_load := greatest(
    0,
    v_fatigue_before - coalesce(v_effect.training_fatigue_reduction_points, 0)
  );

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'training_center_level', v_effect.training_center_level,
    'training_center_development_bonus_bps', v_effect.training_development_bonus_bps,
    'training_center_coaching_effectiveness_bonus_bps', v_effect.coaching_effectiveness_bonus_bps,
    'training_center_fatigue_reduction_points', v_effect.training_fatigue_reduction_points,
    'training_center_risk_reduction_bps', v_effect.training_risk_reduction_bps,
    'development_before_training_center', round(v_development_before, 4),
    'training_center_staff_bonus_extra', v_staff_bonus_extra,
    'development_value_base', v_development_after,
    'fatigue_load_before_training_center', v_fatigue_before,
    'training_center_effect_applied', true,
    'training_center_effect_version', 'training_center_gameplay_v1'
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_training_center_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then
    return jsonb_build_object('ok', false, 'reason', 'game_date_missing');
  end if;

  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object(
      'ok', true,
      'did_run', false,
      'reason', 'not_month_start',
      'game_date', v_game_date
    );
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select
      c.id as club_id,
      e.training_center_level,
      e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_training_center_effects(c.id) e on true
    where c.club_type = 'main'
      and c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(e.monthly_maintenance_cash, 0) > 0
  loop
    v_processed := v_processed + 1;

    select t.id into v_existing
    from finance.transactions t
    where t.idempotency_key =
      'training_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'training_center_monthly_maintenance',
      v_period_key,
      'mandatory_funds:training_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'training_center_monthly_maintenance',
      'SINK',
      'training_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'training_center_level', r.training_center_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'training_center_monthly_maintenance'
      )
    );

    v_charged := v_charged + 1;
    v_total := v_total + r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'did_run', true,
    'game_date', v_game_date,
    'period_key', v_period_key,
    'processed', v_processed,
    'charged', v_charged,
    'skipped', v_skipped,
    'failed', v_failed,
    'total_charged', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_asset_transport_cost_for_club_v2(p_club_id uuid, p_destination_country_code text, p_asset_assignments jsonb, p_race_days integer)
 RETURNS bigint
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_origin_country_code text;
  v_distance_km numeric;
  v_effective_distance_km numeric;
  v_freight_multiplier numeric := 1.00;
  v_days integer := greatest(coalesce(p_race_days, 1), 1);
  v_total numeric := 0;
begin
  select upper(
    coalesce(
      case
        when coalesce(c.club_type, 'main') = 'developing'
          then nullif(parent_c.country_code, '')
        else nullif(c.country_code, '')
      end,
      nullif(c.country_code, ''),
      'RS'
    )
  )
  into v_origin_country_code
  from public.clubs c
  left join public.clubs parent_c on parent_c.id = c.parent_club_id
  where c.id = p_club_id
  limit 1;

  if v_origin_country_code is null then
    raise exception 'Club not found for asset transport estimate: %', p_club_id;
  end if;

  v_distance_km := public.travel_country_distance_km_v2(
    v_origin_country_code,
    upper(btrim(coalesce(p_destination_country_code, '')))
  );

  v_effective_distance_km :=
    case
      when upper(btrim(coalesce(p_destination_country_code, ''))) = v_origin_country_code then 250
      when v_distance_km is null then 1500
      else greatest(v_distance_km, 100)
    end;

  v_freight_multiplier :=
    case
      when v_effective_distance_km > 10000 then 1.70
      when v_effective_distance_km > 6000 then 1.45
      when v_effective_distance_km > 3000 then 1.25
      else 1.00
    end;

  select coalesce(sum(
    case coalesce(elem->>'asset_key', '')
      when 'team_bus' then
        500 + (v_effective_distance_km * 2 * 0.18 * v_freight_multiplier) + (80 * v_days)
      when 'equipment_van' then
        350 + (v_effective_distance_km * 2 * 0.14 * v_freight_multiplier) + (60 * v_days)
      when 'mobile_workshop' then
        550 + (v_effective_distance_km * 2 * 0.20 * v_freight_multiplier) + (80 * v_days)
      when 'medical_van' then
        400 + (v_effective_distance_km * 2 * 0.16 * v_freight_multiplier) + (65 * v_days)
      when 'team_car' then
        220 + (v_effective_distance_km * 2 * 0.10 * v_freight_multiplier) + (45 * v_days)
      else
        300 + (v_effective_distance_km * 2 * 0.12 * v_freight_multiplier) + (50 * v_days)
    end
  ), 0)
  into v_total
  from jsonb_array_elements(coalesce(p_asset_assignments, '[]'::jsonb)) elem;

  -- Balance v1: asset transport was dominating the race package economy.
  -- Preserve all existing relative differences by asset type, distance and
  -- race duration, but halve the final transport charge globally.
  return round(v_total * 0.50)::bigint;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_travel_fatigue_profile_v1(p_club_id uuid, p_destination_country_code text)
 RETURNS TABLE(policy_club_id uuid, origin_country_code text, destination_country_code text, distance_km numeric, route_band text, base_travel_fatigue integer, flight_class text, flight_fatigue_reduction integer, hotel_level text, hotel_fatigue_reduction integer, ground_transport text, ground_fatigue_reduction integer, total_comfort_reduction integer, net_travel_fatigue integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_policy_club_id uuid;
  v_origin_country_code text;
  v_destination_country_code text := upper(btrim(coalesce(p_destination_country_code, '')));
  v_distance numeric;
  v_route_band text;
  v_route_multiplier numeric;
  v_flight_class text := 'economy';
  v_hotel_level text := 'budget';
  v_ground_transport text := 'standard_vans';
  v_flight_reduction integer := 0;
  v_hotel_reduction integer := 0;
  v_ground_reduction integer := 0;
  v_base_fatigue integer := 0;
  v_total_reduction integer := 0;
  v_net_fatigue integer := 0;
begin
  select
    case
      when coalesce(c.club_type, 'main') = 'developing' then coalesce(c.parent_club_id, c.id)
      else c.id
    end,
    upper(
      coalesce(
        case
          when coalesce(c.club_type, 'main') = 'developing' then nullif(parent_c.country_code, '')
          else nullif(c.country_code, '')
        end,
        nullif(c.country_code, ''),
        'RS'
      )
    )
  into v_policy_club_id, v_origin_country_code
  from public.clubs c
  left join public.clubs parent_c on parent_c.id = c.parent_club_id
  where c.id = p_club_id
  limit 1;

  if v_policy_club_id is null or v_origin_country_code is null then
    raise exception 'Club not found for travel fatigue profile: %', p_club_id;
  end if;

  select
    coalesce(ctp.flight_class, 'economy'),
    coalesce(ctp.hotel_level, 'budget'),
    coalesce(ctp.ground_transport, 'standard_vans')
  into v_flight_class, v_hotel_level, v_ground_transport
  from public.club_team_policies ctp
  where ctp.club_id = v_policy_club_id
  limit 1;

  v_flight_class := coalesce(v_flight_class, 'economy');
  v_hotel_level := coalesce(v_hotel_level, 'budget');
  v_ground_transport := coalesce(v_ground_transport, 'standard_vans');

  v_distance := public.travel_country_distance_km_v2(
    v_origin_country_code,
    v_destination_country_code
  );

  select rb.route_band, rb.route_multiplier
  into v_route_band, v_route_multiplier
  from public.travel_route_band_multiplier_v1(
    v_origin_country_code,
    v_destination_country_code
  ) rb
  limit 1;

  v_route_band := coalesce(v_route_band, 'unknown_route');

  v_base_fatigue :=
    case
      when v_origin_country_code = v_destination_country_code then 0
      when v_distance is null then greatest(2, least(10, round(coalesce(v_route_multiplier, 2.0) * 2.0)::integer))
      when v_distance <= 300 then 1
      when v_distance <= 800 then 2
      when v_distance <= 1500 then 3
      when v_distance <= 3000 then 4
      when v_distance <= 6000 then 6
      when v_distance <= 10000 then 8
      else 10
    end;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_flight_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'flight_class'
    and t.option_code = v_flight_class
    and t.is_active = true
  limit 1;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_hotel_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'hotel_level'
    and t.option_code = v_hotel_level
    and t.is_active = true
  limit 1;

  select coalesce((t.effect_json->>'travel_fatigue_reduction')::integer, 0)
  into v_ground_reduction
  from public.team_policy_option_catalog t
  where t.policy_key = 'ground_transport'
    and t.option_code = v_ground_transport
    and t.is_active = true
  limit 1;

  v_flight_reduction := coalesce(v_flight_reduction, 0);
  v_hotel_reduction := coalesce(v_hotel_reduction, 0);
  v_ground_reduction := coalesce(v_ground_reduction, 0);
  v_total_reduction := v_flight_reduction + v_hotel_reduction + v_ground_reduction;
  v_net_fatigue := greatest(0, v_base_fatigue - v_total_reduction);

  return query
  select
    v_policy_club_id,
    v_origin_country_code,
    v_destination_country_code,
    v_distance,
    v_route_band,
    v_base_fatigue,
    v_flight_class,
    v_flight_reduction,
    v_hotel_level,
    v_hotel_reduction,
    v_ground_transport,
    v_ground_reduction,
    v_total_reduction,
    v_net_fatigue;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_race_travel_fatigue_preview_v1(p_race_id uuid, p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_race_name text;
  v_destination_country_code text;
  v_race_start date;
  v_travel_date date;
  v_profile record;
  v_travel_date_label text;
  v_route_label text;
  v_message text;
begin
  select
    r.name,
    nullif(coalesce(to_jsonb(r)->>'country_code', to_jsonb(r)->>'host_country_code'), ''),
    r.start_date
  into v_race_name, v_destination_country_code, v_race_start
  from public.races r
  where r.id = p_race_id
  limit 1;

  if v_race_start is null then
    return jsonb_build_object('available', false, 'reason', 'race_not_found');
  end if;

  if v_destination_country_code is null then
    return jsonb_build_object('available', false, 'reason', 'race_country_missing');
  end if;

  select * into v_profile
  from public.get_team_travel_fatigue_profile_v1(
    p_club_id,
    v_destination_country_code
  )
  limit 1;

  v_travel_date := v_race_start - 1;
  v_travel_date_label := format(
    'Season %s - %s %s',
    extract(year from v_travel_date)::integer - 1999,
    to_char(v_travel_date, 'FMMonth'),
    to_char(v_travel_date, 'DD')
  );
  v_route_label := initcap(replace(coalesce(v_profile.route_band, 'unknown route'), '_', ' '));

  v_message := format(
    'Travel fatigue: %s km %s trip. With %s flight, %s hotel and %s, each selected rider is expected to receive +%s fatigue on %s (travel day). Better flight class, accommodation or premium ground transport can reduce this.',
    coalesce(round(v_profile.distance_km)::text, 'unknown-distance'),
    lower(v_route_label),
    initcap(replace(v_profile.flight_class, '_', ' ')),
    initcap(replace(v_profile.hotel_level, '_', ' ')),
    initcap(replace(v_profile.ground_transport, '_', ' ')),
    v_profile.net_travel_fatigue,
    v_travel_date_label
  );

  return jsonb_build_object(
    'available', true,
    'race_id', p_race_id,
    'race_name', v_race_name,
    'origin_country_code', v_profile.origin_country_code,
    'destination_country_code', v_profile.destination_country_code,
    'distance_km', v_profile.distance_km,
    'route_band', v_profile.route_band,
    'base_travel_fatigue', v_profile.base_travel_fatigue,
    'flight_class', v_profile.flight_class,
    'flight_fatigue_reduction', v_profile.flight_fatigue_reduction,
    'hotel_level', v_profile.hotel_level,
    'hotel_fatigue_reduction', v_profile.hotel_fatigue_reduction,
    'ground_transport', v_profile.ground_transport,
    'ground_fatigue_reduction', v_profile.ground_fatigue_reduction,
    'total_comfort_reduction', v_profile.total_comfort_reduction,
    'net_travel_fatigue', v_profile.net_travel_fatigue,
    'travel_date', v_travel_date,
    'travel_date_label', v_travel_date_label,
    'message', v_message
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_medical_center_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then
    return jsonb_build_object('ok', false, 'reason', 'game_date_missing');
  end if;

  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object(
      'ok', true,
      'did_run', false,
      'reason', 'not_month_start',
      'game_date', v_game_date
    );
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select
      c.id as club_id,
      e.medical_center_level,
      e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_medical_center_effects(c.id) e on true
    where c.club_type = 'main'
      and c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(e.monthly_maintenance_cash, 0) > 0
  loop
    v_processed := v_processed + 1;

    select t.id into v_existing
    from finance.transactions t
    where t.idempotency_key =
      'medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'medical_center_monthly_maintenance',
      v_period_key,
      'mandatory_funds:medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'medical_center_monthly_maintenance',
      'SINK',
      'medical_center_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'medical_center_level', r.medical_center_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'medical_center_monthly_maintenance'
      )
    );

    v_charged := v_charged + 1;
    v_total := v_total + r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'did_run', true,
    'game_date', v_game_date,
    'period_key', v_period_key,
    'processed', v_processed,
    'charged', v_charged,
    'skipped', v_skipped,
    'failed', v_failed,
    'total_charged', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_youth_academy_regular_training_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_club_id uuid;
  v_effect record;
  v_before numeric := 0;
  v_after numeric := 0;
begin
  if new.source is distinct from 'regular_training'
     or coalesce(new.activity_type, '') <> 'training'
     or coalesce(new.participated, false) = false then
    return new;
  end if;

  if lower(coalesce(new.metadata->>'development_eligible', 'true')) in ('false', '0', 'no') then
    return new;
  end if;

  if lower(coalesce(new.metadata->>'youth_academy_effect_applied', 'false')) in ('true', '1', 'yes') then
    return new;
  end if;

  select cr.club_id
  into v_club_id
  from public.club_riders cr
  join public.clubs c on c.id = cr.club_id and c.deleted_at is null
  where cr.rider_id = new.rider_id
  limit 1;

  if v_club_id is null then return new; end if;

  select * into v_effect
  from public.get_youth_academy_effects(v_club_id)
  limit 1;

  if not found or coalesce(v_effect.is_developing_team, false) is not true then
    return new;
  end if;

  if coalesce(v_effect.youth_regular_training_development_bonus_bps, 0) <= 0 then
    return new;
  end if;

  v_before := coalesce(nullif(new.metadata->>'development_value_base', '')::numeric, 0);
  if v_before <= 0 then return new; end if;

  v_after := round(
    v_before * (1 + coalesce(v_effect.youth_regular_training_development_bonus_bps, 0)::numeric / 10000.0),
    4
  );

  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'youth_academy_level', v_effect.youth_academy_level,
    'youth_academy_regular_training_bonus_bps', v_effect.youth_regular_training_development_bonus_bps,
    'youth_academy_race_development_bonus_bps', v_effect.youth_race_development_bonus_bps,
    'youth_academy_head_coach_development_effectiveness_bonus_bps', v_effect.youth_head_coach_development_effectiveness_bonus_bps,
    'youth_academy_off_focus_decay_reduction_bps', v_effect.youth_off_focus_decay_reduction_bps,
    'development_before_youth_academy', round(v_before, 4),
    'development_value_base', v_after,
    'youth_academy_effect_applied', true,
    'youth_academy_effect_version', 'youth_academy_gameplay_v1'
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_youth_academy_race_development_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_effect record;
  v_multiplier numeric := 1.0;
  v_progress jsonb;
  v_key text;
  v_value numeric;
  v_before_total numeric := 0;
  v_after_total numeric := 0;
  v_keys text[] := array['sprint','climbing','time_trial','endurance','flat','recovery','resistance','race_iq','teamwork'];
begin
  if new.team_id is null or new.progress_json is null then return new; end if;

  if lower(coalesce(new.metadata->>'youth_academy_race_development_applied', 'false')) in ('true', '1', 'yes') then
    return new;
  end if;

  select * into v_effect
  from public.get_youth_academy_effects(new.team_id)
  limit 1;

  if not found or coalesce(v_effect.is_developing_team, false) is not true then return new; end if;
  if coalesce(v_effect.youth_race_development_bonus_bps, 0) <= 0 then return new; end if;

  v_multiplier := 1 + v_effect.youth_race_development_bonus_bps::numeric / 10000.0;
  v_progress := coalesce(new.progress_json, '{}'::jsonb);
  v_before_total := coalesce(new.total_progress_points, 0);

  foreach v_key in array v_keys loop
    if jsonb_typeof(v_progress -> v_key) = 'number' then
      v_value := coalesce((v_progress ->> v_key)::numeric, 0);
      v_progress := jsonb_set(v_progress, array[v_key], to_jsonb(round(v_value * v_multiplier, 4)), true);
    end if;
  end loop;

  select coalesce(sum((value #>> '{}')::numeric), 0)
  into v_after_total
  from jsonb_each(v_progress)
  where jsonb_typeof(value) = 'number';

  new.progress_json := v_progress;
  new.total_progress_points := round(v_after_total, 4);
  new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
    'youth_academy_level', v_effect.youth_academy_level,
    'youth_academy_race_development_bonus_bps', v_effect.youth_race_development_bonus_bps,
    'race_development_total_before_youth_academy', round(v_before_total, 4),
    'race_development_total_after_youth_academy', round(v_after_total, 4),
    'youth_academy_race_development_applied', true,
    'youth_academy_effect_version', 'youth_academy_gameplay_v1'
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_youth_academy_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then
    return jsonb_build_object('ok', false, 'reason', 'game_date_missing');
  end if;

  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object(
      'ok', true,
      'did_run', false,
      'reason', 'not_month_start',
      'game_date', v_game_date
    );
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select
      c.id as club_id,
      e.youth_academy_level,
      e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_youth_academy_effects(c.id) e on true
    where c.club_type = 'main'
      and c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(e.monthly_maintenance_cash, 0) > 0
  loop
    v_processed := v_processed + 1;

    select t.id into v_existing
    from finance.transactions t
    where t.idempotency_key =
      'youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'youth_academy_monthly_maintenance',
      v_period_key,
      'mandatory_funds:youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'youth_academy_monthly_maintenance',
      'SINK',
      'youth_academy_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'youth_academy_level', r.youth_academy_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'youth_academy_monthly_maintenance'
      )
    );

    v_charged := v_charged + 1;
    v_total := v_total + r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'did_run', true,
    'game_date', v_game_date,
    'period_key', v_period_key,
    'processed', v_processed,
    'charged', v_charged,
    'skipped', v_skipped,
    'failed', v_failed,
    'total_charged', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_mechanics_workshop_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date;
  v_period_key text;
  r record;
  v_existing uuid;
  v_tx uuid;
  v_funds jsonb;
  v_processed integer := 0;
  v_charged integer := 0;
  v_skipped integer := 0;
  v_failed integer := 0;
  v_total bigint := 0;
begin
  v_game_date := public.get_current_game_date_date();
  if v_game_date is null then return jsonb_build_object('ok', false, 'reason', 'game_date_missing'); end if;
  if extract(day from v_game_date)::integer <> 1 then
    return jsonb_build_object('ok', true, 'did_run', false, 'reason', 'not_month_start', 'game_date', v_game_date);
  end if;

  v_period_key := to_char(v_game_date, 'YYYY-MM');

  for r in
    select c.id as club_id, e.mechanics_workshop_level, e.monthly_maintenance_cash
    from public.clubs c
    join lateral public.get_mechanics_workshop_effects(c.id) e on true
    where c.club_type = 'main'
      and c.deleted_at is null
      and coalesce(c.is_active, true) = true
      and c.owner_user_id is not null
      and coalesce(c.is_ai, false) = false
      and coalesce(e.monthly_maintenance_cash, 0) > 0
  loop
    v_processed := v_processed + 1;

    select t.id into v_existing
    from finance.transactions t
    where t.idempotency_key = 'mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    limit 1;

    if v_existing is not null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    v_funds := public.finance_ensure_mandatory_funds(
      r.club_id,
      r.monthly_maintenance_cash,
      'mechanics_workshop_monthly_maintenance',
      v_period_key,
      'mandatory_funds:mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key
    );

    if coalesce((v_funds->>'ok')::boolean, false) is not true then
      v_failed := v_failed + 1;
      continue;
    end if;

    v_tx := public.finance_spend_from_club(
      r.club_id,
      r.monthly_maintenance_cash,
      'mechanics_workshop_monthly_maintenance',
      'SINK',
      'mechanics_workshop_monthly_maintenance:' || r.club_id::text || ':' || v_period_key,
      jsonb_build_object(
        'club_id', r.club_id,
        'mechanics_workshop_level', r.mechanics_workshop_level,
        'monthly_maintenance_cash', r.monthly_maintenance_cash,
        'period_key', v_period_key,
        'game_date', v_game_date,
        'source', 'mechanics_workshop_monthly_maintenance'
      )
    );

    v_charged := v_charged + 1;
    v_total := v_total + r.monthly_maintenance_cash;
  end loop;

  return jsonb_build_object(
    'ok', v_failed = 0,
    'did_run', true,
    'game_date', v_game_date,
    'period_key', v_period_key,
    'processed', v_processed,
    'charged', v_charged,
    'skipped', v_skipped,
    'failed', v_failed,
    'total_charged', v_total
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.scout_metric_label_midpoint_v1(p_label text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare v_label text := trim(coalesce(p_label,'')); v_match text[];
begin
  if v_label='' then return null; end if;
  if v_label ~ '^\d+(\.\d+)?$' then return v_label::numeric; end if;
  v_match := regexp_match(v_label, '^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$');
  if v_match is null then return null; end if;
  return (v_match[1]::numeric + v_match[2]::numeric) / 2.0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_process_monthly_scouting_office_maintenance_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  v_game_date date; v_period_key text; r record; v_existing uuid; v_tx uuid; v_funds jsonb;
  v_processed integer:=0; v_charged integer:=0; v_skipped integer:=0; v_failed integer:=0; v_total bigint:=0;
begin
  v_game_date:=public.get_current_game_date_date();
  if v_game_date is null then return jsonb_build_object('ok',false,'reason','game_date_missing'); end if;
  if extract(day from v_game_date)::integer<>1 then return jsonb_build_object('ok',true,'did_run',false,'reason','not_month_start','game_date',v_game_date); end if;
  v_period_key:=to_char(v_game_date,'YYYY-MM');
  for r in
    select c.id as club_id,e.scouting_level,e.monthly_maintenance_cash
    from public.clubs c join lateral public.get_scouting_office_effects(c.id) e on true
    where c.club_type='main' and c.deleted_at is null and coalesce(c.is_active,true)=true
      and c.owner_user_id is not null and coalesce(c.is_ai,false)=false
      and coalesce(e.monthly_maintenance_cash,0)>0
  loop
    v_processed:=v_processed+1;
    select t.id into v_existing from finance.transactions t
    where t.idempotency_key='scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key limit 1;
    if v_existing is not null then v_skipped:=v_skipped+1; continue; end if;
    v_funds:=public.finance_ensure_mandatory_funds(r.club_id,r.monthly_maintenance_cash,'scouting_office_monthly_maintenance',v_period_key,'mandatory_funds:scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key);
    if coalesce((v_funds->>'ok')::boolean,false) is not true then v_failed:=v_failed+1; continue; end if;
    v_tx:=public.finance_spend_from_club(r.club_id,r.monthly_maintenance_cash,'scouting_office_monthly_maintenance','SINK','scouting_office_monthly_maintenance:'||r.club_id::text||':'||v_period_key,
      jsonb_build_object('club_id',r.club_id,'scouting_level',r.scouting_level,'monthly_maintenance_cash',r.monthly_maintenance_cash,'period_key',v_period_key,'game_date',v_game_date,'source','scouting_office_monthly_maintenance'));
    v_charged:=v_charged+1; v_total:=v_total+r.monthly_maintenance_cash;
  end loop;
  return jsonb_build_object('ok',v_failed=0,'did_run',true,'game_date',v_game_date,'period_key',v_period_key,'processed',v_processed,'charged',v_charged,'skipped',v_skipped,'failed',v_failed,'total_charged',v_total);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_season_started_race_schedule_notice_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_target_season integer;
  v_target_season_text text;
begin
  select nt.code
  into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if coalesce(v_type_code, '') <> 'SEASON_STARTED' then
    return new;
  end if;

  v_target_season_text := coalesce(
    nullif(new.payload_json ->> 'target_season', ''),
    nullif(new.payload_json ->> 'season_number', '')
  );

  if v_target_season_text ~ '^[0-9]+$' then
    v_target_season := v_target_season_text::integer;
  else
    v_target_season := null;
  end if;

  new.title := case
    when v_target_season is not null
      then format('Season %s: early January race deadlines', v_target_season)
    else 'Early January race deadlines'
  end;

  new.message := case
    when v_target_season is not null then format(
      'Season %s starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.',
      v_target_season
    )
    else
      'The season starts with a compressed January race calendar. For races starting Jan 1–15, applications open on Jan 1 and close 1 in-game day before the race; the team list is announced the same day. Rider/startlist submission stays open until 3 in-game hours before Stage 1. For Jan 16–31, applications close 3 in-game days before the race and rider submission closes 1 in-game day before. From February onward, applications open 60 in-game days before each race and close 7 in-game days before; rider submission closes 3 in-game days before. Check Calendar and Race Detail frequently so you do not miss a deadline.'
  end;

  new.action_url := '/dashboard/calendar?view=races&month=1';
  new.payload_json := coalesce(new.payload_json, '{}'::jsonb) || jsonb_build_object(
    'season_start_race_deadline_notice_version', 2,
    'early_january_end_day', 15,
    'early_january_applications_close_days_before', 1,
    'early_january_team_list_days_before', 1,
    'early_january_startlist_hours_before_stage1', 3,
    'january_late_applications_close_days_before', 3,
    'january_late_startlist_days_before', 1,
    'standard_applications_open_days_before', 60,
    'standard_applications_close_days_before', 7,
    'standard_startlist_days_before', 3
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_season_start_race_deadline_notice_if_due_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season_number integer;
  v_month_number smallint;
  v_day_number smallint;
  v_transition_run_id uuid;
  v_timeline_id uuid;
  v_created integer := 0;
  v_existing_before integer;
  v_existing_after integer;
  v_event_key text;
  r record;
begin
  select g.season_number, g.month_number, g.day_number
  into v_season_number, v_month_number, v_day_number
  from public.get_current_game_date() g;

  if v_season_number is null then
    raise exception 'Unable to determine current game season.';
  end if;

  if v_month_number <> 1 or v_day_number not in (1, 2) then
    return jsonb_build_object(
      'ok', true,
      'sent', false,
      'reason', 'not_due',
      'season_number', v_season_number
    );
  end if;

  if v_season_number > 1 then
    select c.timeline_id
    into v_timeline_id
    from public.season_transition_control_v1 c
    where c.id = true;

    select r0.id
    into v_transition_run_id
    from public.season_transition_runs_v1 r0
    where r0.timeline_id = v_timeline_id
      and r0.source_season = v_season_number - 1
      and r0.target_season = v_season_number
      and r0.status = 'completed'
    order by r0.finished_at desc nulls last, r0.id desc
    limit 1;

    if v_transition_run_id is null then
      return jsonb_build_object(
        'ok', true,
        'sent', false,
        'reason', 'season_transition_not_completed',
        'season_number', v_season_number
      );
    end if;
  end if;

  for r in
    select distinct c.owner_user_id as user_id, c.id as club_id, c.name as club_name
    from public.clubs c
    where c.owner_user_id is not null
      and coalesce(c.club_type, 'main') = 'main'
      and c.deleted_at is null
  loop
    v_event_key := case
      when v_transition_run_id is not null
        then format('season_started:%s:%s', v_transition_run_id, r.club_id)
      else format('season_started:season:%s:%s', v_season_number, r.club_id)
    end;

    select count(*)::integer
    into v_existing_before
    from public.user_notifications un
    join public.notifications n on n.id = un.notification_id
    where un.user_id = r.user_id
      and un.deleted_at is null
      and n.payload_json ->> 'event_key' = v_event_key;

    perform public.create_user_game_notification_v1(
      r.user_id,
      'SEASON_STARTED',
      format('Season %s has started', v_season_number),
      format('Season %s is now underway. Review %s and the January race calendar.', v_season_number, r.club_name),
      '/dashboard/overview',
      jsonb_strip_nulls(jsonb_build_object(
        'transition_run_id', v_transition_run_id,
        'source_season', case when v_season_number > 1 then v_season_number - 1 else null end,
        'target_season', v_season_number,
        'club_id', r.club_id,
        'club_name', r.club_name,
        'season_start_notice_safety_net', true
      )),
      v_event_key,
      null
    );

    select count(*)::integer
    into v_existing_after
    from public.user_notifications un
    join public.notifications n on n.id = un.notification_id
    where un.user_id = r.user_id
      and un.deleted_at is null
      and n.payload_json ->> 'event_key' = v_event_key;

    if v_existing_before = 0 and v_existing_after = 1 then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sent', v_created > 0,
    'season_number', v_season_number,
    'transition_run_id', v_transition_run_id,
    'created', v_created
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_other_supply_reservations_v1(p_stage_id uuid, p_team_id uuid, p_supply_key text)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_owner uuid;
  v_stage_date date;
  v_stage_order_ts timestamp;
  v_reserved integer := 0;
  v_one integer := 0;
  x record;
begin
  select
    public.universal_race_resource_owner_club_v1(p_team_id),
    s.stage_date::date,
    s.stage_date::timestamp
      + make_interval(
          hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
          mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
        )
  into v_owner, v_stage_date, v_stage_order_ts
  from public.race_stages s
  where s.id = p_stage_id;

  if v_owner is null or v_stage_date is null or v_stage_order_ts is null then
    return 0;
  end if;

  for x in
    select distinct
      rsp.stage_id,
      coalesce(rp.participating_club_id, rp.club_id) as sporting_team_id,
      s.stage_date::date as stage_date,
      s.stage_date::timestamp
        + make_interval(
            hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
            mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
          ) as stage_order_ts
    from public.race_stage_plans rsp
    join public.race_preparations rp
      on rp.id = rsp.race_preparation_id
    join public.race_stages s
      on s.id = rsp.stage_id
    join public.races r
      on r.id = rsp.race_id
    where rsp.stage_id is not null
      and rsp.stage_id <> p_stage_id
      and rsp.last_saved_at is not null
      and lower(coalesce(rp.status, '')) in (
        'submitted', 'locked', 'sent_to_engine', 'final', 'finalized',
        'completed', 'auto_defaulted'
      )
      and public.universal_race_resource_owner_club_v1(
            coalesce(rp.participating_club_id, rp.club_id)
          ) = v_owner
      and lower(coalesce(r.status, 'scheduled')) in ('scheduled', 'active')
      and not coalesce(s.weather_cancelled, false)
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = rsp.stage_id
      )
      and (
        s.stage_date::timestamp
          + make_interval(
              hours => greatest(0, least(23, coalesce(s.planned_start_hour_number, 12))),
              mins => greatest(0, least(59, coalesce(s.planned_start_minute, 0)))
            )
      ) < v_stage_order_ts
      and (
        p_supply_key not in ('race_jersey_complete', 'rain_jackets')
        or s.stage_date::date = v_stage_date
      )
    order by stage_order_ts, rsp.stage_id
  loop
    select coalesce(max(req.required_quantity), 0)
    into v_one
    from public.universal_race_stage_planned_supplies_v1(
      x.stage_id,
      x.sporting_team_id
    ) req
    where req.supply_key = p_supply_key;

    v_reserved := v_reserved + greatest(coalesce(v_one, 0), 0);
  end loop;

  return greatest(v_reserved, 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_race_stage_supply_reservation_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_team_id uuid;
  v_stage_format text;
  v_requested integer;
  v_available integer;
  v_key text;
  v_label text;
begin
  if new.stage_id is null or new.last_saved_at is null then return new; end if;

  select coalesce(rp.participating_club_id,rp.club_id),s.stage_format
  into v_team_id,v_stage_format
  from public.race_preparations rp
  join public.race_stages s on s.id=new.stage_id
  where rp.id=new.race_preparation_id;

  if v_team_id is null then return new; end if;
  if v_stage_format in ('prologue','individual_time_trial','team_time_trial') then return new; end if;

  foreach v_key in array array[
    'bidons_water_bottles','energy_gels','nutrition_packs','race_jersey_complete','rain_jackets'
  ] loop
    select coalesce(sum(
      case v_key
        when 'bidons_water_bottles' then case when coalesce(e.value->>'bidons',e.value->>'bidons_water_bottles','0') ~ '^[0-9]+$' then coalesce(e.value->>'bidons',e.value->>'bidons_water_bottles','0')::integer else 0 end
        when 'energy_gels' then case when coalesce(e.value->>'gels',e.value->>'energy_gels','0') ~ '^[0-9]+$' then coalesce(e.value->>'gels',e.value->>'energy_gels','0')::integer else 0 end
        when 'nutrition_packs' then case when coalesce(e.value->>'nutrition_packs','0') ~ '^[0-9]+$' then coalesce(e.value->>'nutrition_packs','0')::integer else 0 end
        when 'race_jersey_complete' then case
          when lower(coalesce(e.value->>'race_jersey_complete',e.value->>'race_jersey','false')) in ('true','t','1','yes','y','all') then 1
          when coalesce(e.value->>'race_jersey_complete',e.value->>'race_jersey','0') ~ '^[0-9]+$' then least(coalesce(e.value->>'race_jersey_complete',e.value->>'race_jersey','0')::integer,1)
          else 0 end
        when 'rain_jackets' then case
          when lower(coalesce(e.value->>'rain_jacket',e.value->>'rain_jackets','false')) in ('true','t','1','yes','y','all') then 1
          when coalesce(e.value->>'rain_jacket',e.value->>'rain_jackets','0') ~ '^[0-9]+$' then least(coalesce(e.value->>'rain_jacket',e.value->>'rain_jackets','0')::integer,1)
          else 0 end
        else 0
      end
    ),0)::integer
    into v_requested
    from jsonb_each(coalesce(new.rider_supplies_json,'{}'::jsonb)) e
    where jsonb_typeof(e.value)='object';

    if v_requested<=0 then continue; end if;
    v_available:=public.universal_race_stage_effective_supply_available_v1(new.stage_id,v_team_id,v_key);

    -- Race Jersey Kits are optional. Saving a Stage Plan is allowed even if some
    -- requested jersey assignments exceed current stock; the race-time penalty
    -- is calculated from actual available kits.
    if v_requested>v_available and v_key<>'race_jersey_complete' then
      v_label:=case v_key
        when 'bidons_water_bottles' then 'Bidons / Water Bottles'
        when 'energy_gels' then 'Energy Gels'
        when 'nutrition_packs' then 'Nutrition Packs'
        when 'rain_jackets' then 'Rain Jackets'
        else v_key end;
      raise exception 'Race supply reservation exceeds available unreserved stock for %: % requested, % available after other saved Stage Plans.',v_label,v_requested,v_available;
    end if;
  end loop;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_startlist_engine_readiness_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_team_list_finalized boolean := false;
  v_rider_deadline timestamp without time zone;
  v_min_teams integer := 0;
  v_min_riders integer := 0;
  v_max_riders integer := 999;
  v_eligible_teams integer := 0;
  v_missing_team_snapshots integer := 0;
  v_invalid_rider_sizes integer := 0;
  v_missing_start_numbers integer := 0;
  v_invalid_captains integer := 0;
  v_unexpected_rider_teams integer := 0;
  v_ready boolean := false;
  v_reason text := 'unknown';
begin
  if p_race_id is null then
    return jsonb_build_object('ready',false,'reason','race_id_required');
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select
    lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes'),
    coalesce(
      rules.rider_submission_deadline_game_at,
      coalesce(
        rules.rider_submission_deadline::date,
        make_date(
          1999 + rules.rider_submission_deadline_season_number::integer,
          rules.rider_submission_deadline_month_number::integer,
          rules.rider_submission_deadline_day_number::integer
        ),
        r.start_date::date - 3
      )::timestamp
    ),
    coalesce(rules.min_teams,0),
    coalesce(rules.min_riders_per_team,0),
    coalesce(rules.max_riders_per_team,999)
  into
    v_team_list_finalized,
    v_rider_deadline,
    v_min_teams,
    v_min_riders,
    v_max_riders
  from public.races r
  join public.race_entry_rules rules on rules.race_id=r.id
  where r.id=p_race_id;

  if not found then
    return jsonb_build_object('ready',false,'reason','race_or_entry_rules_not_found','race_id',p_race_id);
  end if;

  with eligible as (
    select distinct coalesce(e.participating_club_id,e.club_id) as team_id
    from public.race_team_entries e
    left join lateral (
      select p.status,p.startlist_status
      from public.race_preparations p
      where p.race_id=e.race_id
        and p.club_id=e.club_id
      order by p.updated_at desc nulls last,p.id desc
      limit 1
    ) latest_preparation on true
    where e.race_id=p_race_id
      and e.status in ('accepted','confirmed')
      and e.missed_startlist_at is null
      and coalesce(latest_preparation.status,'') <> 'missed_startlist'
      and coalesce(latest_preparation.startlist_status,'') <> 'missed_startlist'
      and coalesce(e.participating_club_id,e.club_id) is not null
  ),
  per_team as (
    select
      e.team_id,
      count(r.rider_id)::integer as rider_count,
      count(r.rider_id) filter (
        where public.race_role_is_captain_v1(r.role_snapshot)
      )::integer as captain_count,
      min(r.start_number) as first_team_start_number,
      min(r.start_number) filter (
        where public.race_role_is_captain_v1(r.role_snapshot)
      ) as captain_start_number,
      count(r.rider_id) filter (where r.start_number is null)::integer as missing_numbers
    from eligible e
    left join public.race_participant_riders r
      on r.race_id=p_race_id
     and r.team_id=e.team_id
    group by e.team_id
  ),
  counts as (
    select
      (select count(*)::integer from eligible) as eligible_teams,
      (select count(*)::integer
       from eligible e
       where not exists (
         select 1
         from public.race_participant_teams_v1 t
         where t.race_id=p_race_id
           and lower(coalesce(t.status,'accepted'))='accepted'
           and t.club_id=e.team_id
       )) as missing_team_snapshots,
      (select count(*)::integer from per_team
       where rider_count < v_min_riders or rider_count > v_max_riders) as invalid_rider_sizes,
      (select coalesce(sum(missing_numbers),0)::integer from per_team) as missing_start_numbers,
      (select count(*)::integer from per_team
       where captain_count <> 1
          or captain_start_number is distinct from first_team_start_number) as invalid_captains,
      (select count(distinct r.team_id)::integer
       from public.race_participant_riders r
       where r.race_id=p_race_id
         and not exists (select 1 from eligible e where e.team_id=r.team_id)) as unexpected_rider_teams
  )
  select
    eligible_teams,
    missing_team_snapshots,
    invalid_rider_sizes,
    missing_start_numbers,
    invalid_captains,
    unexpected_rider_teams
  into
    v_eligible_teams,
    v_missing_team_snapshots,
    v_invalid_rider_sizes,
    v_missing_start_numbers,
    v_invalid_captains,
    v_unexpected_rider_teams
  from counts;

  v_ready :=
    v_team_list_finalized
    and v_current_game_at >= v_rider_deadline
    and v_eligible_teams >= v_min_teams
    and v_missing_team_snapshots = 0
    and v_invalid_rider_sizes = 0
    and v_missing_start_numbers = 0
    and v_invalid_captains = 0
    and v_unexpected_rider_teams = 0;

  v_reason := case
    when not v_team_list_finalized then 'team_list_not_finalized'
    when v_current_game_at < v_rider_deadline then 'rider_deadline_not_reached'
    when v_eligible_teams < v_min_teams then 'insufficient_eligible_teams'
    when v_missing_team_snapshots > 0 then 'missing_participant_team_snapshots'
    when v_invalid_rider_sizes > 0 then 'invalid_team_rider_counts'
    when v_missing_start_numbers > 0 then 'missing_start_numbers'
    when v_invalid_captains > 0 then 'invalid_team_captains'
    when v_unexpected_rider_teams > 0 then 'unexpected_participant_rider_teams'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,
    'reason',v_reason,
    'race_id',p_race_id,
    'current_game_at',v_current_game_at,
    'rider_deadline_game_at',v_rider_deadline,
    'team_list_finalized',v_team_list_finalized,
    'minimum_teams',v_min_teams,
    'eligible_teams',v_eligible_teams,
    'minimum_riders_per_team',v_min_riders,
    'maximum_riders_per_team',v_max_riders,
    'missing_participant_team_snapshots',v_missing_team_snapshots,
    'invalid_team_rider_counts',v_invalid_rider_sizes,
    'missing_start_numbers',v_missing_start_numbers,
    'invalid_team_captains',v_invalid_captains,
    'unexpected_participant_rider_teams',v_unexpected_rider_teams
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_race_startlist_engine_readiness_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_readiness jsonb;
  v_changed boolean := false;
begin
  v_readiness := public.race_startlist_engine_readiness_v1(p_race_id);

  if coalesce((v_readiness->>'ready')::boolean,false) then
    update public.races r
    set metadata = coalesce(r.metadata,'{}'::jsonb) || jsonb_build_object(
          'race_startlist_captains_finalized',true,
          'race_startlist_captains_finalized_at',coalesce(
            nullif(r.metadata->>'race_startlist_captains_finalized_at','')::timestamptz,
            now()
          ),
          'captains_pending_rider_deadline',false,
          'race_startlist_engine_reconciled',true,
          'race_startlist_engine_reconciled_at',now(),
          'race_startlist_engine_reconciliation_model','snapshot_invariants_v1'
        ),
        updated_at=now()
    where r.id=p_race_id
      and lower(coalesce(r.metadata->>'race_startlist_captains_finalized','false')) not in ('true','1','yes');
    get diagnostics v_changed = row_count;
  end if;

  return jsonb_build_object(
    'race_id',p_race_id,
    'changed',v_changed,
    'readiness',v_readiness
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_preflight_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_previous_stage_id uuid;
  v_previous_stage_published boolean := true;
  v_startlist jsonb := '{}'::jsonb;
  v_sporting_points jsonb := '{}'::jsonb;
  v_authoritative_count integer := 0;
  v_active_run_count integer := 0;
  v_recent_failed_count integer := 0;
  v_status text;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','BLOCKED','reason','stage_id_required');
  end if;

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;

  select s.id,s.race_id,s.stage_number,s.stage_date,s.name,
    s.planned_start_hour_number,s.planned_start_minute,
    coalesce(s.weather_cancelled,false) as weather_cancelled,
    r.name as race_name,r.status as race_status
  into v_stage
  from public.race_stages s join public.races r on r.id=s.race_id
  where s.id=p_stage_id;

  if not found then return jsonb_build_object('status','BLOCKED','reason','stage_not_found','stage_id',p_stage_id); end if;

  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  v_stage_start_game_at := public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone;
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  v_startlist := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  v_sporting_points := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);

  select p.id into v_previous_stage_id from public.race_stages p
  where p.race_id=v_stage.race_id and p.stage_number<v_stage.stage_number and not coalesce(p.weather_cancelled,false)
  order by p.stage_number desc limit 1;

  if v_previous_stage_id is not null then
    select exists(
      select 1 from public.race_stage_authoritative_runs a
      join public.race_stage_simulation_runs run on run.id=a.simulation_run_id
      where a.stage_id=v_previous_stage_id and a.engine_version='race_engine_ts_v1'
        and a.simulation_mode='deterministic_road_race_v1' and run.status='completed'
    ) into v_previous_stage_published;
  end if;

  select count(*)::integer into v_authoritative_count from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id;
  select count(*)::integer into v_active_run_count from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1');
  select count(*)::integer into v_recent_failed_count from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status='failed' and run.failed_at is not null and run.failed_at>clock_timestamp()-interval '10 minutes';

  if v_stage.weather_cancelled then v_status:='SKIPPED'; v_reason:='weather_cancelled';
  elsif v_control.singleton_id is null or v_control.active_engine<>'typescript_v1' or not coalesce(v_control.typescript_execution_enabled,false)
     or not coalesce(v_control.typescript_lifecycle_enabled,false) or coalesce(v_control.legacy_execution_enabled,false) then
    v_status:='BLOCKED'; v_reason:='universal_engine_control_disabled';
  elsif v_stage_start_game_at<v_control.typescript_activation_game_at then v_status:='BLOCKED'; v_reason:='before_activation_boundary';
  elsif v_authoritative_count>0 then v_status:='DONE'; v_reason:='authoritative_run_exists';
  elsif v_active_run_count>0 then v_status:='IN_PROGRESS'; v_reason:='universal_run_exists';
  elsif not coalesce((v_sporting_points->>'ready')::boolean,false) then v_status:='BLOCKED'; v_reason:='sporting_points_'||coalesce(v_sporting_points->>'reason','not_ready');
  elsif v_recent_failed_count>0 then v_status:='RETRY_COOLDOWN'; v_reason:='recent_failed_run';
  elsif not coalesce((v_startlist->>'ready')::boolean,false) then
    if v_current_game_at<v_calculation_due_game_at then v_status:='NORMAL_PENDING'; v_reason:=coalesce(v_startlist->>'reason','startlist_pending');
    else v_status:='BLOCKED'; v_reason:='startlist_'||coalesce(v_startlist->>'reason','not_ready'); end if;
  elsif v_previous_stage_id is not null and not v_previous_stage_published then
    if v_current_game_at<v_calculation_due_game_at then v_status:='NORMAL_PENDING'; v_reason:='waiting_previous_stage';
    else v_status:='BLOCKED'; v_reason:='previous_stage_not_published'; end if;
  elsif v_current_game_at<v_calculation_due_game_at then v_status:='READY'; v_reason:='ready_when_due';
  else v_status:='READY'; v_reason:='ready_to_claim'; end if;

  return jsonb_build_object(
    'status',v_status,'reason',v_reason,'stage_id',p_stage_id,'race_id',v_stage.race_id,'race_name',v_stage.race_name,
    'stage_number',v_stage.stage_number,'stage_name',v_stage.name,'race_status',v_stage.race_status,
    'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'previous_stage_id',v_previous_stage_id,'previous_stage_published',v_previous_stage_published,
    'startlist_readiness',v_startlist,'sporting_point_readiness',v_sporting_points,
    'authoritative_runs',v_authoritative_count,'active_universal_runs',v_active_run_count,'recent_failed_runs',v_recent_failed_count
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_sporting_point_profile_readiness_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_stage_sprints jsonb := '[]'::jsonb;
  v_stage_koms jsonb := '[]'::jsonb;
  v_profile_sprints jsonb := '[]'::jsonb;
  v_profile_koms jsonb := '[]'::jsonb;
  v_canonical_sprints jsonb := '[]'::jsonb;
  v_canonical_koms jsonb := '[]'::jsonb;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_start_km numeric := null;
  v_finish_km numeric := null;
  v_expected_finish_km numeric := null;
  v_visible_sources_match boolean := false;
  v_catalogue_exact_match boolean := false;
  v_ready boolean := false;
  v_reason text;
begin
  if p_stage_id is null then
    return jsonb_build_object('ready',false,'reason','stage_id_required');
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then
    return jsonb_build_object('ready',false,'reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last, created_at desc nulls last
  limit 1;
  v_profile_found := found;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
  into v_stage_sprints
  from (
    select nullif(item->>'km','')::numeric as km
    from jsonb_array_elements(case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array' then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end) item
    where nullif(item->>'km','') is not null
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
  into v_stage_koms
  from (
    select nullif(item->>'km','')::numeric as km,
           upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
    from jsonb_array_elements(case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array' then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end) item
    where nullif(item->>'km','') is not null
  ) x;

  if v_profile_found then
    select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
    into v_profile_sprints
    from (
      select nullif(item->>'km','')::numeric as km
      from jsonb_array_elements(case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array' then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end) item
      where nullif(item->>'km','') is not null
    ) x;

    select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
    into v_profile_koms
    from (
      select nullif(item->>'km','')::numeric as km,
             upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
      from jsonb_array_elements(case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array' then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end) item
      where nullif(item->>'km','') is not null
    ) x;
    v_expected_finish_km := coalesce(v_profile.distance_km,v_stage.distance_km);
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
    v_expected_finish_km := v_stage.distance_km;
  end if;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb)
  into v_canonical_sprints
  from (
    select km_from_start as km
    from public.race_stage_points
    where stage_id=p_stage_id and point_type in ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb)
  into v_canonical_koms
  from (
    select km_from_start as km,
           upper(regexp_replace(coalesce(nullif(kom_category,''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) as category
    from public.race_stage_points
    where stage_id=p_stage_id and point_type='KOM'
  ) x;

  select count(*)::integer,min(km_from_start)
  into v_start_count,v_start_km
  from public.race_stage_points
  where stage_id=p_stage_id and point_type='START';

  select count(*)::integer,min(km_from_start)
  into v_finish_count,v_finish_km
  from public.race_stage_points
  where stage_id=p_stage_id and (point_type='FINISH' or is_finish_point);

  v_visible_sources_match :=
    (not v_profile_found)
    or (
      v_stage_sprints=v_profile_sprints
      and v_stage_koms=v_profile_koms
      and abs(coalesce(v_stage.distance_km,0)-coalesce(v_profile.distance_km,v_stage.distance_km,0))<=0.01
    );

  v_catalogue_exact_match :=
    v_start_count=1
    and abs(coalesce(v_start_km,999999))<=0.01
    and v_finish_count=1
    and abs(coalesce(v_finish_km,-999999)-coalesce(v_expected_finish_km,999999))<=0.01
    and v_canonical_sprints=v_profile_sprints
    and v_canonical_koms=v_profile_koms;

  v_ready := v_visible_sources_match and v_catalogue_exact_match;

  v_reason := case
    when not v_visible_sources_match and v_stage_sprints<>v_profile_sprints then 'stage_json_profile_sprint_position_mismatch'
    when not v_visible_sources_match and v_stage_koms<>v_profile_koms then 'stage_json_profile_kom_position_category_mismatch'
    when not v_visible_sources_match then 'stage_json_profile_distance_mismatch'
    when v_start_count<>1 then 'canonical_start_count_mismatch'
    when abs(coalesce(v_start_km,999999))>0.01 then 'canonical_start_position_mismatch'
    when v_finish_count<>1 then 'canonical_finish_count_mismatch'
    when abs(coalesce(v_finish_km,-999999)-coalesce(v_expected_finish_km,999999))>0.01 then 'canonical_finish_position_mismatch'
    when v_canonical_sprints<>v_profile_sprints then 'canonical_sprint_position_mismatch'
    when v_canonical_koms<>v_profile_koms then 'canonical_kom_position_category_mismatch'
    else 'ready'
  end;

  return jsonb_build_object(
    'ready',v_ready,'reason',v_reason,'stage_id',p_stage_id,'profile_found',v_profile_found,
    'stage_json_sprints',v_stage_sprints,'profile_sprints',v_profile_sprints,'canonical_sprints',v_canonical_sprints,
    'stage_json_koms',v_stage_koms,'profile_koms',v_profile_koms,'canonical_koms',v_canonical_koms,
    'canonical_start_count',v_start_count,'canonical_start_km',v_start_km,
    'canonical_finish_count',v_finish_count,'canonical_finish_km',v_finish_km,'expected_finish_km',v_expected_finish_km,
    'visible_sources_match',v_visible_sources_match,'catalogue_exact_match',v_catalogue_exact_match,
    'readiness_model','profile_catalogue_exact_positions_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage public.race_stages%rowtype;
  v_profile public.race_stage_profile_details%rowtype;
  v_profile_found boolean := false;
  v_readiness jsonb;
  v_stage_sprints jsonb;
  v_stage_koms jsonb;
  v_profile_sprints jsonb;
  v_profile_koms jsonb;
  v_stage_sprint_norm jsonb := '[]'::jsonb;
  v_stage_kom_norm jsonb := '[]'::jsonb;
  v_profile_sprint_norm jsonb := '[]'::jsonb;
  v_profile_kom_norm jsonb := '[]'::jsonb;
  v_profile_sprint_count integer := 0;
  v_profile_kom_count integer := 0;
  v_marker jsonb;
  v_scoring jsonb;
  v_points jsonb;
  v_bonus jsonb;
  v_default_sprint_points jsonb := '[12,8,5,3,1]'::jsonb;
  v_default_kom_points jsonb := '{}'::jsonb;
  v_idx integer;
  v_sort integer := 20;
  v_km numeric;
  v_category text;
  v_name text;
  v_finish_kom_category text := null;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('stage_point_reconcile:'||p_stage_id::text,0));

  if exists (select 1 from public.race_stage_authoritative_runs where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','authoritative_run_exists','stage_id',p_stage_id);
  end if;
  if exists (select 1 from public.race_stage_point_results where stage_id=p_stage_id) then
    return jsonb_build_object('status','not_modified','reason','official_point_results_exist','stage_id',p_stage_id);
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;

  select * into v_profile
  from public.race_stage_profile_details
  where stage_id=p_stage_id
  order by updated_at desc nulls last,created_at desc nulls last
  limit 1;
  v_profile_found := found;

  v_stage_sprints := case when jsonb_typeof(coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb))='array' then coalesce(v_stage.intermediate_sprints_json,'[]'::jsonb) else '[]'::jsonb end;
  v_stage_koms := case when jsonb_typeof(coalesce(v_stage.mountain_climbs_json,'[]'::jsonb))='array' then coalesce(v_stage.mountain_climbs_json,'[]'::jsonb) else '[]'::jsonb end;

  if v_profile_found then
    v_profile_sprints := case when jsonb_typeof(coalesce(v_profile.intermediate_sprints,'[]'::jsonb))='array' then coalesce(v_profile.intermediate_sprints,'[]'::jsonb) else '[]'::jsonb end;
    v_profile_koms := case when jsonb_typeof(coalesce(v_profile.mountain_climbs,'[]'::jsonb))='array' then coalesce(v_profile.mountain_climbs,'[]'::jsonb) else '[]'::jsonb end;
  else
    v_profile_sprints := v_stage_sprints;
    v_profile_koms := v_stage_koms;
  end if;

  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb) into v_stage_sprint_norm
  from (select nullif(item->>'km','')::numeric km from jsonb_array_elements(v_stage_sprints) item where nullif(item->>'km','') is not null) x;
  select coalesce(jsonb_agg(to_jsonb(km) order by km),'[]'::jsonb) into v_profile_sprint_norm
  from (select nullif(item->>'km','')::numeric km from jsonb_array_elements(v_profile_sprints) item where nullif(item->>'km','') is not null) x;

  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb) into v_stage_kom_norm
  from (select nullif(item->>'km','')::numeric km,upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) category from jsonb_array_elements(v_stage_koms) item where nullif(item->>'km','') is not null) x;
  select coalesce(jsonb_agg(jsonb_build_object('km',km,'category',category) order by km,category),'[]'::jsonb) into v_profile_kom_norm
  from (select nullif(item->>'km','')::numeric km,upper(regexp_replace(coalesce(nullif(item->>'category',''),nullif(item->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i')) category from jsonb_array_elements(v_profile_koms) item where nullif(item->>'km','') is not null) x;

  if v_stage_sprint_norm<>v_profile_sprint_norm or v_stage_kom_norm<>v_profile_kom_norm or (v_profile_found and abs(coalesce(v_stage.distance_km,0)-coalesce(v_profile.distance_km,v_stage.distance_km,0))>0.01) then
    return jsonb_build_object('status','blocked','reason','stage_json_profile_exact_mismatch','stage_id',p_stage_id,
      'stage_json_sprints',v_stage_sprint_norm,'profile_sprints',v_profile_sprint_norm,'stage_json_koms',v_stage_kom_norm,'profile_koms',v_profile_kom_norm,
      'stage_distance_km',v_stage.distance_km,'profile_distance_km',case when v_profile_found then v_profile.distance_km else null end);
  end if;

  v_profile_sprint_count := jsonb_array_length(v_profile_sprints);
  v_profile_kom_count := jsonb_array_length(v_profile_koms);

  select payload->'points' into v_default_sprint_points from public.race_rules_config where code='intermediate_sprint_points_v1';
  v_default_sprint_points := coalesce(v_default_sprint_points,'[12,8,5,3,1]'::jsonb);
  select payload into v_default_kom_points from public.race_rules_config where code='kom_points_default_v1';
  v_default_kom_points := coalesce(v_default_kom_points,'{}'::jsonb);

  if coalesce(v_stage.is_summit_finish,false) then
    select nullif(regexp_replace(coalesce(item->>'category',item->>'kom_category',''),'^Cat[[:space:]]*','','i'),'')
    into v_finish_kom_category
    from jsonb_array_elements(v_stage_koms) item
    where coalesce(nullif(item->>'km','')::numeric,-1) between v_stage.distance_km::numeric-0.1 and v_stage.distance_km::numeric+0.1
    order by coalesce(nullif(item->>'km','')::numeric,0) desc limit 1;
    if v_finish_kom_category not in ('HC','1','2','3','4') then v_finish_kom_category:=null; end if;
  end if;

  delete from public.race_stage_points where stage_id=p_stage_id;
  perform public.seed_required_stage_points_v1(p_stage_id,v_finish_kom_category);

  for v_idx in 0..greatest(v_profile_sprint_count-1,-1) loop
    exit when v_profile_sprint_count=0;
    v_marker:=v_profile_sprints->v_idx;
    v_scoring:=v_stage_sprints->v_idx;
    v_km:=coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_points:=case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0 then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0 then v_marker->'points_scheme' else v_default_sprint_points end;
    v_bonus:=case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds' else '[]'::jsonb end;
    if v_km is null then raise exception 'Cannot reconcile sprint marker % for stage %: km missing.',v_idx+1,p_stage_id; end if;
    v_name:=coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Sprint '||(v_idx+1)::text);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'INTERMEDIATE_SPRINT',v_km,v_name,null,v_points,v_bonus,false,v_sort,jsonb_build_object('source','profile_stage_json_reconciliation_exact_v3','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  for v_idx in 0..greatest(v_profile_kom_count-1,-1) loop
    exit when v_profile_kom_count=0;
    v_marker:=v_profile_koms->v_idx;
    v_scoring:=v_stage_koms->v_idx;
    v_km:=coalesce(nullif(v_marker->>'km','')::numeric,nullif(v_scoring->>'km','')::numeric);
    v_category:=upper(regexp_replace(coalesce(nullif(v_marker->>'category',''),nullif(v_marker->>'kom_category',''),nullif(v_scoring->>'category',''),nullif(v_scoring->>'kom_category',''),'4'),'^CAT(EGORY)?[[:space:]]*','','i'));
    if v_category not in ('HC','1','2','3','4') then v_category:='4'; end if;
    v_points:=case when jsonb_typeof(v_scoring->'points_scheme')='array' and jsonb_array_length(v_scoring->'points_scheme')>0 then v_scoring->'points_scheme'
      when jsonb_typeof(v_marker->'points_scheme')='array' and jsonb_array_length(v_marker->'points_scheme')>0 then v_marker->'points_scheme'
      when jsonb_typeof(v_default_kom_points->v_category)='array' then v_default_kom_points->v_category else '[]'::jsonb end;
    v_bonus:=case when jsonb_typeof(v_scoring->'time_bonus_seconds')='array' then v_scoring->'time_bonus_seconds'
      when jsonb_typeof(v_marker->'time_bonus_seconds')='array' then v_marker->'time_bonus_seconds' else '[]'::jsonb end;
    if v_km is null or jsonb_typeof(v_points)<>'array' or jsonb_array_length(v_points)=0 then raise exception 'Cannot reconcile KOM marker % for stage %: km/points scheme missing.',v_idx+1,p_stage_id; end if;
    v_name:=coalesce(nullif(v_marker->>'name',''),nullif(v_marker->>'label',''),nullif(v_scoring->>'name',''),'Cat '||v_category);
    insert into public.race_stage_points(stage_id,point_type,km_from_start,name,kom_category,points_scheme,time_bonus_seconds,is_finish_point,sort_order,metadata,updated_at)
    values(p_stage_id,'KOM',v_km,v_name,v_category,v_points,v_bonus,false,v_sort,jsonb_build_object('source','profile_stage_json_reconciliation_exact_v3','profile_marker_index',v_idx,'reconciled_at',clock_timestamp()),clock_timestamp());
    v_sort:=v_sort+10;
  end loop;

  update public.race_stage_points set sort_order=10,updated_at=clock_timestamp() where stage_id=p_stage_id and point_type='START';
  update public.race_stage_points set sort_order=v_sort+10,updated_at=clock_timestamp(),is_finish_point=true where stage_id=p_stage_id and point_type='FINISH';

  v_readiness:=public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  return jsonb_build_object('status',case when coalesce((v_readiness->>'ready')::boolean,false) then 'reconciled' else 'blocked' end,
    'reason',coalesce(v_readiness->>'reason','unknown'),'stage_id',p_stage_id,'readiness',v_readiness);
exception when others then
  return jsonb_build_object('status','blocked','reason','reconciliation_error','stage_id',p_stage_id,'error',sqlerrm);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_application_preselection_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record;
  v_today_ordinal integer;
  r record;
  v_target integer;
  v_human_count integer;
  v_provisional integer := 0;
  v_reserves integer := 0;
  v_declined integer := 0;
  v_processed integer := 0;
  v_results jsonb := '[]'::jsonb;
begin
  select * into v_current
  from public.get_current_game_date_parts()
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'error', 'current_game_date_not_found');
  end if;

  v_today_ordinal := public.game_date_ordinal_v1(
    v_current.season_number,
    v_current.month_number,
    v_current.day_number
  );

  for r in
    select
      race.id as race_id,
      race.name as race_name,
      race.start_date,
      rules.target_teams,
      rules.min_teams,
      rules.max_teams,
      rules.team_list_announcement_season_number,
      rules.team_list_announcement_month_number,
      rules.team_list_announcement_day_number
    from public.races race
    join public.race_entry_rules rules on rules.race_id = race.id
    where race.status = 'scheduled'
      and extract(year from race.start_date)::integer - 1999 = v_current.season_number
      and extract(month from race.start_date)::integer >= 2
      and public.game_date_ordinal_v1(
            extract(year from race.start_date)::integer - 1999,
            extract(month from race.start_date)::integer,
            extract(day from race.start_date)::integer
          ) - 30 <= v_today_ordinal
      and public.game_date_ordinal_v1(
            rules.team_list_announcement_season_number,
            rules.team_list_announcement_month_number,
            rules.team_list_announcement_day_number
          ) > v_today_ordinal
      and lower(coalesce(race.metadata ->> 'application_preselection_completed', 'false')) not in ('true','1','yes')
    order by race.start_date, race.name
  loop
    v_target := coalesce(r.target_teams, r.min_teams, r.max_teams, 16);

    update public.race_team_entries e
    set
      commitment_score_snapshot = coalesce(
        e.commitment_score_snapshot,
        public.get_or_create_club_race_commitment_score_v1(e.club_id)
      ),
      acceptance_score = coalesce(
        e.acceptance_score,
        coalesce(
          e.commitment_score_snapshot,
          public.get_or_create_club_race_commitment_score_v1(e.club_id),
          50
        ) + (random() * 10)
      ),
      updated_at = now()
    where e.race_id = r.race_id
      and coalesce(e.is_ai_filler, false) = false
      and lower(coalesce(e.entry_source::text, 'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted');

    select count(*)::integer into v_human_count
    from public.race_team_entries e
    where e.race_id = r.race_id
      and coalesce(e.is_ai_filler, false) = false
      and lower(coalesce(e.entry_source::text, 'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted');

    v_provisional := 0;
    v_reserves := 0;
    v_declined := 0;

    if v_human_count > v_target + 2 then
      with ranked as (
        select e.id,
               row_number() over (
                 order by coalesce(e.acceptance_score,0) desc,
                          e.created_at asc,
                          e.id
               ) as rn
        from public.race_team_entries e
        where e.race_id = r.race_id
          and coalesce(e.is_ai_filler, false) = false
          and lower(coalesce(e.entry_source::text, 'user')) not in ('ai','ai_fill','ai_filler')
          and e.status in ('applied','under_review','provisionally_accepted')
      ), changed as (
        update public.race_team_entries e
        set
          status = case
            when ranked.rn <= v_target then 'provisionally_accepted'
            when ranked.rn <= v_target + 2 then 'under_review'
            else 'declined'
          end,
          review_round = 1,
          reviewed_at = now(),
          final_decision_at = case when ranked.rn > v_target + 2 then now() else null end,
          decision_reason = case
            when ranked.rn <= v_target then
              'Provisionally selected in the 30-day preliminary race application review. Final confirmation occurs when applications close.'
            when ranked.rn <= v_target + 2 then
              'Reserve #' || (ranked.rn - v_target)::text || ' after the 30-day preliminary race application review.'
            else
              'Declined in the 30-day preliminary race application review because the team ranked outside the target field plus two reserves.'
          end,
          updated_at = now()
        from ranked
        where e.id = ranked.id
        returning e.status, e.decision_reason
      )
      select
        count(*) filter (where status='provisionally_accepted')::integer,
        count(*) filter (where status='under_review' and decision_reason like 'Reserve #%')::integer,
        count(*) filter (where status='declined')::integer
      into v_provisional, v_reserves, v_declined
      from changed;
    end if;

    update public.races
    set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'application_preselection_completed', true,
          'application_preselection_completed_at', now(),
          'application_preselection_game_date', public.game_date_display_v1(
            v_current.season_number, v_current.month_number, v_current.day_number
          ),
          'application_preselection_target_teams', v_target,
          'application_preselection_reserve_slots', 2,
          'application_preselection_human_applicants', v_human_count,
          'application_preselection_provisional', v_provisional,
          'application_preselection_reserves', v_reserves,
          'application_preselection_declined', v_declined
        ),
        updated_at = now()
    where id = r.race_id;

    v_processed := v_processed + 1;
    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'race_id', r.race_id,
      'race_name', r.race_name,
      'target_teams', v_target,
      'human_applicants', v_human_count,
      'provisional', v_provisional,
      'reserves', v_reserves,
      'declined', v_declined
    ));
  end loop;

  return jsonb_build_object(
    'success', true,
    'processed_races', v_processed,
    'results', v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_application_window_notifications_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_current record; v_daily jsonb; u record; v_rule_count int:=0;
begin
  select * into v_current from public.get_current_game_date_parts() limit 1;
  if not found then return jsonb_build_object('success',false,'error','current_game_date_not_found'); end if;
  v_daily:=public.process_race_application_daily_update_v1();
  if v_current.month_number=1 and v_current.day_number=15 then
    for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
      perform public.create_user_game_notification_v1(u.user_id,'RACE_APPLICATION_RULE_CHANGE','Race application deadlines are changing',
        'Late-January races now close 3 days before the start. From February onward, applications close 7 days before each race. Review the calendar and apply early.',
        '/dashboard/calendar',jsonb_build_object('season_number',v_current.season_number,'rule','january_16_31_close_d3_february_onward_close_d7','preference_group','raceApplicationResults'),
        format('race_application_rule_change:s%s:jan15:%s',v_current.season_number,u.user_id),null);
      v_rule_count:=v_rule_count+1;
    end loop;
  end if;
  return jsonb_build_object('success',true,'daily_update',v_daily,'rule_change_users',v_rule_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_application_deadlines_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_preselection jsonb;
  v_core jsonb;
  v_sync jsonb;
begin
  v_preselection := public.process_race_application_preselection_v1();
  v_core := public.process_race_application_deadlines_v1_legacy_before_preselection();
  -- Force the shared status view to use the canonical exclusive close boundary.
  v_sync := public.sync_race_application_statuses_v1();
  return coalesce(v_core,'{}'::jsonb) || jsonb_build_object(
    'preselection',v_preselection,
    'status_sync',v_sync
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prepare_next_season_race_calendar_v1(p_source_season integer, p_target_season integer, p_late_recovery boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_sprint_layout jsonb;
  r record;
  v_recalculated integer := 0;
begin
  v_result := public.prepare_next_season_race_calendar_v1_legacy_before_application_deadline_policy(
    p_source_season,p_target_season,p_late_recovery
  );

  if coalesce((v_result->>'ok')::boolean,false) then
    v_sprint_layout := public.race_apply_future_flat_sprint_layout_v1(
      p_source_season,p_target_season,false
    );

    for r in
      select rer.race_id
      from public.race_entry_rules rer
      where rer.race_season_number=p_target_season
    loop
      perform * from public.recalculate_race_entry_deadlines_v1(r.race_id);
      v_recalculated := v_recalculated + 1;
    end loop;
  else
    v_sprint_layout := jsonb_build_object(
      'ok',false,
      'skipped',true,
      'reason','calendar_prepare_failed'
    );
  end if;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'application_deadlines_recalculated',v_recalculated,
    'application_deadline_policy_version','jan_late_d3_feb_onward_d7_v1',
    'flat_sprint_layout',v_sprint_layout
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_race_application_and_jersey_notification_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text;
  v_payload jsonb := coalesce(new.payload_json, '{}'::jsonb);
  v_race_id uuid;
  v_race_name text;
  v_team_id uuid;
  v_team_name text;
  v_opened_count integer;
  v_required integer;
  v_available integer;
  v_missing integer;
begin
  select nt.code
  into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_code not in (
    'RACE_TEAM_DISQUALIFIED_JERSEYS',
    'RACE_APPLICATION_CLOSING_SOON',
    'RACE_APPLICATION_WINDOW_OPEN',
    'RACE_APPLICATION_RULE_CHANGE'
  ) then
    return new;
  end if;

  if v_code = 'RACE_TEAM_DISQUALIFIED_JERSEYS' then
    begin
      v_race_id := nullif(v_payload->>'race_id', '')::uuid;
    exception when invalid_text_representation then
      v_race_id := null;
    end;

    begin
      v_team_id := nullif(v_payload->>'team_id', '')::uuid;
    exception when invalid_text_representation then
      v_team_id := null;
    end;

    if v_race_id is not null then
      select r.name into v_race_name
      from public.races r
      where r.id = v_race_id;
    end if;

    if v_team_id is not null then
      select c.name into v_team_name
      from public.clubs c
      where c.id = v_team_id;
    end if;

    v_required := greatest(0, coalesce(nullif(v_payload->>'required_jersey_units', '')::integer, 0));
    v_available := greatest(0, coalesce(nullif(v_payload->>'available_jersey_units', '')::integer, 0));
    v_missing := greatest(v_required - v_available, 0);

    new.action_url := '/dashboard/equipment';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Team%20removed%20from%20race.png',
      'equipment_path', '/dashboard/equipment',
      'race_name', coalesce(v_race_name, v_payload->>'race_name'),
      'team_name', coalesce(v_team_name, v_payload->>'team_name'),
      'missing_jersey_units', v_missing,
      'required_jersey_units', v_required,
      'available_jersey_units', v_available
    );

  elsif v_code = 'RACE_APPLICATION_WINDOW_OPEN' then
    v_opened_count := coalesce(nullif(v_payload->>'opened_count', '')::integer, 0);
    v_race_name := nullif(coalesce(v_payload->>'race_name', v_payload->>'sample_races'), '');

    begin
      v_race_id := nullif(v_payload->>'race_id', '')::uuid;
    exception when invalid_text_representation then
      v_race_id := null;
    end;

    if v_opened_count = 1 and v_race_id is null and v_race_name is not null then
      select r.id, r.name
      into v_race_id, v_race_name
      from public.races r
      where r.name = v_race_name
        and coalesce(r.status, '') <> 'archived'
      order by case when r.status = 'scheduled' then 0 else 1 end, r.created_at desc
      limit 1;
    end if;

    new.action_url := case
      when v_opened_count = 1 and v_race_id is not null
        then '/dashboard/races/' || v_race_id::text
      else '/dashboard/calendar'
    end;

    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png',
      'calendar_path', '/dashboard/calendar'
    ) || case
      when v_opened_count = 1 and v_race_id is not null then jsonb_build_object(
        'race_id', v_race_id,
        'race_name', v_race_name,
        'race_path', '/dashboard/races/' || v_race_id::text
      )
      else '{}'::jsonb
    end;

  elsif v_code = 'RACE_APPLICATION_CLOSING_SOON' then
    new.action_url := '/dashboard/calendar';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20aplication%20close%20in%203%20days.png',
      'calendar_path', '/dashboard/calendar',
      'days_until_close', 3
    );

  elsif v_code = 'RACE_APPLICATION_RULE_CHANGE' then
    new.action_url := '/dashboard/calendar';
    new.payload_json := v_payload || jsonb_build_object(
      'image_url', 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20apploicaiton%20deadline.png',
      'calendar_path', '/dashboard/calendar',
      'late_january_close_days', 3,
      'february_onward_close_days', 7
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_stage_planned_start_game_at_v1(p_stage_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_date date;
  v_hour integer;
  v_minute integer;
  v_label text;
begin
  select
    s.stage_date::date,
    coalesce(r.planned_start_hour_number, s.planned_start_hour_number),
    coalesce(r.planned_start_minute, s.planned_start_minute, 0),
    coalesce(
      nullif(r.planned_start_time_label,''),
      nullif(s.planned_start_time_label,''),
      nullif(to_jsonb(s)->>'start_time_label','')
    )
  into v_date, v_hour, v_minute, v_label
  from public.race_stages s
  join public.races r on r.id = s.race_id
  where s.id = p_stage_id;

  if v_date is null then
    return null;
  end if;

  if v_hour is null then
    if coalesce(v_label,'') ~ '^[0-2][0-9]:[0-5][0-9]$' then
      v_hour := split_part(v_label,':',1)::integer;
      v_minute := split_part(v_label,':',2)::integer;
    else
      return null;
    end if;
  end if;

  if v_hour < 0 or v_hour > 23 or coalesce(v_minute,0) < 0 or coalesce(v_minute,0) > 59 then
    return null;
  end if;

  return make_timestamptz(
    extract(year from v_date)::integer,
    extract(month from v_date)::integer,
    extract(day from v_date)::integer,
    v_hour,
    coalesce(v_minute,0),
    0,
    'UTC'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_team_stage_eligibility_v1(p_stage_id uuid, p_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_race record;
  v_team record;
  v_owner uuid;
  v_owner_name text;
  v_required integer := 0;
  v_effective integer := 0;
  v_current_effective integer := 0;
  v_missing integer := 0;
  v_total_owned integer := 0;
  v_same_day_used integer := 0;
  v_reserved integer := 0;
  v_blocked boolean := false;
  v_reason text;
  v_start_at timestamptz;
  v_hours numeric;
  v_status text;
  v_explanation text;
  v_ratio numeric := 0;
  v_prep_penalty numeric := 0;
  v_energy_penalty numeric := 0;
  v_fatigue_penalty numeric := 0;
begin
  select s.id,s.race_id,s.stage_number,s.stage_date::date as stage_date
  into v_stage
  from public.race_stages s
  where s.id=p_stage_id;

  if v_stage.id is null then
    return jsonb_build_object('status','stage_not_found','stage_id',p_stage_id,'team_id',p_team_id);
  end if;

  select r.id,r.name,r.category,coalesce(r.is_stage_race,false) as is_stage_race
  into v_race
  from public.races r
  where r.id=v_stage.race_id;

  select c.id,c.name,coalesce(c.is_ai,false) as is_ai
  into v_team
  from public.clubs c
  where c.id=p_team_id;

  if v_team.id is null then
    return jsonb_build_object('status','team_not_found','stage_id',p_stage_id,'team_id',p_team_id);
  end if;

  v_owner := public.universal_race_resource_owner_club_v1(p_team_id);
  select c.name into v_owner_name from public.clubs c where c.id=v_owner;

  v_required := public.universal_race_team_required_jerseys_v1(v_stage.race_id,p_team_id);
  v_current_effective := public.universal_race_stage_effective_supply_available_v1(
    p_stage_id,p_team_id,'race_jersey_complete'
  );
  v_effective := greatest(coalesce(v_current_effective,0),0);
  v_reserved := public.universal_race_stage_other_supply_reservations_v1(
    p_stage_id,p_team_id,'race_jersey_complete'
  );

  select count(*)::integer
  into v_total_owned
  from public.club_race_supply_units u
  where u.club_id=v_owner
    and u.supply_key='race_jersey_complete'
    and u.status in ('ready','assigned')
    and u.stage_uses_remaining>0;

  select count(*)::integer
  into v_same_day_used
  from public.club_race_supply_units u
  where u.club_id=v_owner
    and u.supply_key='race_jersey_complete'
    and u.status in ('ready','assigned')
    and u.stage_uses_remaining>0
    and u.last_used_game_date=v_stage.stage_date;

  -- Jersey shortages are explicitly NOT disqualifications under the current rule.
  select true,d.reason_code
  into v_blocked,v_reason
  from public.race_team_stage_disqualifications d
  where d.race_id=v_stage.race_id
    and d.team_id=p_team_id
    and v_stage.stage_number>=d.from_stage_number
    and d.reason_code <> 'mandatory_race_jersey_shortage'
  order by d.from_stage_number desc,d.created_at desc
  limit 1;
  v_blocked := coalesce(v_blocked,false);

  v_missing := greatest(v_required-v_effective,0);
  if v_required > 0 then
    v_ratio := least(1::numeric, greatest(0::numeric, v_missing::numeric / v_required::numeric));
  end if;
  v_prep_penalty := round(30::numeric*v_ratio,2);
  v_energy_penalty := round(8::numeric*v_ratio,2);
  v_fatigue_penalty := round(15::numeric*v_ratio,2);

  v_start_at := public.race_stage_planned_start_game_at_v1(p_stage_id);
  if v_start_at is not null then
    v_hours := extract(epoch from (v_start_at-public.get_current_game_timestamp()))/3600.0;
  end if;

  v_status := case
    when v_blocked then 'entry_blocked'
    when v_missing>0 then 'at_risk'
    else 'eligible'
  end;

  v_explanation := case
    when v_blocked then
      format('The team is blocked for a non-jersey eligibility reason: %s.',coalesce(v_reason,'unknown'))
    when v_missing>0 then
      format('%s Race Jersey Kits are needed for full race support, but only %s are effectively available. The team can still race. Current shortage penalty: -%s%% positive preparation bonuses, +%s%% in-stage energy cost and +%s%% post-stage fatigue.',
        v_required,v_effective,v_prep_penalty,v_energy_penalty,v_fatigue_penalty)
    else
      format('Full Race Jersey coverage is available: %s required and %s effectively available.',v_required,v_effective)
  end;

  return jsonb_build_object(
    'status',v_status,
    'severity',case when v_blocked then 'blocked' when v_missing>0 then 'warning' else 'ok' end,
    'race_id',v_stage.race_id,
    'race_name',v_race.name,
    'race_class_code',v_race.category,
    'is_stage_race',v_race.is_stage_race,
    'stage_id',p_stage_id,
    'stage_number',v_stage.stage_number,
    'stage_date',v_stage.stage_date,
    'stage_start_game_at',v_start_at,
    'hours_until_stage_start',case when v_hours is null then null else round(v_hours,2) end,
    'team_id',p_team_id,
    'team_name',v_team.name,
    'resource_owner_club_id',v_owner,
    'resource_owner_club_name',v_owner_name,
    'required_jersey_units',v_required,
    'effective_available_jersey_units',v_effective,
    'current_effective_available_jersey_units',v_current_effective,
    'missing_jersey_units',v_missing,
    'jersey_shortage_ratio',round(v_ratio,6),
    'preparation_bonus_reduction_pct',v_prep_penalty,
    'energy_cost_penalty_pct',v_energy_penalty,
    'post_stage_fatigue_penalty_pct',v_fatigue_penalty,
    'total_usable_owned_units_before_same_day_rule',v_total_owned,
    'same_day_used_units',v_same_day_used,
    'other_race_reserved_units',v_reserved,
    'already_disqualified',v_blocked,
    'disqualification_reason_code',v_reason,
    'allowed_to_race',not v_blocked,
    'explanation',v_explanation,
    'action_url','/dashboard/equipment?tab=race-supplies',
    'race_preparation_url','/dashboard/race-preparation?tab=acceptedRaces&raceId='||v_stage.race_id::text,
    'consequence',case
      when v_blocked then 'team_blocked_for_non_jersey_reason'
      when v_missing>0 then 'team_races_with_proportional_performance_penalty'
      else 'full_jersey_support_no_penalty'
    end,
    'jersey_rule','optional_with_proportional_performance_penalty_v1',
    'eligibility_model','canonical_effective_race_supply_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_my_critical_race_eligibility_alerts_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp', 'auth'
AS $function$
declare
  v_user uuid := auth.uid();
  v_today date := public.get_current_game_date_date();
  v_alerts jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  with candidate as (
    select distinct on (t.race_id,t.club_id)
      t.race_id,t.club_id as team_id,s.id as stage_id,s.stage_date,s.stage_number
    from public.race_participant_teams_v1 t
    join public.races r on r.id=t.race_id
    join public.race_stages s on s.race_id=t.race_id
    join public.clubs owner on owner.id=public.universal_race_resource_owner_club_v1(t.club_id)
    where owner.owner_user_id=v_user
      and coalesce((select c.is_ai from public.clubs c where c.id=t.club_id),false)=false
      and lower(coalesce(t.status,'accepted'))='accepted'
      and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
      and s.stage_date::date between v_today and v_today+7
      and not coalesce(s.weather_cancelled,false)
    order by t.race_id,t.club_id,s.stage_date,s.stage_number,s.id
  ), eligibility as (
    select c.*,public.race_team_stage_eligibility_v1(c.stage_id,c.team_id) as e from candidate c
  )
  select coalesce(jsonb_agg(e.e order by e.stage_date,e.stage_number),'[]'::jsonb)
  into v_alerts
  from eligibility e
  where e.e->>'status' in ('at_risk','entry_blocked');

  return jsonb_build_object(
    'status','ok',
    'current_game_at',public.get_current_game_timestamp(),
    'alert_count',jsonb_array_length(v_alerts),
    'alerts',v_alerts,
    'persistent_until_resolved',true
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_mandatory_race_jersey_escalation_v1(p_user_id uuid, p_eligibility jsonb, p_level text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_title text;
  v_message text;
  v_event_key text;
  v_id bigint;
  v_race_id uuid := nullif(p_eligibility->>'race_id','')::uuid;
  v_stage_id uuid := nullif(p_eligibility->>'stage_id','')::uuid;
  v_team_id uuid := nullif(p_eligibility->>'team_id','')::uuid;
  v_race_name text := coalesce(p_eligibility->>'race_name','the race');
  v_required integer := coalesce((p_eligibility->>'required_jersey_units')::integer,0);
  v_available integer := coalesce((p_eligibility->>'effective_available_jersey_units')::integer,0);
  v_missing integer := coalesce((p_eligibility->>'missing_jersey_units')::integer,0);
  v_prep numeric := coalesce((p_eligibility->>'preparation_bonus_reduction_pct')::numeric,0);
  v_energy numeric := coalesce((p_eligibility->>'energy_cost_penalty_pct')::numeric,0);
  v_fatigue numeric := coalesce((p_eligibility->>'post_stage_fatigue_penalty_pct')::numeric,0);
  v_hours numeric := nullif(p_eligibility->>'hours_until_stage_start','')::numeric;
begin
  if p_user_id is null or v_race_id is null or v_stage_id is null or v_team_id is null then return null; end if;

  if p_level='initial' then
    return public.create_mandatory_race_jersey_warning_v1(p_user_id,v_race_id,v_stage_id,v_team_id,v_required,v_available);
  elsif p_level='final' then
    v_title := 'Race Jersey shortage — penalty will apply';
    v_message := format('%s still has %s usable Race Jersey Kits for %s riders in %s. The team will still race, but the current shortage applies -%s%% positive preparation bonuses, +%s%% energy cost and +%s%% post-stage fatigue. Add %s kit%s before the stage to reduce the penalty.',
      coalesce(p_eligibility->>'team_name','Your team'),v_available,v_required,v_race_name,v_prep,v_energy,v_fatigue,v_missing,case when v_missing=1 then '' else 's' end);
  else
    v_title := 'Race Jersey shortage — performance affected';
    v_message := format('%s has a Race Jersey shortage for %s. The team remains eligible to race. Current penalty: -%s%% positive preparation bonuses, +%s%% energy cost and +%s%% post-stage fatigue%s.',
      coalesce(p_eligibility->>'team_name','Your team'),v_race_name,v_prep,v_energy,v_fatigue,
      case when v_hours is not null then format('. About %s game hours remain to improve jersey coverage',greatest(round(v_hours,1),0)) else '' end);
  end if;

  v_event_key := 'mandatory_jersey_'||p_level||':'||v_race_id::text||':'||v_stage_id::text||':'||v_team_id::text;
  select public.ppm_create_user_notification_direct_v1(
    p_user_id,'RACE_JERSEYS_MANDATORY_WARNING',v_title,v_message,
    '/dashboard/equipment?tab=race-supplies',
    p_eligibility || jsonb_build_object(
      'mandatory',false,'performance_penalty',true,'advisor_notification',false,
      'event_type','race_jersey_shortage_'||p_level,
      'alert_level',p_level,'persistent_dashboard_alert',true,
      'team_remains_in_race',true,
      'normal_missed_start_penalty_applies_if_disqualified',false,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png'
    ),
    v_event_key
  ) into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_critical_race_eligibility_alerts_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_today date := public.get_current_game_date_date();
  x record;
  e jsonb;
  st public.race_eligibility_notification_state%rowtype;
  v_state_found boolean;
  v_hours numeric;
  v_signature text;
  v_initial boolean;
  v_urgent boolean;
  v_final boolean;
  v_checked integer:=0;
  v_active integer:=0;
  v_initial_count integer:=0;
  v_urgent_count integer:=0;
  v_final_count integer:=0;
  v_resolved integer:=0;
begin
  for x in
    with next_stage as (
      select distinct on (t.race_id,t.club_id)
        t.race_id,t.club_id as team_id,
        public.universal_race_resource_owner_club_v1(t.club_id) as resource_owner_club_id,
        s.id as stage_id,s.stage_date,s.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages s on s.race_id=t.race_id
      where lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and lower(coalesce(t.status,'accepted'))='accepted'
        and s.stage_date::date between v_today and v_today+7
        and not coalesce(s.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.id)
      order by t.race_id,t.club_id,s.stage_date,s.stage_number,s.id
    )
    select n.*,owner.owner_user_id,c.name as team_name
    from next_stage n
    join public.clubs owner on owner.id=n.resource_owner_club_id
    join public.clubs c on c.id=n.team_id
    where owner.owner_user_id is not null and coalesce(c.is_ai,false)=false
  loop
    perform public.sync_race_supply_units_from_summary_v1(x.resource_owner_club_id);
    e := public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
    v_checked := v_checked+1;

    select * into st from public.race_eligibility_notification_state s where s.stage_id=x.stage_id and s.team_id=x.team_id;
    v_state_found := found;

    if e->>'status'='at_risk' then
      v_active := v_active+1;
      v_hours := nullif(e->>'hours_until_stage_start','')::numeric;
      v_signature := md5(concat_ws('|',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
      v_initial := (not v_state_found) or st.condition_active=false or st.initial_notified_at is null or st.last_signature is distinct from v_signature;
      v_urgent := v_hours is not null and v_hours>3 and v_hours<=24 and ((not v_state_found) or st.urgent_notified_at is null or st.last_signature is distinct from v_signature);
      v_final := v_hours is not null and v_hours>0 and v_hours<=3 and ((not v_state_found) or st.final_notified_at is null or st.last_signature is distinct from v_signature);

      if v_initial then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'initial');
        v_initial_count:=v_initial_count+1;
      end if;
      if v_urgent then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'urgent');
        v_urgent_count:=v_urgent_count+1;
      end if;
      if v_final then
        perform public.create_mandatory_race_jersey_escalation_v1(x.owner_user_id,e,'final');
        v_final_count:=v_final_count+1;
      end if;

      insert into public.race_eligibility_notification_state(stage_id,team_id,race_id,condition_active,last_signature,initial_notified_at,urgent_notified_at,final_notified_at,resolved_at,last_checked_at,metadata,updated_at)
      values(x.stage_id,x.team_id,x.race_id,true,v_signature,
        case when v_initial then now() else null end,
        case when v_urgent then now() else null end,
        case when v_final then now() else null end,
        null,now(),e,now())
      on conflict(stage_id,team_id) do update set
        race_id=excluded.race_id,
        condition_active=true,
        last_signature=excluded.last_signature,
        initial_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.initial_notified_at else coalesce(public.race_eligibility_notification_state.initial_notified_at,excluded.initial_notified_at) end,
        urgent_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.urgent_notified_at else coalesce(public.race_eligibility_notification_state.urgent_notified_at,excluded.urgent_notified_at) end,
        final_notified_at=case when public.race_eligibility_notification_state.last_signature is distinct from excluded.last_signature then excluded.final_notified_at else coalesce(public.race_eligibility_notification_state.final_notified_at,excluded.final_notified_at) end,
        resolved_at=null,last_checked_at=now(),metadata=excluded.metadata,updated_at=now();
    else
      if v_state_found and st.condition_active then v_resolved:=v_resolved+1; end if;
      if v_state_found then
        update public.race_eligibility_notification_state
        set condition_active=false,resolved_at=case when condition_active then now() else resolved_at end,last_checked_at=now(),metadata=e,updated_at=now()
        where stage_id=x.stage_id and team_id=x.team_id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('status','completed','current_game_at',public.get_current_game_timestamp(),'teams_checked',v_checked,'active_critical_alerts',v_active,'initial_notifications',v_initial_count,'urgent_notifications',v_urgent_count,'final_notifications',v_final_count,'resolved_alerts',v_resolved,'scan_frequency_target','every_scheduler_invocation');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_record_prestart_disqualification_fine_v1(p_commitment_score_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance'
AS $function$
declare
  v_event record;
  v_race record;
  v_club_account_id uuid;
  v_sink_account_id uuid;
  v_transaction_id uuid;
  v_idempotency_key text;
  v_amount bigint;
begin
  select e.id,e.club_id,e.race_id,e.event_type,e.cash_penalty,e.score_before,e.score_delta,e.score_after,e.reason
  into v_event
  from public.race_commitment_score_events e
  where e.id=p_commitment_score_event_id;

  if v_event.id is null then raise exception 'Commitment score event not found: %',p_commitment_score_event_id; end if;
  if v_event.event_type<>'prestart_disqualification' then raise exception 'Event is not prestart_disqualification: %',p_commitment_score_event_id; end if;

  v_amount:=coalesce(v_event.cash_penalty,0);
  if v_amount<=0 then
    return jsonb_build_object('success',true,'skipped',true,'reason','No cash penalty to charge.','commitment_score_event_id',p_commitment_score_event_id);
  end if;

  v_idempotency_key:='race-prestart-disqualification-fine-'||p_commitment_score_event_id::text;
  select id into v_transaction_id from finance.transactions where idempotency_key=v_idempotency_key and type='race_prestart_disqualification_fine' limit 1;
  if v_transaction_id is not null then
    return jsonb_build_object('success',true,'already_recorded',true,'transaction_id',v_transaction_id,'commitment_score_event_id',p_commitment_score_event_id);
  end if;

  select r.id,r.name into v_race from public.races r where r.id=v_event.race_id;

  select id into v_club_account_id from finance.accounts where club_id=v_event.club_id and currency='CASH' and kind='main' order by created_at limit 1;
  if v_club_account_id is null then
    insert into finance.accounts(club_id,currency,kind) values(v_event.club_id,'CASH','main') returning id into v_club_account_id;
  end if;

  select id into v_sink_account_id from finance.accounts where system_code='race_penalty_sink' and currency='CASH' and kind='system' order by created_at limit 1;
  if v_sink_account_id is null then
    insert into finance.accounts(system_code,currency,kind) values('race_penalty_sink','CASH','system') returning id into v_sink_account_id;
  end if;

  insert into finance.account_balances(account_id,balance)
  values(v_club_account_id,0),(v_sink_account_id,0)
  on conflict(account_id) do nothing;

  insert into finance.transactions(type,idempotency_key,metadata)
  values('race_prestart_disqualification_fine',v_idempotency_key,jsonb_build_object(
    'club_id',v_event.club_id,'race_id',v_event.race_id,'race_name',coalesce(v_race.name,'Race'),
    'commitment_score_event_id',v_event.id,'score_before',v_event.score_before,'score_delta',v_event.score_delta,
    'score_after',v_event.score_after,'cash_penalty',v_amount,'reason',v_event.reason,
    'penalty_equivalence','missed_startlist_no_show','entry_fee_refunded',false
  )) returning id into v_transaction_id;

  insert into finance.entries(transaction_id,account_id,amount,memo)
  values(v_transaction_id,v_club_account_id,-v_amount,'Pre-start disqualification / no-show fine'),
        (v_transaction_id,v_sink_account_id,v_amount,'Pre-start disqualification fine sink');

  update finance.account_balances set balance=balance-v_amount,updated_at=now() where account_id=v_club_account_id;
  update finance.account_balances set balance=balance+v_amount,updated_at=now() where account_id=v_sink_account_id;

  return jsonb_build_object('success',true,'transaction_id',v_transaction_id,'club_id',v_event.club_id,'race_id',v_event.race_id,'amount',v_amount,'commitment_score_event_id',p_commitment_score_event_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_prestart_disqualification_penalty_v1(p_disqualification_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'finance', 'pg_temp'
AS $function$
declare
  d record;
  r record;
  c record;
  e record;
  v_class text;
  v_score_delta integer:=-10;
  v_cash bigint:=0;
  v_commitment jsonb;
  v_event_id uuid;
  v_finance jsonb:='{}'::jsonb;
  v_reason text;
  v_user_id uuid;
begin
  select * into d from public.race_team_stage_disqualifications where id=p_disqualification_id for update;
  if d.id is null then return jsonb_build_object('success',false,'reason','disqualification_not_found'); end if;

  if d.reason_code = 'mandatory_race_jersey_shortage' then
    return jsonb_build_object('success',true,'skipped',true,'reason','jersey_shortage_is_performance_penalty_not_disqualification','disqualification_id',d.id);
  end if;

  if d.reason_code not in ('mandatory_race_jersey_shortage') then
    return jsonb_build_object('success',true,'skipped',true,'reason','non_controllable_disqualification','reason_code',d.reason_code);
  end if;

  if coalesce((d.metadata->>'penalty_applied')::boolean,false) then
    return jsonb_build_object('success',true,'skipped',true,'reason','penalty_already_marked','disqualification_id',d.id,'metadata',d.metadata);
  end if;

  select r0.id,r0.name,r0.category,to_jsonb(r0) as race_json into r from public.races r0 where r0.id=d.race_id;
  select c0.id,c0.name,c0.owner_user_id,coalesce(c0.is_ai,false) as is_ai into c from public.clubs c0 where c0.id=d.team_id;
  if r.id is null or c.id is null then return jsonb_build_object('success',false,'reason','race_or_team_not_found'); end if;
  if c.is_ai or c.owner_user_id is null then return jsonb_build_object('success',true,'skipped',true,'reason','non_human_team'); end if;

  select rte.* into e from public.race_team_entries rte where rte.race_id=d.race_id and rte.club_id=d.team_id order by rte.updated_at desc nulls last,rte.created_at desc nulls last limit 1;
  if e.id is null then return jsonb_build_object('success',false,'reason','race_team_entry_not_found','race_id',d.race_id,'team_id',d.team_id); end if;

  select coalesce(rer.race_class_code,r.category) into v_class from public.race_entry_rules rer where rer.race_id=d.race_id limit 1;
  v_class:=coalesce(v_class,r.category);

  select coalesce(pr.missed_startlist_score_delta,-10),coalesce(pr.missed_startlist_cash,0)
  into v_score_delta,v_cash
  from public.race_application_penalty_rules pr
  where pr.race_class_code=v_class
  limit 1;
  v_score_delta:=coalesce(v_score_delta,-10);
  v_cash:=coalesce(v_cash,0);

  v_reason:=format('Pre-start disqualification for controllable mandatory race eligibility failure: %s. Penalty equivalent to missed startlist/no-show.',d.reason_code);

  v_commitment:=public.apply_race_commitment_penalty_v1(c.id,r.id,e.id,'prestart_disqualification',v_score_delta,v_cash,v_reason);

  select ev.id into v_event_id
  from public.race_commitment_score_events ev
  where ev.race_team_entry_id=e.id and ev.event_type='prestart_disqualification'
  order by ev.created_at desc limit 1;

  if v_event_id is null then raise exception 'Pre-start disqualification commitment event was not created.'; end if;
  v_finance:=public.finance_record_prestart_disqualification_fine_v1(v_event_id);

  update public.race_team_stage_disqualifications
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'penalty_applied',true,
        'penalty_applied_at',now(),
        'penalty_equivalence','missed_startlist_no_show',
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'finance_result',v_finance,
        'entry_fee_refunded',false,
        'club_controllable_failure',true
      ),updated_at=now()
  where id=d.id;

  update public.race_team_entries
  set decision_reason=coalesce(nullif(decision_reason,''),'Pre-start disqualification')||format(' No-show-equivalent penalty applied: score %s, cash fine %s. Entry fee remains charged.',v_score_delta,v_cash),
      updated_at=now()
  where id=e.id;

  update public.race_preparations
  set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'prestart_disqualification_penalty_applied',true,
        'prestart_disqualification_reason',d.reason_code,
        'commitment_score_event_id',v_event_id,
        'score_delta',v_score_delta,
        'cash_penalty',v_cash,
        'entry_fee_refunded',false,
        'penalty_applied_at',now()
      ),updated_at=now()
  where race_id=d.race_id and club_id=d.team_id;

  v_user_id:=c.owner_user_id;
  if v_user_id is not null then
    perform public.create_user_game_notification_v1(
      v_user_id,
      'RACE_PLAN_NEEDS_ATTENTION',
      'Team removed from '||r.name||' — penalty applied',
      format('%s could not start %s because the mandatory Race Jersey Kit requirement was still unresolved at the pre-start eligibility check. %s kit%s required, %s eligible, %s missing. The race entry fee remains charged. A cash fine of %s has been applied and the Race Commitment Score changed by %s. Open the race to review what happened, or open Race Supplies to prevent the same problem in future races.',
        c.name,
        r.name,
        coalesce(d.required_jersey_units,0),
        case when coalesce(d.required_jersey_units,0)=1 then ' was' else 's were' end,
        coalesce(d.available_jersey_units,0),
        coalesce(d.missing_jersey_units,greatest(coalesce(d.required_jersey_units,0)-coalesce(d.available_jersey_units,0),0)),
        to_char(v_cash,'FM999,999,999,990'),
        case when v_score_delta>=0 then '+'||v_score_delta::text else v_score_delta::text end
      ),
      '/dashboard/equipment?tab=race-supplies',
      jsonb_build_object(
        'event_type','prestart_disqualification',
        'reason_code',d.reason_code,
        'race_id',r.id,
        'race_name',r.name,
        'club_id',c.id,
        'club_name',c.name,
        'required_jersey_units',d.required_jersey_units,
        'available_jersey_units',d.available_jersey_units,
        'missing_jersey_units',d.missing_jersey_units,
        'problem_label','Not enough eligible Race Jersey Kits',
        'cash_penalty',v_cash,
        'score_delta',v_score_delta,
        'entry_fee_refunded',false,
        'penalty_equivalence','missed_startlist_no_show',
        'commitment_score_event_id',v_event_id,
        'finance_result',v_finance,
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png',
        'race_page_path','/dashboard/races/'||r.id::text,
        'race_supplies_path','/dashboard/equipment?tab=race-supplies',
        'race_preparation_path','/dashboard/race-preparation?tab=acceptedRaces&raceId='||r.id::text
      ),
      'prestart-disqualification-penalty-'||d.id::text,
      null
    );
  end if;

  return jsonb_build_object('success',true,'disqualification_id',d.id,'race_id',r.id,'club_id',c.id,'race_team_entry_id',e.id,'race_class_code',v_class,'score_delta',v_score_delta,'cash_penalty',v_cash,'commitment_score_event_id',v_event_id,'finance_result',v_finance,'entry_fee_refunded',false,'commitment_result',v_commitment);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_team_stage_disqualification_penalty_trg_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  -- Race Jersey shortages are no longer disqualifications and must never trigger
  -- missed-start/no-show economy penalties.
  if new.reason_code='mandatory_race_jersey_shortage' then return new; end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_unapplied_prestart_disqualification_penalties_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  return jsonb_build_object(
    'status','completed','applied',0,'failed',0,'results','[]'::jsonb,
    'rule','race_jersey_shortages_no_longer_create_prestart_disqualification_penalties',
    'ran_at',now()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_sport_director_race_eligibility_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a record;
  x record;
  e jsonb;
  st public.staff_advisory_event_state%rowtype;
  v_found boolean;
  v_signature text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_generated integer:=0;
  v_active boolean;
begin
  for a in
    select aa.id as access_id,aa.club_id,aa.staff_id
    from public.staff_advisory_access aa
    join public.club_staff s on s.id=aa.staff_id and s.club_id=aa.club_id
    join public.clubs c on c.id=aa.club_id
    where aa.role_type='sport_director' and aa.entitlement_state='active' and aa.expires_at>public.staff_advisory_game_now_v1()
      and s.is_active=true and s.role_type::text='sport_director' and c.deleted_at is null and c.is_active=true
  loop
    x:=null;
    select q.* into x
    from (
      select t.race_id,t.club_id as team_id,rs.id as stage_id,rs.stage_date,rs.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages rs on rs.race_id=t.race_id
      where public.universal_race_resource_owner_club_v1(t.club_id)=a.club_id
        and lower(coalesce(t.status,'accepted'))='accepted'
        and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and rs.stage_date::date between public.get_current_game_date_date() and public.get_current_game_date_date()+7
        and not coalesce(rs.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs ar where ar.stage_id=rs.id)
      order by rs.stage_date,rs.stage_number,rs.id
    ) q
    where public.race_team_stage_eligibility_v1(q.stage_id,q.team_id)->>'status'='at_risk'
    limit 1;

    v_active:=x.stage_id is not null;
    if v_active then
      e:=public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
      v_signature:=md5(concat_ws('|',e->>'race_id',e->>'stage_id',e->>'team_id',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
    else
      e:='{}'::jsonb; v_signature:='none';
    end if;

    select * into st from public.staff_advisory_event_state where access_id=a.access_id and event_code='sd_race_eligibility_critical';
    v_found:=found;

    if v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then
      v_result:=public.staff_advisory_emit_sport_director_event_v1(
        a.access_id,'sd_race_eligibility_critical','Sports Director Advisory — Race Eligibility Critical',
        format('%s is at risk of removal from %s. %s Race Jersey Kits are required for Stage %s, but only %s are effectively available. %s kit%s missing.',coalesce(e->>'team_name','Your team'),coalesce(e->>'race_name','the race'),e->>'required_jersey_units',e->>'stage_number',e->>'effective_available_jersey_units',e->>'missing_jersey_units',case when e->>'missing_jersey_units'='1' then '' else 's' end),
        'race_eligibility_critical',e,
        jsonb_build_array('Open Race Supplies and resolve the shortage before the stage eligibility check.','If the shortage remains unresolved, the team will be removed and the normal missed-start/no-show penalty will apply.'),
        'sport_director_race_eligibility_critical',v_signature
      );
      if v_result->>'status'='generated' then v_generated:=v_generated+1; v_results:=v_results||jsonb_build_array(v_result); end if;
    end if;

    insert into public.staff_advisory_event_state(access_id,event_code,condition_active,last_signature,last_notified_at,last_checked_at,state_json,updated_at)
    values(a.access_id,'sd_race_eligibility_critical',v_active,v_signature,case when v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then now() else null end,now(),e,now())
    on conflict(access_id,event_code) do update set condition_active=excluded.condition_active,last_signature=excluded.last_signature,
      last_notified_at=coalesce(excluded.last_notified_at,public.staff_advisory_event_state.last_notified_at),last_checked_at=now(),state_json=excluded.state_json,updated_at=now();
  end loop;

  return jsonb_build_object('status','checked','generated_count',v_generated,'results',v_results,'checked_at',now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_scan_all_mechanic_race_eligibility_v1(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  a record;
  x record;
  e jsonb;
  st public.staff_advisory_event_state%rowtype;
  v_found boolean;
  v_signature text;
  v_result jsonb;
  v_results jsonb:='[]'::jsonb;
  v_generated integer:=0;
  v_active boolean;
  v_detail text;
begin
  for a in
    select aa.id as access_id,aa.club_id,aa.staff_id
    from public.staff_advisory_access aa
    join public.club_staff s on s.id=aa.staff_id and s.club_id=aa.club_id
    join public.clubs c on c.id=aa.club_id
    where aa.role_type='mechanic' and aa.entitlement_state='active' and aa.expires_at>public.staff_advisory_game_now_v1()
      and s.is_active=true and s.role_type::text='mechanic' and c.deleted_at is null and c.is_active=true
  loop
    x:=null;
    select q.* into x
    from (
      select t.race_id,t.club_id as team_id,rs.id as stage_id,rs.stage_date,rs.stage_number
      from public.race_participant_teams_v1 t
      join public.races r on r.id=t.race_id
      join public.race_stages rs on rs.race_id=t.race_id
      where public.universal_race_resource_owner_club_v1(t.club_id)=a.club_id
        and lower(coalesce(t.status,'accepted'))='accepted'
        and lower(coalesce(r.status,'scheduled')) in ('scheduled','active')
        and rs.stage_date::date between public.get_current_game_date_date() and public.get_current_game_date_date()+7
        and not coalesce(rs.weather_cancelled,false)
        and not exists(select 1 from public.race_stage_authoritative_runs ar where ar.stage_id=rs.id)
      order by rs.stage_date,rs.stage_number,rs.id
    ) q
    where public.race_team_stage_eligibility_v1(q.stage_id,q.team_id)->>'status'='at_risk'
    limit 1;

    v_active:=x.stage_id is not null;
    if v_active then
      e:=public.race_team_stage_eligibility_v1(x.stage_id,x.team_id);
      v_signature:=md5(concat_ws('|',e->>'race_id',e->>'stage_id',e->>'team_id',e->>'required_jersey_units',e->>'effective_available_jersey_units',e->>'same_day_used_units',e->>'other_race_reserved_units'));
      v_detail:=format('%s usable jersey unit%s are owned before same-day restrictions; %s were already used on the stage date and %s are reserved for another race. Effective availability is %s, while %s are required.',e->>'total_usable_owned_units_before_same_day_rule',case when e->>'total_usable_owned_units_before_same_day_rule'='1' then '' else 's' end,e->>'same_day_used_units',e->>'other_race_reserved_units',e->>'effective_available_jersey_units',e->>'required_jersey_units');
    else
      e:='{}'::jsonb; v_signature:='none'; v_detail:=null;
    end if;

    select * into st from public.staff_advisory_event_state where access_id=a.access_id and event_code='mechanic_race_supply_eligibility_critical';
    v_found:=found;

    if v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then
      v_result:=public.staff_advisory_emit_mechanic_event_v1(
        a.access_id,'mechanic_race_supply_eligibility_critical','Chief Mechanic Advisory — Race Jersey Eligibility',
        format('%s is short of mandatory Race Jersey Kits for %s — Stage %s. %s',coalesce(e->>'team_name','Your team'),coalesce(e->>'race_name','the race'),e->>'stage_number',v_detail),
        'race_supply_eligibility_critical',e,
        jsonb_build_array('Restock or free enough usable Race Jersey Kits before the stage eligibility check.','The effective availability figure uses the same race-specific calculation as the race engine, including same-day use and other race reservations.'),
        'mechanic:race_eligibility:'||v_signature
      );
      if v_result->>'status'='generated' then v_generated:=v_generated+1; v_results:=v_results||jsonb_build_array(v_result); end if;
    end if;

    insert into public.staff_advisory_event_state(access_id,event_code,condition_active,last_signature,last_notified_at,last_checked_at,state_json,updated_at)
    values(a.access_id,'mechanic_race_supply_eligibility_critical',v_active,v_signature,case when v_active and (p_force or not v_found or not coalesce(st.condition_active,false) or st.last_signature is distinct from v_signature) then now() else null end,now(),e,now())
    on conflict(access_id,event_code) do update set condition_active=excluded.condition_active,last_signature=excluded.last_signature,
      last_notified_at=coalesce(excluded.last_notified_at,public.staff_advisory_event_state.last_notified_at),last_checked_at=now(),state_json=excluded.state_json,updated_at=now();
  end loop;

  return jsonb_build_object('status','checked','generated_count',v_generated,'results',v_results,'checked_at',now());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_apply_phase9_supplies_v1(p_simulation_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_stage_date date;
  v_original_input jsonb;
  v_original_result jsonb;
  v_temp_input jsonb;
  v_temp_result jsonb;
  v_manifest jsonb;
  v_updates jsonb := '[]'::jsonb;
  v_item jsonb;
  v_source_resource_id text;
  v_applied_resource_id text;
  v_resource_kind text;
  v_supply_key text;
  v_club_id uuid;
  v_selected_unit_id uuid;
  v_selected_remaining integer;
  v_selected_last_used date;
  v_uses_needed integer;
  v_alt_unit_id uuid;
  v_existing_applied_resource_id text;
  v_existing_skip boolean;
  v_existing_skip_reason text;
  v_source_input jsonb;
  v_used_alt_ids uuid[] := array[]::uuid[];
  v_remaps jsonb := '[]'::jsonb;
  v_skips jsonb := '[]'::jsonb;
  v_result jsonb;
  v_changed boolean := false;
  v_skip boolean := false;
  v_reason text;
  v_map jsonb;
begin
  if p_simulation_run_id is null then
    raise exception 'p_simulation_run_id is required';
  end if;

  select * into v_run
  from public.race_stage_simulation_runs r
  where r.id = p_simulation_run_id
  for update;

  if not found then
    raise exception 'Unknown simulation run %', p_simulation_run_id;
  end if;

  if exists (
    select 1 from public.race_stage_authoritative_runs a
    where a.simulation_run_id = p_simulation_run_id
  ) then
    return public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id);
  end if;

  select s.stage_date::date into v_stage_date
  from public.race_stages s
  where s.id = v_run.stage_id;

  v_original_input := coalesce(v_run.input_snapshot_json, '{}'::jsonb);
  v_original_result := coalesce(v_run.result_summary_json, '{}'::jsonb);
  v_temp_input := v_original_input;
  v_temp_result := v_original_result;
  v_manifest := coalesce(v_original_result -> 'application_manifest', '{}'::jsonb);

  for v_item in
    select item
    from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) item
  loop
    v_source_resource_id := coalesce(v_item ->> 'resourceId', '');
    v_applied_resource_id := v_source_resource_id;
    v_skip := false;
    v_reason := null;
    v_alt_unit_id := null;
    v_existing_applied_resource_id := null;
    v_existing_skip := false;
    v_existing_skip_reason := null;

    v_resource_kind := coalesce(
      v_original_input #>> array['preparation','raceSupplies',v_source_resource_id,'resourceKind'],
      ''
    );

    if v_resource_kind = 'durable_supply_unit'
       and v_source_resource_id like 'durable:%'
    then
      v_supply_key := coalesce(
        v_original_input #>> array['preparation','raceSupplies',v_source_resource_id,'supplyKey'],
        ''
      );
      v_club_id := nullif(v_item ->> 'teamId', '')::uuid;
      v_uses_needed := greatest(coalesce(nullif(v_item ->> 'stageUsesUsed', '')::integer, 0), 0);
      v_selected_unit_id := replace(v_source_resource_id, 'durable:', '')::uuid;

      select
        a.resource_id,
        coalesce((a.metadata ->> 'physical_application_skipped')::boolean, false),
        a.metadata ->> 'physical_application_skip_reason'
      into
        v_existing_applied_resource_id,
        v_existing_skip,
        v_existing_skip_reason
      from public.race_engine_stage_supply_applications a
      where a.simulation_run_id = p_simulation_run_id
        and (
          a.metadata ->> 'manifest_resource_id' = v_source_resource_id
          or a.resource_id = v_source_resource_id
        )
      order by a.created_at, a.id
      limit 1;

      if v_existing_applied_resource_id is not null then
        if v_existing_skip then
          v_skip := true;
          v_reason := coalesce(v_existing_skip_reason, 'existing_physical_shortage_skip');
        else
          v_applied_resource_id := v_existing_applied_resource_id;
          v_alt_unit_id := replace(v_applied_resource_id, 'durable:', '')::uuid;
          v_reason := 'existing_rebound';
        end if;
      else
        select u.stage_uses_remaining, u.last_used_game_date
        into v_selected_remaining, v_selected_last_used
        from public.club_race_supply_units u
        where u.id = v_selected_unit_id
          and u.club_id = v_club_id
          and u.supply_key = v_supply_key;

        if not found then
          v_reason := 'selected_unit_missing_at_publication';
        elsif v_uses_needed > 0 and v_selected_last_used = v_stage_date then
          v_reason := 'selected_unit_already_used_same_game_date';
        elsif v_uses_needed > 0 and v_selected_remaining < v_uses_needed then
          v_reason := 'selected_unit_insufficient_remaining_uses';
        end if;

        if v_reason is not null and v_uses_needed > 0 then
          select alt.id
          into v_alt_unit_id
          from public.club_race_supply_units alt
          where alt.club_id = v_club_id
            and alt.supply_key = v_supply_key
            and alt.status in ('ready','assigned')
            and alt.stage_uses_remaining >= v_uses_needed
            and (alt.last_used_game_date is null or alt.last_used_game_date < v_stage_date)
            and not (alt.id = any(v_used_alt_ids))
            and not exists (
              select 1
              from jsonb_array_elements(coalesce(v_manifest -> 'phase9ResourceUpdates', '[]'::jsonb)) mi
              where mi ->> 'resourceId' = 'durable:' || alt.id::text
            )
            and not exists (
              select 1
              from public.race_engine_stage_supply_applications a
              where a.simulation_run_id = p_simulation_run_id
                and a.resource_id = 'durable:' || alt.id::text
            )
          order by alt.stage_uses_remaining, alt.created_at, alt.id
          limit 1;

          if v_alt_unit_id is not null then
            v_applied_resource_id := 'durable:' || v_alt_unit_id::text;
          else
            v_skip := true;
          end if;
        end if;
      end if;

      if v_skip then
        v_changed := true;
        v_skips := v_skips || jsonb_build_array(jsonb_build_object(
          'manifest_resource_id', v_source_resource_id,
          'club_id', v_club_id,
          'supply_key', v_supply_key,
          'stage_date', v_stage_date,
          'requested_stage_uses', v_uses_needed,
          'reason', coalesce(v_reason, 'physical_shortage_no_alternative'),
          'sporting_output_changed', false
        ));
        continue;
      end if;

      if v_applied_resource_id <> v_source_resource_id then
        v_changed := true;
        v_used_alt_ids := array_append(v_used_alt_ids, v_alt_unit_id);
        v_source_input := v_original_input #> array['preparation','raceSupplies',v_source_resource_id];

        if v_source_input is not null then
          v_temp_input := jsonb_set(
            v_temp_input,
            array['preparation','raceSupplies',v_applied_resource_id],
            v_source_input,
            true
          );
        end if;

        v_item := jsonb_set(v_item, '{resourceId}', to_jsonb(v_applied_resource_id), false);
        v_remaps := v_remaps || jsonb_build_array(jsonb_build_object(
          'manifest_resource_id', v_source_resource_id,
          'applied_resource_id', v_applied_resource_id,
          'club_id', v_club_id,
          'supply_key', v_supply_key,
          'stage_date', v_stage_date,
          'reason', v_reason,
          'sporting_output_changed', false
        ));
      end if;
    end if;

    v_updates := v_updates || jsonb_build_array(v_item);
  end loop;

  if not v_changed then
    return public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id)
      || jsonb_build_object(
        'durable_resource_rebound_count', 0,
        'durable_resource_rebounds', '[]'::jsonb,
        'durable_resource_shortage_skip_count', 0,
        'durable_resource_shortage_skips', '[]'::jsonb,
        'publication_recovery_rule', 'interchangeable_or_nonblocking_shortage_v2'
      );
  end if;

  v_temp_result := jsonb_set(
    v_temp_result,
    '{application_manifest,phase9ResourceUpdates}',
    v_updates,
    true
  );

  update public.race_stage_simulation_runs
  set input_snapshot_json = v_temp_input,
      result_summary_json = v_temp_result,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  begin
    v_result := public.universal_race_stage_apply_phase9_supplies_exact_v1(p_simulation_run_id);
  exception when others then
    update public.race_stage_simulation_runs
    set input_snapshot_json = v_original_input,
        result_summary_json = v_original_result,
        updated_at = clock_timestamp()
    where id = p_simulation_run_id;
    raise;
  end;

  update public.race_stage_simulation_runs
  set input_snapshot_json = v_original_input,
      result_summary_json = v_original_result,
      updated_at = clock_timestamp()
  where id = p_simulation_run_id;

  for v_map in select value from jsonb_array_elements(v_remaps)
  loop
    update public.race_engine_stage_supply_applications a
    set metadata = coalesce(a.metadata,'{}'::jsonb) || jsonb_build_object(
      'manifest_resource_id', v_map ->> 'manifest_resource_id',
      'applied_resource_id', v_map ->> 'applied_resource_id',
      'resource_rebound', true,
      'resource_rebound_reason', v_map ->> 'reason',
      'sporting_output_changed', false
    )
    where a.simulation_run_id = p_simulation_run_id
      and a.resource_id = v_map ->> 'applied_resource_id';
  end loop;

  for v_map in select value from jsonb_array_elements(v_skips)
  loop
    insert into public.race_engine_stage_supply_applications (
      simulation_run_id,
      stage_id,
      race_id,
      club_id,
      resource_id,
      supply_key,
      resource_kind,
      quantity_used,
      stage_uses_used,
      applied_game_date,
      metadata
    )
    values (
      p_simulation_run_id,
      v_run.stage_id,
      v_run.race_id,
      nullif(v_map ->> 'club_id', '')::uuid,
      v_map ->> 'manifest_resource_id',
      v_map ->> 'supply_key',
      'durable_supply_unit',
      null,
      0,
      v_stage_date,
      jsonb_build_object(
        'source', 'publication_recovery_durable_supply_shortage_v2',
        'manifest_resource_id', v_map ->> 'manifest_resource_id',
        'physical_application_skipped', true,
        'physical_application_skip_reason', v_map ->> 'reason',
        'requested_stage_uses', coalesce(nullif(v_map ->> 'requested_stage_uses','')::integer,0),
        'immutable_manifest_preserved', true,
        'sporting_output_changed', false
      )
    )
    on conflict (simulation_run_id, resource_id) do update
    set stage_uses_used = 0,
        metadata = excluded.metadata;
  end loop;

  return v_result || jsonb_build_object(
    'durable_resource_rebound_count', jsonb_array_length(v_remaps),
    'durable_resource_rebounds', v_remaps,
    'durable_resource_shortage_skip_count', jsonb_array_length(v_skips),
    'durable_resource_shortage_skips', v_skips,
    'rebound_rule', 'interchangeable_unpublished_durable_supply_units_v1',
    'publication_recovery_rule', 'interchangeable_or_nonblocking_shortage_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_enforce_mandatory_jerseys_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race uuid;
  v_no integer;
  v_date date;
  v_race_name text;
  x record;
  v_req integer;
  v_owner uuid;
  v_avail integer;
  v_reserved integer;
  v_owner_total integer;
  v_missing integer;
  v_ai boolean;
  v_user uuid;
  v_elig jsonb;
  v_checked integer := 0;
  v_ai_fill integer := 0;
  v_penalized integer := 0;
  v_decisions jsonb := '[]'::jsonb;
begin
  select s.race_id,s.stage_number,s.stage_date::date,r.name
  into v_race,v_no,v_date,v_race_name
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where s.id=p_stage_id;
  if v_race is null then raise exception 'Stage % was not found.',p_stage_id; end if;

  for x in
    select t.club_id as team_id,
           public.universal_race_resource_owner_club_v1(t.club_id) as resource_owner_club_id,
           t.is_ai_filler,t.club_name,c.club_type
    from public.race_participant_teams_v1 t
    join public.clubs c on c.id=t.club_id
    where t.race_id=v_race
      and lower(coalesce(t.status,'accepted'))='accepted'
    order by case when coalesce(c.club_type,'main')='main' then 0 else 1 end,t.club_id
  loop
    if public.universal_race_team_disqualified_for_stage_v1(v_race,x.team_id,v_no) then
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'status','blocked_non_jersey_reason'
      ));
      continue;
    end if;

    v_req:=public.universal_race_team_required_jerseys_v1(v_race,x.team_id);
    if v_req<=0 then continue; end if;
    v_checked:=v_checked+1;
    v_owner:=x.resource_owner_club_id;
    if v_owner is null then raise exception 'Could not resolve physical resource owner for team %.',x.team_id; end if;

    select coalesce(c.is_ai,false) or coalesce(x.is_ai_filler,false),owner.owner_user_id
    into v_ai,v_user
    from public.clubs c
    join public.clubs owner on owner.id=v_owner
    where c.id=x.team_id;

    perform public.sync_race_supply_units_from_summary_v1(v_owner);
    v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
    v_avail:=coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
    v_reserved:=coalesce(nullif(v_elig->>'other_race_reserved_units','')::integer,0);
    v_owner_total:=coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);

    if coalesce(v_ai,false) and v_avail<v_req then
      perform public.universal_race_team_ensure_ai_jerseys_v1(v_race,x.team_id,greatest(v_req+v_reserved,v_req));
      v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
      v_avail:=coalesce(nullif(v_elig->>'effective_available_jersey_units','')::integer,0);
      v_owner_total:=coalesce(nullif(v_elig->>'total_usable_owned_units_before_same_day_rule','')::integer,0);
      if v_avail>=v_req then v_ai_fill:=v_ai_fill+1; end if;
    end if;

    v_missing:=greatest(v_req-v_avail,0);
    if v_missing>0 then
      v_penalized:=v_penalized+1;
      if v_user is not null and not coalesce(v_ai,false) then
        perform public.create_race_team_jersey_shortage_penalty_notification_v1(
          v_user,v_race,p_stage_id,x.team_id,v_req,v_avail
        );
      end if;
      v_elig:=public.race_team_stage_eligibility_v1(p_stage_id,x.team_id);
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'resource_owner_club_id',v_owner,
        'status','eligible_with_jersey_penalty','required_jerseys',v_req,
        'owner_usable_jerseys',v_owner_total,'other_race_reserved_jerseys',v_reserved,
        'available_jerseys_after_reservations',v_avail,'missing_jerseys',v_missing,
        'preparation_bonus_reduction_pct',v_elig->'preparation_bonus_reduction_pct',
        'energy_cost_penalty_pct',v_elig->'energy_cost_penalty_pct',
        'post_stage_fatigue_penalty_pct',v_elig->'post_stage_fatigue_penalty_pct',
        'team_remains_in_race',true,'from_stage_number',v_no
      ));
    else
      v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object(
        'team_id',x.team_id,'team_name',x.club_name,'resource_owner_club_id',v_owner,
        'status','eligible','required_jerseys',v_req,'owner_usable_jerseys',v_owner_total,
        'other_race_reserved_jerseys',v_reserved,'available_jerseys_after_reservations',v_avail,
        'ai',coalesce(v_ai,false)
      ));
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed','race_id',v_race,'stage_id',p_stage_id,'stage_number',v_no,
    'teams_checked',v_checked,'teams_newly_disqualified',0,
    'teams_with_jersey_penalty',v_penalized,'ai_teams_auto_provisioned',v_ai_fill,
    'jersey_rule','optional_with_proportional_performance_penalty_v1',
    'resource_rule','canonical_effective_race_supply_v2','decisions',v_decisions
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_process_lifecycle_v1(p_max_publications integer DEFAULT 4)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_pass jsonb;
  v_current_game_at timestamp without time zone;
  v_fast_forwarded integer := 0;
  v_published integer := 0;
  v_scenario_finalization jsonb;
begin
  v_pass := public.universal_race_stage_process_lifecycle_core_v1(1);
  v_scenario_finalization := public.universal_race_stage_finalize_ready_scenarios_v1(8);

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  update public.race_stage_automation_state state
  set details = coalesce(state.details,'{}'::jsonb) || jsonb_build_object(
        'replay_closes_at_real', clock_timestamp(),
        'historical_catchup_replay_fast_forwarded', true,
        'historical_catchup_fast_forwarded_at_real', clock_timestamp(),
        'historical_catchup_current_game_at', v_current_game_at,
        'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2'
      ),
      last_checked_at = clock_timestamp(),
      updated_at = clock_timestamp()
  from public.race_stage_simulation_runs run
  where run.id = state.simulation_run_id
    and state.last_status = 'replay_live'
    and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes' <= v_current_game_at
    and coalesce(
        nullif(state.details ->> 'replay_opened_game_at', '')::timestamp,
        public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone
      )
        >= public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone + interval '30 minutes'
    and run.status = 'running'
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') = 'universal_phase11b_calculated_hidden_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id = state.stage_id)
    and (nullif(state.details ->> 'replay_closes_at_real', '') is null
      or (state.details ->> 'replay_closes_at_real')::timestamptz > clock_timestamp());
  get diagnostics v_fast_forwarded = row_count;

  v_published := coalesce(nullif(v_pass ->> 'published_count', '')::integer, 0);

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'historical_catchup_fast_forwarded_count',v_fast_forwarded,
    'published_count',v_published,
    'pass',v_pass,
    'scenario_finalization',v_scenario_finalization,
    'historical_catchup_rule','replay_first_opened_at_least_30_game_minutes_late_v2',
    'official_result_reveal_rule','not_before_stage_start_plus_30_game_minutes_v1',
    'publication_budget_per_lifecycle_call',1
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_validate_point_contract_v1(p_stage_id uuid, p_input_snapshot jsonb DEFAULT NULL::jsonb, p_universal_result jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_format text;
  v_tt_structure_ok boolean := false;
  v_start_count integer := 0;
  v_finish_count integer := 0;
  v_other_invalid integer := 0;
  v_legacy_invalid integer := 0;
begin
  v_result := public.universal_race_stage_validate_point_contract_legacy_v1(
    p_stage_id,p_input_snapshot,p_universal_result
  );

  if coalesce(v_result->>'status','')='point_contract_ready' then
    return v_result;
  end if;

  select lower(coalesce(s.stage_format,'road_race'))
  into v_format
  from public.race_stages s
  where s.id=p_stage_id;

  if v_format not in ('individual_time_trial','team_time_trial','prologue') then
    return v_result;
  end if;

  select
    count(*) filter (where upper(p.point_type)='START')::integer,
    count(*) filter (where upper(p.point_type)='FINISH')::integer,
    count(*) filter (
      where
        upper(p.point_type) not in ('START','FINISH','INTERMEDIATE_SPRINT','BONUS_SPRINT','KOM')
        or p.km_from_start < 0
        or p.km_from_start > s.distance_km
        or jsonb_typeof(p.points_scheme) <> 'array'
        or jsonb_typeof(p.time_bonus_seconds) <> 'array'
        or (
          upper(p.point_type) not in ('START','FINISH')
          and greatest(
            case when jsonb_typeof(p.points_scheme)='array' then jsonb_array_length(p.points_scheme) else 0 end,
            case when jsonb_typeof(p.time_bonus_seconds)='array' then jsonb_array_length(p.time_bonus_seconds) else 0 end
          ) <= 0
        )
    )::integer
  into v_start_count,v_finish_count,v_other_invalid
  from public.race_stage_points p
  join public.race_stages s on s.id=p.stage_id
  where p.stage_id=p_stage_id
  group by s.distance_km;

  v_tt_structure_ok := coalesce(v_start_count,0)=1
    and coalesce(v_finish_count,0)=1
    and coalesce(v_other_invalid,0)=0;

  if not v_tt_structure_ok then
    return v_result;
  end if;

  if not coalesce((v_result#>>'{input,ready}')::boolean,true)
     or not coalesce((v_result#>>'{output,ready}')::boolean,true)
  then
    return v_result;
  end if;

  v_legacy_invalid := coalesce(nullif(v_result#>>'{canonical,invalid_row_count}','')::integer,0);

  v_result := jsonb_set(v_result,'{status}','"point_contract_ready"'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,ready}','true'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,invalid_row_count}','0'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,legacy_invalid_row_count}',to_jsonb(v_legacy_invalid),true);
  v_result := jsonb_set(v_result,'{canonical,time_trial_non_scoring_finish_allowed}','true'::jsonb,true);
  v_result := jsonb_set(v_result,'{canonical,stage_format}',to_jsonb(v_format),true);
  v_result := jsonb_set(v_result,'{validation_model}','"phase11_time_trial_finish_exception_v1"'::jsonb,true);

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_issue_emergency_loan(p_club_id uuid, p_reason text, p_ref_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'loan_issued',false,
      'reason','AI clubs do not use insolvency or emergency loans.'
    );
  end if;

  return public.finance_issue_emergency_loan_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id,p_idempotency_key
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_ensure_mandatory_funds(p_club_id uuid, p_required_amount bigint, p_reason text, p_ref_id text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  if p_required_amount is null or p_required_amount <= 0 then
    return jsonb_build_object(
      'ok',true,
      'status','not_required',
      'required_amount',coalesce(p_required_amount,0)
    );
  end if;

  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds',
      'club_id',v_finance_club_id,
      'required_amount',p_required_amount,
      'loans_issued',0,
      'financial_block',false
    );
  end if;

  return public.finance_ensure_mandatory_funds_non_ai_core_v1(
    p_club_id,p_required_amount,p_reason,p_ref_id,p_idempotency_key
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_liquidate_club_for_insolvency(p_club_id uuid, p_reason text, p_ref_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_finance_club_id uuid;
  v_is_ai boolean := false;
begin
  v_finance_club_id := public.finance_resolve_paying_club_id(p_club_id);

  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=v_finance_club_id;

  if v_is_ai then
    return jsonb_build_object(
      'ok',true,
      'status','ai_unlimited_funds_no_liquidation',
      'club_id',v_finance_club_id,
      'liquidated',false,
      'reason','AI clubs are exempt from insolvency liquidation.'
    );
  end if;

  return public.finance_liquidate_club_for_insolvency_non_ai_core_v1(
    p_club_id,p_reason,p_ref_id
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_spend_from_club(p_club_id uuid, p_amount bigint, p_type text DEFAULT 'expense'::text, p_sink_code text DEFAULT 'SINK'::text, p_idempotency_key text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_spend_from_club_non_ai_core_v1(
      p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if p_idempotency_key is not null then
    select t.id
      into v_existing
    from finance.transactions t
    where t.idempotency_key=p_idempotency_key
    order by t.created_at desc
    limit 1;

    if v_existing is not null then
      return public.finance_spend_from_club_non_ai_core_v1(
        p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
      );
    end if;
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_spend_from_club_non_ai_core_v1(
    p_club_id,p_amount,p_type,p_sink_code,p_idempotency_key,p_metadata
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finance_charge_race_cost(p_club_id uuid, p_race_id uuid, p_amount bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_is_ai boolean := false;
  v_club_acct uuid;
  v_existing uuid;
begin
  select coalesce(c.is_ai,false)
    into v_is_ai
  from public.clubs c
  where c.id=p_club_id;

  if not v_is_ai then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Race cost amount must be > 0';
  end if;

  select l.transaction_id
    into v_existing
  from finance.event_locks l
  where l.event_type='race_cost'
    and l.club_id=p_club_id
    and l.ref_id=p_race_id
  limit 1;

  if v_existing is not null then
    return public.finance_charge_race_cost_non_ai_core_v1(
      p_club_id,p_race_id,p_amount,p_metadata
    );
  end if;

  perform public.finance_get_or_create_club_account(p_club_id,'CASH','main');

  select a.id
    into v_club_acct
  from finance.accounts a
  where a.club_id=p_club_id
    and a.currency='CASH'
    and a.kind='main'
  limit 1;

  insert into finance.account_balances(account_id,balance)
  values (v_club_acct,0)
  on conflict (account_id) do nothing;

  update finance.account_balances
  set balance=greatest(balance,p_amount)
  where account_id=v_club_acct;

  return public.finance_charge_race_cost_non_ai_core_v1(
    p_club_id,p_race_id,p_amount,
    coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
      'ai_unlimited_funds',true,
      'ai_finance_policy','unlimited_funds_no_insolvency'
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_apply_race_development_condition_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_anchor_date date;
  v_race_days_last_14 integer := 0;
  v_race_days_last_30 integer := 0;
  v_total_race_events integer := 0;
begin
  if coalesce(new.applied_to_condition, false) then
    return new;
  end if;

  v_anchor_date := coalesce(
    public.get_current_game_date_date(),
    new.stage_date
  );

  select
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 13 and v_anchor_date
    )::integer,
    count(distinct e.stage_date) filter (
      where v_anchor_date is not null
        and e.stage_date between v_anchor_date - 29 and v_anchor_date
    )::integer,
    count(*)::integer
  into
    v_race_days_last_14,
    v_race_days_last_30,
    v_total_race_events
  from public.rider_race_development_events e
  where e.rider_id = new.rider_id;

  insert into public.rider_race_condition (
    rider_id,
    race_sharpness,
    last_raced_on,
    race_days_last_14,
    race_days_last_30,
    total_race_days,
    last_stage_sharpness_delta,
    last_stage_overload_penalty,
    updated_at
  )
  values (
    new.rider_id,
    least(
      100,
      greatest(
        0,
        50 + coalesce(new.sharpness_delta, 0) - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    new.stage_date,
    coalesce(v_race_days_last_14, 0),
    coalesce(v_race_days_last_30, 0),
    coalesce(v_total_race_events, 0),
    coalesce(new.sharpness_delta, 0)::numeric(8,3),
    coalesce(new.overload_penalty, 0)::numeric(8,3),
    now()
  )
  on conflict (rider_id) do update
  set
    race_sharpness = least(
      100,
      greatest(
        0,
        public.rider_race_condition.race_sharpness
        + coalesce(new.sharpness_delta, 0)
        - coalesce(new.overload_penalty, 0)
      )
    )::numeric(6,2),
    last_raced_on = greatest(
      coalesce(public.rider_race_condition.last_raced_on, new.stage_date),
      new.stage_date
    ),
    race_days_last_14 = coalesce(v_race_days_last_14, 0),
    race_days_last_30 = coalesce(v_race_days_last_30, 0),
    total_race_days = coalesce(v_total_race_events, 0),
    last_stage_sharpness_delta = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.sharpness_delta, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_sharpness_delta
    end,
    last_stage_overload_penalty = case
      when new.stage_date is not null
       and (
         public.rider_race_condition.last_raced_on is null
         or new.stage_date >= public.rider_race_condition.last_raced_on
       )
      then coalesce(new.overload_penalty, 0)::numeric(8,3)
      else public.rider_race_condition.last_stage_overload_penalty
    end,
    updated_at = now();

  update public.rider_race_development_events
  set
    applied_to_condition = true,
    updated_at = now()
  where id = new.id
    and applied_to_condition = false;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_uwt_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_rule record;
  v_min_riders integer;
  v_max_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_existing_total integer := 0;
  v_existing_world integer := 0;
  v_existing_pro integer := 0;
  v_slots integer := 0;
  v_inserted_pro integer := 0;
  v_inserted_world integer := 0;
  v_inserted_world_fallback integer := 0;
  v_inserted_pro_fallback integer := 0;
  v_after_total integer := 0;
  v_after_world integer := 0;
  v_after_pro integer := 0;
  v_assignment_result jsonb;
begin
  perform pg_advisory_xact_lock(
    hashtext('fill_race_ai_teams_v1'),
    hashtext(p_race_id::text)
  );

  select * into v_race
  from public.races
  where id = p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race','category',v_race.category);
  end if;

  select * into v_rule
  from public.race_entry_rules
  where race_id = p_race_id
  limit 1;

  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  v_min_riders := coalesce(v_rule.min_riders_per_team, 6);
  v_max_teams := greatest(
    coalesce(v_rule.max_teams, v_rule.target_teams, 20),
    coalesce(v_rule.target_teams, 20)
  );
  v_pro_target := round(v_max_teams::numeric * 0.20)::integer;
  v_world_target := greatest(0, v_max_teams - v_pro_target);

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id = coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  create temporary table if not exists pg_temp.uwt_ai_fill_candidates_v1 (
    club_id uuid primary key,
    club_name text,
    country_code text,
    club_tier text,
    world_tier integer,
    reputation numeric,
    available_riders integer,
    geographic_priority integer
  ) on commit drop;

  truncate table pg_temp.uwt_ai_fill_candidates_v1;

  insert into pg_temp.uwt_ai_fill_candidates_v1(
    club_id,club_name,country_code,club_tier,world_tier,reputation,available_riders,geographic_priority
  )
  select
    pool.id,
    pool.name,
    pool.country_code,
    pool.club_tier::text,
    pool.world_tier,
    pool.reputation,
    available.available_riders,
    public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)
  from public.ai_competition_filler_club_pool_v1 pool
  cross join lateral (
    select count(*)::integer as available_riders
    from public.club_roster cr
    where cr.club_id=pool.id
      and public.roster_status_allows_race_selection_v1(cr.availability_status)
      and not exists (
        select 1 from public.race_participant_riders same_race
        where same_race.race_id=p_race_id
          and same_race.rider_id=cr.rider_id
      )
      and not exists (
        select 1
        from public.race_participant_riders other_participation
        join public.races other_race on other_race.id=other_participation.race_id
        where other_participation.rider_id=cr.rider_id
          and other_participation.race_id<>p_race_id
          and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
              && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
      )
  ) available
  where coalesce(pool.is_active,true)=true
    and coalesce(pool.is_ai,true)=true
    and coalesce(pool.logo_path,'')<>''
    and available.available_riders>=v_min_riders
    and (
      pool.club_tier::text='worldteam'
      or (
        pool.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,pool.country_code)<=2
      )
    )
    and not exists (
      select 1 from public.race_team_entries existing
      where existing.race_id=p_race_id
        and existing.club_id=pool.id
    )
    and not exists (
      select 1
      from public.race_team_entries other_entry
      join public.races other_race on other_race.id=other_entry.race_id
      where other_entry.club_id=pool.id
        and other_entry.status='accepted'
        and other_race.id<>p_race_id
        and daterange(other_race.start_date,coalesce(other_race.end_date,other_race.start_date)+1,'[)')
            && daterange(v_race.start_date,coalesce(v_race.end_date,v_race.start_date)+1,'[)')
    );

  -- Fill the 20% ProTeam share first. ProTeams are strictly host-country/same-market/same-macro-region only.
  v_slots := least(
    greatest(v_pro_target - coalesce(v_existing_pro,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI ProTeam added under UWT 80/20 field policy. ProTeams are restricted to the host country or same geographic region.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_existing_total, v_existing_world, v_existing_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  -- Fill the 80% WorldTeam share globally.
  v_slots := least(
    greatest(v_world_target - coalesce(v_existing_world,0),0),
    greatest(v_max_teams - coalesce(v_existing_total,0),0)
  );

  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'AI WorldTeam added under UWT 80/20 field policy.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world from inserted;
  end if;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total, v_after_world, v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  -- If the region cannot supply the full 20% ProTeam share, use extra WorldTeams rather than lower tiers or out-of-region ProTeams.
  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='worldteam'
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.geographic_priority asc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional AI WorldTeam added because the host region could not supply the full UWT ProTeam quota.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_world_fallback from inserted;
  end if;

  select count(*)::integer into v_after_total
  from public.race_team_entries
  where race_id=p_race_id and status in ('accepted','confirmed');

  -- Last-resort UWT-only fallback: if WorldTeams are unavailable, use additional regional ProTeams. Never Continental/Amateur.
  v_slots := greatest(v_max_teams - coalesce(v_after_total,0),0);
  if v_slots>0 then
    with candidates as (
      select c.*
      from pg_temp.uwt_ai_fill_candidates_v1 c
      where c.club_tier='proteam'
        and c.geographic_priority<=2
        and not exists (
          select 1 from public.race_team_entries e
          where e.race_id=p_race_id and e.club_id=c.club_id
        )
      order by
        c.geographic_priority asc,
        coalesce(c.world_tier,99) asc,
        c.available_riders desc,
        coalesce(c.reputation,0) desc,
        c.club_id
      limit v_slots
    ), inserted as (
      insert into public.race_team_entries(
        id,race_id,club_id,participating_club_id,status,entry_source,is_ai_filler,auto_filled_at,
        commitment_score_snapshot,acceptance_score,review_round,decision_reason,reviewed_at,final_decision_at,created_at,updated_at
      )
      select
        gen_random_uuid(),p_race_id,c.club_id,c.club_id,'accepted','ai_fill',true,now(),
        null,null,1,
        'Additional regional AI ProTeam added because insufficient WorldTeams were available. UWT lower-tier exclusion remains enforced.',
        now(),now(),now(),now()
      from candidates c
      on conflict (race_id,club_id) do nothing
      returning id
    )
    select count(*)::integer into v_inserted_pro_fallback from inserted;
  end if;

  select public.assign_ai_riders_to_race_v1(p_race_id)
  into v_assignment_result;

  select
    count(*)::integer,
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_after_total,v_after_world,v_after_pro
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status in ('accepted','confirmed');

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'category',v_race.category,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'max_teams',v_max_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'accepted_after_fill',v_after_total,
    'worldteams_after_fill',v_after_world,
    'proteams_after_fill',v_after_pro,
    'continental_and_amateur_allowed',false,
    'proteam_geography','same_country_market_group_or_macro_region_only',
    'proteam_entries_added',v_inserted_pro,
    'worldteam_entries_added',v_inserted_world,
    'worldteam_fallback_entries_added',v_inserted_world_fallback,
    'proteam_fallback_entries_added',v_inserted_pro_fallback,
    'rider_assignment_result',v_assignment_result
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fill_race_ai_teams_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category text;
  v_primary jsonb := '{}'::jsonb;
  v_hierarchy jsonb := '{}'::jsonb;
begin
  select category::text
  into v_category
  from public.races
  where id=p_race_id;

  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  /*
   * Preserve the race-class-specific composition model as the primary policy.
   * The universal hierarchy only fills whatever shortage remains.
   */
  if v_category in ('1.UWT','2.UWT') then
    v_primary := public.fill_race_ai_teams_uwt_v1(p_race_id);
  else
    v_primary := public.fill_race_ai_teams_pre_uwt_policy_v1(p_race_id);
  end if;

  v_hierarchy := public.fill_race_ai_teams_hierarchy_v1(p_race_id);

  return coalesce(v_primary,'{}'::jsonb) || jsonb_build_object(
    'universal_hierarchy_fallback',v_hierarchy,
    'universal_hierarchy_policy','worldteam_proteam_continental_amateur_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.submit_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_club_id uuid := p_club_id;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  if v_club_id is null then
    select public.get_my_primary_club_id() into v_club_id;
  end if;

  if v_club_id is null then
    return jsonb_build_object('success',false,'error','club_not_found');
  end if;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT')
     and not (
       v_club_tier='worldteam'
       or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
     ) then
    return jsonb_build_object(
      'success',false,
      'error','uwt_team_tier_not_eligible',
      'race_id',p_race_id,
      'club_id',v_club_id,
      'club_tier',v_club_tier,
      'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.'
    );
  end if;

  return public.submit_race_application_pre_uwt_policy_v1(p_race_id,v_club_id);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.quote_race_application_v1(p_race_id uuid, p_club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_payload jsonb;
  v_club_id uuid;
  v_category text;
  v_club_tier text;
  v_geo integer;
begin
  v_payload := public.quote_race_application_pre_uwt_policy_v1(p_race_id,p_club_id);

  if coalesce((v_payload->>'success')::boolean,false) is not true then
    return v_payload;
  end if;

  begin
    v_club_id := (v_payload->>'club_id')::uuid;
  exception when others then
    v_club_id := p_club_id;
  end;

  select r.category::text,c.club_tier::text,
         public.race_ai_geographic_priority_v1(r.country_code,c.country_code)
  into v_category,v_club_tier,v_geo
  from public.races r
  join public.clubs c on c.id=v_club_id
  where r.id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    v_payload := v_payload || jsonb_build_object(
      'uwt_field_policy','80% WorldTeams / 20% regional ProTeams',
      'uwt_continental_amateur_allowed',false,
      'uwt_proteam_geography','host country or same region only'
    );

    if not (
      v_club_tier='worldteam'
      or (v_club_tier='proteam' and coalesce(v_geo,3)<=2)
    ) then
      v_payload := v_payload || jsonb_build_object(
        'can_apply',false,
        'estimated_acceptance_chance_pct',0,
        'chance_label','Not eligible',
        'chance_summary','This team tier is not eligible for UWT races.',
        'message','UWT races accept WorldTeams globally and ProTeams only from the host country or same region. Continental and Amateur teams are not eligible.',
        'eligibility_error','uwt_team_tier_not_eligible'
      );
    end if;
  end if;

  return v_payload;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_race_applications_uwt_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_rule record;
  v_current record;
  v_today_ordinal integer;
  v_team_list_ordinal integer;
  v_target_teams integer;
  v_world_target integer;
  v_pro_target integer;
  v_world_accepted integer := 0;
  v_pro_accepted integer := 0;
  v_world_available integer := 0;
  v_pro_available integer := 0;
  v_ineligible_declined integer := 0;
  v_provisional_accepted integer := 0;
  v_new_accepted integer := 0;
  v_new_declined integer := 0;
begin
  perform * from public.recalculate_race_entry_deadlines_v1(p_race_id);

  select * into v_race from public.races where id=p_race_id;
  if not found then
    return jsonb_build_object('success',false,'error','race_not_found');
  end if;

  if v_race.category not in ('1.UWT','2.UWT') then
    return jsonb_build_object('success',false,'error','not_uwt_race');
  end if;

  select * into v_rule from public.race_entry_rules where race_id=p_race_id limit 1;
  if not found then
    return jsonb_build_object('success',false,'error','race_entry_rules_not_found');
  end if;

  select * into v_current from public.get_current_game_date_parts() limit 1;
  v_today_ordinal := public.game_date_ordinal_v1(v_current.season_number,v_current.month_number,v_current.day_number);
  v_team_list_ordinal := public.game_date_ordinal_v1(
    v_rule.team_list_announcement_season_number,
    v_rule.team_list_announcement_month_number,
    v_rule.team_list_announcement_day_number
  );

  if not p_force and v_today_ordinal < v_team_list_ordinal then
    return jsonb_build_object(
      'success',false,
      'error','review_not_due_yet',
      'current_game_date',public.game_date_display_v1(v_current.season_number,v_current.month_number,v_current.day_number),
      'team_list_announcement',public.game_date_display_v1(
        v_rule.team_list_announcement_season_number,
        v_rule.team_list_announcement_month_number,
        v_rule.team_list_announcement_day_number
      )
    );
  end if;

  v_target_teams := least(
    coalesce(v_rule.target_teams,v_rule.max_teams,v_rule.min_teams,20),
    coalesce(v_rule.max_teams,v_rule.target_teams,20)
  );
  v_pro_target := round(v_target_teams::numeric*0.20)::integer;
  v_world_target := greatest(0,v_target_teams-v_pro_target);

  -- Reject any pending lower-tier or out-of-region ProTeam application on UWT races.
  with changed as (
    update public.race_team_entries e
    set
      status='declined',
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason='Declined by UWT eligibility policy: only WorldTeams and host-country/same-region ProTeams may enter.',
      updated_at=now()
    from public.clubs c
    where e.race_id=p_race_id
      and c.id=e.club_id
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and e.status in ('applied','under_review','provisionally_accepted')
      and not (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
    returning 1
  )
  select count(*)::integer into v_ineligible_declined from changed;

  update public.race_team_entries e
  set
    commitment_score_snapshot=coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id)),
    acceptance_score=coalesce(
      e.acceptance_score,
      coalesce(e.commitment_score_snapshot,public.get_or_create_club_race_commitment_score_v1(e.club_id),50)+(random()*10)
    ),
    reviewed_at=now(),
    updated_at=now()
  from public.clubs c
  where e.race_id=p_race_id
    and c.id=e.club_id
    and coalesce(e.is_ai_filler,false)=false
    and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
    and e.status in ('applied','under_review','provisionally_accepted')
    and (
      c.club_tier::text='worldteam'
      or (
        c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
      )
    );

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with ranked as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by coalesce(e.acceptance_score,0) desc,e.created_at asc,e.id
      ) as rn
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status='provisionally_accepted'
      and coalesce(e.is_ai_filler,false)=false
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'accepted'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'accepted'
        else 'under_review'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then now()
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then now()
        else null
      end,
      decision_reason=case
        when ranked.club_tier='worldteam' and ranked.rn<=v_world_available then 'Accepted from protected preliminary field within UWT WorldTeam quota.'
        when ranked.club_tier='proteam' and ranked.rn<=v_pro_available then 'Accepted from protected preliminary field within UWT regional ProTeam quota.'
        else 'Moved to final reserve review because this UWT tier quota was already filled.'
      end,
      updated_at=now()
    from ranked
    where e.id=ranked.id
    returning e.status
  )
  select count(*) filter (where status='accepted')::integer
  into v_provisional_accepted
  from changed;

  select
    count(*) filter (where c.club_tier::text='worldteam')::integer,
    count(*) filter (where c.club_tier::text='proteam')::integer
  into v_world_accepted,v_pro_accepted
  from public.race_team_entries e
  join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
  where e.race_id=p_race_id
    and e.status='accepted';

  v_world_available := greatest(v_world_target-coalesce(v_world_accepted,0),0);
  v_pro_available := greatest(v_pro_target-coalesce(v_pro_accepted,0),0);

  with candidates as (
    select
      e.id,
      c.club_tier::text as club_tier,
      row_number() over (
        partition by c.club_tier::text
        order by
          case when coalesce(e.review_round,0)=1 and coalesce(e.decision_reason,'') like 'Reserve #%' then 0 else 1 end,
          coalesce(e.acceptance_score,0) desc,
          e.created_at asc,
          e.id
      ) as selection_rank
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    where e.race_id=p_race_id
      and e.status in ('applied','under_review')
      and coalesce(e.is_ai_filler,false)=false
      and lower(coalesce(e.entry_source::text,'user')) not in ('ai','ai_fill','ai_filler')
      and (
        c.club_tier::text='worldteam'
        or (
          c.club_tier::text='proteam'
          and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
        )
      )
  ), changed as (
    update public.race_team_entries e
    set
      status=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'accepted'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'accepted'
        else 'declined'
      end,
      review_round=2,
      reviewed_at=now(),
      final_decision_at=now(),
      decision_reason=case
        when candidates.club_tier='worldteam' and candidates.selection_rank<=v_world_available then 'Accepted by final UWT review within WorldTeam quota.'
        when candidates.club_tier='proteam' and candidates.selection_rank<=v_pro_available then 'Accepted by final UWT review within regional ProTeam quota.'
        else 'Declined by final UWT review because this team-tier quota was filled.'
      end,
      updated_at=now()
    from candidates
    where e.id=candidates.id
    returning e.status
  )
  select
    count(*) filter (where status='accepted')::integer,
    count(*) filter (where status='declined')::integer
  into v_new_accepted,v_new_declined
  from changed;

  return jsonb_build_object(
    'success',true,
    'race_id',p_race_id,
    'race_name',v_race.name,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'target_teams',v_target_teams,
    'worldteam_target',v_world_target,
    'proteam_target',v_pro_target,
    'ineligible_pending_applications_declined',coalesce(v_ineligible_declined,0),
    'provisional_accepted',coalesce(v_provisional_accepted,0),
    'new_accepted_from_reserve_or_late_pool',coalesce(v_new_accepted,0),
    'new_declined',coalesce(v_new_declined,0),
    'message','UWT applications reviewed with 80/20 WorldTeam/regional-ProTeam quotas. Continental and Amateur teams are excluded.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.review_race_applications_v1(p_race_id uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_category text;
begin
  select category::text into v_category
  from public.races
  where id=p_race_id;

  if v_category in ('1.UWT','2.UWT') then
    return public.review_race_applications_uwt_v1(p_race_id,p_force);
  end if;

  return public.review_race_applications_pre_uwt_policy_v1(p_race_id,p_force);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reconcile_future_uwt_race_fields_v1(p_race_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_race record;
  v_max_teams integer;
  v_pro_target integer;
  v_human_pro integer;
  v_keep_ai_pro integer;
  v_removed_riders integer := 0;
  v_withdrawn_entries integer := 0;
  v_total_removed_riders integer := 0;
  v_total_withdrawn_entries integer := 0;
  v_fill jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_race in
    select r.id,r.name,r.country_code,r.start_date,rer.max_teams,rer.target_teams
    from public.races r
    join public.race_entry_rules rer on rer.race_id=r.id
    where r.category in ('1.UWT','2.UWT')
      and r.start_date>public.get_current_game_date_date()
      and (p_race_id is null or r.id=p_race_id)
      and (
        rer.applications_status='closed'
        or lower(coalesce(r.metadata->>'team_list_announcement_finalized','false')) in ('true','1','yes')
      )
      and exists (
        select 1 from public.race_team_entries e
        where e.race_id=r.id
          and e.status in ('accepted','confirmed')
          and coalesce(e.is_ai_filler,false)=true
      )
    order by r.start_date,r.name
  loop
    v_max_teams := greatest(coalesce(v_race.max_teams,v_race.target_teams,20),coalesce(v_race.target_teams,20));
    v_pro_target := round(v_max_teams::numeric*0.20)::integer;

    -- Remove lower-tier AI fillers and out-of-region ProTeams from future UWT fields.
    with bad as (
      select e.id,coalesce(e.participating_club_id,e.club_id) as team_id
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
    ), deleted as (
      delete from public.race_participant_riders pr
      using bad
      where pr.race_id=v_race.id
        and pr.team_id=bad.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation: only WorldTeams and host-country/same-region ProTeams are eligible.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from public.clubs c
      where e.race_id=v_race.id
        and c.id=coalesce(e.participating_club_id,e.club_id)
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and (
          c.club_tier::text not in ('worldteam','proteam')
          or (
            c.club_tier::text='proteam'
            and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)>2
          )
        )
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    -- If legacy data has too many accepted AI ProTeams, keep only enough to reach the 20% quota after human ProTeams.
    select count(*)::integer into v_human_pro
    from public.race_team_entries e
    join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
    where e.race_id=v_race.id
      and e.status in ('accepted','confirmed')
      and coalesce(e.is_ai_filler,false)=false
      and c.club_tier::text='proteam';

    v_keep_ai_pro := greatest(v_pro_target-coalesce(v_human_pro,0),0);

    with ranked as (
      select
        e.id,
        coalesce(e.participating_club_id,e.club_id) as team_id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), surplus as (
      select * from ranked where rn>v_keep_ai_pro
    ), deleted as (
      delete from public.race_participant_riders pr
      using surplus
      where pr.race_id=v_race.id and pr.team_id=surplus.team_id
      returning pr.id
    )
    select count(*)::integer into v_removed_riders from deleted;

    with ranked as (
      select
        e.id,
        row_number() over (
          order by
            public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code) asc,
            coalesce(c.world_tier,99) asc,
            coalesce(c.reputation,0) desc,
            e.created_at asc,
            e.id
        ) as rn
      from public.race_team_entries e
      join public.clubs c on c.id=coalesce(e.participating_club_id,e.club_id)
      where e.race_id=v_race.id
        and e.status in ('accepted','confirmed')
        and coalesce(e.is_ai_filler,false)=true
        and c.club_tier::text='proteam'
        and public.race_ai_geographic_priority_v1(v_race.country_code,c.country_code)<=2
    ), changed as (
      update public.race_team_entries e
      set
        status='withdrawn',
        decision_reason='Removed by UWT 80/20 field reconciliation because the regional ProTeam quota was exceeded.',
        withdrawn_at=coalesce(e.withdrawn_at,now()),
        updated_at=now()
      from ranked
      where e.id=ranked.id and ranked.rn>v_keep_ai_pro
      returning e.id
    )
    select count(*)::integer into v_withdrawn_entries from changed;

    v_total_removed_riders := v_total_removed_riders+coalesce(v_removed_riders,0);
    v_total_withdrawn_entries := v_total_withdrawn_entries+coalesce(v_withdrawn_entries,0);

    v_fill := public.fill_race_ai_teams_uwt_v1(v_race.id);

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'race_id',v_race.id,
      'race_name',v_race.name,
      'fill_result',v_fill
    ));
  end loop;

  return jsonb_build_object(
    'success',true,
    'policy','uwt_80_worldteam_20_regional_proteam_v1',
    'future_only',true,
    'historical_results_untouched',true,
    'ai_entries_withdrawn',v_total_withdrawn_entries,
    'participant_riders_removed',v_total_removed_riders,
    'results',v_results
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_user_daily_game_notification_v1(p_user_id uuid, p_type_code text, p_title text, p_message text, p_action_url text, p_payload_json jsonb, p_event_key text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_type_id bigint;
  v_id bigint;
  v_payload jsonb;
  v_message text;
  v_changed boolean:=false;
begin
  select id into v_type_id from public.notification_types
  where code=p_type_code and is_active=true limit 1;
  if v_type_id is null then raise exception 'Notification type not found or inactive: %',p_type_code; end if;

  v_payload:=coalesce(p_payload_json,'{}'::jsonb)||jsonb_build_object('event_key',p_event_key,'type_code',p_type_code);
  v_message:=public.notification_daily_summary_message_v1(p_type_code,v_payload,p_message);

  select n.id into v_id
  from public.notifications n
  join public.user_notifications un on un.notification_id=n.id
  where un.user_id=p_user_id and un.deleted_at is null and n.payload_json->>'event_key'=p_event_key
  order by n.id desc limit 1;

  if v_id is null then
    insert into public.notifications(type_id,title,message,source,action_url,payload_json,created_at)
    values(v_type_id,p_title,v_message,'game',p_action_url,v_payload,now()) returning id into v_id;
    insert into public.user_notifications(user_id,notification_id,status,created_at)
    values(p_user_id,v_id,'unread',now());
  else
    select (n.type_id is distinct from v_type_id or n.title is distinct from p_title or n.message is distinct from v_message
      or n.action_url is distinct from p_action_url or n.payload_json is distinct from v_payload)
    into v_changed from public.notifications n where n.id=v_id;
    if v_changed then
      update public.notifications set type_id=v_type_id,title=p_title,message=v_message,action_url=p_action_url,payload_json=v_payload
      where id=v_id;
      update public.user_notifications set status='unread',read_at=null
      where user_id=p_user_id and notification_id=v_id and deleted_at is null;
    end if;
  end if;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_application_daily_update_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_open jsonb; v_closing jsonb; v_pending jsonb;
  v_open_count int; v_closing_count int; v_pending_count int;
  v_created int:=0; u record; v_event_key text;
begin
  for u in
    select distinct c.owner_user_id as user_id
    from public.clubs c
    where c.owner_user_id is not null and coalesce(c.club_type,'main')='main' and c.deleted_at is null
  loop
    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object(
      'race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
      'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
      'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today
    ) order by coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),r.name),'[]'::jsonb)
    into v_open_count,v_open
    from public.races r join public.race_entry_rules rer on rer.race_id=r.id
    where r.status='scheduled' and rer.applications_status='open'
      and coalesce(rer.applications_open_game_date,public.make_game_rule_date_v1(rer.applications_open_season_number,rer.applications_open_month_number,rer.applications_open_day_number))<=v_today
      and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))>v_today
      and r.start_date::date>v_today;

    select count(*)::int,coalesce(jsonb_agg(x.item order by x.close_on,x.race_name),'[]'::jsonb)
    into v_closing_count,v_closing
    from (
      select r.name race_name,
        coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) close_on,
        jsonb_build_object('race_id',r.id,'race_name',r.name,'category',r.category,'start_date',r.start_date::date,
          'applications_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)),
          'days_until_close',coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number))-v_today) item
      from public.races r join public.race_entry_rules rer on rer.race_id=r.id
      where r.status='scheduled' and rer.applications_status='open'
        and coalesce(rer.applications_close_game_date,public.make_game_rule_date_v1(rer.applications_close_season_number,rer.applications_close_month_number,rer.applications_close_day_number)) between v_today+1 and v_today+3
    ) x;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('race_id',r.id,'race_name',r.name,'status',e.status,'start_date',r.start_date::date) order by r.start_date,r.name),'[]'::jsonb)
    into v_pending_count,v_pending
    from public.race_team_entries e
    join public.clubs c on c.id=e.club_id
    join public.races r on r.id=e.race_id
    where c.owner_user_id=u.user_id and e.status in ('applied','under_review','provisionally_accepted') and r.start_date::date>v_today;

    if coalesce(v_open_count,0)+coalesce(v_pending_count,0)>0 then
      v_event_key:='race_application_daily:'||u.user_id::text||':'||v_today::text;
      perform public.upsert_user_daily_game_notification_v1(
        u.user_id,'RACE_APPLICATION_DAILY_UPDATE','Race applications update',
        format('%s application window%s open · %s closing within 3 days · %s application%s awaiting a decision.',
          coalesce(v_open_count,0),case when v_open_count=1 then '' else 's' end,coalesce(v_closing_count,0),coalesce(v_pending_count,0),case when v_pending_count=1 then '' else 's' end),
        '/dashboard/calendar',
        jsonb_build_object('game_date',v_today,'opened_or_open_count',v_open_count,'closing_soon_count',v_closing_count,'pending_count',v_pending_count,
          'open_races',v_open,'closing_soon_races',v_closing,'pending_applications',v_pending,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20are%20open.png'),
        v_event_key);
      v_created:=v_created+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_created);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_race_preparation_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_attention int; v_final int; v_open int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with items as (
      select r.id race_id,r.name race_name,r.category,r.start_date::date start_date,
        coalesce(rp.rider_submission_deadline_on,
          public.make_game_rule_date_v1(nullif(to_jsonb(rer)->>'rider_submission_deadline_season_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_month_number','')::int,nullif(to_jsonb(rer)->>'rider_submission_deadline_day_number','')::int),
          r.start_date::date-4) deadline,
        coalesce(rp.status,'draft') prep_status,
        case
          when coalesce(rp.status,'')='missed_startlist' then 'attention'
          when coalesce(rp.status,'')='submitted' then 'finalised'
          when coalesce(rp.rider_submission_deadline_on,r.start_date::date-4)<=v_today+2 then 'attention'
          else 'open' end report_state
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_entry_rules rer on rer.race_id=r.id
      where c.owner_user_id=u.user_id and e.status='accepted' and r.start_date::date>=v_today
        and v_today>=r.start_date::date-15
    )
    select count(*)::int,count(*) filter(where report_state='attention')::int,count(*) filter(where report_state='finalised')::int,count(*) filter(where report_state='open')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'start_date',start_date,'rider_deadline',deadline,'status',prep_status,'report_state',report_state)
        order by case report_state when 'attention' then 0 when 'open' then 1 else 2 end,start_date,race_name),'[]'::jsonb)
    into v_total,v_attention,v_final,v_open,v_rows from items;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RACE_PREPARATION_DAILY_REPORT','Race preparation report',
        format('%s need attention · %s open/in progress · %s finalised.',coalesce(v_attention,0),coalesce(v_open,0),coalesce(v_final,0)),
        '/dashboard/race-preparation?tab=acceptedRaces',
        jsonb_build_object('game_date',v_today,'attention_count',v_attention,'open_count',v_open,'finalised_count',v_final,'races',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Plan%20needs%20Antention.png'),
        'race_preparation_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_stage_planning_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  u record; v_rows jsonb; v_total int; v_open int; v_soon int; v_locked int; v_missing int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    with base as (
      select r.id race_id,r.name race_name,r.category,rs.id stage_id,rs.stage_number,rs.name stage_name,rs.stage_date::date stage_date,
        rsp.id plan_id,coalesce(rsp.status,'missing') plan_status,
        coalesce(rsp.opens_on_game_date,rp.rider_submission_deadline_on,r.start_date::date-4) open_on,
        (rs.stage_date::timestamp + make_interval(hours=>coalesce(nullif(to_jsonb(rs)->>'planned_start_hour_number','')::int,r.planned_start_hour_number,9),mins=>coalesce(nullif(to_jsonb(rs)->>'planned_start_minute','')::int,r.planned_start_minute,30))-interval '3 hours') lock_at
      from public.race_team_entries e join public.clubs c on c.id=e.club_id join public.races r on r.id=e.race_id
      join public.race_stages rs on rs.race_id=r.id
      left join public.race_preparations rp on rp.race_id=r.id and (rp.club_id=e.club_id or rp.participating_club_id=e.club_id)
      left join public.race_stage_plans rsp on rsp.race_id=r.id and rsp.stage_id=rs.id and (rp.id is null or rsp.race_preparation_id=rp.id)
      where c.owner_user_id=u.user_id and e.status='accepted' and rs.stage_date::date between v_today-1 and v_today+30
    ), items as (
      select *,case
        when plan_id is null and lock_at::date<=v_today then 'missing_at_lock'
        when plan_status='locked' and (coalesce(locked_date,lock_at::date)>=v_today-1) then 'locked'
        when plan_status<>'locked' and lock_at::date between v_today and v_today+2 then 'lock_soon'
        when plan_status<>'locked' and v_today>=open_on and v_today<lock_at::date then 'open'
        else null end report_state
      from (select b.*, (select rsp2.locked_at::date from public.race_stage_plans rsp2 where rsp2.id=b.plan_id) locked_date from base b) q
    )
    select count(*)::int,count(*) filter(where report_state='open')::int,count(*) filter(where report_state='lock_soon')::int,
      count(*) filter(where report_state='locked')::int,count(*) filter(where report_state='missing_at_lock')::int,
      coalesce(jsonb_agg(jsonb_build_object('race_id',race_id,'race_name',race_name,'category',category,'stage_id',stage_id,'stage_number',stage_number,'stage_name',stage_name,
        'stage_date',stage_date,'plan_status',plan_status,'opens_on',open_on,'lock_at',lock_at,'report_state',report_state)
        order by case report_state when 'missing_at_lock' then 0 when 'lock_soon' then 1 when 'open' then 2 else 3 end,stage_date,race_name,stage_number)
        filter(where report_state is not null),'[]'::jsonb)
    into v_total,v_open,v_soon,v_locked,v_missing,v_rows from items where report_state is not null;

    if coalesce(v_total,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'STAGE_PLANNING_DAILY_REPORT','Stage planning report',
        format('%s missing at lock · %s lock soon · %s open · %s locked/recent.',coalesce(v_missing,0),coalesce(v_soon,0),coalesce(v_open,0),coalesce(v_locked,0)),
        '/dashboard/race-preparation?tab=stagePlans',
        jsonb_build_object('game_date',v_today,'missing_at_lock_count',v_missing,'lock_soon_count',v_soon,'open_count',v_open,'locked_count',v_locked,'stages',v_rows,
          'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20plan%20open.png'),
        'stage_planning_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_rider_health_daily_report_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_today date:=public.get_current_game_date_date(); u record; v_events jsonb; v_current jsonb;
  v_inj int; v_sick int; v_nff int; v_fit int; v_issues int; v_count int:=0;
begin
  for u in select distinct owner_user_id user_id from public.clubs where owner_user_id is not null and coalesce(club_type,'main')='main' and deleted_at is null loop
    select count(*) filter(where l.event_code='rider_injured')::int,count(*) filter(where l.event_code='rider_sick')::int,
      count(*) filter(where l.event_code='rider_not_fully_fit')::int,count(*) filter(where l.event_code='rider_fit_again')::int,
      coalesce(jsonb_agg(jsonb_build_object('rider_id',l.rider_id,'rider_name',r.display_name,'event',l.event_code) order by l.created_at),'[]'::jsonb)
    into v_inj,v_sick,v_nff,v_fit,v_events
    from public.rider_status_notification_log l join public.riders r on r.id=l.rider_id
    where l.user_id=u.user_id and l.processed_date=v_today;

    select count(*)::int,coalesce(jsonb_agg(jsonb_build_object('rider_id',r.id,'rider_name',r.display_name,'status',r.availability_status,'fatigue',r.fatigue,
      'unavailable_until',r.unavailable_until,'unavailable_reason',r.unavailable_reason) order by r.display_name),'[]'::jsonb)
    into v_issues,v_current
    from public.riders r join public.club_riders cr on cr.rider_id=r.id join public.clubs c on c.id=cr.club_id
    where c.owner_user_id=u.user_id and c.deleted_at is null and coalesce(c.is_ai,false)=false and coalesce(c.club_type,'main')='main'
      and r.availability_status in ('injured','sick','not_fully_fit');

    if coalesce(v_inj,0)+coalesce(v_sick,0)+coalesce(v_nff,0)+coalesce(v_fit,0)+coalesce(v_issues,0)>0 then
      perform public.upsert_user_daily_game_notification_v1(u.user_id,'RIDER_HEALTH_DAILY_REPORT','Team medical report',
        format('%s injured · %s sick · %s not fully fit · %s recovered today. %s rider%s currently need medical/fitness attention.',
          coalesce(v_inj,0),coalesce(v_sick,0),coalesce(v_nff,0),coalesce(v_fit,0),coalesce(v_issues,0),case when v_issues=1 then '' else 's' end),
        '/dashboard/squad',jsonb_build_object('game_date',v_today,'injured_today',v_inj,'sick_today',v_sick,'not_fully_fit_today',v_nff,'recovered_today',v_fit,
          'current_issue_count',v_issues,'changes_today',v_events,'current_health_issues',v_current),
        'rider_health_daily:'||u.user_id::text||':'||v_today::text);
      v_count:=v_count+1;
    end if;
  end loop;
  return jsonb_build_object('success',true,'game_date',v_today,'daily_reports_checked_or_created',v_count);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.notification_daily_summary_message_v1(p_type_code text, p_payload jsonb, p_fallback text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_code text := upper(coalesce(p_type_code,''));
  v_open int := coalesce(nullif(p_payload->>'opened_or_open_count','')::int, nullif(p_payload->>'open_count','')::int, 0);
  v_closing int := coalesce(nullif(p_payload->>'closing_soon_count','')::int, 0);
  v_pending int := coalesce(nullif(p_payload->>'pending_count','')::int, 0);
  v_attention int := coalesce(nullif(p_payload->>'attention_count','')::int, 0);
  v_finalised int := coalesce(nullif(p_payload->>'finalised_count','')::int, 0);
  v_missing int := coalesce(nullif(p_payload->>'missing_at_lock_count','')::int, 0);
  v_soon int := coalesce(nullif(p_payload->>'lock_soon_count','')::int, 0);
  v_locked int := coalesce(nullif(p_payload->>'locked_count','')::int, 0);
  v_injured int := coalesce(nullif(p_payload->>'injured_today','')::int, 0);
  v_sick int := coalesce(nullif(p_payload->>'sick_today','')::int, 0);
  v_nff int := coalesce(nullif(p_payload->>'not_fully_fit_today','')::int, 0);
  v_recovered int := coalesce(nullif(p_payload->>'recovered_today','')::int, 0);
  v_issues int := coalesce(nullif(p_payload->>'current_issue_count','')::int, 0);
  v_names text;
  v_attention_names text;
begin
  if v_code='RACE_APPLICATION_DAILY_UPDATE' then
    select string_agg(x.race_name, ', ')
      into v_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'closing_soon_races','[]'::jsonb)) e
      where nullif(trim(e->>'race_name'),'') is not null
      limit 5
    ) x;

    return format(
      '%s application window%s %s open. %s %s within 3 days%s. %s',
      v_open,
      case when v_open=1 then '' else 's' end,
      case when v_open=1 then 'is' else 'are' end,
      v_closing,
      case when v_closing=1 then 'closes' else 'close' end,
      case when coalesce(v_names,'')<>'' then ': '||v_names else '' end,
      case
        when v_pending=0 then 'No applications are awaiting a decision.'
        when v_pending=1 then '1 application is awaiting a decision.'
        else v_pending||' applications are awaiting a decision.'
      end
    );
  end if;

  if v_code='RACE_PREPARATION_DAILY_REPORT' then
    select string_agg(x.race_name, ', ')
      into v_attention_names
    from (
      select nullif(trim(e->>'race_name'),'') as race_name
      from jsonb_array_elements(coalesce(p_payload->'races','[]'::jsonb)) e
      where e->>'report_state'='attention'
        and nullif(trim(e->>'race_name'),'') is not null
      limit 4
    ) x;

    return format(
      '%s race%s %s attention%s. %s open/in progress. %s finalised.',
      v_attention,
      case when v_attention=1 then '' else 's' end,
      case when v_attention=1 then 'needs' else 'need' end,
      case when coalesce(v_attention_names,'')<>'' then ': '||v_attention_names else '' end,
      v_open,
      v_finalised
    );
  end if;

  if v_code='STAGE_PLANNING_DAILY_REPORT' then
    return format(
      '%s missing at lock. %s %s soon. %s open. %s locked/recent.',
      v_missing,
      v_soon,
      case when v_soon=1 then 'locks' else 'lock' end,
      v_open,
      v_locked
    );
  end if;

  if v_code='RIDER_HEALTH_DAILY_REPORT' then
    if v_injured+v_sick+v_nff+v_recovered+v_issues=0 then
      return 'No rider health or fitness issues require attention today.';
    end if;

    return format(
      '%s injured. %s sick. %s not fully fit. %s recovered today. %s rider%s currently need medical/fitness attention.',
      v_injured,
      v_sick,
      v_nff,
      v_recovered,
      v_issues,
      case when v_issues=1 then '' else 's' end
    );
  end if;

  return p_fallback;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_sport_director_startlist_notification_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_data jsonb;
  v_race_id uuid;
  v_club_id uuid;
  v_race_start date;
  v_race_end date;
  v_stage_date date;
  v_race_category text;
  v_next_future_race_id uuid;
  v_next_future_race_name text;
  v_next_future_race_start date;
  v_deadline_raw text;
  v_deadline_date date;
  v_deadline_display text;
begin
  if new.payload_json is null or jsonb_typeof(new.payload_json) <> 'object' then
    return new;
  end if;

  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT'
     or coalesce(new.payload_json ->> 'report_code', '') <> 'sd_startlist_deadline_alert' then
    return new;
  end if;

  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_race_id := nullif(v_data ->> 'next_race_id', '')::uuid;
  exception when others then
    v_race_id := null;
  end;

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  if v_race_id is not null then
    select r.start_date::date, r.end_date::date, r.category
      into v_race_start, v_race_end, v_race_category
    from public.races r
    where r.id = v_race_id;

    select min(rs.stage_date)::date
      into v_stage_date
    from public.race_stages rs
    where rs.race_id = v_race_id;
  end if;

  if v_club_id is not null and v_race_start is not null then
    select r2.id, r2.name, r2.start_date::date
      into v_next_future_race_id, v_next_future_race_name, v_next_future_race_start
    from public.race_team_entries rte2
    join public.races r2 on r2.id = rte2.race_id
    where rte2.club_id = v_club_id
      and rte2.status = 'accepted'
      and r2.start_date::date > v_race_start
    order by r2.start_date::date, r2.name, r2.id
    limit 1;
  end if;

  v_deadline_raw := nullif(v_data ->> 'rider_submission_deadline_on', '');
  if v_deadline_raw ~ '^\d{4}-\d{2}-\d{2}' then
    begin
      v_deadline_date := substring(v_deadline_raw from 1 for 10)::date;
    exception when others then
      v_deadline_date := null;
    end;
  end if;

  if v_deadline_date is not null then
    v_deadline_display := public.staff_advisory_notification_game_date_label_v1(v_deadline_date);
    v_data := v_data
      || jsonb_build_object(
        'rider_submission_deadline_on_raw', v_deadline_date::text,
        'rider_submission_deadline_on', v_deadline_display
      );
    if new.message is not null then
      new.message := replace(new.message, v_deadline_raw, v_deadline_display);
    end if;
  end if;

  if v_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'race_start_date_raw', v_race_start::text,
      'race_start_date', public.staff_advisory_notification_game_date_label_v1(v_race_start)
    );
  end if;

  if v_race_end is not null then
    v_data := v_data || jsonb_build_object(
      'race_end_date_raw', v_race_end::text,
      'race_end_date', public.staff_advisory_notification_game_date_label_v1(v_race_end)
    );
  end if;

  if v_stage_date is not null then
    v_data := v_data || jsonb_build_object(
      'stage_date_raw', v_stage_date::text,
      'stage_date', public.staff_advisory_notification_game_date_label_v1(v_stage_date)
    );
  end if;

  if v_race_category is not null then
    v_data := v_data || jsonb_build_object('race_category', v_race_category);
  end if;

  if v_next_future_race_start is not null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_id', v_next_future_race_id,
      'next_future_race_name', v_next_future_race_name,
      'next_future_race_start_date_raw', v_next_future_race_start::text,
      'next_future_race_start_date', public.staff_advisory_notification_game_date_label_v1(v_next_future_race_start)
    );
  end if;

  new.payload_json := jsonb_set(new.payload_json, '{data}', v_data, true);
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_universal_race_stage_replay_payload_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run public.race_stage_simulation_runs%rowtype;
  v_state public.race_stage_automation_state%rowtype;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_output jsonb;
  v_replay_sync jsonb;
  v_replay_checkpoints jsonb;
  v_replay_closes_at_real timestamptz;
  v_results_published boolean := false;
  v_replay_window_elapsed boolean := false;
  v_results_visible boolean := false;
  v_speed_locked boolean := false;
begin
  select * into v_control
  from public.race_engine_runtime_control_v1
  where singleton_id = true;

  select stage.stage_date::timestamp
      + make_interval(
          hours => coalesce(stage.planned_start_hour_number, 12),
          mins => coalesce(stage.planned_start_minute, 0)
        )
  into v_stage_start_game_at
  from public.race_stages stage
  where stage.id = p_stage_id;

  if v_stage_start_game_at is null then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', 'stage_not_found_or_unscheduled',
      'stage_id', p_stage_id
    );
  end if;

  v_calculation_due_game_at := v_stage_start_game_at
    - make_interval(hours => coalesce(v_control.typescript_calculation_lead_hours, 3));

  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;

  select run.*
  into v_run
  from public.race_stage_simulation_runs run
  where run.stage_id = p_stage_id
    and run.status in ('running', 'completed')
    and run.engine_version = 'race_engine_ts_v1'
    and run.simulation_mode = 'deterministic_road_race_v1'
    and coalesce(run.result_summary_json ->> 'calculation_contract', '') =
      'universal_phase11b_calculated_hidden_v1'
  order by run.updated_at desc, run.created_at desc, run.id desc
  limit 1;

  if not found then
    return jsonb_build_object(
      'status', 'not_available',
      'reason', case
        when v_current_game_at < v_calculation_due_game_at
          then 'awaiting_calculation_window'
        else 'awaiting_backend_calculation'
      end,
      'stage_id', p_stage_id,
      'current_game_at', v_current_game_at,
      'calculation_due_game_at', v_calculation_due_game_at,
      'replay_opens_game_at', v_stage_start_game_at,
      'browser_calculation_allowed', false
    );
  end if;

  v_output := coalesce(
    v_run.result_summary_json -> 'output_snapshot',
    '{}'::jsonb
  );

  v_replay_sync := coalesce(
    v_output #> '{universalResult,replaySynchronization}',
    '{}'::jsonb
  );
  v_replay_checkpoints := coalesce(
    v_output #> '{universalResult,replayTimeline,checkpoints}',
    '[]'::jsonb
  );

  if coalesce((v_replay_sync ->> 'synchronized')::boolean, false) = false
     and jsonb_typeof(v_replay_checkpoints) = 'array'
     and jsonb_array_length(v_replay_checkpoints) >= 2
     and coalesce((v_replay_sync ->> 'allCheckpointRidersComplete')::boolean, false)
     and coalesce((v_replay_sync ->> 'allCheckpointsChronological')::boolean, false)
     and coalesce((v_replay_sync ->> 'allGapsMatchGroups')::boolean, false)
     and coalesce((v_replay_sync ->> 'allResultFieldsHiddenBeforeFinish')::boolean, false)
     and coalesce((v_replay_sync ->> 'finalCheckpointMatchesClassification')::boolean, false)
  then
    v_output := jsonb_set(
      v_output,
      '{universalResult,replayProgressGuarantee}',
      jsonb_build_object(
        'canProgress', true,
        'mode', 'degraded',
        'reason', 'non_blocking_synchronization_warnings',
        'issueCount', jsonb_array_length(
          coalesce(v_replay_sync -> 'issues', '[]'::jsonb)
        )
      ),
      true
    );
  end if;

  select *
  into v_state
  from public.race_stage_automation_state state
  where state.stage_id = p_stage_id;

  if v_current_game_at < v_stage_start_game_at then
    return jsonb_build_object(
      'status', 'not_open',
      'stage_id', p_stage_id,
      'calculated', true,
      'simulation_run_id', v_run.id,
      'replay_opens_game_at', v_stage_start_game_at,
      'results_visible', false,
      'browser_calculation_allowed', false
    );
  end if;

  v_replay_closes_at_real := nullif(v_state.details ->> 'replay_closes_at_real', '')::timestamptz;
  v_results_published :=
    coalesce((v_run.result_summary_json ->> 'results_published')::boolean, false)
    or v_run.status = 'completed'
    or coalesce(v_state.last_status, '') = 'published';
  v_replay_window_elapsed :=
    v_replay_closes_at_real is not null
    and now() >= v_replay_closes_at_real;
  v_results_visible := v_results_published or v_replay_window_elapsed;
  v_speed_locked :=
    not v_results_visible
    and coalesce(v_state.last_status, '') = 'replay_live'
    and v_replay_closes_at_real is not null
    and now() < v_replay_closes_at_real;

  return jsonb_build_object(
    'status', 'available',
    'stage_id', p_stage_id,
    'race_id', v_run.race_id,
    'simulation_run_id', v_run.id,
    'engine_version', v_output ->> 'engineVersion',
    'engine_key', v_output ->> 'engineKey',
    'database_engine_identity', v_run.engine_version,
    'database_simulation_mode', v_run.simulation_mode,
    'input_snapshot', v_run.input_snapshot_json,
    'output_snapshot', v_output,
    'lifecycle', jsonb_build_object(
      'replay_opened_game_at', v_stage_start_game_at,
      'replay_opened_at_real', v_state.details ->> 'replay_opened_at_real',
      'replay_closes_at_real', v_state.details ->> 'replay_closes_at_real',
      'results_visible', v_results_visible,
      'results_published_at', v_state.details ->> 'results_published_at_real',
      'speed_locked', v_speed_locked,
      'publication_pending', v_replay_window_elapsed and not v_results_published,
      'publication_error', v_state.last_error,
      'verification_only', false,
      'official_outputs_persisted', coalesce(
        (v_run.result_summary_json ->> 'official_outputs_persisted')::boolean,
        false
      ),
      'phase11_persistence_applied', coalesce(
        (v_run.result_summary_json ->> 'phase11_persistence_applied')::boolean,
        false
      ),
      'browser_calculation_allowed', false
    )
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_merged_daily_notification_image_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_code text;
  v_image_url text;
begin
  select nt.code into v_code
  from public.notification_types nt
  where nt.id = new.type_id;

  v_image_url := case v_code
    when 'RACE_APPLICATION_DAILY_UPDATE' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Application%20daily%20update.png'
    when 'RACE_PREPARATION_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Race%20Preparation%20daily%20report.png'
    when 'STAGE_PLANNING_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Stage%20Planning%20Daily%20Report.png'
    when 'RIDER_HEALTH_DAILY_REPORT' then 'https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/Rider%20health%20daily%20report.png'
    else null
  end;

  if v_image_url is not null then
    new.payload_json := jsonb_set(
      coalesce(new.payload_json, '{}'::jsonb),
      '{image_url}',
      to_jsonb(v_image_url),
      true
    );
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.staff_advisory_format_game_dates_in_text_v2(p_text text, p_current_game_date date)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result text := p_text;
  v_match text[];
  v_raw text;
  v_date date;
begin
  if p_text is null or btrim(p_text) = '' or p_current_game_date is null then
    return p_text;
  end if;

  for v_match in
    select regexp_matches(p_text, '([0-9]{4}-[0-9]{2}-[0-9]{2})', 'g')
  loop
    v_raw := v_match[1];
    begin
      v_date := v_raw::date;
    exception when others then
      continue;
    end;

    if abs(v_date - p_current_game_date) <= 400 then
      v_result := replace(
        v_result,
        v_raw,
        public.staff_advisory_notification_game_date_label_v1(v_date)
      );
    end if;
  end loop;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enrich_sport_director_notification_context_v2()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_club_id uuid;
  v_race_id uuid;
  v_race_id_text text;
  v_stage_id uuid;
  v_stage_id_text text;
  v_current_game_date date;
  v_race_name text;
  v_race_start date;
  v_race_end date;
  v_race_category text;
  v_country_code text;
  v_host_city text;
  v_race_location text;
  v_prep_id uuid;
  v_prep_status text;
  v_startlist_status text;
  v_deadline date;
  v_stage_number integer;
  v_stage_date date;
  v_stage_start_label text;
  v_next_race_id uuid;
  v_next_race_name text;
  v_next_race_start date;
  v_management_count integer;
  v_missing_count integer := 0;
  v_problem_count integer := 0;
  v_summary text;
  v_recommendations jsonb;
  v_race_days integer;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  begin
    v_club_id := nullif(new.payload_json ->> 'club_id', '')::uuid;
  exception when others then
    v_club_id := null;
  end;

  begin
    if coalesce(v_data ->> 'current_game_date', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      v_current_game_date := (v_data ->> 'current_game_date')::date;
    else
      v_current_game_date := null;
    end if;
  exception when others then
    v_current_game_date := null;
  end;

  v_race_id_text := coalesce(
    nullif(v_data ->> 'current_focus_race_id', ''),
    nullif(v_data ->> 'race_id', ''),
    nullif(v_data ->> 'next_race_id', ''),
    nullif(v_data ->> 'active_race_id', ''),
    nullif(v_data ->> 'next_future_race_id', '')
  );

  if v_race_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    v_race_id := v_race_id_text::uuid;
  end if;

  if v_race_id is not null then
    select r.name, r.start_date, r.end_date, r.category, r.country_code, r.host_city
      into v_race_name, v_race_start, v_race_end, v_race_category, v_country_code, v_host_city
    from public.races r
    where r.id = v_race_id;

    if v_race_name is not null then
      v_race_location := case
        when nullif(btrim(v_host_city), '') is not null and nullif(btrim(v_country_code), '') is not null
          then btrim(v_host_city) || ', ' || upper(btrim(v_country_code))
        when nullif(btrim(v_host_city), '') is not null then btrim(v_host_city)
        when nullif(btrim(v_country_code), '') is not null then upper(btrim(v_country_code))
        else null
      end;

      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'race_id', v_race_id,
        'race_name', v_race_name,
        'race_start_date', v_race_start,
        'race_end_date', v_race_end,
        'race_category', v_race_category,
        'country_code', v_country_code,
        'race_location', v_race_location
      ));

      if v_current_game_date is not null and v_race_start is not null then
        v_race_days := v_race_start - v_current_game_date;
        v_data := v_data || jsonb_build_object(
          'race_urgency',
          case
            when v_race_days < 0 and v_current_game_date <= coalesce(v_race_end, v_race_start) then 'active'
            when v_race_days < 0 then 'completed'
            when v_race_days = 0 then 'today'
            when v_race_days = 1 then 'tomorrow'
            else format('in %s days', v_race_days)
          end
        );
      end if;
    end if;

    if v_club_id is not null then
      select rp.id, rp.status, rp.startlist_status, rp.rider_submission_deadline_on
        into v_prep_id, v_prep_status, v_startlist_status, v_deadline
      from public.race_preparations rp
      where rp.race_id = v_race_id
        and (rp.club_id = v_club_id or rp.participating_club_id = v_club_id)
      order by rp.updated_at desc nulls last, rp.created_at desc nulls last
      limit 1;

      if v_prep_id is not null then
        v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
          'race_preparation_id', v_prep_id,
          'race_preparation_status', v_prep_status,
          'preparation_status', v_prep_status,
          'startlist_status', v_startlist_status,
          'rider_submission_deadline_on', v_deadline
        ));
      end if;
    end if;

    v_stage_id_text := coalesce(
      nullif(v_data ->> 'stage_id', ''),
      nullif(v_data #>> '{next_missing_stage,stage_id}', ''),
      nullif(v_data #>> '{next_problem_stage,stage_id}', ''),
      nullif(v_data #>> '{missing_stage_details,0,stage_id}', ''),
      nullif(v_data #>> '{problem_stage_details,0,stage_id}', '')
    );

    if v_stage_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_stage_id := v_stage_id_text::uuid;
    end if;

    if v_stage_id is not null then
      select rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.id = v_stage_id;
    elsif v_report_code in (
      'sd_stage_plans_missing',
      'sd_stage_plans_incomplete',
      'sd_startlist_deadline_alert',
      'sd_race_preparation_missing',
      'sd_race_eligibility_critical'
    ) then
      select rs.id, rs.stage_number, rs.stage_date, rs.planned_start_time_label
        into v_stage_id, v_stage_number, v_stage_date, v_stage_start_label
      from public.race_stages rs
      where rs.race_id = v_race_id
      order by
        case when v_current_game_date is not null and rs.stage_date >= v_current_game_date then 0 else 1 end,
        rs.stage_date,
        rs.stage_number
      limit 1;
    end if;

    if v_stage_date is not null then
      v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
        'stage_id', v_stage_id,
        'stage_number', v_stage_number,
        'stage_date', v_stage_date,
        'stage_start_time_label', v_stage_start_label
      ));
    end if;

    if v_club_id is not null and v_race_start is not null then
      select r2.id, r2.name, r2.start_date
        into v_next_race_id, v_next_race_name, v_next_race_start
      from public.race_team_entries rte2
      join public.races r2 on r2.id = rte2.race_id
      where rte2.club_id = v_club_id
        and rte2.status = 'accepted'
        and r2.id <> v_race_id
        and r2.start_date > coalesce(v_race_end, v_race_start)
      order by r2.start_date, r2.name, r2.id
      limit 1;

      if v_next_race_id is not null then
        v_data := v_data || jsonb_build_object(
          'next_future_race_id', v_next_race_id,
          'next_future_race_name', v_next_race_name,
          'next_future_race_start_date', v_next_race_start
        );
      else
        v_data := v_data
          - 'next_future_race_id'
          - 'next_future_race_name'
          - 'next_future_race_start_date';
      end if;
    end if;
  end if;

  if jsonb_typeof(v_data -> 'missing_stage_details') = 'array' then
    v_missing_count := jsonb_array_length(v_data -> 'missing_stage_details');
  elsif coalesce(v_data ->> 'actionable_missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'actionable_missing_stage_plans')::integer;
  elsif coalesce(v_data ->> 'missing_stage_plans', '') ~ '^\d+$' then
    v_missing_count := (v_data ->> 'missing_stage_plans')::integer;
  end if;

  if jsonb_typeof(v_data -> 'problem_stage_details') = 'array' then
    v_problem_count := jsonb_array_length(v_data -> 'problem_stage_details');
  elsif coalesce(v_data ->> 'actionable_problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'actionable_problem_stage_plans')::integer;
  elsif coalesce(v_data ->> 'problem_stage_plans', '') ~ '^\d+$' then
    v_problem_count := (v_data ->> 'problem_stage_plans')::integer;
  end if;

  if coalesce(v_data ->> 'management_priority_count', '') ~ '^\d+$' then
    v_management_count := (v_data ->> 'management_priority_count')::integer;
  elsif jsonb_typeof(new.payload_json -> 'management_priorities') = 'array' then
    v_management_count := jsonb_array_length(new.payload_json -> 'management_priorities');
  elsif v_report_code in ('sd_stage_plans_missing','sd_stage_plans_incomplete') then
    v_management_count := v_missing_count + v_problem_count;
  elsif v_report_code in ('sd_startlist_deadline_alert','sd_race_preparation_missing','sd_race_eligibility_critical','sd_race_programme_gap') then
    v_management_count := 1;
  else
    v_management_count := 0;
  end if;

  v_data := v_data || jsonb_build_object('management_priority_count', v_management_count);

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  v_summary := nullif(new.payload_json ->> 'summary', '');
  if v_summary is not null then
    v_summary := public.staff_advisory_format_game_dates_in_text_v2(v_summary, v_current_game_date);
    new.payload_json := jsonb_set(new.payload_json, '{summary}', to_jsonb(v_summary), true);
    new.message := v_summary;
  end if;

  if jsonb_typeof(new.payload_json -> 'recommendations') = 'array' then
    select jsonb_agg(
      to_jsonb(public.staff_advisory_format_game_dates_in_text_v2(value, v_current_game_date))
      order by ord
    )
    into v_recommendations
    from jsonb_array_elements_text(new.payload_json -> 'recommendations') with ordinality as x(value, ord);

    if v_recommendations is not null then
      new.payload_json := jsonb_set(new.payload_json, '{recommendations}', v_recommendations, true);
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.normalize_sport_director_notification_display_context_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_type_code text;
  v_report_code text;
  v_data jsonb;
  v_prep_status text;
  v_startlist_status text;
begin
  select nt.code into v_type_code
  from public.notification_types nt
  where nt.id = new.type_id;

  if v_type_code <> 'ADVISOR_SPORT_DIRECTOR_REPORT' then
    return new;
  end if;

  v_report_code := coalesce(new.payload_json ->> 'report_code', '');
  v_data := coalesce(new.payload_json -> 'data', '{}'::jsonb);

  v_prep_status := nullif(v_data ->> 'race_preparation_status', '');
  if v_prep_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'race_preparation_status_raw', 'submitted',
      'preparation_status_raw', coalesce(nullif(v_data ->> 'preparation_status', ''), 'submitted'),
      'race_preparation_status', 'ready',
      'preparation_status', 'ready'
    );
  end if;

  v_startlist_status := nullif(v_data ->> 'startlist_status', '');
  if v_startlist_status = 'submitted' then
    v_data := v_data || jsonb_build_object(
      'startlist_status_raw', 'submitted',
      'startlist_status', 'ready'
    );
  end if;

  if nullif(v_data ->> 'next_future_race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'next_future_race_name', 'None scheduled',
      'next_future_race_start_date', 'Not scheduled'
    );
  end if;

  if v_report_code = 'sd_race_programme_gap'
     and nullif(v_data ->> 'race_id', '') is null then
    v_data := v_data || jsonb_build_object(
      'race_name', 'No accepted race',
      'race_start_date', 'Not scheduled',
      'race_end_date', 'Not scheduled',
      'race_location', 'Not scheduled',
      'rider_submission_deadline_on', 'Not scheduled',
      'stage_date', 'Not applicable'
    );
  end if;

  new.payload_json := jsonb_set(
    coalesce(new.payload_json, '{}'::jsonb),
    '{data}',
    v_data,
    true
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.invalidate_race_startlist_captain_finalization_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.race_startlist_engine_self_heal_v1(p_race_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_readiness_before jsonb;
  v_readiness_after jsonb;
  v_team_list_repair jsonb := null;
  v_hierarchy_fill jsonb := null;
  v_startlist_repair jsonb := null;
  v_current_game_at timestamp without time zone;
  v_rider_deadline timestamp without time zone;
  v_team_list_attempted boolean := false;
  v_hierarchy_fill_attempted boolean := false;
  v_startlist_attempted boolean := false;
  v_team_list_error text := null;
  v_hierarchy_fill_error text := null;
  v_startlist_error text := null;
begin
  if p_race_id is null then
    return jsonb_build_object(
      'ready',false,
      'reason','race_id_required',
      'readiness_before',jsonb_build_object('ready',false,'reason','race_id_required'),
      'readiness_after',jsonb_build_object('ready',false,'reason','race_id_required')
    );
  end if;

  v_current_game_at := public.get_current_game_timestamp()::timestamp without time zone;
  v_readiness_before := public.race_startlist_engine_readiness_v1(p_race_id);
  v_readiness_after := v_readiness_before;

  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','')='team_list_not_finalized'
  then
    v_team_list_attempted := true;
    begin
      v_team_list_repair := public.finalize_race_team_list_announcement_v1(p_race_id);
    exception when others then
      v_team_list_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  begin
    v_rider_deadline :=
      nullif(v_readiness_after->>'rider_deadline_game_at','')::timestamp without time zone;
  exception when others then
    v_rider_deadline := null;
  end;

  /*
   * A short field is not an "unfillable-team" problem. Explicitly add teams
   * using the universal hierarchy before trying to finalize captains/numbers.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','')='insufficient_eligible_teams'
     and (v_rider_deadline is null or v_current_game_at >= v_rider_deadline)
  then
    v_hierarchy_fill_attempted := true;
    begin
      v_hierarchy_fill := public.fill_race_ai_teams_v1(p_race_id);
    exception when others then
      v_hierarchy_fill_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  /*
   * Once the rider deadline has passed, repair any remaining snapshots,
   * numbers, captain assignments or unfillable AI teams.
   */
  if coalesce((v_readiness_after->>'ready')::boolean,false) is not true
     and coalesce(v_readiness_after->>'reason','') not in (
       'rider_deadline_not_reached',
       'race_or_entry_rules_not_found',
       'race_id_required'
     )
     and (v_rider_deadline is null or v_current_game_at >= v_rider_deadline)
  then
    v_startlist_attempted := true;
    begin
      v_startlist_repair := public.finalize_race_startlist_captains_v1(p_race_id);
    exception when others then
      v_startlist_error := sqlstate || ': ' || sqlerrm;
    end;
    v_readiness_after := public.race_startlist_engine_readiness_v1(p_race_id);
  end if;

  return jsonb_build_object(
    'race_id',p_race_id,
    'ready',coalesce((v_readiness_after->>'ready')::boolean,false),
    'reason',coalesce(v_readiness_after->>'reason','unknown'),
    'current_game_at',v_current_game_at,
    'rider_deadline_game_at',v_rider_deadline,
    'readiness_before',v_readiness_before,
    'readiness_after',v_readiness_after,
    'team_list_repair_attempted',v_team_list_attempted,
    'team_list_repair_result',v_team_list_repair,
    'team_list_repair_error',v_team_list_error,
    'hierarchy_fill_attempted',v_hierarchy_fill_attempted,
    'hierarchy_fill_result',v_hierarchy_fill,
    'hierarchy_fill_error',v_hierarchy_fill_error,
    'startlist_repair_attempted',v_startlist_attempted,
    'startlist_repair_result',v_startlist_repair,
    'startlist_repair_error',v_startlist_error,
    'self_heal_model','team_shortage_hierarchy_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.race_engine_due_stage_watchdog_run_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  /* First make sure all globally due rider deadlines have been processed. */
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
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone as stage_start_game_at,
      public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3)) as calculation_due_game_at
    from public.race_stages s
    join public.races r on r.id=s.race_id
    where not coalesce(s.weather_cancelled,false)
      and public.race_stage_planned_start_game_at_v1(s.id) is not null
      and (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone) >= v_control.typescript_activation_game_at
      and (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3))) <= v_now
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
      case when (public.race_stage_planned_start_game_at_v1(s.id)::timestamp without time zone) <= v_now then 0 else 1 end,
      public.race_stage_planned_start_game_at_v1(s.id), s.race_id, s.stage_number
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

    /* Stronger canonical repair once a stage is due and ordinary self-heal was insufficient. */
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
    if v_ready and not coalesce((v_before->>'ready')::boolean,false) then
      v_repaired := v_repaired + 1;
    end if;
    if not v_ready then
      v_blocked := v_blocked + 1;
    end if;

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
      first_blocked_at=case
        when excluded.ready then public.race_engine_due_stage_watchdog_v1.first_blocked_at
        else coalesce(public.race_engine_due_stage_watchdog_v1.first_blocked_at, now())
      end,
      last_blocked_at=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.last_blocked_at else now() end,
      blocked_check_count=case when excluded.ready then public.race_engine_due_stage_watchdog_v1.blocked_check_count else public.race_engine_due_stage_watchdog_v1.blocked_check_count+1 end,
      updated_at=now();
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_now,
    'checked',v_checked,
    'repaired',v_repaired,
    'blocked',v_blocked
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_mode_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
begin
  select s.id as stage_id,s.race_id,s.stage_date,
         s.planned_start_hour_number,s.planned_start_minute
    into v_stage
  from public.race_stages s
  where s.id=p_stage_id;

  if not found then
    return jsonb_build_object(
      'status','stage_not_found',
      'stage_id',p_stage_id,
      'use_fallback',false,
      'primary_required',false,
      'recovery_policy','same_full_input_or_quarantine_v1'
    );
  end if;

  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  v_stage_start_game_at := v_stage.stage_date::timestamp
    + make_interval(
        hours=>coalesce(v_stage.planned_start_hour_number,12),
        mins=>coalesce(v_stage.planned_start_minute,0)
      );

  select count(*)::integer
    into v_prior_failed_attempts
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed';

  select sr.id,sr.error_message,coalesce(sr.result_summary_json,'{}'::jsonb)
    into v_latest_failed_id,v_latest_error_message,v_latest_result_summary
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
  order by coalesce(sr.failed_at,sr.updated_at,sr.created_at) desc
  limit 1;

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_authoritative_exists;

  v_deadline_reached :=
    v_current_game_at >= v_stage_start_game_at - interval '15 minutes';

  return jsonb_build_object(
    'status','resolved',
    'stage_id',p_stage_id,
    'race_id',v_stage.race_id,
    'current_game_at',v_current_game_at,
    'stage_start_game_at',v_stage_start_game_at,
    'mandatory_ready_deadline_game_at',v_stage_start_game_at-interval '15 minutes',
    'deadline_reached',v_deadline_reached,
    'prior_failed_attempts',v_prior_failed_attempts,
    'latest_failed_simulation_run_id',v_latest_failed_id,
    'latest_failed_survival_phase',nullif(v_latest_result_summary->>'survival_phase',''),
    'latest_failed_reason',coalesce(
      nullif(v_latest_result_summary#>>'{error_details,reason}',''),
      nullif(v_latest_error_message,'')
    ),
    'authoritative_exists',v_authoritative_exists,
    'primary_required',not v_authoritative_exists,
    'retry_with_primary',not v_authoritative_exists and v_prior_failed_attempts>0,
    'emergency_fallback_allowed_after_current_primary_failure',false,
    'use_fallback',false,
    'scenario_must_be_preserved',true,
    'recovery_policy','same_full_input_or_quarantine_v1',
    'fallback_reason',case
      when v_authoritative_exists then 'authoritative_result_exists'
      when v_prior_failed_attempts>0 then 'retry_same_full_input_or_new_seed'
      when v_deadline_reached then 'primary_required_at_mandatory_deadline'
      else 'normal_engine_first_attempt'
    end,
    'model_version','race_calculation_survival_primary_retry_v5_same_full_input'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_recover_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_run record;
  v_stage_start_game_at timestamp without time zone;
  v_deadline_reached boolean;
  v_stale_after interval;
  v_age interval;
  v_absolute_age interval;
  v_phase text;
  v_recovered integer := 0;
  v_checked integer := 0;
  v_hard_expired integer := 0;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
    into v_current_game_at;

  for v_run in
    select sr.id as simulation_run_id,
           sr.stage_id,
           sr.race_id,
           sr.started_at,
           sr.updated_at,
           sr.created_at,
           coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
           s.stage_date,
           s.planned_start_hour_number,
           s.planned_start_minute
    from public.race_stage_simulation_runs sr
    join public.race_stages s on s.id=sr.stage_id
    where sr.engine_version='race_engine_ts_v1'
      and sr.simulation_mode='deterministic_road_race_v1'
      and sr.status='running'
      and (
        coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
        or (
          coalesce(sr.result_summary_json->>'calculation_contract','')=''
          and coalesce(sr.result_summary_json->>'phase11b_contract','')='universal_production_engine_v2'
          and coalesce(sr.result_summary_json->>'support_contract','')='supabase_race_calculation_survival_v1'
        )
      )
      and not exists (
        select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
      )
    order by coalesce(sr.updated_at,sr.started_at,sr.created_at)
    limit 200
  loop
    v_checked := v_checked + 1;
    v_stage_start_game_at := v_run.stage_date::timestamp
      + make_interval(hours=>coalesce(v_run.planned_start_hour_number,12),
                      mins=>coalesce(v_run.planned_start_minute,0));
    v_deadline_reached := v_current_game_at >= v_stage_start_game_at - interval '15 minutes';
    v_phase := coalesce(nullif(v_run.survival_phase,''),'claimed');

    v_stale_after := case
      when v_phase in ('primary_engine_started','fallback_engine_started') then interval '8 minutes'
      when v_phase in ('pass1_resume_claimed','pass1_payload_loading','pass1_started',
                       'pass2_resume_claimed','pass2_payload_loading') then interval '4 minutes'
      when v_phase in ('primary_engine_finished','fallback_engine_finished','output_ready','submitting','scenario_reserved') then interval '3 minutes'
      when v_phase in ('claimed','payload_loading','payload_loaded','pass1_pending','pass1_ready_no_scenario') then interval '5 minutes'
      else interval '5 minutes'
    end;

    v_age := clock_timestamp() - coalesce(v_run.updated_at,v_run.started_at,v_run.created_at);
    v_absolute_age := clock_timestamp() - coalesce(v_run.started_at,v_run.created_at);

    -- Hard wall-clock circuit breaker. Heartbeats prove liveness, not progress.
    -- A repeatedly restarted Edge worker must never be able to own the global
    -- race-calculation lane forever.
    if v_absolute_age >= interval '15 minutes' then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation exceeded the hard 15-minute wall-clock runtime limit.',
        jsonb_build_object(
          'recovery_model','race_calculation_hard_runtime_guard_v1',
          'reason','hard_wall_clock_runtime_limit_exceeded',
          'survival_phase',v_phase,
          'absolute_age_seconds',extract(epoch from v_absolute_age),
          'hard_limit_seconds',900,
          'heartbeat_age_seconds',extract(epoch from v_age),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_hard_runtime_limit',
        'hard_wall_clock_runtime_limit_exceeded',
        jsonb_build_object(
          'survival_phase',v_phase,
          'absolute_age_seconds',extract(epoch from v_absolute_age),
          'hard_limit_seconds',900,
          'heartbeat_age_seconds',extract(epoch from v_age),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );

      v_recovered := v_recovered + 1;
      v_hard_expired := v_hard_expired + 1;
      continue;
    end if;

    if v_age >= v_stale_after then
      perform public.universal_race_stage_fail_calculation_v1(
        v_run.stage_id,
        v_run.simulation_run_id,
        'Race calculation survival watchdog recovered an expired calculation lease.',
        jsonb_build_object(
          'recovery_model','race_calculation_survival_phase_aware_lease_v2',
          'reason','expired_phase_aware_calculation_lease_without_authoritative_result',
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at,
          'mandatory_ready_deadline_game_at',v_stage_start_game_at - interval '15 minutes'
        )
      );

      insert into public.race_engine_calculation_survival_audit_v1(
        stage_id,race_id,simulation_run_id,action,reason,details
      ) values (
        v_run.stage_id,
        v_run.race_id,
        v_run.simulation_run_id,
        'recover_expired_phase_lease',
        'expired_phase_aware_calculation_lease_without_authoritative_result',
        jsonb_build_object(
          'survival_phase',v_phase,
          'stale_age_seconds',extract(epoch from v_age),
          'stale_threshold_seconds',extract(epoch from v_stale_after),
          'deadline_reached',v_deadline_reached,
          'current_game_at',v_current_game_at,
          'stage_start_game_at',v_stage_start_game_at
        )
      );
      begin
        perform net.http_post(
          url := 'https://okuravitxocyevkexfgi.supabase.co/functions/v1/universal-race-stage-pass2-resume',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-universal-race-worker-secret',(
              select decrypted_secret
              from vault.decrypted_secrets
              where name='universal_race_worker_secret_v1'
              limit 1
            )
          ),
          body := '{"action":"tick"}'::jsonb,
          timeout_milliseconds := 30000
        );
      exception when others then
        null;
      end;
      v_recovered := v_recovered + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status','completed',
    'current_game_at',v_current_game_at,
    'checked_running_claims',v_checked,
    'recovered_stale_claims',v_recovered,
    'hard_runtime_expirations',v_hard_expired,
    'hard_runtime_limit_seconds',900,
    'claimed_or_payload_lease_seconds',240,
    'engine_lease_seconds',480,
    'post_engine_lease_seconds',180,
    'mandatory_ready_lead_minutes',15,
    'deadline_shortening_disabled',true,
    'model_version','race_calculation_survival_phase_aware_lease_v4_hard_runtime_guard'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_survival_heartbeat_v1(p_stage_id uuid, p_simulation_run_id uuid, p_phase text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated integer := 0;
begin
  update public.race_stage_simulation_runs sr
  set updated_at=clock_timestamp(),
      result_summary_json=coalesce(sr.result_summary_json,'{}'::jsonb) || jsonb_build_object(
        'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
        'survival_heartbeat_at_real',clock_timestamp(),
        'survival_details',coalesce(p_details,'{}'::jsonb)
      )
  where sr.id=p_simulation_run_id
    and sr.stage_id=p_stage_id
    and sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id);
  get diagnostics v_updated=row_count;

  if v_updated > 0 then
    update public.race_stage_automation_state st
    set last_checked_at=clock_timestamp(),
        details=coalesce(st.details,'{}'::jsonb) || jsonb_build_object(
          'survival_phase',coalesce(nullif(p_phase,''),'unknown'),
          'survival_heartbeat_at_real',clock_timestamp(),
          'survival_details',coalesce(p_details,'{}'::jsonb)
        ),
        updated_at=clock_timestamp()
    where st.stage_id=p_stage_id and st.simulation_run_id=p_simulation_run_id;
  end if;

  return jsonb_build_object(
    'status',case when v_updated>0 then 'heartbeat_recorded' else 'heartbeat_not_recorded' end,
    'stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id,
    'phase',coalesce(nullif(p_phase,''),'unknown'),
    'updated_rows',v_updated,
    'model_version','race_calculation_survival_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_v1(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_reveal_game_at timestamp without time zone;
begin
  select public.get_current_game_timestamp()::timestamp without time zone,
         public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone
    into v_current_game_at, v_stage_start_game_at;

  if v_stage_start_game_at is null then
    raise exception using
      errcode = 'P0001',
      message = 'race_stage_publication_blocked_missing_canonical_start';
  end if;

  v_reveal_game_at := v_stage_start_game_at + interval '30 minutes';

  if v_current_game_at < v_reveal_game_at then
    return jsonb_build_object(
      'status','deferred_not_before_reveal',
      'stage_id',p_stage_id,
      'current_game_at',v_current_game_at,
      'stage_start_game_at',v_stage_start_game_at,
      'official_results_reveal_game_at',v_reveal_game_at,
      'official_outputs_persisted',false,
      'guard_model','canonical_start_plus_30_hard_gate_v2'
    );
  end if;

  begin
    return public.universal_race_stage_finalize_core_survival_v1(p_stage_id);
  exception
    when query_canceled then
      raise exception using
        errcode = 'P0001',
        message = 'race_stage_publication_deferred_after_statement_timeout';
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_retry_due_publications_v1(p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_state record;
  v_result jsonb;
  v_checked integer := 0;
  v_published integer := 0;
  v_failed integer := 0;
  v_publications jsonb := '[]'::jsonb;
  v_failures jsonb := '[]'::jsonb;
  v_sqlstate text;
  v_error text;
  v_current_game_at timestamp without time zone;
begin
  select public.get_current_game_timestamp()::timestamp without time zone
  into v_current_game_at;
  for v_state in
    select state.stage_id, state.simulation_run_id
    from public.race_stage_automation_state state
    where state.last_status = 'replay_live'
      and nullif(state.details ->> 'replay_closes_at_real', '') is not null
      and (state.details ->> 'replay_closes_at_real')::timestamptz <= clock_timestamp()
      and public.race_stage_planned_start_game_at_v1(state.stage_id)::timestamp without time zone
            + interval '30 minutes' <= v_current_game_at
    order by (state.details ->> 'replay_closes_at_real')::timestamptz, state.stage_id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update skip locked
  loop
    v_checked := v_checked + 1;

    begin
      v_result := public.universal_race_stage_finalize_v1(v_state.stage_id);
      v_published := v_published + 1;
      v_publications := v_publications || jsonb_build_array(v_result);
    exception when others then
      get stacked diagnostics
        v_sqlstate = returned_sqlstate,
        v_error = message_text;

      update public.race_stage_automation_state
      set last_checked_at = clock_timestamp(),
          last_error = left(
            format('Publication retry failed [%s]: %s', v_sqlstate, v_error),
            2000
          ),
          details = coalesce(details, '{}'::jsonb) || jsonb_build_object(
            'publication_pending', true,
            'publication_retry_failed_at_real', clock_timestamp(),
            'publication_retry_sqlstate', v_sqlstate,
            'publication_retry_error', left(v_error, 1500)
          ),
          updated_at = clock_timestamp()
      where stage_id = v_state.stage_id;

      v_failed := v_failed + 1;
      v_failures := v_failures || jsonb_build_array(jsonb_build_object(
        'stage_id', v_state.stage_id,
        'simulation_run_id', v_state.simulation_run_id,
        'sqlstate', v_sqlstate,
        'error', left(v_error, 1500)
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status', 'completed',
    'checked', v_checked,
    'published', v_published,
    'failed', v_failed,
    'publications', v_publications,
    'failures', v_failures,
    'model_version', 'universal_race_publication_retry_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_team_car_recent_races_v1(p_team_car_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(race_id uuid, race_name text, category text, race_type text, country_code text, first_used_game_date date, last_used_game_date date, stages_used integer, distance_km numeric, condition_loss numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_uid uuid;
  v_club_id uuid;
  v_limit integer;
begin
  v_uid := coalesce(auth.uid(), nullif(current_setting('request.jwt.claim.sub', true), '')::uuid);
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  select ctc.club_id
  into v_club_id
  from public.club_team_cars ctc
  where ctc.id = p_team_car_id
    and ctc.status <> 'sold';

  if v_club_id is null then
    raise exception 'Team Car not found';
  end if;

  if not exists (
    select 1
    from public.clubs c
    left join public.club_memberships cm
      on cm.club_id = c.id
     and cm.user_id = v_uid
    where c.id = v_club_id
      and (c.owner_user_id = v_uid or cm.user_id is not null)
  ) then
    raise exception 'Not allowed to view Team Car race history';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 5), 10));

  return query
  select
    w.race_id,
    r.name::text,
    r.category::text,
    r.race_type::text,
    r.country_code::text,
    min(w.applied_game_date)::date,
    max(w.applied_game_date)::date,
    count(distinct w.stage_id)::integer,
    round(coalesce(sum(rs.distance_km), 0)::numeric, 1),
    round(coalesce(sum(w.condition_loss), 0)::numeric, 3)
  from public.race_engine_stage_wear_applications w
  join public.races r
    on r.id = w.race_id
  left join public.race_stages rs
    on rs.id = w.stage_id
  where w.club_id = v_club_id
    and w.target_table = 'club_team_cars'
    and w.target_id = p_team_car_id
  group by w.race_id, r.name, r.category, r.race_type, r.country_code
  order by max(w.applied_game_date) desc nulls last, r.name
  limit v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_race_team_jersey_shortage_penalty_notification_v1(p_user_id uuid, p_race_id uuid, p_stage_id uuid, p_team_id uuid, p_required integer, p_available integer)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_race text;
  v_team text;
  v_stage integer;
  v_missing integer;
  v_ratio numeric;
  v_prep numeric;
  v_energy numeric;
  v_fatigue numeric;
  v_id bigint;
begin
  if p_user_id is null then return null; end if;
  select name into v_race from public.races where id=p_race_id;
  select name into v_team from public.clubs where id=p_team_id;
  select stage_number into v_stage from public.race_stages where id=p_stage_id;

  v_missing := greatest(coalesce(p_required,0)-coalesce(p_available,0),0);
  v_ratio := case when coalesce(p_required,0)>0 then least(1::numeric,v_missing::numeric/p_required::numeric) else 0 end;
  v_prep := round(30*v_ratio,2);
  v_energy := round(8*v_ratio,2);
  v_fatigue := round(15*v_ratio,2);

  select public.ppm_create_user_notification_direct_v1(
    p_user_id,
    'RACE_JERSEYS_MANDATORY_WARNING',
    'Race Jersey shortage — performance penalty active',
    format('%s can still race in %s — Stage %s. %s of %s riders do not have an eligible Race Jersey Kit. The current shortage applies a -%s%% reduction to positive preparation bonuses, +%s%% in-stage energy cost and +%s%% post-stage fatigue. Add Race Jersey Kits to reduce or remove the penalty.',
      coalesce(v_team,'Your team'),coalesce(v_race,'the race'),coalesce(v_stage,0),v_missing,coalesce(p_required,0),v_prep,v_energy,v_fatigue),
    '/dashboard/equipment?tab=race-supplies',
    jsonb_build_object(
      'mandatory',false,
      'performance_penalty',true,
      'advisor_notification',false,
      'event_type','race_jersey_shortage_penalty',
      'reason_code','race_jersey_shortage_performance_penalty',
      'race_id',p_race_id,'race_name',v_race,
      'stage_id',p_stage_id,'stage_number',v_stage,
      'team_id',p_team_id,'team_name',v_team,
      'required_jersey_units',coalesce(p_required,0),
      'available_jersey_units',coalesce(p_available,0),
      'missing_jersey_units',v_missing,
      'shortage_ratio',round(v_ratio,6),
      'preparation_bonus_reduction_pct',v_prep,
      'energy_cost_penalty_pct',v_energy,
      'post_stage_fatigue_penalty_pct',v_fatigue,
      'team_remains_in_race',true,
      'race_supplies_path','/dashboard/equipment?tab=race-supplies',
      'race_path','/dashboard/races/'||p_race_id::text,
      'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/mandatory%20race%20jersey.png'
    ),
    'race_jersey_shortage_penalty:'||p_race_id::text||':'||p_stage_id::text||':'||p_team_id::text
  ) into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_reserve_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_audit jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage public.race_stages%rowtype;
  v_existing public.race_engine_scenario_runs%rowtype;
  v_run public.race_stage_simulation_runs%rowtype;
  v_existing_found boolean := false;
  v_template_id text := nullif(p_audit->>'templateId','');
  v_family text := nullif(p_audit->>'templateFamily','');
  v_similarity_group text := nullif(p_audit->>'similarityGroup','');
  v_catalog text := nullif(p_audit->>'catalogVersion','');
  v_seed text := nullif(p_audit->>'selectionSeed','');
  v_type text := nullif(p_audit->>'scenarioType','');
  v_version integer := greatest(1, coalesce((p_audit->>'templateVersion')::integer,1));
  v_score numeric := coalesce((p_audit->>'compatibilityScore')::numeric,0);
  v_allow_race_repeat boolean := coalesce((p_audit->>'repeatAllowedRace')::boolean,false);
  v_allow_day_repeat boolean := coalesce((p_audit->>'repeatAllowedDay')::boolean,false);
  v_compatible_count integer := 0;
  v_race_used_compatible integer := 0;
  v_day_used_compatible integer := 0;
  v_race_collision uuid;
  v_day_collision uuid;
begin
  if p_stage_id is null or p_simulation_run_id is null then
    raise exception using errcode='22023', message='stage_id and simulation_run_id are required';
  end if;
  if v_type not in ('flat','hilly','mountain','cobbled') then
    raise exception using errcode='22023', message='unsupported road scenario type';
  end if;
  if v_template_id is null or v_family is null or v_catalog is null or v_seed is null then
    raise exception using errcode='22023', message='road scenario audit is incomplete';
  end if;

  select * into v_stage from public.race_stages where id=p_stage_id;
  if not found then raise exception using errcode='P0002', message='stage not found'; end if;
  if lower(coalesce(v_stage.stage_format,'road_race')) <> 'road_race' then
    raise exception using errcode='22023', message='scenario reservation requires road_race stage format';
  end if;
  if lower(coalesce(v_stage.terrain_type,'')) <> v_type then
    raise exception using errcode='22023', message='scenario type does not match stage terrain type';
  end if;

  select * into v_run from public.race_stage_simulation_runs where id=p_simulation_run_id;
  if not found or v_run.stage_id<>p_stage_id or v_run.race_id<>v_stage.race_id then
    raise exception using errcode='22023', message='simulation run does not belong to stage';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('road_scenario:race:'||v_type||':'||v_stage.race_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('road_scenario:date:'||v_type||':'||v_stage.stage_date::text,0));

  select * into v_existing
  from public.race_engine_scenario_runs
  where stage_id=p_stage_id
  for update;
  v_existing_found := found;

  if v_existing_found and v_existing.selection_status='reserved' then
    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           updated_at=clock_timestamp()
     where id=v_existing.id;
    return jsonb_build_object(
      'status','existing','stage_id',p_stage_id,'scenario_type',v_existing.scenario_type,
      'template_id',v_existing.template_id,'template_family',v_existing.template_family,
      'catalog_version',v_existing.catalog_version
    );
  end if;

  -- A scenario can be finalized before the stage itself is successfully published.
  -- On a later calculation retry, a completed scenario without an authoritative
  -- stage result must be reactivated. Otherwise Pass 1 returns "existing" while
  -- Pass 2 only accepts "reserved", leaving the run orphaned forever.
  if v_existing_found and v_existing.selection_status='completed' then
    if exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id) then
      return jsonb_build_object(
        'status','existing','stage_id',p_stage_id,'scenario_type',v_existing.scenario_type,
        'template_id',v_existing.template_id,'template_family',v_existing.template_family,
        'catalog_version',v_existing.catalog_version,'authoritative_stage',true
      );
    end if;

    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           race_id=v_stage.race_id,
           game_date=v_stage.stage_date,
           scenario_type=v_type,
           template_id=v_template_id,
           template_version=v_version,
           template_family=v_family,
           similarity_group=coalesce(v_similarity_group,''),
           catalog_version=v_catalog,
           selection_seed=v_seed,
           compatibility_score=v_score,
           context_snapshot_json=coalesce(p_audit->'contextSnapshot','{}'::jsonb),
           candidate_scores_json=coalesce(p_audit->'candidateScores','[]'::jsonb),
           repetition_penalties_json=coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
           generated_parameters_json=coalesce(p_audit->'generatedParameters','{}'::jsonb),
           applied_directives_json=coalesce(p_audit->'appliedDirectives','{}'::jsonb),
           selection_status='reserved',
           actual_outcome_json=null,
           completed_at=null,
           selected_at=clock_timestamp(),
           scenario_deviations_json=coalesce(v_existing.scenario_deviations_json,'[]'::jsonb)
             || jsonb_build_array(jsonb_build_object(
                  'kind','scenario_retry_reactivated_from_unpublished_completed',
                  'at',clock_timestamp(),
                  'simulation_run_id',p_simulation_run_id
                )),
           updated_at=clock_timestamp()
     where id=v_existing.id;

    return jsonb_build_object(
      'status','reserved','reactivated',true,'reactivated_from','completed_unpublished',
      'stage_id',p_stage_id,'scenario_type',v_type,'template_id',v_template_id,
      'template_family',v_family,'catalog_version',v_catalog
    );
  end if;

  select count(*) into v_compatible_count
  from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
  where coalesce((candidate->>'rawScore')::numeric,-1) >= 42;

  if v_compatible_count > 0 then
    select count(distinct scenario.template_id) into v_race_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    select count(distinct scenario.template_id) into v_day_used_compatible
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.selection_status in ('reserved','completed')
      and scenario.template_id in (
        select candidate->>'templateId'
        from jsonb_array_elements(coalesce(p_audit->'candidateScores','[]'::jsonb)) candidate
        where coalesce((candidate->>'rawScore')::numeric,-1) >= 42
      );

    if v_race_used_compatible >= v_compatible_count then v_allow_race_repeat := true; end if;
    if v_day_used_compatible >= v_compatible_count then v_allow_day_repeat := true; end if;
  end if;

  if not v_allow_race_repeat then
    select scenario.stage_id into v_race_collision
    from public.race_engine_scenario_runs scenario
    where scenario.race_id=v_stage.race_id and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at limit 1;
    if v_race_collision is not null then
      return jsonb_build_object('status','collision','scope','race','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_race_collision);
    end if;
  end if;

  if not v_allow_day_repeat then
    select scenario.stage_id into v_day_collision
    from public.race_engine_scenario_runs scenario
    where scenario.game_date=v_stage.stage_date and scenario.stage_id<>p_stage_id and scenario.scenario_type=v_type
      and scenario.template_id=v_template_id and scenario.selection_status in ('reserved','completed')
    order by scenario.selected_at limit 1;
    if v_day_collision is not null then
      return jsonb_build_object('status','collision','scope','day','scenario_type',v_type,'template_id',v_template_id,'conflicting_stage_id',v_day_collision);
    end if;
  end if;

  if v_existing_found and v_existing.selection_status='failed' then
    update public.race_engine_scenario_runs
       set simulation_run_id=p_simulation_run_id,
           race_id=v_stage.race_id,
           game_date=v_stage.stage_date,
           scenario_type=v_type,
           template_id=v_template_id,
           template_version=v_version,
           template_family=v_family,
           similarity_group=coalesce(v_similarity_group,''),
           catalog_version=v_catalog,
           selection_seed=v_seed,
           compatibility_score=v_score,
           context_snapshot_json=coalesce(p_audit->'contextSnapshot','{}'::jsonb),
           candidate_scores_json=coalesce(p_audit->'candidateScores','[]'::jsonb),
           repetition_penalties_json=coalesce(p_audit->'repetitionPenalties','{}'::jsonb),
           generated_parameters_json=coalesce(p_audit->'generatedParameters','{}'::jsonb),
           applied_directives_json=coalesce(p_audit->'appliedDirectives','{}'::jsonb),
           selection_status='reserved',
           actual_outcome_json=null,
           completed_at=null,
           selected_at=clock_timestamp(),
           scenario_deviations_json=coalesce(v_existing.scenario_deviations_json,'[]'::jsonb)
             || jsonb_build_array(jsonb_build_object('kind','scenario_retry_reactivated','at',clock_timestamp())),
           updated_at=clock_timestamp()
     where id=v_existing.id;
    return jsonb_build_object(
      'status','reserved','reactivated',true,'stage_id',p_stage_id,'scenario_type',v_type,
      'template_id',v_template_id,'template_family',v_family,'catalog_version',v_catalog
    );
  end if;

  insert into public.race_engine_scenario_runs(
    simulation_run_id,race_id,stage_id,game_date,scenario_type,template_id,template_version,
    template_family,similarity_group,catalog_version,selection_seed,compatibility_score,
    context_snapshot_json,candidate_scores_json,repetition_penalties_json,
    generated_parameters_json,applied_directives_json,selection_status
  ) values (
    p_simulation_run_id,v_stage.race_id,p_stage_id,v_stage.stage_date,v_type,v_template_id,v_version,
    v_family,coalesce(v_similarity_group,''),v_catalog,v_seed,v_score,
    coalesce(p_audit->'contextSnapshot','{}'::jsonb),coalesce(p_audit->'candidateScores','[]'::jsonb),
    coalesce(p_audit->'repetitionPenalties','{}'::jsonb),coalesce(p_audit->'generatedParameters','{}'::jsonb),
    coalesce(p_audit->'appliedDirectives','{}'::jsonb),'reserved'
  );

  return jsonb_build_object(
    'status','reserved','reactivated',false,'stage_id',p_stage_id,'scenario_type',v_type,
    'template_id',v_template_id,'template_family',v_family,'catalog_version',v_catalog
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_finalize_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_actual_outcome jsonb DEFAULT '{}'::jsonb, p_deviations jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
  v_audit jsonb;
  v_computed_deviations jsonb := '[]'::jsonb;
  v_effective_deviations jsonb := '[]'::jsonb;
  v_effective_outcome jsonb := coalesce(p_actual_outcome, '{}'::jsonb);
begin
  v_audit := public.universal_race_stage_scenario_audit_v1(
    p_stage_id,
    p_simulation_run_id,
    coalesce(p_actual_outcome, '{}'::jsonb)
  );

  if jsonb_typeof(v_audit -> 'deviations') = 'array' then
    v_computed_deviations := v_audit -> 'deviations';
  end if;

  -- Preserve explicitly supplied deviations from a future runner version.
  -- Today the runner passes [], so the database-derived audit is used.
  if p_deviations is null or p_deviations = '[]'::jsonb then
    v_effective_deviations := v_computed_deviations;
  else
    v_effective_deviations := p_deviations;
  end if;

  v_effective_outcome := v_effective_outcome || jsonb_build_object(
    'scenario_audit_v1', coalesce(v_audit -> 'metrics', '{}'::jsonb)
  );

  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'completed',
      actual_outcome_json = v_effective_outcome,
      scenario_deviations_json = v_effective_deviations,
      completed_at = coalesce(completed_at, clock_timestamp()),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status', 'not_found', 'stage_id', p_stage_id);
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'stage_id', p_stage_id,
    'template_id', v_updated.template_id,
    'deviation_count', jsonb_array_length(v_effective_deviations),
    'audit_version', 'scenario_deviation_audit_v1'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_abandon_scenario_v1(p_stage_id uuid, p_simulation_run_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_updated public.race_engine_scenario_runs%rowtype;
begin
  update public.race_engine_scenario_runs
  set simulation_run_id = p_simulation_run_id,
      selection_status = 'failed',
      scenario_deviations_json = coalesce(scenario_deviations_json,'[]'::jsonb) ||
        jsonb_build_array(jsonb_build_object(
          'kind','scenario_abandoned',
          'reason',coalesce(nullif(p_reason,''),'primary_not_official'),
          'at',clock_timestamp()
        )),
      updated_at = clock_timestamp()
  where stage_id = p_stage_id
    and selection_status = 'reserved'
  returning * into v_updated;

  if not found then
    return jsonb_build_object('status','not_found_or_not_reserved','stage_id',p_stage_id);
  end if;

  return jsonb_build_object(
    'status','failed',
    'stage_id',p_stage_id,
    'scenario_type',v_updated.scenario_type,
    'template_id',v_updated.template_id,
    'reason',coalesce(nullif(p_reason,''),'primary_not_official')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_scenario_audit_v1(p_stage_id uuid, p_simulation_run_id uuid, p_actual_outcome jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scenario public.race_engine_scenario_runs%rowtype;
  v_result jsonb;
  v_rr jsonb;
  v_generated jsonb;
  v_break jsonb;
  v_distance_km numeric;
  v_planned_formation_pct numeric;
  v_planned_formation_km numeric;
  v_planned_size numeric;
  v_planned_peak_gap_sec numeric;
  v_planned_chase_start_pct numeric;
  v_planned_chase_start_km numeric;
  v_planned_catch_km_remaining numeric;
  v_planned_catch_km numeric;
  v_planned_survival_sec numeric;
  v_target_front_group numeric;
  v_fragmentation_pressure numeric;
  v_p1_break_size integer := 0;
  v_max_break_size integer := 0;
  v_peak_gap_sec numeric := 0;
  v_first_positive_gap_km numeric;
  v_catch_km numeric;
  v_breakaway_caught boolean := false;
  v_breakaway_survived boolean := false;
  v_same_time_count integer := 0;
  v_classification_count integer := 0;
  v_same_time_share numeric := 0;
  v_fragmented_share numeric := 0;
  v_deviations jsonb := '[]'::jsonb;
  v_metrics jsonb;
  v_tolerance_km numeric;
  v_break_low_threshold numeric;
  v_break_high_threshold numeric;
  v_front_low_threshold numeric;
  v_front_high_threshold numeric;
  v_expected_catch boolean := false;
begin
  select * into v_scenario from public.race_engine_scenario_runs where stage_id = p_stage_id;
  if not found then
    return jsonb_build_object('status','scenario_not_found','deviations','[]'::jsonb,'metrics',jsonb_build_object('audit_version','scenario_deviation_audit_v2'));
  end if;
  select sr.result_summary_json #> '{output_snapshot,universalResult}' into v_result
  from public.race_stage_simulation_runs sr
  where sr.id = p_simulation_run_id and sr.stage_id = p_stage_id limit 1;
  v_generated := coalesce(v_scenario.generated_parameters_json, '{}'::jsonb);
  v_break := coalesce(v_generated -> 'breakaways' -> 0, '{}'::jsonb);
  v_rr := coalesce(v_result -> 'roadRaceResolution', '{}'::jsonb);
  v_distance_km := nullif(v_scenario.context_snapshot_json #>> '{profile,distanceKm}', '')::numeric;
  v_planned_formation_pct := nullif(v_break ->> 'formationPct', '')::numeric;
  v_planned_size := nullif(v_break ->> 'preferredSize', '')::numeric;
  v_planned_peak_gap_sec := nullif(v_break ->> 'targetPeakGapSec', '')::numeric;
  v_planned_chase_start_pct := nullif(v_break ->> 'chaseStartPct', '')::numeric;
  v_planned_catch_km_remaining := nullif(v_break ->> 'catchKmRemaining', '')::numeric;
  v_planned_survival_sec := nullif(v_break ->> 'survivalTargetSec', '')::numeric;
  v_target_front_group := nullif(v_generated ->> 'targetFrontGroup', '')::numeric;
  v_fragmentation_pressure := nullif(v_generated ->> 'fragmentationPressure', '')::numeric;
  if v_distance_km is not null then
    if v_planned_formation_pct is not null then v_planned_formation_km := v_distance_km * v_planned_formation_pct; end if;
    if v_planned_chase_start_pct is not null then v_planned_chase_start_km := v_distance_km * v_planned_chase_start_pct; end if;
    if v_planned_catch_km_remaining is not null then v_planned_catch_km := greatest(0, v_distance_km - v_planned_catch_km_remaining); end if;
    v_tolerance_km := greatest(10, v_distance_km * 0.10);
  else
    v_tolerance_km := 12;
  end if;
  v_p1_break_size := case when jsonb_typeof(v_rr #> '{phase1Opening,breakawayRiderIds}')='array' then jsonb_array_length(v_rr #> '{phase1Opening,breakawayRiderIds}') else 0 end;
  v_max_break_size := greatest(
    v_p1_break_size,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}')='array' then jsonb_array_length(v_rr #> '{phase2Development,breakawayRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}')='array' then jsonb_array_length(v_rr #> '{phase3Decisive,physicalEscapeRiderIdsAtEnd}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}')='array' then jsonb_array_length(v_rr #> '{phase4Finish,escapeRiderIdsAtStart}') else 0 end,
    case when jsonb_typeof(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}')='array' then jsonb_array_length(v_rr #> '{phase4Finish,frontRiderIdsAfterBridges}') else 0 end
  );
  select coalesce(max(q.gap_seconds),0), min(q.km_from_start) filter (where q.gap_seconds>0)
  into v_peak_gap_sec, v_first_positive_gap_km
  from (
    select nullif(e->>'gapSeconds','')::numeric as gap_seconds, nullif(e->>'kmFromStart','')::numeric as km_from_start
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase1Opening,physicalGapTrajectory}')='array' then v_rr #> '{phase1Opening,physicalGapTrajectory}' else '[]'::jsonb end) e
    union all
    select nullif(e->>'gapSeconds','')::numeric, nullif(e->>'kmFromStart','')::numeric
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase2Development,physicalGapTrajectory}')='array' then v_rr #> '{phase2Development,physicalGapTrajectory}' else '[]'::jsonb end) e
    union all
    select nullif(e->>'gapSeconds','')::numeric, nullif(e->>'kmFromStart','')::numeric
    from jsonb_array_elements(case when jsonb_typeof(v_rr #> '{phase3Decisive,physicalGapTrajectory}')='array' then v_rr #> '{phase3Decisive,physicalGapTrajectory}' else '[]'::jsonb end) e
  ) q;
  v_peak_gap_sec := greatest(coalesce(v_peak_gap_sec,0),coalesce(nullif(v_rr #>> '{phase4Finish,startGapSeconds}','')::numeric,0),coalesce(nullif(v_rr #>> '{phase4Finish,endGapSeconds}','')::numeric,0));
  v_catch_km := coalesce(nullif(v_rr #>> '{phase2Development,breakawayCatchKm}','')::numeric,nullif(v_rr #>> '{phase3Decisive,physicalCatchKm}','')::numeric);
  v_breakaway_caught := coalesce(nullif(v_rr #>> '{phase4Finish,breakawayCaught}','')::boolean,false);
  v_breakaway_survived := coalesce(nullif(v_rr #>> '{phase4Finish,breakawaySurvived}','')::boolean,false);
  v_same_time_count := coalesce(nullif(p_actual_outcome->>'same_time_rider_count','')::integer,0);
  v_classification_count := coalesce(nullif(p_actual_outcome->>'classification_rider_count','')::integer,0);
  if v_classification_count>0 then
    v_same_time_share := least(1,greatest(0,v_same_time_count::numeric/v_classification_count::numeric));
    v_fragmented_share := 1-v_same_time_share;
  end if;
  if v_planned_size is not null then
    v_break_low_threshold := greatest(1,floor(v_planned_size*0.60));
    v_break_high_threshold := greatest(v_planned_size+2,ceil(v_planned_size*1.50));
  end if;
  if v_target_front_group is not null then
    v_front_low_threshold := greatest(1,floor(v_target_front_group*0.50));
    v_front_high_threshold := greatest(v_target_front_group+8,ceil(v_target_front_group*1.75));
  end if;
  v_expected_catch := v_planned_catch_km is not null or (v_planned_chase_start_km is not null and coalesce(v_planned_survival_sec,0)<=0);
  if v_planned_size is not null and v_planned_size>=2 and (v_first_positive_gap_km is null or (v_planned_formation_km is not null and v_first_positive_gap_km>v_planned_formation_km+v_tolerance_km)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','early_break_failed','severity','major','expected',jsonb_build_object('preferred_size',v_planned_size,'formation_km',case when v_planned_formation_km is null then null else round(v_planned_formation_km,1) end),'actual',jsonb_build_object('max_break_size',v_max_break_size,'first_positive_gap_km',case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km,1) end),'explanation',case when v_first_positive_gap_km is null then 'The scenario called for an early break, but no positive physical breakaway gap was established.' else 'A physical breakaway formed materially later than the scenario formation target.' end));
  end if;
  if v_planned_size is not null and v_planned_size>=2 and v_max_break_size<v_break_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_size_below_target','severity','major','expected',jsonb_build_object('preferred_size',v_planned_size,'material_floor',v_break_low_threshold),'actual',jsonb_build_object('max_break_size',v_max_break_size),'explanation','The largest observed breakaway was materially smaller than the generated scenario target.'));
  elsif v_planned_size is not null and v_planned_size>=2 and v_max_break_size>v_break_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_size_above_target','severity','moderate','expected',jsonb_build_object('preferred_size',v_planned_size,'material_ceiling',v_break_high_threshold),'actual',jsonb_build_object('max_break_size',v_max_break_size),'explanation','The largest observed breakaway was materially larger than the generated scenario target.'));
  end if;
  if v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec>0 and v_peak_gap_sec<v_planned_peak_gap_sec*0.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','peak_gap_undershot','severity','major','expected',jsonb_build_object('target_peak_gap_sec',round(v_planned_peak_gap_sec,1)),'actual',jsonb_build_object('peak_physical_gap_sec',round(v_peak_gap_sec,1)),'explanation','The breakaway never built the material advantage targeted by the scenario.'));
  elsif v_planned_peak_gap_sec is not null and v_planned_peak_gap_sec>0 and v_peak_gap_sec>v_planned_peak_gap_sec*1.60 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','peak_gap_overshot','severity','moderate','expected',jsonb_build_object('target_peak_gap_sec',round(v_planned_peak_gap_sec,1)),'actual',jsonb_build_object('peak_physical_gap_sec',round(v_peak_gap_sec,1)),'explanation','The breakaway gained a materially larger maximum advantage than the scenario target.'));
  end if;
  if v_catch_km is not null and ((v_planned_chase_start_km is not null and v_catch_km<v_planned_chase_start_km-greatest(5,v_tolerance_km*0.50)) or (v_planned_catch_km is not null and v_catch_km<v_planned_catch_km-v_tolerance_km)) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_caught_early','severity','major','expected',jsonb_build_object('planned_chase_start_km',case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km,1) end,'planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end),'actual',jsonb_build_object('physical_catch_km',round(v_catch_km,1)),'explanation','The breakaway was physically caught materially earlier than the planned chase/catch story.'));
  end if;
  if v_breakaway_survived and v_expected_catch then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','break_survived_unexpectedly','severity','major','expected',jsonb_build_object('planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end,'survival_target_sec',v_planned_survival_sec),'actual',jsonb_build_object('breakaway_survived',true,'breakaway_caught',v_breakaway_caught),'explanation','The scenario expected the break to be caught, but the physical breakaway survived the finish phase.'));
  end if;
  if v_target_front_group is not null and v_target_front_group>0 and v_same_time_count>v_front_high_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','front_group_larger_than_target','severity','major','expected',jsonb_build_object('target_front_group',v_target_front_group,'material_ceiling',v_front_high_threshold),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count),'explanation','The official front same-time group was materially larger than the scenario target.'));
  elsif v_target_front_group is not null and v_target_front_group>=6 and v_same_time_count<v_front_low_threshold then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','front_group_smaller_than_target','severity','moderate','expected',jsonb_build_object('target_front_group',v_target_front_group,'material_floor',v_front_low_threshold),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count),'explanation','The official front same-time group was materially smaller than the scenario target.'));
  end if;
  if v_fragmentation_pressure is not null and v_classification_count>0 and v_fragmentation_pressure>=0.50 and v_fragmented_share>0 and v_fragmented_share<greatest(0.08,v_fragmentation_pressure*0.30) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','fragmentation_below_target','severity','moderate','expected',jsonb_build_object('fragmentation_pressure',round(v_fragmentation_pressure,4)),'actual',jsonb_build_object('fragmented_share',round(v_fragmented_share,4),'same_time_share',round(v_same_time_share,4)),'explanation','The field remained materially more compact than the scenario fragmentation pressure called for.'));
  elsif v_fragmentation_pressure is not null and v_classification_count>0 and v_fragmentation_pressure<=0.50 and v_fragmented_share>least(0.80,v_fragmentation_pressure+0.35) then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','fragmentation_above_target','severity','moderate','expected',jsonb_build_object('fragmentation_pressure',round(v_fragmentation_pressure,4)),'actual',jsonb_build_object('fragmented_share',round(v_fragmented_share,4),'same_time_share',round(v_same_time_share,4)),'explanation','The field split materially more than the scenario fragmentation pressure called for.'));
  end if;
  if v_classification_count>0 and v_target_front_group is not null and v_target_front_group<=30 and v_same_time_count>=greatest(40,ceil(v_classification_count*0.60)) and not v_breakaway_survived then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','finale_converted_to_large_group_sprint','severity','major','expected',jsonb_build_object('target_front_group',v_target_front_group,'template_family',v_scenario.template_family),'actual',jsonb_build_object('same_time_rider_count',v_same_time_count,'same_time_share',round(v_same_time_share,4),'breakaway_survived',false),'explanation','A scenario targeting a selective finale resolved as a large same-time group finish.'));
  end if;
  if v_breakaway_survived and lower(coalesce(v_scenario.template_family,''))<>'breakaway' and coalesce(v_planned_survival_sec,0)<=0 then
    v_deviations := v_deviations || jsonb_build_array(jsonb_build_object('code','finale_converted_to_breakaway','severity','major','expected',jsonb_build_object('template_family',v_scenario.template_family,'survival_target_sec',v_planned_survival_sec),'actual',jsonb_build_object('breakaway_survived',true,'same_time_rider_count',v_same_time_count),'explanation','A scenario not targeting a surviving breakaway ended with the physical break still alive in the finish phase.'));
  end if;
  v_metrics := jsonb_build_object('audit_version','scenario_deviation_audit_v2','template_id',v_scenario.template_id,'scenario_type',v_scenario.scenario_type,'template_family',v_scenario.template_family,'planned',jsonb_build_object('formation_km',case when v_planned_formation_km is null then null else round(v_planned_formation_km,1) end,'preferred_break_size',v_planned_size,'target_peak_gap_sec',v_planned_peak_gap_sec,'planned_chase_start_km',case when v_planned_chase_start_km is null then null else round(v_planned_chase_start_km,1) end,'planned_catch_km',case when v_planned_catch_km is null then null else round(v_planned_catch_km,1) end,'survival_target_sec',v_planned_survival_sec,'target_front_group',v_target_front_group,'fragmentation_pressure',v_fragmentation_pressure),'actual',jsonb_build_object('phase1_break_size',v_p1_break_size,'max_break_size',v_max_break_size,'first_positive_gap_km',case when v_first_positive_gap_km is null then null else round(v_first_positive_gap_km,1) end,'peak_physical_gap_sec',round(v_peak_gap_sec,1),'physical_catch_km',case when v_catch_km is null then null else round(v_catch_km,1) end,'breakaway_caught',v_breakaway_caught,'breakaway_survived',v_breakaway_survived,'same_time_rider_count',v_same_time_count,'classification_rider_count',v_classification_count,'same_time_share',round(v_same_time_share,4),'fragmented_share',round(v_fragmented_share,4)),'deviation_count',jsonb_array_length(v_deviations));
  return jsonb_build_object('status','completed','deviations',v_deviations,'metrics',v_metrics);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2_impl(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stage record;
  v_previous_stage_id uuid;
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_existing_run public.race_stage_simulation_runs%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage_start_game_at timestamp without time zone;
  v_calculation_due_game_at timestamp without time zone;
  v_run_id uuid;
  v_startlist_readiness jsonb;
  v_startlist_reconciliation jsonb;
  v_sporting_readiness jsonb;
  v_sporting_reconciliation jsonb;
begin
  if p_stage_id is null then return jsonb_build_object('status','blocked','reason','stage_id_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||p_stage_id::text,0));

  select * into v_control from public.race_engine_runtime_control_v1 where singleton_id=true;
  if not found or v_control.active_engine<>'typescript_v1' or not v_control.typescript_execution_enabled or v_control.legacy_execution_enabled
     or not coalesce(v_control.typescript_lifecycle_enabled,false) then
    return jsonb_build_object('status','disabled','reason','phase11b_lifecycle_not_enabled');
  end if;
  if v_control.typescript_activation_game_at is null then return jsonb_build_object('status','disabled','reason','production_activation_game_boundary_missing'); end if;

  select stage.id,stage.race_id,stage.stage_number,stage.stage_date,stage.planned_start_hour_number,stage.planned_start_minute,
    lower(coalesce(stage.stage_format,'road_race')) as stage_format,coalesce(stage.weather_cancelled,false) as weather_cancelled
  into v_stage from public.race_stages stage where stage.id=p_stage_id;
  if not found then return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id); end if;
  if v_stage.weather_cancelled then return jsonb_build_object('status','skipped','reason','weather_cancelled','stage_id',p_stage_id); end if;

  v_stage_start_game_at := public.race_stage_planned_start_game_at_v1(p_stage_id)::timestamp without time zone;
  v_calculation_due_game_at := v_stage_start_game_at - make_interval(hours=>coalesce(v_control.typescript_calculation_lead_hours,3));
  select public.get_current_game_timestamp()::timestamp without time zone into v_current_game_at;
  if v_stage_start_game_at<v_control.typescript_activation_game_at then
    return jsonb_build_object('status','blocked','reason','before_phase11b_activation_boundary','stage_id',p_stage_id,'stage_start_game_at',v_stage_start_game_at,'activation_game_at',v_control.typescript_activation_game_at);
  end if;
  if v_current_game_at<v_calculation_due_game_at then
    return jsonb_build_object('status','not_due','stage_id',p_stage_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at);
  end if;

  v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
  if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
    v_sporting_reconciliation := public.reconcile_unprocessed_stage_sporting_points_v1(p_stage_id);
    v_sporting_readiness := public.race_stage_sporting_point_profile_readiness_v1(p_stage_id);
    if not coalesce((v_sporting_readiness->>'ready')::boolean,false) then
      return jsonb_build_object('status','blocked','reason','stage_sporting_points_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,
        'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation);
    end if;
  else
    v_sporting_reconciliation := jsonb_build_object('status','not_needed','stage_id',p_stage_id);
  end if;

  v_startlist_readiness := public.race_startlist_engine_readiness_v1(v_stage.race_id);
  if not coalesce((v_startlist_readiness->>'ready')::boolean,false) then
    return jsonb_build_object('status','blocked','reason','race_startlist_not_engine_ready','stage_id',p_stage_id,'race_id',v_stage.race_id,'startlist_readiness',v_startlist_readiness);
  end if;
  v_startlist_reconciliation := public.reconcile_race_startlist_engine_readiness_v1(v_stage.race_id);

  select previous.id into v_previous_stage_id from public.race_stages previous
  where previous.race_id=v_stage.race_id and previous.stage_number<v_stage.stage_number and not coalesce(previous.weather_cancelled,false)
  order by previous.stage_number desc limit 1;
  if v_previous_stage_id is not null and not exists(
    select 1 from public.race_stage_authoritative_runs authority
    join public.race_stage_simulation_runs previous_run on previous_run.id=authority.simulation_run_id
    where authority.stage_id=v_previous_stage_id and authority.engine_version='race_engine_ts_v1'
      and authority.simulation_mode='deterministic_road_race_v1' and previous_run.status='completed'
  ) then
    return jsonb_build_object('status','blocked','reason','previous_stage_not_published','stage_id',p_stage_id,'previous_stage_id',v_previous_stage_id);
  end if;

  select run.* into v_existing_run from public.race_stage_simulation_runs run
  where run.stage_id=p_stage_id and run.engine_version='race_engine_ts_v1' and run.simulation_mode='deterministic_road_race_v1'
    and run.status in ('running','completed') and coalesce(run.result_summary_json->>'calculation_contract','') in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
  order by run.updated_at desc,run.created_at desc,run.id desc limit 1;
  if found then
    return jsonb_build_object('status',case when coalesce(v_existing_run.result_summary_json->>'calculation_contract','')='universal_phase11b_calculated_hidden_v1' then 'already_calculated' else 'already_claimed' end,
      'stage_id',p_stage_id,'simulation_run_id',v_existing_run.id,'run_status',v_existing_run.status);
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);
  insert into public.race_stage_simulation_runs(race_id,stage_id,status,engine_version,simulation_mode,started_at,input_snapshot_json,result_summary_json)
  values(v_stage.race_id,p_stage_id,'running','race_engine_ts_v1','deterministic_road_race_v1',clock_timestamp(),'{}'::jsonb,
    jsonb_build_object('calculation_contract','phase11b_claim_pending_v1','calculation_status','claimed','claimed_at_real',clock_timestamp(),
      'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,'official_outputs_persisted',false,
      'phase11_persistence_applied',false,'results_published',false,'verification_only',false,'startlist_readiness',v_startlist_readiness,
      'startlist_reconciliation',v_startlist_reconciliation,'sporting_point_readiness',v_sporting_readiness,'sporting_point_reconciliation',v_sporting_reconciliation))
  returning id into v_run_id;

  insert into public.race_stage_automation_state(stage_id,race_id,scheduled_game_at,last_status,simulation_run_id,attempt_count,last_checked_at,last_started_at,last_error,details,updated_at)
  values(p_stage_id,v_stage.race_id,v_stage_start_game_at,'calculating',v_run_id,1,clock_timestamp(),clock_timestamp(),null,
    jsonb_build_object('contract','phase11b_universal_production_lifecycle_v2_split_payload','calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
      'replay_duration_real_seconds',coalesce(v_control.typescript_replay_duration_real_seconds,900),'worker_version','supabase_edge_phase11b_split_payload_v2','verification_only',false,
      'startlist_readiness_model','snapshot_invariants_v1','sporting_point_readiness_model','profile_catalogue_counts_v1'),clock_timestamp())
  on conflict(stage_id) do update set race_id=excluded.race_id,scheduled_game_at=excluded.scheduled_game_at,last_status=excluded.last_status,
    simulation_run_id=excluded.simulation_run_id,attempt_count=public.race_stage_automation_state.attempt_count+1,last_checked_at=excluded.last_checked_at,
    last_started_at=excluded.last_started_at,last_error=null,details=coalesce(public.race_stage_automation_state.details,'{}'::jsonb)||excluded.details,updated_at=excluded.updated_at;

  return jsonb_build_object('status','claimed','contract','universal_race_stage_calculation_claim_v3_split_payload','stage_id',p_stage_id,'race_id',v_stage.race_id,
    'simulation_run_id',v_run_id,'current_game_at',v_current_game_at,'calculation_due_game_at',v_calculation_due_game_at,'stage_start_game_at',v_stage_start_game_at,
    'stage_format',v_stage.stage_format,'startlist_readiness',v_startlist_readiness,'sporting_point_readiness',v_sporting_readiness,
    'sporting_point_reconciliation',v_sporting_reconciliation,'payload_deferred',true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v2_impl(p_worker_id text DEFAULT 'supabase_edge_phase11b_split_payload_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
declare
  v_control public.race_engine_runtime_control_v1%rowtype;
  v_current_game_at timestamp without time zone;
  v_stage record;
  v_claim jsonb;
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

  /*
   * FAST CLAIM PATH:
   * The due-stage watchdog already performs schedule calculation, readiness
   * checks and self-healing. Reuse that materialized queue instead of calling
   * race_stage_planned_start_game_at_v1 repeatedly across the full stage table.
   */
  for v_stage in
    select
      w.stage_id,
      w.race_id,
      r.name as race_name,
      s.stage_number,
      w.stage_start_game_at,
      w.calculation_due_game_at,
      w.readiness
    from public.race_engine_due_stage_watchdog_v1 w
    join public.race_stages s on s.id=w.stage_id
    join public.races r on r.id=w.race_id
    where w.ready=true
      and w.calculation_due_game_at <= v_current_game_at
      and w.last_checked_game_at >= v_current_game_at - interval '20 minutes'
      and not coalesce(s.weather_cancelled,false)
      and w.stage_start_game_at >= v_control.typescript_activation_game_at
      and not exists (
        select 1
        from public.race_stage_authoritative_runs authority
        where authority.stage_id=w.stage_id
      )
      and not exists (
        select 1
        from public.race_stage_simulation_runs run
        where run.stage_id=w.stage_id
          and run.engine_version='race_engine_ts_v1'
          and run.simulation_mode='deterministic_road_race_v1'
          and run.status in ('running','completed')
          and coalesce(run.result_summary_json->>'calculation_contract','')
              in ('phase11b_claim_pending_v1','universal_phase11b_calculated_hidden_v1')
      )
    order by
      w.calculation_due_game_at,
      w.stage_start_game_at,
      w.race_id,
      s.stage_number
    limit 25
  loop
    begin
      v_claim := public.universal_race_stage_claim_calculation_v2(v_stage.stage_id);
    exception when others then
      v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
        'stage_id',v_stage.stage_id,
        'race_id',v_stage.race_id,
        'race_name',v_stage.race_name,
        'stage_number',v_stage.stage_number,
        'reason','claim_exception',
        'sqlstate',sqlstate,
        'message',sqlerrm
      ));
      continue;
    end;

    if coalesce(v_claim->>'status','')='claimed' then
      return v_claim || jsonb_build_object(
        'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
        'scheduler_skipped_blocks',v_blocked,
        'scheduler_fast_path','due_stage_watchdog_queue_v2',
        'watchdog_readiness',v_stage.readiness,
        'survival_mode',public.universal_race_stage_survival_mode_v1(v_stage.stage_id)
      );
    end if;

    v_blocked := v_blocked || jsonb_build_array(jsonb_build_object(
      'stage_id',v_stage.stage_id,
      'race_id',v_stage.race_id,
      'race_name',v_stage.race_name,
      'stage_number',v_stage.stage_number,
      'reason',coalesce(v_claim->>'reason',v_claim->>'status','claim_not_granted'),
      'claim_result',v_claim
    ));
  end loop;

  return jsonb_build_object(
    'status','no_due_stage',
    'current_game_at',v_current_game_at,
    'scheduler_skipped_blocks',v_blocked,
    'scheduler_fast_path','due_stage_watchdog_queue_v2'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_next_due_v2(p_worker_id text DEFAULT 'supabase_edge_phase11b_split_payload_v2'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '25s'
AS $function$
declare
  v_survival jsonb;
  v_result jsonb;
  v_active record;
  v_recovery_pending record;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('universal_race_single_active_calculation_v2', 0)
  );

  -- Run survival recovery once here. The implementation no longer repeats it.
  v_survival := public.universal_race_stage_survival_recover_v1();

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(nullif(sr.result_summary_json->>'survival_phase',''),'claimed') as survival_phase,
         coalesce(
           (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
           sr.updated_at, sr.started_at, sr.created_at
         ) as heartbeat_at
    into v_active
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='running'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by coalesce(
    (sr.result_summary_json->>'survival_heartbeat_at_real')::timestamptz,
    sr.updated_at, sr.started_at, sr.created_at
  ) desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','single_active_calculation_guard',
      'active_stage_id',v_active.stage_id,
      'active_simulation_run_id',v_active.simulation_run_id,
      'active_phase',v_active.survival_phase,
      'active_heartbeat_at_real',v_active.heartbeat_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  select sr.stage_id,
         sr.id as simulation_run_id,
         coalesce(sr.result_summary_json->>'survival_phase','') as survival_phase,
         sr.failed_at
    into v_recovery_pending
  from public.race_stage_simulation_runs sr
  where sr.engine_version='race_engine_ts_v1'
    and sr.simulation_mode='deterministic_road_race_v1'
    and sr.status='failed'
    and sr.failed_at > clock_timestamp() - interval '2 hours'
    and coalesce(sr.result_summary_json->>'calculation_contract','')='phase11b_claim_pending_v1'
    and coalesce(sr.result_summary_json->>'survival_phase','')
        in ('pass1_resume_claimed','pass1_payload_loading','pass1_started')
    and sr.error_message='Race calculation survival watchdog recovered an expired calculation lease.'
    and not exists (
      select 1 from public.race_stage_authoritative_runs a where a.stage_id=sr.stage_id
    )
  order by sr.failed_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'status','worker_busy',
      'reason','pass1_emergency_fallback_pending',
      'active_stage_id',v_recovery_pending.stage_id,
      'active_simulation_run_id',v_recovery_pending.simulation_run_id,
      'active_phase',v_recovery_pending.survival_phase,
      'active_heartbeat_at_real',v_recovery_pending.failed_at,
      'worker_id',coalesce(nullif(p_worker_id,''),'supabase_edge_phase11b_split_payload_v2'),
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
  end if;

  v_result := public.universal_race_stage_claim_next_due_v2_impl(p_worker_id);

  return coalesce(v_result, '{}'::jsonb)
    || jsonb_build_object(
      'worker_model','single_active_calculation_v2',
      'global_worker_lock',true,
      'survival',v_survival
    );
end;
$function$
;

