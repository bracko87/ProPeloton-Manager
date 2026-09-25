create or replace function public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(
  p_source_commit text
)
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
begin
  if v_commit is null then
    return jsonb_build_object(
      'status','blocked',
      'reason','source_commit_required',
      'reopened',0
    );
  end if;

  /*
   * A deterministic replay-validation bug must not spin forever on the same
   * engine build. Quarantine remains fail-closed. The only automatic reopen is
   * after production is running a DIFFERENT engine commit, and only for a
   * replay-synchronization quarantine whose full sporting scenario was
   * preserved.
   *
   * One run is auto-reopened at most once per source commit. If the new build
   * still fails, normal retry/quarantine protection takes over again.
   */
  for v_row in
    select
      q.stage_id,
      q.details,
      q.quarantined_at
    from public.race_stage_calculation_quarantine_v1 q
    where q.reason = 'pass2_retry_exhausted_same_full_input'
      and coalesce(q.details->>'scenario_preserved','false')::boolean = true
      and coalesce(q.details->>'previous_error','')
            like 'Universal replay synchronization failed:%'
      and not exists (
        select 1
        from public.race_stage_authoritative_runs a
        where a.stage_id = q.stage_id
      )
    order by q.quarantined_at
    limit 5
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        'universal_race_replay_quarantine_upgrade:' || v_row.stage_id::text,
        0
      )
    );

    v_run_id := nullif(v_row.details->>'simulation_run_id','')::uuid;
    if v_run_id is null then
      continue;
    end if;

    select
      coalesce(
        s.result_summary_json #>> '{survival_details,source_commit}',
        s.result_summary_json #>> '{error_details,source_commit}',
        ''
      )
    into v_previous_commit
    from public.race_stage_simulation_runs s
    where s.id = v_run_id
      and s.stage_id = v_row.stage_id
      and s.status = 'failed';

    if not found then
      continue;
    end if;

    if v_previous_commit = v_commit then
      continue;
    end if;

    if exists (
      select 1
      from public.race_stage_simulation_runs s
      where s.id = v_run_id
        and coalesce(
          s.result_summary_json->>'last_auto_reopen_source_commit',
          ''
        ) = v_commit
    ) then
      continue;
    end if;

    update public.race_stage_simulation_runs s
       set status = 'failed',
           failed_at = clock_timestamp(),
           error_message = coalesce(
             nullif(v_row.details->>'previous_error',''),
             s.error_message
           ),
           result_summary_json =
             (
               coalesce(s.result_summary_json,'{}'::jsonb)
               - 'pass2_retry_exhausted_at_real'
             )
             || jsonb_build_object(
                  'survival_phase','pass2_resume_failed',
                  'pass2_attempt_count',0,
                  'calculation_status','failed',
                  'last_auto_reopen_source_commit',v_commit,
                  'auto_reopen_previous_source_commit',nullif(v_previous_commit,''),
                  'auto_reopen_reason','engine_build_changed_after_replay_sync_quarantine',
                  'auto_reopened_at_real',clock_timestamp(),
                  'recovery_policy','same_full_input_engine_upgrade_auto_reopen_v1'
                ),
           updated_at = clock_timestamp()
     where s.id = v_run_id
       and s.stage_id = v_row.stage_id;

    delete from public.race_stage_calculation_quarantine_v1 q
    where q.stage_id = v_row.stage_id
      and q.reason = 'pass2_retry_exhausted_same_full_input';

    insert into public.race_engine_calculation_survival_audit_v1(
      stage_id,
      race_id,
      simulation_run_id,
      action,
      reason,
      details
    )
    select
      s.stage_id,
      s.race_id,
      s.id,
      'auto_reopen_replay_quarantine',
      'engine_build_changed_after_replay_sync_quarantine',
      jsonb_build_object(
        'previous_source_commit',nullif(v_previous_commit,''),
        'new_source_commit',v_commit,
        'scenario_preserved',true,
        'retry_attempt_count_reset_to',0,
        'policy','same_full_input_engine_upgrade_auto_reopen_v1'
      )
    from public.race_stage_simulation_runs s
    where s.id = v_run_id;

    v_reopened := v_reopened + 1;
    v_stage_ids := array_append(v_stage_ids, v_row.stage_id);
  end loop;

  return jsonb_build_object(
    'status','completed',
    'source_commit',v_commit,
    'reopened',v_reopened,
    'stage_ids',to_jsonb(v_stage_ids),
    'policy','same_full_input_engine_upgrade_auto_reopen_v1'
  );
end;
$function$;

revoke all on function public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(text) from public;
grant execute on function public.universal_race_reopen_replay_quarantine_after_engine_upgrade_v1(text) to service_role;
