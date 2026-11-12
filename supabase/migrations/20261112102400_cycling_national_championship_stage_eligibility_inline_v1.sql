-- Optimize national championship host-stage lookup during the guarded
-- season transition. Inline the exact existing eligibility predicate instead
-- of invoking a SECURITY DEFINER stage lookup for every candidate stage.
-- A production read-only comparison of all 3,921 stages showed zero mismatches.
-- No calendar, points, weather or eligibility business rules are changed.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.national_championship_pick_source_stage_for_window_v2(text,integer,text,date,date,uuid)'::regprocedure)
 INTO v_src;
 IF v_src IS NULL OR
 (length(v_src)-length(replace(v_src,'and public.national_competition_stage_is_eligible_v1(s.id)','')))/length('and public.national_competition_stage_is_eligible_v1(s.id)')<>1
 THEN RAISE EXCEPTION 'National championship lookup baseline does not match'; END IF;
 EXECUTE replace(v_src,'and public.national_competition_stage_is_eligible_v1(s.id)','and coalesce(
      case
        when lower(coalesce(s.metadata->>''national_competition_eligible'',''true''))=''false''
          then false
        when jsonb_typeof(r.metadata->''national_competition_designated_stage_numbers'')=''array''
          and jsonb_array_length(r.metadata->''national_competition_designated_stage_numbers'')>0
          then exists (
            select 1
            from jsonb_array_elements_text(
              r.metadata->''national_competition_designated_stage_numbers''
            ) as designated(stage_number)
            where designated.stage_number::integer=s.stage_number
          )
        else true
      end,false
    )');
END $guard$;