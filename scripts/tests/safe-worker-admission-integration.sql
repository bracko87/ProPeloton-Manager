-- Execute ONLY after capacity fixture and admission SQL proposal.
DO $check$
DECLARE
  result jsonb;
  i integer;
  active integer;
  expired_stage uuid;
BEGIN
  INSERT INTO public.race_stage_safe_calculation_v1(stage_id,status)
  SELECT ('00000000-0000-4000-8000-'||lpad(g.idx::text,12,'0'))::uuid,'pending'
  FROM generate_series(1,5) AS g(idx);

  FOR i IN 1..3 LOOP
    result:=public.universal_race_stage_claim_safe_step_v2('integration');
    IF result->>'status'<>'claimed' THEN RAISE EXCEPTION 'Expected claim %, got %',i,result; END IF;
  END LOOP;
  SELECT count(*) INTO active FROM public.race_stage_safe_calculation_v1
  WHERE status='running' AND lease_expires_at>clock_timestamp();
  IF active<>3 THEN RAISE EXCEPTION 'Three-worker cap admitted %',active; END IF;
  result:=public.universal_race_stage_claim_safe_step_v2('integration');
  IF result->>'status'<>'capacity_deferred'
    OR (result->>'active_leases')::integer<>3
    OR (result->>'maximum_active_leases')::integer<>3
    OR (result->>'retry_after_seconds')::integer<>15
  THEN RAISE EXCEPTION 'Over-capacity claim unexpectedly accepted: %',result; END IF;
  IF (SELECT count(*) FROM public.race_stage_safe_calculation_v1 WHERE status='pending')<>2
  THEN RAISE EXCEPTION 'Deferred claim mutated pending queue'; END IF;

  -- One stale lease must NOT occupy a slot or be considered newly claimed.
  SELECT stage_id INTO expired_stage FROM public.race_stage_safe_calculation_v1
    WHERE status='running' ORDER BY stage_id LIMIT 1;
  UPDATE public.race_stage_safe_calculation_v1
     SET lease_expires_at=clock_timestamp()-interval '10 seconds'
   WHERE stage_id=expired_stage;
  result:=public.universal_race_stage_claim_safe_step_v2('integration');
  IF result->>'status'<>'claimed' OR (result->>'stage_id')::uuid=expired_stage
  THEN RAISE EXCEPTION 'Expired-lease recovery did not free a slot: %',result; END IF;
  SELECT count(*) INTO active FROM public.race_stage_safe_calculation_v1
  WHERE status='running' AND lease_expires_at>clock_timestamp();
  IF active<>3 THEN RAISE EXCEPTION 'Expiry re-admission got % active, not 3',active; END IF;

  result:=public.universal_race_stage_claim_safe_step_v2('integration');
  IF result->>'status'<>'capacity_deferred'
  THEN RAISE EXCEPTION 'Worker admission allowed fourth active lease: %',result; END IF;

  -- A normally completed worker releases capacity for the final pending job.
  UPDATE public.race_stage_safe_calculation_v1 SET status='completed',lease_expires_at=null
  WHERE stage_id=(SELECT stage_id FROM public.race_stage_safe_calculation_v1
                    WHERE status='running' AND lease_expires_at>clock_timestamp()
                    ORDER BY stage_id LIMIT 1);
  result:=public.universal_race_stage_claim_safe_step_v2('integration');
  IF result->>'status'<>'claimed' THEN
    RAISE EXCEPTION 'Completed lease did not free a worker slot: %',result;
  END IF;
  IF (SELECT count(*) FROM public.race_stage_safe_calculation_v1 WHERE status='pending')<>0
  THEN RAISE EXCEPTION 'Pending jobs were lost'; END IF;
  RAISE NOTICE 'PASS: 3-slot cap, deferrals, no queue mutation, expired lease capacity, completed lease re-admission';
END $check$;
