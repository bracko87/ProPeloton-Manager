-- Publicly visible NC race entries have individual riders, not team tactics.
-- Expose only current club display data for riders actually registered in an
-- NC race. Do NOT relax RLS on club_riders or clubs; both can contain private data.
-- Historical memberships are ordered identically to the National Ranking lookup.
CREATE OR REPLACE FUNCTION public.get_nc_participant_current_clubs_v1(
  p_race_id uuid
)
RETURNS TABLE (
  rider_id uuid,
  club_id uuid,
  club_name text,
  club_type text,
  parent_club_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH entered_riders AS (
    SELECT DISTINCT rr.rider_id
    FROM public.race_participant_riders rr
    JOIN public.races race ON race.id = rr.race_id
    WHERE rr.race_id = p_race_id
      AND rr.rider_id IS NOT NULL
      AND (
        upper(coalesce(race.category, '')) = 'NC'
        OR race.metadata->>'national_championship' = 'true'
      )
  )
  SELECT
    entered.rider_id,
    club.id AS club_id,
    club.name AS club_name,
    club.club_type,
    club.parent_club_id
  FROM entered_riders entered
  LEFT JOIN LATERAL (
    SELECT membership.club_id
    FROM public.club_riders membership
    WHERE membership.rider_id = entered.rider_id
    ORDER BY membership.created_at DESC, membership.id DESC
    LIMIT 1
  ) latest ON TRUE
  LEFT JOIN public.clubs club
    ON club.id = latest.club_id
   AND club.deleted_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_nc_participant_current_clubs_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nc_participant_current_clubs_v1(uuid)
  TO authenticated;
