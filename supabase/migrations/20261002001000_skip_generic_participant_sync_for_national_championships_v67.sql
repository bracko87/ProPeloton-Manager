-- National Championships rebuild canonical race participants with
-- national_championship_sync_race_participants_v1 after their organizer-managed
-- preparation shells and rider plans are materialized. The generic submitted
-- race-preparation synchronizer is both redundant and very expensive for the
-- hundreds of independent Championship riders.
--
-- World Nations already bypasses the same generic synchronizer.

CREATE OR REPLACE FUNCTION public.trigger_sync_submitted_race_preparation_participants_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_is_submitted boolean;
  v_relevant_change boolean;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if lower(coalesce(new.metadata->>'nations_competition','false')) in ('true','1','yes')
     or lower(coalesce(new.metadata->>'national_championship','false')) in ('true','1','yes')
  then
    return new;
  end if;

  v_is_submitted :=
    coalesce(new.status, '') in ('submitted','locked','sent_to_engine')
    or coalesce(new.startlist_status, '') in ('submitted','locked','sent_to_engine');

  if not v_is_submitted then
    return new;
  end if;

  v_relevant_change :=
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.startlist_status is distinct from new.startlist_status
    or old.participating_club_id is distinct from new.participating_club_id;

  if not v_relevant_change then
    return new;
  end if;

  perform public.sync_submitted_race_preparation_to_participants_v1(new.id);
  return new;
end;
$function$;


CREATE OR REPLACE FUNCTION public.trg_sync_submitted_race_preparation_to_participants_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if lower(coalesce(new.metadata->>'nations_competition','false')) in ('true','1','yes')
     or lower(coalesce(new.metadata->>'national_championship','false')) in ('true','1','yes')
  then
    return new;
  end if;

  if (
    coalesce(new.status, '') in ('submitted','locked','sent_to_engine')
    or coalesce(new.startlist_status, '') in ('submitted','locked','sent_to_engine')
  )
  and (
    coalesce(old.status, '') is distinct from coalesce(new.status, '')
    or coalesce(old.startlist_status, '') is distinct from coalesce(new.startlist_status, '')
  ) then
    perform public.sync_submitted_race_preparation_to_participants_v1(new.id);
  end if;

  return new;
end;
$function$;
