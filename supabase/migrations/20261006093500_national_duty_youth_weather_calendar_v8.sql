-- National Duty cleanup + Youth Academy weather calendar/application model v8
-- 1) National Championship selection notices become date + rider + group only.
-- 2) New human Youth Academies always start in their senior-market Regional division.
-- 3) Youth race fields use 16 minimum / 20 maximum.
-- 4) Manager applications open 150 days ahead and resolve 7 days before the race.
-- 5) Future Youth calendar is rebuilt from climate normals (>=15 C expected max),
--    with the highest race density in June-August.

drop trigger if exists youth_regional_race_cap_v1 on public.youth_races;
drop function if exists private.enforce_youth_regional_race_cap_v1();

create or replace function private.youth_race_target_teams_v1(
  p_competition_class text,
  p_team_limit integer
)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select 16;
$function$;

create or replace function private.youth_race_weather_eligible_v8(
  p_country_code text,
  p_start_date date,
  p_end_date date
)
returns boolean
language sql
stable
set search_path=public,pg_temp
as $function$
  select coalesce(bool_and(coalesce(n.avg_max_temp_c,-999) >= 15),false)
  from generate_series(
    p_start_date,
    greatest(p_start_date,coalesce(p_end_date,p_start_date)),
    interval '1 day'
  ) d
  left join public.country_weather_weekly_normals n
    on upper(n.country_code)=upper(p_country_code)
   and n.week_of_year=extract(week from d)::integer;
$function$;

create or replace function private.youth_calendar_month_quota_v8(
  p_competition_class text,
  p_month integer
)
returns integer
language sql
immutable
set search_path=pg_temp
as $function$
  select case lower(coalesce(p_competition_class,'regional'))
    when 'regional' then case p_month
      when 1 then 1 when 2 then 1 when 3 then 1 when 4 then 2
      when 5 then 3 when 6 then 4 when 7 then 4 when 8 then 4
      when 9 then 3 when 10 then 2 when 11 then 1 when 12 then 1
      else 0 end
    when 'continental' then case p_month
      when 1 then 2 when 2 then 2 when 3 then 2 when 4 then 3
      when 5 then 4 when 6 then 5 when 7 then 5 when 8 then 5
      when 9 then 4 when 10 then 3 when 11 then 2 when 12 then 2
      else 0 end
    else case p_month
      when 1 then 2 when 2 then 2 when 3 then 2 when 4 then 3
      when 5 then 4 when 6 then 5 when 7 then 5 when 8 then 5
      when 9 then 4 when 10 then 3 when 11 then 2 when 12 then 2
      else 0 end
  end;
$function$;

create or replace function private.apply_youth_weather_calendar_v8(
  p_season integer,
  p_from_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_from date:=coalesce(
    p_from_date,
    public.game_date_from_parts(p_season,1,1)-1
  );
  v_selected integer:=0;
begin
  update public.youth_races
  set status='cancelled',updated_at=now()
  where season_number=p_season
    and race_date>v_from;

  with base as (
    select
      r.id,
      extract(month from r.race_date)::integer month_no,
      r.competition_class,
      case
        when r.competition_class='world' then 'WORLD'
        when r.competition_class='continental'
          then private.youth_continental_division_for_country_v1(r.host_country_code)
        else private.youth_regional_division_for_country_v1(r.host_country_code)
      end target_division,
      lower(coalesce(r.host_city,'')) host_key,
      r.race_date
    from public.youth_races r
    where r.season_number=p_season
      and r.race_date>v_from
      and r.host_country_code is not null
      and nullif(r.host_city,'') is not null
      and private.youth_race_weather_eligible_v8(
        r.host_country_code,
        r.race_date,
        coalesce(r.race_end_date,r.race_date)
      )
  ), city_unique as (
    select b.*,
      row_number() over(
        partition by b.month_no,b.competition_class,b.target_division,b.host_key
        order by b.race_date,b.id
      ) city_rank
    from base b
    where b.target_division is not null
  ), ranked as (
    select c.*,
      row_number() over(
        partition by c.month_no,c.competition_class,c.target_division
        order by c.race_date,md5(c.id::text)
      ) quota_rank
    from city_unique c
    where c.city_rank=1
  ), chosen as (
    select r.id,r.competition_class,r.target_division
    from ranked r
    where r.quota_rank<=private.youth_calendar_month_quota_v8(
      r.competition_class,r.month_no
    )
  )
  update public.youth_races r
  set
    status='scheduled',
    division_code=case
      when c.competition_class='world' then 'WORLD'
      else c.target_division
    end,
    team_limit=20,
    min_teams=16,
    target_teams=16,
    entry_cost=500,
    invitation_response_deadline=r.race_date-7,
    results_published_at=null,
    updated_at=now()
  from chosen c
  where r.id=c.id;

  get diagnostics v_selected=row_count;

  return jsonb_build_object(
    'season_number',p_season,
    'from_date',v_from,
    'scheduled_races',v_selected,
    'minimum_expected_max_temperature_c',15,
    'minimum_teams',16,
    'maximum_teams',20
  );
end;
$function$;

-- Every newly activated human Academy starts in Regional, never World/Continental.
create or replace function private.assign_new_human_youth_academy_regional_v8()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_country text;
  v_season integer:=coalesce(public.get_current_season_number(),1);
begin
  if new.is_active and not new.is_ai then
    select c.country_code into v_country
    from public.clubs c where c.id=new.club_id;

    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,metadata
    )
    values(
      v_season,new.id,'regional',
      private.youth_regional_division_for_country_v1(v_country),
      jsonb_build_object(
        'assignment','new_human_academy_starts_regional',
        'assigned_at',now()
      )
    )
    on conflict(season_number,academy_id) do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists youth_new_human_regional_v8 on public.youth_academies;
create trigger youth_new_human_regional_v8
after insert or update of is_active
on public.youth_academies
for each row
execute function private.assign_new_human_youth_academy_regional_v8();

create or replace function public.ensure_youth_competition_memberships_v1(
  p_season integer default null
)
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
  if not exists(
    select 1 from public.youth_academy_competition_memberships
    where season_number=s
  ) then
    perform public.rebalance_youth_competition_memberships_v2(s,false);
  end if;

  -- Human Academies without membership ALWAYS start in their Regional division.
  for x in
    select a.id,c.country_code
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    where a.is_active and not a.is_ai and c.deleted_at is null
      and not exists(
        select 1
        from public.youth_academy_competition_memberships m
        where m.season_number=s and m.academy_id=a.id
      )
    order by a.activated_season,a.created_at,a.id
  loop
    insert into public.youth_academy_competition_memberships(
      season_number,academy_id,competition_class,division_code,metadata
    )
    values(
      s,x.id,'regional',
      private.youth_regional_division_for_country_v1(x.country_code),
      jsonb_build_object('assignment','new_human_academy_starts_regional')
    )
    on conflict(season_number,academy_id) do nothing;
  end loop;

  -- Keep Continental groups at 20 using AI only.
  foreach d in array array['CONTINENTAL_WEST','CONTINENTAL_EAST'] loop
    need:=20-(
      select count(*)
      from public.youth_academy_competition_memberships
      where season_number=s and division_code=d
    );
    if need>0 then
      insert into public.youth_academy_competition_memberships(
        season_number,academy_id,competition_class,division_code,metadata
      )
      select
        s,a.id,'continental',d,
        jsonb_build_object('assignment','continental_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_continental_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1
          from public.youth_academy_competition_memberships m
          where m.season_number=s and m.academy_id=a.id
        )
      order by private.youth_academy_strength_v1(a.id) desc,a.id
      limit need;
    end if;
  end loop;

  -- Maintain two AI Academies in every Regional market division.
  foreach d in array array[
    'NORTH_AMERICA','SOUTH_AMERICA','WESTERN_EUROPE','CENTRAL_EUROPE',
    'SOUTHERN_BALKAN_EUROPE','NORTHERN_EASTERN_EUROPE',
    'WEST_NORTH_AFRICA','CENTRAL_SOUTH_AFRICA','WEST_CENTRAL_ASIA',
    'SOUTH_ASIA','EAST_SOUTHEAST_ASIA','OCEANIA'
  ] loop
    need:=2-(
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
      select
        s,a.id,'regional',d,
        jsonb_build_object('assignment','regional_ai_repair')
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_regional_division_for_country_v1(c.country_code)=d
        and not exists(
          select 1
          from public.youth_academy_competition_memberships m
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

-- User opportunity sync: all World/Continental races are selectable; Regional
-- races are selectable inside the Academy's own market division.
create or replace function public.sync_youth_scheduled_race_invitations_v2(
  p_season integer default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  gd date:=public.get_current_game_date_date();
  ins_count integer:=0;
begin
  perform public.ensure_youth_competition_memberships_v1(s);

  update public.youth_races r
  set
    division_code=case
      when r.competition_class='world' then 'WORLD'
      when r.competition_class='continental'
        then private.youth_continental_division_for_country_v1(r.host_country_code)
      else private.youth_regional_division_for_country_v1(r.host_country_code)
    end,
    team_limit=20,
    min_teams=16,
    target_teams=16,
    entry_cost=500,
    invitation_response_deadline=r.race_date-7,
    updated_at=now()
  where r.season_number=s
    and r.status='scheduled'
    and r.race_date>gd;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,
    priority_score,metadata
  )
  select
    r.id,a.id,
    case
      when r.competition_class='regional' then 'regional_local'
      else 'wildcard'
    end,
    'pending',
    gd,
    r.race_date-7,
    1000,
    jsonb_build_object(
      'source','human_open_application_window_v8',
      'application_opens_on',r.race_date-150,
      'application_decision_on',r.race_date-7
    )
  from public.youth_races r
  join public.youth_academies a
    on a.is_active and not a.is_ai
  join public.clubs c
    on c.id=a.club_id and c.deleted_at is null
  where r.season_number=s
    and r.status='scheduled'
    and r.race_date>gd+7
    and r.race_date<=gd+150
    and (
      r.competition_class in ('world','continental')
      or private.youth_regional_division_for_country_v1(c.country_code)=r.division_code
    )
  on conflict(race_id,academy_id) do nothing;
  get diagnostics ins_count=row_count;

  return jsonb_build_object(
    'season_number',s,
    'invitations_added',ins_count,
    'application_window_days',150,
    'decision_days_before_race',7
  );
end;
$function$;

create or replace function public.enter_my_youth_race_v1(
  p_race_id uuid,
  p_strategy text default 'balanced'
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_country text;
  v_game_date date:=public.get_current_game_date_date();
  v_race public.youth_races%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id,c.country_code
  into v_academy_id,v_country
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then
    raise exception 'Youth Academy is not activated';
  end if;

  select * into v_race
  from public.youth_races
  where id=p_race_id
  for update;

  if v_race.id is null or v_race.status<>'scheduled' then
    raise exception 'Youth race is not open for applications';
  end if;
  if v_race.race_date<=v_game_date+7 then
    raise exception 'Applications close 7 game days before the race';
  end if;
  if v_race.race_date>v_game_date+150 then
    raise exception 'Applications open 150 game days before the race';
  end if;
  if v_race.competition_class='regional'
     and private.youth_regional_division_for_country_v1(v_country)<>v_race.division_code then
    raise exception 'This Regional race belongs to another Youth market division';
  end if;

  if exists(
    select 1 from public.youth_race_entries e
    where e.race_id=p_race_id
      and e.academy_id=v_academy_id
      and e.status in ('entered','completed')
  ) then
    return public.get_my_youth_race_calendar_v1();
  end if;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,
    priority_score,metadata
  )
  values(
    p_race_id,v_academy_id,
    case when v_race.competition_class='regional'
      then 'regional_local' else 'wildcard' end,
    'pending',v_game_date,v_race.race_date-7,2000,
    jsonb_build_object(
      'source','manager_application_v8',
      'manual_manager_application',true,
      'application_submitted_on',v_game_date,
      'application_source','manager',
      'requested_strategy',
        case when p_strategy in ('conservative','balanced','aggressive')
          then p_strategy else 'balanced' end,
      'application_decision_on',v_race.race_date-7
    )
  )
  on conflict(race_id,academy_id) do update
  set
    status='pending',
    invited_on=least(public.youth_race_invitations.invited_on,excluded.invited_on),
    response_deadline=excluded.response_deadline,
    responded_on=null,
    priority_score=greatest(public.youth_race_invitations.priority_score,excluded.priority_score),
    metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)||excluded.metadata,
    updated_at=now();

  if not private.youth_race_academy_qualified_v1(v_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  return public.get_my_youth_race_calendar_v1();
end;
$function$;

create or replace function private.submit_due_youth_staff_applications_v1(
  p_game_date date
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  x record;
  n integer:=0;
begin
  for x in
    select i.race_id,i.academy_id,r.race_date
    from public.youth_race_invitations i
    join public.youth_races r on r.id=i.race_id
    join public.youth_academies a on a.id=i.academy_id
    left join private.youth_effective_settings_v1 s on s.academy_id=a.id
    where not a.is_ai
      and a.is_active
      and r.status='scheduled'
      and r.race_date>p_game_date+7
      and r.race_date<=p_game_date+30
      and i.status='pending'
      and coalesce(s.race_entry_decider,'u16_head_coach')='u16_head_coach'
      and private.youth_race_selected_by_plan_v1(a.id,r.id)
      and not coalesce((i.metadata->>'manual_manager_application')::boolean,false)
      and not coalesce((i.metadata->>'staff_application')::boolean,false)
  loop
    update public.youth_race_invitations
    set
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'staff_application',true,
        'application_submitted_on',p_game_date,
        'application_source','u16_head_coach',
        'application_decision_on',x.race_date-7
      ),
      updated_at=now()
    where race_id=x.race_id and academy_id=x.academy_id;
    n:=n+1;
  end loop;
  return n;
end;
$function$;

-- AI filler may use any active AI Academy as a guest/wildcard. This keeps
-- class memberships small while still guaranteeing healthy race fields.
create or replace function private.fill_youth_race_field_v2(
  p_race_id uuid,
  p_game_date date,
  p_final_fill boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  r public.youth_races%rowtype;
  x record;
  current_count integer:=0;
  e_id uuid;
  requested_strategy text:='balanced';
begin
  select * into r
  from public.youth_races
  where id=p_race_id
  for update;

  if r.id is null or r.status<>'scheduled' or r.race_date<=p_game_date then
    return jsonb_build_object('race_id',p_race_id,'reason','not_open');
  end if;

  select count(*)::integer
  into current_count
  from public.youth_race_entries e
  where e.race_id=r.id
    and e.status in ('entered','completed');

  if current_count>=16 then
    return jsonb_build_object(
      'race_id',r.id,'teams',current_count,'minimum_teams',16,
      'team_limit',20,'minimum_met',true
    );
  end if;

  for x in
    select
      a.id academy_id,
      c.country_code,
      m.competition_class membership_class,
      (
        select count(*)::integer
        from public.youth_race_entries me
        join public.youth_races mr on mr.id=me.race_id
        where me.academy_id=a.id
          and me.status in ('entered','completed')
          and mr.season_number=r.season_number
          and extract(month from mr.race_date)=extract(month from r.race_date)
      ) monthly_starts
    from public.youth_academies a
    join public.clubs c on c.id=a.club_id
    left join public.youth_academy_competition_memberships m
      on m.academy_id=a.id and m.season_number=r.season_number
    where a.is_active
      and a.is_ai
      and c.deleted_at is null
      and not exists(
        select 1
        from public.youth_race_entries e
        where e.race_id=r.id
          and e.academy_id=a.id
          and e.status in ('entered','completed')
      )
      and (
        select count(*)
        from public.youth_riders yr
        where yr.academy_id=a.id
          and yr.status='academy'
          and private.youth_rider_available_for_race_v1(yr.id,r.id)
      )>=3
    order by
      case
        when private.youth_regional_division_for_country_v1(c.country_code)=
             private.youth_regional_division_for_country_v1(r.host_country_code)
        then 0 else 1
      end,
      case
        when private.youth_continental_division_for_country_v1(c.country_code)=
             private.youth_continental_division_for_country_v1(r.host_country_code)
        then 0 else 1
      end,
      case when m.competition_class=r.competition_class then 0 else 1 end,
      monthly_starts,
      private.youth_academy_strength_v1(a.id) desc,
      a.id
  loop
    exit when current_count>=16;

    insert into public.youth_race_invitations(
      race_id,academy_id,invitation_type,status,invited_on,response_deadline,
      priority_score,metadata
    )
    values(
      r.id,x.academy_id,'wildcard','pending',
      p_game_date,r.race_date-7,500,
      jsonb_build_object('source','ai_minimum_field_filler_v8')
    )
    on conflict(race_id,academy_id) do update
    set
      status=case
        when public.youth_race_invitations.status='accepted'
          then 'accepted'
        else 'pending'
      end,
      response_deadline=excluded.response_deadline,
      metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)||excluded.metadata,
      updated_at=now();

    perform private.ensure_youth_monthly_race_plan_v1(
      x.academy_id,r.season_number,extract(month from r.race_date)::integer
    );

    update public.youth_monthly_race_plans p
    set
      world_race_limit=6,
      continental_race_limit=10,
      regional_race_limit=6,
      max_monthly_cost=greatest(p.max_monthly_cost,250000),
      approved=true,
      approved_at=coalesce(p.approved_at,now())
    where p.academy_id=x.academy_id
      and p.season_number=r.season_number
      and p.month_number=extract(month from r.race_date)::integer;

    update public.youth_academy_season_budgets b
    set season_budget=greatest(b.season_budget,2000000),updated_at=now()
    where b.academy_id=x.academy_id
      and b.season_number=r.season_number;

    begin
      e_id:=private.enter_youth_race_v1(
        x.academy_id,r.id,'ai_head_coach',requested_strategy
      );
      if e_id is not null then
        current_count:=current_count+1;
      end if;
    exception when others then
      update public.youth_race_invitations
      set
        metadata=coalesce(metadata,'{}'::jsonb)||
          jsonb_build_object('fill_error',sqlerrm),
        updated_at=now()
      where race_id=r.id and academy_id=x.academy_id;
    end;
  end loop;

  return jsonb_build_object(
    'race_id',r.id,
    'teams',current_count,
    'minimum_teams',16,
    'target_teams',16,
    'team_limit',20,
    'minimum_met',current_count>=16
  );
end;
$function$;

create or replace function private.resolve_due_youth_race_applications_v8(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  r record;
  x record;
  current_count integer;
  accepted_count integer:=0;
  declined_count integer:=0;
  waitlist_count integer:=0;
  entered_by_value text;
  strategy_value text;
begin
  for r in
    select id,race_date,season_number
    from public.youth_races
    where status='scheduled'
      and race_date>p_game_date
      and race_date<=p_game_date+7
    order by race_date,id
  loop
    select count(*)::integer into current_count
    from public.youth_race_entries e
    where e.race_id=r.id and e.status in ('entered','completed');

    for x in
      select
        i.academy_id,
        i.metadata,
        case
          when coalesce((i.metadata->>'manual_manager_application')::boolean,false)
            then 0 else 1
        end manager_priority,
        coalesce(i.metadata->>'application_submitted_on',i.invited_on::text) submitted_on
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      where i.race_id=r.id
        and i.status='pending'
        and not a.is_ai
        and (
          coalesce((i.metadata->>'manual_manager_application')::boolean,false)
          or coalesce((i.metadata->>'staff_application')::boolean,false)
        )
      order by manager_priority,submitted_on,i.academy_id
    loop
      if current_count>=20 then
        update public.youth_race_invitations
        set status='waitlist',responded_on=p_game_date,
            metadata=coalesce(metadata,'{}'::jsonb)||
              jsonb_build_object('decision_reason','race_full','decision_on',p_game_date),
            updated_at=now()
        where race_id=r.id and academy_id=x.academy_id;
        waitlist_count:=waitlist_count+1;
        continue;
      end if;

      entered_by_value:=case
        when coalesce((x.metadata->>'manual_manager_application')::boolean,false)
          then 'manager'
        else 'u16_head_coach'
      end;
      strategy_value:=coalesce(nullif(x.metadata->>'requested_strategy',''),'balanced');

      perform private.ensure_youth_monthly_race_plan_v1(
        x.academy_id,r.season_number,extract(month from r.race_date)::integer
      );

      if entered_by_value='manager' then
        update public.youth_monthly_race_plans p
        set
          approved=true,
          approved_at=coalesce(p.approved_at,now()),
          max_monthly_cost=greatest(p.max_monthly_cost,250000)
        where p.academy_id=x.academy_id
          and p.season_number=r.season_number
          and p.month_number=extract(month from r.race_date)::integer;
      end if;

      begin
        perform private.enter_youth_race_v1(
          x.academy_id,r.id,entered_by_value,strategy_value
        );
        current_count:=current_count+1;
        accepted_count:=accepted_count+1;
        update public.youth_race_invitations
        set
          metadata=coalesce(metadata,'{}'::jsonb)||
            jsonb_build_object('application_decided_on',p_game_date,'application_decision','accepted'),
          updated_at=now()
        where race_id=r.id and academy_id=x.academy_id;
      exception when others then
        update public.youth_race_invitations
        set
          status='declined',
          responded_on=p_game_date,
          metadata=coalesce(metadata,'{}'::jsonb)||
            jsonb_build_object(
              'application_decided_on',p_game_date,
              'application_decision','declined',
              'decline_reason','budget_roster_or_eligibility',
              'decision_error',sqlerrm
            ),
          updated_at=now()
        where race_id=r.id and academy_id=x.academy_id;
        declined_count:=declined_count+1;
      end;
    end loop;

    perform private.fill_youth_race_field_v2(r.id,p_game_date,true);
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'accepted',accepted_count,
    'declined',declined_count,
    'waitlisted',waitlist_count
  );
end;
$function$;

create or replace function public.process_youth_team_allocations_v2(
  p_game_date date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  staff_applications integer:=0;
  decision_result jsonb;
begin
  perform public.sync_youth_scheduled_race_invitations_v2(
    public.get_current_season_number()
  );
  staff_applications:=private.submit_due_youth_staff_applications_v1(gd);
  decision_result:=private.resolve_due_youth_race_applications_v8(gd);
  perform private.fill_due_youth_lineups_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled'
      and race_date>gd
      and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    if x.race_date<=gd+7 then
      perform private.fill_youth_race_field_v2(x.id,gd,true);
      f:=f+1;
    end if;
    n:=n+1;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'application_window_days',150,
    'decision_days_before_race',7,
    'minimum_teams_per_race',16,
    'maximum_teams_per_race',20,
    'staff_applications',staff_applications,
    'application_decisions',decision_result,
    'races_processed',n,
    'minimum_fill_races',f
  );
end;
$function$;

create or replace function public.monitor_youth_competition_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s timestamptz:=clock_timestamp();
  gd date:=public.get_current_game_date_date();
  v_underfilled integer:=0;
  v_cold integer:=0;
  v_missing_runtime integer:=0;
  v_world integer:=0;
  v_west integer:=0;
  v_east integer:=0;
  v_issues integer:=0;
begin
  select count(*) into v_underfilled
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd
    and r.race_date<=gd+7
    and (
      select count(*)
      from public.youth_race_entries e
      where e.race_id=r.id and e.status in ('entered','completed')
    )<16;

  select count(*) into v_cold
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd
    and not private.youth_race_weather_eligible_v8(
      r.host_country_code,r.race_date,coalesce(r.race_end_date,r.race_date)
    );

  select count(*) into v_missing_runtime
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>=gd
    and r.race_date<=gd+14
    and (
      not exists(select 1 from public.youth_race_stages s2 where s2.race_id=r.id)
      or exists(
        select 1 from public.youth_race_stages s2
        where s2.race_id=r.id
          and (
            s2.planned_start_hour_number is null
            or s2.start_city is null
            or s2.finish_city is null
          )
      )
    );

  select count(*) into v_world
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and competition_class='world';
  select count(*) into v_west
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and division_code='CONTINENTAL_WEST';
  select count(*) into v_east
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number()
    and division_code='CONTINENTAL_EAST';

  v_issues:=(case when v_underfilled>0 then 1 else 0 end)
           +(case when v_cold>0 then 1 else 0 end)
           +(case when v_missing_runtime>0 then 1 else 0 end)
           +(case when v_world<>16 then 1 else 0 end)
           +(case when v_west<>20 then 1 else 0 end)
           +(case when v_east<>20 then 1 else 0 end);

  perform public.log_system_business_check_v1(
    'check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    case when v_issues>0
      then format('Youth competition has %s health area(s) requiring attention.',v_issues)
      else 'Youth Academy competition climate, minimum fields and hierarchy are healthy.'
    end,
    jsonb_build_object(
      'below_16_within_7_days',v_underfilled,
      'races_below_15c_climate_rule',v_cold,
      'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,
      'continental_west_teams',v_west,
      'continental_east_teams',v_east
    )
  );

  if v_issues>0 then
    perform public.raise_system_incident_v1(
      'check:youth_competition','high',
      'Youth Academy competition requires attention',
      format(
        'Below 16 teams: %s; cold-weather races: %s; missing runtime: %s; World/West/East sizes: %s/%s/%s.',
        v_underfilled,v_cold,v_missing_runtime,v_world,v_west,v_east
      ),
      'business:youth-competition',
      jsonb_build_object(
        'below_16_within_7_days',v_underfilled,
        'races_below_15c_climate_rule',v_cold,
        'missing_runtime_within_14_days',v_missing_runtime,
        'world_teams',v_world,
        'continental_west_teams',v_west,
        'continental_east_teams',v_east
      )
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:youth-competition',
      'Youth Academy climate, 16-team minimum fields and hierarchy are healthy.'
    );
  end if;

  insert into public.system_monitor_runs(
    process_key,status,started_at,finished_at,duration_ms,summary,details
  )
  values(
    'check:youth_competition',
    case when v_issues>0 then 'warning' else 'success' end,
    s,clock_timestamp(),
    greatest(0,(extract(epoch from(clock_timestamp()-s))*1000)::bigint),
    case when v_issues>0
      then 'Youth Academy competition health has active warnings.'
      else 'Youth Academy competition health is green.'
    end,
    jsonb_build_object(
      'below_16_within_7_days',v_underfilled,
      'races_below_15c_climate_rule',v_cold,
      'missing_runtime_within_14_days',v_missing_runtime,
      'world_teams',v_world,
      'continental_west_teams',v_west,
      'continental_east_teams',v_east
    )
  );

  return jsonb_build_object(
    'status',case when v_issues>0 then 'warning' else 'success' end,
    'below_16_within_7_days',v_underfilled,
    'races_below_15c_climate_rule',v_cold,
    'missing_runtime_within_14_days',v_missing_runtime,
    'world_teams',v_world,
    'continental_west_teams',v_west,
    'continental_east_teams',v_east
  );
end;
$function$;

-- National Championship grouped selection notice: no "top N advance" phrase.
create or replace function public.national_championship_notify_selection_v1(
  p_edition_id uuid
)
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
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;
  if e.id is null then return 0; end if;

  v_season:=coalesce(e.season_number,public.get_current_season_number(),1);

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where upper(c.code)=upper(e.country_code)
  limit 1;
  v_country_name:=coalesce(v_country_name,e.country_code);

  for x in
    select
      root.owner_user_id,
      count(*)::integer rider_count,
      string_agg(
        case
          when en.entry_path='qualification' then
            public.format_game_date_season_v1(h.qualification_date,v_season)||
            ' '||en.rider_name_snapshot||
            ' — Qualification Group '||coalesce(en.heat_number,1)
          else
            public.format_game_date_season_v1(e.final_date,v_season)||
            ' '||en.rider_name_snapshot||' — Direct Final'
        end,
        E'\n'
        order by coalesce(h.qualification_date,e.final_date),
                 coalesce(en.heat_number,999),
                 en.rider_name_snapshot,en.id
      ) rider_lines,
      jsonb_agg(jsonb_build_object(
        'rider_id',en.rider_id,
        'rider_name',en.rider_name_snapshot,
        'entry_path',en.entry_path,
        'heat_number',en.heat_number,
        'qualification_date',h.qualification_date,
        'qualifying_places',h.qualifying_places
      ) order by coalesce(h.qualification_date,e.final_date),
                 coalesce(en.heat_number,999),
                 en.rider_name_snapshot,en.id) riders
    from public.national_championship_entries en
    left join public.national_championship_heats h on h.id=en.heat_id
    join public.clubs rc on rc.id=en.club_id_snapshot
    join public.clubs root on root.id=case
      when rc.club_type='developing' and rc.parent_club_id is not null
        then rc.parent_club_id
      else rc.id
    end
    where en.edition_id=e.id
      and en.participation_decision='pending'
      and root.owner_user_id is not null
    group by root.owner_user_id
  loop
    v_message:=
      x.rider_count||' rider(s) selected for the '||v_country_name||
      ' National Championship · Season '||v_season||'.'||E'\n\n'||
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
      'national-championship-selection-group:'||
        e.id::text||':'||x.owner_user_id::text
    );
    v_count:=v_count+1;
  end loop;

  return v_count;
end;
$function$;

-- Reset every future Youth application/entry because the calendar is being rebuilt.
create temporary table pg_temp.youth_calendar_reset_entries_v8
on commit drop
as
select
  e.id entry_id,
  e.race_id,
  e.academy_id,
  r.season_number,
  greatest(
    coalesce(nullif(e.total_participation_cost,0),e.entry_cost,0),
    0
  )::bigint refund_amount
from public.youth_race_entries e
join public.youth_races r on r.id=e.race_id
where r.season_number=public.get_current_season_number()
  and r.race_date>public.get_current_game_date_date()
  and e.status='entered';

delete from public.youth_race_lineups l
using pg_temp.youth_calendar_reset_entries_v8 x
where l.entry_id=x.entry_id;

with refunds as (
  select academy_id,season_number,sum(refund_amount)::bigint refund_amount
  from pg_temp.youth_calendar_reset_entries_v8
  group by academy_id,season_number
)
update public.youth_academy_season_budgets b
set
  spent_amount=greatest(0,b.spent_amount-r.refund_amount),
  updated_at=now()
from refunds r
where b.academy_id=r.academy_id
  and b.season_number=r.season_number;

insert into public.youth_academy_ledger(
  academy_id,season_number,game_date,category,description,amount,metadata
)
select
  x.academy_id,x.season_number,public.get_current_game_date_date(),
  'race_withdrawal_refund',
  'Youth calendar rebuild refund',
  x.refund_amount,
  jsonb_build_object(
    'race_id',x.race_id,
    'entry_id',x.entry_id,
    'reason','weather_calendar_rebuild_v8'
  )
from pg_temp.youth_calendar_reset_entries_v8 x
where x.refund_amount>0;

update public.youth_race_entries e
set status='withdrawn',updated_at=now()
from pg_temp.youth_calendar_reset_entries_v8 x
where e.id=x.entry_id;

delete from public.youth_race_invitations i
using public.youth_races r
where r.id=i.race_id
  and r.season_number=public.get_current_season_number()
  and r.race_date>public.get_current_game_date_date();

delete from public.youth_race_stages s
using public.youth_races r
where r.id=s.race_id
  and r.season_number=public.get_current_season_number()
  and r.race_date>public.get_current_game_date_date();

delete from public.youth_race_processing_log l
using public.youth_races r
where r.id=l.race_id
  and r.season_number=public.get_current_season_number()
  and r.race_date>public.get_current_game_date_date();

select private.apply_youth_weather_calendar_v8(
  public.get_current_season_number(),
  public.get_current_game_date_date()
);

select public.sync_youth_scheduled_race_invitations_v2(
  public.get_current_season_number()
);

select public.process_youth_team_allocations_v2(
  public.get_current_game_date_date()
);

-- Rewrite existing grouped selection messages immediately.
with rebuilt as (
  select
    n.id,
    coalesce(
      (n.payload_json->>'rider_count')::integer,
      jsonb_array_length(coalesce(n.payload_json->'riders','[]'::jsonb))
    ) rider_count,
    coalesce(
      n.payload_json->>'country_name',
      n.payload_json->>'country_code',
      'National'
    ) country_name,
    coalesce(
      (n.payload_json->>'season_number')::integer,
      public.get_current_season_number(),
      1
    ) season_number,
    (
      select string_agg(
        case
          when coalesce(r->>'entry_path','')='qualification' then
            public.format_game_date_season_v1(
              (r->>'qualification_date')::date,
              coalesce((n.payload_json->>'season_number')::integer,1)
            )||
            ' '||coalesce(r->>'rider_name','Rider')||
            ' — Qualification Group '||coalesce((r->>'heat_number')::integer,1)
          else
            public.format_game_date_season_v1(
              (n.payload_json->>'final_date')::date,
              coalesce((n.payload_json->>'season_number')::integer,1)
            )||
            ' '||coalesce(r->>'rider_name','Rider')||' — Direct Final'
        end,
        E'\n'
        order by
          case
            when coalesce(r->>'qualification_date','')~'^\\d{4}-\\d{2}-\\d{2}$'
              then (r->>'qualification_date')::date
            else (n.payload_json->>'final_date')::date
          end,
          coalesce((r->>'heat_number')::integer,999),
          coalesce(r->>'rider_name','')
      )
      from jsonb_array_elements(
        coalesce(n.payload_json->'riders','[]'::jsonb)
      ) r
    ) rider_lines
  from public.notifications n
  where n.payload_json ? 'riders'
    and jsonb_typeof(n.payload_json->'riders')='array'
    and n.title ilike '%riders selected for National Championship%'
)
update public.notifications n
set message=
  rebuilt.rider_count||' rider(s) selected for the '||
  rebuilt.country_name||' National Championship · Season '||
  rebuilt.season_number||'.'||E'\n\n'||
  coalesce(rebuilt.rider_lines,'')||E'\n\n'||
  'Approve or refuse each rider from the National Championships duty page. '||
  'Approved riders are locked from one game day before through one game day after their Championship event.'
from rebuilt
where n.id=rebuilt.id;

-- Future season transitions reuse the same weather-based scheduler.
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
  seed_result jsonb;
  hierarchy_result jsonb;
  new_budgets integer:=0;
  agreements_extended integer:=0;
  calendar_seed_result jsonb;
  weather_calendar_result jsonb;
  runtime_result jsonb;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth Academy transition requires target = source + 1';
  end if;

  seed_result:=public.seed_ai_youth_academies_for_season_v1(p_target_season);
  hierarchy_result:=private.assign_youth_target_memberships_v2(
    p_source_season,p_target_season
  );

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount,initial_allocation
  )
  select
    a.id,p_target_season,
    coalesce(b.season_budget,100000),0,coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_range,'local'),coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_budget,5000),coalesce(b.season_budget,100000)
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

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
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
