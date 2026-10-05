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
      entry_cost=500,min_teams=6,
      target_teams=private.youth_race_target_teams_v1(r.competition_class,r.team_limit),
      updated_at=now()
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
    and r.competition_class='regional';

  update public.youth_races
  set team_limit=16,division_code='WORLD',entry_cost=500,min_teams=6,target_teams=16,updated_at=now()
  where season_number=s and status='scheduled' and race_date>gd and competition_class='world';

  update public.youth_races
  set team_limit=20,entry_cost=500,min_teams=6,target_teams=12,updated_at=now()
  where season_number=s and status='scheduled' and race_date>gd and competition_class='continental';

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
      join public.youth_academies a on a.id=m.academy_id
      join public.clubs c on c.id=a.club_id
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
           and private.youth_regional_division_for_country_v1(c.country_code)=r.division_code)
        )
    );
  get diagnostics del_count=row_count;

  insert into public.youth_race_invitations(
    race_id,academy_id,invitation_type,status,invited_on,response_deadline,priority_score,metadata
  )
  select
    r.id,m.academy_id,
    case
      when r.competition_class='world' then 'world_class'
      when r.competition_class='continental' and m.competition_class='continental' then 'continental_pool'
      when r.competition_class='continental' then 'wildcard'
      when r.competition_class='regional' and m.competition_class='regional' then 'regional_local'
      else 'wildcard'
    end,
    'pending',
    greatest(gd,r.race_date-21),
    r.race_date-7,
    (
      case
        when public.get_amateur_division_for_country(c.country_code)
           =public.get_amateur_division_for_country(r.host_country_code)
        then case r.competition_class when 'regional' then 100 when 'continental' then 55 else 0 end
        else 0
      end
      +case when m.competition_class=r.competition_class then 40 else 8 end
      +greatest(0,1000-coalesce(m.seed_rank,500))*0.05
      +private.youth_academy_strength_v1(m.academy_id)*0.01
    )::numeric,
    jsonb_build_object(
      'source','youth_hierarchy_geo_class_v3',
      'host_market',public.get_amateur_division_for_country(r.host_country_code),
      'academy_market',public.get_amateur_division_for_country(c.country_code),
      'local_market',
        public.get_amateur_division_for_country(c.country_code)
        =public.get_amateur_division_for_country(r.host_country_code),
      'membership_class',m.competition_class
    )
  from public.youth_races r
  join public.youth_academy_competition_memberships m on m.season_number=s
  join public.youth_academies a on a.id=m.academy_id and a.is_active
  join public.clubs c on c.id=a.club_id and c.deleted_at is null
  where r.season_number=s and r.status='scheduled' and r.race_date>gd
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
       and private.youth_regional_division_for_country_v1(c.country_code)=r.division_code)
    )
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
  exact_class_count integer:=0;
  target integer:=0;
  class_quota integer:=0;
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
         count(*) filter(where m.competition_class=r.competition_class)::integer
  into current_count,exact_class_count
  from public.youth_race_entries e
  join public.youth_academy_competition_memberships m
    on m.academy_id=e.academy_id and m.season_number=r.season_number
  where e.race_id=r.id and e.status in ('entered','completed');

  class_quota:=case r.competition_class
    when 'regional' then ceil(target*0.90)::integer
    when 'continental' then ceil(target*0.50)::integer
    else target
  end;

  for pass_no in 1..2 loop
    for x in
      select
        a.id academy_id,
        private.youth_academy_strength_v1(a.id) strength,
        m.competition_class membership_class,
        (
          public.get_amateur_division_for_country(c.country_code)
          =public.get_amateur_division_for_country(r.host_country_code)
        ) is_local
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      join public.clubs c on c.id=a.club_id
      join public.youth_academy_competition_memberships m
        on m.academy_id=a.id and m.season_number=r.season_number
      where i.race_id=r.id and i.status in ('pending','accepted')
        and a.is_active and a.is_ai
        and not exists(
          select 1 from public.youth_race_entries e
          where e.race_id=r.id and e.academy_id=a.id and e.status in ('entered','completed')
        )
        and (
          (pass_no=1 and m.competition_class=r.competition_class)
          or
          (pass_no=2 and m.competition_class<>r.competition_class)
        )
      order by
        case
          when public.get_amateur_division_for_country(c.country_code)
             =public.get_amateur_division_for_country(r.host_country_code)
          then 0 else 1
        end,
        coalesce((private.youth_race_cost_breakdown_v1(a.id,r.id)->>'total_cost')::bigint,999999999),
        strength desc,a.id
    loop
      exit when current_count>=target;
      if pass_no=1 and exact_class_count>=class_quota then exit; end if;

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
          if x.membership_class=r.competition_class then
            exact_class_count:=exact_class_count+1;
          end if;
        end if;
      exception when others then null;
      end;
    end loop;
  end loop;

  if p_final_fill and current_count<coalesce(r.min_teams,6) then
    for x in
      select a.id academy_id,private.youth_academy_strength_v1(a.id) strength
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      where i.race_id=r.id and i.status in ('pending','accepted')
        and a.is_active and a.is_ai
        and not exists(
          select 1 from public.youth_race_entries e
          where e.race_id=r.id and e.academy_id=a.id and e.status in ('entered','completed')
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
    'exact_class_teams',exact_class_count,
    'class_quota',class_quota,
    'minimum_met',current_count>=coalesce(r.min_teams,6),
    'target_met',current_count>=target
  );
end;
$function$;
