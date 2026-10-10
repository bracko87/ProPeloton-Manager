-- Resolve CURRENT rider club and jersey directly for individual NC entries.
-- The temporary "team_id" in NC race participant rows is the RIDER id,
-- not a club id. Thus a race team kit fallback is incorrect.
-- Keep RLS on clubs/rosters unchanged and expose only participant kit metadata.
CREATE OR REPLACE FUNCTION public.get_nc_participant_current_clubs_v2(
  p_race_id uuid
)
RETURNS TABLE (
  rider_id uuid,
  club_id uuid,
  club_name text,
  club_type text,
  parent_club_id uuid,
  jersey_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH entered_riders AS (
    SELECT DISTINCT rp.rider_id
    FROM public.race_participant_riders rp
    JOIN public.races r ON r.id = rp.race_id
    WHERE rp.race_id = p_race_id
      AND rp.rider_id IS NOT NULL
      AND (
        upper(coalesce(r.category, '')) IN ('NC','NCQ')
        OR r.metadata->>'national_championship' = 'true'
      )
  ),
  membership AS (
    SELECT entered.rider_id,
           current_club.id AS club_id,
           current_club.name AS club_name,
           current_club.club_type,
           current_club.parent_club_id,
           CASE WHEN current_club.club_type = 'developing'
                 AND parent.id IS NOT NULL
                THEN parent.id
                ELSE current_club.id END AS kit_club_id
    FROM entered_riders entered
    LEFT JOIN LATERAL (
      SELECT cr.club_id
      FROM public.club_riders cr
      WHERE cr.rider_id = entered.rider_id
      ORDER BY cr.created_at DESC, cr.id DESC
      LIMIT 1
    ) latest ON TRUE
    LEFT JOIN public.clubs current_club
      ON current_club.id = latest.club_id
     AND current_club.deleted_at IS NULL
    LEFT JOIN public.clubs parent
      ON parent.id = current_club.parent_club_id
     AND parent.deleted_at IS NULL
  )
  SELECT
    member.rider_id,
    member.club_id,
    member.club_name,
    member.club_type,
    member.parent_club_id,
    CASE WHEN member.club_id IS NULL THEN NULL
         ELSE COALESCE(
           NULLIF(kit.config->>'image_url',''),
           NULLIF(kit.config->>'imageSrc',''),
           NULLIF(kit.config->>'image_data_url',''),
           NULLIF(ai.jersey_url, '')
         )
    END AS jersey_url
  FROM membership member
  LEFT JOIN LATERAL (
    SELECT k.config
    FROM public.team_kits k
    WHERE k.team_id = member.kit_club_id
      AND (
        coalesce(k.config->>'image_url','') <> ''
        OR coalesce(k.config->>'imageSrc','') <> ''
        OR coalesce(k.config->>'image_data_url','') <> ''
      )
    ORDER BY CASE WHEN lower(k.name) IN ('home','default') THEN 0 ELSE 1 END,
             k.updated_at DESC NULLS LAST, k.id DESC
    LIMIT 1
  ) kit ON TRUE
  LEFT JOIN LATERAL (
    SELECT p.jersey_url
    FROM public.ai_team_kit_previews p
    WHERE p.club_id = member.kit_club_id
      AND p.is_active = true
      AND nullif(trim(p.jersey_url),'') IS NOT NULL
    ORDER BY p.updated_at DESC NULLS LAST,
             p.created_at DESC NULLS LAST
    LIMIT 1
  ) ai ON TRUE;
$function$;

-- Supabase can grant anon explicit function permissions by default.
REVOKE ALL ON FUNCTION public.get_nc_participant_current_clubs_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nc_participant_current_clubs_v2(uuid) TO authenticated;
