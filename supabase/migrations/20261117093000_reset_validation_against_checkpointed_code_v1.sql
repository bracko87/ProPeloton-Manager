-- The global Season 1 reset validator previously hard-coded obsolete hashes
-- for two functions updated after the old August reset. Compare against
-- the exact function hashes checkpointed with the prepared reset instead.
-- Verification on live ProPeloton Manager: mismatch count changed 2 -> 0,
-- with no gameplay/data reset and all four expected function hashes present.
DO $patch$
DECLARE
 v_source text;
 v_start integer;
 v_end integer;
 v_new text;
BEGIN
 SELECT pg_get_functiondef('public.game_world_reset_validate_core_v1()'::regprocedure)
 INTO v_source;
 IF position('reset checkpoint function hashes captured at prepare time' IN v_source)>0 THEN
   RETURN;
 END IF;
 v_start:=strpos(v_source,'  select count(*) into v_transition_hash_bad');
 v_end:=strpos(v_source,'  select count(*) into v_user_sponsor_bad');
 IF v_start<=0 OR v_end<=v_start THEN
   RAISE EXCEPTION 'Reset validator hash block changed; update refused';
 END IF;
 v_new:=E'
  -- Compare against reset checkpoint function hashes captured at prepare time,
  -- never an obsolete code version. A missing checkpoint blocks validation.
  with checkpoint AS (
    select cp.payload
    from public.game_world_reset_checkpoints cp
    join public.game_world_reset_runs run on run.id=cp.reset_run_id
    where cp.checkpoint_type=''transition_function_hashes''
      and run.status in (''preflight'',''source_frozen'',''teams_rebuilt'',''world_validated'',''completed'')
    order by run.created_at desc,cp.created_at desc
    limit 1
  ), expected AS (
    select entry->>''name'' as name,
      entry->>''identity_arguments'' as args,
      entry->>''definition_md5'' as checksum
    from checkpoint
    cross join lateral jsonb_array_elements(checkpoint.payload) entry
  ), checks AS (
    select e.name,e.args,e.checksum,
      md5(pg_get_functiondef(p.oid)) actual
    from expected e
    left join pg_proc p ON p.proname=e.name
      and pg_get_function_identity_arguments(p.oid)=e.args
    left join pg_namespace n ON n.oid=p.pronamespace
      and n.nspname=''public''
    where n.nspname=''public'' OR p.oid IS NULL
  )
  select CASE WHEN count(*)=4 AND
    count(*) FILTER (WHERE checksum IS DISTINCT FROM actual)=0
    THEN 0 ELSE 1 END
  into v_transition_hash_bad FROM checks;
';
 v_source:=substr(v_source,1,v_start-1)||v_new||substr(v_source,v_end);
 EXECUTE v_source;
END $patch$;
