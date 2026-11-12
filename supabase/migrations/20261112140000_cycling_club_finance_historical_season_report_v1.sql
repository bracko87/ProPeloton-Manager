-- Read-only season-specific finance report. Based on the existing live finance
-- calculation and the same owner authorization; retains all historical ledgers.
DO $install$
DECLARE
  v_body text;
  v_legacy_sig text := 'finance_get_club_season_overview_v1(p_club_id uuid)';
  v_history_sig text := 'finance_get_club_season_history_v1(p_club_id uuid, p_season_number integer)';
  v_old_clock text := 'select gs.season_number::integer as season_number,
         gs.month_number::integer as current_month
  from public.game_state gs
  where gs.id = true';
  v_new_clock text := 'select case when p_season_number between 1 and gs.season_number
            then p_season_number else null end::integer as season_number,
         case when p_season_number = gs.season_number
            then gs.month_number else 12 end::integer as current_month
  from public.game_state gs
  where gs.id = true';
BEGIN
  SELECT pg_get_functiondef('public.finance_get_club_season_overview_v1(uuid)'::regprocedure) INTO v_body;
  IF v_body IS NULL OR position(v_legacy_sig in v_body)=0 OR position(v_old_clock in v_body)=0 THEN
    RAISE EXCEPTION 'Current finance report changed; refusing historical clone';
  END IF;
  v_body:=replace(v_body,v_legacy_sig,v_history_sig);
  v_body:=replace(v_body,v_old_clock,v_new_clock);
  EXECUTE v_body;
  REVOKE ALL ON FUNCTION public.finance_get_club_season_history_v1(uuid,integer) FROM PUBLIC,anon;
  GRANT EXECUTE ON FUNCTION public.finance_get_club_season_history_v1(uuid,integer) TO authenticated;
END $install$;