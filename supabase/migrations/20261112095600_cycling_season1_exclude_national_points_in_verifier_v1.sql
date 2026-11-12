-- Season transition verification: compare frozen club standings only with
-- canonical club-eligible points. National-team award points stay in their
-- original awards ledger and remain included in all-award audit totals.
-- Corrects exactly the seven national-team mismatches found at 2026-11-12
-- Season 1 boundary; does not change any actual awards or sporting results.
DO $patch$
DECLARE
  v_src text;
  v_old text := E'where extract(year from r.start_date)::integer=v_year and a.team_id is not null\n    group by a.team_id';
  v_new text := E'where extract(year from r.start_date)::integer=v_year and a.team_id is not null\n      and not public.is_nonclub_national_ranking_identity_v1(a.team_id)\n      and not exists (\n        select 1 from public.national_association_race_team_identities nation_id\n        where nation_id.technical_club_id=a.team_id\n          and nation_id.identity_source=''generated_hidden_national_team''\n      )\n    group by a.team_id';
BEGIN
  SELECT pg_get_functiondef('public.verify_season_transition_source_snapshot_v1(integer)'::regprocedure)
    INTO v_src;
  IF v_src IS NULL
     OR (length(v_src)-length(replace(v_src,v_old,'')))/length(v_old)<>1
  THEN
    RAISE EXCEPTION 'Verifier does not match expected audited source; refusing change';
  END IF;
  EXECUTE replace(v_src,v_old,v_new);
END
$patch$;