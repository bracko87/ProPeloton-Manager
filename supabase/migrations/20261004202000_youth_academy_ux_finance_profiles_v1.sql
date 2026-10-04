
alter table public.youth_academy_season_budgets
  add column if not exists initial_allocation bigint;

update public.youth_academy_season_budgets
set initial_allocation=season_budget
where initial_allocation is null;

alter table public.youth_academy_season_budgets
  alter column initial_allocation set not null;

insert into public.notification_types(
  code,name,source,icon_name,priority,is_active,preference_group
)
values(
  'YOUTH_ACADEMY_STARTED','Youth Academy started','game',
  'graduation-cap',2,true,'teamUpdates'
)
on conflict(code) do update
set name=excluded.name,source=excluded.source,icon_name=excluded.icon_name,
    priority=excluded.priority,is_active=true,
    preference_group=excluded.preference_group;

create or replace function public.activate_my_youth_academy_v1(
  p_season_budget bigint default 100000
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_i integer;
  v_created boolean:=false;
  v_allocation bigint:=greatest(coalesce(p_season_budget,100000),5000);
  v_game_date date:=public.get_current_game_date_date();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Youth Academy is available only to Premium members.';
  end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  perform pg_advisory_xact_lock(hashtext('youth_academy_activate:'||v_club.id::text));

  select a.id into v_academy_id
  from public.youth_academies a where a.club_id=v_club.id limit 1;

  if v_academy_id is null then
    perform public.finance_spend_from_club(
      v_club.id,v_allocation,'youth_academy_initial_allocation','SINK',
      'youth-academy-activation:'||v_club.id::text||':'||v_season::text,
      jsonb_build_object(
        'purpose','youth_academy_initial_allocation',
        'season_number',v_season
      )
    );

    insert into public.youth_academies(
      club_id,is_ai,is_active,activated_season,capacity
    )
    values(v_club.id,false,true,v_season,16)
    returning id into v_academy_id;

    v_created:=true;

    insert into public.youth_academy_settings(academy_id)
    values(v_academy_id);

    for v_i in 1..6 loop
      perform private.create_youth_rider_v1(
        v_academy_id,v_club.country_code,true,false
      );
    end loop;

    perform private.create_youth_academy_staff_v1(
      v_club.id,v_club.country_code,'youth_academy_director'
    );
    perform private.create_youth_academy_staff_v1(
      v_club.id,v_club.country_code,'u16_head_coach'
    );
  end if;

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,initial_allocation,
    committed_amount,scouting_range,scouting_budget,scouting_committed_amount
  )
  values(
    v_academy_id,v_season,v_allocation,v_allocation,
    5000,'local',5000,5000
  )
  on conflict(academy_id,season_number) do nothing;

  if v_created then
    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy_id,v_season,v_game_date,'budget_transfer_in',
      'Initial Youth Academy allocation',v_allocation,
      jsonb_build_object('source','senior_team','initial_allocation',true)
    );

    perform public.create_user_game_notification_v1(
      v_user,'YOUTH_ACADEMY_STARTED',
      'Your Youth Academy is ready',
      'Your U16 programme is active with six riders and its starter staff. Set responsibilities, scouting, race participation and the Academy budget before the first events.',
      '/dashboard/manual?section=youth-academy',
      jsonb_build_object(
        'academy_id',v_academy_id,
        'club_id',v_club.id,
        'manual_section','youth-academy',
        'academy_url','/dashboard/youth-academy',
        'manual_url','/dashboard/manual?section=youth-academy',
        'season_number',v_season
      ),
      'youth-academy-started:'||v_academy_id::text,
      null
    );
  end if;

  return public.get_my_youth_academy_v1();
end;
$function$;

revoke all on function public.activate_my_youth_academy_v1(bigint)
from public,anon;
grant execute on function public.activate_my_youth_academy_v1(bigint)
to authenticated;

create or replace function public.get_my_youth_academy_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_premium boolean:=false;
  v_budget jsonb;
  v_settings jsonb;
  v_riders jsonb;
  v_staff jsonb;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at asc limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'premium',v_premium,'activated',false,
      'club_id',v_club.id,'club_name',v_club.name,
      'country_code',v_club.country_code,'capacity',16,'starter_riders',6,
      'default_season_budget',100000,'default_scouting_range','local',
      'default_scouting_cost',5000
    );
  end if;

  select to_jsonb(b) into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select to_jsonb(s) into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'display_name',r.display_name,'country_code',r.country_code,
    'age',private.youth_academy_age_v1(r.birth_date),'role',r.role,
    'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
    'development_focus',r.development_focus,'workload',r.workload,
    'readiness',r.readiness,'fatigue',r.fatigue,'status',r.status,
    'stipend_weekly',coalesce(agr.stipend_weekly,0)
  ) order by r.birth_date),'[]'::jsonb)
  into v_riders
  from public.youth_riders r
  left join public.youth_rider_agreements agr
    on agr.youth_rider_id=r.id and agr.status='active'
  where r.academy_id=v_academy.id
    and r.status in ('academy','graduating');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',cs.id,'role_type',cs.role_type,'specialization',cs.specialization,
    'team_scope',cs.team_scope,'staff_name',cs.staff_name,
    'first_name',cs.first_name,'last_name',cs.last_name,
    'country_code',cs.country_code,'birth_date',cs.birth_date,
    'expertise',cs.expertise,'experience',cs.experience,
    'potential',cs.potential,'leadership',cs.leadership,
    'efficiency',cs.efficiency,'loyalty',cs.loyalty,
    'salary_weekly',cs.salary_weekly,
    'contract_expires_at',cs.contract_expires_at
  ) order by
    case cs.role_type
      when 'youth_academy_director' then 1
      when 'u16_head_coach' then 2
      when 'youth_scout' then 3 else 9 end,
    cs.staff_name
  ),'[]'::jsonb)
  into v_staff
  from public.club_staff cs
  where cs.club_id=v_club.id and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  return jsonb_build_object(
    'premium',v_premium,'activated',true,'read_only',not v_premium,
    'club_id',v_club.id,'club_name',v_club.name,'country_code',v_club.country_code,
    'academy',jsonb_build_object(
      'id',v_academy.id,'capacity',16,
      'active_riders',jsonb_array_length(v_riders),
      'reputation',v_academy.reputation,
      'activated_season',v_academy.activated_season
    ),
    'budget',coalesce(v_budget,'{}'::jsonb),
    'settings',coalesce(v_settings,'{}'::jsonb),
    'riders',v_riders,'staff',v_staff,
    'scouting_programs',(
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order),'[]'::jsonb)
      from public.youth_academy_scouting_programs p where p.is_active=true
    )
  );
end;
$function$;

revoke all on function public.get_my_youth_academy_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_v1()
to authenticated;

create or replace function public.update_my_youth_academy_settings_v2(
  p_recruitment_decider text default null,
  p_race_entry_decider text default null,
  p_race_squad_decider text default null,
  p_camp_decider text default null,
  p_equipment_decider text default null,
  p_recruitment_negotiation_decider text default null,
  p_scouting_range text default null,
  p_season_budget bigint default null,
  p_auto_recruit_min_band text default null,
  p_auto_recruit_max_stipend_weekly integer default null,
  p_auto_recruit_max_compensation bigint default null,
  p_auto_recruit_min_free_slots smallint default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_scout_cost bigint;
  v_old_budget public.youth_academy_season_budgets%rowtype;
  v_new_scout_commit bigint;
  v_other_commit bigint;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  update public.youth_academy_settings s
  set
    recruitment_decider=coalesce(p_recruitment_decider,s.recruitment_decider),
    race_entry_decider=coalesce(p_race_entry_decider,s.race_entry_decider),
    race_squad_decider=coalesce(p_race_squad_decider,s.race_squad_decider),
    camp_decider=coalesce(p_camp_decider,s.camp_decider),
    equipment_decider=coalesce(p_equipment_decider,s.equipment_decider),
    recruitment_negotiation_decider=coalesce(
      p_recruitment_negotiation_decider,s.recruitment_negotiation_decider
    ),
    auto_recruit_min_band=coalesce(
      p_auto_recruit_min_band,s.auto_recruit_min_band
    ),
    auto_recruit_max_stipend_weekly=coalesce(
      p_auto_recruit_max_stipend_weekly,s.auto_recruit_max_stipend_weekly
    ),
    auto_recruit_max_compensation=coalesce(
      p_auto_recruit_max_compensation,s.auto_recruit_max_compensation
    ),
    auto_recruit_min_free_slots=coalesce(
      p_auto_recruit_min_free_slots,s.auto_recruit_min_free_slots
    ),
    updated_at=now()
  where s.academy_id=v_academy_id;

  select * into v_old_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy_id and b.season_number=v_season
  for update;

  if v_old_budget.academy_id is null then
    raise exception 'Youth Academy season budget not found';
  end if;

  if p_scouting_range is not null then
    select p.season_cost into v_scout_cost
    from public.youth_academy_scouting_programs p
    where p.range_code=p_scouting_range and p.is_active=true;
    if v_scout_cost is null then raise exception 'Invalid scouting range'; end if;
  else
    v_scout_cost:=v_old_budget.scouting_budget;
  end if;

  v_other_commit:=greatest(
    0,v_old_budget.committed_amount-v_old_budget.scouting_committed_amount
  );
  v_new_scout_commit:=coalesce(v_scout_cost,0);

  if v_old_budget.season_budget<
     v_old_budget.spent_amount+v_other_commit+v_new_scout_commit then
    raise exception
      'Current Youth Academy funds are below spending and commitments. Required minimum: %.',
      v_old_budget.spent_amount+v_other_commit+v_new_scout_commit;
  end if;

  update public.youth_academy_season_budgets b
  set scouting_range=coalesce(p_scouting_range,b.scouting_range),
      scouting_budget=v_new_scout_commit,
      scouting_committed_amount=v_new_scout_commit,
      committed_amount=v_other_commit+v_new_scout_commit,
      updated_at=now()
  where b.academy_id=v_academy_id and b.season_number=v_season;

  return public.get_my_youth_academy_v1();
end;
$function$;

revoke all on function public.update_my_youth_academy_settings_v2(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) from public,anon;
grant execute on function public.update_my_youth_academy_settings_v2(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) to authenticated;

create or replace function public.get_my_youth_academy_finances_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_rider_weekly bigint:=0;
  v_staff_weekly bigint:=0;
  v_senior_cash numeric:=0;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_academy.id is null then return jsonb_build_object('activated',false); end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select coalesce(sum(a.stipend_weekly+a.accommodation_weekly),0)
  into v_rider_weekly
  from public.youth_rider_agreements a
  where a.academy_id=v_academy.id and a.status='active';

  select coalesce(sum(cs.salary_weekly),0)
  into v_staff_weekly
  from public.club_staff cs
  where cs.club_id=v_academy.club_id and cs.is_active=true
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  v_senior_cash:=coalesce(public.finance_get_club_cash_balance(v_academy.club_id),0);

  return jsonb_build_object(
    'activated',true,'season_number',v_season,
    'initial_allocation',coalesce(v_budget.initial_allocation,0),
    'season_budget',coalesce(v_budget.season_budget,0),
    'spent_amount',coalesce(v_budget.spent_amount,0),
    'committed_amount',coalesce(v_budget.committed_amount,0),
    'available_amount',greatest(
      0,coalesce(v_budget.season_budget,0)
      -coalesce(v_budget.spent_amount,0)
      -coalesce(v_budget.committed_amount,0)
    ),
    'senior_cash_balance',v_senior_cash,
    'weekly_rider_support',v_rider_weekly,
    'weekly_staff_salary',v_staff_weekly,
    'weekly_operating_commitment',v_rider_weekly+v_staff_weekly,
    'equipment_spend',coalesce((
      select sum(e.purchase_cost)
      from public.youth_academy_equipment_inventory e
      where e.academy_id=v_academy.id and e.season_number=v_season
    ),0),
    'race_income',coalesce((
      select sum(l.amount)
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='race_prize' and l.amount>0
    ),0),
    'budget_transfer_in',coalesce((
      select sum(l.amount)
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='budget_transfer_in'
        and coalesce(l.metadata->>'initial_allocation','false')<>'true'
        and l.amount>0
    ),0),
    'budget_transfer_out',coalesce((
      select abs(sum(l.amount))
      from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='budget_transfer_out' and l.amount<0
    ),0),
    'ledger',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',x.id,'game_date',x.game_date,'category',x.category,
        'description',x.description,'amount',x.amount
      ) order by x.game_date desc,x.created_at desc)
      from (
        select l.*
        from public.youth_academy_ledger l
        where l.academy_id=v_academy.id and l.season_number=v_season
        order by l.game_date desc,l.created_at desc limit 75
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_academy_finances_v1()
from public,anon;
grant execute on function public.get_my_youth_academy_finances_v1()
to authenticated;

create or replace function public.transfer_my_youth_academy_budget_v1(
  p_direction text,p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_game_date date:=public.get_current_game_date_date();
  v_direction text:=lower(trim(coalesce(p_direction,'')));
  v_available bigint;
  v_senior_cash numeric;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;
  if p_amount is null or p_amount<=0 then
    raise exception 'Transfer amount must be greater than zero.';
  end if;
  if v_direction not in ('senior_to_youth','youth_to_senior') then
    raise exception 'Invalid Youth Academy budget transfer direction.';
  end if;

  select a.* into v_academy
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user and c.deleted_at is null and a.is_active=true
  limit 1;

  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  perform pg_advisory_xact_lock(hashtext('youth-budget-transfer:'||v_academy.id::text));

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season
  for update;

  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;

  v_available:=greatest(
    v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount,0
  );

  if v_direction='senior_to_youth' then
    v_senior_cash:=coalesce(public.finance_get_club_cash_balance(v_academy.club_id),0);
    if v_senior_cash<p_amount then
      raise exception 'Senior team does not have enough available cash.';
    end if;

    perform public.finance_spend_from_club(
      v_academy.club_id,p_amount,'youth_academy_budget_transfer','SINK',null,
      jsonb_build_object(
        'academy_id',v_academy.id,'season_number',v_season,
        'direction','senior_to_youth'
      )
    );

    update public.youth_academy_season_budgets
    set season_budget=season_budget+p_amount,updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy.id,v_season,v_game_date,'budget_transfer_in',
      'Budget transfer from senior team',p_amount,
      jsonb_build_object('source','senior_team','initial_allocation',false)
    );
  else
    if p_amount>v_available then
      raise exception 'Youth Academy has only % available to return.',v_available;
    end if;

    update public.youth_academy_season_budgets
    set season_budget=season_budget-p_amount,updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    perform public.finance_credit_to_club(
      v_academy.club_id,p_amount,'youth_academy_budget_return','SINK',null,
      jsonb_build_object(
        'academy_id',v_academy.id,'season_number',v_season,
        'direction','youth_to_senior'
      )
    );

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_academy.id,v_season,v_game_date,'budget_transfer_out',
      'Budget returned to senior team',-p_amount,
      jsonb_build_object('destination','senior_team')
    );
  end if;

  return public.get_my_youth_academy_finances_v1();
end;
$function$;

revoke all on function public.transfer_my_youth_academy_budget_v1(text,bigint)
from public,anon;
grant execute on function public.transfer_my_youth_academy_budget_v1(text,bigint)
to authenticated;

create or replace function public.get_my_youth_rider_profile_v1(
  p_youth_rider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_rider public.youth_riders%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select yr into v_rider
  from public.youth_riders yr
  join public.youth_academies ya on ya.id=yr.academy_id
  join public.clubs c on c.id=ya.club_id
  where yr.id=p_youth_rider_id
    and c.owner_user_id=v_user and c.deleted_at is null
  limit 1;

  if v_rider.id is null then
    raise exception 'Youth Rider not found in your Academy.';
  end if;

  return jsonb_build_object(
    'id',v_rider.id,'display_name',v_rider.display_name,
    'country_code',v_rider.country_code,'birth_date',v_rider.birth_date,
    'age',private.youth_academy_age_v1(v_rider.birth_date),
    'role',v_rider.role,
    'assessment_band',private.youth_potential_band_v1(v_rider.hidden_potential),
    'development_focus',v_rider.development_focus,'workload',v_rider.workload,
    'readiness',v_rider.readiness,'fatigue',v_rider.fatigue,
    'status',v_rider.status,'joined_game_date',v_rider.joined_game_date,
    'joined_season',v_rider.joined_season,
    'is_starter_rider',v_rider.is_starter_rider,
    'attributes',jsonb_build_object(
      'sprint',v_rider.sprint,'climbing',v_rider.climbing,
      'time_trial',v_rider.time_trial,'endurance',v_rider.endurance,
      'flat',v_rider.flat,'recovery',v_rider.recovery,
      'resistance',v_rider.resistance,'race_iq',v_rider.race_iq,
      'teamwork',v_rider.teamwork
    ),
    'agreement',coalesce((
      select jsonb_build_object(
        'stipend_weekly',a.stipend_weekly,
        'accommodation_weekly',a.accommodation_weekly,
        'starts_on',a.starts_on,'ends_on',a.ends_on,'status',a.status
      )
      from public.youth_rider_agreements a
      where a.youth_rider_id=v_rider.id
      order by (a.status='active') desc,a.updated_at desc limit 1
    ),'{}'::jsonb),
    'race_summary',jsonb_build_object(
      'starts',(select count(distinct rr.race_id) from public.youth_race_results rr where rr.youth_rider_id=v_rider.id and rr.result_status in ('finished','dnf')),
      'wins',(select count(*) from public.youth_race_results rr where rr.youth_rider_id=v_rider.id and rr.finish_position=1),
      'podiums',(select count(*) from public.youth_race_results rr where rr.youth_rider_id=v_rider.id and rr.finish_position between 1 and 3),
      'regional_points',coalesce((select sum(rr.regional_points) from public.youth_race_results rr where rr.youth_rider_id=v_rider.id),0),
      'world_points',coalesce((select sum(rr.world_points) from public.youth_race_results rr where rr.youth_rider_id=v_rider.id),0)
    ),
    'recent_results',coalesce((
      select jsonb_agg(jsonb_build_object(
        'race_id',x.race_id,'race_name',x.race_name,'race_date',x.race_date,
        'competition_class',x.competition_class,'result_status',x.result_status,
        'finish_position',x.finish_position,
        'regional_points',x.regional_points,'world_points',x.world_points
      ) order by x.race_date desc)
      from (
        select rr.race_id,r.race_name,r.race_date,r.competition_class,
          rr.result_status,rr.finish_position,rr.regional_points,rr.world_points
        from public.youth_race_results rr
        join public.youth_races r on r.id=rr.race_id
        where rr.youth_rider_id=v_rider.id
        order by r.race_date desc limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$function$;

revoke all on function public.get_my_youth_rider_profile_v1(uuid)
from public,anon;
grant execute on function public.get_my_youth_rider_profile_v1(uuid)
to authenticated;

create or replace function private.credit_youth_race_prizes_v1(
  p_race_id uuid
)
returns integer
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_race public.youth_races%rowtype;
  v_entry record;
  v_best integer;
  v_participation bigint;
  v_place_bonus bigint;
  v_prize bigint;
  v_count integer:=0;
begin
  select * into v_race from public.youth_races where id=p_race_id;
  if v_race.id is null then return 0; end if;

  for v_entry in
    select distinct e.academy_id
    from public.youth_race_entries e
    where e.race_id=p_race_id and e.status='completed'
  loop
    if exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_entry.academy_id
        and l.season_number=v_race.season_number
        and l.category='race_prize'
        and l.metadata->>'race_id'=p_race_id::text
    ) then continue; end if;

    select min(rr.finish_position) into v_best
    from public.youth_race_results rr
    where rr.race_id=p_race_id and rr.academy_id=v_entry.academy_id
      and rr.result_status='finished';

    v_participation:=case v_race.competition_class
      when 'world' then 250 when 'continental' then 150 else 100 end;

    v_place_bonus:=case v_race.competition_class
      when 'world' then case v_best
        when 1 then 2000 when 2 then 1400 when 3 then 1000
        when 4 then 750 when 5 then 600 when 6 then 500
        when 7 then 400 when 8 then 325 when 9 then 250
        when 10 then 200 else 0 end
      when 'continental' then case v_best
        when 1 then 1000 when 2 then 700 when 3 then 500
        when 4 then 350 when 5 then 275 when 6 then 225
        when 7 then 175 when 8 then 140 when 9 then 110
        when 10 then 90 else 0 end
      else case v_best
        when 1 then 500 when 2 then 350 when 3 then 250
        when 4 then 175 when 5 then 140 when 6 then 110
        when 7 then 90 when 8 then 70 when 9 then 55
        when 10 then 40 else 0 end
    end;

    v_prize:=v_participation+coalesce(v_place_bonus,0);

    update public.youth_academy_season_budgets
    set season_budget=season_budget+v_prize,updated_at=now()
    where academy_id=v_entry.academy_id
      and season_number=v_race.season_number;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      v_entry.academy_id,v_race.season_number,v_race.race_date,
      'race_prize','Youth race income: '||v_race.race_name,v_prize,
      jsonb_build_object(
        'race_id',p_race_id,'race_name',v_race.race_name,
        'competition_class',v_race.competition_class,
        'best_finish',v_best,'participation_income',v_participation,
        'placing_bonus',v_place_bonus
      )
    );

    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$function$;

create or replace function private.trg_credit_youth_race_prizes_v1()
returns trigger
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
begin
  if new.status='completed' and old.status is distinct from new.status then
    perform private.credit_youth_race_prizes_v1(new.id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_credit_youth_race_prizes_v1 on public.youth_races;
create trigger trg_credit_youth_race_prizes_v1
after update of status on public.youth_races
for each row execute function private.trg_credit_youth_race_prizes_v1();
