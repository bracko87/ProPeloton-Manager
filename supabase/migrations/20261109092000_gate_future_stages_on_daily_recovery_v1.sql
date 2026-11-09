-- Prospective-only stage safety: no future universal race calculation may
-- start before the in-game day's verified recovery has been completed.
-- Activated from the NEXT game day at migration install; this deliberately
-- excludes already calculated/running/historical stages.
create table if not exists private.race_stage_fatigue_guard_config_v1 (
  singleton_id boolean primary key default true check (singleton_id = true),
  activation_game_date date not null,
  installed_at timestamptz not null default clock_timestamp()
);
revoke all on private.race_stage_fatigue_guard_config_v1 from public, anon, authenticated;
insert into private.race_stage_fatigue_guard_config_v1(singleton_id,activation_game_date)
values (true, public.get_current_game_date_date() + 1)
on conflict(singleton_id) do nothing;

create or replace function private.race_stage_fatigue_gate_v1(p_stage_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = 'pg_catalog', 'public', 'private', 'pg_temp'
as $gate$
declare
  v_stage_date date;
  v_activation date;
begin
  select stage_date into v_stage_date
  from public.race_stages where id = p_stage_id;
  if not found or v_stage_date is null then
    return jsonb_build_object('status','blocked','reason','stage_not_found','stage_id',p_stage_id);
  end if;

  select activation_game_date into v_activation
  from private.race_stage_fatigue_guard_config_v1 where singleton_id = true;
  if v_activation is null then
    return jsonb_build_object('status','blocked','reason','daily_recovery_gate_config_missing','stage_id',p_stage_id);
  end if;

  if v_stage_date < v_activation then
    return jsonb_build_object('status','ready','reason','pre_activation_stage','stage_id',p_stage_id);
  end if;

  if not exists (
    select 1 from public.game_daily_tick_log t
    where t.season_number = public.season_from_game_date(v_stage_date)
      and t.month_number = extract(month from v_stage_date)::smallint
      and t.day_number = extract(day from v_stage_date)::smallint
  ) then
    return jsonb_build_object('status','blocked','reason','daily_recovery_receipt_missing',
      'stage_id',p_stage_id,'stage_date',v_stage_date,'will_retry',true);
  end if;

  if exists (
    select 1 from public.riders r
    where r.fatigue_updated_on is null
       or r.fatigue_updated_on < v_stage_date - 1
  ) then
    return jsonb_build_object('status','blocked','reason','daily_rider_fatigue_stale',
      'stage_id',p_stage_id,'stage_date',v_stage_date,'will_retry',true);
  end if;

  return jsonb_build_object('status','ready','reason','daily_recovery_verified',
    'stage_id',p_stage_id,'stage_date',v_stage_date);
end;
$gate$;
revoke all on function private.race_stage_fatigue_gate_v1(uuid) from public, anon, authenticated;

-- Preserve the production circuit breaker, attempts and recovery logic intact;
-- insert a read-only readiness guard immediately before the real claim call.
CREATE OR REPLACE FUNCTION public.universal_race_stage_claim_calculation_v2(p_stage_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempts integer := 0;
  v_has_authority boolean := false;
  v_retry_baseline timestamptz;
  v_fatigue_gate jsonb;
begin
  if p_stage_id is null then
    return jsonb_build_object('status','blocked','reason','stage_id_required');
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase11b_circuit_breaker:'||p_stage_id::text,0));

  if exists (
    select 1 from public.race_stage_calculation_quarantine_v1 q where q.stage_id=p_stage_id
  ) then
    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  select b.reopened_at into v_retry_baseline
  from public.race_stage_engine_upgrade_retry_budget_v1 b
  where b.stage_id=p_stage_id;

  select count(*)::integer into v_attempts
  from public.race_stage_simulation_runs s
  where s.stage_id=p_stage_id
    and s.engine_version='race_engine_ts_v1'
    and s.simulation_mode='deterministic_road_race_v1'
    and (v_retry_baseline is null or s.created_at >= v_retry_baseline);

  select exists(
    select 1 from public.race_stage_authoritative_runs a where a.stage_id=p_stage_id
  ) into v_has_authority;

  if not v_has_authority and v_attempts >= 12 then
    insert into public.race_stage_calculation_quarantine_v1(stage_id,reason,attempt_count,details)
    values(
      p_stage_id,
      'automatic_attempt_limit_exceeded',
      v_attempts,
      jsonb_build_object(
        'threshold',12,
        'model','per_stage_circuit_breaker_v1',
        'quarantined_at_real',clock_timestamp(),
        'retry_budget_source_commit',(
          select source_commit from public.race_stage_engine_upgrade_retry_budget_v1 where stage_id=p_stage_id
        )
      )
    )
    on conflict(stage_id) do update
      set reason=excluded.reason,
          attempt_count=excluded.attempt_count,
          quarantined_at=clock_timestamp(),
          details=excluded.details;

    update public.race_stage_simulation_runs s
       set status='failed',
           failed_at=coalesce(s.failed_at,clock_timestamp()),
           error_message='Automatic calculation quarantined after excessive attempts; unrelated stages remain eligible.',
           result_summary_json=coalesce(s.result_summary_json,'{}'::jsonb)
             || jsonb_build_object(
                  'survival_phase','auto_quarantined_excessive_attempts',
                  'calculation_status','quarantined',
                  'auto_quarantine_model','per_stage_circuit_breaker_v1',
                  'auto_quarantine_attempt_count',v_attempts,
                  'auto_quarantined_at_real',clock_timestamp()
                ),
           updated_at=clock_timestamp()
     where s.stage_id=p_stage_id
       and s.engine_version='race_engine_ts_v1'
       and s.simulation_mode='deterministic_road_race_v1'
       and s.status in ('running','failed')
       and (v_retry_baseline is null or s.created_at >= v_retry_baseline)
       and not exists (
         select 1 from public.race_stage_authoritative_runs a where a.stage_id=s.stage_id
       );

    return jsonb_build_object(
      'status','blocked','reason','stage_auto_quarantined','stage_id',p_stage_id,
      'attempt_count',v_attempts,'attempt_limit',12,
      'worker_model','per_stage_circuit_breaker_v1'
    );
  end if;

  -- A missing daily recovery is a sporting-integrity blocker. No claim is
  -- created, so the existing scheduler safely retries after the daily tick.
  v_fatigue_gate := private.race_stage_fatigue_gate_v1(p_stage_id);
  if coalesce(v_fatigue_gate->>'status','blocked') <> 'ready' then
    return v_fatigue_gate;
  end if;

  return public.universal_race_stage_claim_calculation_v2_impl(p_stage_id);
end;
$function$;

