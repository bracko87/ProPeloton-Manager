create or replace function private.enter_youth_race_v1(
  p_academy_id uuid,
  p_race_id uuid,
  p_entered_by text,
  p_strategy text default 'balanced'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_plan public.youth_monthly_race_plans%rowtype;
  v_invitation public.youth_race_invitations%rowtype;
  v_entry_id uuid;
  v_lineup integer;
  v_game_date date:=public.get_current_game_date_date();
  v_month integer;
  v_class_count integer:=0;
  v_class_limit integer:=0;
  v_month_cost bigint:=0;
  v_team_count integer:=0;
  v_squad_decider text;
  v_cost jsonb;
  v_total_cost bigint:=0;
  v_entry_fee bigint:=0;
  v_travel bigint:=0;
  v_accommodation bigint:=0;
  v_logistics bigint:=0;
  v_staff_accommodation bigint:=0;
  v_equipment bigint:=0;
begin
  select * into v_race from public.youth_races where id=p_race_id for update;
  select * into v_academy from public.youth_academies where id=p_academy_id;

  if v_race.id is null or v_academy.id is null then
    raise exception 'Race or Academy not found';
  end if;
  if v_race.status<>'scheduled' or v_race.race_date<=v_game_date then
    raise exception 'Youth race entry is closed';
  end if;

  select * into v_invitation
  from public.youth_race_invitations
  where race_id=p_race_id and academy_id=p_academy_id
  for update;

  if v_invitation.race_id is null
     or v_invitation.status not in ('pending','accepted') then
    raise exception 'This Academy is not eligible to apply for this Youth race';
  end if;

  if not private.youth_race_academy_qualified_v1(p_academy_id,p_race_id) then
    raise exception 'Academy does not currently have enough eligible Youth Riders';
  end if;

  v_month:=extract(month from v_race.race_date)::integer;
  perform private.ensure_youth_monthly_race_plan_v1(
    p_academy_id,v_race.season_number,v_month
  );

  select * into v_plan
  from public.youth_monthly_race_plans
  where academy_id=p_academy_id
    and season_number=v_race.season_number
    and month_number=v_month
  for update;

  if not v_academy.is_ai and not coalesce(v_plan.approved,false) then
    raise exception 'Approve the monthly Youth race plan before applying for races';
  end if;

  v_class_limit:=case v_race.competition_class
    when 'world' then v_plan.world_race_limit
    when 'continental' then v_plan.continental_race_limit
    else v_plan.regional_race_limit
  end;

  select count(*)::integer into v_class_count
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and e.status in ('entered','completed')
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.competition_class=v_race.competition_class
    and r.id<>p_race_id;

  if v_class_count>=coalesce(v_class_limit,0) then
    raise exception 'Monthly % Youth race limit has been reached',
      v_race.competition_class;
  end if;

  v_cost:=private.youth_race_cost_breakdown_v1(p_academy_id,p_race_id);
  if not coalesce((v_cost->>'available')::boolean,false) then
    raise exception 'Youth race participation cost could not be calculated';
  end if;

  v_entry_fee:=coalesce((v_cost->>'entry_fee')::bigint,500);
  v_travel:=coalesce((v_cost->>'travel_cost_total')::bigint,0);
  v_accommodation:=coalesce((v_cost->>'accommodation_cost_total')::bigint,0);
  v_logistics:=coalesce((v_cost->>'logistics_cost_total')::bigint,0);
  v_staff_accommodation:=coalesce((v_cost->>'staff_accommodation_cost_total')::bigint,0);
  v_equipment:=coalesce((v_cost->>'equipment_support_cost_total')::bigint,0);
  v_total_cost:=coalesce((v_cost->>'total_cost')::bigint,0);

  select coalesce(sum(
    case
      when e.total_participation_cost>0 then e.total_participation_cost
      else e.entry_cost
    end
  ),0)::bigint
  into v_month_cost
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.academy_id=p_academy_id
    and e.status in ('entered','completed')
    and r.season_number=v_race.season_number
    and extract(month from r.race_date)::integer=v_month
    and r.id<>p_race_id;

  if v_month_cost+v_total_cost>coalesce(v_plan.max_monthly_cost,0) then
    raise exception 'Monthly Youth racing budget limit would be exceeded ($% + $% > $%)',
      v_month_cost,v_total_cost,v_plan.max_monthly_cost;
  end if;

  select count(*)::integer into v_team_count
  from public.youth_race_entries e
  where e.race_id=p_race_id and e.status in ('entered','completed');

  if v_team_count>=v_race.team_limit then
    raise exception 'Youth race team limit is already full';
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets
  where academy_id=p_academy_id and season_number=v_race.season_number
  for update;

  if v_budget.academy_id is null then
    raise exception 'Youth Academy season budget not found';
  end if;

  if v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount<v_total_cost then
    raise exception 'Youth Academy budget is insufficient for this race ($% required)',
      v_total_cost;
  end if;

  insert into public.youth_race_entries(
    race_id,academy_id,entered_on,entered_by,strategy,entry_cost,status,
    entry_fee,travel_cost_total,accommodation_cost_total,logistics_cost_total,
    staff_accommodation_cost_total,equipment_support_cost_total,total_participation_cost
  )
  values(
    p_race_id,p_academy_id,v_game_date,p_entered_by,
    case when p_strategy in ('conservative','balanced','aggressive')
      then p_strategy else 'balanced' end,
    v_total_cost,'entered',
    v_entry_fee,v_travel,v_accommodation,v_logistics,
    v_staff_accommodation,v_equipment,v_total_cost
  )
  on conflict(race_id,academy_id) do update
  set status='entered',
      strategy=excluded.strategy,
      entry_cost=excluded.entry_cost,
      entry_fee=excluded.entry_fee,
      travel_cost_total=excluded.travel_cost_total,
      accommodation_cost_total=excluded.accommodation_cost_total,
      logistics_cost_total=excluded.logistics_cost_total,
      staff_accommodation_cost_total=excluded.staff_accommodation_cost_total,
      equipment_support_cost_total=excluded.equipment_support_cost_total,
      total_participation_cost=excluded.total_participation_cost,
      updated_at=now()
  returning id into v_entry_id;

  update public.youth_race_invitations
  set status='accepted',responded_on=coalesce(responded_on,v_game_date),updated_at=now()
  where race_id=p_race_id and academy_id=p_academy_id;

  if not exists(
    select 1 from public.youth_academy_ledger l
    where l.academy_id=p_academy_id
      and l.category='race_travel'
      and l.metadata->>'race_id'=p_race_id::text
  ) then
    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_total_cost,updated_at=now()
    where academy_id=p_academy_id and season_number=v_race.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_race.season_number,v_game_date,'race_travel',
      'Youth race participation: '||v_race.race_name,
      -v_total_cost,
      jsonb_build_object(
        'race_id',p_race_id,
        'competition_class',v_race.competition_class,
        'host_city',v_race.host_city,
        'host_country_code',v_race.host_country_code,
        'entry_fee',v_entry_fee,
        'travel_cost_total',v_travel,
        'accommodation_cost_total',v_accommodation,
        'logistics_cost_total',v_logistics,
        'staff_accommodation_cost_total',v_staff_accommodation,
        'equipment_support_cost_total',v_equipment,
        'total_cost',v_total_cost,
        'rider_count',coalesce((v_cost->>'rider_count')::integer,v_race.lineup_size),
        'staff_count',2
      )
    );
  end if;

  select coalesce(s.race_squad_decider,'u16_head_coach')
  into v_squad_decider
  from private.youth_effective_settings_v1 s
  where s.academy_id=p_academy_id;

  if coalesce(v_squad_decider,'u16_head_coach')='u16_head_coach'
     or v_academy.is_ai then
    v_lineup:=private.select_youth_race_lineup_v1(
      v_entry_id,
      case when v_academy.is_ai then 'ai_head_coach' else 'u16_head_coach' end
    );
    if v_lineup<3 then
      raise exception 'Not enough eligible Youth Riders for this race';
    end if;
  end if;

  return v_entry_id;
end;
$function$;

do $block$
declare
  x record;
  c jsonb;
  new_total bigint;
  delta bigint;
begin
  for x in
    select e.id entry_id,e.academy_id,e.race_id,e.entry_cost old_cost,
           r.season_number
    from public.youth_race_entries e
    join public.youth_races r on r.id=e.race_id
    join public.youth_academies a on a.id=e.academy_id
    where e.status='entered'
      and r.status='scheduled'
      and r.race_date>public.get_current_game_date_date()
      and not a.is_ai
  loop
    c:=private.youth_race_cost_breakdown_v1(x.academy_id,x.race_id);
    new_total:=coalesce((c->>'total_cost')::bigint,x.old_cost);
    delta:=new_total-coalesce(x.old_cost,0);

    update public.youth_race_entries
    set entry_cost=new_total,
        entry_fee=coalesce((c->>'entry_fee')::bigint,500),
        travel_cost_total=coalesce((c->>'travel_cost_total')::bigint,0),
        accommodation_cost_total=coalesce((c->>'accommodation_cost_total')::bigint,0),
        logistics_cost_total=coalesce((c->>'logistics_cost_total')::bigint,0),
        staff_accommodation_cost_total=coalesce((c->>'staff_accommodation_cost_total')::bigint,0),
        equipment_support_cost_total=coalesce((c->>'equipment_support_cost_total')::bigint,0),
        total_participation_cost=new_total,
        updated_at=now()
    where id=x.entry_id;

    if delta<>0 then
      update public.youth_academy_season_budgets
      set spent_amount=greatest(0,spent_amount+delta),updated_at=now()
      where academy_id=x.academy_id and season_number=x.season_number;

      update public.youth_academy_ledger
      set amount=-new_total,
          description='Youth race participation: '||(select race_name from public.youth_races where id=x.race_id),
          metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
            'entry_fee',coalesce((c->>'entry_fee')::bigint,500),
            'travel_cost_total',coalesce((c->>'travel_cost_total')::bigint,0),
            'accommodation_cost_total',coalesce((c->>'accommodation_cost_total')::bigint,0),
            'logistics_cost_total',coalesce((c->>'logistics_cost_total')::bigint,0),
            'staff_accommodation_cost_total',coalesce((c->>'staff_accommodation_cost_total')::bigint,0),
            'equipment_support_cost_total',coalesce((c->>'equipment_support_cost_total')::bigint,0),
            'total_cost',new_total,
            'recalculated_by','youth_race_costs_v3'
          )
      where academy_id=x.academy_id
        and category='race_travel'
        and metadata->>'race_id'=x.race_id::text;
    end if;
  end loop;
end;
$block$;
