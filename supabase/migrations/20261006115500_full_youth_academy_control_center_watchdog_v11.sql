-- Full Youth Academy Control Center + watchdog coverage v11
-- Active module coverage only:
-- Overview/Core, Riders/Development, Staff, Budget, Scouting/Recruitment,
-- Responsibilities, Calendar/Race Operations, Rankings, History/Graduation.
-- Legacy unreachable Equipment/Assets code is intentionally NOT treated as an
-- active Youth Academy module surface.

create or replace function private.youth_watchdog_finish_v1(
  p_process_key text,
  p_issue_count integer,
  p_severity text,
  p_title text,
  p_problem_summary text,
  p_healthy_summary text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_status text:=case when coalesce(p_issue_count,0)>0 then 'warning' else 'success' end;
  v_summary text:=case when coalesce(p_issue_count,0)>0 then p_problem_summary else p_healthy_summary end;
  v_dedupe text:='business:'||replace(p_process_key,'check:','');
begin
  perform public.log_system_business_check_v1(
    p_process_key,
    v_status,
    v_summary,
    coalesce(p_details,'{}'::jsonb)
  );

  if coalesce(p_issue_count,0)>0 then
    perform public.raise_system_incident_v1(
      p_process_key,
      p_severity,
      p_title,
      p_problem_summary,
      v_dedupe,
      coalesce(p_details,'{}'::jsonb)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      v_dedupe,
      p_healthy_summary
    );
  end if;

  return jsonb_build_object(
    'status',v_status,
    'issues',coalesce(p_issue_count,0),
    'details',coalesce(p_details,'{}'::jsonb)
  );
end;
$function$;

create or replace function public.monitor_youth_core_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  ws date:=date_trunc('week',public.get_current_game_date_date())::date;
  wrong_capacity integer:=0;
  over_capacity integer:=0;
  invalid_age integer:=0;
  invalid_condition integer:=0;
  missing_agreement integer:=0;
  multiple_agreements integer:=0;
  missing_settings integer:=0;
  missing_budget integer:=0;
  missing_human_membership integer:=0;
  missing_weekly_development integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into wrong_capacity
  from public.youth_academies
  where is_active and capacity<>16;

  select count(*) into over_capacity
  from (
    select a.id,count(r.id) filter(where r.status in ('academy','graduating')) rider_count
    from public.youth_academies a
    left join public.youth_riders r on r.academy_id=a.id
    where a.is_active
    group by a.id,a.capacity
    having count(r.id) filter(where r.status in ('academy','graduating'))>max(a.capacity)
  ) x;

  select count(*) into invalid_age
  from public.youth_riders r
  join public.youth_academies a on a.id=r.academy_id and a.is_active
  where r.status='academy'
    and private.youth_academy_age_v1(r.birth_date) not between 12 and 16;

  select count(*) into invalid_condition
  from public.youth_riders r
  join public.youth_academies a on a.id=r.academy_id and a.is_active
  where r.status in ('academy','graduating')
    and (r.readiness not between 0 and 100 or r.fatigue not between 0 and 100);

  select count(*) into missing_agreement
  from public.youth_riders r
  join public.youth_academies a on a.id=r.academy_id and a.is_active
  where r.status='academy'
    and not exists(
      select 1 from public.youth_rider_agreements ag
      where ag.youth_rider_id=r.id and ag.status='active'
    );

  select count(*) into multiple_agreements
  from public.youth_riders r
  join public.youth_academies a on a.id=r.academy_id and a.is_active
  where r.status='academy'
    and (
      select count(*) from public.youth_rider_agreements ag
      where ag.youth_rider_id=r.id and ag.status='active'
    )>1;

  select count(*) into missing_settings
  from public.youth_academies a
  where a.is_active
    and not exists(
      select 1 from public.youth_academy_settings s where s.academy_id=a.id
    );

  select count(*) into missing_budget
  from public.youth_academies a
  where a.is_active
    and not exists(
      select 1 from public.youth_academy_season_budgets b
      where b.academy_id=a.id and b.season_number=public.get_current_season_number()
    );

  select count(*) into missing_human_membership
  from public.youth_academies a
  where a.is_active and not a.is_ai
    and not exists(
      select 1 from public.youth_academy_competition_memberships m
      where m.academy_id=a.id and m.season_number=public.get_current_season_number()
    );

  if extract(isodow from gd)::integer>1 then
    select count(*) into missing_weekly_development
    from public.youth_riders r
    join public.youth_academies a on a.id=r.academy_id and a.is_active
    where r.status='academy'
      and private.youth_academy_age_v1(r.birth_date) between 12 and 16
      and r.joined_game_date<=ws
      and not exists(
        select 1 from public.youth_development_weekly_runs d
        where d.youth_rider_id=r.id and d.week_start=ws
      );
  end if;

  issues:=
      wrong_capacity+over_capacity+invalid_age+invalid_condition+
      missing_agreement+multiple_agreements+missing_settings+missing_budget+
      missing_human_membership+missing_weekly_development;

  details:=jsonb_build_object(
    'wrong_capacity',wrong_capacity,
    'over_capacity_academies',over_capacity,
    'academy_riders_outside_age_12_16',invalid_age,
    'invalid_readiness_or_fatigue',invalid_condition,
    'academy_riders_without_active_agreement',missing_agreement,
    'riders_with_multiple_active_agreements',multiple_agreements,
    'active_academies_missing_settings',missing_settings,
    'active_academies_missing_current_budget',missing_budget,
    'human_academies_missing_current_membership',missing_human_membership,
    'missing_current_week_development_runs',missing_weekly_development,
    'game_date',gd,
    'week_start',ws
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_core',
    issues,
    'high',
    'Youth Academy core integrity requires attention',
    format('Youth core integrity found %s problem record(s).',issues),
    'Youth Academy activation, rider capacity, agreements and development are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_staff_responsibilities_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  missing_director integer:=0;
  missing_head_coach integer:=0;
  duplicate_required_roles integer:=0;
  stale_covers integer:=0;
  overdue_courses integer:=0;
  broken_delegations integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into missing_director
  from public.youth_academies a
  where a.is_active and not a.is_ai
    and not exists(
      select 1 from public.club_staff cs
      where cs.club_id=a.club_id and cs.is_active
        and cs.role_type='youth_academy_director'
    );

  select count(*) into missing_head_coach
  from public.youth_academies a
  where a.is_active and not a.is_ai
    and not exists(
      select 1 from public.club_staff cs
      where cs.club_id=a.club_id and cs.is_active
        and cs.role_type='u16_head_coach'
    );

  select count(*) into duplicate_required_roles
  from (
    select a.id,cs.role_type,count(*) c
    from public.youth_academies a
    join public.club_staff cs on cs.club_id=a.club_id and cs.is_active
    where a.is_active and not a.is_ai
      and cs.role_type in ('youth_academy_director','u16_head_coach')
    group by a.id,cs.role_type
    having count(*)>1
  ) x;

  select count(*) into stale_covers
  from public.youth_temporary_responsibility_covers c
  where c.cleared_on is null
    and private.youth_available_role_v1(c.academy_id,c.original_role) is not null;

  select count(*) into overdue_courses
  from public.staff_courses sc
  join public.club_staff cs on cs.id=sc.staff_id
  where sc.status='active'
    and sc.completes_on_game_date<gd
    and cs.role_type in ('youth_academy_director','u16_head_coach','youth_scout');

  with delegated as (
    select a.id academy_id,x.responsibility,x.role_code
    from public.youth_academies a
    join public.youth_academy_settings s on s.academy_id=a.id
    cross join lateral(values
      ('recruitment',s.recruitment_decider),
      ('recruitment_negotiation',s.recruitment_negotiation_decider),
      ('race_entry',s.race_entry_decider),
      ('race_squad',s.race_squad_decider),
      ('camp',s.camp_decider),
      ('training',s.training_decider)
    ) x(responsibility,role_code)
    where a.is_active and not a.is_ai and x.role_code<>'manager'
  )
  select count(*) into broken_delegations
  from delegated d
  where private.youth_available_role_v1(d.academy_id,d.role_code) is null
    and not exists(
      select 1
      from public.youth_temporary_responsibility_covers c
      where c.academy_id=d.academy_id
        and c.responsibility=d.responsibility
        and c.cleared_on is null
    );

  issues:=missing_director+missing_head_coach+duplicate_required_roles+
          stale_covers+overdue_courses+broken_delegations;

  details:=jsonb_build_object(
    'human_academies_missing_director',missing_director,
    'human_academies_missing_u16_head_coach',missing_head_coach,
    'duplicate_required_staff_roles',duplicate_required_roles,
    'stale_temporary_covers',stale_covers,
    'overdue_active_youth_staff_courses',overdue_courses,
    'delegated_responsibilities_without_available_staff_or_cover',broken_delegations,
    'game_date',gd
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_staff_responsibilities',
    issues,
    'high',
    'Youth Academy staff or responsibilities require attention',
    format('Youth staff/responsibility integrity found %s problem record(s).',issues),
    'Youth Academy staff roles, delegations, courses and temporary covers are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_scouting_recruitment_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  stale_reports integer:=0;
  invalid_cycles integer:=0;
  cycle_report_mismatch integer:=0;
  stale_offers integer:=0;
  signed_report_without_rider integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into stale_reports
  from public.youth_scouting_reports r
  where r.expires_on<gd and r.status in ('new','shortlisted','approached');

  select count(*) into invalid_cycles
  from public.youth_scouting_cycles c
  where c.reports_created<0 or c.reports_created>c.report_target_count;

  select count(*) into cycle_report_mismatch
  from public.youth_scouting_cycles c
  where c.reports_created<>(
    select count(*) from public.youth_scouting_reports r where r.cycle_id=c.id
  );

  select count(*) into stale_offers
  from public.youth_recruitment_offers o
  where o.status='submitted' and o.submitted_on<gd-2;

  select count(*) into signed_report_without_rider
  from public.youth_scouting_reports r
  where r.status='signed'
    and not exists(
      select 1
      from public.youth_recruitment_offers o
      where o.report_id=r.id and o.status='accepted' and o.rider_decision='accepted'
    );

  issues:=stale_reports+invalid_cycles+cycle_report_mismatch+
          stale_offers+signed_report_without_rider;

  details:=jsonb_build_object(
    'expired_reports_still_actionable',stale_reports,
    'invalid_scouting_cycle_counts',invalid_cycles,
    'cycle_report_count_mismatch',cycle_report_mismatch,
    'submitted_offers_stale_over_2_days',stale_offers,
    'signed_reports_without_accepted_offer',signed_report_without_rider,
    'game_date',gd
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_scouting_recruitment',
    issues,
    'warning',
    'Youth Academy scouting or recruitment requires attention',
    format('Youth scouting/recruitment integrity found %s problem record(s).',issues),
    'Youth Academy scouting cycles, reports and recruitment offers are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_finance_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  ws date:=date_trunc('week',public.get_current_game_date_date())::date;
  missing_budget integer:=0;
  negative_fields integer:=0;
  over_budget integer:=0;
  invalid_commitment integer:=0;
  missing_payroll integer:=0;
  entered_without_ledger integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into missing_budget
  from public.youth_academies a
  where a.is_active
    and not exists(
      select 1 from public.youth_academy_season_budgets b
      where b.academy_id=a.id and b.season_number=public.get_current_season_number()
    );

  select count(*) into negative_fields
  from public.youth_academy_season_budgets b
  where b.season_number=public.get_current_season_number()
    and (
      b.season_budget<0 or b.spent_amount<0 or b.committed_amount<0
      or b.scouting_budget<0 or b.scouting_committed_amount<0
    );

  select count(*) into over_budget
  from public.youth_academy_season_budgets b
  where b.season_number=public.get_current_season_number()
    and b.spent_amount+b.committed_amount>b.season_budget;

  select count(*) into invalid_commitment
  from public.youth_academy_season_budgets b
  where b.season_number=public.get_current_season_number()
    and b.scouting_committed_amount>b.committed_amount;

  if extract(isodow from gd)::integer>1 then
    select count(*) into missing_payroll
    from public.youth_academies a
    where a.is_active
      and not exists(
        select 1 from public.youth_academy_ledger l
        where l.academy_id=a.id
          and l.season_number=public.get_current_season_number()
          and l.category='weekly_payroll'
          and l.metadata->>'week_start'=ws::text
      );
  end if;

  select count(*) into entered_without_ledger
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.status='entered'
    and r.season_number=public.get_current_season_number()
    and not exists(
      select 1 from public.youth_academy_ledger l
      where l.academy_id=e.academy_id
        and l.season_number=r.season_number
        and l.category='race_travel'
        and l.metadata->>'race_id'=e.race_id::text
    );

  issues:=missing_budget+negative_fields+over_budget+
          invalid_commitment+missing_payroll+entered_without_ledger;

  details:=jsonb_build_object(
    'active_academies_missing_budget',missing_budget,
    'budgets_with_negative_fields',negative_fields,
    'budgets_over_season_limit',over_budget,
    'scouting_commitment_above_total_commitment',invalid_commitment,
    'missing_current_week_payroll_rows',missing_payroll,
    'entered_races_without_race_ledger',entered_without_ledger,
    'game_date',gd,
    'week_start',ws
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_finance',
    issues,
    'high',
    'Youth Academy finance requires attention',
    format('Youth finance integrity found %s problem record(s).',issues),
    'Youth Academy budgets, commitments, payroll and race costs are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_rankings_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  missing_human_membership integer:=0;
  inactive_memberships integer:=0;
  regional_geo_mismatch integer:=0;
  continental_geo_mismatch integer:=0;
  world_code_mismatch integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into missing_human_membership
  from public.youth_academies a
  where a.is_active and not a.is_ai
    and not exists(
      select 1 from public.youth_academy_competition_memberships m
      where m.academy_id=a.id and m.season_number=public.get_current_season_number()
    );

  select count(*) into inactive_memberships
  from public.youth_academy_competition_memberships m
  join public.youth_academies a on a.id=m.academy_id
  where m.season_number=public.get_current_season_number()
    and not a.is_active;

  select count(*) into regional_geo_mismatch
  from public.youth_academy_competition_memberships m
  join public.youth_academies a on a.id=m.academy_id
  join public.clubs c on c.id=a.club_id
  where m.season_number=public.get_current_season_number()
    and m.competition_class='regional'
    and m.division_code<>private.youth_regional_division_for_country_v1(c.country_code);

  select count(*) into continental_geo_mismatch
  from public.youth_academy_competition_memberships m
  join public.youth_academies a on a.id=m.academy_id
  join public.clubs c on c.id=a.club_id
  where m.season_number=public.get_current_season_number()
    and m.competition_class='continental'
    and m.division_code<>private.youth_continental_division_for_country_v1(c.country_code);

  select count(*) into world_code_mismatch
  from public.youth_academy_competition_memberships m
  where m.season_number=public.get_current_season_number()
    and m.competition_class='world'
    and m.division_code<>'WORLD';

  issues:=missing_human_membership+inactive_memberships+
          regional_geo_mismatch+continental_geo_mismatch+world_code_mismatch;

  details:=jsonb_build_object(
    'human_academies_missing_membership',missing_human_membership,
    'inactive_academies_with_current_membership',inactive_memberships,
    'regional_geography_mismatch',regional_geo_mismatch,
    'continental_geography_mismatch',continental_geo_mismatch,
    'world_division_code_mismatch',world_code_mismatch,
    'season_number',public.get_current_season_number()
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_rankings',
    issues,
    'high',
    'Youth Academy rankings or hierarchy require attention',
    format('Youth ranking/hierarchy integrity found %s problem record(s).',issues),
    'Youth Academy ranking memberships and geographic divisions are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_lifecycle_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  overdue_age integer:=0;
  stuck_graduations integer:=0;
  overdue_camps integer:=0;
  completed_missing_results integer:=0;
  completed_entries_missing_results integer:=0;
  completed_stages_missing_results integer:=0;
  future_calendar_missing integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into overdue_age
  from public.youth_riders r
  join public.youth_academies a on a.id=r.academy_id and a.is_active
  where r.status='academy' and private.youth_academy_age_v1(r.birth_date)>16;

  select count(*) into stuck_graduations
  from public.youth_graduation_records g
  where g.decision<>'pending'
    and g.completed_on is null
    and (
      (g.decision='pathway' and g.pathway_expires_on is not null and g.pathway_expires_on<gd)
      or (g.decision<>'pathway' and g.decided_on is not null and g.decided_on<gd)
    );

  select count(*) into overdue_camps
  from public.youth_training_camps c
  where c.status='scheduled' and c.ends_on<gd;

  select count(*) into completed_missing_results
  from public.youth_races r
  where r.status='completed'
    and exists(
      select 1 from public.youth_race_entries e
      where e.race_id=r.id and e.status='completed'
    )
    and not exists(
      select 1 from public.youth_race_results rr where rr.race_id=r.id
    );

  select count(*) into completed_entries_missing_results
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where r.status='completed' and e.status='completed'
    and exists(select 1 from public.youth_race_lineups l where l.entry_id=e.id)
    and not exists(select 1 from public.youth_race_results rr where rr.entry_id=e.id);

  select count(*) into completed_stages_missing_results
  from public.youth_race_stages s
  join public.youth_races r on r.id=s.race_id
  where r.status='completed' and s.status='completed'
    and not exists(
      select 1 from public.youth_race_stage_results sr
      where sr.race_id=s.race_id and sr.stage_number=s.stage_number
    );

  if extract(month from gd)::integer<12 then
    select case when exists(
      select 1 from public.youth_races r
      where r.season_number=public.get_current_season_number()
        and r.status='scheduled' and r.race_date>gd
    ) then 0 else 1 end
    into future_calendar_missing;
  end if;

  issues:=overdue_age+stuck_graduations+overdue_camps+
          completed_missing_results+completed_entries_missing_results+
          completed_stages_missing_results+future_calendar_missing;

  details:=jsonb_build_object(
    'academy_riders_over_age_16',overdue_age,
    'stuck_nonpending_graduations',stuck_graduations,
    'training_camps_past_end_still_scheduled',overdue_camps,
    'completed_races_missing_any_results',completed_missing_results,
    'completed_entries_missing_results',completed_entries_missing_results,
    'completed_stages_missing_stage_results',completed_stages_missing_results,
    'future_calendar_missing',future_calendar_missing,
    'game_date',gd
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_lifecycle',
    issues,
    'high',
    'Youth Academy lifecycle requires attention',
    format('Youth lifecycle/history integrity found %s problem record(s).',issues),
    'Youth Academy graduation, camps, race history and future calendar are healthy.',
    details
  );
end;
$function$;

-- Expand the existing competition watchdog with application lifecycle checks.
create or replace function public.monitor_youth_competition_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  gd date:=public.get_current_game_date_date();
  below_target integer:=0;
  missing_runtime integer:=0;
  cold_races integer:=0;
  pending_past_deadline integer:=0;
  accepted_without_entry integer:=0;
  due_today_without_lineup integer:=0;
  world_count integer:=0;
  west_count integer:=0;
  east_count integer:=0;
  issues integer:=0;
  details jsonb;
begin
  select count(*) into below_target
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>gd and r.race_date<=gd+7
    and (
      select count(*) from public.youth_race_entries e
      where e.race_id=r.id and e.status in ('entered','completed')
    )<coalesce(r.target_teams,6);

  select count(*) into missing_runtime
  from public.youth_races r
  where r.status='scheduled'
    and r.race_date>=gd and r.race_date<=gd+14
    and (
      not exists(select 1 from public.youth_race_stages s where s.race_id=r.id)
      or exists(
        select 1 from public.youth_race_stages s
        where s.race_id=r.id and (
          s.planned_start_hour_number is null
          or s.start_city is null
          or s.finish_city is null
        )
      )
    );

  select count(*) into cold_races
  from public.youth_races r
  where r.status='scheduled' and r.race_date>gd
    and not private.youth_race_city_weather_eligible_v9(
      r.host_country_code,r.host_city,r.race_date,coalesce(r.race_end_date,r.race_date)
    );

  select count(*) into pending_past_deadline
  from public.youth_race_invitations i
  join public.youth_races r on r.id=i.race_id
  join public.youth_academies a on a.id=i.academy_id
  where not a.is_ai
    and r.status='scheduled'
    and i.status='pending'
    and i.response_deadline<gd
    and (
      coalesce((i.metadata->>'manual_manager_application')::boolean,false)
      or coalesce((i.metadata->>'staff_application')::boolean,false)
    );

  select count(*) into accepted_without_entry
  from public.youth_race_invitations i
  join public.youth_races r on r.id=i.race_id
  where r.status='scheduled'
    and i.status='accepted'
    and not exists(
      select 1 from public.youth_race_entries e
      where e.race_id=i.race_id and e.academy_id=i.academy_id
        and e.status in ('entered','completed')
    );

  select count(*) into due_today_without_lineup
  from public.youth_race_entries e
  join public.youth_races r on r.id=e.race_id
  where e.status='entered' and r.status='scheduled' and r.race_date<=gd
    and (select count(*) from public.youth_race_lineups l where l.entry_id=e.id)<3;

  select count(*) into world_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and competition_class='world';

  select count(*) into west_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_WEST';

  select count(*) into east_count
  from public.youth_academy_competition_memberships
  where season_number=public.get_current_season_number() and division_code='CONTINENTAL_EAST';

  issues:=below_target+missing_runtime+cold_races+pending_past_deadline+
          accepted_without_entry+due_today_without_lineup+
          (case when world_count<>16 then 1 else 0 end)+
          (case when west_count<>20 then 1 else 0 end)+
          (case when east_count<>20 then 1 else 0 end);

  details:=jsonb_build_object(
    'below_target_within_7_days',below_target,
    'missing_runtime_within_14_days',missing_runtime,
    'races_below_city_climate_rule',cold_races,
    'human_applications_past_decision_deadline',pending_past_deadline,
    'accepted_invitations_without_entry',accepted_without_entry,
    'race_day_entries_without_minimum_lineup',due_today_without_lineup,
    'world_teams',world_count,
    'continental_west_teams',west_count,
    'continental_east_teams',east_count,
    'game_date',gd
  );

  return private.youth_watchdog_finish_v1(
    'check:youth_competition',
    issues,
    'high',
    'Youth Academy competition requires attention',
    format('Youth competition integrity found %s problem record(s).',issues),
    'Youth Academy competition, applications, climate, race runtime and hierarchy are healthy.',
    details
  );
end;
$function$;

create or replace function public.monitor_youth_academy_full_health_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,private,pg_temp
as $function$
declare
  v_core jsonb;
  v_staff jsonb;
  v_scouting jsonb;
  v_finance jsonb;
  v_competition jsonb;
  v_rankings jsonb;
  v_lifecycle jsonb;
  v_errors integer:=0;
  v_unhealthy integer:=0;
  v_result jsonb;
begin
  begin
    v_core:=public.monitor_youth_core_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_core','error','Youth core watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_core','critical','Youth core watchdog failed',
      sqlerrm,'business:youth_core',jsonb_build_object('sqlstate',sqlstate)
    );
    v_core:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_staff:=public.monitor_youth_staff_responsibilities_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_staff_responsibilities','error','Youth staff/responsibility watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_staff_responsibilities','critical','Youth staff/responsibility watchdog failed',
      sqlerrm,'business:youth_staff_responsibilities',jsonb_build_object('sqlstate',sqlstate)
    );
    v_staff:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_scouting:=public.monitor_youth_scouting_recruitment_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_scouting_recruitment','error','Youth scouting/recruitment watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_scouting_recruitment','critical','Youth scouting/recruitment watchdog failed',
      sqlerrm,'business:youth_scouting_recruitment',jsonb_build_object('sqlstate',sqlstate)
    );
    v_scouting:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_finance:=public.monitor_youth_finance_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_finance','error','Youth finance watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_finance','critical','Youth finance watchdog failed',
      sqlerrm,'business:youth_finance',jsonb_build_object('sqlstate',sqlstate)
    );
    v_finance:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_competition:=public.monitor_youth_competition_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_competition','error','Youth competition watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_competition','critical','Youth competition watchdog failed',
      sqlerrm,'business:youth_competition',jsonb_build_object('sqlstate',sqlstate)
    );
    v_competition:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_rankings:=public.monitor_youth_rankings_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_rankings','error','Youth rankings watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_rankings','critical','Youth rankings watchdog failed',
      sqlerrm,'business:youth_rankings',jsonb_build_object('sqlstate',sqlstate)
    );
    v_rankings:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  begin
    v_lifecycle:=public.monitor_youth_lifecycle_health_v1();
  exception when others then
    v_errors:=v_errors+1;
    perform public.log_system_business_check_v1(
      'check:youth_lifecycle','error','Youth lifecycle watchdog failed to execute.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_lifecycle','critical','Youth lifecycle watchdog failed',
      sqlerrm,'business:youth_lifecycle',jsonb_build_object('sqlstate',sqlstate)
    );
    v_lifecycle:=jsonb_build_object('status','error','error',sqlerrm);
  end;

  v_unhealthy:=
      (case when coalesce(v_core->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_staff->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_scouting->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_finance->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_competition->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_rankings->>'status','error')<>'success' then 1 else 0 end)+
      (case when coalesce(v_lifecycle->>'status','error')<>'success' then 1 else 0 end);

  v_result:=jsonb_build_object(
    'status',case when v_errors>0 then 'error' when v_unhealthy>0 then 'warning' else 'success' end,
    'unhealthy_sections',v_unhealthy,
    'execution_errors',v_errors,
    'core',v_core,
    'staff_responsibilities',v_staff,
    'scouting_recruitment',v_scouting,
    'finance',v_finance,
    'competition',v_competition,
    'rankings',v_rankings,
    'lifecycle',v_lifecycle
  );

  perform public.log_system_business_check_v1(
    'check:youth_watchdog',
    case when v_errors>0 then 'error' when v_unhealthy>0 then 'warning' else 'success' end,
    case
      when v_errors>0 then format('Youth Academy watchdog had %s execution error(s).',v_errors)
      when v_unhealthy>0 then format('Youth Academy watchdog has %s unhealthy section(s).',v_unhealthy)
      else 'Full Youth Academy watchdog is green.'
    end,
    jsonb_build_object('unhealthy_sections',v_unhealthy,'execution_errors',v_errors)
  );

  if v_errors>0 then
    perform public.raise_system_incident_v1(
      'check:youth_watchdog','critical','Full Youth Academy watchdog failed',
      format('%s Youth watchdog sub-check(s) failed to execute.',v_errors),
      'business:youth_watchdog',
      jsonb_build_object('execution_errors',v_errors)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:youth_watchdog',
      'Full Youth Academy watchdog is executing normally.'
    );
  end if;

  return v_result;
end;
$function$;

-- Register every active Youth Academy surface in Control Center.
insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,user_sensitive,
  incident_severity,expected_interval_minutes,stale_after_minutes,
  email_alerts_enabled,is_enabled,sort_order
) values
('check:youth_watchdog','Youth Academy full watchdog','gameplay',
 'Master Youth Academy watchdog. Runs all active Youth sub-checks every five minutes.',
 'business_check',null,true,'critical',5,15,true,true,260),
('check:youth_core','Youth Academy core & riders','gameplay',
 'Monitors activation, 16-rider capacity, ages, rider agreements, current budgets/settings/membership and weekly development.',
 'business_check',null,true,'high',5,15,true,true,261),
('check:youth_staff_responsibilities','Youth staff & responsibilities','gameplay',
 'Monitors required Youth staff, delegated responsibilities, temporary covers and staff-course return handling.',
 'business_check',null,true,'high',5,15,true,true,262),
('check:youth_scouting_recruitment','Youth scouting & recruitment','gameplay',
 'Monitors scouting cycles/reports, expiry handling and recruitment offer lifecycle.',
 'business_check',null,true,'warning',5,15,true,true,263),
('check:youth_finance','Youth Academy finance','finance',
 'Monitors Youth budgets, commitments, weekly payroll and race-cost ledger integrity.',
 'business_check',null,true,'high',5,15,true,true,264),
('check:youth_competition','Youth race operations','gameplay',
 'Monitors variable race fields, application decisions, stage runtime, climate, lineups and World/Continental hierarchy.',
 'business_check',null,true,'high',5,15,true,true,265),
('check:youth_rankings','Youth rankings & hierarchy','gameplay',
 'Monitors current Youth memberships, geographic Regional/Continental placement and ranking hierarchy integrity.',
 'business_check',null,true,'high',5,15,true,true,266),
('check:youth_lifecycle','Youth history & lifecycle','gameplay',
 'Monitors graduation, training camps, completed race results/history and future calendar continuity.',
 'business_check',null,true,'high',5,15,true,true,267)
on conflict(process_key) do update set
  label=excluded.label,
  category=excluded.category,
  description=excluded.description,
  source_kind=excluded.source_kind,
  source_ref=excluded.source_ref,
  user_sensitive=excluded.user_sensitive,
  incident_severity=excluded.incident_severity,
  expected_interval_minutes=excluded.expected_interval_minutes,
  stale_after_minutes=excluded.stale_after_minutes,
  email_alerts_enabled=excluded.email_alerts_enabled,
  is_enabled=excluded.is_enabled,
  sort_order=excluded.sort_order;

-- Wire the actual Youth daily processor into the canonical daily tick.
create or replace function public.process_daily_tick()
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare
  v_season int;
  v_month smallint;
  v_day smallint;
  v_paused boolean;
  v_date date;
begin
  select season_number,month_number,day_number,is_paused
  into v_season,v_month,v_day,v_paused
  from public.game_state
  where id=true;

  if coalesce(v_paused,false) then return; end if;

  v_date:=public.get_current_game_date_date();

  begin perform public.run_retirement_daily_jobs(); exception when others then raise warning 'run_retirement_daily_jobs failed: %',sqlerrm; end;
  begin perform public.process_due_rider_contract_starts_v1(v_date,null,null,null); exception when others then raise warning 'process_due_rider_contract_starts_v1 failed: %',sqlerrm; end;
  begin perform public.process_developing_team_age_limits_v1(v_date); exception when others then raise warning 'process_developing_team_age_limits_v1 failed: %',sqlerrm; end;
  begin perform public.notify_developing_team_window_open(); exception when others then raise warning 'notify_developing_team_window_open failed: %',sqlerrm; end;
  begin perform public.prepare_next_season_race_calendar_if_due_v1(); exception when others then raise warning 'prepare_next_season_race_calendar_if_due_v1 failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camp_activities(); exception when others then raise warning 'process_daily_training_camp_activities failed: %',sqlerrm; end;
  begin perform public.process_daily_regular_training(); exception when others then raise warning 'process_daily_regular_training failed: %',sqlerrm; end;
  begin perform public.process_daily_training_camps(); exception when others then raise warning 'process_daily_training_camps failed: %',sqlerrm; end;
  begin perform public.process_weekly_rider_development(); exception when others then raise warning 'process_weekly_rider_development failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_rider_wages_guarded_v1(); exception when others then raise warning 'finance_process_weekly_rider_wages_guarded_v1 failed: %',sqlerrm; end;
  begin perform public.finance_process_weekly_team_policy_costs(); exception when others then raise warning 'finance_process_weekly_team_policy_costs failed: %',sqlerrm; end;
  begin perform public.finance_process_team_policy_nonrecurring_costs_v1(); exception when others then raise warning 'finance_process_team_policy_nonrecurring_costs_v1 failed: %',sqlerrm; end;
  begin perform public.process_daily_fatigue(); exception when others then raise warning 'process_daily_fatigue failed: %',sqlerrm; end;
  begin perform public.process_daily_health_cases(); exception when others then raise warning 'process_daily_health_cases failed: %',sqlerrm; end;
  begin perform public.process_daily_morale_v1(); exception when others then raise warning 'process_daily_morale_v1 failed: %',sqlerrm; end;
  begin perform public.process_staff_courses(); exception when others then raise warning 'process_staff_courses failed: %',sqlerrm; end;
  begin perform public.staff_market_run_daily_refresh(150,72); exception when others then raise warning 'staff_market_run_daily_refresh failed: %',sqlerrm; end;
  begin perform public.complete_due_rider_scout_tasks(); exception when others then raise warning 'complete_due_rider_scout_tasks failed: %',sqlerrm; end;
  begin perform public.create_staff_contract_expiry_notifications(); exception when others then raise warning 'create_staff_contract_expiry_notifications failed: %',sqlerrm; end;
  begin perform public.run_daily_market_jobs_detailed(); exception when others then raise warning 'run_daily_market_jobs_detailed failed: %',sqlerrm; end;
  begin perform public.process_daily_coach_training_plans_v1(v_date); exception when others then raise warning 'process_daily_coach_training_plans_v1 failed: %',sqlerrm; end;
  begin perform public.apply_team_policy_rider_support_v1(v_date); exception when others then raise warning 'apply_team_policy_rider_support_v1 failed: %',sqlerrm; end;
  begin perform public.process_national_team_selection_deadlines_v1(); exception when others then raise warning 'process_national_team_selection_deadlines_v1 failed: %',sqlerrm; end;

  -- Youth Academy daily lifecycle: scouting reset, staff decisions, temporary
  -- cover cleanup, weekly Youth payroll/development, camps, races and graduation.
  begin
    perform public.process_youth_academy_game_day_v1(v_date);
  exception when others then
    raise warning 'process_youth_academy_game_day_v1 failed: %',sqlerrm;
  end;

  begin
    perform public.ensure_rider_skill_weekly_snapshots_v1(v_date);
  exception when others then
    raise warning 'ensure_rider_skill_weekly_snapshots_v1 failed: %',sqlerrm;
  end;
end;
$function$;

-- Add the full Youth watchdog to the existing five-minute System Health watchdog.
create or replace function public.run_system_health_watchdog_v1()
returns jsonb
language plpgsql
security definer
set search_path=public,cron,pg_temp
as $function$
declare
  v_base jsonb;
  v_championship jsonb;
  v_lifecycle jsonb;
  v_draw jsonb;
  v_youth jsonb;
begin
  v_base:=public.run_system_health_watchdog_base_v1();

  begin
    v_championship:=public.championship_operations_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_operations','critical',
      'Championship health check failed',sqlerrm,
      'business:championship-operations-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_championship:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_lifecycle:=public.national_championship_lifecycle_watchdog_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:national_championship_lifecycle','critical',
      'National Championship lifecycle health check failed',sqlerrm,
      'business:national-championship-lifecycle-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_lifecycle:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_draw:=public.championship_calendar_draw_health_check_v1();
  exception when others then
    perform public.raise_system_incident_v1(
      'check:championship_calendar_draw','critical',
      'Championship calendar draw health check failed',sqlerrm,
      'business:championship-calendar-draw-check-failed',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_draw:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  begin
    v_youth:=public.monitor_youth_academy_full_health_v1();
  exception when others then
    perform public.log_system_business_check_v1(
      'check:youth_watchdog','error',
      'Full Youth Academy watchdog failed before completing all sub-checks.',
      jsonb_build_object('error',sqlerrm,'sqlstate',sqlstate)
    );
    perform public.raise_system_incident_v1(
      'check:youth_watchdog','critical',
      'Full Youth Academy watchdog failed',
      sqlerrm,'business:youth_watchdog',
      jsonb_build_object('sqlstate',sqlstate)
    );
    v_youth:=jsonb_build_object('status','error','message',sqlerrm,'sqlstate',sqlstate);
  end;

  return coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'race_and_championship_operations',v_championship,
      'national_championship_lifecycle',v_lifecycle,
      'championship_calendar_draw',v_draw,
      'youth_academy_watchdog',v_youth
    );
end;
$function$;

-- One-time catch-up because the Youth daily processor existed before it was
-- connected to the canonical daily tick. This makes the new watchdog start
-- from a valid current-week baseline.
do $block$
declare
  gd date:=public.get_current_game_date_date();
  ws date:=date_trunc('week',public.get_current_game_date_date())::date;
begin
  if extract(isodow from gd)::integer>1 then
    perform private.process_youth_academy_weekly_payroll_v1(ws);
    perform private.process_youth_development_week_v1(ws);
  end if;

  perform public.process_youth_academy_game_day_v1(gd);
end;
$block$;

select public.monitor_youth_academy_full_health_v1();
