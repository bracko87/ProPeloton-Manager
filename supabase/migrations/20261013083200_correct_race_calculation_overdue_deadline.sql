-- The scheduler's "calculation_due_game_at" is an EARLIEST START time
-- (five game hours ahead of the stage), not a completion deadline.
-- Report a calculation as overdue only at the actual -15-game-minute
-- mandatory readiness deadline, including when the worker is still running.
-- Keep the existing 30-real-minute stalled-recovery escalation unchanged.
DO $patch$
DECLARE
  v_fn text;
  v_wait_old text;
  v_wait_new text;
  v_running_old text;
  v_running_new text;
BEGIN
  SELECT pg_get_functiondef('public.race_operations_refresh_base_v1()'::regprocedure)
    INTO v_fn;
  v_running_old := $needle$when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then 'running'$needle$;
  v_running_new := $replacement$when d.automation_status = 'calculating'
          or d.simulation_run_status = 'running' then
          case when v_game_now >= d.stage_start_game_at - interval '15 minutes'
               then 'overdue' else 'running' end$replacement$;
  v_wait_old := $needle$when v_game_now >= d.calculation_due_game_at
             + make_interval(mins => v_calc_grace) then 'overdue'$needle$;
  v_wait_new := $replacement$when v_game_now >= d.stage_start_game_at - interval '15 minutes'
             then 'overdue'$replacement$;
  IF position(v_running_old in v_fn)=0 OR position(v_wait_old in v_fn)=0 THEN
    RAISE EXCEPTION 'Unexpected monitoring contract; no patch applied';
  END IF;
  EXECUTE replace(replace(v_fn,v_running_old,v_running_new),v_wait_old,v_wait_new);
END
$patch$;
