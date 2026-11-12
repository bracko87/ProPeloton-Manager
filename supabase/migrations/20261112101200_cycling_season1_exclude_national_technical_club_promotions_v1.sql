-- Keep national-team technical identity records in their existing division.
-- National associations are not normal clubs and are not eligible for club
-- promotion; all regular club sporting rules and standings remain unchanged.
-- Fixes Bhutan (BT) National Team being promoted from the special
-- INTERNATIONAL amateur division into a NULL Continental division.
DO $guard$
DECLARE v_src text;
BEGIN
  SELECT pg_get_functiondef('public.preview_competition_transition_v1(integer,boolean)'::regprocedure) INTO v_src;
  IF v_src IS NULL THEN RAISE EXCEPTION 'Sporting preview function missing'; END IF;
  IF (length(v_src)-length(replace(v_src,'when bl.club_id is not null then ''promotion_blocked_by_developing_cap''','')))/length('when bl.club_id is not null then ''promotion_blocked_by_developing_cap''')<>1 THEN RAISE EXCEPTION 'Expected sporting-preview clause not found exactly once'; END IF;
IF (length(v_src)-length(replace(v_src,'when bl.club_id is not null then b.source_tier','')))/length('when bl.club_id is not null then b.source_tier')<>1 THEN RAISE EXCEPTION 'Expected sporting-preview clause not found exactly once'; END IF;
IF (length(v_src)-length(replace(v_src,'when bl.club_id is not null then b.source_division','')))/length('when bl.club_id is not null then b.source_division')<>1 THEN RAISE EXCEPTION 'Expected sporting-preview clause not found exactly once'; END IF;
IF (length(v_src)-length(replace(v_src,'when bl.club_id is not null then ''Developing Team promotion blocked by Continental maximum tier''','')))/length('when bl.club_id is not null then ''Developing Team promotion blocked by Continental maximum tier''')<>1 THEN RAISE EXCEPTION 'Expected sporting-preview clause not found exactly once'; END IF;
  v_src:=replace(v_src,'when bl.club_id is not null then ''promotion_blocked_by_developing_cap''','when public.is_nonclub_national_ranking_identity_v1(b.club_id) then ''stay''
    when bl.club_id is not null then ''promotion_blocked_by_developing_cap''');
v_src:=replace(v_src,'when bl.club_id is not null then b.source_tier','when public.is_nonclub_national_ranking_identity_v1(b.club_id) then b.source_tier
    when bl.club_id is not null then b.source_tier');
v_src:=replace(v_src,'when bl.club_id is not null then b.source_division','when public.is_nonclub_national_ranking_identity_v1(b.club_id) then b.source_division
    when bl.club_id is not null then b.source_division');
v_src:=replace(v_src,'when bl.club_id is not null then ''Developing Team promotion blocked by Continental maximum tier''','when public.is_nonclub_national_ranking_identity_v1(b.club_id) then ''National-team technical identity not eligible for club promotion''
    when bl.club_id is not null then ''Developing Team promotion blocked by Continental maximum tier''');
  EXECUTE v_src;
END
$guard$;