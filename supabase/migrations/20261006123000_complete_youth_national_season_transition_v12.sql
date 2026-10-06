-- Complete Season Transition coverage for Youth Academy,
-- National Associations / World Nations and National Ranking / Championships.
-- v12: final Youth standings are snapshotted, points restart by target season,
-- sporting movements are audited, agreed 6-team Continental playoff is enforced,
-- and all three modules are required Season Transition components.

create table if not exists public.youth_team_standing_history_v1(
  snapshot_season integer not null,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  competition_class text not null,
  division_code text not null,
  final_rank integer not null,
  total_teams integer not null,
  points bigint not null default 0,
  starts integer not null default 0,
  wins integer not null default 0,
  podiums integer not null default 0,
  transition_run_id uuid null references public.season_transition_runs_v1(id) on delete set null,
  snapshot_at timestamptz not null default now(),
  primary key(snapshot_season,academy_id)
);

create index if not exists youth_team_standing_history_v1_season_division_idx
  on public.youth_team_standing_history_v1(
    snapshot_season,competition_class,division_code,final_rank
  );

create table if not exists public.youth_competition_transition_movements_v1(
  id bigserial primary key,
  transition_run_id uuid not null references public.season_transition_runs_v1(id) on delete cascade,
  source_season integer not null,
  target_season integer not null,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  source_class text null,
  source_division text null,
  source_rank integer null,
  source_points bigint not null default 0,
  target_class text null,
  target_division text null,
  playoff_rank integer null,
  movement_type text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  unique(transition_run_id,academy_id)
);

create index if not exists youth_competition_transition_movements_v1_pair_idx
  on public.youth_competition_transition_movements_v1(
    source_season,target_season,movement_type
  );

create or replace function private.snapshot_youth_team_standings_v1(
  p_transition_run_id uuid,
  p_source_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_rows integer:=0;
begin
  insert into public.youth_team_standing_history_v1(
    snapshot_season,academy_id,competition_class,division_code,
    final_rank,total_teams,points,starts,wins,podiums,
    transition_run_id,snapshot_at
  )
  with race_points as (
    select
      p.academy_id,
      sum(private.youth_team_ranking_points_v1(
        r.competition_class,p.team_position
      ))::bigint points,
      count(*)::integer starts,
      count(*) filter(where p.team_position=1)::integer wins,
      count(*) filter(where p.team_position<=3)::integer podiums
    from public.youth_race_team_prizes p
    join public.youth_races r on r.id=p.race_id
    where r.season_number=p_source_season
    group by p.academy_id
  ), ranked as (
    select
      m.academy_id,m.competition_class,m.division_code,
      coalesce(p.points,0)::bigint points,
      coalesce(p.starts,0)::integer starts,
      coalesce(p.wins,0)::integer wins,
      coalesce(p.podiums,0)::integer podiums,
      row_number() over(
        partition by m.competition_class,m.division_code
        order by coalesce(p.points,0) desc,
                 private.youth_academy_strength_v1(m.academy_id) desc,
                 m.academy_id
      )::integer final_rank,
      count(*) over(
        partition by m.competition_class,m.division_code
      )::integer total_teams
    from public.youth_academy_competition_memberships m
    join public.youth_academies a
      on a.id=m.academy_id and a.is_active
    left join race_points p on p.academy_id=m.academy_id
    where m.season_number=p_source_season
  )
  select
    p_source_season,academy_id,competition_class,division_code,
    final_rank,total_teams,points,starts,wins,podiums,
    p_transition_run_id,now()
  from ranked
  on conflict(snapshot_season,academy_id) do update
  set competition_class=excluded.competition_class,
      division_code=excluded.division_code,
      final_rank=excluded.final_rank,
      total_teams=excluded.total_teams,
      points=excluded.points,
      starts=excluded.starts,
      wins=excluded.wins,
      podiums=excluded.podiums,
      transition_run_id=excluded.transition_run_id,
      snapshot_at=now();

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'season_number',p_source_season,
    'snapshot_rows',v_rows,
    'world_rows',(
      select count(*) from public.youth_team_standing_history_v1
      where snapshot_season=p_source_season and competition_class='world'
    ),
    'continental_rows',(
      select count(*) from public.youth_team_standing_history_v1
      where snapshot_season=p_source_season and competition_class='continental'
    ),
    'regional_rows',(
      select count(*) from public.youth_team_standing_history_v1
      where snapshot_season=p_source_season and competition_class='regional'
    )
  );
end;
$function$;

create or replace function private.assign_youth_target_memberships_v3(
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  d text;
  v_need integer;
  v_feed_count integer;
  v_world_down_count integer;
  v_keep_continental integer;
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

-- Compatibility name used by existing callers.
create or replace function private.assign_youth_target_memberships_v2(
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language sql
security definer
set search_path=public,private,pg_temp
as $function$
  select private.assign_youth_target_memberships_v3(
    p_source_season,p_target_season
  );
$function$;

create or replace function private.log_youth_transition_movements_v1(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_rows integer:=0;
begin
  delete from public.youth_competition_transition_movements_v1
  where transition_run_id=p_transition_run_id;

  insert into public.youth_competition_transition_movements_v1(
    transition_run_id,source_season,target_season,academy_id,
    source_class,source_division,source_rank,source_points,
    target_class,target_division,playoff_rank,movement_type,reason
  )
  select
    p_transition_run_id,p_source_season,p_target_season,
    coalesce(s.academy_id,t.academy_id),
    s.competition_class,s.division_code,s.final_rank,coalesce(s.points,0),
    t.competition_class,t.division_code,
    nullif(t.metadata->>'playoff_rank','')::integer,
    case
      when s.academy_id is null then 'new_entry'
      when t.academy_id is null then 'not_selected'
      when s.competition_class='world' and t.competition_class='continental'
        then 'relegated'
      when s.competition_class='continental' and t.competition_class='regional'
        then 'relegated'
      when s.competition_class='continental' and t.competition_class='world'
        and t.metadata->>'transition'='continental_champion'
        then 'direct_promotion'
      when s.competition_class='continental' and t.competition_class='world'
        and t.metadata->>'transition'='continental_playoff'
        then 'playoff_promotion'
      when s.competition_class='regional' and t.competition_class='continental'
        then 'direct_promotion'
      when s.competition_class=t.competition_class
        and s.division_code=t.division_code
        then 'stay'
      else 'reassigned'
    end,
    coalesce(t.metadata->>'transition','season_transition')
  from public.youth_team_standing_history_v1 s
  full join public.youth_academy_competition_memberships t
    on t.academy_id=s.academy_id
   and t.season_number=p_target_season
  where s.snapshot_season=p_source_season
     or s.academy_id is null;

  get diagnostics v_rows=row_count;
  return v_rows;
end;
$function$;

create or replace function public.run_youth_academy_season_transition_v1(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  standings_snapshot jsonb;
  seed_result jsonb;
  hierarchy_result jsonb;
  new_budgets integer:=0;
  agreements_extended integer:=0;
  calendar_seed_result jsonb;
  weather_calendar_result jsonb;
  runtime_result jsonb;
  movement_rows integer:=0;
  target_prize_rows integer:=0;
  target_result_rows integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth Academy transition requires target = source + 1';
  end if;

  if not exists(
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.source_season=p_source_season
      and r.target_season=p_target_season
      and r.status='running'
  ) then
    raise exception 'Youth Academy transition requires a matching running transition';
  end if;

  select count(*) into target_prize_rows
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into target_result_rows
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  if target_prize_rows<>0 or target_result_rows<>0 then
    raise exception
      'Youth target season is not fresh before rollover (prize rows %, result rows %)',
      target_prize_rows,target_result_rows;
  end if;

  -- Freeze final source-season standings before any membership movement.
  standings_snapshot:=private.snapshot_youth_team_standings_v1(
    p_transition_run_id,p_source_season
  );

  seed_result:=public.seed_ai_youth_academies_for_season_v1(p_target_season);

  hierarchy_result:=private.assign_youth_target_memberships_v3(
    p_source_season,p_target_season
  );

  movement_rows:=private.log_youth_transition_movements_v1(
    p_transition_run_id,p_source_season,p_target_season
  );

  -- Every new season starts with a fresh Youth budget ledger state.
  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount,initial_allocation
  )
  select
    a.id,p_target_season,
    coalesce(b.season_budget,100000),
    0,
    coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_range,'local'),
    coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_budget,5000),
    coalesce(b.season_budget,100000)
  from public.youth_academies a
  left join public.youth_academy_season_budgets b
    on b.academy_id=a.id and b.season_number=p_source_season
  where a.is_active
  on conflict(academy_id,season_number) do nothing;
  get diagnostics new_budgets=row_count;

  update public.youth_rider_agreements a
  set
    ends_on=public.get_game_date_for_season_end(p_target_season),
    updated_at=now()
  from public.youth_riders r
  where r.id=a.youth_rider_id
    and r.status='academy'
    and a.status='active'
    and (
      a.ends_on is null
      or a.ends_on<=public.get_game_date_for_season_end(p_source_season)
    );
  get diagnostics agreements_extended=row_count;

  -- Source-season scouting decisions do not leak into a new season.
  update public.youth_scouting_reports
  set status='expired',
      expires_on=least(expires_on,public.get_game_date_for_season_end(p_source_season)),
      updated_at=now()
  where status in ('new','shortlisted','approached')
    and discovered_on<=public.get_game_date_for_season_end(p_source_season);

  calendar_seed_result:=public.seed_youth_race_calendar_for_season_v1(
    p_target_season
  );

  weather_calendar_result:=private.apply_youth_weather_calendar_v8(
    p_target_season,
    public.game_date_from_parts(p_target_season,1,1)-1
  );

  runtime_result:=public.ensure_youth_race_runtime_for_season_v1(
    p_target_season
  );

  select count(*) into target_prize_rows
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into target_result_rows
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  if target_prize_rows<>0 or target_result_rows<>0 then
    raise exception
      'Youth target-season points/results were not reset (prizes %, results %)',
      target_prize_rows,target_result_rows;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'final_standings_snapshot',standings_snapshot,
    'points_reset',true,
    'target_team_point_rows',target_prize_rows,
    'target_result_rows',target_result_rows,
    'movement_audit_rows',movement_rows,
    'new_season_budgets',new_budgets,
    'agreements_extended',agreements_extended,
    'ai_seed',seed_result,
    'hierarchy',hierarchy_result,
    'calendar_seed',calendar_seed_result,
    'weather_calendar',weather_calendar_result,
    'race_runtime',runtime_result
  );
end;
$function$;

create or replace function public.run_national_ranking_season_transition_v1(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_created integer:=0;
  v_target_editions integer:=0;
  v_target_snapshots integer:=0;
  v_target_entries integer:=0;
  v_target_duties integer:=0;
  v_target_results integer:=0;
  v_target_bonus integer:=0;
  v_source_editions integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'National Ranking transition requires target = source + 1';
  end if;

  if not exists(
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.source_season=p_source_season
      and r.target_season=p_target_season
      and r.status='running'
  ) then
    raise exception 'National Ranking transition requires a matching running transition';
  end if;

  select count(*) into v_source_editions
  from public.national_championship_editions
  where season_number=p_source_season and discipline='road';

  -- New-season National Championship editions are created as part of the
  -- transition, after the target senior race calendar exists.
  v_created:=public.ensure_national_championship_editions_for_season_v1(
    p_target_season
  );

  select count(*) into v_target_editions
  from public.national_championship_editions
  where season_number=p_target_season and discipline='road';

  select count(*) into v_target_snapshots
  from public.national_championship_ranking_snapshots s
  join public.national_championship_editions e on e.id=s.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_entries
  from public.national_championship_entries en
  join public.national_championship_editions e on e.id=en.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_duties
  from public.national_championship_duties d
  join public.national_championship_editions e on e.id=d.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_results
  from public.national_championship_result_history h
  join public.national_championship_editions e on e.id=h.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_target_bonus
  from public.national_championship_ranking_bonus_awards b
  join public.national_championship_editions e on e.id=b.edition_id
  where e.season_number=p_target_season;

  if v_target_editions=0
     or v_target_snapshots<>0
     or v_target_entries<>0
     or v_target_duties<>0
     or v_target_results<>0
     or v_target_bonus<>0 then
    raise exception
      'National Ranking target state is not fresh (editions %, snapshots %, entries %, duties %, results %, bonus %)',
      v_target_editions,v_target_snapshots,v_target_entries,
      v_target_duties,v_target_results,v_target_bonus;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'source_editions_preserved',v_source_editions,
    'target_editions_created',v_created,
    'target_editions_total',v_target_editions,
    'target_ranking_snapshots',v_target_snapshots,
    'target_entries',v_target_entries,
    'target_duties',v_target_duties,
    'target_results',v_target_results,
    'target_national_bonus_awards',v_target_bonus,
    'ranking_model','rolling_performance_window',
    'note','National Ranking history is preserved. The new Championship season starts with fresh editions and no frozen rankings, entries, duties, results or Championship bonus awards.'
  );
end;
$function$;

create or replace function public.run_national_association_season_transition_v2(
  p_transition_run_id uuid,
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_base jsonb;
  v_target_point_rows integer:=0;
  v_target_points bigint:=0;
begin
  v_base:=public.run_national_association_season_transition_v1(
    p_transition_run_id,p_source_season,p_target_season
  );

  select count(*),coalesce(sum(points),0)::bigint
  into v_target_point_rows,v_target_points
  from public.nations_team_ranking_points
  where season_number=p_target_season;

  if v_target_point_rows<>0 or v_target_points<>0 then
    raise exception
      'National Association target-season points are not fresh (rows %, points %)',
      v_target_point_rows,v_target_points;
  end if;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'target_season_point_rows',v_target_point_rows,
    'target_season_points',v_target_points,
    'season_points_reset',true,
    'all_time_points_preserved',true
  );
end;
$function$;

create or replace function public.verify_new_season_fresh_state_v2(
  p_source_season integer,
  p_target_season integer
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_base jsonb;
  v_youth_prizes integer:=0;
  v_youth_results integer:=0;
  v_youth_world integer:=0;
  v_youth_west integer:=0;
  v_youth_east integer:=0;
  v_youth_source_memberships integer:=0;
  v_youth_snapshot_rows integer:=0;
  v_na_point_rows integer:=0;
  v_na_points bigint:=0;
  v_nc_editions integer:=0;
  v_nc_snapshots integer:=0;
  v_nc_entries integer:=0;
  v_nc_duties integer:=0;
  v_nc_results integer:=0;
begin
  v_base:=public.verify_new_season_fresh_state_v1(
    p_source_season,p_target_season
  );

  select count(*) into v_youth_prizes
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into v_youth_results
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  select count(*) into v_youth_world
  from public.youth_academy_competition_memberships
  where season_number=p_target_season and competition_class='world';

  select count(*) into v_youth_west
  from public.youth_academy_competition_memberships
  where season_number=p_target_season and division_code='CONTINENTAL_WEST';

  select count(*) into v_youth_east
  from public.youth_academy_competition_memberships
  where season_number=p_target_season and division_code='CONTINENTAL_EAST';

  select count(*) into v_youth_source_memberships
  from public.youth_academy_competition_memberships
  where season_number=p_source_season;

  select count(*) into v_youth_snapshot_rows
  from public.youth_team_standing_history_v1
  where snapshot_season=p_source_season;

  select count(*),coalesce(sum(points),0)::bigint
  into v_na_point_rows,v_na_points
  from public.nations_team_ranking_points
  where season_number=p_target_season;

  select count(*) into v_nc_editions
  from public.national_championship_editions
  where season_number=p_target_season and discipline='road';

  select count(*) into v_nc_snapshots
  from public.national_championship_ranking_snapshots s
  join public.national_championship_editions e on e.id=s.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_nc_entries
  from public.national_championship_entries en
  join public.national_championship_editions e on e.id=en.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_nc_duties
  from public.national_championship_duties d
  join public.national_championship_editions e on e.id=d.edition_id
  where e.season_number=p_target_season;

  select count(*) into v_nc_results
  from public.national_championship_result_history h
  join public.national_championship_editions e on e.id=h.edition_id
  where e.season_number=p_target_season;

  if v_youth_prizes<>0
     or v_youth_results<>0
     or v_youth_world<>16
     or v_youth_west<>20
     or v_youth_east<>20
     or v_youth_snapshot_rows<>v_youth_source_memberships
     or v_na_point_rows<>0
     or v_na_points<>0
     or v_nc_editions=0
     or v_nc_snapshots<>0
     or v_nc_entries<>0
     or v_nc_duties<>0
     or v_nc_results<>0 then
    raise exception
      'extended new-season freshness failed: youth prizes %, youth results %, Youth W/W/E %/%/%, Youth snapshots %/%; nations target points rows/points %/%; national editions %, snapshots %, entries %, duties %, results %',
      v_youth_prizes,v_youth_results,v_youth_world,v_youth_west,v_youth_east,
      v_youth_snapshot_rows,v_youth_source_memberships,
      v_na_point_rows,v_na_points,
      v_nc_editions,v_nc_snapshots,v_nc_entries,v_nc_duties,v_nc_results;
  end if;

  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object(
    'youth_academy',jsonb_build_object(
      'target_team_point_rows',v_youth_prizes,
      'target_result_rows',v_youth_results,
      'world_teams',v_youth_world,
      'continental_west_teams',v_youth_west,
      'continental_east_teams',v_youth_east,
      'source_final_snapshot_rows',v_youth_snapshot_rows,
      'source_membership_rows',v_youth_source_memberships,
      'points_reset',true
    ),
    'national_associations',jsonb_build_object(
      'target_point_rows',v_na_point_rows,
      'target_points',v_na_points,
      'season_points_reset',true
    ),
    'national_rankings',jsonb_build_object(
      'target_editions',v_nc_editions,
      'target_frozen_snapshots',v_nc_snapshots,
      'target_entries',v_nc_entries,
      'target_duties',v_nc_duties,
      'target_results',v_nc_results,
      'fresh',true
    )
  );
end;
$function$;

-- Update the Youth Rankings UI/backend rule copy and playoff pool itself:
-- 2nd-4th from West + 2nd-4th from East = six teams; top two promote.
do $patch_youth_rankings$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.get_my_youth_rankings_v1()'::regprocedure
  );

  ddl:=replace(
    ddl,
    '2nd and 3rd from Continental West and East form a four-team playoff table; the best two are promoted to World Class.',
    '2nd, 3rd and 4th from Continental West and East form a six-team playoff table; the best two are promoted to World Class.'
  );

  ddl:=replace(
    ddl,
    'x.competition_class=''continental'' and x.rank_no between 2 and 3',
    'x.competition_class=''continental'' and x.rank_no between 2 and 4'
  );

  ddl:=replace(
    ddl,
    'from base b where b.division_rank between 2 and 3',
    'from base b where b.division_rank between 2 and 4'
  );

  execute ddl;
end;
$patch_youth_rankings$;

-- Wire National Ranking and the strengthened National Association rollover into
-- the canonical v2 engine, and validate all three modules after core apply.
do $patch_transition_v2$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.season_transition_engine_execute_v2(uuid,integer,integer,text)'::regprocedure
  );

  if position('v_national_rankings jsonb;' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_national_associations jsonb;',
      'v_national_associations jsonb;'||chr(10)||'  v_national_rankings jsonb;'
    );
  end if;

  ddl:=replace(
    ddl,
    'v_national_associations := public.run_national_association_season_transition_v1(',
    'v_national_associations := public.run_national_association_season_transition_v2('
  );

  if position('v_national_rankings := public.run_national_ranking_season_transition_v1(' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_national_associations := public.run_national_association_season_transition_v2('||
      chr(10)||'      p_transition_run_id,p_source_season,p_target_season'||
      chr(10)||'    );',
      'v_national_associations := public.run_national_association_season_transition_v2('||
      chr(10)||'      p_transition_run_id,p_source_season,p_target_season'||
      chr(10)||'    );'||
      chr(10)||chr(10)||
      '    v_national_rankings := public.run_national_ranking_season_transition_v1('||
      chr(10)||'      p_transition_run_id,p_source_season,p_target_season'||
      chr(10)||'    );'
    );
  end if;

  ddl:=replace(
    ddl,
    '''national_associations_world_nations'',v_national_associations,',
    '''national_associations_world_nations'',v_national_associations,'||
    chr(10)||'      ''national_rankings_championships'',v_national_rankings,'
  );

  ddl:=replace(
    ddl,
    'v_fresh := public.verify_new_season_fresh_state_v1(',
    'v_fresh := public.verify_new_season_fresh_state_v2('
  );

  execute ddl;
end;
$patch_transition_v2$;

do $patch_core_validation$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.season_transition_engine_apply_core_v2(uuid)'::regprocedure
  );
  ddl:=replace(
    ddl,
    'v_validation := public.verify_new_season_fresh_state_v1(',
    'v_validation := public.verify_new_season_fresh_state_v2('
  );
  execute ddl;
end;
$patch_core_validation$;

-- Keep the older component executor safe if it is used manually.
do $patch_legacy_components$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.execute_season_transition_components_v1(uuid,integer,integer)'::regprocedure
  );

  if position('v_youth_academy jsonb' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_fresh_state jsonb; v_result jsonb;',
      'v_fresh_state jsonb; v_youth_academy jsonb; v_national_associations jsonb; v_national_rankings jsonb; v_result jsonb;'
    );
  end if;

  if position('run_national_association_season_transition_v2' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_national_associations:=public.run_national_association_season_transition_v2(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_national_rankings:=public.run_national_ranking_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  if position('v_youth_academy:=public.run_youth_academy_season_transition_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_youth_academy:=public.run_youth_academy_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  ddl:=replace(
    ddl,
    'v_fresh_state:=public.verify_new_season_fresh_state_v1(',
    'v_fresh_state:=public.verify_new_season_fresh_state_v2('
  );

  ddl:=replace(
    ddl,
    '''competition_transition'',v_competition,',
    '''competition_transition'',v_competition,''national_associations_world_nations'',v_national_associations,''national_rankings_championships'',v_national_rankings,'
  );

  ddl:=replace(
    ddl,
    '''developing_team'',v_developing_team,''finances_rewards''',
    '''developing_team'',v_developing_team,''youth_academy'',v_youth_academy,''finances_rewards'''
  );

  execute ddl;
end;
$patch_legacy_components$;

-- Recovery must not omit Youth/National modules either.
do $patch_recovery_components$
declare
  ddl text;
begin
  ddl:=pg_get_functiondef(
    'public.execute_season_transition_recovery_components_v1(uuid,integer,integer)'::regprocedure
  );

  if position('v_youth_academy jsonb' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_ai_rosters jsonb; v_sponsors jsonb; v_developing_team jsonb; v_finances_rewards jsonb; v_result jsonb;',
      'v_ai_rosters jsonb; v_sponsors jsonb; v_developing_team jsonb; v_youth_academy jsonb; v_national_associations jsonb; v_national_rankings jsonb; v_finances_rewards jsonb; v_result jsonb;'
    );
  end if;

  if position('run_national_association_season_transition_v2' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_competition:=public.run_competition_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_national_associations:=public.run_national_association_season_transition_v2(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_national_rankings:=public.run_national_ranking_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  if position('v_youth_academy:=public.run_youth_academy_season_transition_v1' in ddl)=0 then
    ddl:=replace(
      ddl,
      'v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);',
      'v_developing_team:=public.run_developing_team_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'||
      chr(10)||'    v_youth_academy:=public.run_youth_academy_season_transition_v1(p_transition_run_id,p_source_season,p_target_season);'
    );
  end if;

  ddl:=replace(
    ddl,
    '''competition_transition'',v_competition,',
    '''competition_transition'',v_competition,''national_associations_world_nations'',v_national_associations,''national_rankings_championships'',v_national_rankings,'
  );

  ddl:=replace(
    ddl,
    '''developing_team'',v_developing_team,''finances_rewards''',
    '''developing_team'',v_developing_team,''youth_academy'',v_youth_academy,''finances_rewards'''
  );

  execute ddl;
end;
$patch_recovery_components$;

-- Register the missing mandatory preflight components.
insert into public.season_transition_component_readiness_v1(
  component_key,display_order,required,status,details,updated_at
) values
(
  'youth_academy',
  15,
  true,
  'ready',
  'Youth Academy rollover is part of the canonical transition: final team standings are snapshotted, Season points restart from zero, World bottom four are relegated, Continental West/East champions promote directly, 2nd-4th from both divisions form the six-team playoff with the best two promoted, Regional champions promote, target memberships/budgets/calendar are rebuilt, and movement audit rows are stored.',
  now()
),
(
  'national_rankings_championships',
  17,
  true,
  'ready',
  'National Ranking / National Championship rollover is part of the canonical transition: source Championship history is preserved, target-season Championship editions are created after the race calendar, and the target season starts without frozen ranking snapshots, entries, duties, results or Championship bonus awards. The ranking remains a rolling performance window by design.',
  now()
)
on conflict(component_key) do update
set display_order=excluded.display_order,
    required=excluded.required,
    status=excluded.status,
    details=excluded.details,
    updated_at=now();

update public.season_transition_component_readiness_v1
set display_order=16,
    required=true,
    status='ready',
    details='National Association / World Nations rollover is part of the canonical transition: source-season standings are snapshotted, season points restart at zero while all-time points persist, source coach/election/squad/call-up state is closed, and future host applications remain preserved.',
    updated_at=now()
where component_key='national_associations_world_nations';

-- Pure source-state validation helper used by tests/Control Center without
-- mutating the target season.
create or replace function public.preview_youth_season_transition_v2(
  p_source_season integer
)
returns jsonb
language sql
stable
set search_path=public,private,pg_temp
as $function$
  with pts as (
    select
      p.academy_id,
      sum(private.youth_team_ranking_points_v1(
        r.competition_class,p.team_position
      ))::bigint points
    from public.youth_race_team_prizes p
    join public.youth_races r on r.id=p.race_id
    where r.season_number=p_source_season
    group by p.academy_id
  ), base as (
    select
      m.academy_id,m.competition_class,m.division_code,
      coalesce(p.points,0)::bigint points,
      row_number() over(
        partition by m.competition_class,m.division_code
        order by coalesce(p.points,0) desc,
                 private.youth_academy_strength_v1(m.academy_id) desc,
                 m.academy_id
      )::integer division_rank,
      count(*) over(
        partition by m.competition_class,m.division_code
      )::integer total_teams
    from public.youth_academy_competition_memberships m
    left join pts p on p.academy_id=m.academy_id
    where m.season_number=p_source_season
  ), playoff as (
    select b.*,
      row_number() over(
        order by b.points desc,
                 private.youth_academy_strength_v1(b.academy_id) desc,
                 b.academy_id
      )::integer playoff_rank
    from base b
    where b.competition_class='continental'
      and b.division_rank between 2 and 4
  )
  select jsonb_build_object(
    'source_season',p_source_season,
    'world_teams',(select count(*) from base where competition_class='world'),
    'continental_west_teams',(select count(*) from base where division_code='CONTINENTAL_WEST'),
    'continental_east_teams',(select count(*) from base where division_code='CONTINENTAL_EAST'),
    'world_relegation_count',(select count(*) from base where competition_class='world' and division_rank>total_teams-4),
    'continental_direct_champions',(select count(*) from base where competition_class='continental' and division_rank=1),
    'continental_playoff_pool_size',(select count(*) from playoff),
    'continental_playoff_promoted',(select count(*) from playoff where playoff_rank<=2),
    'regional_champions',(select count(*) from base where competition_class='regional' and division_rank=1),
    'playoff',coalesce((
      select jsonb_agg(jsonb_build_object(
        'academy_id',academy_id,
        'division_code',division_code,
        'division_rank',division_rank,
        'points',points,
        'playoff_rank',playoff_rank,
        'promoted',playoff_rank<=2
      ) order by playoff_rank)
      from playoff
    ),'[]'::jsonb)
  );
$function$;
