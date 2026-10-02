-- Premium Youth Academy / U16 - Phase 2C
-- Slow weekly development, Head Coach workload planning, age-16 graduation,
-- and AI Academy season lifecycle.

alter table public.youth_academy_settings
  add column if not exists training_philosophy text not null default 'balanced'
    check(training_philosophy in ('freshness','balanced','development'));

create table if not exists public.youth_development_weekly_runs(
  youth_rider_id uuid not null references public.youth_riders(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  week_start date not null,
  processed_on date not null,
  age smallint not null,
  coach_score smallint not null,
  workload text not null,
  development_focus text not null,
  attribute_changed text,
  primary_delta smallint not null default 0,
  secondary_attribute_changed text,
  secondary_delta smallint not null default 0,
  readiness_before smallint not null,
  readiness_after smallint not null,
  fatigue_before smallint not null,
  fatigue_after smallint not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key(youth_rider_id,week_start)
);

create table if not exists public.youth_graduation_records(
  id uuid primary key default gen_random_uuid(),
  youth_rider_id uuid not null unique references public.youth_riders(id) on delete cascade,
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  main_club_id uuid not null references public.clubs(id) on delete cascade,
  became_eligible_on date not null,
  decision text not null default 'pending'
    check(decision in ('pending','pathway','developing_team','release')),
  pathway_expires_on date,
  decided_on date,
  professional_rider_id uuid references public.riders(id) on delete set null,
  destination_club_id uuid references public.clubs(id) on delete set null,
  completed_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youth_graduation_records_academy_decision_idx
on public.youth_graduation_records(academy_id,decision,became_eligible_on);

alter table public.youth_development_weekly_runs enable row level security;
alter table public.youth_graduation_records enable row level security;

create or replace function private.youth_main_rider_role_v1(p_role text)
returns public.rider_role
language sql
immutable
set search_path=public,pg_temp
as $function$
  select case p_role
    when 'sprinter' then 'Sprinter'::public.rider_role
    when 'climber' then 'Climber'::public.rider_role
    when 'time_trial' then 'TT'::public.rider_role
    when 'domestique' then 'Domestique'::public.rider_role
    when 'breakaway' then 'Breakaway'::public.rider_role
    else 'All-rounder'::public.rider_role
  end;
$function$;

create or replace function private.youth_focus_for_role_v1(
  p_role text,
  p_focus text
)
returns text
language sql
immutable
as $function$
  select case
    when coalesce(p_focus,'balanced')<>'balanced' then p_focus
    when p_role='sprinter' then 'sprint'
    when p_role='climber' then 'climbing'
    when p_role='time_trial' then 'time_trial'
    when p_role='domestique' then 'teamwork'
    when p_role='breakaway' then 'resistance'
    else 'endurance'
  end;
$function$;

create or replace function private.youth_attribute_value_v1(
  p_rider public.youth_riders,
  p_attribute text
)
returns integer
language sql
immutable
as $function$
  select case p_attribute
    when 'sprint' then p_rider.sprint
    when 'climbing' then p_rider.climbing
    when 'time_trial' then p_rider.time_trial
    when 'endurance' then p_rider.endurance
    when 'flat' then p_rider.flat
    when 'recovery' then p_rider.recovery
    when 'resistance' then p_rider.resistance
    when 'race_iq' then p_rider.race_iq
    when 'teamwork' then p_rider.teamwork
    else 0
  end;
$function$;

create or replace function private.apply_youth_attribute_delta_v1(
  p_rider_id uuid,
  p_attribute text,
  p_delta integer
)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
begin
  if coalesce(p_delta,0)<=0 then return; end if;
  execute format(
    'update public.youth_riders set %I=least(100,%I+$1),updated_at=now() where id=$2',
    p_attribute,p_attribute
  )
  using p_delta,p_rider_id;
end;
$function$;

create or replace function private.process_youth_development_week_v1(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_rider public.youth_riders%rowtype;
  v_academy public.youth_academies%rowtype;
  v_philosophy text;
  v_age integer;
  v_coach_score integer;
  v_focus text;
  v_secondary text;
  v_workload text;
  v_age_factor numeric;
  v_workload_factor numeric;
  v_gap integer;
  v_overall numeric;
  v_chance numeric;
  v_primary_delta integer:=0;
  v_secondary_delta integer:=0;
  v_readiness_after integer;
  v_fatigue_after integer;
  v_week_start date:=date_trunc('week',p_game_date)::date;
  v_processed integer:=0;
  v_improved integer:=0;
begin
  if extract(isodow from p_game_date)::integer<>1 then
    return jsonb_build_object('processed',0,'improved',0,'weekly_run',false);
  end if;

  for v_rider in
    select r.*
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and a.is_active=true
      and private.youth_academy_age_v1(r.birth_date) between 12 and 16
  loop
    if exists(
      select 1 from public.youth_development_weekly_runs d
      where d.youth_rider_id=v_rider.id and d.week_start=v_week_start
    ) then continue; end if;

    select * into v_academy
    from public.youth_academies where id=v_rider.academy_id;

    select coalesce(s.training_philosophy,'balanced')
    into v_philosophy
    from public.youth_academy_settings s
    where s.academy_id=v_rider.academy_id;

    select coalesce(round(
      cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
    )::integer,45)
    into v_coach_score
    from public.club_staff cs
    where cs.club_id=v_academy.club_id
      and cs.role_type='u16_head_coach'
      and cs.is_active=true
    order by cs.expertise desc
    limit 1;
    v_coach_score:=coalesce(v_coach_score,45);

    v_age:=private.youth_academy_age_v1(v_rider.birth_date);

    v_workload:=case v_philosophy
      when 'freshness' then
        case when v_rider.fatigue>=25 or v_rider.readiness<70 then 'light' else 'moderate' end
      when 'development' then
        case when v_rider.fatigue<40 and v_rider.readiness>=65 then 'high' else 'moderate' end
      else
        case when v_rider.fatigue>=55 or v_rider.readiness<60 then 'light' else 'moderate' end
    end;

    v_focus:=private.youth_focus_for_role_v1(v_rider.role,v_rider.development_focus);
    v_secondary:=(array[
      'sprint','climbing','time_trial','endurance','flat',
      'recovery','resistance','race_iq','teamwork'
    ])[1+floor(random()*9)::integer];
    if v_secondary=v_focus then
      v_secondary:=case when v_focus='endurance' then 'race_iq' else 'endurance' end;
    end if;

    v_overall:=(
      v_rider.sprint+v_rider.climbing+v_rider.time_trial+v_rider.endurance+
      v_rider.flat+v_rider.recovery+v_rider.resistance+v_rider.race_iq+
      v_rider.teamwork
    )::numeric/9.0;
    v_gap:=greatest(0,v_rider.hidden_potential-round(v_overall)::integer);

    v_age_factor:=case v_age
      when 12 then 0.55 when 13 then 0.70 when 14 then 0.85
      when 15 then 1.00 else 0.90 end;
    v_workload_factor:=case v_workload
      when 'light' then 0.72 when 'high' then 1.16 else 1.00 end;

    -- Intentionally slow: usually zero or one primary point per week.
    v_chance:=least(
      0.82,
      greatest(
        0.04,
        0.12*v_age_factor*v_workload_factor
        *(0.72+v_coach_score/180.0)
        *(0.55+least(v_gap,30)/30.0)
        *(case when v_rider.fatigue>=60 then 0.55 else 1.0 end)
      )
    );

    if v_gap>0
       and private.youth_attribute_value_v1(v_rider,v_focus)<v_rider.hidden_potential
       and random()<v_chance then
      v_primary_delta:=1;
      perform private.apply_youth_attribute_delta_v1(v_rider.id,v_focus,1);
    else
      v_primary_delta:=0;
    end if;

    if v_gap>=8
       and private.youth_attribute_value_v1(v_rider,v_secondary)<v_rider.hidden_potential
       and random()<(v_chance*0.28) then
      v_secondary_delta:=1;
      perform private.apply_youth_attribute_delta_v1(v_rider.id,v_secondary,1);
    else
      v_secondary_delta:=0;
    end if;

    v_fatigue_after:=least(100,greatest(0,
      v_rider.fatigue+
      case v_workload when 'light' then -3 when 'high' then 5 else 1 end
    ));
    v_readiness_after:=least(100,greatest(0,
      v_rider.readiness+
      case v_workload when 'light' then 2 when 'high' then -2 else 0 end+
      case when v_coach_score>=75 then 1 else 0 end
    ));

    update public.youth_riders
    set workload=v_workload,
        fatigue=v_fatigue_after,
        readiness=v_readiness_after,
        updated_at=now()
    where id=v_rider.id;

    insert into public.youth_development_weekly_runs(
      youth_rider_id,academy_id,week_start,processed_on,age,coach_score,
      workload,development_focus,attribute_changed,primary_delta,
      secondary_attribute_changed,secondary_delta,readiness_before,
      readiness_after,fatigue_before,fatigue_after,metadata
    )
    values(
      v_rider.id,v_rider.academy_id,v_week_start,p_game_date,v_age,v_coach_score,
      v_workload,v_focus,
      case when v_primary_delta>0 then v_focus else null end,v_primary_delta,
      case when v_secondary_delta>0 then v_secondary else null end,v_secondary_delta,
      v_rider.readiness,v_readiness_after,v_rider.fatigue,v_fatigue_after,
      jsonb_build_object(
        'hidden_potential_gap',v_gap,
        'development_probability',round(v_chance,4),
        'training_philosophy',v_philosophy
      )
    );

    v_processed:=v_processed+1;
    if v_primary_delta+v_secondary_delta>0 then v_improved:=v_improved+1; end if;
  end loop;

  return jsonb_build_object(
    'processed',v_processed,'improved',v_improved,'weekly_run',true,
    'week_start',v_week_start
  );
end;
$function$;

create or replace function private.create_professional_rider_from_youth_v1(
  p_youth_rider_id uuid
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_youth public.youth_riders%rowtype;
  v_professional_id uuid;
begin
  select * into v_youth
  from public.youth_riders
  where id=p_youth_rider_id
  for update;

  if v_youth.id is null then raise exception 'Youth rider not found'; end if;

  select professional_rider_id into v_professional_id
  from public.youth_graduation_records
  where youth_rider_id=p_youth_rider_id;

  if v_professional_id is not null then return v_professional_id; end if;

  insert into public.riders(
    country_code,first_name,last_name,role,
    sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
    morale,potential,birth_date,fatigue
  )
  values(
    v_youth.country_code,v_youth.first_name,v_youth.last_name,
    private.youth_main_rider_role_v1(v_youth.role),
    v_youth.sprint,v_youth.climbing,v_youth.time_trial,v_youth.endurance,
    v_youth.flat,v_youth.recovery,v_youth.resistance,v_youth.race_iq,
    v_youth.teamwork,100,v_youth.hidden_potential,v_youth.birth_date,
    least(100,v_youth.fatigue)
  )
  returning id into v_professional_id;

  return v_professional_id;
end;
$function$;

create or replace function private.complete_youth_graduation_v1(
  p_youth_rider_id uuid,
  p_destination text,
  p_game_date date,
  p_actor text default 'system'
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_youth public.youth_riders%rowtype;
  v_academy public.youth_academies%rowtype;
  v_record public.youth_graduation_records%rowtype;
  v_professional_id uuid;
  v_developing_club_id uuid;
  v_salary integer;
  v_season integer:=coalesce(public.get_current_season_number(),1);
begin
  if p_destination not in ('developing_team','release') then
    raise exception 'Unsupported Youth graduation destination';
  end if;

  select * into v_youth
  from public.youth_riders where id=p_youth_rider_id for update;
  if v_youth.id is null then raise exception 'Youth rider not found'; end if;

  select * into v_academy from public.youth_academies where id=v_youth.academy_id;

  insert into public.youth_graduation_records(
    youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
  )
  values(p_youth_rider_id,v_academy.id,v_academy.club_id,p_game_date,'pending')
  on conflict(youth_rider_id) do nothing;

  select * into v_record
  from public.youth_graduation_records
  where youth_rider_id=p_youth_rider_id
  for update;

  if v_record.completed_on is not null then return v_record.professional_rider_id; end if;

  v_professional_id:=private.create_professional_rider_from_youth_v1(p_youth_rider_id);

  if p_destination='developing_team' then
    select d.id into v_developing_club_id
    from public.clubs d
    where d.parent_club_id=v_academy.club_id
      and d.club_type='developing'
      and d.deleted_at is null
      and public.is_developing_team_access_active_v1(d.id)
    order by d.created_at asc
    limit 1;

    if v_developing_club_id is null then
      raise exception 'An active Developing Team is required for this graduation route.';
    end if;

    if (
      select count(*)
      from public.club_riders cr
      where cr.club_id=v_developing_club_id
    )>=8 then
      raise exception 'Developing Team roster is full (8 riders).';
    end if;

    insert into public.club_riders(club_id,rider_id,assigned_role)
    values(
      v_developing_club_id,v_professional_id,
      private.youth_main_rider_role_v1(v_youth.role)
    );

    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    update public.riders
    set salary=v_salary,
        contract_expires_at=public.get_game_date_for_season_end(v_season),
        contract_expires_season=v_season
    where id=v_professional_id;

    insert into public.rider_contracts(
      rider_id,club_id,salary_weekly,starts_on,expires_on,duration_seasons,
      status,start_season_number,end_season_number,notes_json
    )
    values(
      v_professional_id,v_developing_club_id,v_salary,p_game_date,
      public.get_game_date_for_season_end(v_season),1,'active',
      v_season,v_season,
      jsonb_build_object(
        'source','youth_academy_graduation',
        'youth_rider_id',p_youth_rider_id
      )
    );

    update public.youth_riders
    set status='graduated',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='developing_team',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=v_developing_club_id,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object('actor',p_actor),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  else
    v_salary:=public.calculate_developing_rider_weekly_salary_v1(v_professional_id);

    insert into public.rider_free_agents(
      rider_id,source_type,source_club_id,desired_tier,
      expected_salary_weekly,min_acceptable_salary_weekly,
      preferred_duration_seasons,available_from_game_date,
      expires_on_game_date,status
    )
    values(
      v_professional_id,'youth_academy_release',v_academy.club_id,'continental',
      v_salary,greatest(250,round(v_salary*0.85)::integer),1,p_game_date,
      p_game_date+90,'available'
    );

    update public.youth_riders
    set status='released',updated_at=now()
    where id=p_youth_rider_id;

    update public.youth_graduation_records
    set decision='release',decided_on=p_game_date,
        professional_rider_id=v_professional_id,
        destination_club_id=null,
        completed_on=p_game_date,
        metadata=metadata||jsonb_build_object('actor',p_actor),
        updated_at=now()
    where youth_rider_id=p_youth_rider_id;
  end if;

  update public.youth_rider_agreements
  set status='ended',updated_at=now()
  where youth_rider_id=p_youth_rider_id and status='active';

  return v_professional_id;
end;
$function$;

create or replace function public.process_youth_academy_game_day_v1(
  p_game_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_dev jsonb;
  v_rider record;
  v_ai_graduated integer:=0;
  v_ai_released integer:=0;
  v_human_pending integer:=0;
  v_pathway_expired integer:=0;
  v_can_develop boolean;
begin
  v_dev:=private.process_youth_development_week_v1(p_game_date);

  -- Mark every newly age-16 rider as graduation eligible. Human managers get a
  -- decision; AI Academies resolve automatically.
  for v_rider in
    select r.id,r.academy_id,a.is_ai,a.club_id,r.hidden_potential
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id
    where r.status='academy'
      and extract(year from age(p_game_date,r.birth_date))::integer>=16
      and not exists(
        select 1 from public.youth_graduation_records g
        where g.youth_rider_id=r.id
      )
  loop
    insert into public.youth_graduation_records(
      youth_rider_id,academy_id,main_club_id,became_eligible_on,decision
    )
    values(v_rider.id,v_rider.academy_id,v_rider.club_id,p_game_date,'pending');

    update public.youth_riders set status='graduating',updated_at=now()
    where id=v_rider.id;

    if v_rider.is_ai then
      select exists(
        select 1
        from public.clubs d
        where d.parent_club_id=v_rider.club_id
          and d.club_type='developing'
          and d.deleted_at is null
          and public.is_developing_team_access_active_v1(d.id)
          and (select count(*) from public.club_riders cr where cr.club_id=d.id)<8
      ) into v_can_develop;

      if v_can_develop and v_rider.hidden_potential>=64 then
        perform private.complete_youth_graduation_v1(
          v_rider.id,'developing_team',p_game_date,'ai_academy'
        );
        v_ai_graduated:=v_ai_graduated+1;
      else
        perform private.complete_youth_graduation_v1(
          v_rider.id,'release',p_game_date,'ai_academy'
        );
        v_ai_released:=v_ai_released+1;
      end if;
    else
      v_human_pending:=v_human_pending+1;
    end if;
  end loop;

  -- Temporary Youth Graduate pathway lasts 30 game days. If the manager does
  -- not move the rider into the Developing Team by then, the rider becomes a
  -- professional free agent rather than occupying the U16 roster indefinitely.
  for v_rider in
    select g.youth_rider_id
    from public.youth_graduation_records g
    join public.youth_academies a on a.id=g.academy_id
    where g.decision='pathway'
      and g.completed_on is null
      and g.pathway_expires_on is not null
      and g.pathway_expires_on<=p_game_date
      and a.is_ai=false
  loop
    perform private.complete_youth_graduation_v1(
      v_rider.youth_rider_id,'release',p_game_date,'pathway_expiry'
    );
    v_pathway_expired:=v_pathway_expired+1;
  end loop;

  return jsonb_build_object(
    'game_date',p_game_date,
    'development',v_dev,
    'ai_graduated_to_developing',v_ai_graduated,
    'ai_released',v_ai_released,
    'human_graduation_decisions_created',v_human_pending,
    'expired_pathways_released',v_pathway_expired
  );
end;
$function$;

revoke all on function public.process_youth_academy_game_day_v1(date)
from public,anon,authenticated;
grant execute on function public.process_youth_academy_game_day_v1(date)
to service_role;

create or replace function public.get_my_youth_graduations_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then return '[]'::jsonb; end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',g.id,
      'youth_rider_id',r.id,
      'rider_name',r.display_name,
      'country_code',r.country_code,
      'role',r.role,
      'assessment_band',private.youth_potential_band_v1(r.hidden_potential),
      'became_eligible_on',g.became_eligible_on,
      'decision',g.decision,
      'pathway_expires_on',g.pathway_expires_on,
      'completed_on',g.completed_on,
      'professional_rider_id',g.professional_rider_id,
      'has_developing_team',exists(
        select 1 from public.clubs d
        join public.developing_team_season_access dsa
          on dsa.developing_club_id=d.id
        where d.parent_club_id=g.main_club_id
          and d.club_type='developing'
          and d.deleted_at is null
          and dsa.access_status='active'
          and dsa.active_season=coalesce(public.get_current_season_number(),1)
      ),
      'developing_team_free_slots',coalesce((
        select greatest(0,8-count(*))::integer
        from public.clubs d
        left join public.club_riders cr on cr.club_id=d.id
        where d.parent_club_id=g.main_club_id
          and d.club_type='developing'
          and d.deleted_at is null
        group by d.id
        order by d.created_at asc
        limit 1
      ),0)
    ) order by g.completed_on nulls first,g.became_eligible_on desc),'[]'::jsonb)
    from public.youth_graduation_records g
    join public.youth_riders r on r.id=g.youth_rider_id
    where g.academy_id=v_academy_id
  );
end;
$function$;

revoke all on function public.get_my_youth_graduations_v1()
from public,anon;
grant execute on function public.get_my_youth_graduations_v1()
to authenticated;

create or replace function public.decide_my_youth_graduation_v1(
  p_youth_rider_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_record public.youth_graduation_records%rowtype;
  v_game_date date:=public.get_current_game_date_date();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to manage Youth Academy.';
  end if;
  if p_decision not in ('pathway','developing_team','release') then
    raise exception 'Invalid graduation decision';
  end if;

  select g.* into v_record
  from public.youth_graduation_records g
  join public.youth_academies a on a.id=g.academy_id
  join public.clubs c on c.id=a.club_id
  where g.youth_rider_id=p_youth_rider_id
    and c.owner_user_id=v_user
    and c.deleted_at is null
  for update;

  if v_record.id is null then raise exception 'Graduation decision not found'; end if;
  if v_record.completed_on is not null then raise exception 'Graduation is already completed'; end if;

  if p_decision='pathway' then
    update public.youth_graduation_records
    set decision='pathway',decided_on=v_game_date,
        pathway_expires_on=v_game_date+30,updated_at=now()
    where id=v_record.id;
  else
    perform private.complete_youth_graduation_v1(
      p_youth_rider_id,p_decision,v_game_date,'manager'
    );
  end if;

  return public.get_my_youth_graduations_v1();
end;
$function$;

revoke all on function public.decide_my_youth_graduation_v1(uuid,text)
from public,anon;
grant execute on function public.decide_my_youth_graduation_v1(uuid,text)
to authenticated;

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
  v_seed jsonb;
  v_new_budgets integer:=0;
  v_agreements_extended integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth Academy transition requires target = source + 1';
  end if;

  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount
  )
  select
    b.academy_id,p_target_season,b.season_budget,0,b.scouting_budget,
    b.scouting_range,b.scouting_budget,b.scouting_budget
  from public.youth_academy_season_budgets b
  join public.youth_academies a on a.id=b.academy_id
  where b.season_number=p_source_season
    and a.is_active=true
  on conflict(academy_id,season_number) do nothing;
  get diagnostics v_new_budgets=row_count;

  update public.youth_rider_agreements a
  set ends_on=public.get_game_date_for_season_end(p_target_season),
      updated_at=now()
  from public.youth_riders r
  where r.id=a.youth_rider_id
    and r.status='academy'
    and a.status='active'
    and (a.ends_on is null or a.ends_on<=public.get_game_date_for_season_end(p_source_season));
  get diagnostics v_agreements_extended=row_count;

  v_seed:=public.seed_ai_youth_academies_for_season_v1(p_target_season);

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'new_season_budgets',v_new_budgets,
    'agreements_extended',v_agreements_extended,
    'ai_seed',v_seed
  );
end;
$function$;

revoke all on function public.run_youth_academy_season_transition_v1(uuid,integer,integer)
from public,anon,authenticated;
grant execute on function public.run_youth_academy_season_transition_v1(uuid,integer,integer)
to service_role;

-- Integrate Youth Academy lifecycle into the canonical season-transition engine.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='season_transition_engine_execute_v2'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'season_transition_engine_execute_v2 not found'; end if;
  v_def:=replace(pg_get_functiondef(v_oid),E'\r\n',E'\n');

  v_new:=replace(
    v_def,
    '  v_developing jsonb;',
    '  v_developing jsonb;'||E'\n'||'  v_youth_academy jsonb;'
  );
  if v_new=v_def then raise exception 'Youth transition declaration patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    E'    v_developing := public.run_developing_team_season_transition_v1(\n      p_transition_run_id,p_source_season,p_target_season\n    );',
    E'    v_developing := public.run_developing_team_season_transition_v1(\n      p_transition_run_id,p_source_season,p_target_season\n    );\n\n    v_youth_academy := public.run_youth_academy_season_transition_v1(\n      p_transition_run_id,p_source_season,p_target_season\n    );'
  );
  if v_new=v_def then raise exception 'Youth transition execution patch point not found'; end if;
  v_def:=v_new;

  v_new:=replace(
    v_def,
    E'      ''developing_team'',v_developing,\n      ''rewards_preflight'',v_rewards_preflight,',
    E'      ''developing_team'',v_developing,\n      ''youth_academy'',v_youth_academy,\n      ''rewards_preflight'',v_rewards_preflight,'
  );
  if v_new=v_def then raise exception 'Youth transition report patch point not found'; end if;

  execute v_new;
end $$;
