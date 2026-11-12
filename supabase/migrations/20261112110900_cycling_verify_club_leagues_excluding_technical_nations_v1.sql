-- Season freshness validation must test the size of playable club
-- divisions, not technical national-team identities used for nations races.
-- Audit shows 29 technical identities across amateur groups; excluding them
-- leaves 20 playable groups with zero invalid sizes, preserving all original
-- limits and winner/points/finance checks.
DO $guard$
DECLARE v_src text;
BEGIN
 SELECT pg_get_functiondef('public.verify_new_season_fresh_state_v1(integer,integer)'::regprocedure) INTO v_src;
 IF v_src IS NULL OR (length(v_src)-length(replace(v_src,'    from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in(''worldteam'',''proteam'',''continental'',''amateur'')
    group by 1,2','')))/length('    from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in(''worldteam'',''proteam'',''continental'',''amateur'')
    group by 1,2')<>1 THEN
   RAISE EXCEPTION 'Freshness validator baseline mismatch';
 END IF;
 EXECUTE replace(v_src,'    from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in(''worldteam'',''proteam'',''continental'',''amateur'')
    group by 1,2','    from public.clubs c
    where c.deleted_at is null
      and c.club_tier::text in(''worldteam'',''proteam'',''continental'',''amateur'')
      and not public.is_nonclub_national_ranking_identity_v1(c.id)
    group by 1,2');
END $guard$;