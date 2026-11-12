-- Record exception context in retryable core failure audit.
-- All core mutations still roll back on exception, unchanged.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.season_transition_engine_apply_core_v2(uuid)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'  v_error text;','')))/length('  v_error text;')<>1 THEN RAISE EXCEPTION 'Diagnostic baseline mismatch'; END IF;
IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'    v_error := sqlerrm;','')))/length('    v_error := sqlerrm;')<>1 THEN RAISE EXCEPTION 'Diagnostic baseline mismatch'; END IF;
IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'''core_retryable'',true','')))/length('''core_retryable'',true')<>1 THEN RAISE EXCEPTION 'Diagnostic baseline mismatch'; END IF;
 v_src:=replace(v_src,'  v_error text;','  v_error text;
  v_error_context text;');
v_src:=replace(v_src,'    v_error := sqlerrm;','    v_error := sqlerrm;
    GET STACKED DIAGNOSTICS v_error_context = PG_EXCEPTION_CONTEXT;');
v_src:=replace(v_src,'''core_retryable'',true','''core_retryable'',true,
            ''last_core_failure_context'',left(v_error_context,8000)');
 EXECUTE v_src;
END $guard$;