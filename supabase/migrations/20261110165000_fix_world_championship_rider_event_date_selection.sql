-- World Road Championship preparations must check fitness on the event date,
-- not today's temporary injury status. Ordinary races retain their strict guard.
CREATE OR REPLACE FUNCTION public.enforce_race_preparation_rider_health_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_club_id uuid;
  v_race_date date;
  v_is_individual_championship boolean := false;
BEGIN
  SELECT
    coalesce(rp.participating_club_id,rp.club_id),
    r.start_date,
    (
      coalesce((rp.metadata->>'national_championship')::boolean,false)
      OR coalesce((rp.metadata->>'world_road_championship')::boolean,false)
    )
  INTO v_club_id,v_race_date,v_is_individual_championship
  FROM public.race_preparations rp
  JOIN public.races r ON r.id=rp.race_id
  WHERE rp.id=new.race_preparation_id;

  IF v_is_individual_championship THEN
    IF NOT public.national_championship_rider_available_for_event_v1(
      new.rider_id,
      v_race_date
    ) THEN
      RAISE EXCEPTION
        'Rider % cannot be selected for championship on % because the rider is unavailable on the event date',
        new.rider_id,
        v_race_date
        USING errcode='P0001';
    END IF;
  ELSE
    PERFORM public.assert_rider_race_selectable_v1(new.rider_id);
  END IF;

  IF v_club_id IS NOT NULL THEN
    PERFORM public.assert_developing_rider_race_eligibility_v1(
      new.rider_id,
      v_club_id,
      v_race_date
    );
  END IF;

  RETURN new;
END;
$function$;

-- Keep the World Championship's existing selection logic, but require
-- availability on its race date at all seven participant-selection sites.
DO $migration$
DECLARE
  v_definition text;
  v_predicate constant text := 'and en.participation_decision in (''approved'',''auto_approved'')';
  v_matches integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname='world_road_championship_sync_participants_v1';

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'World Road Championship participant synchronizer is missing';
  END IF;

  v_matches := (length(v_definition)-length(replace(v_definition,v_predicate,'')))/length(v_predicate);
  IF v_matches <> 7 THEN
    RAISE EXCEPTION 'Expected 7 World Road Championship selection predicates, found %',v_matches;
  END IF;

  v_definition := replace(
    v_definition,
    v_predicate,
    v_predicate || E'\n      AND public.national_championship_rider_available_for_event_v1(en.rider_id,e.race_date)'
  );
  EXECUTE v_definition;
END;
$migration$;
