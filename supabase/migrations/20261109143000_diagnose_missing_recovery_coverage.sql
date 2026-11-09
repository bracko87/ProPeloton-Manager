-- Retain fail-closed rider recovery invariant and expose exact pending counts.
CREATE OR REPLACE FUNCTION private.assert_daily_fatigue_processed_v1(p_game_date date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
declare
  v_missing bigint;
  v_earliest date;
  v_latest date;
begin
  if p_game_date is null or public.get_current_game_date_date() is distinct from p_game_date then
    raise exception 'daily fatigue verification: processed game date mismatch (expected %, actual %)',
      p_game_date, public.get_current_game_date_date();
  end if;
  select count(*), min(r.fatigue_updated_on), max(r.fatigue_updated_on)
    into v_missing, v_earliest, v_latest
  from public.riders r
  where r.fatigue_updated_on is null
     or r.fatigue_updated_on < p_game_date - 1;
  if v_missing > 0 then
    raise exception 'daily fatigue verification failed for %: stale_riders=%, earliest=%, latest=%',
      p_game_date - 1, v_missing, v_earliest, v_latest;
  end if;
end;
$function$;
