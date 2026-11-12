-- Future-season hardening: keep world relegations in the correctly mapped
-- continent, then balance each continental league using its survivor slots.
-- Only replaces function source. Does NOT run any season transition,
-- recalculate Season 2 results, move existing clubs, or alter the game clock.
DO $fix_world_relegation$
DECLARE
  v_source text;
  v_begin int;
  v_end int;
  v_old_marker text:=$start$
  -- World relegations are distributed to the Continental divisions in the
$start$;
  v_end_marker text:=$finish$
  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    v_feed_count:=private.youth_regional_feed_count_v1(d);$finish$;
  v_replacement text:=$new$
  -- Every World Class relegation belongs to the continent matching the
  -- academy's country. The number of relegated clubs from East and West
  -- need not be equal to the promoted count from those regions.
  -- The existing v_keep_continental formula below preserves 20 per league
  -- by retaining more/fewer source Continental clubs in each region.
  insert into pg_temp.youth_world_down_assignment_v4(
    academy_id,target_division
  )
  select s.academy_id,
         private.youth_continental_division_for_country_v1(c.country_code)
  from pg_temp.youth_transition_standings_v4 s
  join public.youth_academies a on a.id=s.academy_id
  join public.clubs c on c.id=a.club_id
  where s.competition_class='world'
    and s.division_rank>s.total_teams-4
  order by s.division_rank,s.academy_id;

  if (
    select count(*) from pg_temp.youth_world_down_assignment_v4
  )<>4 or exists(
    select 1 from pg_temp.youth_world_down_assignment_v4
    where target_division not in ('CONTINENTAL_WEST','CONTINENTAL_EAST')
  ) then
    raise exception 'Expected exactly four geographically classified World relegations';
  end if;

$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_source
  FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid
  WHERE n.nspname='private'
    AND p.proname='assign_youth_target_memberships_v3'
    AND pg_get_function_identity_arguments(p.oid)='p_source_season integer, p_target_season integer';

  IF v_source IS NULL THEN
    RAISE EXCEPTION 'Expected youth hierarchy function is missing';
  END IF;
  IF strpos(v_source,'Every World Class relegation belongs to the continent')>0 THEN
    RETURN;
  END IF;
  v_begin:=strpos(v_source,v_old_marker);
  v_end:=strpos(v_source,v_end_marker);
  IF v_begin<=0 OR v_end<=v_begin THEN
    RAISE EXCEPTION 'Unexpected hierarchy source, refusing to alter season transition logic';
  END IF;
  EXECUTE substr(v_source,1,v_begin-1) || v_replacement || substr(v_source,v_end);
END $fix_world_relegation$;
