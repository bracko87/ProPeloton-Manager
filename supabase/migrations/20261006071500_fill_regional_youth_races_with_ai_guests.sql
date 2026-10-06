-- Keep regional league sizes fixed while fielding viable races with qualified local AI guests.
CREATE OR REPLACE FUNCTION private.fill_youth_race_field_v2(p_race_id uuid, p_game_date date, p_final_fill boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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
  left join public.youth_academy_competition_memberships m
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

  -- Regional league membership can intentionally contain only two teams.
  -- Fill the sporting field with local AI guests without assigning league spots
  -- or reactivating withdrawn/refunded race entries.
  if r.competition_class='regional' and current_count<target then
    for x in
      select a.id academy_id
      from public.youth_academies a
      join public.clubs c on c.id=a.club_id
      where a.is_active and a.is_ai and c.deleted_at is null
        and private.youth_regional_division_for_country_v1(c.country_code)=r.division_code
        and private.youth_race_academy_qualified_v1(a.id,r.id)
        and not exists(
          select 1 from public.youth_academy_competition_memberships m
          where m.season_number=r.season_number and m.academy_id=a.id
        )
        and not exists(
          select 1 from public.youth_race_entries e
          where e.race_id=r.id and e.academy_id=a.id
        )
        and not exists(
          select 1 from public.youth_race_invitations i
          where i.race_id=r.id and i.academy_id=a.id
        )
      order by
        case when c.country_code=r.host_country_code then 0 else 1 end,
        coalesce((private.youth_race_cost_breakdown_v1(a.id,r.id)->>'total_cost')::bigint,999999999),
        private.youth_academy_strength_v1(a.id) desc,a.id
    loop
      exit when current_count>=target;
      insert into public.youth_race_invitations(
        race_id,academy_id,invitation_type,status,invited_on,
        response_deadline,priority_score,metadata
      ) values(
        r.id,x.academy_id,'wildcard','pending',p_game_date,
        greatest(p_game_date,r.race_date-7),0,
        jsonb_build_object('source','regional_ai_guest_fill_v1',
          'division_code',r.division_code,'no_league_membership_change',true)
      ) on conflict(race_id,academy_id) do nothing;

      perform private.ensure_youth_monthly_race_plan_v1(
        x.academy_id,r.season_number,extract(month from r.race_date)::integer
      );
      update public.youth_monthly_race_plans p
      set regional_race_limit=greatest(p.regional_race_limit,5),
          max_monthly_cost=greatest(p.max_monthly_cost,30000),
          approved=true,approved_at=coalesce(p.approved_at,now())
      where p.academy_id=x.academy_id
        and p.season_number=r.season_number
        and p.month_number=extract(month from r.race_date)::integer;

      begin
        e_id:=private.enter_youth_race_v1(x.academy_id,r.id,'ai_head_coach','balanced');
        if e_id is not null then current_count:=current_count+1; end if;
      exception when others then
        update public.youth_race_invitations
        set metadata=coalesce(metadata,'{}'::jsonb)
              ||jsonb_build_object('guest_entry_error',sqlerrm,'checked_on',p_game_date),
            updated_at=now()
        where race_id=r.id and academy_id=x.academy_id;
      end;
    end loop;
  end if;

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
$function$
;
