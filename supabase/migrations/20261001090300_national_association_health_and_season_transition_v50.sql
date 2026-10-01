-- National Association / World Nations operational health and season migration coverage.

create table if not exists public.nations_team_standing_history (
  id uuid primary key default gen_random_uuid(),
  snapshot_season integer not null check (snapshot_season>=1),
  association_id uuid not null references public.national_associations(id) on delete cascade,
  standing_rank integer not null check (standing_rank>=1),
  season_points bigint not null default 0,
  qualification_points bigint not null default 0,
  world_final_points bigint not null default 0,
  all_time_points bigint not null default 0,
  transition_run_id uuid,
  snapshot_at timestamptz not null default now(),
  unique(snapshot_season,association_id)
);
alter table public.nations_team_standing_history enable row level security;
revoke all on public.nations_team_standing_history from anon,authenticated;

CREATE OR REPLACE FUNCTION public.run_national_association_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_snapshots integer:=0;
  v_terms_closed integer:=0;
  v_elections_cancelled integer:=0;
  v_squads_closed integer:=0;
  v_cycles_cancelled integer:=0;
  v_callups_expired integer:=0;
  v_host_applications integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'National Association transition requires target season = source season + 1.';
  end if;

  insert into public.nations_team_standing_history(
    snapshot_season,association_id,standing_rank,season_points,
    qualification_points,world_final_points,all_time_points,transition_run_id
  )
  select p_source_season,s.association_id,s.standing_rank::integer,s.season_points,
         s.qualification_points,s.world_final_points,s.all_time_points,p_transition_run_id
  from public.get_nations_team_standings_v1(p_source_season) s
  on conflict(snapshot_season,association_id) do update
  set standing_rank=excluded.standing_rank,
      season_points=excluded.season_points,
      qualification_points=excluded.qualification_points,
      world_final_points=excluded.world_final_points,
      all_time_points=excluded.all_time_points,
      transition_run_id=excluded.transition_run_id,
      snapshot_at=now();
  get diagnostics v_snapshots=row_count;

  update public.national_coach_terms
  set status='completed',
      term_end_game_date=greatest(term_start_game_date,public.game_date_from_parts(p_source_season,12,31)),
      updated_at=now()
  where season_number=p_source_season and status='active';
  get diagnostics v_terms_closed=row_count;

  update public.national_coach_elections
  set status='cancelled',updated_at=now()
  where season_number=p_source_season
    and status in ('candidate_registration','voting','runoff');
  get diagnostics v_elections_cancelled=row_count;

  update public.national_team_squads
  set status='completed',updated_at=now()
  where season_number=p_source_season and status in ('confirmed','on_duty');
  get diagnostics v_squads_closed=row_count;

  update public.national_team_selection_cycles
  set status='cancelled',updated_at=now()
  where season_number=p_source_season
    and status in ('draft','awaiting_responses','needs_replacement','ready_to_confirm');
  get diagnostics v_cycles_cancelled=row_count;

  update public.national_team_callups
  set status='expired',responded_on_game_date=coalesce(responded_on_game_date,public.game_date_from_parts(p_source_season,12,31)),
      updated_at=now()
  where season_number=p_source_season and status='pending';
  get diagnostics v_callups_expired=row_count;

  select count(*)::integer into v_host_applications
  from public.nations_future_host_applications
  where target_season_number=p_target_season and status in ('submitted','approved','selected');

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'standing_snapshots',v_snapshots,
    'standings_persisted',true,
    'coach_terms_closed',v_terms_closed,
    'open_elections_cancelled',v_elections_cancelled,
    'squads_closed',v_squads_closed,
    'selection_cycles_cancelled',v_cycles_cancelled,
    'pending_callups_expired',v_callups_expired,
    'next_season_host_applications_preserved',v_host_applications,
    'next_season_structure_generation_date',public.game_date_from_parts(p_target_season,1,10),
    'note','Persistent standings remain intact; transient National Team state restarts for the new season.'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.season_transition_engine_execute_v2(p_transition_run_id uuid, p_source_season integer, p_target_season integer, p_mode text DEFAULT 'live'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_calendar jsonb;
  v_retirements jsonb;
  v_snapshot_rows integer;
  v_snapshot_check jsonb;
  v_history jsonb;
  v_competition jsonb;
  v_rider_contracts jsonb;
  v_staff_contracts jsonb;
  v_contract_negotiations jsonb;
  v_ai jsonb;
  v_sponsors jsonb;
  v_developing jsonb;
  v_rewards_preflight jsonb;
  v_national_associations jsonb;
  v_fresh jsonb;
  v_report jsonb;
begin
  if p_target_season is distinct from p_source_season + 1 then
    raise exception 'Season transition requires target = source + 1';
  end if;

  if p_mode not in ('live','lab','recovery') then
    raise exception 'Unsupported season transition mode: %', p_mode;
  end if;

  if not exists (
    select 1
    from public.season_transition_runs_v1 r
    where r.id = p_transition_run_id
      and r.source_season = p_source_season
      and r.target_season = p_target_season
      and r.status = 'running'
  ) then
    raise exception 'Running transition record not found or does not match source/target';
  end if;

  if exists (
    select 1
    from public.season_transition_component_readiness_v1
    where required = true
      and status <> 'ready'
  ) then
    raise exception 'Season transition readiness gate is not fully green';
  end if;

  perform set_config('app.season_transition_active','0',true);
  perform set_config('app.season_transition_coin_reason','',true);

  begin
    if not exists (
      select 1 from public.races r
      where extract(year from r.start_date)::integer = 1999 + p_target_season
        and r.metadata->>'calendar_source_season' = p_source_season::text
    ) then
      perform public.prepare_next_season_race_calendar_v1(p_source_season,p_target_season,true);
    end if;

    v_calendar := public.run_race_calendar_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    perform set_config('app.season_transition_active','1',true);

    v_snapshot_rows := public.snapshot_team_rankings_for_season_v1(p_source_season);
    v_snapshot_check := public.verify_season_transition_source_snapshot_v1(p_source_season);

    update public.season_transition_runs_v1
    set snapshot_rows = v_snapshot_rows,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'engine_version',2,
          'engine_mode',p_mode,
          'source_snapshot_reconciliation',v_snapshot_check
        )
    where id = p_transition_run_id;

    v_history := public.run_rankings_history_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_retirements := public.run_retirement_season_transition_v1(
      p_source_season,p_target_season
    );

    v_competition := public.run_competition_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_national_associations := public.run_national_association_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

        v_rider_contracts := public.process_rider_contract_season_expiry_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_staff_contracts := public.process_staff_contract_season_expiry_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_contract_negotiations := public.cleanup_stale_contract_negotiations_for_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_ai := public.run_ai_roster_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_sponsors := public.process_sponsors_for_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_developing := public.run_developing_team_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_rewards_preflight := public.run_finances_rewards_season_transition_v1(
      p_transition_run_id,p_source_season,p_target_season
    );

    v_fresh := public.verify_new_season_fresh_state_v1(
      p_source_season,p_target_season
    );

    v_report := jsonb_build_object(
      'ok',true,
      'engine_version',2,
      'mode',p_mode,
      'source_season',p_source_season,
      'target_season',p_target_season,
      'calendar',v_calendar,
      'canonical_snapshot_rows',v_snapshot_rows,
      'source_snapshot_reconciliation',v_snapshot_check,
      'rankings_history',v_history,
      'retirements',v_retirements,
      'competition',v_competition,
      'national_associations_world_nations',v_national_associations,
      'rider_contracts',v_rider_contracts,
      'staff_contracts',v_staff_contracts,
      'contract_negotiations',v_contract_negotiations,
      'ai_rosters',v_ai,
      'sponsors',v_sponsors,
      'developing_team',v_developing,
      'rewards_preflight',v_rewards_preflight,
      'new_season_fresh_state',v_fresh
    );

    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    return v_report;
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    perform set_config('app.season_transition_active','0',true);
    raise;
  end;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.check_national_association_integrity_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date:=public.get_current_game_date_date();
  v_season integer;
  v_ineligible_coaches integer:=0;
  v_missing_coach_elections integer:=0;
  v_stale_elections integer:=0;
  v_member_status_issues integer:=0;
  v_equipment_issues integer:=0;
  v_ranking_issues integer:=0;
  v_host_issues integer:=0;
  v_total integer:=0;
  v_details jsonb;
begin
  select season_number into v_season from public.game_state where id=true;

  select count(*)::integer into v_ineligible_coaches
  from public.national_coach_terms t
  where t.season_number=v_season and t.status='active'
    and not private.national_association_member_is_eligible_v1(t.association_id,t.user_id);

  select count(*)::integer into v_missing_coach_elections
  from public.national_associations a
  where a.status='active'
    and private.national_association_active_member_count_v1(a.id)>=(
      select minimum_active_members from public.national_association_config where id=true
    )
    and not exists(select 1 from public.national_coach_terms t
      where t.association_id=a.id and t.season_number=v_season and t.status='active'
        and private.national_association_member_is_eligible_v1(t.association_id,t.user_id))
    and not exists(select 1 from public.national_coach_elections e
      where e.association_id=a.id and e.season_number=v_season
        and e.status in ('candidate_registration','voting','runoff'));

  select count(*)::integer into v_stale_elections
  from public.national_coach_elections e
  where e.season_number=v_season
    and (
      (e.status='candidate_registration' and v_today>e.registration_close_date+1)
      or (e.status in ('voting','runoff') and e.current_round_close_date is not null
          and v_today>e.current_round_close_date+1)
    );

  select count(*)::integer into v_member_status_issues
  from public.national_association_memberships m
  join public.clubs c on c.id=m.club_id
  where m.status='active'
    and (
      c.deleted_at is not null or coalesce(c.is_ai,false)=true
      or c.club_type<>'main' or c.owner_user_id<>m.user_id
      or upper(c.country_code)<>(select upper(a.country_code) from public.national_associations a where a.id=m.association_id)
    );

  v_equipment_issues:=
    case when (select count(*) from public.national_team_standard_assets)=0 then 1 else 0 end
    +case when (select count(*) from public.national_team_standard_equipment)=0 then 1 else 0 end
    +case when (select count(*) from public.national_team_equipment_options)=0 then 1 else 0 end;

  select count(*)::integer into v_ranking_issues
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  where ed.season_number=v_season and g.status='completed'
    and exists(select 1 from public.nations_group_entries nge where nge.group_id=g.id and nge.final_group_rank is not null)
    and exists(
      select 1 from public.nations_group_entries nge
      join public.nations_competition_entries ce on ce.id=nge.competition_entry_id
      where nge.group_id=g.id and nge.status<>'withdrawn' and nge.final_group_rank is not null
        and not exists(select 1 from public.nations_team_ranking_points rp
          where rp.group_id=g.id and rp.association_id=ce.association_id)
    );

  select count(*)::integer into v_host_issues
  from public.nations_competition_groups g
  join public.nations_competition_rounds r on r.id=g.round_id
  join public.nations_competition_editions ed on ed.id=r.edition_id
  where ed.season_number=v_season
    and r.starts_on_game_date is not null
    and g.host_country_code is null;

  v_total:=v_ineligible_coaches+v_missing_coach_elections+v_stale_elections+
    v_member_status_issues+v_equipment_issues+v_ranking_issues+v_host_issues;

  v_details:=jsonb_build_object(
    'season_number',v_season,'game_date',v_today,
    'ineligible_active_coaches',v_ineligible_coaches,
    'associations_missing_coach_and_election',v_missing_coach_elections,
    'stale_elections',v_stale_elections,
    'invalid_active_memberships',v_member_status_issues,
    'standard_equipment_configuration_issues',v_equipment_issues,
    'completed_groups_missing_standing_points',v_ranking_issues,
    'scheduled_groups_missing_host',v_host_issues
  );

  perform public.log_system_business_check_v1(
    'check:national_association_integrity',
    case when v_total>0 then 'error' else 'success' end,
    case when v_total>0
      then format('%s National Association integrity issue(s) detected.',v_total)
      else 'National Association memberships, coach elections, equipment, hosts and standings are healthy.' end,
    v_details
  );

  if v_total>0 then
    perform public.raise_system_incident_v1(
      'check:national_association_integrity','high',
      'National Association operations require attention',
      format('%s National Association integrity issue(s) require attention.',v_total),
      'business:national-association-integrity',v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:national-association-integrity',
      'National Association integrity checks are healthy.'
    );
  end if;

  return jsonb_build_object('status',case when v_total>0 then 'error' else 'success' end,
    'issues',v_total,'summary',case when v_total>0 then 'National Association operations require attention.'
    else 'National Association operations are healthy.' end,'details',v_details);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.championship_operations_health_check_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron', 'pg_temp'
AS $function$
declare
  v_game_day date:=public.get_current_game_date_date();
  v_game_ts timestamp:=public.get_current_game_timestamp();
  v_race_refresh jsonb;
  v_all_race_problems integer:=0;
  v_championship_race_problems integer:=0;
  v_world_structure_issues integer:=0;
  v_national_runtime_issues integer:=0;
  v_link_issues integer:=0;
  v_unmonitored_stages integer:=0;
  v_total integer:=0;
  v_details jsonb;
begin
  begin
    v_race_refresh:=public.race_operations_refresh_v1();
  exception when others then
    v_race_refresh:=jsonb_build_object(
      'status','error',
      'message',sqlerrm,
      'sqlstate',sqlstate
    );
  end;

  select count(*)::integer
  into v_all_race_problems
  from public.race_operations_stage_status_v1
  where has_problem;

  perform public.log_system_business_check_v1(
    'check:race_operations',
    case when v_all_race_problems>0 then 'error' else 'success' end,
    case
      when v_all_race_problems>0
        then format('%s active Race Operations problem(s) require attention.',v_all_race_problems)
      else 'Race calculation, replay and completion monitoring is healthy.'
    end,
    jsonb_build_object(
      'active_problem_count',v_all_race_problems,
      'race_operations_refresh',v_race_refresh
    )
  );

  if v_all_race_problems>0 then
    perform public.raise_system_incident_v1(
      'check:race_operations',
      'critical',
      'Race Operations require attention',
      format('%s race stage(s) currently have calculation, replay or completion problems.',v_all_race_problems),
      'business:race-operations',
      jsonb_build_object('active_problem_count',v_all_race_problems)
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:race-operations',
      'Race Operations currently reports no active stage problems.'
    );
  end if;

  select count(*)::integer
  into v_championship_race_problems
  from public.race_operations_stage_status_v1
  where race_category in ('NCQ','NC','WRC','WNQ','WNF')
    and has_problem;

  select count(*)::integer
  into v_world_structure_issues
  from public.world_road_championship_editions w
  left join public.races r on r.id=w.race_id
  left join lateral (
    select s.*
    from public.race_stages s
    where s.race_id=w.race_id
    order by s.stage_number
    limit 1
  ) s on true
  where w.season_number=(select season_number from public.game_state where id=true limit 1)
    and (
      w.race_id is null
      or r.id is null
      or s.id is null
      or coalesce(w.climate_avg_temp_c,0) <= 24
      or lower(coalesce(s.terrain_type,''))='mountain'
      or coalesce((r.metadata->>'world_road_championship')::boolean,false) is not true
    );

  if exists (
    select 1
    from public.national_championship_editions e
    where e.season_number=(select season_number from public.game_state where id=true limit 1)
  ) and not exists (
    select 1
    from public.world_road_championship_editions w
    where w.season_number=(select season_number from public.game_state where id=true limit 1)
  ) then
    v_world_structure_issues:=v_world_structure_issues+1;
  end if;

  select count(*)::integer
  into v_national_runtime_issues
  from public.national_championship_editions e
  where e.season_number=(select season_number from public.game_state where id=true limit 1)
    and (
      (
        e.status='planned'
        and e.climate_status='ready'
        and e.route_status='ready'
        and e.ranking_snapshot_date < v_game_day
      )
      or
      (
        e.status<>'planned'
        and e.climate_status='ready'
        and e.route_status='ready'
        and (
          e.final_race_id is null
          or exists (
            select 1
            from public.national_championship_heats h
            where h.edition_id=e.id
              and h.race_id is null
          )
        )
      )
    );

  select count(*)::integer
  into v_link_issues
  from public.national_championship_editions e
  where e.season_number=(select season_number from public.game_state where id=true limit 1)
    and e.status='completed'
    and e.champion_rider_id is not null
    and (
      not exists (
        select 1
        from public.rider_championship_honours h
        where h.source_edition_id=e.id
          and h.honor_type='national_road'
          and h.rank=1
          and h.rider_id=e.champion_rider_id
      )
      or not exists (
        select 1
        from public.world_road_championship_entries we
        where we.source_national_edition_id=e.id
          and we.rider_id=e.champion_rider_id
          and we.country_code=e.country_code
      )
    );

  select count(*)::integer
  into v_unmonitored_stages
  from public.race_stages s
  join public.races r on r.id=s.race_id
  where r.category in ('NCQ','NC','WRC','WNQ','WNF')
    and public.race_stage_planned_start_game_at_v1(s.id)::timestamp
          <= v_game_ts - interval '30 minutes'
    and s.stage_date >= v_game_day - 7
    and not exists (
      select 1
      from public.race_operations_stage_status_v1 ops
      where ops.stage_id=s.id
    );

  v_total:=
    v_championship_race_problems
    +v_world_structure_issues
    +v_national_runtime_issues
    +v_link_issues
    +v_unmonitored_stages;

  v_details:=jsonb_build_object(
    'active_championship_race_operation_problems',v_championship_race_problems,
    'world_structure_issues',v_world_structure_issues,
    'national_runtime_issues',v_national_runtime_issues,
    'champion_honour_or_world_invitation_link_issues',v_link_issues,
    'championship_stages_missing_race_operations_monitoring',v_unmonitored_stages,
    'race_operations_refresh',v_race_refresh
  );

  perform public.log_system_business_check_v1(
    'check:championship_operations',
    case when v_total>0 then 'error' else 'success' end,
    case
      when v_total>0
        then format('%s National/World Championship operations issue(s) detected.',v_total)
      else 'National Championship, World Championship and World Nations race monitoring is healthy.'
    end,
    v_details
  );

  if v_total>0 then
    perform public.raise_system_incident_v1(
      'check:championship_operations',
      'critical',
      'Championship operations require attention',
      format(
        '%s National/World Championship issue(s) were detected across scheduling, calculation/replay/completion, honours or World qualification.',
        v_total
      ),
      'business:championship-operations',
      v_details
    );
  else
    perform public.resolve_system_incident_by_dedupe_v1(
      'business:championship-operations',
      'National and World Championship operations are healthy.'
    );
  end if;

  return jsonb_build_object(
    'status',case when v_total>0 then 'attention_required' else 'healthy' end,
    'issue_count',v_total,
    'details',v_details
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.process_national_association_nations_runtime_v4()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_core jsonb; v_races jsonb; v_health jsonb; v_integrity jsonb; v_vacancies jsonb;
begin
  perform public.process_user_team_inactivity_v1(false);
  v_vacancies:=public.process_national_coach_vacancies_v1();
  v_core:=public.process_national_association_nations_runtime_v1();
  v_races:=public.process_nations_race_runtime_v2();
  v_health:=public.check_nations_operations_health_v1();
  v_integrity:=public.check_national_association_integrity_v1();
  return coalesce(v_core,'{}'::jsonb)||jsonb_build_object(
    'coach_vacancies',v_vacancies,'race_runtime',v_races,
    'operations_health',v_health,'association_integrity',v_integrity);
end;
$function$
;

insert into public.season_transition_component_readiness_v1(
  component_key,display_order,required,status,details,updated_at
)
values(
  'national_associations_world_nations',15,true,'ready',
  'National Association / World Nations rollover preserves cumulative National Team standings and future host applications; closes source-season coach/election/squad/call-up state; target-season qualification structure is planned for 10 January and seeded from the persistent standing.',
  now()
)
on conflict(component_key) do update
set display_order=excluded.display_order,required=true,status='ready',
    details=excluded.details,updated_at=now();

insert into public.system_monitor_processes(
  process_key,label,category,description,source_kind,source_ref,user_sensitive,
  incident_severity,expected_interval_minutes,stale_after_minutes,email_alerts_enabled,is_enabled,sort_order
)
values(
  'check:national_association_integrity','National Association integrity','Championship Operations',
  'Checks Association membership, coach eligibility/elections, standard equipment, World Nations host assignment and persistent National Team standing awards.',
  'business_check','check_national_association_integrity_v1',true,'high',15,45,true,true,407
)
on conflict(process_key) do update
set label=excluded.label,category=excluded.category,description=excluded.description,
    source_kind=excluded.source_kind,source_ref=excluded.source_ref,user_sensitive=excluded.user_sensitive,
    incident_severity=excluded.incident_severity,expected_interval_minutes=excluded.expected_interval_minutes,
    stale_after_minutes=excluded.stale_after_minutes,email_alerts_enabled=true,is_enabled=true,
    sort_order=excluded.sort_order,updated_at=now();
