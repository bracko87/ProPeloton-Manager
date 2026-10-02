-- Premium Youth Academy / U16 - Phase 2A
-- Monthly scouting, private prospect reports, direct Academy approaches,
-- recruitment offers, relocation logic and Academy Director delegation.
-- Scouting reach is budget-driven; scout quality controls discovery volume and
-- assessment quality. Youth Academy capacity remains a fixed 16.

alter table public.youth_academy_season_budgets
  add column if not exists scouting_committed_amount bigint not null default 0
    check(scouting_committed_amount>=0);

alter table public.youth_academy_settings
  add column if not exists auto_recruit_min_band text not null default 'very_promising'
    check(auto_recruit_min_band in ('promising','very_promising','exceptional')),
  add column if not exists auto_recruit_max_stipend_weekly integer not null default 220
    check(auto_recruit_max_stipend_weekly between 50 and 2000),
  add column if not exists auto_recruit_max_compensation bigint not null default 30000
    check(auto_recruit_max_compensation between 0 and 1000000),
  add column if not exists auto_recruit_min_free_slots smallint not null default 2
    check(auto_recruit_min_free_slots between 0 and 8);

create table if not exists public.youth_scouting_cycles(
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  season_number integer not null,
  cycle_month date not null,
  scouting_range text not null
    check(scouting_range in ('local','regional','continental','world')),
  scout_staff_id uuid references public.club_staff(id) on delete set null,
  scout_score smallint not null check(scout_score between 0 and 100),
  report_target_count smallint not null check(report_target_count between 0 and 10),
  reports_created smallint not null default 0 check(reports_created between 0 and 10),
  run_game_date date not null,
  created_at timestamptz not null default now(),
  unique(academy_id,cycle_month)
);

create table if not exists public.youth_scouting_reports(
  id uuid primary key default gen_random_uuid(),
  academy_id uuid not null references public.youth_academies(id) on delete cascade,
  cycle_id uuid not null references public.youth_scouting_cycles(id) on delete cascade,
  scout_staff_id uuid references public.club_staff(id) on delete set null,
  target_kind text not null check(target_kind in ('unattached','academy')),
  target_youth_rider_id uuid references public.youth_riders(id) on delete set null,
  source_academy_id uuid references public.youth_academies(id) on delete set null,
  country_code text not null,
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  role text not null,
  sprint smallint not null check(sprint between 1 and 100),
  climbing smallint not null check(climbing between 1 and 100),
  time_trial smallint not null check(time_trial between 1 and 100),
  endurance smallint not null check(endurance between 1 and 100),
  flat smallint not null check(flat between 1 and 100),
  recovery smallint not null check(recovery between 1 and 100),
  resistance smallint not null check(resistance between 1 and 100),
  race_iq smallint not null check(race_iq between 1 and 100),
  teamwork smallint not null check(teamwork between 1 and 100),
  hidden_potential smallint not null check(hidden_potential between 1 and 100),
  assessment_band text not null,
  confidence smallint not null check(confidence between 1 and 100),
  expected_stipend_weekly integer not null check(expected_stipend_weekly>=0),
  suggested_accommodation_weekly integer not null default 0
    check(suggested_accommodation_weekly>=0),
  suggested_compensation bigint not null default 0 check(suggested_compensation>=0),
  relocation_difficulty text not null
    check(relocation_difficulty in ('easy','moderate','hard','very_hard')),
  status text not null default 'new'
    check(status in ('new','shortlisted','approached','signed','expired')),
  discovered_on date not null,
  expires_on date not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists youth_scouting_reports_academy_status_idx
on public.youth_scouting_reports(academy_id,status,discovered_on desc);

create index if not exists youth_scouting_reports_target_idx
on public.youth_scouting_reports(target_youth_rider_id)
where target_youth_rider_id is not null;

create table if not exists public.youth_recruitment_offers(
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.youth_scouting_reports(id) on delete cascade,
  offering_academy_id uuid not null references public.youth_academies(id) on delete cascade,
  source_academy_id uuid references public.youth_academies(id) on delete set null,
  target_youth_rider_id uuid references public.youth_riders(id) on delete set null,
  decision_mode text not null check(decision_mode in ('manager','academy_director')),
  stipend_weekly integer not null check(stipend_weekly between 50 and 2000),
  accommodation_weekly integer not null default 0 check(accommodation_weekly between 0 and 2000),
  compensation_offer bigint not null default 0 check(compensation_offer between 0 and 1000000),
  source_academy_decision text not null default 'not_required'
    check(source_academy_decision in ('not_required','accepted','rejected')),
  rider_decision text not null default 'pending'
    check(rider_decision in ('pending','accepted','rejected')),
  status text not null default 'submitted'
    check(status in ('submitted','academy_rejected','rider_rejected','accepted')),
  rejection_reason text,
  submitted_on date not null,
  decided_on date,
  created_at timestamptz not null default now()
);

create index if not exists youth_recruitment_offers_academy_idx
on public.youth_recruitment_offers(offering_academy_id,created_at desc);

alter table public.youth_scouting_cycles enable row level security;
alter table public.youth_scouting_reports enable row level security;
alter table public.youth_recruitment_offers enable row level security;

revoke all on public.youth_scouting_cycles from anon,authenticated;
revoke all on public.youth_scouting_reports from anon,authenticated;
revoke all on public.youth_recruitment_offers from anon,authenticated;

create or replace function private.youth_scout_score_v1(p_club_id uuid)
returns integer
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select coalesce((
    select least(100,greatest(1,round(
      cs.expertise*0.45+
      cs.experience*0.20+
      cs.efficiency*0.25+
      cs.potential*0.10
    )::integer))
    from public.club_staff cs
    where cs.club_id=p_club_id
      and cs.is_active=true
      and cs.role_type='youth_scout'
    order by
      (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
      cs.id
    limit 1
  ),0);
$function$;

create or replace function private.youth_band_rank_v1(p_band text)
returns integer
language sql
immutable
as $function$
  select case lower(replace(coalesce(p_band,''),' ','_'))
    when 'exceptional' then 4
    when 'very_promising' then 3
    when 'promising' then 2
    when 'limited' then 1
    else 0
  end;
$function$;

create or replace function private.draw_youth_potential_v1()
returns integer
language plpgsql
volatile
as $function$
declare
  v_roll numeric:=random();
begin
  if v_roll<0.68 then
    return 48+floor(random()*22)::integer; -- 48..69
  elsif v_roll<0.92 then
    return 70+floor(random()*10)::integer; -- 70..79
  elsif v_roll<0.985 then
    return 80+floor(random()*6)::integer; -- 80..85
  else
    return 86+floor(random()*7)::integer; -- rare 86..92
  end if;
end;
$function$;

create or replace function private.youth_exact_birth_date_v1(p_age integer)
returns date
language plpgsql
volatile
set search_path=public,pg_temp
as $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  v_month integer:=1+floor(random()*12)::integer;
  v_day integer:=1+floor(random()*28)::integer;
  v_birth date;
begin
  v_birth:=make_date(
    extract(year from v_game_date)::integer-greatest(12,least(16,p_age)),
    v_month,
    v_day
  );

  if extract(year from age(v_game_date,v_birth))::integer<p_age then
    v_birth:=(v_birth-interval '1 year')::date;
  end if;

  return v_birth;
end;
$function$;

create or replace function private.youth_country_allowed_v1(
  p_home_country text,
  p_target_country text,
  p_range text
)
returns boolean
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select case lower(coalesce(p_range,'local'))
    when 'local' then upper(p_target_country)=upper(p_home_country)
    when 'regional' then
      upper(p_target_country)=upper(p_home_country)
      or exists(
        select 1
        from public.country_market_group_members home
        join public.country_market_group_members target
          on target.group_code=home.group_code
        where upper(home.country_code)=upper(p_home_country)
          and upper(target.country_code)=upper(p_target_country)
      )
    when 'continental' then
      upper(p_target_country)=upper(p_home_country)
      or exists(
        select 1
        from public.country_market_group_members home
        join public.country_market_groups hg on hg.code=home.group_code
        join public.country_market_groups tg on tg.macro_region=hg.macro_region
        join public.country_market_group_members target on target.group_code=tg.code
        where upper(home.country_code)=upper(p_home_country)
          and upper(target.country_code)=upper(p_target_country)
      )
    when 'world' then true
    else false
  end;
$function$;

create or replace function private.pick_youth_scouting_country_v1(
  p_home_country text,
  p_range text
)
returns text
language sql
volatile
security definer
set search_path=public,pg_temp
as $function$
  with countries as (
    select distinct upper(fn.country_code) as country_code
    from public.first_names_master fn
    where nullif(trim(fn.country_code),'') is not null
      and exists(
        select 1
        from public.last_names_master ln
        where upper(ln.country_code)=upper(fn.country_code)
      )
  )
  select coalesce(
    (
      select c.country_code
      from countries c
      where private.youth_country_allowed_v1(
        p_home_country,c.country_code,p_range
      )
      order by random()
      limit 1
    ),
    upper(p_home_country)
  );
$function$;

create or replace function private.youth_relocation_difficulty_v1(
  p_home_country text,
  p_target_country text
)
returns text
language sql
stable
security definer
set search_path=public,pg_temp
as $function$
  select case
    when upper(p_home_country)=upper(p_target_country) then 'easy'
    when private.youth_country_allowed_v1(p_home_country,p_target_country,'regional') then 'moderate'
    when private.youth_country_allowed_v1(p_home_country,p_target_country,'continental') then 'hard'
    else 'very_hard'
  end;
$function$;

create or replace function private.youth_strengths_v1(
  p_sprint integer,
  p_climbing integer,
  p_time_trial integer,
  p_endurance integer,
  p_flat integer,
  p_recovery integer,
  p_resistance integer,
  p_race_iq integer,
  p_teamwork integer,
  p_confidence integer
)
returns jsonb
language sql
immutable
as $function$
  with skills(label,value) as (
    values
      ('Sprint',p_sprint),
      ('Climbing',p_climbing),
      ('Time trial',p_time_trial),
      ('Endurance',p_endurance),
      ('Flat',p_flat),
      ('Recovery',p_recovery),
      ('Resistance',p_resistance),
      ('Race IQ',p_race_iq),
      ('Teamwork',p_teamwork)
  ),
  ranked as (
    select label
    from skills
    order by value desc,label
    limit case when p_confidence>=78 then 3 else 2 end
  )
  select coalesce(jsonb_agg(label),'[]'::jsonb) from ranked;
$function$;

create or replace function private.process_youth_recruitment_offer_v1(
  p_academy_id uuid,
  p_report_id uuid,
  p_stipend_weekly integer,
  p_accommodation_weekly integer,
  p_compensation_offer bigint,
  p_decision_mode text
)
returns uuid
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_report public.youth_scouting_reports%rowtype;
  v_academy public.youth_academies%rowtype;
  v_club public.clubs%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_end_date date;
  v_weeks integer;
  v_active_count integer;
  v_weekly_commit bigint;
  v_available bigint;
  v_source_decision text:='not_required';
  v_rider_decision text:='pending';
  v_status text:='submitted';
  v_reason text;
  v_rider_score numeric;
  v_source_accept_chance numeric;
  v_head_coach_skill integer:=0;
  v_offer_id uuid;
  v_new_rider_id uuid;
  v_agreement_id uuid;
begin
  if p_decision_mode not in ('manager','academy_director') then
    raise exception 'Invalid recruitment decision mode.';
  end if;

  select * into v_academy
  from public.youth_academies a
  where a.id=p_academy_id and a.is_active=true
  for update;

  if v_academy.id is null then raise exception 'Youth Academy not found'; end if;

  select * into v_club from public.clubs c where c.id=v_academy.club_id;
  select * into v_settings from public.youth_academy_settings s
  where s.academy_id=p_academy_id;

  select * into v_report
  from public.youth_scouting_reports r
  where r.id=p_report_id
    and r.academy_id=p_academy_id
    and r.status in ('new','shortlisted','approached')
    and r.expires_on>=v_game_date
  for update;

  if v_report.id is null then raise exception 'Scouting report is not available'; end if;

  select count(*) into v_active_count
  from public.youth_riders r
  where r.academy_id=p_academy_id
    and r.status in ('academy','graduating');

  if v_active_count>=16 then raise exception 'Youth Academy is full (16/16)'; end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=p_academy_id and b.season_number=v_season
  for update;

  if v_budget.academy_id is null then raise exception 'Youth Academy season budget not found'; end if;

  v_end_date:=public.get_game_date_for_season_end(v_season);
  v_weeks:=greatest(1,ceil(greatest(0,(v_end_date-v_game_date))::numeric/7.0)::integer);
  v_weekly_commit:=(greatest(0,p_stipend_weekly)+greatest(0,p_accommodation_weekly))::bigint*v_weeks;
  v_available:=greatest(0,v_budget.season_budget-v_budget.spent_amount-v_budget.committed_amount);

  if greatest(0,p_compensation_offer)+v_weekly_commit>v_available then
    raise exception 'Youth Academy budget is insufficient for this offer package.';
  end if;

  if v_report.target_kind='academy' then
    select * into v_source_academy
    from public.youth_academies a
    where a.id=v_report.source_academy_id
    for update;

    if v_source_academy.id is null then
      v_source_decision:='rejected';
      v_status:='academy_rejected';
      v_reason:='Source Academy is no longer available.';
    elsif not v_source_academy.is_ai then
      -- Human-to-human acceptance UI/notifications are intentionally deferred.
      -- Phase 2A scouting only surfaces AI Academy approaches.
      v_source_decision:='rejected';
      v_status:='academy_rejected';
      v_reason:='This Academy requires a manager-to-manager response flow.';
    else
      v_source_accept_chance:=case
        when p_compensation_offer>=v_report.suggested_compensation*1.05 then 0.95
        when p_compensation_offer>=v_report.suggested_compensation then 0.85
        when p_compensation_offer>=v_report.suggested_compensation*0.80 then 0.60
        when p_compensation_offer>=v_report.suggested_compensation*0.65 then 0.30
        else 0.05
      end;

      if random()<=v_source_accept_chance then
        v_source_decision:='accepted';
      else
        v_source_decision:='rejected';
        v_status:='academy_rejected';
        v_reason:='The current Academy rejected the development compensation offer.';
      end if;
    end if;
  end if;

  if v_status='submitted' then
    select coalesce(round(
      cs.expertise*0.55+cs.experience*0.20+cs.leadership*0.25
    )::integer,0)
    into v_head_coach_skill
    from public.club_staff cs
    where cs.club_id=v_academy.club_id
      and cs.role_type='u16_head_coach'
      and cs.is_active=true
    order by cs.expertise desc
    limit 1;

    v_rider_score:=45
      + case
          when upper(v_report.country_code)=upper(v_club.country_code) then 22
          when private.youth_country_allowed_v1(v_club.country_code,v_report.country_code,'regional') then 10
          when private.youth_country_allowed_v1(v_club.country_code,v_report.country_code,'continental') then 0
          else -8
        end
      + least(22,greatest(-25,
          ((p_stipend_weekly::numeric/nullif(v_report.expected_stipend_weekly,0))-1.0)*55
        ))
      + case
          when upper(v_report.country_code)=upper(v_club.country_code) then 0
          when p_accommodation_weekly>=v_report.suggested_accommodation_weekly then 14
          else -18
        end
      + least(10,v_head_coach_skill/10.0)
      + least(8,v_academy.reputation/1250.0)
      + case
          when private.youth_academy_age_v1(v_report.birth_date)<=13
               and upper(v_report.country_code)<>upper(v_club.country_code)
          then -10 else 0
        end;

    if random()*100<=least(95,greatest(5,v_rider_score)) then
      v_rider_decision:='accepted';
      v_status:='accepted';
    else
      v_rider_decision:='rejected';
      v_status:='rider_rejected';
      v_reason:='The rider and family declined the proposed move and support package.';
    end if;
  end if;

  insert into public.youth_recruitment_offers(
    report_id,offering_academy_id,source_academy_id,target_youth_rider_id,
    decision_mode,stipend_weekly,accommodation_weekly,compensation_offer,
    source_academy_decision,rider_decision,status,rejection_reason,
    submitted_on,decided_on
  )
  values(
    v_report.id,p_academy_id,v_report.source_academy_id,v_report.target_youth_rider_id,
    p_decision_mode,greatest(50,p_stipend_weekly),greatest(0,p_accommodation_weekly),
    greatest(0,p_compensation_offer),v_source_decision,v_rider_decision,v_status,v_reason,
    v_game_date,v_game_date
  )
  returning id into v_offer_id;

  if v_status='accepted' then
    if v_report.target_kind='unattached' then
      insert into public.youth_riders(
        academy_id,country_code,first_name,last_name,birth_date,role,
        sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
        hidden_potential,readiness,fatigue,development_focus,workload,
        joined_game_date,joined_season,status,is_starter_rider,is_ai_generated
      )
      values(
        p_academy_id,v_report.country_code,v_report.first_name,v_report.last_name,
        v_report.birth_date,v_report.role,
        v_report.sprint,v_report.climbing,v_report.time_trial,v_report.endurance,
        v_report.flat,v_report.recovery,v_report.resistance,v_report.race_iq,
        v_report.teamwork,v_report.hidden_potential,70,0,'balanced','moderate',
        v_game_date,v_season,'academy',false,false
      )
      returning id into v_new_rider_id;
    else
      v_new_rider_id:=v_report.target_youth_rider_id;

      update public.youth_rider_agreements
      set status='ended',updated_at=now()
      where youth_rider_id=v_new_rider_id and status='active';

      update public.youth_riders
      set academy_id=p_academy_id,
          joined_game_date=v_game_date,
          joined_season=v_season,
          status='academy',
          updated_at=now()
      where id=v_new_rider_id;
    end if;

    insert into public.youth_rider_agreements(
      youth_rider_id,academy_id,stipend_weekly,accommodation_weekly,
      starts_on,ends_on,status
    )
    values(
      v_new_rider_id,p_academy_id,greatest(50,p_stipend_weekly),
      greatest(0,p_accommodation_weekly),v_game_date,v_end_date,'active'
    )
    returning id into v_agreement_id;

    update public.youth_academy_season_budgets
    set
      spent_amount=spent_amount+greatest(0,p_compensation_offer),
      committed_amount=committed_amount+v_weekly_commit,
      updated_at=now()
    where academy_id=p_academy_id and season_number=v_season;

    if p_compensation_offer>0 then
      insert into public.youth_academy_ledger(
        academy_id,season_number,game_date,category,description,amount,metadata
      )
      values(
        p_academy_id,v_season,v_game_date,'recruitment',
        'Youth recruitment development compensation',
        -greatest(0,p_compensation_offer),
        jsonb_build_object(
          'offer_id',v_offer_id,
          'report_id',v_report.id,
          'youth_rider_id',v_new_rider_id
        )
      );
    end if;

    insert into public.youth_academy_ledger(
      academy_id,season_number,game_date,category,description,amount,metadata
    )
    values(
      p_academy_id,v_season,v_game_date,'agreement_commitment',
      'Youth rider support agreement committed for the remaining season',
      0,
      jsonb_build_object(
        'offer_id',v_offer_id,
        'agreement_id',v_agreement_id,
        'weekly_commitment',greatest(50,p_stipend_weekly)+greatest(0,p_accommodation_weekly),
        'weeks_remaining',v_weeks,
        'committed_amount',v_weekly_commit
      )
    );

    update public.youth_scouting_reports
    set status='signed',target_youth_rider_id=v_new_rider_id,updated_at=now()
    where id=v_report.id;
  else
    update public.youth_scouting_reports
    set status='approached',updated_at=now()
    where id=v_report.id;
  end if;

  return v_offer_id;
end;
$function$;

create or replace function public.get_my_youth_scouting_v1()
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
  v_budget public.youth_academy_season_budgets%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_scout public.club_staff%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_cycle_month date:=date_trunc('month',v_game_date)::date;
  v_cycle public.youth_scouting_cycles%rowtype;
  v_scout_score integer:=0;
  v_report_quota integer:=0;
  v_premium boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at
  limit 1;

  if v_club.id is null then raise exception 'Main club not found'; end if;

  v_premium:=public.user_has_premium_access_v1(v_user);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id and a.is_active=true
  limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'activated',false,
      'premium',v_premium,
      'reports','[]'::jsonb,
      'offers','[]'::jsonb
    );
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select * into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true
    and cs.role_type='youth_scout'
  order by
    (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
    cs.id
  limit 1;

  if v_scout.id is not null then
    v_scout_score:=private.youth_scout_score_v1(v_club.id);
    v_report_quota:=least(6,greatest(1,2+floor((v_scout_score-45)/15.0)::integer));
  end if;

  select * into v_cycle
  from public.youth_scouting_cycles c
  where c.academy_id=v_academy.id and c.cycle_month=v_cycle_month;

  return jsonb_build_object(
    'activated',true,
    'premium',v_premium,
    'read_only',not v_premium,
    'game_date',v_game_date,
    'cycle_month',v_cycle_month,
    'scouting_range',coalesce(v_budget.scouting_range,'local'),
    'scouting_budget',coalesce(v_budget.scouting_budget,0),
    'scouting_committed_amount',coalesce(v_budget.scouting_committed_amount,0),
    'scout',case when v_scout.id is null then null else jsonb_build_object(
      'id',v_scout.id,
      'name',v_scout.staff_name,
      'country_code',v_scout.country_code,
      'expertise',v_scout.expertise,
      'experience',v_scout.experience,
      'efficiency',v_scout.efficiency,
      'score',v_scout_score,
      'monthly_report_quota',v_report_quota
    ) end,
    'current_cycle',case when v_cycle.id is null then null else jsonb_build_object(
      'id',v_cycle.id,
      'cycle_month',v_cycle.cycle_month,
      'range',v_cycle.scouting_range,
      'scout_score',v_cycle.scout_score,
      'reports_created',v_cycle.reports_created
    ) end,
    'can_run',v_premium and v_scout.id is not null and v_cycle.id is null,
    'director_mode',
      v_settings.recruitment_decider='academy_director',
    'auto_rules',jsonb_build_object(
      'min_band',v_settings.auto_recruit_min_band,
      'max_stipend_weekly',v_settings.auto_recruit_max_stipend_weekly,
      'max_compensation',v_settings.auto_recruit_max_compensation,
      'min_free_slots',v_settings.auto_recruit_min_free_slots
    ),
    'reports',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',r.id,
        'target_kind',r.target_kind,
        'display_name',trim(r.first_name||' '||r.last_name),
        'country_code',r.country_code,
        'age',private.youth_academy_age_v1(r.birth_date),
        'role',r.role,
        'assessment_band',r.assessment_band,
        'confidence',r.confidence,
        'strengths',private.youth_strengths_v1(
          r.sprint,r.climbing,r.time_trial,r.endurance,r.flat,
          r.recovery,r.resistance,r.race_iq,r.teamwork,r.confidence
        ),
        'expected_stipend_weekly',r.expected_stipend_weekly,
        'suggested_accommodation_weekly',r.suggested_accommodation_weekly,
        'suggested_compensation',r.suggested_compensation,
        'relocation_difficulty',r.relocation_difficulty,
        'source_academy_id',r.source_academy_id,
        'source_academy_name',source_club.name,
        'status',r.status,
        'discovered_on',r.discovered_on,
        'expires_on',r.expires_on,
        'latest_offer',case when offer.id is null then null else jsonb_build_object(
          'id',offer.id,
          'status',offer.status,
          'stipend_weekly',offer.stipend_weekly,
          'accommodation_weekly',offer.accommodation_weekly,
          'compensation_offer',offer.compensation_offer,
          'source_academy_decision',offer.source_academy_decision,
          'rider_decision',offer.rider_decision,
          'rejection_reason',offer.rejection_reason,
          'submitted_on',offer.submitted_on
        ) end
      ) order by r.discovered_on desc,r.created_at desc),'[]'::jsonb)
      from public.youth_scouting_reports r
      left join public.youth_academies source_a on source_a.id=r.source_academy_id
      left join public.clubs source_club on source_club.id=source_a.club_id
      left join lateral (
        select o.*
        from public.youth_recruitment_offers o
        where o.report_id=r.id
        order by o.created_at desc
        limit 1
      ) offer on true
      where r.academy_id=v_academy.id
        and r.expires_on>=v_game_date
        and r.status<>'expired'
    )
  );
end;
$function$;

grant execute on function public.get_my_youth_scouting_v1() to authenticated;

create or replace function public.run_my_youth_scouting_cycle_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy public.youth_academies%rowtype;
  v_budget public.youth_academy_season_budgets%rowtype;
  v_settings public.youth_academy_settings%rowtype;
  v_scout public.club_staff%rowtype;
  v_game_date date:=public.get_current_game_date_date();
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_cycle_month date:=date_trunc('month',v_game_date)::date;
  v_cycle_id uuid;
  v_score integer;
  v_count integer;
  v_i integer;
  v_j integer;
  v_candidate_count integer;
  v_target_kind text;
  v_target_rider public.youth_riders%rowtype;
  v_source_academy public.youth_academies%rowtype;
  v_country text;
  v_first text;
  v_last text;
  v_age integer;
  v_birth date;
  v_role text;
  v_base integer;
  v_special integer;
  v_potential integer;
  v_candidate_potential integer;
  v_candidate_eval numeric;
  v_best_eval numeric;
  v_sprint integer;
  v_climbing integer;
  v_tt integer;
  v_endurance integer;
  v_flat integer;
  v_recovery integer;
  v_resistance integer;
  v_race_iq integer;
  v_teamwork integer;
  v_confidence integer;
  v_assessed_potential integer;
  v_band text;
  v_expected_stipend integer;
  v_accommodation integer;
  v_compensation bigint;
  v_relocation text;
  v_report_id uuid;
  v_auto_offer uuid;
  v_active_count integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to run Youth scouting.';
  end if;

  select * into v_club
  from public.clubs c
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and c.parent_club_id is null
    and coalesce(c.club_type,'main')<>'developing'
  order by c.created_at
  limit 1;

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id and a.is_active=true
  limit 1;

  if v_academy.id is null then raise exception 'Youth Academy is not activated'; end if;

  perform pg_advisory_xact_lock(hashtext('youth_scouting:'||v_academy.id::text||':'||v_cycle_month::text));

  if exists(
    select 1 from public.youth_scouting_cycles c
    where c.academy_id=v_academy.id and c.cycle_month=v_cycle_month
  ) then
    return public.get_my_youth_scouting_v1();
  end if;

  select * into v_budget
  from public.youth_academy_season_budgets b
  where b.academy_id=v_academy.id and b.season_number=v_season;

  select * into v_settings
  from public.youth_academy_settings s
  where s.academy_id=v_academy.id;

  select * into v_scout
  from public.club_staff cs
  where cs.club_id=v_club.id
    and cs.is_active=true
    and cs.role_type='youth_scout'
  order by
    (cs.expertise*0.45+cs.experience*0.20+cs.efficiency*0.25+cs.potential*0.10) desc,
    cs.id
  limit 1;

  if v_scout.id is null then
    raise exception 'Hire a Youth Scout before running active prospect discovery.';
  end if;

  v_score:=private.youth_scout_score_v1(v_club.id);
  v_count:=least(6,greatest(1,2+floor((v_score-45)/15.0)::integer));

  insert into public.youth_scouting_cycles(
    academy_id,season_number,cycle_month,scouting_range,scout_staff_id,
    scout_score,report_target_count,reports_created,run_game_date
  )
  values(
    v_academy.id,v_season,v_cycle_month,coalesce(v_budget.scouting_range,'local'),
    v_scout.id,v_score,v_count,0,v_game_date
  )
  returning id into v_cycle_id;

  for v_i in 1..v_count loop
    v_target_kind:='unattached';
    v_target_rider:=null;
    v_source_academy:=null;

    if random()<0.30 then
      v_target_rider.id:=null;
      v_source_academy.id:=null;

      select r.*
      into v_target_rider
      from public.youth_riders r
      join public.youth_academies a on a.id=r.academy_id
      where a.id<>v_academy.id
        and a.is_active=true
        and a.is_ai=true
        and r.status='academy'
        and private.youth_academy_age_v1(r.birth_date) between 12 and 16
        and private.youth_country_allowed_v1(
          v_club.country_code,r.country_code,coalesce(v_budget.scouting_range,'local')
        )
        and not exists(
          select 1
          from public.youth_scouting_reports prior
          where prior.academy_id=v_academy.id
            and prior.target_youth_rider_id=r.id
            and prior.status in ('new','shortlisted','approached','signed')
        )
      order by
        (
          r.hidden_potential*(0.30+v_score/140.0)
          + random()*100
        ) desc
      limit 1;

      if v_target_rider.id is not null then
        select a.* into v_source_academy
        from public.youth_academies a
        where a.id=v_target_rider.academy_id;

        v_target_kind:='academy';
      end if;
    end if;

    if v_target_kind='academy' then
      v_country:=v_target_rider.country_code;
      v_first:=v_target_rider.first_name;
      v_last:=v_target_rider.last_name;
      v_birth:=v_target_rider.birth_date;
      v_role:=v_target_rider.role;
      v_sprint:=v_target_rider.sprint;
      v_climbing:=v_target_rider.climbing;
      v_tt:=v_target_rider.time_trial;
      v_endurance:=v_target_rider.endurance;
      v_flat:=v_target_rider.flat;
      v_recovery:=v_target_rider.recovery;
      v_resistance:=v_target_rider.resistance;
      v_race_iq:=v_target_rider.race_iq;
      v_teamwork:=v_target_rider.teamwork;
      v_potential:=v_target_rider.hidden_potential;
    else
      v_country:=private.pick_youth_scouting_country_v1(
        v_club.country_code,coalesce(v_budget.scouting_range,'local')
      );

      select fn.first_name into v_first
      from public.first_names_master fn
      where upper(fn.country_code)=upper(v_country)
      order by random() limit 1;

      select ln.last_name into v_last
      from public.last_names_master ln
      where upper(ln.country_code)=upper(v_country)
      order by random() limit 1;

      if v_first is null then
        select first_name into v_first from public.first_names_master order by random() limit 1;
      end if;
      if v_last is null then
        select last_name into v_last from public.last_names_master order by random() limit 1;
      end if;

      v_age:=12+floor(random()*5)::integer;
      v_birth:=private.youth_exact_birth_date_v1(v_age);
      v_role:=(array[
        'all_rounder','sprinter','climber','time_trial','domestique','breakaway'
      ])[1+floor(random()*6)::integer];

      -- The scout does not create talent. Each report samples a normal hidden
      -- candidate pool; stronger scouts are simply better at selecting which
      -- candidates are worth reporting.
      v_best_eval:=-1;
      v_candidate_count:=2+floor(v_score/25.0)::integer;
      for v_j in 1..v_candidate_count loop
        v_candidate_potential:=private.draw_youth_potential_v1();
        v_candidate_eval:=random()*100+
          v_candidate_potential*(0.25+v_score/150.0);
        if v_candidate_eval>v_best_eval then
          v_best_eval:=v_candidate_eval;
          v_potential:=v_candidate_potential;
        end if;
      end loop;

      v_base:=19+((v_age-12)*4)+floor(random()*10)::integer;
      v_special:=4+floor(random()*6)::integer;
      v_sprint:=least(68,v_base+case when v_role='sprinter' then v_special else floor(random()*5)::int end);
      v_climbing:=least(68,v_base+case when v_role='climber' then v_special else floor(random()*5)::int end);
      v_tt:=least(68,v_base+case when v_role='time_trial' then v_special else floor(random()*5)::int end);
      v_endurance:=least(68,v_base+floor(random()*6)::int);
      v_flat:=least(68,v_base+case when v_role in ('sprinter','all_rounder') then floor(v_special/2.0)::int else floor(random()*5)::int end);
      v_recovery:=least(68,v_base+floor(random()*6)::int);
      v_resistance:=least(68,v_base+case when v_role='breakaway' then v_special else floor(random()*5)::int end);
      v_race_iq:=least(68,v_base+floor(random()*6)::int);
      v_teamwork:=least(68,v_base+case when v_role='domestique' then v_special else floor(random()*5)::int end);
    end if;

    v_confidence:=least(95,greatest(35,
      round(
        38+v_score*0.58
        - case coalesce(v_budget.scouting_range,'local')
            when 'local' then 0
            when 'regional' then 4
            when 'continental' then 8
            else 13
          end
        +(random()*10-5)
      )::integer
    ));

    v_assessed_potential:=least(95,greatest(35,
      v_potential+round((random()-0.5)*(100-v_confidence)/2.2)::integer
    ));
    v_band:=private.youth_potential_band_v1(v_assessed_potential);

    v_expected_stipend:=greatest(80,
      80+greatest(0,v_potential-50)*5+floor(random()*35)::integer
    );
    v_relocation:=private.youth_relocation_difficulty_v1(
      v_club.country_code,v_country
    );
    v_accommodation:=case
      when upper(v_country)=upper(v_club.country_code) then 0
      when v_relocation='moderate' then 70+floor(random()*41)::integer
      when v_relocation='hard' then 100+floor(random()*61)::integer
      else 130+floor(random()*91)::integer
    end;
    v_compensation:=case
      when v_target_kind='academy' then
        greatest(1500,
          1500+greatest(0,v_potential-50)*700+
          floor(random()*3500)::integer
        )
      else 0
    end;

    insert into public.youth_scouting_reports(
      academy_id,cycle_id,scout_staff_id,target_kind,target_youth_rider_id,
      source_academy_id,country_code,first_name,last_name,birth_date,role,
      sprint,climbing,time_trial,endurance,flat,recovery,resistance,race_iq,teamwork,
      hidden_potential,assessment_band,confidence,expected_stipend_weekly,
      suggested_accommodation_weekly,suggested_compensation,relocation_difficulty,
      status,discovered_on,expires_on,metadata
    )
    values(
      v_academy.id,v_cycle_id,v_scout.id,v_target_kind,
      case when v_target_kind='academy' then v_target_rider.id else null end,
      case when v_target_kind='academy' then v_source_academy.id else null end,
      upper(v_country),coalesce(v_first,'Alex'),coalesce(v_last,'Prospect'),
      v_birth,v_role,v_sprint,v_climbing,v_tt,v_endurance,v_flat,v_recovery,
      v_resistance,v_race_iq,v_teamwork,v_potential,v_band,v_confidence,
      v_expected_stipend,v_accommodation,v_compensation,v_relocation,
      'new',v_game_date,v_game_date+60,
      jsonb_build_object(
        'scouting_range',coalesce(v_budget.scouting_range,'local'),
        'scout_score',v_score
      )
    )
    returning id into v_report_id;

    if v_settings.recruitment_decider='academy_director'
       and private.youth_band_rank_v1(v_band)>=
           private.youth_band_rank_v1(v_settings.auto_recruit_min_band) then

      update public.youth_scouting_reports
      set status='shortlisted',updated_at=now()
      where id=v_report_id;

      if v_settings.recruitment_negotiation_decider='academy_director'
         and v_expected_stipend<=v_settings.auto_recruit_max_stipend_weekly
         and v_compensation<=v_settings.auto_recruit_max_compensation then

        select count(*) into v_active_count
        from public.youth_riders r
        where r.academy_id=v_academy.id
          and r.status in ('academy','graduating');

        if 16-v_active_count>v_settings.auto_recruit_min_free_slots then
          begin
            v_auto_offer:=private.process_youth_recruitment_offer_v1(
              v_academy.id,v_report_id,
              v_expected_stipend,
              v_accommodation,
              v_compensation,
              'academy_director'
            );
          exception when others then
            -- A director automation failure must never abort the monthly scout report.
            null;
          end;
        end if;
      end if;
    end if;
  end loop;

  update public.youth_scouting_cycles
  set reports_created=(
    select count(*)::integer
    from public.youth_scouting_reports r
    where r.cycle_id=v_cycle_id
  )
  where id=v_cycle_id;

  return public.get_my_youth_scouting_v1();
end;
$function$;

grant execute on function public.run_my_youth_scouting_cycle_v1() to authenticated;

create or replace function public.submit_youth_recruitment_offer_v1(
  p_report_id uuid,
  p_stipend_weekly integer,
  p_accommodation_weekly integer default 0,
  p_compensation_offer bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,auth,pg_temp
as $function$
declare
  v_user uuid:=auth.uid();
  v_academy_id uuid;
  v_offer_id uuid;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_premium_access_v1(v_user) then
    raise exception 'Premium membership is required to recruit Youth riders.';
  end if;

  select a.id into v_academy_id
  from public.youth_academies a
  join public.clubs c on c.id=a.club_id
  where c.owner_user_id=v_user
    and c.deleted_at is null
    and a.is_active=true
  limit 1;

  if v_academy_id is null then raise exception 'Youth Academy is not activated'; end if;

  v_offer_id:=private.process_youth_recruitment_offer_v1(
    v_academy_id,p_report_id,
    greatest(50,coalesce(p_stipend_weekly,50)),
    greatest(0,coalesce(p_accommodation_weekly,0)),
    greatest(0,coalesce(p_compensation_offer,0)),
    'manager'
  );

  return public.get_my_youth_scouting_v1()
    || jsonb_build_object('submitted_offer_id',v_offer_id);
end;
$function$;

grant execute on function public.submit_youth_recruitment_offer_v1(
  uuid,integer,integer,bigint
) to authenticated;

create or replace function public.update_my_youth_academy_settings_v1(
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
  v_new_budget bigint;
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

  v_new_budget:=coalesce(p_season_budget,v_old_budget.season_budget);
  v_other_commit:=greatest(
    0,v_old_budget.committed_amount-v_old_budget.scouting_committed_amount
  );
  v_new_scout_commit:=coalesce(v_scout_cost,0);

  if v_new_budget<
     v_old_budget.spent_amount+v_other_commit+v_new_scout_commit then
    raise exception
      'Season Academy budget is below current spending and commitments. Required minimum: %.',
      v_old_budget.spent_amount+v_other_commit+v_new_scout_commit;
  end if;

  update public.youth_academy_season_budgets b
  set
    season_budget=v_new_budget,
    scouting_range=coalesce(p_scouting_range,b.scouting_range),
    scouting_budget=v_new_scout_commit,
    scouting_committed_amount=v_new_scout_commit,
    committed_amount=v_other_commit+v_new_scout_commit,
    updated_at=now()
  where b.academy_id=v_academy_id and b.season_number=v_season;

  return public.get_my_youth_academy_v1();
end;
$function$;

grant execute on function public.update_my_youth_academy_settings_v1(
  text,text,text,text,text,text,text,bigint,text,integer,bigint,smallint
) to authenticated;

-- New academies start with the Local scouting programme reserved inside the
-- Academy season budget. No human academies existed before Phase 2A, but keep
-- the repair idempotent for development/test databases.
update public.youth_academy_season_budgets b
set
  scouting_committed_amount=greatest(b.scouting_committed_amount,b.scouting_budget),
  committed_amount=greatest(
    b.committed_amount,
    b.scouting_budget
  ),
  updated_at=now()
where b.scouting_committed_amount=0;

-- Patch the activation function so the default Local programme is committed
-- immediately on all future Premium Academy activations.
do $$
declare
  v_oid oid;
  v_def text;
  v_new text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='activate_my_youth_academy_v1'
  order by p.oid desc limit 1;

  if v_oid is null then raise exception 'activate_my_youth_academy_v1 not found'; end if;

  v_def:=pg_get_functiondef(v_oid);
  v_new:=replace(
    v_def,
    $old$insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,scouting_range,scouting_budget
  )
  values(
    v_academy_id,v_season,greatest(coalesce(p_season_budget,100000),0),
    'local',5000
  )$old$,
    $new$insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount
  )
  values(
    v_academy_id,v_season,
    greatest(coalesce(p_season_budget,100000),5000),
    5000,'local',5000,5000
  )$new$
  );

  if v_new=v_def then
    raise exception 'Youth Academy activation scouting commitment patch point not found';
  end if;

  execute v_new;
end $$;
