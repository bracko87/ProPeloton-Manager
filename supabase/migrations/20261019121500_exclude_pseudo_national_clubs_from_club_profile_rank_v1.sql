-- Ensure club profile rank positions and field totals match the corrected
-- official standings: exclude hidden Association identities and fake national
-- placeholders, while preserving original AI national teams.
CREATE OR REPLACE FUNCTION public.get_club_current_ranking_position_v1(p_club_id uuid)
 RETURNS TABLE(club_id uuid, club_name text, club_type text, club_tier text, division_key text, competition_label text, season_year integer, rank_position integer, total_teams integer, international_points numeric, completed_race_count integer, race_reputation_value numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with season as (
    select
      public.team_ranking_get_current_season_year_v1()::integer
        as season_year
  ),
  target_club as (
    select
      c.id as club_id,
      c.name as club_name,
      coalesce(c.club_type::text, 'main') as club_type,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key
    from public.clubs c
    where c.id = p_club_id
      and c.deleted_at is null
      and not public.is_nonclub_national_ranking_identity_v1(c.id)
    limit 1
  ),
  competition_pool as (
    select
      c.id as club_id,
      c.name as club_name,
      coalesce(c.club_type::text, 'main') as club_type,
      c.club_tier::text as club_tier,
      case
        when c.club_tier::text = 'proteam'
          then coalesce(c.tier2_division::text, '')
        when c.club_tier::text = 'continental'
          then coalesce(c.tier3_division::text, '')
        when c.club_tier::text = 'amateur'
          then coalesce(c.amateur_division::text, '')
        else 'WORLD'
      end as division_key,
      s.season_year,
      coalesce(ip.international_points, 0)::numeric
        as international_points
    from public.clubs c
    cross join season s
    join target_club target
      on c.club_tier::text = target.club_tier
     and (
       case
         when c.club_tier::text = 'proteam'
           then coalesce(c.tier2_division::text, '')
         when c.club_tier::text = 'continental'
           then coalesce(c.tier3_division::text, '')
         when c.club_tier::text = 'amateur'
           then coalesce(c.amateur_division::text, '')
         else 'WORLD'
       end
     ) = target.division_key
    left join public.team_international_points_by_season_v1 ip
      on ip.team_id = c.id
     and ip.season_year = s.season_year
    where c.deleted_at is null
      and not public.is_nonclub_national_ranking_identity_v1(c.id)
      and c.club_tier::text in (
        'worldteam',
        'proteam',
        'continental',
        'amateur'
      )
  ),
  ranked as (
    select
      pool.*,
      row_number() over (
        order by
          pool.international_points desc,
          pool.club_name asc,
          pool.club_id asc
      )::integer as rank_position,
      count(*) over ()::integer as total_teams
    from competition_pool pool
  )
  select
    ranked.club_id,
    ranked.club_name,
    ranked.club_type,
    ranked.club_tier,
    ranked.division_key,
    public.team_ranking_format_competition_label_v1(
      ranked.club_tier,
      ranked.division_key
    ) as competition_label,
    ranked.season_year,
    ranked.rank_position,
    ranked.total_teams,
    ranked.international_points,
    0::integer as completed_race_count,
    0::numeric as race_reputation_value
  from ranked
  where ranked.club_id = p_club_id
  limit 1;
$function$
