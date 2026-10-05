
create or replace function public.format_game_date_season_v1(
  p_date date,
  p_season integer default null
)
returns text
language sql
stable
set search_path=public,pg_temp
as $function$
  select case
    when p_date is null then '—'
    else to_char(p_date,'DD Mon')||' · Season '||coalesce(p_season,public.get_current_season_number(),1)
  end;
$function$;

create or replace function private.youth_regional_ai_target_v1(p_division_code text)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case upper(coalesce(p_division_code,''))
    when 'YOUTH_EUROPE_WEST' then 5
    when 'YOUTH_EUROPE_EAST' then 5
    when 'YOUTH_AMERICAS' then 4
    when 'YOUTH_ASIA' then 4
    when 'YOUTH_AFRICA' then 3
    when 'YOUTH_OCEANIA' then 2
    else 2
  end;
$function$;

create or replace function private.youth_regional_feed_count_v1(p_continental_division text)
returns integer
language sql
immutable
set search_path=public,private,pg_temp
as $function$
  select count(*)::integer
  from (values
    ('YOUTH_AFRICA'),('YOUTH_AMERICAS'),('YOUTH_ASIA'),
    ('YOUTH_EUROPE_EAST'),('YOUTH_EUROPE_WEST'),('YOUTH_OCEANIA')
  ) d(division_code)
  where private.youth_continental_division_for_regional_v1(d.division_code)=p_continental_division;
$function$;

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
        E'\n' order by en.rider_name_snapshot
      ) rider_lines,
      jsonb_agg(jsonb_build_object(
        'rider_id',en.rider_id,
        'rider_name',en.rider_name_snapshot,
        'entry_path',en.entry_path,
        'heat_number',en.heat_number,
        'qualification_date',h.qualification_date,
        'qualifying_places',h.qualifying_places
      ) order by en.rider_name_snapshot) riders
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
    update public.user_notifications un
    set deleted_at=coalesce(un.deleted_at,now())
    from public.notifications n
    where un.notification_id=n.id
      and un.user_id=x.owner_user_id
      and n.payload_json->>'edition_id'=e.id::text
      and n.payload_json ? 'rider_id'
      and n.title ilike '%selected for National Championship%';

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

create or replace function public.rebalance_youth_competition_memberships_v2(
  p_season integer default null,
  p_preserve_world boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  wc integer;
  d text;
begin
  perform public.seed_ai_youth_academies_for_season_v1(s);
  select count(*)::integer into wc
  from public.youth_academy_competition_memberships
  where season_number=s and competition_class='world';

  if not p_preserve_world or wc<>16 then
    delete from public.youth_academy_competition_memberships where season_number=s;
    with q as (
      select a.id,row_number() over(
        order by case when a.is_ai then 1 else 0 end,
                 private.youth_academy_strength_v1(a.id) desc,a.id
      )::integer rn
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and c.deleted_at is null
    )
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select s,id,'world','WORLD',rn,jsonb_build_object('assignment','world_fixed_16')
    from q where rn<=16;
  else
    delete from public.youth_academy_competition_memberships
    where season_number=s and competition_class<>'world';
  end if;

  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    with cands as (
      select a.id academy_id,a.is_ai,private.youth_academy_strength_v1(a.id) strength,
        row_number() over(
          order by case when a.is_ai then 1 else 0 end,
                   private.youth_academy_strength_v1(a.id) desc,a.id
        )::integer rn
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and c.deleted_at is null
        and private.youth_continental_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
    )
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select s,academy_id,'continental',d,rn,
      jsonb_build_object('assignment','continental_exact_20')
    from cands where rn<=20;
  end loop;

  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,metadata
  )
  select s,a.id,'regional',private.youth_regional_division_for_country_v1(c.country_code),
    jsonb_build_object('assignment','regional_user_pool')
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.is_active and not a.is_ai and c.deleted_at is null
    and not exists(
      select 1 from public.youth_academy_competition_memberships m
      where m.season_number=s and m.academy_id=a.id
    );

  with cands as (
    select a.id academy_id,
      private.youth_regional_division_for_country_v1(c.country_code) division_code,
      row_number() over(
        partition by private.youth_regional_division_for_country_v1(c.country_code)
        order by private.youth_academy_strength_v1(a.id) desc,a.id
      )::integer rn
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active and a.is_ai and c.deleted_at is null
      and not exists(
        select 1 from public.youth_academy_competition_memberships m
        where m.season_number=s and m.academy_id=a.id
      )
  )
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select s,academy_id,'regional',division_code,rn,
    jsonb_build_object('assignment','regional_ai_limited')
  from cands
  where rn<=private.youth_regional_ai_target_v1(division_code);

  return jsonb_build_object(
    'season_number',s,
    'world',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='world'),
    'continental_west',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_WEST'),
    'continental_east',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_EAST'),
    'regional',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='regional')
  );
end;
$function$;

create or replace function public.ensure_youth_competition_memberships_v1(p_season integer default null)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  x record;
  d text;
  need integer;
begin
  if not exists(select 1 from public.youth_academy_competition_memberships where season_number=s) then
    return public.rebalance_youth_competition_memberships_v2(s,false);
  end if;

  -- New USER Academies: Continental vacancy first, otherwise Regional.
  for x in
    select a.id,c.country_code
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active and not a.is_ai and c.deleted_at is null
      and not exists(
        select 1 from public.youth_academy_competition_memberships m
        where m.season_number=s and m.academy_id=a.id
      )
    order by a.activated_season,a.created_at,a.id
  loop
    d:=private.youth_continental_division_for_country_v1(x.country_code);
    if (select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code=d)<20 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      ) values(s,x.id,'continental',d,jsonb_build_object('assignment','midseason_user_continental_vacancy'));
    else
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      ) values(s,x.id,'regional',private.youth_regional_division_for_country_v1(x.country_code),
               jsonb_build_object('assignment','midseason_user_regional'));
    end if;
  end loop;

  -- Repair Continental groups to exactly 20 with unassigned AI if required.
  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    need:=20-(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code=d);
    if need>0 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      )
      select s,a.id,'continental',d,jsonb_build_object('assignment','continental_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_continental_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
      order by private.youth_academy_strength_v1(a.id) desc,a.id
      limit need;
    end if;
  end loop;

  -- Repair Regional AI depth only to the configured 2-5 per division.
  foreach d in array array[
    'YOUTH_AFRICA','YOUTH_AMERICAS','YOUTH_ASIA',
    'YOUTH_EUROPE_EAST','YOUTH_EUROPE_WEST','YOUTH_OCEANIA'
  ] loop
    need:=private.youth_regional_ai_target_v1(d)-(
      select count(*)
      from public.youth_academy_competition_memberships m
      join public.youth_academies a on a.id=m.academy_id
      where m.season_number=s and m.competition_class='regional'
        and m.division_code=d and a.is_ai
    );
    if need>0 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      )
      select s,a.id,'regional',d,jsonb_build_object('assignment','regional_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_regional_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
      order by private.youth_academy_strength_v1(a.id) desc,a.id
      limit need;
    end if;
  end loop;

  return jsonb_build_object(
    'season_number',s,
    'world',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='world'),
    'continental_west',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_WEST'),
    'continental_east',(select count(*) from public.youth_academy_competition_memberships where season_number=s and division_code='CONTINENTAL_EAST'),
    'regional',(select count(*) from public.youth_academy_competition_memberships where season_number=s and competition_class='regional')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.assign_youth_target_memberships_v2(p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  d text;
begin
  delete from public.youth_academy_competition_memberships
  where season_number=p_target_season;

  create temporary table if not exists pg_temp.youth_transition_standings_v2(
    academy_id uuid primary key,
    competition_class text,
    division_code text,
    points bigint,
    division_rank integer,
    total_teams integer
  ) on commit drop;
  truncate pg_temp.youth_transition_standings_v2;

  insert into pg_temp.youth_transition_standings_v2
  with pts as (
    select p.academy_id,
      sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points
    from public.youth_race_team_prizes p
    join public.youth_races r on r.id=p.race_id
    where r.season_number=p_source_season
    group by p.academy_id
  ), base as (
    select m.academy_id,m.competition_class,m.division_code,coalesce(pts.points,0)::bigint points,
      row_number() over(
        partition by m.competition_class,m.division_code
        order by coalesce(pts.points,0) desc,
                 private.youth_academy_strength_v1(m.academy_id) desc,
                 m.academy_id
      )::integer division_rank,
      count(*) over(partition by m.competition_class,m.division_code)::integer total_teams
    from public.youth_academy_competition_memberships m
    join public.youth_academies a on a.id=m.academy_id and a.is_active
    left join pts on pts.academy_id=m.academy_id
    where m.season_number=p_source_season
  )
  select * from base;

  -- World: top 12 survive.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select p_target_season,academy_id,'world','WORLD',division_rank,
    jsonb_build_object('transition','world_survivor')
  from pg_temp.youth_transition_standings_v2
  where competition_class='world' and division_rank<=12
  order by division_rank;

  -- Continental group winners promote directly.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select p_target_season,academy_id,'world','WORLD',null,
    jsonb_build_object('transition','continental_winner','source_division',division_code)
  from pg_temp.youth_transition_standings_v2
  where competition_class='continental' and division_rank=1;

  -- Ranks 2-3 from West and East form the four-team playoff; top two by points promote.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select p_target_season,x.academy_id,'world','WORLD',null,
    jsonb_build_object('transition','continental_playoff','playoff_rank',x.playoff_rank)
  from (
    select s.*,
      row_number() over(
        order by s.points desc,
                 private.youth_academy_strength_v1(s.academy_id) desc,
                 s.academy_id
      )::integer playoff_rank
    from pg_temp.youth_transition_standings_v2 s
    where s.competition_class='continental' and s.division_rank between 2 and 3
  ) x
  where x.playoff_rank<=2;

  -- Build each exact 20-team Continental group. Priority:
  -- World relegations -> six Regional winners -> best retained Continental teams
  -- -> other Regional/new teams. This automatically adjusts the number relegated
  -- from each Continental side while keeping geography and exact size.
  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    with candidates as (
      select
        a.id academy_id,
        c.country_code,
        s.competition_class source_class,
        s.division_code source_division,
        s.division_rank,
        coalesce(s.points,0) points,
        case
          when s.competition_class='world' and s.division_rank>s.total_teams-4 then 1
          when s.competition_class='regional' and s.division_rank=1 then 2
          when s.competition_class='continental' and s.division_code=d then 3
          else 4
        end priority
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      left join pg_temp.youth_transition_standings_v2 s on s.academy_id=a.id
      where a.is_active and c.deleted_at is null
        and private.youth_continental_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1 from public.youth_academy_competition_memberships tm
          where tm.season_number=p_target_season
            and tm.academy_id=a.id
            and tm.competition_class='world'
        )
    ), ranked as (
      select c.*,
        row_number() over(
          order by priority,
            case when priority=3 then coalesce(division_rank,9999) else 9999 end,
            points desc,
            private.youth_academy_strength_v1(academy_id) desc,
            academy_id
        )::integer rn
      from candidates c
    )
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,seed_rank,metadata
    )
    select p_target_season,academy_id,'continental',d,rn,
      jsonb_build_object(
        'transition','continental_exact_20',
        'source_class',source_class,
        'source_division',source_division,
        'priority',priority
      )
    from ranked
    where rn<=20
    on conflict(season_number,academy_id) do nothing;
  end loop;

  -- Every unassigned USER Academy remains eligible in its Regional geography.
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,metadata
  )
  select p_target_season,a.id,'regional',
    private.youth_regional_division_for_country_v1(c.country_code),
    jsonb_build_object('transition','regional_user_geographic_pool')
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where a.is_active and not a.is_ai and c.deleted_at is null
    and not exists(
      select 1 from public.youth_academy_competition_memberships tm
      where tm.season_number=p_target_season and tm.academy_id=a.id
    );

  -- AI Regional depth is intentionally small: 2-5 AI Academies per division.
  with candidates as (
    select a.id academy_id,
      private.youth_regional_division_for_country_v1(c.country_code) division_code,
      row_number() over(
        partition by private.youth_regional_division_for_country_v1(c.country_code)
        order by private.youth_academy_strength_v1(a.id) desc,a.id
      )::integer rn
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active and a.is_ai and c.deleted_at is null
      and not exists(
        select 1 from public.youth_academy_competition_memberships tm
        where tm.season_number=p_target_season and tm.academy_id=a.id
      )
  )
  insert into public.youth_academy_competition_memberships(
    season_number,academy_id,competition_class,division_code,seed_rank,metadata
  )
  select p_target_season,c.academy_id,'regional',c.division_code,c.rn,
    jsonb_build_object('transition','regional_ai_limited_pool')
  from candidates c
  where c.rn<=private.youth_regional_ai_target_v1(c.division_code);

  return jsonb_build_object(
    'world',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and competition_class='world'),
    'continental_west',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and division_code='CONTINENTAL_WEST'),
    'continental_east',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and division_code='CONTINENTAL_EAST'),
    'regional',(select count(*) from public.youth_academy_competition_memberships where season_number=p_target_season and competition_class='regional')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_rankings_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  uid uuid:=auth.uid();
  aid uuid;
  v_region_code text;
  s integer:=coalesce(public.get_current_season_number(),1);
  membership public.youth_academy_competition_memberships%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select a.id,private.youth_regional_division_for_country_v1(c.country_code)
  into aid,v_region_code
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=uid and c.deleted_at is null and a.is_active
  limit 1;

  if aid is null then return jsonb_build_object('activated',false); end if;

  perform public.ensure_youth_competition_memberships_v1(s);

  select * into membership
  from public.youth_academy_competition_memberships
  where season_number=s and academy_id=aid;

  return jsonb_build_object(
    'activated',true,
    'season_number',s,
    'region_code',v_region_code,
    'my_membership',jsonb_build_object(
      'competition_class',membership.competition_class,
      'division_code',membership.division_code
    ),
    'rules',jsonb_build_object(
      'world_size',16,
      'world_relegated',4,
      'continental_size_each',20,
      'continental_direct_promotion','Winner of Continental West and winner of Continental East',
      'continental_playoff','2nd and 3rd from Continental West and East form a four-team playoff table; the best two are promoted to World Class.',
      'regional_promotion','Winner of each of the six Regional divisions is promoted to its mapped Continental group.',
      'regional_feed_west',jsonb_build_array('YOUTH_EUROPE_WEST','YOUTH_AMERICAS','YOUTH_AFRICA','YOUTH_OCEANIA'),
      'regional_feed_east',jsonb_build_array('YOUTH_EUROPE_EAST','YOUTH_ASIA'),
      'continental_balance','Continental West and East are rebalanced to exactly 20 teams at season transition. Relegated teams return to their proper Regional geography.'
    ),
    'academy_divisions',(
      with race_points as (
        select
          p.academy_id,
          sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points,
          count(*)::integer starts,
          count(*) filter(where p.team_position=1)::integer wins,
          count(*) filter(where p.team_position<=3)::integer podiums
        from public.youth_race_team_prizes p
        join public.youth_races r on r.id=p.race_id
        where r.season_number=s
        group by p.academy_id
      ),
      standing_rows as (
        select
          m.competition_class,m.division_code,m.academy_id,
          c.id club_id,c.name academy_name,c.logo_path,c.country_code,
          coalesce(p.points,0)::bigint points,
          coalesce(p.starts,0)::integer starts,
          coalesce(p.wins,0)::integer wins,
          coalesce(p.podiums,0)::integer podiums,
          row_number() over(
            partition by m.competition_class,m.division_code
            order by coalesce(p.points,0) desc,
                     private.youth_academy_strength_v1(m.academy_id) desc,
                     lower(c.name),m.academy_id
          )::integer rank_no,
          count(*) over(partition by m.competition_class,m.division_code)::integer total_teams
        from public.youth_academy_competition_memberships m
        join public.youth_academies a on a.id=m.academy_id and a.is_active
        join public.clubs c on c.id=a.club_id
        left join race_points p on p.academy_id=m.academy_id
        where m.season_number=s
      ),
      divisions as (
        select
          x.competition_class,x.division_code,
          min(case
            when x.competition_class='world' then 1
            when x.competition_class='continental' and x.division_code='CONTINENTAL_WEST' then 2
            when x.competition_class='continental' then 3
            else 10
          end) sort_order,
          jsonb_agg(jsonb_build_object(
            'rank',x.rank_no,
            'academy_id',x.academy_id,
            'club_id',x.club_id,
            'academy_name',x.academy_name,
            'logo_path',x.logo_path,
            'country_code',x.country_code,
            'points',x.points,
            'starts',x.starts,
            'wins',x.wins,
            'podiums',x.podiums,
            'total_teams',x.total_teams,
            'is_mine',x.academy_id=aid,
            'promotion_zone',case
              when x.competition_class='continental' and x.rank_no=1 then true
              when x.competition_class='regional' and x.rank_no=1 then true
              else false
            end,
            'playoff_zone',x.competition_class='continental' and x.rank_no between 2 and 3,
            'relegation_zone',case
              when x.competition_class='world' and x.rank_no>x.total_teams-4 then true
              when x.competition_class='continental'
                and x.rank_no>x.total_teams-private.youth_regional_feed_count_v1(x.division_code)
                then true
              else false
            end
          ) order by x.rank_no) teams
        from standing_rows x
        group by x.competition_class,x.division_code
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'competition_class',d.competition_class,
        'division_code',d.division_code,
        'teams',d.teams
      ) order by d.sort_order,d.division_code),'[]'::jsonb)
      from divisions d
    ),
    'continental_playoff',(
      with race_points as (
        select p.academy_id,
          sum(private.youth_team_ranking_points_v1(r.competition_class,p.team_position))::bigint points,
          count(*)::integer starts,
          count(*) filter(where p.team_position=1)::integer wins,
          count(*) filter(where p.team_position<=3)::integer podiums
        from public.youth_race_team_prizes p
        join public.youth_races r on r.id=p.race_id
        where r.season_number=s
        group by p.academy_id
      ),
      base as (
        select m.division_code,m.academy_id,c.id club_id,c.name academy_name,c.logo_path,c.country_code,
          coalesce(p.points,0)::bigint points,coalesce(p.starts,0)::integer starts,
          coalesce(p.wins,0)::integer wins,coalesce(p.podiums,0)::integer podiums,
          row_number() over(partition by m.division_code
            order by coalesce(p.points,0) desc,private.youth_academy_strength_v1(m.academy_id) desc,m.academy_id
          )::integer division_rank
        from public.youth_academy_competition_memberships m
        join public.youth_academies a on a.id=m.academy_id
        join public.clubs c on c.id=a.club_id
        left join race_points p on p.academy_id=m.academy_id
        where m.season_number=s and m.competition_class='continental'
      ),
      playoff as (
        select b.*,
          row_number() over(order by b.points desc,b.wins desc,b.podiums desc,
            private.youth_academy_strength_v1(b.academy_id) desc,b.academy_id)::integer playoff_rank
        from base b where b.division_rank between 2 and 3
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',p.playoff_rank,'division_rank',p.division_rank,'division_code',p.division_code,
        'academy_id',p.academy_id,'club_id',p.club_id,'academy_name',p.academy_name,
        'logo_path',p.logo_path,'country_code',p.country_code,'points',p.points,
        'starts',p.starts,'wins',p.wins,'podiums',p.podiums,
        'promotion_zone',p.playoff_rank<=2,'is_mine',p.academy_id=aid
      ) order by p.playoff_rank),'[]'::jsonb)
      from playoff p
    ),
    'regional',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.regional_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        join public.youth_academies ya on ya.id=yr.academy_id
        join public.clubs yc on yc.id=ya.club_id
        where r.season_number=s
          and private.youth_regional_division_for_country_v1(yc.country_code)=v_region_code
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ), ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,'is_mine',x.academy_id=aid
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    ),
    'world',(
      with totals as (
        select yr.id,yr.display_name,yr.country_code,yr.academy_id,
          sum(rr.ranking_points)::bigint points,
          count(*) filter(where rr.result_status='finished')::integer starts
        from public.youth_riders yr
        join public.youth_race_results rr on rr.youth_rider_id=yr.id
        join public.youth_races r on r.id=rr.race_id
        where r.season_number=s
        group by yr.id,yr.display_name,yr.country_code,yr.academy_id
      ), ranked as (
        select t.*,dense_rank() over(order by points desc,id)::integer rank_no from totals t
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'rank',x.rank_no,'rider_id',x.id,'rider_name',x.display_name,
        'country_code',x.country_code,'academy_id',x.academy_id,
        'academy_name',c.name,'points',x.points,'starts',x.starts,'is_mine',x.academy_id=aid
      ) order by x.rank_no),'[]'::jsonb)
      from (select * from ranked order by rank_no limit 100) x
      join public.youth_academies a on a.id=x.academy_id
      join public.clubs c on c.id=a.club_id
    )
  );
end;
$function$;

select public.rebalance_youth_competition_memberships_v2(public.get_current_season_number(),true);

do $block$
declare x record;
begin
  for x in
    select distinct e.id
    from public.national_championship_editions e
    join public.national_championship_entries en on en.edition_id=e.id
    where en.participation_decision='pending'
  loop
    perform public.national_championship_notify_selection_v1(x.id);
  end loop;
end;
$block$;

