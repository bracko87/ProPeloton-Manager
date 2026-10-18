-- Additive repair for World Class Youth Academy roster.
-- Does not delete any team, any academy, or any existing membership.
-- Future season checks heal empty slots only with eligible unassigned AI clubs.
CREATE OR REPLACE FUNCTION private.autoheal_youth_world_membership_v1()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'private'
AS $body$
DECLARE
  v_season integer := public.get_current_season_number();
  v_before integer;
  v_after integer;
  v_candidate record;
  v_missing_rank integer;
  v_inserted integer := 0;
  v_added_names jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('ppm.youth.world.membership.autoheal.v1')::bigint
  );

  SELECT count(*)::integer INTO v_before
  FROM public.youth_academy_competition_memberships
  WHERE season_number=v_season AND competition_class='world';
  IF v_before>=16 THEN
    RETURN jsonb_build_object('status','no_change','season',v_season,
      'before',v_before,'after',v_before,'added',0);
  END IF;

  WHILE v_before+v_inserted<16 LOOP
    -- Preserve original World Class seeds where possible, filling vacant ranks.
    SELECT missing_seed INTO v_missing_rank
    FROM generate_series(1,16) AS missing_seed
    WHERE NOT EXISTS(
      SELECT 1 FROM public.youth_academy_competition_memberships m
      WHERE m.season_number=v_season
        AND m.competition_class='world'
        AND m.seed_rank=missing_seed
    )
    ORDER BY missing_seed LIMIT 1;

    SELECT a.id AS academy_id,c.name AS club_name
    INTO v_candidate
    FROM public.youth_academies a
    JOIN public.clubs c ON c.id=a.club_id
    WHERE a.is_ai=true AND a.is_active=true
      AND c.is_ai=true AND c.is_active=true
      AND c.club_type='main' AND c.deleted_at IS NULL
      -- National association teams cannot play in U16 competition.
      AND c.name NOT ILIKE '%national%team%'
      AND c.name NOT ILIKE '%national cycling%'
      AND NOT EXISTS(
        SELECT 1 FROM public.youth_academy_competition_memberships m
        WHERE m.season_number=v_season AND m.academy_id=a.id
      )
      -- Normal U16 eligibility ends before the 16th birthday.
      AND (
        SELECT count(*)
        FROM public.youth_riders yr
        WHERE yr.academy_id=a.id AND yr.status='academy'
          AND private.youth_academy_age_v1(yr.birth_date) BETWEEN 12 AND 15
      )>=10
    ORDER BY private.youth_academy_strength_v1(a.id) DESC, a.id
    LIMIT 1;

    IF v_candidate.academy_id IS NULL THEN
      RETURN jsonb_build_object('status','no_eligible_ai_available',
        'season',v_season,'before',v_before,
        'after',v_before+v_inserted,'added',v_inserted,
        'clubs',v_added_names);
    END IF;

    INSERT INTO public.youth_academy_competition_memberships
      (season_number,academy_id,competition_class,division_code,seed_rank,metadata)
    VALUES (v_season,v_candidate.academy_id,'world','WORLD',
      v_missing_rank,
      jsonb_build_object('assignment','automatic_vacancy_repair_v1',
        'original_rank_vacancy',v_missing_rank,
        'repair_on_game_date',public.get_current_game_date_date(),
        'reason','world_class_below_16',
        'replaced_existing_team',false))
    ON CONFLICT (season_number,academy_id) DO NOTHING;

    GET DIAGNOSTICS v_after=ROW_COUNT;
    IF v_after=0 THEN
      RETURN jsonb_build_object('status','concurrent_conflict',
        'season',v_season,'before',v_before,'added',v_inserted);
    END IF;
    v_inserted:=v_inserted+1;
    v_added_names:=v_added_names||jsonb_build_array(
      jsonb_build_object('club',v_candidate.club_name,
        'academy_id',v_candidate.academy_id,
        'seed_rank',v_missing_rank));
  END LOOP;
  SELECT count(*)::integer INTO v_after
  FROM public.youth_academy_competition_memberships
  WHERE season_number=v_season AND competition_class='world';
  RETURN jsonb_build_object('status','repaired','season',v_season,
    'before',v_before,'after',v_after,'added',v_inserted,
    'clubs',v_added_names);
END
$body$;

REVOKE ALL ON FUNCTION private.autoheal_youth_world_membership_v1()
FROM PUBLIC, anon, authenticated;

-- An isolated scheduled guard prevents the missing World slot from persisting.
-- Unlike rebalance_youth_competition_memberships_v2, this never deletes memberships.
DO $schedule$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM cron.job
    WHERE jobname='ppm-youth-world-roster-autoheal-v1' AND active
  ) THEN
    PERFORM cron.schedule(
      'ppm-youth-world-roster-autoheal-v1',
      '*/10 * * * *',
      'select private.autoheal_youth_world_membership_v1();'
    );
  END IF;
END
$schedule$;
