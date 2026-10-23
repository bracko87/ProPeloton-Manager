-- Preserve immutable historical snapshots and source-season ledger reconciliation.
-- During the CURRENT season's snapshot only, inactive clubs are sorted after
-- all active clubs. Their actual awarded points, races, and race reputation
-- remain available in the audit snapshot. The position is effective ranking,
-- not a deletion or alteration of historical points. 
-- Transition safety checks, replay records and player contracts unchanged.

CREATE OR REPLACE FUNCTION public.snapshot_team_rankings_for_season_v1(p_season integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_season_year integer; v_existing integer; v_expected integer; v_inserted integer; v_current_season integer;
begin
  if p_season is null or p_season<=0 then raise exception 'snapshot_team_rankings_for_season_v1: season must be positive'; end if;
  v_season_year:=1999+p_season;
  v_current_season:=public.get_current_season_number();
  select count(*) into v_existing from public.team_ranking_season_snapshots where season_number=p_season;

  if v_existing>0 then
    -- A snapshot of the currently ending season must still represent the whole live boundary population.
    if v_current_season=p_season then
      select count(*) into v_expected from public.clubs c
      where c.deleted_at is null and c.club_tier::text in ('worldteam','proteam','continental','amateur');
      if v_existing<>v_expected then
        raise exception 'snapshot_team_rankings_for_season_v1: existing snapshot for current season % is incomplete/stale (% rows, expected %)',p_season,v_existing,v_expected;
      end if;
    end if;

    -- Historical snapshots are immutable boundary records; validate them against source-season scoring, not today's club count.
    perform public.verify_season_transition_source_snapshot_v1(p_season);
    return v_existing;
  end if;

  select count(*) into v_expected from public.clubs c
  where c.deleted_at is null and c.club_tier::text in ('worldteam','proteam','continental','amateur');

  with base as (
    select c.id club_id,c.name club_name,c.country_code,c.club_tier::text club_tier,
      c.tier2_division::text tier2_division,c.tier3_division::text tier3_division,c.amateur_division::text amateur_division,
      case when c.club_tier::text='worldteam' then 'WORLD'
           when c.club_tier::text='proteam' then c.tier2_division::text
           when c.club_tier::text='continental' then c.tier3_division::text
           when c.club_tier::text='amateur' then c.amateur_division::text end division,
      public.team_ranking_get_team_international_points_v1(c.id,v_season_year)::numeric international_points,
      public.team_ranking_get_completed_race_count_v1(c.id,v_season_year)::integer completed_race_count,
      public.team_ranking_get_race_reputation_value_v1(c.id)::numeric race_reputation_value,
      coalesce(c.is_ai,false) is_ai,coalesce(c.is_active,true) is_active,
      (p_season=v_current_season AND
        (coalesce(c.is_active,true)=false OR
         (coalesce(c.is_ai,false)=false AND c.inactivity_status IN ('inactive','season_end_removal_pending')))
      ) AS inactive_for_standings
    from public.clubs c
    where c.deleted_at is null and c.club_tier::text in ('worldteam','proteam','continental','amateur')
  ), ranked as (
    select b.*,row_number() over(partition by b.club_tier,b.division
      order by b.inactive_for_standings asc,b.international_points desc,b.completed_race_count desc,
        b.race_reputation_value desc,lower(b.club_name),b.club_id)::integer final_position
    from base b
  )
  insert into public.team_ranking_season_snapshots(
    season_number,season_year,division,club_id,club_name,country_code,club_tier,tier2_division,tier3_division,amateur_division,
    points,international_points,completed_race_count,race_reputation_value,final_position,is_ai,is_active,ranking_version)
  select p_season,v_season_year,r.division,r.club_id,r.club_name,r.country_code,r.club_tier,r.tier2_division,r.tier3_division,r.amateur_division,
    round(r.international_points)::integer,r.international_points,r.completed_race_count,r.race_reputation_value,r.final_position,r.is_ai,r.is_active,'canonical_team_ranking_v1'
  from ranked r;
  get diagnostics v_inserted=row_count;
  if v_inserted<>v_expected then raise exception 'snapshot_team_rankings_for_season_v1: inserted % rows, expected %',v_inserted,v_expected; end if;
  perform public.verify_season_transition_source_snapshot_v1(p_season);
  return v_inserted;
end;
$function$;
