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

  select x.rn into v_rank
  from (
    select
      i.race_id,
      row_number() over(
        order by
          private.youth_deterministic_fraction_v1(
            p_academy_id::text||':'||i.race_id::text||':monthly_plan'
          ) desc,
          r.race_date,
          i.race_id
      )::integer rn
    from public.youth_race_invitations i
    join public.youth_races r on r.id=i.race_id
    where i.academy_id=p_academy_id
      and r.season_number=v_race.season_number
      and extract(month from r.race_date)::integer=
          extract(month from v_race.race_date)::integer
      and r.competition_class=v_race.competition_class
      and r.status<>'cancelled'
  ) x
  where x.race_id=p_race_id;

  return coalesce(v_rank,9999)<=v_limit;
end;
$function$;

create or replace function private.process_youth_world_invitation_deadlines_v1(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race record;
  v_invite record;
  v_entered integer:=0;
  v_declined integer:=0;
  v_expired integer:=0;
  v_wildcards integer:=0;
  v_this_expired integer:=0;
begin
  for v_race in
    select r.id,r.season_number,r.race_date
    from public.youth_races r
    where r.status='scheduled'
      and r.competition_class='world'
      and r.invitation_response_deadline=p_game_date
  loop
    for v_invite in
      select i.academy_id,a.is_ai,
        coalesce(s.race_entry_decider,'u16_head_coach') race_entry_decider
      from public.youth_race_invitations i
      join public.youth_academies a on a.id=i.academy_id
      left join public.youth_academy_settings s on s.academy_id=a.id
      where i.race_id=v_race.id
        and i.invitation_type='world_class'
        and i.status='pending'
        and (
          a.is_ai
          or coalesce(s.race_entry_decider,'u16_head_coach')='u16_head_coach'
        )
    loop
      perform private.ensure_youth_monthly_race_plan_v1(
        v_invite.academy_id,v_race.season_number,
        extract(month from v_race.race_date)::integer
      );

      if not private.youth_race_selected_by_plan_v1(
        v_invite.academy_id,v_race.id
      ) then
        update public.youth_race_invitations
        set status='declined',responded_on=p_game_date,updated_at=now(),
            metadata=metadata||jsonb_build_object(
              'decline_reason','monthly_plan_selection'
            )
        where race_id=v_race.id and academy_id=v_invite.academy_id
          and status='pending';
        v_declined:=v_declined+1;
        continue;
      end if;

      begin
        perform private.enter_youth_race_v1(
          v_invite.academy_id,v_race.id,
          case when v_invite.is_ai then 'ai_head_coach' else 'u16_head_coach' end,
          'balanced'
        );
        v_entered:=v_entered+1;
      exception when others then
        update public.youth_race_invitations
        set status='declined',responded_on=p_game_date,updated_at=now(),
            metadata=metadata||jsonb_build_object(
              'decline_reason','budget_roster_or_eligibility'
            )
        where race_id=v_race.id and academy_id=v_invite.academy_id
          and status='pending';
        v_declined:=v_declined+1;
      end;
    end loop;

    with expired as (
      update public.youth_race_invitations
      set status='expired',responded_on=p_game_date,updated_at=now()
      where race_id=v_race.id
        and invitation_type='world_class'
        and status='pending'
      returning 1
    )
    select count(*)::integer into v_this_expired from expired;
    v_expired:=v_expired+coalesce(v_this_expired,0);

    v_wildcards:=v_wildcards+private.fill_youth_world_race_wildcards_v1(v_race.id);
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'world_entries',v_entered,
    'world_declined',v_declined,
    'world_expired',v_expired,
    'wildcards_added',v_wildcards
  );
end;
$function$;

create or replace function private.auto_enter_youth_races_v1(
  p_game_date date
)
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
    left join public.youth_academy_settings s on s.academy_id=a.id
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
          metadata=metadata||jsonb_build_object(
            'decline_reason','monthly_plan_selection'
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
      null;
    end;
  end loop;
  return v_count;
end;
$function$;
