CREATE OR REPLACE FUNCTION private.assign_youth_target_memberships_v3(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  d text;
  v_need integer;
  v_feed_count integer;
  v_world_down_count integer;
  v_keep_continental integer;
  v_closed_member record;
  v_ai_replacement uuid;
  v_replaced integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth hierarchy transition requires target = source + 1';
  end if;

  if not exists(
    select 1 from public.youth_team_standing_history_v1
    where snapshot_season=p_source_season
  ) then
    raise exception 'Youth final standing snapshot is missing for Season %',p_source_season;
  end if;

  delete from public.youth_academy_competition_memberships
  where season_number=p_target_season;

  create temporary table if not exists pg_temp.youth_transition_standings_v4(
    academy_id uuid primary key,
    competition_class text,
    division_code text,
    points bigint,
    division_rank integer,
    total_teams integer
  ) on commit drop;
  truncate pg_temp.youth_transition_standings_v4;

  insert into pg_temp.youth_transition_standings_v4
  select academy_id,competition_class,division_code,points,final_rank,total_teams
  from public.youth_team_standing_history_v1
  where snapshot_season=p_source_season;

  create temporary table if not exists pg_temp.youth_continental_promoted_v4(
    academy_id uuid primary key,
    source_division text not null,
    promotion_type text not null,
    playoff_rank integer
  ) on commit drop;
  truncate pg_temp.youth_continental_promoted_v4;

  -- West and East champions promote directly.
  insert into pg_temp.youth_continental_promoted_v4(
    academy_id,source_division,promotion_type,playoff_rank
  )
  select academy_id,division_code,'direct_champion',null
  from pg_temp.youth_transition_standings_v4
  where competition_class='continental' and division_rank=1;

  -- Agreed rule: 2nd, 3rd and 4th from BOTH Continental divisions
  -- form a six-team playoff table. The best two promote to World Class.
  insert into pg_temp.youth_continental_promoted_v4(
    academy_id,source_division,promotion_type,playoff_rank
  )
  select x.academy_id,x.division_code,'playoff',x.playoff_rank
  from (
    select s.*,
      row_number() over(
        order by s.points desc,
                 private.youth_academy_strength_v1(s.academy_id) desc,
                 s.academy_id
      )::integer playoff_rank
    from pg_temp.youth_transition_standings_v4 s
    where s.competition_class='continental'
      and s.division_rank between 2 and 4
  ) x
  where x.playoff_rank<=2;

  -- World Class keeps the top 12; bottom four are relegated.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select
    p_target_season,academy_id,'world','WORLD',division_rank,
    jsonb_build_object(
      'transition','world_survivor',
      'source_rank',division_rank
    )
  from pg_temp.youth_transition_standings_v4
  where competition_class='world'
    and division_rank<=greatest(0,total_teams-4)
  order by division_rank;

  -- 2 Continental champions + 2 playoff winners replace the four relegated
  -- World Class Academies.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select
    p_target_season,p.academy_id,'world','WORLD',null,
    jsonb_build_object(
      'transition',case when p.promotion_type='direct_champion'
        then 'continental_champion'
        else 'continental_playoff'
      end,
      'source_division',p.source_division,
      'playoff_rank',p.playoff_rank
    )
  from pg_temp.youth_continental_promoted_v4 p;

  create temporary table if not exists pg_temp.youth_world_down_assignment_v4(
    academy_id uuid primary key,
    target_division text not null
  ) on commit drop;
  truncate pg_temp.youth_world_down_assignment_v4;

  -- World relegations are distributed to the Continental divisions in the
  -- same number as those divisions lost through World promotion.
  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    select count(*)::integer into v_need
    from pg_temp.youth_continental_promoted_v4
    where source_division=d;

    insert into pg_temp.youth_world_down_assignment_v4(
      academy_id,target_division
    )
    select s.academy_id,d
    from pg_temp.youth_transition_standings_v4 s
    join public.youth_academies a on a.id=s.academy_id
    join public.clubs c on c.id=a.club_id
    where s.competition_class='world'
      and s.division_rank>s.total_teams-4
      and not exists(
        select 1
        from pg_temp.youth_world_down_assignment_v4 wa
        where wa.academy_id=s.academy_id
      )
    order by
      case
        when private.youth_continental_division_for_country_v1(c.country_code)=d
          then 0 else 1
      end,
      s.division_rank,
      s.academy_id
    limit v_need;
  end loop;

  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    v_feed_count:=private.youth_regional_feed_count_v1(d);

    select count(*)::integer into v_world_down_count
    from pg_temp.youth_world_down_assignment_v4
    where target_division=d;

    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      p_target_season,wa.academy_id,'continental',d,null,
      jsonb_build_object(
        'transition','world_relegated',
        'target_division',d
      )
    from pg_temp.youth_world_down_assignment_v4 wa
    where wa.target_division=d
    on conflict(season_number,academy_id) do nothing;

    -- Regional champions promote directly to their mapped Continental group.
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      p_target_season,s.academy_id,'continental',d,null,
      jsonb_build_object(
        'transition','regional_champion',
        'source_division',s.division_code
      )
    from pg_temp.youth_transition_standings_v4 s
    where s.competition_class='regional'
      and s.division_rank=1
      and private.youth_continental_division_for_regional_v1(s.division_code)=d
    on conflict(season_number,academy_id) do nothing;

    -- Relegate the exact number needed to make room for Regional champions.
    v_keep_continental:=greatest(
      0,
      20-v_world_down_count-v_feed_count
    );

    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      p_target_season,s.academy_id,'continental',d,s.division_rank,
      jsonb_build_object(
        'transition','continental_survivor',
        'source_rank',s.division_rank,
        'regional_relegation_slots',v_feed_count
      )
    from pg_temp.youth_transition_standings_v4 s
    where s.competition_class='continental'
      and s.division_code=d
      and not exists(
        select 1
        from pg_temp.youth_continental_promoted_v4 p
        where p.academy_id=s.academy_id
      )
    order by s.division_rank
    limit v_keep_continental
    on conflict(season_number,academy_id) do nothing;
  end loop;

  -- Every unassigned USER Academy is placed in its proper lowest Regional
  -- geography. This also handles relegated Continental user Academies.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,metadata
  )
  select
    p_target_season,a.id,'regional',
    private.youth_regional_division_for_country_v1(c.country_code),
    jsonb_build_object('transition','regional_user_geographic_pool')
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.is_active
    and not a.is_ai
    and c.deleted_at is null
    and not exists(
      select 1
      from public.youth_academy_competition_memberships tm
      where tm.season_number=p_target_season
        and tm.academy_id=a.id
    );

  -- Keep the intentionally small AI Regional pool.
  with candidates as (
    select
      a.id academy_id,
      private.youth_regional_division_for_country_v1(c.country_code) division_code,
      row_number() over(
        partition by private.youth_regional_division_for_country_v1(c.country_code)
        order by private.youth_academy_strength_v1(a.id) desc,a.id
      )::integer rn
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active
      and a.is_ai
      and c.deleted_at is null
      and not exists(
        select 1
        from public.youth_academy_competition_memberships tm
        where tm.season_number=p_target_season
          and tm.academy_id=a.id
      )
  )
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select
    p_target_season,c.academy_id,'regional',c.division_code,c.rn,
    jsonb_build_object(
      'transition','regional_ai_limited_pool',
      'ai_target',private.youth_regional_ai_target_v1(c.division_code)
    )
  from candidates c
  where c.rn<=private.youth_regional_ai_target_v1(c.division_code);

  -- An unrenewed player's Academy is excluded from every new-season
  -- competition. Preserve standings history, but fill a vacated top division
  -- with an available active AI academy to keep the fixed league sizes.
  for v_closed_member in
    select m.academy_id,m.division_code,m.competition_class
    from public.youth_academy_competition_memberships m
    join public.youth_academies a on a.id=m.academy_id
    where m.season_number=p_target_season and not a.is_active
    order by m.competition_class,m.division_code,m.academy_id
  loop
    select a.id into v_ai_replacement
    from public.youth_academies a
    where a.is_ai=true and a.is_active=true
      and not exists(select 1 from public.youth_academy_competition_memberships m
        where m.season_number=p_target_season and m.academy_id=a.id)
    order by private.youth_academy_strength_v1(a.id) desc,a.id limit 1;
    if v_ai_replacement is null then
      raise exception 'No active AI Youth Academy available to replace closed player Academy %',v_closed_member.academy_id;
    end if;
    update public.youth_academy_competition_memberships
      set academy_id=v_ai_replacement,
          metadata=coalesce(metadata,'{}'::jsonb)||
            jsonb_build_object('transition','closed_player_academy_ai_replacement',
              'replaced_academy_id',v_closed_member.academy_id,'closed_from_season',p_source_season)
      where season_number=p_target_season and academy_id=v_closed_member.academy_id;
    v_replaced:=v_replaced+1;
  end loop;

  if (
    select count(*) from public.youth_academy_competition_memberships
    where season_number=p_target_season and competition_class='world'
  )<>16 then
    raise exception 'Youth transition did not produce exactly 16 World Class Academies';
  end if;

  if (
    select count(*) from public.youth_academy_competition_memberships
    where season_number=p_target_season and division_code='CONTINENTAL_WEST'
  )<>20 then
    raise exception 'Youth transition did not produce exactly 20 Continental West Academies';
  end if;

  if (
    select count(*) from public.youth_academy_competition_memberships
    where season_number=p_target_season and division_code='CONTINENTAL_EAST'
  )<>20 then
    raise exception 'Youth transition did not produce exactly 20 Continental East Academies';
  end if;

  return jsonb_build_object(
    'world',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=p_target_season and competition_class='world'
    ),
    'continental_west',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=p_target_season and division_code='CONTINENTAL_WEST'
    ),
    'continental_east',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=p_target_season and division_code='CONTINENTAL_EAST'
    ),
    'regional',(
      select count(*) from public.youth_academy_competition_memberships
      where season_number=p_target_season and competition_class='regional'
    ),
    'closed_player_teams_replaced',v_replaced,
    'world_relegated',4,
    'continental_direct_promoted',2,
    'continental_playoff_teams',6,
    'continental_playoff_promoted',2,
    'west_regional_relegation_slots',
      private.youth_regional_feed_count_v1('CONTINENTAL_WEST'),
    'east_regional_relegation_slots',
      private.youth_regional_feed_count_v1('CONTINENTAL_EAST')
  );
end;
$function$;
