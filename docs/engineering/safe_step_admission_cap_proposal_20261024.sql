-- Race safe-worker admission cap — proposed for staging DB validation first.
-- Does not alter race physics, replay outputs, completed stage data, or clock speed.
-- Existing active leases are allowed to finish. Expired leases do not occupy slots.
-- A transaction-scoped advisory lock serializes concurrent claims to prevent
-- two simultaneous workers from both observing the last available slot.
-- Note: this limits safe-mode claims, not the independent baseline runner.
DO $migration$
DECLARE
  v_def text;
  v_declare text := '  v_token uuid := gen_random_uuid();';
  v_query text := E'  select *\n    into v_row\n  from public.race_stage_safe_calculation_v1 s';
  v_control text := $cap$
  -- Admission is applied before choosing the oldest pending checkpoint.
  -- No claimed record is changed when capacity is exhausted.
  PERFORM pg_advisory_xact_lock(hashtextextended('ppm_safe_mode_global_admission_v1',0));
  SELECT count(*)::integer INTO v_active_safe_steps
  FROM public.race_stage_safe_calculation_v1
  WHERE status='running' AND lease_expires_at > clock_timestamp();
  IF v_active_safe_steps >= v_max_active_safe_steps THEN
    RETURN jsonb_build_object(
      'status','capacity_deferred',
      'reason','safe_step_worker_capacity',
      'active_leases',v_active_safe_steps,
      'maximum_active_leases',v_max_active_safe_steps,
      'retry_after_seconds',15
    );
  END IF;

$cap$;
BEGIN
  SELECT pg_get_functiondef('public.universal_race_stage_claim_safe_step_v2(text)'::regprocedure)
  INTO v_def;
  IF v_def IS NULL
     OR (length(v_def)-length(replace(v_def,v_declare,'')))<>length(v_declare)
     OR (length(v_def)-length(replace(v_def,v_query,'')))<>length(v_query)
     OR position('safe_step_worker_capacity' IN v_def)>0
  THEN RAISE EXCEPTION 'Safe-step claimant source changed or was previously patched; abort'; END IF;
  v_def := replace(v_def,v_declare,
    v_declare||E'\n  v_active_safe_steps integer := 0;\n  v_max_active_safe_steps integer := 3;');
  v_def := replace(v_def,v_query,v_control||v_query);
  EXECUTE v_def;
END $migration$;

-- Rollback requires restoring the exact preceding function definition from
-- migration history. Do not change live DB merely to test this proposal.
