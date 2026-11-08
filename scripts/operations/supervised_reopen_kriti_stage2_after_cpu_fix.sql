-- WARNING: Manual production operation. DO NOT RUN until Supabase Edge Function
-- universal-race-stage-safe-resume has been deployed with the verified lean
-- replay CPU optimization from merge commit 6f59a142ac3990cc7f93c0077865ed2e5b358098
-- (baseline module pinned to e532c5b8934746bd4efae9cf50090c0c654a26ac).
-- Verify the live deployed function version and source first. Never run this to
-- bypass sporting calculations or to allow Stage 3 to start early.
--
-- Round the Kriti S2 stage: 9e63bda7-9a00-44d7-b79a-796ea649830b
-- Frozen stage run:      f445cecb-8e59-4ea4-98fd-fbc9d373e844
-- This transaction preserves the exact checkpoint and original run identity.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select set_config('app.race_engine_writer_family', 'typescript', true);

do $operation$
declare
  v_stage constant uuid := '9e63bda7-9a00-44d7-b79a-796ea649830b';
  v_race constant uuid := 'c5828488-75e2-4bad-be59-b95be506eed2';
  v_run constant uuid := 'f445cecb-8e59-4ea4-98fd-fbc9d373e844';
  v_physics_source constant text := '92de26698126e646f6ecc4ae74455bfc831e66c2';
  v_safe public.race_stage_safe_calculation_v1%rowtype;
  v_hash text;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('phase11b_claim:'||v_stage::text,0));

  select * into strict v_safe from public.race_stage_safe_calculation_v1
   where stage_id=v_stage for update;
  if v_safe.race_id is distinct from v_race
     or v_safe.simulation_run_id is distinct from v_run
     or v_safe.status <> 'failed'
     or v_safe.step <> 7
     or v_safe.step_attempt_count <> 6
     or v_safe.lease_token is not null
     or v_safe.lease_expires_at is not null
     or octet_length(v_safe.checkpoint_text) < 1000000
     or v_safe.checkpoint_text::jsonb->>'selectedEngineSourceCommit' is distinct from v_physics_source
     or v_safe.checkpoint_text::jsonb->>'selectedEngineLaneV1' is distinct from 'baseline_universal'
  then raise exception 'Recovery refused: Stage 2 checkpoint, original engine, or lock does not match';
  end if;
  v_hash := md5(v_safe.checkpoint_text);

  perform 1 from public.race_stage_simulation_runs r
   where r.id=v_run and r.stage_id=v_stage and r.race_id=v_race
     and r.status='failed' and r.engine_version='race_engine_ts_v1'
     and r.simulation_mode='deterministic_road_race_v1'
   for update;
  if not found then raise exception 'Recovery refused: frozen simulation run is not the expected failed run'; end if;

  perform 1 from public.race_stage_automation_state a
   where a.stage_id=v_stage and a.race_id=v_race
     and a.simulation_run_id=v_run and a.last_status='recovering'
   for update;
  if not found then raise exception 'Recovery refused: automation ownership has changed'; end if;

  perform 1 from public.race_stage_calculation_quarantine_v1 q
   where q.stage_id=v_stage and q.reason='safe_step7_cpu_budget_exhausted'
     and q.details->>'simulation_run_id'=v_run::text
   for update;
  if not found then raise exception 'Recovery refused: expected CPU quarantine is missing'; end if;

  if exists(select 1 from public.race_stage_authoritative_runs a where a.stage_id=v_stage)
     or exists(select 1 from public.race_stage_results r where r.stage_id=v_stage)
  then raise exception 'Recovery refused: official output already exists'; end if;

  update public.race_stage_safe_calculation_v1
    set status='pending', step_attempt_count=0,
        lease_token=null, lease_expires_at=null,
        last_error=null, completed_at=null, updated_at=clock_timestamp()
    where stage_id=v_stage and simulation_run_id=v_run and status='failed' and step=7;
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'Recovery failed: checkpoint status was not updated once'; end if;

  update public.race_stage_simulation_runs
    set status='running', failed_at=null, error_message=null,
        result_summary_json=coalesce(result_summary_json,'{}'::jsonb)||
          jsonb_build_object(
            'survival_phase','safe_mode_reopened_after_verified_replay_cpu_fix',
            'calculation_status','running',
            'recovery_policy','supervised_preserved_step7_resume_v1',
            'supervised_reopened_at_real',clock_timestamp(),
            'supervised_checkpoint_hash_md5',v_hash
          ),
        updated_at=clock_timestamp()
   where id=v_run and stage_id=v_stage and status='failed';
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'Recovery failed: original simulation status not updated once'; end if;

  update public.race_stage_automation_state
    set last_status='recovering',last_error=null,
        details=coalesce(details,'{}'::jsonb)||
          jsonb_build_object('supervised_step7_reopened_at_real',clock_timestamp(),
            'supervised_replay_cpu_source_commit','e532c5b8934746bd4efae9cf50090c0c654a26ac',
            'checkpoint_preserved',true),
        updated_at=clock_timestamp()
   where stage_id=v_stage and simulation_run_id=v_run;
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'Recovery failed: automation row not updated once'; end if;

  delete from public.race_stage_calculation_quarantine_v1
    where stage_id=v_stage and reason='safe_step7_cpu_budget_exhausted';
  get diagnostics v_count = row_count;
  if v_count<>1 then raise exception 'Recovery failed: expected quarantine row not removed once'; end if;

  if (select md5(checkpoint_text) from public.race_stage_safe_calculation_v1 where stage_id=v_stage) is distinct from v_hash
  then raise exception 'Recovery refused: checkpoint content changed'; end if;

  insert into public.race_engine_calculation_survival_audit_v1
    (stage_id,race_id,simulation_run_id,action,reason,details)
  values (v_stage,v_race,v_run,'supervised_reopen_safe_step7',
    'verified_replay_only_cpu_optimization',
    jsonb_build_object('original_engine_source_commit',v_physics_source,
      'replay_optimization_source_commit','e532c5b8934746bd4efae9cf50090c0c654a26ac',
      'checkpoint_md5',v_hash,
      'checkpoint_bytes',octet_length(v_safe.checkpoint_text),
      'original_step_attempt_count',v_safe.step_attempt_count,
      'checkpoint_preserved',true));
end
$operation$;
commit;

-- To wake the existing safe worker after the transaction commits:
-- select public.universal_race_stage_kick_safe_worker_v1();
--
-- Verify success with status + official outputs; NEVER manually publish results:
-- select s.stage_number,a.last_status,x.status simulation_status,c.status safe_status,c.step,
--        q.reason quarantine_reason,ar.simulation_run_id authoritative_run_id
-- from public.race_stages s
-- left join public.race_stage_automation_state a on a.stage_id=s.id
-- left join public.race_stage_safe_calculation_v1 c on c.stage_id=s.id
-- left join public.race_stage_calculation_quarantine_v1 q on q.stage_id=s.id
-- left join public.race_stage_authoritative_runs ar on ar.stage_id=s.id
-- left join lateral (select status from public.race_stage_simulation_runs z
--   where z.stage_id=s.id order by created_at desc limit 1) x on true
-- where s.race_id='c5828488-75e2-4bad-be59-b95be506eed2'
-- order by s.stage_number;
