-- Fix the four user-owned WorldTeam slots that were missing from the
-- earlier Season 1 restart baseline. This is RESET METADATA ONLY.
-- The replaced AI clubs remain untouched in public.clubs.
-- Four replacement pairs are grounded by exactly equal deletion/creation
-- timestamps AND the Season 1 final standings.
CREATE TABLE IF NOT EXISTS private.game_world_reset_baseline_player_slot_audit_v1 (
  old_ai_club_id uuid PRIMARY KEY,
  new_player_club_id uuid NOT NULL UNIQUE,
  old_baseline_snapshot jsonb NOT NULL,
  replacement_record jsonb NOT NULL,
  audited_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.game_world_reset_baseline_player_slot_audit_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.game_world_reset_baseline_player_slot_audit_v1 FROM PUBLIC,anon,authenticated;

DO $reconcile$
DECLARE
 rec record;
 v_pairs integer;
BEGIN
  -- The four replacements are an existing-world correction, not seed data.
  -- Skip only if none of their old or new club identities exists. Partial
  -- historical state still reaches the strict four-pair verification below.
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
    WHERE id IN (
      'e752a999-df0d-41c6-a6f9-01aedb6e2a57'::uuid,
      '3eb1ca2e-0b65-41c9-9793-ce3d2539410e'::uuid,
      'd41bca67-63dc-449c-b79f-786d83304ce8'::uuid,
      'a0e5d05f-08c9-4f39-8687-d7e6ba023ad4'::uuid,
      'c4ca3d49-4d8d-4342-bea3-1a412f43494b'::uuid,
      '944c5db7-b6ac-4dd2-b0cf-361d8809d81c'::uuid,
      '21b1485a-7977-467a-86bb-705b6419281b'::uuid,
      'efaafbba-f8a7-482f-8e8e-0a4b48d4f0a7'::uuid
    )
  ) THEN
    RAISE NOTICE 'Skipping historical four-slot player replacement on fresh install';
    RETURN;
  END IF;

  SELECT count(*) INTO v_pairs FROM (
    VALUES
      ('e752a999-df0d-41c6-a6f9-01aedb6e2a57'::uuid,'3eb1ca2e-0b65-41c9-9793-ce3d2539410e'::uuid),
      ('d41bca67-63dc-449c-b79f-786d83304ce8'::uuid,'a0e5d05f-08c9-4f39-8687-d7e6ba023ad4'::uuid),
      ('c4ca3d49-4d8d-4342-bea3-1a412f43494b'::uuid,'944c5db7-b6ac-4dd2-b0cf-361d8809d81c'::uuid),
      ('21b1485a-7977-467a-86bb-705b6419281b'::uuid,'efaafbba-f8a7-482f-8e8e-0a4b48d4f0a7'::uuid)
  ) mapping(old_id,new_id)
  JOIN public.clubs old ON old.id=mapping.old_id
  JOIN public.clubs current_player ON current_player.id=mapping.new_id
    AND current_player.created_at=old.deleted_at
    AND current_player.deleted_at IS NULL
    AND current_player.owner_user_id IS NOT NULL
  JOIN public.team_ranking_season_snapshots s
    ON s.club_id=mapping.new_id AND s.season_number=1 AND s.club_tier='worldteam';

  IF v_pairs<>4 THEN
    RAISE EXCEPTION 'Four historical player-slot replacements could not be verified';
  END IF;

  FOR rec IN
    SELECT mapping.old_id,mapping.new_id,
      to_jsonb(b) AS old_snapshot,
      p.name new_name,p.country_code,
      p.club_type,p.parent_club_id,p.max_promotion_tier,p.world_tier,
      s.club_tier,s.tier2_division,s.tier3_division,s.amateur_division
    FROM (VALUES
      ('e752a999-df0d-41c6-a6f9-01aedb6e2a57'::uuid,'3eb1ca2e-0b65-41c9-9793-ce3d2539410e'::uuid),
      ('d41bca67-63dc-449c-b79f-786d83304ce8'::uuid,'a0e5d05f-08c9-4f39-8687-d7e6ba023ad4'::uuid),
      ('c4ca3d49-4d8d-4342-bea3-1a412f43494b'::uuid,'944c5db7-b6ac-4dd2-b0cf-361d8809d81c'::uuid),
      ('21b1485a-7977-467a-86bb-705b6419281b'::uuid,'efaafbba-f8a7-482f-8e8e-0a4b48d4f0a7'::uuid)
    ) mapping(old_id,new_id)
    LEFT JOIN public.game_world_reset_s1_competition_baseline_v1 b ON b.club_id=mapping.old_id
    JOIN public.clubs p ON p.id=mapping.new_id
    JOIN public.team_ranking_season_snapshots s ON s.club_id=mapping.new_id AND s.season_number=1
  LOOP
    IF rec.old_snapshot IS NOT NULL THEN
      INSERT INTO private.game_world_reset_baseline_player_slot_audit_v1(
        old_ai_club_id,new_player_club_id,old_baseline_snapshot,replacement_record
      ) VALUES (
        rec.old_id,rec.new_id,rec.old_snapshot,
        jsonb_build_object('name',rec.new_name,'s1_tier',rec.club_tier)
      ) ON CONFLICT (old_ai_club_id) DO NOTHING;
    END IF;
    DELETE FROM public.game_world_reset_s1_competition_baseline_v1 WHERE club_id=rec.old_id;
    INSERT INTO public.game_world_reset_s1_competition_baseline_v1(
      club_id,club_name,country_code,club_tier,tier2_division,tier3_division,
      amateur_division,is_ai,snapshot_is_active,club_type,parent_club_id,
      max_promotion_tier,world_tier
    ) VALUES (
      rec.new_id,rec.new_name,rec.country_code,rec.club_tier,rec.tier2_division,
      rec.tier3_division,rec.amateur_division,false,true,rec.club_type,
      rec.parent_club_id,rec.max_promotion_tier,rec.world_tier
    ) ON CONFLICT (club_id) DO NOTHING;
  END LOOP;

  IF (SELECT count(*) FROM public.game_world_reset_s1_competition_baseline_v1)<>499
    OR (SELECT count(*) FROM public.game_world_reset_s1_competition_baseline_v1 WHERE club_tier='worldteam')<>25
    OR EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.deleted_at IS NULL AND c.owner_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.game_world_reset_s1_competition_baseline_v1 b
          WHERE b.club_id=c.id
        )
    )
  THEN RAISE EXCEPTION 'Season 1 competition baseline integrity failed'; END IF;
END $reconcile$;
