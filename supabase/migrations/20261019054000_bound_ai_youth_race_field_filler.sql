-- Forward youth daily tick timeout prevention.
-- Preserve the complete ranking/selection order and winner calculations.
-- Reject AI re-entry into previously withdrawn races; evaluate at most three
-- eligible youth riders per candidate, since three is the minimum to fill.
-- Speed up the per-academy monthly participation lookup.
CREATE INDEX IF NOT EXISTS youth_race_entries_academy_status_race_idx
  ON public.youth_race_entries (academy_id,status,race_id);

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
  v_target integer:=6;
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

  v_target:=least(
    coalesce(r.team_limit,20),
    greatest(
      6,
      coalesce(
        r.target_teams,
        private.youth_race_target_teams_v10(r.id,r.competition_class)
      )
    )
  );

  select count(*)::integer
  into current_count
  from public.youth_race_entries e
  where e.race_id=r.id
    and e.status in ('entered','completed');

  if current_count>=v_target then
    return jsonb_build_object(
      'race_id',r.id,
      'teams',current_count,
      'target_teams',v_target,
      'team_limit',coalesce(r.team_limit,20),
      'target_met',true
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
          -- Never re-enter an AI academy after its earlier invitation was
      -- accepted and the official entry was withdrawn.
      and not exists(
        select 1
        from public.youth_race_entries e
        where e.race_id=r.id and e.academy_id=a.id
      )
      -- The field needs only three eligible riders. Stop evaluating costly
      -- health, camp and overlapping-race checks after the third match.
      and (
        select count(*)
        from (
          select 1
          from public.youth_riders yr
          where yr.academy_id=a.id
            and yr.status='academy'
            and private.youth_rider_available_for_race_v1(yr.id,r.id)
          limit 3
        ) first_three_available
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
    exit when current_count>=v_target;

    insert into public.youth_race_invitations(
      race_id,academy_id,invitation_type,status,invited_on,response_deadline,
      priority_score,metadata
    )
    values(
      r.id,x.academy_id,'wildcard','pending',
      p_game_date,r.race_date-7,500,
      jsonb_build_object(
        'source','ai_variable_field_filler_v10',
        'target_teams',v_target
      )
    )
    on conflict(race_id,academy_id) do update
    set
      status=case
        when public.youth_race_invitations.status='accepted'
          then 'accepted'
        else 'pending'
      end,
      response_deadline=excluded.response_deadline,
      metadata=coalesce(public.youth_race_invitations.metadata,'{}'::jsonb)
        ||excluded.metadata,
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
    'target_teams',v_target,
    'team_limit',coalesce(r.team_limit,20),
    'target_met',current_count>=v_target
  );
end;
$function$;
