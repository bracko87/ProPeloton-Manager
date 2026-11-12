-- ProPeloton Manager, Season 1 -> 2: repair only the three audited
-- Control Center defects without disturbing historical results or the
-- 24-hour migration lock. All changes are guarded and auditable.

CREATE TABLE IF NOT EXISTS private.cycling_control_center_repair_audit_v1 (
  repair_key text PRIMARY KEY,
  original_data jsonb NOT NULL,
  repaired_data jsonb NOT NULL,
  reason text NOT NULL,
  repaired_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.cycling_control_center_repair_audit_v1
  FROM PUBLIC,anon,authenticated;

-- A departed or expired staff member must never hold a delegated user
-- responsibility in the saved academy settings. Future staff inactivations
-- automatically assign unavailable responsibilities back to the manager.
CREATE OR REPLACE FUNCTION private.return_unavailable_youth_responsibilities_to_manager_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','private','pg_temp'
AS $staff_fallback$
DECLARE
  v_clubs uuid[];
  v_club uuid;
BEGIN
  IF tg_op='DELETE' THEN
    v_clubs:=ARRAY[OLD.club_id];
  ELSE
    v_clubs:=ARRAY[OLD.club_id,NEW.club_id];
  END IF;

  FOREACH v_club IN ARRAY v_clubs LOOP
    UPDATE public.youth_academy_settings s
    SET recruitment_decider=
          CASE WHEN s.recruitment_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.recruitment_decider) IS NULL
               THEN 'manager' ELSE s.recruitment_decider END,
        recruitment_negotiation_decider=
          CASE WHEN s.recruitment_negotiation_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.recruitment_negotiation_decider) IS NULL
               THEN 'manager' ELSE s.recruitment_negotiation_decider END,
        race_entry_decider=
          CASE WHEN s.race_entry_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.race_entry_decider) IS NULL
               THEN 'manager' ELSE s.race_entry_decider END,
        race_squad_decider=
          CASE WHEN s.race_squad_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.race_squad_decider) IS NULL
               THEN 'manager' ELSE s.race_squad_decider END,
        camp_decider=
          CASE WHEN s.camp_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.camp_decider) IS NULL
               THEN 'manager' ELSE s.camp_decider END,
        training_decider=
          CASE WHEN s.training_decider<>'manager'
                 AND private.youth_available_role_v1(s.academy_id,s.training_decider) IS NULL
               THEN 'manager' ELSE s.training_decider END,
        updated_at=now()
    FROM public.youth_academies a
    WHERE a.id=s.academy_id
      AND a.club_id=v_club AND a.is_active AND NOT a.is_ai
      AND (
        (s.recruitment_decider<>'manager' AND private.youth_available_role_v1(a.id,s.recruitment_decider) IS NULL)
        OR (s.recruitment_negotiation_decider<>'manager' AND private.youth_available_role_v1(a.id,s.recruitment_negotiation_decider) IS NULL)
        OR (s.race_entry_decider<>'manager' AND private.youth_available_role_v1(a.id,s.race_entry_decider) IS NULL)
        OR (s.race_squad_decider<>'manager' AND private.youth_available_role_v1(a.id,s.race_squad_decider) IS NULL)
        OR (s.camp_decider<>'manager' AND private.youth_available_role_v1(a.id,s.camp_decider) IS NULL)
        OR (s.training_decider<>'manager' AND private.youth_available_role_v1(a.id,s.training_decider) IS NULL)
      );
  END LOOP;
  RETURN NULL;
END;
$staff_fallback$;

DROP TRIGGER IF EXISTS youth_staff_return_to_manager_on_departure_v1
  ON public.club_staff;
CREATE TRIGGER youth_staff_return_to_manager_on_departure_v1
AFTER UPDATE OF is_active,contract_expires_at,role_type,club_id OR DELETE
ON public.club_staff FOR EACH ROW
EXECUTE FUNCTION private.return_unavailable_youth_responsibilities_to_manager_v1();

-- An intentionally unstaffed academy with manager-owned responsibilities is
-- not an integrity error. Vacancies still count as issues if delegated to
-- the missing role; broken delegations remain checked independently.
DO $patch_youth_health$
DECLARE v_src text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='monitor_youth_staff_responsibilities_health_v1';
  IF v_src IS NULL THEN RAISE EXCEPTION 'Youth staff watchdog definition missing'; END IF;

  v_old:=$old_director$        and cs.role_type='youth_academy_director'
    );$old_director$;
  v_new:=$new_director$        and cs.role_type='youth_academy_director'
    )
    and exists(
      select 1 from public.youth_academy_settings s
      where s.academy_id=a.id
        and 'academy_director' in (
          s.recruitment_decider,s.recruitment_negotiation_decider,s.camp_decider,
          s.race_entry_decider,s.race_squad_decider,s.training_decider
        )
    );$new_director$;
  IF (length(v_src)-length(replace(v_src,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Unexpected director check version; refuse watchdog patch';
  END IF;
  v_src:=replace(v_src,v_old,v_new);

  v_old:=$old_coach$        and cs.role_type='u16_head_coach'
    );$old_coach$;
  v_new:=$new_coach$        and cs.role_type='u16_head_coach'
    )
    and exists(
      select 1 from public.youth_academy_settings s
      where s.academy_id=a.id
        and 'u16_head_coach' in (
          s.recruitment_decider,s.recruitment_negotiation_decider,s.camp_decider,
          s.race_entry_decider,s.race_squad_decider,s.training_decider
        )
    );$new_coach$;
  IF (length(v_src)-length(replace(v_src,v_old,'')))/length(v_old)<>1 THEN
    RAISE EXCEPTION 'Unexpected coach check version; refuse watchdog patch';
  END IF;
  EXECUTE replace(v_src,v_old,v_new);
END
$patch_youth_health$;

DO $repair_live$
DECLARE
  v_ankara uuid;
  v_replacement uuid;
  v_user_academy uuid;
  v_stage uuid;
  v_member public.youth_academy_competition_memberships%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_bad_point public.race_stage_points%rowtype;
  v_record_count int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('cycling_control_center_2026_11_12',0));
  IF public.get_current_season_number()<>2
     OR (SELECT phase FROM public.cycling_season_window_v1 WHERE id=true)<>'migration'
  THEN
    RAISE EXCEPTION 'This repair requires the protected Season 2 migration period';
  END IF;

  -- 1. Turkish world-relegated academy assigned to wrong continent.
  -- Substitute the highest-ranked currently unassigned former WEST
  -- continental academy, keeping 20 East / 20 West. Never delete a club.
  SELECT a.id INTO STRICT v_ankara
  FROM public.youth_academies a JOIN public.clubs c ON c.id=a.club_id
  WHERE c.name='Turkish Airlines Ankara Pro Racing'
    AND c.country_code='TR' AND a.is_ai AND a.is_active;
  SELECT a.id INTO STRICT v_replacement
  FROM public.youth_academies a JOIN public.clubs c ON c.id=a.club_id
  JOIN public.youth_team_standing_history_v1 h ON h.academy_id=a.id
  WHERE c.name='DB Pro Team' AND c.country_code='DE'
    AND a.is_ai AND a.is_active
    AND h.snapshot_season=1 AND h.competition_class='continental'
    AND h.division_code='CONTINENTAL_WEST' AND h.final_rank=15
    AND NOT EXISTS (
      SELECT 1 FROM public.youth_academy_competition_memberships m
      WHERE m.season_number=2 AND m.academy_id=a.id
    );
  SELECT * INTO STRICT v_member
  FROM public.youth_academy_competition_memberships
  WHERE season_number=2 AND academy_id=v_ankara
    AND competition_class='continental' AND division_code='CONTINENTAL_WEST';
  IF private.youth_continental_division_for_country_v1('TR')<>'CONTINENTAL_EAST'
     OR private.youth_continental_division_for_country_v1('DE')<>'CONTINENTAL_WEST'
     OR EXISTS (
       SELECT 1 FROM public.youth_race_entries e JOIN public.youth_races r ON r.id=e.race_id
       WHERE e.academy_id IN (v_ankara,v_replacement) AND r.season_number=2
     )
  THEN RAISE EXCEPTION 'Ankara replacement geography or live-race guard failed'; END IF;

  INSERT INTO private.cycling_control_center_repair_audit_v1(repair_key,original_data,repaired_data,reason)
  VALUES('youth_division_s2_ankara',
    jsonb_build_object('old_membership',to_jsonb(v_member),'replacement_academy',v_replacement),
    jsonb_build_object('season',2,'competition_class','continental',
      'division_code','CONTINENTAL_WEST','academy_id',v_replacement),
    'One incorrectly West-assigned world relegation replaced by a qualified former West AI academy.')
  ON CONFLICT(repair_key) DO NOTHING;

  UPDATE public.youth_academy_competition_memberships
  SET academy_id=v_replacement,seed_rank=null,
      metadata=jsonb_build_object(
        'transition','administrative_geography_correction',
        'replaced_invalid_world_relegation',v_ankara,
        'source_continental_season',1,
        'source_continental_rank',15
      )
  WHERE season_number=2 AND academy_id=v_ankara;
  GET DIAGNOSTICS v_record_count=ROW_COUNT;
  IF v_record_count<>1 THEN RAISE EXCEPTION 'West replacement did not change exactly one membership'; END IF;

  -- 2. The human manager takes five assignments after contract expiry.
  -- Do not reactivate staff, renew contracts, or make management decisions.
  SELECT a.id INTO STRICT v_user_academy
  FROM public.youth_academies a JOIN public.clubs c ON c.id=a.club_id
  WHERE c.name='BK Novi Beograd' AND c.country_code='RS'
    AND NOT a.is_ai AND a.is_active;
  SELECT * INTO STRICT v_settings
  FROM public.youth_academy_settings
  WHERE academy_id=v_user_academy;
  IF v_settings.recruitment_decider<>'academy_director'
    OR v_settings.recruitment_negotiation_decider<>'academy_director'
    OR v_settings.camp_decider<>'academy_director'
    OR v_settings.race_entry_decider<>'u16_head_coach'
    OR v_settings.race_squad_decider<>'u16_head_coach'
    OR private.youth_available_role_v1(v_user_academy,'academy_director') IS NOT NULL
    OR private.youth_available_role_v1(v_user_academy,'u16_head_coach') IS NOT NULL
  THEN RAISE EXCEPTION 'Human academy role status changed; refuse blind reassignment'; END IF;
  INSERT INTO private.cycling_control_center_repair_audit_v1(repair_key,original_data,repaired_data,reason)
  VALUES('youth_staff_bk_novi_beograd',
    to_jsonb(v_settings),
    jsonb_build_object('academy_id',v_user_academy,
      'recruitment_decider','manager','recruitment_negotiation_decider','manager',
      'camp_decider','manager','race_entry_decider','manager','race_squad_decider','manager'),
    'Five expired-staff delegations revert to the human manager; expired staff remain inactive.')
  ON CONFLICT(repair_key) DO NOTHING;

  UPDATE public.youth_academy_settings
  SET recruitment_decider='manager',
      recruitment_negotiation_decider='manager',
      camp_decider='manager',
      race_entry_decider='manager',
      race_squad_decider='manager',updated_at=now()
  WHERE academy_id=v_user_academy;
  GET DIAGNOSTICS v_record_count=ROW_COUNT;
  IF v_record_count<>1 THEN RAISE EXCEPTION 'Youth settings update did not affect exactly one academy'; END IF;

  -- 3. Piastowskie Grody Stage 1: an 8.1 km time checkpoint is NOT a
  -- competitive intermediate sprint. Season 1 source has official results
  -- and MUST NOT be touched. Season 2 stage has zero official output.
  SELECT s.id INTO STRICT v_stage
  FROM public.race_stages s JOIN public.races r ON r.id=s.race_id
  JOIN public.race_stage_profile_details d ON d.stage_id=s.id
  WHERE r.name='Piastowskie Grody Tour'
    AND s.stage_date='2001-05-12'::date AND s.stage_number=1
    AND s.metadata->'scoring_profile_reconciliation'->>'source'='timing_gate_not_a_sprint'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(d.route_markers,'[]'::jsonb)) m
      WHERE m->>'type'='time_check' AND (m->>'km')::numeric=8.1
    );
  IF EXISTS(SELECT 1 FROM public.race_stage_results WHERE stage_id=v_stage)
    OR EXISTS(SELECT 1 FROM public.race_stage_authoritative_runs WHERE stage_id=v_stage)
    OR EXISTS(SELECT 1 FROM public.race_stage_point_results WHERE stage_id=v_stage)
  THEN RAISE EXCEPTION 'Stage already has official results; refusing scoring change'; END IF;
  SELECT * INTO STRICT v_bad_point
  FROM public.race_stage_points
  WHERE stage_id=v_stage AND point_type='INTERMEDIATE_SPRINT'
    AND km_from_start=8.1 AND name='Polkowice intermediate time check';

  INSERT INTO private.cycling_control_center_repair_audit_v1(repair_key,original_data,repaired_data,reason)
  VALUES('piastowskie_grody_s2_stage1_time_gate',
    to_jsonb(v_bad_point),jsonb_build_object('stage_id',v_stage,'correct_sprint_points',0),
    'A route time checkpoint must not award intermediate sprint points.')
  ON CONFLICT(repair_key) DO NOTHING;

  DELETE FROM public.race_stage_points WHERE id=v_bad_point.id;
  GET DIAGNOSTICS v_record_count=ROW_COUNT;
  IF v_record_count<>1 THEN RAISE EXCEPTION 'Point deletion expected exactly one incorrect sprint'; END IF;
  UPDATE public.race_stages
  SET metadata=jsonb_set(coalesce(metadata,'{}'::jsonb),
      '{control_center_scoring_repair}',
      jsonb_build_object('reason','time_gate_not_a_sprint',
        'removed_point_id',v_bad_point.id,'verified_at',now()),true),
      updated_at=now()
  WHERE id=v_stage;

  -- Verify all three data problems solved, with division size unchanged.
  IF EXISTS (
    SELECT 1 FROM public.youth_academy_competition_memberships m
    JOIN public.youth_academies a ON a.id=m.academy_id
    JOIN public.clubs c ON c.id=a.club_id
    WHERE m.season_number=2 AND m.competition_class='continental'
      AND m.division_code<>private.youth_continental_division_for_country_v1(c.country_code)
  ) THEN RAISE EXCEPTION 'Continental geography mismatch remains'; END IF;
  IF (SELECT count(*) FROM public.youth_academy_competition_memberships
      WHERE season_number=2 AND division_code='CONTINENTAL_WEST')<>20
    OR (SELECT count(*) FROM public.youth_academy_competition_memberships
      WHERE season_number=2 AND division_code='CONTINENTAL_EAST')<>20
  THEN RAISE EXCEPTION 'Continental league sizes changed'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.youth_academy_settings s WHERE s.academy_id=v_user_academy
      AND (s.recruitment_decider<>'manager'
        OR s.recruitment_negotiation_decider<>'manager'
        OR s.race_entry_decider<>'manager'
        OR s.race_squad_decider<>'manager'
        OR s.camp_decider<>'manager')
  ) THEN RAISE EXCEPTION 'Manager fallback was not persisted'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.race_stage_points p WHERE p.stage_id=v_stage
      AND p.point_type IN ('INTERMEDIATE_SPRINT','BONUS_SPRINT')
  ) THEN RAISE EXCEPTION 'Stage 1 still has a competitive sprint marker'; END IF;
END
$repair_live$;
