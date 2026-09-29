CREATE OR REPLACE FUNCTION public.club_current_display_name_v1(p_club_id uuid, p_fallback_name text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (
      select nullif(di.display_name, '')
      from public.get_club_display_identity_v1(p_club_id) di
      limit 1
    ),
    nullif(p_fallback_name, ''),
    (
      select nullif(c.name, '')
      from public.clubs c
      where c.id = p_club_id
      limit 1
    ),
    'Team'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.rider_overall_range_label_v1(p_overall integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when p_overall is null then null
    when p_overall < 40 then 'OVR <40'
    when p_overall < 60 then 'OVR 40-60'
    when p_overall < 80 then 'OVR 60-80'
    else 'OVR 80+'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.team_ranking_get_completed_race_count_v1(p_team_id uuid, p_season_year integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select count(distinct rsr.race_id)::integer
    from public.race_stage_results rsr
    join public.races r on r.id=rsr.race_id
    where rsr.team_id=p_team_id
      and extract(year from r.start_date)::integer=coalesce(p_season_year,public.team_ranking_get_current_season_year_v1())
  ),0);
$function$
;

