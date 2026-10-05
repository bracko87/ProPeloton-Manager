create or replace function private.youth_race_academy_qualified_v1(
  p_academy_id uuid,
  p_race_id uuid
)
returns boolean
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select coalesce((
    select count(*)>=3
    from public.youth_riders r
    where r.academy_id=p_academy_id
      and r.status='academy'
  ),false);
$function$;

CREATE OR REPLACE FUNCTION private.enter_youth_race_v1(p_academy_id uuid, p_race_id uuid, p_entered_by text, p_strategy text DEFAULT 'balanced'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
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

  if p_entered_by<>'manager' and v_class_count>=coalesce(v_class_limit,0) then
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

  if (coalesce(v_squad_decider,'u16_head_coach')='u16_head_coach'
      or v_academy.is_ai)
     and p_entered_by<>'manager' then
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

create or replace function private.fill_due_youth_lineups_v1(p_game_date date)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  x record;
  v_selected integer;
  v_count integer:=0;
begin
  for x in
    select e.id entry_id,e.academy_id,a.is_ai,
           coalesce(s.race_squad_decider,'u16_head_coach') squad_decider
    from public.youth_race_entries e
    join public.youth_races r on r.id=e.race_id
    join public.youth_academies a on a.id=e.academy_id
    left join private.youth_effective_settings_v1 s on s.academy_id=e.academy_id
    where e.status='entered'
      and r.status='scheduled'
      and r.race_date between p_game_date and p_game_date+3
      and (
        a.is_ai
        or coalesce(s.race_squad_decider,'u16_head_coach')='u16_head_coach'
      )
      and (
        select count(*) from public.youth_race_lineups l where l.entry_id=e.id
      )<greatest(3,coalesce(r.lineup_size,5))
    order by r.race_date,e.id
  loop
    begin
      v_selected:=private.select_youth_race_lineup_v1(
        x.entry_id,
        case when x.is_ai then 'ai_head_coach' else 'u16_head_coach' end
      );
      if v_selected>=3 then v_count:=v_count+1; end if;
    exception when others then
      null;
    end;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.process_youth_team_allocations_v2(p_game_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  gd date:=coalesce(p_game_date,public.get_current_game_date_date());
  x record;
  n integer:=0;
  f integer:=0;
  auto_entries integer:=0;
begin
  perform private.trim_youth_calendar_density_v1(public.get_current_season_number(),gd);
  perform public.sync_youth_scheduled_race_invitations_v2(public.get_current_season_number());
  auto_entries:=private.auto_enter_youth_races_v1(gd);
  perform private.fill_due_youth_lineups_v1(gd);

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
