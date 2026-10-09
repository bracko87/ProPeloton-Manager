-- Race Calendar reads the internal reserve-pool exclusion list. Keep it private.
-- Only authenticated players may invoke this zero-argument public-facing projection.
-- Never grant direct SELECT on race_reserve_pool to players.
ALTER FUNCTION public.get_race_calendar_entries_v1()
  SECURITY DEFINER;
ALTER FUNCTION public.get_race_calendar_entries_v1()
  SET search_path = pg_catalog, public;
REVOKE ALL ON FUNCTION public.get_race_calendar_entries_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_race_calendar_entries_v1() TO authenticated, service_role;
