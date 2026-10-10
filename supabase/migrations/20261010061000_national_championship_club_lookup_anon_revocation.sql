-- Supabase default function grants may explicitly include anon.
-- Keep NC current-club lookup available only to signed-in players.
REVOKE ALL ON FUNCTION public.get_nc_participant_current_clubs_v1(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nc_participant_current_clubs_v1(uuid)
  TO authenticated;
