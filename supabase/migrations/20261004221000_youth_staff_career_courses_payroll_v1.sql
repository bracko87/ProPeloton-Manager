-- Youth Academy staff career, salary, course and payroll integration v1.

create or replace function private.youth_staff_quality_score_v1(
  p_role_type text,
  p_expertise integer,
  p_experience integer,
  p_potential integer,
  p_leadership integer,
  p_efficiency integer,
  p_loyalty integer
)
returns integer
language sql
immutable
set search_path=pg_catalog,pg_temp
as $function$
  select least(100,greatest(0,round(
    case lower(coalesce(p_role_type,''))
      when 'youth_academy_director' then
        coalesce(p_expertise,0)*0.20+
        coalesce(p_experience,0)*0.15+
        coalesce(p_potential,0)*0.10+
        coalesce(p_leadership,0)*0.25+
        coalesce(p_efficiency,0)*0.25+
        coalesce(p_loyalty,0)*0.05
      when 'u16_head_coach' then
        coalesce(p_expertise,0)*0.30+
        coalesce(p_experience,0)*0.10+
        coalesce(p_potential,0)*0.20+
        coalesce(p_leadership,0)*0.10+
        coalesce(p_efficiency,0)*0.25+
        coalesce(p_loyalty,0)*0.05
      when 'youth_scout' then
        coalesce(p_expertise,0)*0.35+
        coalesce(p_experience,0)*0.20+
        coalesce(p_potential,0)*0.10+
        coalesce(p_leadership,0)*0.05+
        coalesce(p_efficiency,0)*0.25+
        coalesce(p_loyalty,0)*0.05
      else (
        coalesce(p_expertise,0)+coalesce(p_experience,0)+coalesce(p_potential,0)+
        coalesce(p_leadership,0)+coalesce(p_efficiency,0)+coalesce(p_loyalty,0)
      )/6.0
    end
  )::integer));
$function$;

revoke all on function private.youth_staff_quality_score_v1(
  text,integer,integer,integer,integer,integer,integer
) from public,anon,authenticated;

create or replace function public.staff_role_quality_tier(
  p_role_type text,
  p_expertise integer,
  p_experience integer,
  p_potential integer,
  p_leadership integer,
  p_efficiency integer,
  p_loyalty integer
)
returns text
language plpgsql
immutable
set search_path=public,private,pg_temp
as $function$
declare
  v_role text:=lower(coalesce(trim(p_role_type),''));
  v_avg integer;
begin
  if v_role in ('youth_academy_director','u16_head_coach','youth_scout') then
    v_avg:=private.youth_staff_quality_score_v1(
      v_role,p_expertise,p_experience,p_potential,p_leadership,p_efficiency,p_loyalty
    );
  elsif v_role='head_coach' then
    v_avg:=round((coalesce(p_expertise,0)+coalesce(p_efficiency,0)+coalesce(p_potential,0))/3.0);
  elsif v_role='team_doctor' then
    v_avg:=round((coalesce(p_expertise,0)+coalesce(p_efficiency,0)+coalesce(p_experience,0))/3.0);
  elsif v_role='mechanic' then
    v_avg:=round((coalesce(p_expertise,0)+coalesce(p_efficiency,0)+coalesce(p_potential,0))/3.0);
  elsif v_role='sport_director' then
    v_avg:=round((coalesce(p_expertise,0)+coalesce(p_leadership,0)+coalesce(p_efficiency,0))/3.0);
  elsif v_role='scout_analyst' then
    v_avg:=round((coalesce(p_expertise,0)+coalesce(p_experience,0)+coalesce(p_efficiency,0))/3.0);
  else
    v_avg:=round((
      coalesce(p_expertise,0)+coalesce(p_experience,0)+coalesce(p_potential,0)+
      coalesce(p_leadership,0)+coalesce(p_efficiency,0)+coalesce(p_loyalty,0)
    )/6.0);
  end if;
  return public.staff_skill_tier_label(v_avg);
end;
$function$;

create or replace function public.get_staff_role_skill_profile(
  p_role_type text,
  p_expertise integer,
  p_experience integer,
  p_potential integer,
  p_leadership integer,
  p_efficiency integer,
  p_loyalty integer
)
returns jsonb
language plpgsql
immutable
set search_path=public,private,pg_temp
as $function$
declare
  v_role text:=coalesce(trim(lower(p_role_type)),'');
begin
  if v_role='youth_academy_director' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','academy_management','label','Academy Management','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','programme_efficiency','label','Programme Efficiency','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency)),
        jsonb_build_object('key','talent_pathways','label','Talent Pathways','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','experience','label','Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','potential','label','Potential','value',p_potential,'tier',public.staff_skill_tier_label(p_potential)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='u16_head_coach' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','youth_development','label','Youth Development','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','workload_management','label','Workload Management','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency)),
        jsonb_build_object('key','development_ceiling','label','Development Ceiling','value',p_potential,'tier',public.staff_skill_tier_label(p_potential))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','experience','label','Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='youth_scout' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','talent_identification','label','Talent Identification','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','scouting_experience','label','Scouting Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','assessment_accuracy','label','Assessment Accuracy','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','potential','label','Potential','value',p_potential,'tier',public.staff_skill_tier_label(p_potential)),
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='head_coach' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','training_methodology','label','Training Methodology','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','recovery_planning','label','Recovery Planning','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency)),
        jsonb_build_object('key','youth_development','label','Youth Development','value',p_potential,'tier',public.staff_skill_tier_label(p_potential))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','experience','label','Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='team_doctor' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','diagnosis','label','Diagnosis','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','rehabilitation','label','Rehabilitation','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency)),
        jsonb_build_object('key','injury_prevention','label','Injury Prevention','value',p_experience,'tier',public.staff_skill_tier_label(p_experience))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','potential','label','Potential','value',p_potential,'tier',public.staff_skill_tier_label(p_potential)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='mechanic' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','bike_setup','label','Bike Setup','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','reliability','label','Reliability','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency)),
        jsonb_build_object('key','technical_adaptation','label','Technical Adaptation','value',p_potential,'tier',public.staff_skill_tier_label(p_potential))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','experience','label','Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='sport_director' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','race_tactics','label','Race Tactics','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','motivation','label','Motivation','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','organization','label','Organization','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','experience','label','Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','potential','label','Potential','value',p_potential,'tier',public.staff_skill_tier_label(p_potential)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  elsif v_role='scout_analyst' then
    return jsonb_build_object(
      'roleSkills',jsonb_build_array(
        jsonb_build_object('key','talent_evaluation','label','Talent Evaluation','value',p_expertise,'tier',public.staff_skill_tier_label(p_expertise)),
        jsonb_build_object('key','scouting_experience','label','Scouting Experience','value',p_experience,'tier',public.staff_skill_tier_label(p_experience)),
        jsonb_build_object('key','data_analysis','label','Data Analysis','value',p_efficiency,'tier',public.staff_skill_tier_label(p_efficiency))
      ),
      'supportSkills',jsonb_build_array(
        jsonb_build_object('key','leadership','label','Leadership','value',p_leadership,'tier',public.staff_skill_tier_label(p_leadership)),
        jsonb_build_object('key','potential','label','Potential','value',p_potential,'tier',public.staff_skill_tier_label(p_potential)),
        jsonb_build_object('key','loyalty','label','Loyalty','value',p_loyalty,'tier',public.staff_skill_tier_label(p_loyalty))
      )
    );
  end if;
  return jsonb_build_object('roleSkills','[]'::jsonb,'supportSkills','[]'::jsonb);
end;
$function$;

create or replace function private.youth_academy_director_score_v1(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select coalesce((
    select private.youth_staff_quality_score_v1(
      cs.role_type,cs.expertise,cs.experience,cs.potential,
      cs.leadership,cs.efficiency,cs.loyalty
    )
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true
      and cs.role_type='youth_academy_director'
    order by cs.expertise desc,cs.id
    limit 1
  ),0);
$function$;

revoke all on function private.youth_academy_director_score_v1(uuid)
from public,anon,authenticated;

create or replace function private.youth_academy_director_discount_pct_v1(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path=public,private,pg_temp
as $function$
  select least(8,greatest(0,floor(
    (private.youth_academy_director_score_v1(p_club_id)-45)/6.0
  )::integer));
$function$;

revoke all on function private.youth_academy_director_discount_pct_v1(uuid)
from public,anon,authenticated;

create or replace function private.purchase_youth_academy_equipment_v1(
  p_academy_id uuid,
  p_catalog_item_id uuid,
  p_require_manager boolean default true
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_academy public.youth_academies%rowtype;
  v_catalog public.equipment_catalog%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_game_date date:=public.get_current_game_date_date();
  v_decider text:='manager';
  v_item_id uuid;
  v_discount_pct integer:=0;
  v_purchase_cost bigint:=0;
begin
  select * into v_academy from public.youth_academies
  where id=p_academy_id and is_active=true for update;
  if v_academy.id is null then raise exception 'Youth Academy is not active'; end if;

  select coalesce(s.equipment_decider,'manager') into v_decider
  from public.youth_academy_settings s where s.academy_id=p_academy_id;
  if p_require_manager and v_decider<>'manager' then
    raise exception 'Equipment purchasing is delegated to the Youth Academy Director.';
  end if;

  select * into v_catalog from public.equipment_catalog ec
  where ec.id=p_catalog_item_id and ec.is_active=true
    and ec.equipment_kind='durable' and ec.tier between 1 and 2
    and ec.equipment_category in ('frame','wheelset','tires','groupset','helmet','shoes');
  if v_catalog.id is null then raise exception 'This item is not available to the Youth Academy.'; end if;

  v_discount_pct:=private.youth_academy_director_discount_pct_v1(v_academy.club_id);
  v_purchase_cost:=greatest(0,round(v_catalog.base_price_cash*(1-v_discount_pct/100.0))::bigint);

  select * into v_budget from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id and b.season_number=v_season for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_purchase_cost>greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this equipment purchase.';
  end if;

  insert into public.youth_academy_equipment_inventory(
    academy_id,season_number,catalog_item_id,equipment_category,display_name,
    quality_score,durability_score,condition_percent,purchase_cost,status,purchased_on,metadata
  )
  values(
    p_academy_id,v_season,v_catalog.id,v_catalog.equipment_category,v_catalog.display_name,
    v_catalog.quality_score,v_catalog.durability_score,100,v_purchase_cost,'available',v_game_date,
    jsonb_build_object(
      'catalog_tier',v_catalog.tier,'catalog_metadata',v_catalog.metadata,
      'catalog_effects',v_catalog.effects,'academy_director_discount_pct',v_discount_pct,
      'catalog_base_price',v_catalog.base_price_cash
    )
  ) returning id into v_item_id;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_purchase_cost,updated_at=now()
  where academy_id=p_academy_id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  )
  values(
    p_academy_id,v_season,v_game_date,'equipment',
    'Youth Academy equipment: '||v_catalog.display_name,-v_purchase_cost,
    jsonb_build_object(
      'inventory_item_id',v_item_id,'catalog_item_id',v_catalog.id,
      'equipment_category',v_catalog.equipment_category,
      'academy_director_discount_pct',v_discount_pct
    )
  );
  return v_item_id;
end;
$function$;

revoke all on function private.purchase_youth_academy_equipment_v1(uuid,uuid,boolean)
from public,anon,authenticated;

create or replace function public.start_youth_staff_course_v1(
  p_staff_id uuid,
  p_course_code text
)
returns public.staff_courses
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_staff public.club_staff%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_title text;
  v_focus text;
  v_days integer;
  v_cost bigint;
  v_expertise smallint:=0;
  v_experience smallint:=0;
  v_potential smallint:=0;
  v_leadership smallint:=0;
  v_efficiency smallint:=0;
  v_loyalty smallint:=0;
  v_course public.staff_courses%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required for Youth Academy staff courses.';
  end if;

  select cs.* into v_staff
  from public.club_staff cs
  join public.clubs c on c.id=cs.club_id
  where cs.id=p_staff_id and cs.is_active=true and c.owner_user_id=v_user
    and c.deleted_at is null
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout')
  limit 1;
  if v_staff.id is null then raise exception 'Active Youth Academy staff member not found'; end if;

  select a.* into v_academy from public.youth_academies a
  where a.club_id=v_staff.club_id and a.is_active=true limit 1;
  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  if exists(select 1 from public.staff_courses sc where sc.staff_id=v_staff.id and sc.status='active') then
    raise exception 'This staff member is already on a course';
  end if;

  if v_staff.role_type='youth_academy_director' then
    case p_course_code
      when 'youth_director_programme_management' then
        v_title:='Academy Programme Management';v_focus:='Leadership + Efficiency';v_days:=30;v_cost:=16000;v_leadership:=1;v_efficiency:=2;
      when 'youth_director_budget_pathways' then
        v_title:='Academy Budget & Pathways';v_focus:='Academy Management + Efficiency';v_days:=45;v_cost:=26000;v_expertise:=2;v_efficiency:=1;
      when 'youth_director_recruitment_strategy' then
        v_title:='Youth Recruitment Strategy';v_focus:='Talent Pathways + Leadership';v_days:=60;v_cost:=38000;v_potential:=2;v_leadership:=1;v_experience:=1;
      else raise exception 'Invalid Youth Academy Director course';
    end case;
  elsif v_staff.role_type='u16_head_coach' then
    case p_course_code
      when 'u16_development_methodology' then
        v_title:='U16 Development Methodology';v_focus:='Youth Development + Potential';v_days:=30;v_cost:=16000;v_expertise:=2;v_potential:=1;
      when 'u16_workload_management' then
        v_title:='U16 Workload Management';v_focus:='Efficiency + Experience';v_days:=45;v_cost:=26000;v_efficiency:=2;v_experience:=1;
      when 'u16_race_coaching' then
        v_title:='U16 Race Coaching Programme';v_focus:='Race Coaching + Leadership';v_days:=60;v_cost:=38000;v_expertise:=1;v_leadership:=1;v_efficiency:=1;
      else raise exception 'Invalid U16 Head Coach course';
    end case;
  elsif v_staff.role_type='youth_scout' then
    case p_course_code
      when 'youth_scout_talent_id' then
        v_title:='Youth Talent Identification';v_focus:='Talent ID + Accuracy';v_days:=30;v_cost:=16000;v_expertise:=2;v_efficiency:=1;
      when 'youth_scout_network_building' then
        v_title:='Youth Scouting Network';v_focus:='Network + Experience';v_days:=45;v_cost:=24000;v_experience:=2;v_leadership:=1;
      when 'youth_scout_assessment_accuracy' then
        v_title:='Youth Assessment Accuracy';v_focus:='Accuracy + Potential';v_days:=60;v_cost:=36000;v_efficiency:=2;v_potential:=1;v_expertise:=1;
      else raise exception 'Invalid Youth Scout course';
    end case;
  end if;

  select * into v_budget from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season for update;
  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;
  if v_cost>greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount) then
    raise exception 'Youth Academy budget is too low for this staff course.';
  end if;

  update public.youth_academy_season_budgets
  set spent_amount=spent_amount+v_cost,updated_at=now()
  where academy_id=v_academy.id and season_number=v_season;

  insert into public.youth_academy_ledger(
    academy_id,season_number,game_date,category,description,amount,metadata
  ) values(
    v_academy.id,v_season,v_game_date,'staff_course',
    'Youth staff course: '||v_title,-v_cost,
    jsonb_build_object('staff_id',v_staff.id,'staff_name',v_staff.staff_name,'course_code',p_course_code)
  );

  insert into public.staff_courses(
    club_id,staff_id,course_code,course_title,focus_label,status,
    started_game_date,completes_on_game_date,duration_days,cost_cash,
    expertise_gain,experience_gain,potential_gain,leadership_gain,
    efficiency_gain,loyalty_gain,metadata
  ) values(
    v_staff.club_id,v_staff.id,p_course_code,v_title,v_focus,'active',
    v_game_date,v_game_date+v_days,v_days,v_cost,
    v_expertise,v_experience,v_potential,v_leadership,v_efficiency,v_loyalty,
    jsonb_build_object('role_type',v_staff.role_type,'staff_name',v_staff.staff_name,'paid_from','youth_academy_budget')
  ) returning * into v_course;
  return v_course;
end;
$function$;

revoke all on function public.start_youth_staff_course_v1(uuid,text) from public,anon;
grant execute on function public.start_youth_staff_course_v1(uuid,text) to authenticated;

create or replace function private.trg_normalize_youth_staff_candidate_salary_v1()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $function$
begin
  if new.role_type in ('youth_academy_director','u16_head_coach','youth_scout') then
    new.salary_weekly:=public.calculate_staff_weekly_salary(
      new.role_type,new.expertise,new.experience,new.potential,
      new.leadership,new.efficiency,new.loyalty,'youth'
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_normalize_youth_staff_candidate_salary_v1 on public.staff_candidates;
create trigger trg_normalize_youth_staff_candidate_salary_v1
before insert or update of role_type,expertise,experience,potential,leadership,efficiency,loyalty
on public.staff_candidates
for each row execute function private.trg_normalize_youth_staff_candidate_salary_v1();

update public.staff_candidates sc
set salary_weekly=public.calculate_staff_weekly_salary(
  sc.role_type,sc.expertise,sc.experience,sc.potential,
  sc.leadership,sc.efficiency,sc.loyalty,'youth'
)
where sc.is_available=true
  and sc.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

create or replace function public.get_club_staff_weekly_wages(p_club_id uuid)
returns table(staff_count integer,total_wages bigint)
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select count(*)::integer,coalesce(sum(cs.salary_weekly),0)::bigint
  from public.club_staff cs
  where cs.club_id=p_club_id and cs.is_active=true
    and cs.role_type not in ('youth_academy_director','u16_head_coach','youth_scout');
$function$;

create or replace function private.process_youth_academy_weekly_payroll_v1(p_game_date date)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_academy record;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_week_start date:=date_trunc('week',p_game_date)::date;
  v_rider_cost bigint;
  v_staff_cost bigint;
  v_total bigint;
  v_processed integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then
    return jsonb_build_object('weekly_run',false,'processed',0);
  end if;

  for v_academy in
    select a.id,a.club_id
    from public.youth_academies a
    where a.is_active=true
  loop
    if exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=v_academy.id and l.season_number=v_season
        and l.category='weekly_payroll'
        and l.metadata->>'week_start'=v_week_start::text
    ) then continue; end if;

    select coalesce(sum(agr.stipend_weekly+agr.accommodation_weekly),0)::bigint
    into v_rider_cost
    from public.youth_rider_agreements agr
    where agr.academy_id=v_academy.id and agr.status='active';

    select coalesce(sum(cs.salary_weekly),0)::bigint
    into v_staff_cost
    from public.club_staff cs
    where cs.club_id=v_academy.club_id and cs.is_active=true
      and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

    v_total:=coalesce(v_rider_cost,0)+coalesce(v_staff_cost,0);

    update public.youth_academy_season_budgets
    set spent_amount=spent_amount+v_total,
        committed_amount=greatest(
          scouting_committed_amount,
          committed_amount-least(committed_amount-scouting_committed_amount,greatest(v_rider_cost,0))
        ),
        updated_at=now()
    where academy_id=v_academy.id and season_number=v_season;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    ) values(
      v_academy.id,v_season,p_game_date,'weekly_payroll',
      'Youth Academy weekly rider support and staff payroll',-v_total,
      jsonb_build_object(
        'week_start',v_week_start,'rider_support',v_rider_cost,
        'staff_salary',v_staff_cost,'total',v_total
      )
    );
    v_processed:=v_processed+1;
  end loop;

  return jsonb_build_object(
    'weekly_run',true,'week_start',v_week_start,'processed',v_processed
  );
end;
$function$;

revoke all on function private.process_youth_academy_weekly_payroll_v1(date)
from public,anon,authenticated;

create or replace function public.process_youth_academy_game_day_v1(p_game_date date)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_dev jsonb;
  v_races jsonb;
  v_payroll jsonb;
  v_rider record;
  v_ai_graduated integer:=0;
  v_ai_released integer:=0;
  v_human_pending integer:=0;
  v_pathway_expired integer:=0;
  v_can_develop boolean;
begin
  v_payroll:=private.process_youth_academy_weekly_payroll_v1(p_game_date);
  v_dev:=private.process_youth_development_week_v1(p_game_date);
  v_races:=public.process_youth_race_day_v1(p_game_date);

  for v_rider in
    select r.id,r.academy_id,a.is_ai,a.club_id,r.hidden_potential
    from public.youth_riders r join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and extract(year from age(p_game_date,r.birth_date))::integer>=16
      and not exists(select 1 from public.youth_graduation_records g where g.youth_rider_id=r.id)
  loop
    insert into public.youth_graduation_records(
      youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
    ) values(v_rider.id,v_rider.academy_id,v_rider.club_id,p_game_date,'pending');
    update public.youth_riders set status='graduating',updated_at=now() where id=v_rider.id;

    if v_rider.is_ai then
      select exists(
        select 1 from public.clubs d
        where d.parent_club_id=v_rider.club_id and d.club_type='developing'
          and d.deleted_at is null and public.is_developing_team_access_active_v1(d.id)
          and (select count(*) from public.club_riders cr where cr.club_id=d.id)<8
      ) into v_can_develop;
      if v_can_develop and v_rider.hidden_potential>=64 then
        perform private.complete_youth_graduation_v1(v_rider.id,'developing_team',p_game_date,'ai_academy');
        v_ai_graduated:=v_ai_graduated+1;
      else
        perform private.complete_youth_graduation_v1(v_rider.id,'release',p_game_date,'ai_academy');
        v_ai_released:=v_ai_released+1;
      end if;
    else
      v_human_pending:=v_human_pending+1;
    end if;
  end loop;

  for v_rider in
    select g.youth_rider_id
    from public.youth_graduation_records g
    join public.youth_academies a on a.id=g.academy_id
    where g.decision='pathway' and g.completed_on is null
      and g.pathway_expires_on is not null and g.pathway_expires_on<=p_game_date
      and a.is_ai=false
  loop
    perform private.complete_youth_graduation_v1(
      v_rider.youth_rider_id,'release',p_game_date,'pathway_expiry'
    );
    v_pathway_expired:=v_pathway_expired+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,'payroll',v_payroll,'development',v_dev,'races',v_races,
    'ai_graduated_to_developing',v_ai_graduated,'ai_released',v_ai_released,
    'human_graduation_decisions_created',v_human_pending,
    'expired_pathways_released',v_pathway_expired
  );
end;
$function$;

revoke all on function public.process_youth_academy_game_day_v1(date)
from public,anon,authenticated;
grant execute on function public.process_youth_academy_game_day_v1(date) to service_role;
