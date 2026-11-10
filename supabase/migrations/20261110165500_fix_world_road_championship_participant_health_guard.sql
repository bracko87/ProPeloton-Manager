-- Final rider-list enforcement must use the same event-date health rule
-- as preparation enforcement for the individual World Road Championship.
-- This allows a rider injured today but recovering before the event.
-- Ordinary races still require current fitness and developing rider checks.

CREATE OR REPLACE FUNCTION public.enforce_race_participant_rider_health_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_race_date date;
  v_category text;
  v_national boolean;
  v_individual boolean;
BEGIN
  SELECT r.start_date, r.category,
         coalesce((r.metadata->>'national_championship')::boolean,false),
         lower(coalesce(r.metadata->>'individual_only','false')) in ('true','1','yes')
    INTO v_race_date, v_category, v_national, v_individual
  FROM public.races r WHERE r.id=new.race_id;

  IF coalesce(v_national,false)
     OR (v_category='WRC' AND coalesce(v_individual,false)) THEN
    IF NOT public.national_championship_rider_available_for_event_v1(new.rider_id,v_race_date) THEN
      RAISE EXCEPTION
        'Rider % cannot be selected for championship on % because the rider is unavailable on the event date',
        new.rider_id,v_race_date
        USING errcode='P0001';
    END IF;
  ELSE
    PERFORM public.assert_rider_race_selectable_v1(new.rider_id);
    PERFORM public.assert_developing_rider_race_eligibility_v1(
      new.rider_id,new.team_id,v_race_date
    );
  END IF;
  RETURN new;
END;
$function$;
