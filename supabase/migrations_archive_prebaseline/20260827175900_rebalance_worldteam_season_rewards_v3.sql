-- Rebalance WorldTeam season-end competition rewards only.
-- ProTeam, Continental and Amateur reward rules remain unchanged.
-- WorldTeam rewards:
-- 1st: $1,000,000 + 100 coins
-- 2nd-3rd: $500,000 + 50 coins
-- 4th-5th: $250,000 + 30 coins
-- 6th-10th: $100,000 + 20 coins
-- 11th+: no position reward

create or replace function public.run_competition_rewards_v2(p_source_season integer, p_dry_run boolean default true)
returns table(reward_grant_id uuid, club_id uuid, club_name text, division text, snapshot_tier text, final_position integer, cash_total bigint, coin_total integer, reward_details jsonb, finance_transaction_id uuid, owner_user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_timeline uuid;
begin
  if auth.role()<>'service_role' then
    raise exception 'Only service_role can run competition rewards';
  end if;
  if p_source_season is null or p_source_season<=0 then
    raise exception 'p_source_season must be a positive integer';
  end if;
  if not exists(select 1 from public.team_ranking_season_snapshots s where s.season_number=p_source_season) then
    raise exception 'No team ranking snapshot exists for season %',p_source_season;
  end if;
  select timeline_id into v_timeline from public.season_transition_control_v1 where id=true;

  return query
  with snap as (
    select s.season_number,s.division,s.club_id,s.club_name,s.country_code,s.club_tier,
           s.final_position,s.points,s.is_ai,s.is_active,c.owner_user_id,c.deleted_at
    from public.team_ranking_season_snapshots s
    join public.clubs c on c.id=s.club_id
    where s.season_number=p_source_season and c.deleted_at is null
  ), sporting as (
    select distinct on (m.club_id)
      m.club_id,m.movement_type,m.source_tier,m.source_division,m.source_position,
      m.target_tier,m.target_division,m.playoff_pool,m.playoff_pool_rank,m.playoff_winner,
      m.transition_run_id
    from public.competition_transition_movements_v1 m
    join public.season_transition_runs_v1 tr on tr.id=m.transition_run_id
    where m.source_season=p_source_season
      and m.target_season=p_source_season+1
      and m.phase='sporting'
      and tr.timeline_id=v_timeline
      and tr.status in ('running','completed')
    order by m.club_id,tr.started_at desc,m.id desc
  ), calc as (
    select s.*,sp.movement_type,sp.target_tier,sp.target_division,sp.playoff_pool,sp.playoff_pool_rank,sp.playoff_winner,
      case
        when s.division='WORLD' and s.final_position=1 then 1000000
        when s.division='WORLD' and s.final_position in (2,3) then 500000
        when s.division='WORLD' and s.final_position in (4,5) then 250000
        when s.division='WORLD' and s.final_position between 6 and 10 then 100000
        when s.club_tier='proteam' and s.final_position=1 then 400000
        when s.club_tier='proteam' and s.final_position in (2,3,4) then 150000
        when s.club_tier='continental' and s.final_position=1 then 300000
        when s.club_tier='continental' and s.final_position in (2,3,4) then 100000
        when s.club_tier='amateur' and s.division in ('WESTERN_EUROPE','CENTRAL_EUROPE','SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE') and s.final_position=1 then 200000
        when s.club_tier='amateur' and s.division in ('WESTERN_EUROPE','CENTRAL_EUROPE','SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE') and s.final_position in (2,3) then 75000
        when s.club_tier='amateur' and s.division in ('NORTH_AMERICA','SOUTH_AMERICA','WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA','SOUTH_ASIA','EAST_SOUTHEAST_ASIA') and s.final_position=1 then 200000
        when s.club_tier='amateur' and s.division in ('NORTH_AMERICA','SOUTH_AMERICA','WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA','SOUTH_ASIA','EAST_SOUTHEAST_ASIA') and s.final_position in (2,3,4) then 75000
        when s.club_tier='amateur' and s.division='OCEANIA' and s.final_position=1 then 200000
        when s.club_tier='amateur' and s.division='OCEANIA' and s.final_position in (2,3) then 100000
        else 0 end::bigint as base_cash,
      case
        when s.division='WORLD' and s.final_position=1 then 100
        when s.division='WORLD' and s.final_position in (2,3) then 50
        when s.division='WORLD' and s.final_position in (4,5) then 30
        when s.division='WORLD' and s.final_position between 6 and 10 then 20
        when s.club_tier='proteam' and s.final_position=1 then 30
        when s.club_tier='continental' and s.final_position=1 then 20
        else 0 end::integer as base_coins,
      case
        when sp.movement_type='playoff_promotion' and s.club_tier='proteam' and sp.target_tier='worldteam' then 100000
        when sp.movement_type='playoff_promotion' and s.club_tier='continental' and sp.target_tier='proteam' then 50000
        when sp.movement_type='playoff_promotion' and s.club_tier='amateur' and sp.target_tier='continental' then 25000
        else 0 end::bigint as promo_cash,
      case
        when s.division='WORLD' and s.final_position between 1 and 10 then 'WORLD_'||s.final_position::text
        when s.club_tier='proteam' and s.final_position=1 then 'PRO_WINNER'
        when s.club_tier='proteam' and s.final_position in (2,3,4) then 'PRO_PLAYOFF_PLACE'
        when s.club_tier='continental' and s.final_position=1 then 'CONTINENTAL_WINNER'
        when s.club_tier='continental' and s.final_position in (2,3,4) then 'CONTINENTAL_PLAYOFF_PLACE'
        when s.club_tier='amateur' and s.division in ('WESTERN_EUROPE','CENTRAL_EUROPE','SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE','NORTH_AMERICA','SOUTH_AMERICA','WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA','SOUTH_ASIA','EAST_SOUTHEAST_ASIA') and s.final_position=1 then 'AMATEUR_DIRECT_PROMOTION'
        when s.club_tier='amateur' and s.division in ('WESTERN_EUROPE','CENTRAL_EUROPE','SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE','NORTH_AMERICA','SOUTH_AMERICA','WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA','SOUTH_ASIA','EAST_SOUTHEAST_ASIA') and s.final_position in (2,3,4) then 'AMATEUR_PLAYOFF_PLACE'
        when s.club_tier='amateur' and s.division='OCEANIA' and s.final_position=1 then 'AMATEUR_DIRECT_PROMOTION'
        when s.club_tier='amateur' and s.division='OCEANIA' and s.final_position=2 then 'AMATEUR_OCEANIA_DIRECT_2'
        when s.club_tier='amateur' and s.division='OCEANIA' and s.final_position=3 then 'AMATEUR_OCEANIA_DIRECT_3'
        else null end::text as base_code,
      case
        when sp.movement_type='playoff_promotion' and s.club_tier='proteam' and sp.target_tier='worldteam' then 'PRO_PLAYOFF_PROMOTION'
        when sp.movement_type='playoff_promotion' and s.club_tier='continental' and sp.target_tier='proteam' then 'CONTINENTAL_PLAYOFF_PROMOTION'
        when sp.movement_type='playoff_promotion' and s.club_tier='amateur' and sp.target_tier='continental' then 'AMATEUR_PLAYOFF_PROMOTION'
        else null end::text as promo_code
    from snap s left join sporting sp on sp.club_id=s.club_id
  ), rewards as (
    select c.club_id,c.club_name,c.division,c.club_tier as snapshot_tier,c.final_position,c.owner_user_id,
           (c.base_cash+c.promo_cash)::bigint as cash_total,c.base_coins::integer as coin_total,
           case
             when c.base_code is null and c.promo_code is null then '[]'::jsonb
             when c.promo_cash>0 and c.promo_code is not null then jsonb_build_array(
               jsonb_build_object('code',c.base_code,'cash',c.base_cash,'coins',c.base_coins),
               jsonb_build_object('code',c.promo_code,'cash',c.promo_cash,'coins',0,'movement_type',c.movement_type,'playoff_pool',c.playoff_pool,'playoff_pool_rank',c.playoff_pool_rank)
             )
             else jsonb_build_array(jsonb_build_object('code',c.base_code,'cash',c.base_cash,'coins',c.base_coins))
           end as reward_details
    from calc c
    where (c.base_cash+c.promo_cash)>0 or c.base_coins>0
  )
  select null::uuid,r.club_id,r.club_name,r.division,r.snapshot_tier,r.final_position,
         r.cash_total,r.coin_total,r.reward_details,null::uuid,r.owner_user_id
  from rewards r
  order by r.division,r.final_position,r.club_name;

  if not p_dry_run then
    raise exception 'Live mode disabled in this preview version. Use p_dry_run = true.';
  end if;
end;
$function$;
