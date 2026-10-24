-- REVIEW PROPOSAL ONLY. NOT APPLIED TO PRODUCTION.
-- Deploy to a dedicated staging Supabase database and run SQL integration
-- checks before enabling PPM_PERSISTENT_RACE_OUTPUT_V2 in the staging worker.
-- Retains output chunks across distinct leases for the same simulation.
CREATE TABLE private.race_stage_persistent_output_chunks_v2 (
  stage_id uuid NOT NULL,
  simulation_run_id uuid NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index BETWEEN 0 AND 200),
  chunk_text text NOT NULL,
  chunk_md5 text GENERATED ALWAYS AS (md5(chunk_text)) STORED,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(stage_id,simulation_run_id,chunk_index),
  CONSTRAINT output_chunk_size_limit CHECK (octet_length(chunk_text) BETWEEN 1 AND 4000000)
);
ALTER TABLE private.race_stage_persistent_output_chunks_v2 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.race_stage_persistent_output_chunks_v2 FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.universal_race_stage_write_persistent_output_chunk_v2(
  p_stage_id uuid, p_simulation_run_id uuid, p_lease_token uuid,
  p_chunk_index integer, p_chunk_text text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $func$
DECLARE v_existing text; v_found boolean;
BEGIN
 IF p_chunk_index NOT BETWEEN 0 AND 200
    OR p_chunk_text IS NULL OR octet_length(p_chunk_text) > 4000000
    OR octet_length(p_chunk_text) < 1 THEN
   RAISE EXCEPTION 'Invalid persistent output chunk';
 END IF;
 -- Only a current lease for step 10 can write/reuse persistent output.
 PERFORM 1 FROM public.race_stage_safe_calculation_v1
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id
   AND lease_token=p_lease_token AND status='running' AND step=10
   AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','stale_lease'); END IF;
 INSERT INTO private.race_stage_persistent_output_chunks_v2
  (stage_id,simulation_run_id,chunk_index,chunk_text)
 VALUES(p_stage_id,p_simulation_run_id,p_chunk_index,p_chunk_text)
 ON CONFLICT DO NOTHING;
 SELECT chunk_text INTO v_existing
 FROM private.race_stage_persistent_output_chunks_v2
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id
   AND chunk_index=p_chunk_index;
 IF v_existing IS DISTINCT FROM p_chunk_text THEN
   RAISE EXCEPTION 'Persistent chunk mismatch for simulation %, index %: refuse to mix distinct outputs',
     p_simulation_run_id,p_chunk_index;
 END IF;
 -- Extend a current lease, not a stale predecessor's lease.
 UPDATE public.race_stage_safe_calculation_v1
 SET lease_expires_at=clock_timestamp()+interval '90 seconds'
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id
   AND lease_token=p_lease_token AND status='running' AND step=10;
 RETURN jsonb_build_object('status','saved_chunk','chunk_index',p_chunk_index);
END $func$;
REVOKE ALL ON FUNCTION public.universal_race_stage_write_persistent_output_chunk_v2(uuid,uuid,uuid,integer,text)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.universal_race_stage_write_persistent_output_chunk_v2(uuid,uuid,uuid,integer,text)
TO service_role;

CREATE OR REPLACE FUNCTION public.universal_race_stage_submit_persistent_output_v2(
  p_stage_id uuid,p_simulation_run_id uuid,p_lease_token uuid,
  p_chunk_count integer,p_input_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
SET statement_timeout='120s'
AS $func$
DECLARE
 v_text text; v_count integer; v_min integer; v_max integer;
 v_result jsonb; v_authoritative_run uuid;
BEGIN
 IF p_chunk_count NOT BETWEEN 1 AND 201 THEN
   RAISE EXCEPTION 'Invalid output chunk count';
 END IF;
 -- Do not reuse a committed result from some other simulation.
 SELECT a.simulation_run_id INTO v_authoritative_run
 FROM public.race_stage_authoritative_runs a WHERE a.stage_id=p_stage_id;
 IF FOUND THEN
   IF v_authoritative_run<>p_simulation_run_id THEN
     RAISE EXCEPTION 'Stage is already authoritative under another simulation';
   END IF;
   RETURN jsonb_build_object('status','already_authoritative','simulation_run_id',p_simulation_run_id);
 END IF;
 PERFORM 1 FROM public.race_stage_safe_calculation_v1
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id
 AND lease_token=p_lease_token AND status='running' AND step=10
 AND lease_expires_at>clock_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','stale_lease'); END IF;
 SELECT string_agg(chunk_text,'' ORDER BY chunk_index),
        count(*)::integer,min(chunk_index),max(chunk_index)
 INTO v_text,v_count,v_min,v_max
 FROM private.race_stage_persistent_output_chunks_v2
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id;
 IF v_count<>p_chunk_count OR v_min<>0 OR v_max<>p_chunk_count-1 THEN
   RAISE EXCEPTION 'Incomplete or divergent persistent output (% of %)',
     v_count,p_chunk_count;
 END IF;
 -- The original authoritative submission and cleanup are in ONE transaction.
 -- Failed SQL calls roll back, keeping all staged output chunks for retry.
 v_result:=public.universal_race_stage_submit_calculation_v1(
   p_stage_id,p_simulation_run_id,p_input_snapshot,v_text::jsonb
 );
 DELETE FROM private.race_stage_persistent_output_chunks_v2
 WHERE stage_id=p_stage_id AND simulation_run_id=p_simulation_run_id;
 RETURN v_result;
END $func$;
REVOKE ALL ON FUNCTION public.universal_race_stage_submit_persistent_output_v2(uuid,uuid,uuid,integer,jsonb)
FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.universal_race_stage_submit_persistent_output_v2(uuid,uuid,uuid,integer,jsonb)
TO service_role;

-- Staging acceptance:
-- 1. Upload same chunks under lease A, expire A, replay under valid lease B:
--    matching bytes accepted, chunk count unchanged.
-- 2. Nonmatching bytes on the same index reject and leave prior data intact.
-- 3. Wrong run / stale lease rejects. Incomplete chunks never submit.
-- 4. Fail final SQL submission: transaction rolls back and chunks survive.
-- 5. Reattempt with valid lease; exactly one authoritative result and
--    original output hash. Repeated after commit returns already_authoritative.
-- 6. Exercise concurrent workers and timeouts on isolated test stages.
