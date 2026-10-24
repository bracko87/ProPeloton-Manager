-- Run AFTER disposable fixture and v2 SQL proposal, with psql
-- -v ON_ERROR_STOP=1. This script is intentionally destructive to its OWN
-- throwaway PostgreSQL database and must never run in production.
DO $test$
DECLARE
 s uuid := '11111111-1111-4111-8111-111111111111';
 r uuid := '22222222-2222-4222-8222-222222222222';
 a uuid := '33333333-3333-4333-8333-333333333333';
 b uuid := '44444444-4444-4444-8444-444444444444';
 wrong_run uuid := '55555555-5555-4555-8555-555555555555';
 outcome jsonb;
 n integer;
 original_hash text;
 BEGIN
   INSERT INTO public.race_stage_safe_calculation_v1(
     stage_id,simulation_run_id,lease_token,status,step,lease_expires_at)
   VALUES(s,r,a,'running',10,clock_timestamp()+interval '5 minutes');

   -- Lease A writes a segment. Repeating same payload does not duplicate it.
   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,r,a,0,'{"results":');
   IF outcome->>'status'<>'saved_chunk' THEN RAISE EXCEPTION 'First write failed: %',outcome; END IF;
   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,r,a,0,'{"results":');
   IF outcome->>'status'<>'saved_chunk' THEN RAISE EXCEPTION 'Same-lease replay failed'; END IF;
   SELECT count(*) INTO n FROM private.race_stage_persistent_output_chunks_v2
   WHERE stage_id=s AND simulation_run_id=r;
   IF n<>1 THEN RAISE EXCEPTION 'Retry produced % rows instead of one',n; END IF;

   -- Expire A, then verify it cannot write under its old token.
   UPDATE public.race_stage_safe_calculation_v1
     SET lease_expires_at=clock_timestamp()-interval '5 seconds' WHERE stage_id=s;
   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,r,a,1,'[{"rider":1}]}');
   IF outcome->>'status'<>'stale_lease' THEN RAISE EXCEPTION 'Expired lease still has write access'; END IF;

   -- New lease B must reuse same simulation's matching durable bytes.
   UPDATE public.race_stage_safe_calculation_v1
     SET lease_token=b,lease_expires_at=clock_timestamp()+interval '5 minutes'
     WHERE stage_id=s;
   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,r,b,0,'{"results":');
   IF outcome->>'status'<>'saved_chunk' THEN RAISE EXCEPTION 'Cross-lease idempotent replay failed'; END IF;

   -- A different payload for the same simulation/index must be rejected;
   -- the previously persisted bytes must remain intact.
   BEGIN
     PERFORM public.universal_race_stage_write_persistent_output_chunk_v2(
       s,r,b,0,'{"results":"wrong"');
     RAISE EXCEPTION 'INVARIANT: payload mismatch was accepted';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM NOT LIKE '%Persistent chunk mismatch%' THEN RAISE; END IF;
   END;
   SELECT count(*) INTO n FROM private.race_stage_persistent_output_chunks_v2
   WHERE stage_id=s AND simulation_run_id=r AND chunk_index=0
     AND chunk_text='{"results":';
   IF n<>1 THEN RAISE EXCEPTION 'Mismatch overwrote the preserved chunk'; END IF;

   -- A lease for another simulation must not access the current upload.
   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,wrong_run,b,1,'[{"rider":1}]}');
   IF outcome->>'status'<>'stale_lease' THEN RAISE EXCEPTION 'Wrong run could write'; END IF;

   outcome:=public.universal_race_stage_write_persistent_output_chunk_v2(
     s,r,b,1,'[{"rider":1}]}');
   IF outcome->>'status'<>'saved_chunk' THEN RAISE EXCEPTION 'Second chunk write failed'; END IF;

   -- A missing third chunk blocks final publication and leaves the two
   -- persisted chunks intact for the next retry.
   BEGIN
     PERFORM public.universal_race_stage_submit_persistent_output_v2(
       s,r,b,3,'{}'::jsonb);
     RAISE EXCEPTION 'INVARIANT: accepted incomplete output';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM NOT LIKE '%Incomplete or divergent persistent output%' THEN RAISE; END IF;
   END;
   IF EXISTS(SELECT 1 FROM public.race_stage_authoritative_runs WHERE stage_id=s)
   THEN RAISE EXCEPTION 'Incomplete output created an authoritative run'; END IF;

   -- Inject a failure in the underlying game's original submit function.
   -- Because final publication is transactional, chunks must survive it.
   BEGIN
     PERFORM public.universal_race_stage_submit_persistent_output_v2(
       s,r,b,2,'{"simulate_error":true}'::jsonb);
     RAISE EXCEPTION 'INVARIANT: accepted SQL failure';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM NOT LIKE '%Injected transient publication SQL failure%' THEN RAISE; END IF;
   END;
   SELECT count(*) INTO n FROM private.race_stage_persistent_output_chunks_v2
   WHERE stage_id=s AND simulation_run_id=r;
   IF n<>2 THEN RAISE EXCEPTION 'SQL failure lost the staged chunks'; END IF;

   -- With a valid lease, publish the same two chunks once and only once.
   outcome:=public.universal_race_stage_submit_persistent_output_v2(
     s,r,b,2,'{}'::jsonb);
   IF outcome->>'status'<>'submitted' THEN RAISE EXCEPTION 'Recovery submit failed: %',outcome; END IF;
   SELECT count(*),max(output_md5) INTO n,original_hash
     FROM public.race_stage_authoritative_runs WHERE stage_id=s AND simulation_run_id=r;
   IF n<>1 OR original_hash IS DISTINCT FROM
      md5(('{"results":[{"rider":1}]}'::jsonb)::text)
   THEN RAISE EXCEPTION 'Exactly-once publication or output hash verification failed'; END IF;
   SELECT count(*) INTO n FROM private.race_stage_persistent_output_chunks_v2
   WHERE stage_id=s AND simulation_run_id=r;
   IF n<>0 THEN RAISE EXCEPTION 'Successful submission left orphan output chunks'; END IF;

   -- Even a lost success response cannot produce a duplicate official run.
   outcome:=public.universal_race_stage_submit_persistent_output_v2(
     s,r,b,2,'{}'::jsonb);
   IF outcome->>'status'<>'already_authoritative'
   THEN RAISE EXCEPTION 'Idempotent publication replay failed: %',outcome; END IF;
   BEGIN
     PERFORM public.universal_race_stage_submit_persistent_output_v2(
       s,wrong_run,b,2,'{}'::jsonb);
     RAISE EXCEPTION 'INVARIANT: different simulation adopted official result';
   EXCEPTION WHEN OTHERS THEN
     IF SQLERRM NOT LIKE '%already authoritative under another simulation%'
     THEN RAISE; END IF;
   END;

   IF has_function_privilege('anon',
      'public.universal_race_stage_submit_persistent_output_v2(uuid,uuid,uuid,integer,jsonb)',
      'EXECUTE')
   OR has_function_privilege('authenticated',
      'public.universal_race_stage_write_persistent_output_chunk_v2(uuid,uuid,uuid,integer,text)',
      'EXECUTE')
   THEN RAISE EXCEPTION 'Public roles were granted privileged publication RPCs'; END IF;
   IF NOT (SELECT relrowsecurity FROM pg_class
           WHERE oid='private.race_stage_persistent_output_chunks_v2'::regclass)
   THEN RAISE EXCEPTION 'Persistent output chunks missing RLS'; END IF;
   RAISE NOTICE 'PASS: cross-lease retry, conflict rejection, stale lease, wrong run, incomplete upload, rollback, exactly-once, security';
 END
$test$;
