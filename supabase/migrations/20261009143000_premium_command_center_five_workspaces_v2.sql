-- Premium Command Center v2: read-only analytics and manager attention queue.
-- Applied to project okuravitxocyevkexfgi; retained in git for reproducible deployments.
-- All data is manager-scoped and subject to the existing Premium access guard.

CREATE OR REPLACE FUNCTION public.premium_get_command_center_v2(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_club uuid;
  v_uid uuid:=auth.uid();
  v_today date:=public.get_current_game_date_date();
  v_base jsonb;
  v_youth_id uuid;
  v_youth_active boolean:=false;
  v_assoc_id uuid;
  v_assoc_name text;
  v_assoc_country text;
  v_coach boolean:=false;
  v_youth jsonb;
  v_national jsonb;
  v_scouting jsonb;
  v_staff jsonb;
  v_infra jsonb;
  v_attention jsonb;
begin
  -- Enforce the exact ownership/Premium policy already used by v1.
  v_club:=public.premium_assert_manager_access_v1(p_club_id);
  v_base:=public.premium_get_command_center_v1(v_club);

  select a.id,a.is_active into v_youth_id,v_youth_active
  from public.youth_academies a where a.club_id=v_club
  order by a.is_active desc,a.created_at desc limit 1;

  select a.id,a.name,a.country_code into v_assoc_id,v_assoc_name,v_assoc_country
  from public.national_associations a
  where a.status='active' and (
    exists (select 1 from public.national_association_memberships m
      where m.association_id=a.id and m.status='active' and m.user_id=v_uid and m.club_id=v_club)
    or exists (select 1 from public.national_coach_terms term
      where term.association_id=a.id and term.status='active' and term.user_id=v_uid and term.club_id=v_club)
  )
  order by (select count(*) from public.national_coach_terms term
       where term.association_id=a.id and term.status='active'
         and term.user_id=v_uid and term.club_id=v_club) desc, a.country_code
  limit 1;

  if v_assoc_id is not null then
    select exists(select 1 from public.national_coach_terms term
       where term.association_id=v_assoc_id and term.status='active'
         and term.user_id=v_uid and term.club_id=v_club)
    into v_coach;
  end if;

  v_youth:=jsonb_build_object(
    'available',coalesce(v_youth_active,false),
    'has_academy',v_youth_id is not null,
    'riders_count',coalesce((select count(*)::integer from public.youth_riders r
      where r.academy_id=v_youth_id and r.status='academy'),0),
    'rider_limit',coalesce((select a.capacity from public.youth_academies a where a.id=v_youth_id),16),
    'upcoming_races',coalesce((select count(*)::integer from public.youth_race_entries e
      join public.youth_races r on r.id=e.race_id
      where e.academy_id=v_youth_id and e.status='entered'
        and r.race_date>=v_today and r.status='scheduled'),0),
    'pending_invitations',coalesce((select count(*)::integer
      from public.youth_race_invitations i join public.youth_races r on r.id=i.race_id
      where i.academy_id=v_youth_id and i.status='pending'
        and (i.response_deadline is null or i.response_deadline>=v_today)
        and r.race_date>=v_today and r.status='scheduled'),0),
    'scouting_reports_pending',coalesce((select count(*)::integer from public.youth_scouting_reports r
      where r.academy_id=v_youth_id and r.status in ('new','unreviewed')),0),
    'scouting_reports_total',coalesce((select count(*)::integer from public.youth_scouting_reports r
      where r.academy_id=v_youth_id),0),
    'graduation_decisions_pending',coalesce((select count(*)::integer from public.youth_graduation_records g
      where g.academy_id=v_youth_id and g.decision='pending'),0),
    'riders_nearing_graduation',coalesce((select count(*)::integer from public.youth_riders r
      where r.academy_id=v_youth_id and r.status='academy'
        and (r.birth_date+interval '16 years')::date between v_today and v_today+60),0),
    'latest_races',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.race_date)
      from (
        select r.id race_id,r.race_name,r.race_date,
          case when e.id is not null then 'entered'
            else i.status end as status
        from public.youth_races r
        left join public.youth_race_entries e on e.race_id=r.id and e.academy_id=v_youth_id and e.status='entered'
        left join public.youth_race_invitations i on i.race_id=r.id and i.academy_id=v_youth_id
        where v_youth_id is not null and r.race_date>=v_today and r.status='scheduled'
          and (e.id is not null or i.race_id is not null)
        order by r.race_date,r.race_name limit 5
      ) x
    ),'[]'::jsonb)
  );

  v_national:=jsonb_build_object(
    'has_association',v_assoc_id is not null,
    'association_name',v_assoc_name,
    'country_code',v_assoc_country,
    'role',case when v_coach then 'national_coach'
      when v_assoc_id is not null then 'member' else null end,
    'is_coach',v_coach,
    'national_championships_upcoming',coalesce((
      select count(*)::integer from public.national_championship_editions n
      where n.season_number=public.get_current_season_number()
        and n.status not in ('completed','cancelled')
        and (n.final_date>=v_today or n.qualification_date>=v_today)
        and n.country_code in (
          select distinct r.country_code from public.club_roster cr
          join public.riders r on r.id=cr.rider_id where cr.club_id=v_club
        )
    ),0),
    'next_event_date',(
      select min(e.event_date) from public.nations_group_events e
      join public.nations_competition_groups g on g.id=e.group_id
      join public.nations_group_entries ge on ge.group_id=g.id and ge.status<>'withdrawn'
      join public.nations_competition_entries ne on ne.id=ge.competition_entry_id
      where ne.association_id=v_assoc_id and e.event_date>=v_today
    ),
    'squad_ready',coalesce((
      select count(*)=10 from public.national_team_squad_members m
      join public.national_team_squads s on s.id=m.squad_id
      where s.id=(
        select sq.id from public.national_team_squads sq
        where sq.association_id=v_assoc_id
          and sq.status in ('confirmed','on_duty')
        order by sq.created_at desc limit 1
      )
    ),false),
    'selected_riders',coalesce((
      select count(*)::integer from public.national_team_squad_members m
      where m.squad_id=(
        select sq.id from public.national_team_squads sq
        where sq.association_id=v_assoc_id and sq.status in ('confirmed','on_duty')
        order by sq.created_at desc limit 1)
    ),0),
    'squad_target',10,
    'lineups_ready',coalesce((
      select count(*)::integer from public.national_team_lineups l
      where l.squad_id=(
        select sq.id from public.national_team_squads sq
        where sq.association_id=v_assoc_id and sq.status in ('confirmed','on_duty')
        order by sq.created_at desc limit 1)
       and l.status in ('confirmed','locked','completed')
       and (select count(*) from public.national_team_lineup_members m where m.lineup_id=l.id)=7
    ),0),
    'lineup_target',3,
    'pending_lineup_deadlines',coalesce((
      select count(*)::integer from public.nations_group_events e
      join public.nations_competition_groups g on g.id=e.group_id
      join public.nations_group_entries ge on ge.group_id=g.id and ge.status<>'withdrawn'
      join public.nations_competition_entries ne on ne.id=ge.competition_entry_id
      left join public.national_team_squads s on s.association_id=ne.association_id and s.cycle_key=e.cycle_key
      left join public.national_team_lineups l on l.squad_id=s.id and l.race_day=e.race_day
      where ne.association_id=v_assoc_id and e.event_date between v_today and v_today+21
        and e.status not in ('completed','cancelled')
        and (l.id is null or l.status not in ('confirmed','locked','completed'))
    ),0)
  );

  v_scouting:=jsonb_build_object(
    'unread_reports',coalesce((select count(*)::integer from public.rider_scout_reports r
      where r.club_id=v_club and coalesce(r.review_status,'new')='new'),0),
    'reports_total',coalesce((select count(*)::integer from public.rider_scout_reports r
      where r.club_id=v_club),0),
    'active_tasks',coalesce((select count(*)::integer from public.rider_scout_tasks task
      where task.club_id=v_club and task.status not in
        ('completed','failed','cancelled','canceled','expired')),0),
    'shortlist_matches',coalesce((select count(*)::integer from public.transfer_shortlist s
      where s.club_id=v_club and s.target_type='rider' and s.removed_at is null
      and exists(select 1 from public.rider_scout_reports report
          where report.club_id=v_club and report.rider_id=s.target_id)),0),
    'recent_reports',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select sr.id,sr.rider_id,coalesce(r.display_name,r.first_name||' '||r.last_name) rider_name,
          sr.precision_tier,sr.review_status,sr.created_at
        from public.rider_scout_reports sr join public.riders r on r.id=sr.rider_id
        where sr.club_id=v_club order by sr.created_at desc limit 5
      ) x
    ),'[]'::jsonb)
  );

  v_staff:=jsonb_build_object(
    'active_staff',coalesce((select count(*)::integer from public.club_staff cs
      where cs.club_id=v_club and cs.is_active),0),
    'vacant_key_roles',coalesce((
      select count(*)::integer from (values ('head_coach'),('team_doctor'),('sport_director')) role(key)
      where not exists(select 1 from public.club_staff cs
        where cs.club_id=v_club and cs.is_active and cs.role_type=role.key)
    ),0),
    'expiring_contracts',coalesce((
      select count(*)::integer from public.club_staff cs where cs.club_id=v_club
        and cs.is_active and cs.contract_expires_at between v_today and v_today+30
    ),0),
    'fatigue_watch',coalesce((
      select count(*)::integer from public.club_roster cr join public.riders r on r.id=cr.rider_id
      where cr.club_id=v_club and r.fatigue>=70
    ),0),
    'injured_or_unavailable',coalesce((
      select count(*)::integer from public.club_roster cr join public.riders r on r.id=cr.rider_id
      where cr.club_id=v_club and r.availability_status<>'fit'
    ),0),
    'upcoming_contracts',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.contract_expires_at)
      from (
        select cs.id,cs.staff_name,cs.role_type,cs.contract_expires_at
        from public.club_staff cs where cs.club_id=v_club and cs.is_active
          and cs.contract_expires_at between v_today and v_today+60
        order by cs.contract_expires_at limit 5
      ) x
    ),'[]'::jsonb)
  );

  v_infra:=jsonb_build_object(
    'jobs_in_progress',coalesce((select count(*)::integer from public.club_infrastructure_jobs j
      where j.club_id=v_club and j.status in ('pending','scheduled','in_progress','active','building')),0),
    'facility_upgrades_completed',coalesce((select count(*)::integer from public.club_infrastructure_jobs j
      where j.club_id=v_club and j.status='completed'),0),
    'repair_jobs_in_progress',coalesce((select count(*)::integer from public.club_infrastructure_asset_repair_jobs j
      where j.club_id=v_club and j.status not in ('completed','cancelled','failed')),0),
    'equipment_under_50_condition',coalesce((select count(*)::integer from public.club_equipment_inventory i
      where i.club_id=v_club and i.status not in ('sold','discarded')
        and i.condition_percent<50),0),
    'supply_shortages',coalesce((select count(*)::integer from public.club_race_supplies s
      where s.club_id=v_club and s.quantity_available<5),0),
    'monthly_maintenance',coalesce((
      select sum(c.monthly_maintenance_cash)::bigint
      from public.club_infrastructure ci
      join lateral (
        select * from (values
          ('club_house',ci.hq_level),
          ('training_center',ci.training_center_level),
          ('medical_center',ci.medical_center_level),
          ('scouting_office',ci.scouting_level),
          ('mechanics_workshop',ci.mechanics_workshop_level),
          ('youth_academy',ci.youth_academy_level),
          ('team_residential_campus',ci.team_residential_campus_level),
          ('sprint_performance_circuit',ci.sprint_performance_circuit_level),
          ('climbing_performance_center',ci.climbing_performance_center_level),
          ('team_time_trial_center',ci.team_time_trial_center_level)
        ) as f(facility_key,level)
      ) active_facilities on active_facilities.level>0
      join public.infrastructure_facility_upgrade_config c
        on c.facility_key=active_facilities.facility_key and c.target_level=active_facilities.level
      where ci.club_id=v_club
    ),0),
    'upcoming_projects',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.complete_game_date)
      from (
        select j.target_key,j.job_type,j.status,j.complete_game_date
        from public.club_infrastructure_jobs j where j.club_id=v_club
          and j.status in ('pending','scheduled','in_progress','active','building')
        order by j.complete_game_date nulls last limit 5
      ) x
    ),'[]'::jsonb)
  );

  select coalesce(jsonb_agg(to_jsonb(issue) order by issue.priority,issue.issue_id),'[]'::jsonb)
  into v_attention
  from (
    select 1 priority,'youth-invites' issue_id,'warning' severity,
      'Youth invitations awaiting a decision' title,
      (v_youth->>'pending_invitations')||' invitations need review.' description,
      '/dashboard/youth-academy' route
    where (v_youth->>'pending_invitations')::integer>0
    union all
    select 1,'youth-graduations','warning',
      'Youth graduation decisions pending',
      (v_youth->>'graduation_decisions_pending')||' riders need a graduation decision.',
      '/dashboard/youth-academy'
    where (v_youth->>'graduation_decisions_pending')::integer>0
    union all
    select 1,'national-lineups','warning',
      'National team lineups require attention',
      (v_national->>'pending_lineup_deadlines')||' race-day lineups are not ready in the next 21 game days.',
      '/dashboard/national-association/squad'
    where v_coach and (v_national->>'pending_lineup_deadlines')::integer>0
    union all
    select 1,'race-preparation','warning',
      'Race preparation deadline approaching',
      'An upcoming race needs a startlist submission before its deadline.',
      '/dashboard/race-preparation'
    where exists(select 1 from jsonb_array_elements(coalesce(v_base->'season_planner','[]'::jsonb)) prep
      where prep->>'planning_state'='deadline_close')
    union all
    select 2,'staff-vacancies','warning',
      'Core staff role vacant',
      (v_staff->>'vacant_key_roles')||' key roles need staffing.',
      '/dashboard/staff'
    where (v_staff->>'vacant_key_roles')::integer>0
    union all
    select 2,'staff-contracts','warning',
      'Staff contracts expiring',
      (v_staff->>'expiring_contracts')||' contracts end within 30 game days.',
      '/dashboard/staff'
    where (v_staff->>'expiring_contracts')::integer>0
    union all
    select 2,'riders-unavailable','warning',
      'Riders unavailable for selection',
      (v_staff->>'injured_or_unavailable')||' riders are not currently fit.',
      '/dashboard/training'
    where (v_staff->>'injured_or_unavailable')::integer>0
    union all
    select 2,'fatigue-watch','warning',
      'Rider fatigue levels elevated',
      (v_staff->>'fatigue_watch')||' riders have fatigue of 70 or higher.',
      '/dashboard/training'
    where (v_staff->>'fatigue_watch')::integer>0
    union all
    select 2,'sponsor-risk','warning',
      'Sponsor objectives need attention',
      'Review sponsor objectives approaching their deadlines.',
      '/dashboard/premium-center?tab=sponsors'
    where exists(select 1 from jsonb_array_elements(coalesce(v_base->'sponsor_intelligence','[]'::jsonb)) objective
      where objective->>'risk_band' in ('high','failed'))
    union all
    select 2,'supply-shortages','warning',
      'Race supplies are running low',
      (v_infra->>'supply_shortages')||' supply types have fewer than five units.',
      '/dashboard/equipment'
    where (v_infra->>'supply_shortages')::integer>0
    union all
    select 3,'scout-reports','info',
      'Scouting reports available',
      (v_scouting->>'unread_reports')||' scout reports are ready to review.',
      '/dashboard/scouting'
    where (v_scouting->>'unread_reports')::integer>0
    union all
    select 3,'equipment-condition','warning',
      'Equipment condition requires attention',
      (v_infra->>'equipment_under_50_condition')||' equipment items are below 50% condition.',
      '/dashboard/equipment'
    where (v_infra->>'equipment_under_50_condition')::integer>0
  ) issue;

  return v_base || jsonb_build_object(
    'youth_command',v_youth,
    'national_command',v_national,
    'scouting_command',v_scouting,
    'staff_command',v_staff,
    'infrastructure_command',v_infra,
    'attention_queue',v_attention
  );
end;
$function$
;

REVOKE ALL ON FUNCTION public.premium_get_command_center_v2(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.premium_get_command_center_v2(uuid) TO authenticated, service_role;
