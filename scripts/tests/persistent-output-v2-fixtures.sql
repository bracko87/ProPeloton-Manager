-- Disposable PostgreSQL test database only. NEVER run against the game database.
-- Minimal stand-ins for pre-existing game tables/functions used by the v2
-- output RPC proposal. This exercises the actual proposal SQL in PostgreSQL.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA private;

CREATE TABLE public.race_stage_safe_calculation_v1 (
  stage_id uuid PRIMARY KEY,
  simulation_run_id uuid NOT NULL,
  lease_token uuid,
  status text NOT NULL,
  step integer NOT NULL,
  lease_expires_at timestamptz
);
CREATE TABLE public.race_stage_authoritative_runs (
  stage_id uuid PRIMARY KEY,
  simulation_run_id uuid NOT NULL,
  output_md5 text NOT NULL
);

CREATE OR REPLACE FUNCTION public.universal_race_stage_submit_calculation_v1(
  p_stage_id uuid,p_simulation_run_id uuid,p_input_snapshot jsonb,p_output jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- Fault injection must roll back the entire v2 submit transaction, leaving
  -- all persistent chunks available to the next lease.
  IF p_input_snapshot->>'simulate_error'='true' THEN
    RAISE EXCEPTION 'Injected transient publication SQL failure';
  END IF;
  INSERT INTO public.race_stage_authoritative_runs(stage_id,simulation_run_id,output_md5)
  VALUES(p_stage_id,p_simulation_run_id,md5(p_output::text));
  RETURN jsonb_build_object('status','submitted','stage_id',p_stage_id,
    'simulation_run_id',p_simulation_run_id);
END $$;
