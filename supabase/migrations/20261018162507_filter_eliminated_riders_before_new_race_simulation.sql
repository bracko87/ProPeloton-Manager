-- Fix the root cause for NEW races only, beginning Season 1 Aug 03.
-- The official-result reconciliation installed earlier is a second-line safety net.
-- Do not touch prior race records or already-calculated stage outputs.
CREATE OR REPLACE FUNCTION private.filter_future_eliminated_stage_payload_v1(
  p_stage_id uuid, p_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path='pg_catalog','private','public'
AS $f$
DECLARE
  v_race_id uuid;
  v_stage_number integer;
  v_start_date date;
  v_is_stage_race boolean;
  v_eliminated jsonb;
  v_output jsonb:=p_payload;
  v_source jsonb;
  v_key text;
  v_phase9 jsonb;
BEGIN
  SELECT s.race_id,s.stage_number,r.start_date,r.is_stage_race
    INTO v_race_id,v_stage_number,v_start_date,v_is_stage_race
  FROM public.race_stages s JOIN public.races r ON r.id=s.race_id
  WHERE s.id=p_stage_id;

  IF v_race_id IS NULL OR coalesce(v_stage_number,1)=1
     OR NOT coalesce(v_is_stage_race,false)
     OR v_start_date<date '2000-08-03' THEN
    RETURN p_payload;
  END IF;

  SELECT coalesce(jsonb_agg(DISTINCT prev.rider_id::text),'[]'::jsonb)
    INTO v_eliminated
  FROM public.race_stage_results prev
  JOIN public.race_stages prior ON prior.id=prev.stage_id
  WHERE prev.race_id=v_race_id
    AND prior.stage_number<v_stage_number
    AND prev.status IN ('dnf','dns','dsq','otl');

  IF jsonb_array_length(v_eliminated)=0 THEN
    RETURN p_payload;
  END IF;

  FOREACH v_key IN ARRAY ARRAY[
    'participant_riders','rider_inputs','phase_commands','stage_plan_riders'
  ]
  LOOP
    v_source:=v_output->v_key;
    IF jsonb_typeof(v_source)='array' THEN
      v_output:=jsonb_set(v_output,ARRAY[v_key],
        coalesce((
          SELECT jsonb_agg(x.value ORDER BY x.ordinality)
          FROM jsonb_array_elements(v_source) WITH ORDINALITY x(value,ordinality)
          WHERE NOT (v_eliminated ? coalesce(
            nullif(x.value->>'rider_id',''),nullif(x.value->>'riderId',''),''))
        ),'[]'::jsonb),true);
    END IF;
  END LOOP;

  v_phase9:=v_output->'phase9_inputs';
  IF jsonb_typeof(v_phase9)='object' THEN
    FOREACH v_key IN ARRAY ARRAY['riderModifiers','rider_modifiers']
    LOOP
      v_source:=v_phase9->v_key;
      IF jsonb_typeof(v_source)='array' THEN
        v_phase9:=jsonb_set(v_phase9,ARRAY[v_key],
          coalesce((
            SELECT jsonb_agg(x.value ORDER BY x.ordinality)
            FROM jsonb_array_elements(v_source) WITH ORDINALITY x(value,ordinality)
            WHERE NOT (v_eliminated ? coalesce(
              nullif(x.value->>'rider_id',''),nullif(x.value->>'riderId',''),''))
          ),'[]'::jsonb),true);
      END IF;
    END LOOP;
    v_output:=jsonb_set(v_output,'{phase9_inputs}',v_phase9,true);
  END IF;
  RETURN v_output;
END
$f$;
REVOKE ALL ON FUNCTION private.filter_future_eliminated_stage_payload_v1(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;

-- Preserve the optimized preexisting RPC and its payload/heartbeat semantics.
-- Patch only the single line following its complete payload assembly.
DO $patch$
DECLARE
  v_existing text;
  v_before text:='v_payload := public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id);';
  v_after text:='v_payload := public.universal_race_stage_get_calculation_payload_full_v1(p_stage_id);'
    ||chr(10)||'  v_payload := private.filter_future_eliminated_stage_payload_v1(p_stage_id,v_payload);';
BEGIN
  SELECT pg_get_functiondef(
    'public.universal_race_stage_get_calculation_payload_v1(uuid)'::regprocedure)
    INTO v_existing;
  IF v_existing IS NULL OR position(v_before IN v_existing)=0 THEN
    RAISE EXCEPTION 'Race calculation payload contract changed; abort filter installation';
  END IF;
  IF position('private.filter_future_eliminated_stage_payload_v1' IN v_existing)>0 THEN
    RAISE EXCEPTION 'Eliminated-rider input filter already installed';
  END IF;
  EXECUTE replace(v_existing,v_before,v_after);
END
$patch$;
