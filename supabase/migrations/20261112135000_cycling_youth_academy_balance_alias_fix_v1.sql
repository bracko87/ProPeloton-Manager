DO $repair$
DECLARE
  original text;
  fixed text;
  wrong text := 'and v_balance>=v_activation_cost';
  correct text := 'and v_coin_balance>=v_activation_cost';
BEGIN
  SELECT pg_get_functiondef('public.get_my_youth_academy_base_v23()'::regprocedure) INTO original;
  IF original IS NULL THEN RAISE EXCEPTION 'Youth Academy function missing'; END IF;
  IF position(wrong in original)>0 THEN
    IF (length(original)-length(replace(original,wrong,'')))/length(wrong)<>1
      THEN RAISE EXCEPTION 'Unexpected occurrences; refusing edit'; END IF;
    fixed := replace(original,wrong,correct);
    EXECUTE fixed;
  ELSIF position(correct in original)=0 THEN
    RAISE EXCEPTION 'Function source unexpected; refusing edit';
  END IF;
END $repair$;