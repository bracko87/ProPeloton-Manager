create or replace function public.national_championship_notify_selection_v1(p_edition_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  e public.national_championship_editions%rowtype;
  x record;
  v_count integer:=0;
  v_country_name text;
  v_season integer;
  v_message text;
begin
  select * into e from public.national_championship_editions where id=p_edition_id;
  if e.id is null then return 0; end if;

  v_season:=coalesce(e.season_number,public.get_current_season_number(),1);

  select coalesce(c.name,e.country_code) into v_country_name
  from public.countries c where upper(c.code)=upper(e.country_code) limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      root.owner_user_id,
      count(*)::integer rider_count,
      string_agg(
        en.rider_name_snapshot||' — '||
        case
          when en.entry_path='qualification' then
            'Qualification Group '||coalesce(en.heat_number,1)||
            ', '||public.format_game_date_season_v1(h.qualification_date,v_season)||
            ', top '||coalesce(h.qualifying_places,0)||' advance'
          else
            'Direct Final, '||public.format_game_date_season_v1(e.final_date,v_season)
        end,
        E'\n' order by en.rider_name_snapshot,en.id
      ) rider_lines,
      jsonb_agg(jsonb_build_object(
        'rider_id',en.rider_id,
        'rider_name',en.rider_name_snapshot,
        'entry_path',en.entry_path,
        'heat_number',en.heat_number,
        'qualification_date',h.qualification_date,
        'qualifying_places',h.qualifying_places
      ) order by en.rider_name_snapshot,en.id) riders
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case
      when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
      else rc.id
    end
    where en.edition_id=e.id
      and en.participation_decision='pending'
      and root.owner_user_id is not null
    group by root.owner_user_id
  loop
    -- Remove every old rider-by-rider selection notification for this owner.
    -- Some legacy rows predate edition_id in the payload, so filter by the
    -- canonical type code as well as the older title/payload shape.
    update public.user_notifications un
    set deleted_at=coalesce(un.deleted_at,now())
    from public.notifications n
    where un.notification_id=n.id
      and un.user_id=x.owner_user_id
      and n.payload_json ? 'rider_id'
      and (
        coalesce(n.payload_json->>'type_code','')='CHAMPIONSHIP_PARTICIPATION_REQUIRED'
        or n.title ilike '%selected for National Championship%'
        or n.title ilike '%participation decision required%'
        or n.title ilike '%odluka o učešću na prvenstvu%'
      );

    v_message:=
      x.rider_count||' rider(s) selected for the '||v_country_name||
      ' National Championship · Season '||v_season||'. '||
      'Decision deadline: '||public.format_game_date_season_v1(e.participation_decision_deadline,v_season)||'. '||
      'Final: '||public.format_game_date_season_v1(e.final_date,v_season)||'.'||E'\n\n'||
      x.rider_lines||E'\n\n'||
      'Approve or refuse each rider from the National Championships duty page. '||
      'Approved riders are locked from one game day before through one game day after their Championship event.';

    perform public.ppm_create_user_notification_direct_v1(
      x.owner_user_id,
      'NATIONAL_CHAMPIONSHIP_SELECTED',
      x.rider_count||' riders selected for National Championship',
      v_message,
      '/dashboard/national-ranking?tab=duty',
      jsonb_build_object(
        'edition_id',e.id,
        'season_number',v_season,
        'country_code',e.country_code,
        'country_name',v_country_name,
        'rider_count',x.rider_count,
        'riders',x.riders,
        'final_date',e.final_date,
        'participation_decision_deadline',e.participation_decision_deadline,
        'action_path','/dashboard/national-ranking?tab=duty',
        'image_url','https://okuravitxocyevkexfgi.supabase.co/storage/v1/object/public/Admin%20Staff/Event%20images/National%20Road%20Championsjip.png'
      ),
      'national-championship-selection-group:'||e.id::text||':'||x.owner_user_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

create or replace function private.assign_youth_target_memberships_v2(
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
  delete from public.youth_academy_competition_memberships
  where season_number=p_target_season;

  create temporary table if not exists pg_temp.youth_transition_standings_v3(
    academy_id uuid primary key,
    competition_class text,
    division_code text,
    points bigint,
    division_rank integer,
    total_teams integer
  ) on commit drop;
  truncate pg_temp.youth_transition_standings_v3;

  insert into pg_temp.youth_transition_standings_v3
  with pts as (
    select p.academy_id,
      sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points
    from public.youth_race_team_prizes p
    join public.youth_races r on r.id=p.race_id
    where r.season_number=p_source_season
    group by p.academy_id
  ), base as (
    select
      m.academy_id,m.competition_class,m.division_code,
      coalesce(pts.points,0)::bigint points,
      row_number() over(
        partition by m.competition_class,m.division_code
        order by coalesce(pts.points,0) desc,
                 private.youth_academy_strength_v1(m.academy_id) desc,
                 m.academy_id
      )::integer division_rank,
      count(*) over(
        partition by m.competition_class,m.division_code
      )::integer total_teams
    from public.youth_academy_competition_memberships m
    join public.youth_academies a on a.id=m.academy_id and a.is_active
    left join pts on pts.academy_id=m.academy_id
    where m.season_number=p_source_season
  )
  select * from base;

  create temporary table if not exists pg_temp.youth_continental_promoted_v3(
    academy_id uuid primary key,
    source_division text not null,
    promotion_type text not null,
    playoff_rank integer
  ) on commit drop;
  truncate pg_temp.youth_continental_promoted_v3;

  -- West and East champions promote directly.
  insert into pg_temp.youth_continental_promoted_v3(
    academy_id,source_division,promotion_type,playoff_rank
  )
  select academy_id,division_code,'direct_champion',null
  from pg_temp.youth_transition_standings_v3
  where competition_class='continental' and division_rank=1;

  -- Only 2nd and 3rd from each Continental group enter the four-team playoff.
  -- The best two by season points promote to World Class.
  insert into pg_temp.youth_continental_promoted_v3(
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
    from pg_temp.youth_transition_standings_v3 s
    where s.competition_class='continental'
      and s.division_rank between 2 and 3
  ) x
  where x.playoff_rank<=2;

  -- World Class always keeps its top 12; bottom four are relegated.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select
    p_target_season,academy_id,'world','WORLD',division_rank,
    jsonb_build_object(
      'transition','world_survivor',
      'source_rank',division_rank
    )
  from pg_temp.youth_transition_standings_v3
  where competition_class='world'
    and division_rank<=greatest(0,total_teams-4)
  order by division_rank;

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
  from pg_temp.youth_continental_promoted_v3 p;

  -- Assign the four World relegations to the Continental vacancies created
  -- by promotions. This preserves exactly 20 teams in West and East while
  -- keeping the Regional exchange count independent and exact.
  create temporary table if not exists pg_temp.youth_world_down_assignment_v3(
    academy_id uuid primary key,
    target_division text not null
  ) on commit drop;
  truncate pg_temp.youth_world_down_assignment_v3;

  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    select count(*)::integer into v_need
    from pg_temp.youth_continental_promoted_v3
    where source_division=d;

    insert into pg_temp.youth_world_down_assignment_v3(academy_id,target_division)
    select s.academy_id,d
    from pg_temp.youth_transition_standings_v3 s
    join public.youth_academies a on a.id=s.academy_id
    join public.clubs c on c.id=a.club_id
    where s.competition_class='world'
      and s.division_rank>s.total_teams-4
      and not exists(
        select 1
        from pg_temp.youth_world_down_assignment_v3 wa
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
    from pg_temp.youth_world_down_assignment_v3
    where target_division=d;

    -- World relegations fill the vacancies created by World promotions.
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      p_target_season,wa.academy_id,'continental',d,null,
      jsonb_build_object(
        'transition','world_relegated',
        'target_division',d
      )
    from pg_temp.youth_world_down_assignment_v3 wa
    where wa.target_division=d
    on conflict(season_number,academy_id) do nothing;

    -- Only Regional champions promote, one champion per feeder division.
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select
      p_target_season,s.academy_id,'continental',d,null,
      jsonb_build_object(
        'transition','regional_champion',
        'source_division',s.division_code
      )
    from pg_temp.youth_transition_standings_v3 s
    where s.competition_class='regional'
      and s.division_rank=1
      and private.youth_continental_division_for_regional_v1(s.division_code)=d
    on conflict(season_number,academy_id) do nothing;

    -- Exactly the bottom N Continental teams are relegated, where N is the
    -- number of Regional divisions feeding this Continental group.
    -- The remaining best Continental teams stay so the group returns to 20.
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
    from pg_temp.youth_transition_standings_v3 s
    where s.competition_class='continental'
      and s.division_code=d
      and not exists(
        select 1
        from pg_temp.youth_continental_promoted_v3 p
        where p.academy_id=s.academy_id
      )
    order by s.division_rank
    limit v_keep_continental
    on conflict(season_number,academy_id) do nothing;
  end loop;

  -- Every unassigned USER Academy goes to its proper Regional geography.
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

  -- Regional AI depth is deliberately tiny: exactly the configured 2-5 AI
  -- Academies per Regional division, never the old large AI pools.
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

  return jsonb_build_object(
    'world',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and competition_class='world'),
    'continental_west',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and division_code='CONTINENTAL_WEST'),
    'continental_east',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and division_code='CONTINENTAL_EAST'),
    'regional',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and competition_class='regional'),
    'world_relegated',4,
    'continental_playoff_teams',4,
    'continental_playoff_promoted',2,
    'west_regional_relegation_slots',private.youth_regional_feed_count_v1('CONTINENTAL_WEST'),
    'east_regional_relegation_slots',private.youth_regional_feed_count_v1('CONTINENTAL_EAST')
  );
end;
$function$;

-- Hide legacy rider-by-rider National Championship selection notifications.
update public.user_notifications un
set deleted_at=coalesce(un.deleted_at,now())
from public.notifications n
where un.notification_id=n.id
  and un.deleted_at is null
  and n.payload_json ? 'rider_id'
  and coalesce(n.payload_json->>'type_code','')='CHAMPIONSHIP_PARTICIPATION_REQUIRED';

-- Refresh grouped notifications for every current-season edition that already
-- has pending human-owned entries.
do $block$
declare x record;
begin
  for x in
    select distinct e.id
    from public.national_championship_editions e
    join public.national_championship_entries en on en.edition_id=e.id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case
      when rc.club_type='developing' and rc.parent_club_id is not null then rc.parent_club_id
      else rc.id
    end
    where e.season_number=public.get_current_season_number()
      and en.participation_decision='pending'
      and root.owner_user_id is not null
  loop
    perform public.national_championship_notify_selection_v1(x.id);
  end loop;
end;
$block$;
