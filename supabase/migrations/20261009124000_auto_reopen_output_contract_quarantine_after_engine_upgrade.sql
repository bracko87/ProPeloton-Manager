-- Allow a verified deterministic output-contract fix to reopen a per-stage
-- circuit breaker once per deployed source commit. Existing runs remain
-- immutable; a baseline records where the fresh bounded retry budget begins.

create table if not exists public.race_stage_engine_upgrade_retry_budget_v1 (
  stage_id uuid primary key references public.race_stages(id) on delete cascade,
  source_commit text not null,
  baseline_attempt_count integer not null check (baseline_attempt_count >= 0),
  reopened_at timestamptz not null default clock_timestamp(),
  reason text not null
);

alter table public.race_stage_engine_upgrade_retry_budget_v1 enable row level security;
revoke all on table public.race_stage_engine_upgrade_retry_budget_v1 from public, anon, authenticated;

create or replace function public.universal_race_stage_claim_calculation_v2(p_stage_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_attempts integer := 0;
  v_has_authority boolean := false;
  v_retry_baseline timestamptz;
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

  return public.universal_race_stage_claim_calculation_v2_impl(p_stage_id);
end;
$function$;

create or replace function public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(p_source_commit text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_commit text := nullif(btrim(coalesce(p_source_commit,'')), '');
  v_row record;
  v_reopened integer := 0;
  v_stage_ids uuid[] := array[]::uuid[];
  v_run_id uuid;
  v_previous_commit text;
  v_attempt_baseline integer;
begin
  if v_commit is null then
    return jsonb_build_object('status','blocked','reason','source_commit_required','reopened',0);
  end if;

  -- Preserve the existing replay-sync upgrade recovery.
  for v_row in
    select q.stage_id,q.details,q.quarantined_at
    from public.race_stage_calculation_quarantine_v1 q
    where q.reason='pass2_retry_exhausted_same_full_input'
      and coalesce(q.details->>'scenario_preserved','false')::boolean=true
      and coalesce(q.details->>'previous_error','') like 'Universal replay synchronization failed:%'
      and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=q.stage_id)
    order by q.quarantined_at
    limit 5
  loop
    perform pg_advisory_xact_lock(hashtextextended('universal_race_replay_quarantine_upgrade:'||v_row.stage_id::text,0));
    v_run_id:=nullif(v_row.details->>'simulation_run_id','')::uuid;
    if v_run_id is null then continue; end if;

    select coalesce(
      s.result_summary_json #>> '{survival_details,source_commit}',
      s.result_summary_json #>> '{error_details,source_commit}',
      ''
    ) into v_previous_commit
    from public.race_stage_simulation_runs s
    where s.id=v_run_id and s.stage_id=v_row.stage_id and s.status='failed';

    if not found or v_previous_commit=v_commit then continue; end if;
    if exists (
      select 1 from public.race_stage_simulation_runs s
      where s.id=v_run_id
        and coalesce(s.result_summary_json->>'last_auto_reopen_source_commit','')=v_commit
    ) then continue; end if;

    update public.race_stage_simulation_runs s
    set result_summary_json=(coalesce(s.result_summary_json,'{}'::jsonb)-'pass2_retry_exhausted_at_real')
          || jsonb_build_object(
            'pass2_attempt_count',0,
            'last_auto_reopen_source_commit',v_commit,
            'auto_reopen_previous_source_commit',nullif(v_previous_commit,''),
            'auto_reopened_at_real',clock_timestamp(),
            'recovery_policy','same_full_input_engine_upgrade_auto_reopen_v1'
          ),
        updated_at=clock_timestamp()
    where s.id=v_run_id and s.stage_id=v_row.stage_id;

    delete from public.race_stage_calculation_quarantine_v1
    where stage_id=v_row.stage_id and reason='pass2_retry_exhausted_same_full_input';

    v_reopened:=v_reopened+1;
    v_stage_ids:=array_append(v_stage_ids,v_row.stage_id);
  end loop;

  -- A point-output contract failure is likewise deterministic and repairable by
  -- code deployment. Give it one fresh 12-attempt budget per source commit.
  for v_row in
    select q.stage_id,q.quarantined_at
    from public.race_stage_calculation_quarantine_v1 q
    join public.race_stage_automation_state state on state.stage_id=q.stage_id
    where q.reason='automatic_attempt_limit_exceeded'
      and state.last_error like '%point_contract_invalid%'
      and not exists (select 1 from public.race_stage_authoritative_runs a where a.stage_id=q.stage_id)
      and not exists (
        select 1 from public.race_stage_engine_upgrade_retry_budget_v1 b
        where b.stage_id=q.stage_id and b.source_commit=v_commit
      )
    order by q.quarantined_at
    limit 5
  loop
    perform pg_advisory_xact_lock(hashtextextended('universal_race_output_contract_upgrade:'||v_row.stage_id::text,0));

    select count(*)::integer into v_attempt_baseline
    from public.race_stage_simulation_runs s
    where s.stage_id=v_row.stage_id
      and s.engine_version='race_engine_ts_v1'
      and s.simulation_mode='deterministic_road_race_v1';

    insert into public.race_stage_engine_upgrade_retry_budget_v1(
      stage_id,source_commit,baseline_attempt_count,reopened_at,reason
    ) values (
      v_row.stage_id,v_commit,v_attempt_baseline,clock_timestamp(),'point_contract_invalid'
    )
    on conflict(stage_id) do update
    set source_commit=excluded.source_commit,
        baseline_attempt_count=excluded.baseline_attempt_count,
        reopened_at=excluded.reopened_at,
        reason=excluded.reason;

    delete from public.race_stage_calculation_quarantine_v1
    where stage_id=v_row.stage_id and reason='automatic_attempt_limit_exceeded';

    update public.race_stage_automation_state
    set attempt_count=0,
        details=coalesce(details,'{}'::jsonb)||jsonb_build_object(
          'engine_upgrade_retry_source_commit',v_commit,
          'engine_upgrade_retry_at_real',clock_timestamp(),
          'engine_upgrade_retry_reason','point_contract_invalid'
        ),
        updated_at=clock_timestamp()
    where stage_id=v_row.stage_id;

    v_reopened:=v_reopened+1;
    v_stage_ids:=array_append(v_stage_ids,v_row.stage_id);
  end loop;

  return jsonb_build_object(
    'status','completed','source_commit',v_commit,'reopened',v_reopened,
    'stage_ids',to_jsonb(v_stage_ids),
    'policy','bounded_engine_upgrade_auto_reopen_v2'
  );
end;
$function$;
