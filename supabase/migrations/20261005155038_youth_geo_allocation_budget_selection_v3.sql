create or replace function public.sync_youth_scheduled_race_invitations_v2(p_season integer default null)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  s integer:=coalesce(p_season,public.get_current_season_number(),1);
  gd date:=public.get_current_game_date_date();
  del_count integer:=0;
  ins_count integer:=0;
begin
  perform public.ensure_youth_competition_memberships_v1(s);

  update public.youth_races r
  set division_code=private.youth_regional_division_for_country_v1(r.host_country_code),
      entry_cost=500,
      min_teams=6,
      target_teams=private.youth_race_target_teams_v1(r.competition_class,r.team_limit),
      updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='regional';

  update public.youth_races r
  set team_limit=16,division_code='WORLD',entry_cost=500,min_teams=6,
      target_teams=16,updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='world';

  update public.youth_races r
  set team_limit=20,entry_cost=500,min_teams=6,target_teams=12,updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='continental';

  delete from public.youth_race_invitations i
  using public.youth_races r
  where r.id=i.race_id and r.season_number=s and r.status='scheduled' and r.race_date>gd
    and not exists(
      select 1 from public.youth_race_entries e
      where e.race_id=i.race_id and e.academy_id=i.academy_id
        and e.status in ('entered','completed')
    )
    and not exists(
      select 1
      from public.youth_academy_competition_memberships m
      where m.season_number=s and m.academy_id=i.academy_id
        and (
          (r.competition_class='world' and m.competition_class='world')
          or
          (r.competition_class='continental' and (
            (m.competition_class='continental' and m.division_code=r.division_code)
            or
            (m.competition_class='regional'
             and private.youth_continental_division_for_regional_v1(m.division_code)=r.division_code)
          ))
          or
          (r.competition_class='regional'
           and m.competition_class='regional'
           and m.division_code=r.division_code)
        )
    );
  get diagnostics del_count=row_count;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,priority_score,metadata
  )
  select
    r.id,
    m.academy_id,
    case
      when r.competition_class='world' then 'world_class'
      when r.competition_class='continental' and m.competition_class='continental' then 'continental_pool'
      when r.competition_class='continental' then 'continental_wildcard'
      else 'regional_local'
    end,
    'pending',
    greatest(gd,r.race_date-21),
    r.race_date-7,
    (
      case
        when public.get_amateur_division_for_country(c.country_code)
           = public.get_amateur_division_for_country(r.host_country_code)
        then case r.competition_class when 'regional' then 100 when 'continental' then 55 else 0 end
        else 0
      end
      +case when m.competition_class=r.competition_class then 35 else 5 end
      +greatest(0,1000-coalesce(m.seed_rank,500))*0.05
      +private.youth_academy_strength_v1(m.academy_id)*0.01
    )::numeric,
    jsonb_build_object(
      'source','youth_hierarchy_geo_v3',
      'host_market',public.get_amateur_division_for_country(r.host_country_code),
      'academy_market',public.get_amateur_division_for_country(c.country_code),
      'local_market',
        public.get_amateur_division_for_country(c.country_code)
        =public.get_amateur_division_for_country(r.host_country_code)
    )
  from public.youth_races r
  join public.youth_academy_competition_memberships m
    on m.season_number=s
   and (
      (r.competition_class='world' and m.competition_class='world')
      or
      (r.competition_class='continental' and (
        (m.competition_class='continental' and m.division_code=r.division_code)
        or
        (m.competition_class='regional'
         and private.youth_continental_division_for_regional_v1(m.division_code)=r.division_code)
      ))
      or
      (r.competition_class='regional'
       and m.competition_class='regional'
       and m.division_code=r.division_code)
   )
  join public.youth_academies a on a.id=m.academy_id and a.is_active
  join public.clubs c on c.id=a.club_id and c.deleted_at is null
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
  on conflict(race_id,academy_id) do nothing;
  get diagnostics ins_count=row_count;

  perform public.ensure_youth_race_runtime_for_season_v1(s);

  return jsonb_build_object(
    'season_number',s,
    'obsolete_invitations_removed',del_count,
    'invitations_added',ins_count
  );
end;
$function$;

create or replace function private.youth_race_selected_by_plan_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
  v_limit integer:=0;
  v_rank integer;
  v_cost bigint:=0;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return false; end if;

  perform private.ensure_youth_monthly_race_plan_v1(
    p_academy_id,
    v_race.season_number,
    extract(month from v_race.race_date)::integer
  );

  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=p_academy_id
    and season_number=v_race.season_number
    and month_number=extract(month from v_race.race_date)::integer;

  if v_plan.academy_id is null or not v_plan.approved then return false; end if;

  v_limit:=case v_race.competition_class
    when 'world' then v_plan.world_race_limit
    when 'continental' then v_plan.continental_race_limit
    else v_plan.regional_race_limit
  end;
  if coalesce(v_limit,0)<=0 then return false; end if;

  v_cost:=coalesce((private.youth_race_cost_breakdown_v1(p_academy_id,p_race_id)->>'total_cost')::bigint,0);
  if v_cost<=0 or v_cost>coalesce(v_plan.max_monthly_cost,0) then
    return false;
  end if;

  select x.rn into v_rank
  from (
    select
      i.race_id,
      row_number() over(
        order by
          case
            when r.competition_class='world' then 0
            when private.youth_race_local_market_v1(p_academy_id,r.id) then 0
            else 1
          end,
          coalesce((private.youth_race_cost_breakdown_v1(p_academy_id,r.id)->>'total_cost')::bigint,999999999),
          private.youth_deterministic_fraction_v1(
            p_academy_id::text||':'||i.race_id::text||':monthly_plan'
          ) desc,
          r.race_date,
          i.race_id
      )::integer rn
    from public.youth_race_invitations i
    join public.youth_races r on r.id=i.race_id
    where i.academy_id=p_academy_id
      and i.status in ('pending','accepted')
      and r.season_number=v_race.season_number
      and extract(month from r.race_date)::integer=extract(month from v_race.race_date)::integer
      and r.competition_class=v_race.competition_class
      and r.status='scheduled'
  ) x
  where x.race_id=p_race_id;

  return coalesce(v_rank,9999)<=v_limit;
end;
$function$;

create or replace function private.auto_enter_youth_races_v1(p_game_date date)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_pair record;
  v_count integer:=0;
  v_strategy text;
begin
  for v_pair in
    select
      r.id race_id,r.season_number,r.race_date,r.competition_class,
      a.id academy_id,a.is_ai,
      coalesce(s.race_entry_decider,'u16_head_coach') race_entry_decider
    from public.youth_races r
    join public.youth_race_invitations i on i.race_id=r.id
    join public.youth_academies a on a.id=i.academy_id
    left join private.youth_effective_settings_v1 s on s.academy_id=a.id
    where r.status='scheduled'
      and r.race_date=p_game_date+7
      and i.status='pending'
      and a.is_active=true
      and (
        a.is_ai
        or coalesce(s.race_entry_decider,'u16_head_coach')='u16_head_coach'
      )
      and not exists(
        select 1 from public.youth_race_entries e
        where e.race_id=r.id and e.academy_id=a.id
          and e.status in ('entered','completed')
      )
    order by
      case r.competition_class when 'world' then 1 when 'continental' then 2 else 3 end,
      case when private.youth_race_local_market_v1(a.id,r.id) then 0 else 1 end,
      coalesce((private.youth_race_cost_breakdown_v1(a.id,r.id)->>'total_cost')::bigint,999999999),
      r.race_date,r.id,a.id
  loop
    perform private.ensure_youth_monthly_race_plan_v1(
      v_pair.academy_id,v_pair.season_number,
      extract(month from v_pair.race_date)::integer
    );

    if not private.youth_race_selected_by_plan_v1(
      v_pair.academy_id,v_pair.race_id
    ) then
      update public.youth_race_invitations
      set status='declined',responded_on=p_game_date,updated_at=now(),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'decline_reason','monthly_plan_or_budget_selection'
          )
      where race_id=v_pair.race_id and academy_id=v_pair.academy_id
        and status='pending';
      continue;
    end if;

    v_strategy:=case
      when private.youth_deterministic_fraction_v1(
        v_pair.race_id::text||v_pair.academy_id::text||'strategy'
      )<0.22 then 'conservative'
      when private.youth_deterministic_fraction_v1(
        v_pair.race_id::text||v_pair.academy_id::text||'strategy'
      )>0.78 then 'aggressive'
      else 'balanced'
    end;

    begin
      perform private.enter_youth_race_v1(
        v_pair.academy_id,v_pair.race_id,
        case when v_pair.is_ai then 'ai_head_coach' else 'u16_head_coach' end,
        v_strategy
      );
      v_count:=v_count+1;
    exception when others then
      update public.youth_race_invitations
      set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'auto_entry_error',sqlerrm,
        'auto_entry_checked_on',p_game_date
      ),updated_at=now()
      where race_id=v_pair.race_id and academy_id=v_pair.academy_id;
    end;
  end loop;
  return v_count;
end;
$function$;

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
  current_local integer:=0;
  target integer:=0;
  local_quota integer:=0;
  e_id uuid;
  pass_no integer;
begin
  select * into r from public.youth_races where id=p_race_id for update;
  if r.id is null or r.status<>'scheduled' or r.race_date<=p_game_date then
    return jsonb_build_object('race_id',p_race_id,'reason','not_open');
  end if;

  target:=coalesce(r.target_teams,private.youth_race_target_teams_v1(r.competition_class,r.team_limit));
  target:=greatest(coalesce(r.min_teams,6),least(target,r.team_limit));

  select count(*)::integer,
         count(*) filter(
           where public.get_amateur_division_for_country(c.country_code)
               = public.get_amateur_division_for_country(r.host_country_code)
         )::integer
  into current_count,current_local
  from public.youth_race_entries e
  join public.youth_academies a on a.id=e.academy_id
  join public.clubs c on c.id=a.club_id
  where e.race_id=r.id and e.status in ('entered','completed');

  local_quota:=case r.competition_class
    when 'regional' then ceil(target*0.90)::integer
    when 'continental' then ceil(target*0.50)::integer
    else 0
  end;

  for pass_no in 1..2 loop
    for x in
      select
        a.id academy_id,
        private.youth_academy_strength_v1(a.id) strength,
        m.competition_class membership_class,
        (
          public.get_amateur_division_for_country(c.country_code)
          = public.get_amateur_division_for_country(r.host_country_code)
        ) is_local
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      join public.clubs c on c.id=a.club_id
      join public.youth_academy_competition_memberships m
        on m.academy_id=a.id and m.season_number=r.season_number
      where i.race_id=r.id
        and i.status in ('pending','accepted')
        and a.is_active and a.is_ai
        and not exists(
          select 1 from public.youth_race_entries e
          where e.race_id=r.id and e.academy_id=a.id
        )
        and (
          r.competition_class='world'
          or (
            pass_no=1 and
            public.get_amateur_division_for_country(c.country_code)
              =public.get_amateur_division_for_country(r.host_country_code)
          )
          or (
            pass_no=2 and
            public.get_amateur_division_for_country(c.country_code)
              is distinct from public.get_amateur_division_for_country(r.host_country_code)
          )
        )
      order by
        case when m.competition_class=r.competition_class then 0 else 1 end,
        private.youth_race_cost_breakdown_v1(a.id,r.id)->>'total_cost',
        strength desc,a.id
    loop
      exit when current_count>=target;
      if r.competition_class in ('regional','continental')
         and pass_no=1
         and current_local>=local_quota then
        exit;
      end if;

      perform private.ensure_youth_monthly_race_plan_v1(
        x.academy_id,r.season_number,extract(month from r.race_date)::integer
      );

      update public.youth_monthly_race_plans p
      set world_race_limit=greatest(p.world_race_limit,3),
          continental_race_limit=greatest(p.continental_race_limit,4),
          regional_race_limit=greatest(p.regional_race_limit,5),
          max_monthly_cost=greatest(p.max_monthly_cost,30000),
          approved=true,approved_at=coalesce(p.approved_at,now())
      where p.academy_id=x.academy_id
        and p.season_number=r.season_number
        and p.month_number=extract(month from r.race_date)::integer;

      begin
        e_id:=private.enter_youth_race_v1(x.academy_id,r.id,'ai_head_coach','balanced');
        if e_id is not null then
          current_count:=current_count+1;
          if x.is_local then current_local:=current_local+1; end if;
        end if;
      exception when others then
        null;
      end;
    end loop;
  end loop;

  if p_final_fill and current_count<coalesce(r.min_teams,6) then
    -- Final safety pass: use any eligible invited AI team before allowing a
    -- race to fall below the six-team minimum.
    for x in
      select a.id academy_id,
             private.youth_academy_strength_v1(a.id) strength
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      where i.race_id=r.id and i.status in ('pending','accepted')
        and a.is_active and a.is_ai
        and not exists(
          select 1 from public.youth_race_entries e
          where e.race_id=r.id and e.academy_id=a.id
        )
      order by strength desc,a.id
    loop
      exit when current_count>=greatest(6,coalesce(r.min_teams,6));
      begin
        e_id:=private.enter_youth_race_v1(x.academy_id,r.id,'ai_head_coach','balanced');
        if e_id is not null then current_count:=current_count+1; end if;
      exception when others then null;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'race_id',r.id,
    'teams',current_count,
    'min_teams',coalesce(r.min_teams,6),
    'target_teams',target,
    'team_limit',r.team_limit,
    'local_teams',current_local,
    'minimum_met',current_count>=coalesce(r.min_teams,6),
    'target_met',current_count>=target
  );
end;
$function$;

create or replace function public.process_youth_team_allocations_v2(p_game_date date default null)
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
  auto_entries integer:=0;
begin
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  auto_entries:=private.auto_enter_youth_races_v1(gd);

  for x in
    select id,race_date
    from public.youth_races
    where status='scheduled' and race_date>gd and race_date<=gd+14
    order by race_date,id
  loop
    perform private.ensure_youth_race_runtime_v1(x.id);
    perform private.fill_youth_race_field_v2(x.id,gd,x.race_date<=gd+7);
    n:=n+1;
    if x.race_date<=gd+7 then f:=f+1; end if;
  end loop;

  return jsonb_build_object(
    'game_date',gd,
    'allocation_window_days',14,
    'final_fill_days',7,
    'minimum_teams_per_race',6,
    'auto_staff_entries',auto_entries,
    'races_processed',n,
    'final_fill_races',f
  );
end;
$function$;
