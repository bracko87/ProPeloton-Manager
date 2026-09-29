CREATE OR REPLACE FUNCTION public.team_ranking_get_team_international_points_v1(p_team_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select v.international_points
    from public.team_international_points_by_season_v1 v
    where v.team_id=p_team_id
      and v.season_year=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
    limit 1
  ),0)::numeric;
$function$
;