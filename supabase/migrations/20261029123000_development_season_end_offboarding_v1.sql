
-- Safe and repeatable audit trail: no history or youth rider records are deleted.
create table if not exists private.development_service_closure_audit_v1(
 service text not null check(service in('developing','youth')),
 club_id uuid not null,
 target_season integer not null,
 source_season integer not null,
 released_riders integer not null default 0,
 closed_at timestamptz not null default now(),
 primary key(service,club_id,target_season)
);
revoke all on private.development_service_closure_audit_v1 from public,anon,authenticated;
alter table public.youth_academies add column if not exists auto_renew boolean not null default true;

create or replace function public.set_my_youth_academy_auto_renew_v1(p_enabled boolean)
returns boolean language plpgsql security definer set search_path to 'public','auth','pg_temp'
as $fn$
declare v_user uuid:=auth.uid();v_count integer;
begin
 if v_user is null then raise exception 'Not authenticated'; end if;
 update public.youth_academies a set auto_renew=coalesce(p_enabled,false),updated_at=now()
 from public.clubs c where c.id=a.club_id and c.owner_user_id=v_user and a.is_ai=false and a.is_active;
 get diagnostics v_count=row_count;
 if v_count<>1 then raise exception 'No active owned Youth Academy found'; end if;
 return coalesce(p_enabled,false);
end; $fn$;
revoke all on function public.set_my_youth_academy_auto_renew_v1(boolean) from public,anon;
grant execute on function public.set_my_youth_academy_auto_renew_v1(boolean) to authenticated;

create or replace function private.close_unrenewed_developing_teams_v1(p_source_season integer,p_target_season integer)
returns jsonb language plpgsql security definer set search_path to 'public','private','pg_temp'
as $fn$
declare team record; r record; contract_rec record; v_released integer:=0;v_closed integer:=0;
 v_team_released integer;v_begin date:=make_date(1999+p_target_season,1,1);
begin
 if p_target_season<>p_source_season+1 or not exists(
   select 1 from public.season_transition_runs_v1
    where status='running' and source_season=p_source_season and target_season=p_target_season)
 then raise exception 'Developing closure only during an authorized season transition'; end if;
 for team in
   select a.main_club_id,a.developing_club_id,d.country_code
   from public.developing_team_season_access a
   join public.clubs d on d.id=a.developing_club_id
   where d.club_type='developing' and d.deleted_at is null and d.is_active
    and not (a.access_status='active' and a.active_season=p_target_season and a.expires_after_season>=p_target_season)
   order by a.developing_club_id for update of d
 loop
  v_team_released:=0;
  for r in select rd.id,rd.salary,rd.availability_status,rd.birth_date,rd.overall,rd.potential
    from public.club_riders cr join public.riders rd on rd.id=cr.rider_id
    where cr.club_id=team.developing_club_id order by rd.id for update of rd
  loop
   for contract_rec in select rc.id from public.rider_contracts rc
     where rc.rider_id=r.id and rc.status='active' and rc.club_id in(team.main_club_id,team.developing_club_id)
     for update
   loop
    update public.rider_contracts set status='terminated',
      notes_json=coalesce(notes_json,'{}'::jsonb)||jsonb_build_object(
       'terminated_reason','developing_team_not_renewed',
       'source_season',p_source_season,'target_season',p_target_season),
      updated_at=now() where id=contract_rec.id;
    update public.rider_payroll_state ps set
      payroll_status=case when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)>0
        then 'released_unpaid'::public.rider_payroll_status else 'settled'::public.rider_payroll_status end,
      settled_at=case when coalesce(ps.outstanding_salary_debt,0)+coalesce(ps.outstanding_breach_fine,0)=0 then now() else ps.settled_at end,
      updated_at=now() where ps.contract_id=contract_rec.id;
   end loop;
   delete from public.club_riders where club_id=team.developing_club_id and rider_id=r.id;
   if r.availability_status<>'retired' and not exists(select 1 from public.club_riders where rider_id=r.id)
     and not exists(select 1 from public.rider_contracts where rider_id=r.id and status='active') then
    insert into public.rider_free_agents(rider_id,source_type,source_club_id,desired_tier,
      expected_salary_weekly,min_acceptable_salary_weekly,preferred_duration_seasons,
      available_from_game_date,expires_on_game_date,status)
    values(r.id,'released',team.developing_club_id,'continental',
     greatest(coalesce(r.salary,0),250),greatest((greatest(coalesce(r.salary,0),250)*0.9)::integer,100),
     1,v_begin,v_begin+30,'available')
    on conflict on constraint rider_free_agents_rider_id_key do update set
      source_type='released',source_club_id=excluded.source_club_id,
      desired_tier='continental',expected_salary_weekly=excluded.expected_salary_weekly,
      min_acceptable_salary_weekly=excluded.min_acceptable_salary_weekly,
      preferred_duration_seasons=excluded.preferred_duration_seasons,
      available_from_game_date=excluded.available_from_game_date,
      expires_on_game_date=excluded.expires_on_game_date,status='available',updated_at=now();
    delete from public.rider_free_agent_negotiations n
      using public.rider_free_agents f
      where n.free_agent_id=f.id and f.rider_id=r.id;
    update public.rider_transfer_listings set status='expired' where rider_id=r.id and status in ('listed','club_accepted');
    update public.rider_transfer_offers set status='expired' where rider_id=r.id and status in ('open','club_accepted');
    update public.rider_transfer_negotiations set status='expired' where rider_id=r.id and status in ('open','accepted');
    v_released:=v_released+1;v_team_released:=v_team_released+1;
   end if;
   perform public.sync_rider_contract_snapshot(r.id);
  end loop;
  update public.clubs set is_active=false,updated_at=now()
    where id=team.developing_club_id;
  insert into private.development_service_closure_audit_v1(service,club_id,target_season,source_season,released_riders)
    values('developing',team.developing_club_id,p_target_season,p_source_season,v_team_released)
    on conflict(service,club_id,target_season) do nothing;
  v_closed:=v_closed+1;
 end loop;
 return jsonb_build_object('closed',v_closed,'riders_released',v_released);
end; $fn$;

create or replace function private.transition_player_youth_academies_v1(p_source_season integer,p_target_season integer)
returns jsonb language plpgsql security definer set search_path to 'public','private','pg_temp'
as $fn$
declare a record;v_balance integer;v_renewed integer:=0;v_closed integer:=0;v_youth integer;v_source_end date:=public.get_game_date_for_season_end(p_source_season);
begin
 if p_target_season<>p_source_season+1 or not exists(
   select 1 from public.season_transition_runs_v1 where status='running'
    and source_season=p_source_season and target_season=p_target_season)
 then raise exception 'Academy closure only during an authorized season transition'; end if;
 for a in select ac.id,ac.club_id,ac.auto_renew,ac.renewed_through_season,c.owner_user_id
   from public.youth_academies ac join public.clubs c on c.id=ac.club_id
   where ac.is_ai=false and ac.is_active and c.deleted_at is null
   order by ac.id for update of ac
 loop
   if coalesce(a.renewed_through_season,0)>=p_target_season
     and public.user_has_paid_premium_access_v1(a.owner_user_id) then
       v_renewed:=v_renewed+1;continue;
   end if;
   if a.auto_renew and public.user_has_paid_premium_access_v1(a.owner_user_id) then
     select coalesce(balance,0) into v_balance from public.user_wallets where user_id=a.owner_user_id for update;
     if coalesce(v_balance,0)>=public.youth_academy_renewal_coin_cost_v1() then
       perform public.debit_user_coins_idempotent_v1(a.owner_user_id,
          public.youth_academy_renewal_coin_cost_v1(),'youth_academy_season_renewal',
          'youth_academy_renewal:'||a.id||':season:'||p_target_season,
          jsonb_build_object('category','youth_academy','academy_id',a.id,'club_id',a.club_id,
          'season_number',p_target_season,'coin_cost',public.youth_academy_renewal_coin_cost_v1()));
       update public.youth_academies set renewed_through_season=p_target_season,updated_at=now() where id=a.id;
       v_renewed:=v_renewed+1;continue;
     end if;
   end if;
   select count(*) into v_youth from public.youth_riders
     where academy_id=a.id and status in('academy','graduating');
   update public.youth_rider_agreements set status='expired',
     ends_on=v_source_end,updated_at=now() where academy_id=a.id and status='active';
   update public.youth_riders set status='released',updated_at=now()
     where academy_id=a.id and status in('academy','graduating');
   update public.youth_academies set is_active=false,updated_at=now() where id=a.id;
   update public.club_staff set is_active=false,contract_expires_at=v_source_end,updated_at=now()
    where club_id=a.club_id and role_type in('youth_academy_director','u16_head_coach','youth_scout')
      and is_active;
   insert into private.development_service_closure_audit_v1(service,club_id,target_season,source_season,released_riders)
     values('youth',a.club_id,p_target_season,p_source_season,v_youth)
     on conflict(service,club_id,target_season) do nothing;
   v_closed:=v_closed+1;
 end loop;
 return jsonb_build_object('renewed',v_renewed,'closed',v_closed);
end; $fn$;

CREATE OR REPLACE FUNCTION public.run_developing_team_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_renewal jsonb; v_age jsonb; v_window_notifications integer:=0; v_bad_active integer:=0;
  v_closure jsonb;
  v_negative_wallets integer:=0; v_duplicate_ledgers integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then raise exception 'target season must equal source season + 1'; end if;
  if not exists(select 1 from public.season_transition_runs_v1 r where r.id=p_transition_run_id and r.status='running' and r.source_season=p_source_season and r.target_season=p_target_season) then
    raise exception 'matching running transition not found';
  end if;

  begin
    perform set_config('app.season_transition_coin_reason','developing_team_season_renewal',true);
    v_renewal:=public.process_developing_team_season_renewals_v1(p_target_season);
    perform set_config('app.season_transition_coin_reason','',true);
  exception when others then
    perform set_config('app.season_transition_coin_reason','',true);
    raise;
  end;

  v_closure:=private.close_unrenewed_developing_teams_v1(p_source_season,p_target_season);
  v_window_notifications:=public.notify_developing_team_window_open();
  v_age:=public.process_developing_team_age_limits_v1(make_date(1999+p_target_season,1,1));

  select count(*) into v_bad_active
  from public.developing_team_season_access a join public.clubs m on m.id=a.main_club_id left join public.clubs d on d.id=a.developing_club_id
  where a.access_status='active' and a.active_season=p_target_season
    and (m.deleted_at is not null or m.owner_user_id is null or d.id is null or d.deleted_at is not null or a.expires_after_season<p_target_season);
  select count(*) into v_negative_wallets from public.user_wallets where balance<0;
  select count(*) into v_duplicate_ledgers from (
    select l.user_id,l.payload_json->>'system_key' k,count(*) c
    from public.user_coin_ledger l
    where l.payload_json->>'system_key' like 'developing_team_renewal:%:season:'||p_target_season::text
    group by l.user_id,l.payload_json->>'system_key' having count(*)>1
  ) q;

  if v_bad_active>0 or v_negative_wallets>0 or v_duplicate_ledgers>0 then
    raise exception 'Developing Team transition invariant failed: bad_active %, negative_wallets %, duplicate_renewal_ledgers %',v_bad_active,v_negative_wallets,v_duplicate_ledgers;
  end if;

  return jsonb_build_object('ok',true,'source_season',p_source_season,'target_season',p_target_season,'renewal',v_renewal,'service_closure',v_closure,
    'movement_window_notifications_attempted',v_window_notifications,'age_limit_processing',v_age,'bad_active_rows',v_bad_active,
    'negative_wallets',v_negative_wallets,'duplicate_renewal_ledgers',v_duplicate_ledgers);
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_youth_academy_season_transition_v1(p_transition_run_id uuid, p_source_season integer, p_target_season integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
declare
  standings_snapshot jsonb;
  service_result jsonb;
  seed_result jsonb;
  hierarchy_result jsonb;
  new_budgets integer:=0;
  agreements_extended integer:=0;
  calendar_seed_result jsonb;
  weather_calendar_result jsonb;
  runtime_result jsonb;
  youth_growth_count integer:=0;
  movement_rows integer:=0;
  target_prize_rows integer:=0;
  target_result_rows integer:=0;
begin
  if p_target_season is distinct from p_source_season+1 then
    raise exception 'Youth Academy transition requires target = source + 1';
  end if;

  if not exists(
    select 1 from public.season_transition_runs_v1 r
    where r.id=p_transition_run_id
      and r.source_season=p_source_season
      and r.target_season=p_target_season
      and r.status='running'
  ) then
    raise exception 'Youth Academy transition requires a matching running transition';
  end if;

  select count(*) into target_prize_rows
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into target_result_rows
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  if target_prize_rows<>0 or target_result_rows<>0 then
    raise exception
      'Youth target season is not fresh before rollover (prize rows %, result rows %)',
      target_prize_rows,target_result_rows;
  end if;

  -- Freeze final source-season standings before any membership movement.
  standings_snapshot:=private.snapshot_youth_team_standings_v1(
    p_transition_run_id,p_source_season
  );

  service_result:=private.transition_player_youth_academies_v1(p_source_season,p_target_season);
  seed_result:=public.seed_ai_youth_academies_for_season_v1(p_target_season);

  hierarchy_result:=private.assign_youth_target_memberships_v3(
    p_source_season,p_target_season
  );

  movement_rows:=private.log_youth_transition_movements_v1(
    p_transition_run_id,p_source_season,p_target_season
  );

  -- Every new season starts with a fresh Youth budget ledger state.
  insert into public.youth_academy_season_budgets(
    academy_id,season_number,season_budget,spent_amount,committed_amount,
    scouting_range,scouting_budget,scouting_committed_amount,initial_allocation
  )
  select
    a.id,p_target_season,
    coalesce(b.season_budget,100000),
    0,
    coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_range,'local'),
    coalesce(b.scouting_budget,5000),
    coalesce(b.scouting_budget,5000),
    coalesce(b.season_budget,100000)
  from public.youth_academies a
  left join public.youth_academy_season_budgets b
    on b.academy_id=a.id and b.season_number=p_source_season
  where a.is_active
  on conflict(academy_id,season_number) do nothing;
  get diagnostics new_budgets=row_count;

  update public.youth_rider_agreements a
  set
    ends_on=public.get_game_date_for_season_end(p_target_season),
    updated_at=now()
  from public.youth_riders r
  where r.id=a.youth_rider_id
    and r.status='academy'
    and a.status='active'
    and (
      a.ends_on is null
      or a.ends_on<=public.get_game_date_for_season_end(p_source_season)
    );
  get diagnostics agreements_extended=row_count;

  youth_growth_count:=private.advance_youth_physiques_for_season_v1(p_target_season);

  -- Source-season scouting decisions do not leak into a new season.
  update public.youth_scouting_reports
  set status='expired',
      expires_on=least(expires_on,public.get_game_date_for_season_end(p_source_season)),
      updated_at=now()
  where status in ('new','shortlisted','approached')
    and discovered_on<=public.get_game_date_for_season_end(p_source_season);

  calendar_seed_result:=public.seed_youth_race_calendar_for_season_v1(
    p_target_season
  );

  weather_calendar_result:=private.apply_youth_weather_calendar_v8(
    p_target_season,
    public.game_date_from_parts(p_target_season,1,1)-1
  );

  runtime_result:=public.ensure_youth_race_runtime_for_season_v1(
    p_target_season
  );

  select count(*) into target_prize_rows
  from public.youth_race_team_prizes p
  join public.youth_races r on r.id=p.race_id
  where r.season_number=p_target_season;

  select count(*) into target_result_rows
  from public.youth_race_results rr
  join public.youth_races r on r.id=rr.race_id
  where r.season_number=p_target_season;

  if target_prize_rows<>0 or target_result_rows<>0 then
    raise exception
      'Youth target-season points/results were not reset (prizes %, results %)',
      target_prize_rows,target_result_rows;
  end if;

  return jsonb_build_object(
    'ok',true,
    'source_season',p_source_season,
    'target_season',p_target_season,
    'final_standings_snapshot',standings_snapshot,
    'player_academy_services',service_result,
    'points_reset',true,
    'target_team_point_rows',target_prize_rows,
    'target_result_rows',target_result_rows,
    'movement_audit_rows',movement_rows,
    'new_season_budgets',new_budgets,
    'agreements_extended',agreements_extended,
    'youth_growth_count',youth_growth_count,
    'ai_seed',seed_result,
    'hierarchy',hierarchy_result,
    'calendar_seed',calendar_seed_result,
    'weather_calendar',weather_calendar_result,
    'race_runtime',runtime_result
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_base_v23()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
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
  v_game_date date:=public.get_current_game_date_date();
  v_real_days integer:=0;
  v_game_days integer:=0;
  v_real_required integer:=30;
  v_game_required integer:=60;
  v_time_met boolean:=false;
  v_activation_cost integer:=50;
  v_coin_balance integer:=0;
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

  v_premium:=public.user_has_paid_premium_access_v1(v_user);

  select
    coalesce(cfg.activation_coin_cost,50),
    coalesce(cfg.real_days_required,30),
    coalesce(cfg.game_days_required,60)
  into v_activation_cost,v_real_required,v_game_required
  from public.youth_academy_service_config cfg
  where cfg.config_key='default';

  v_activation_cost:=coalesce(v_activation_cost,50);
  v_real_required:=0;
  v_game_required:=90;

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;
  v_time_met:=v_game_days>=90;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  select * into v_academy
  from public.youth_academies a
  where a.club_id=v_club.id limit 1;

  if v_academy.id is null then
    return jsonb_build_object(
      'premium',v_premium,
      'activated',false,
      'club_id',v_club.id,
      'club_name',v_club.name,
      'country_code',v_club.country_code,
      'capacity',16,
      'starter_riders',6,
      'default_season_budget',100000,
      'default_scouting_range','local',
      'default_scouting_cost',5000,
      'activation_coin_cost',v_activation_cost,
      'renewal_coin_cost',0,
      'coin_balance',v_coin_balance,
      'real_days_played',v_real_days,
      'game_days_played',v_game_days,
      'unlock_real_days_required',v_real_required,
      'unlock_game_days_required',v_game_required,
      'time_requirement_met',v_time_met,
      'can_activate',v_premium and v_time_met and v_coin_balance>=v_activation_cost
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
    'contract_expires_at',cs.contract_expires_at,
    'available',private.youth_staff_available_v1(cs.id),
    'active_course',(select jsonb_build_object('id',sc.id,'title',sc.course_title,'returns_on',sc.completes_on_game_date)
      from public.staff_courses sc
      where sc.staff_id=cs.id and sc.status='active'
      order by sc.created_at desc limit 1)
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
    'premium',v_premium,
    'activated',true,
    'read_only',not v_premium or not v_academy.is_active,
    'academy_closed',not v_academy.is_active,
    'auto_renew',v_academy.auto_renew,
    'club_id',v_club.id,
    'club_name',v_club.name,
    'country_code',v_club.country_code,
    'capacity',16,
    'starter_riders',6,
    'default_season_budget',100000,
    'default_scouting_range','local',
    'default_scouting_cost',5000,
    'activation_coin_cost',v_activation_cost,
    'renewal_coin_cost',0,
    'coin_balance',v_coin_balance,
    'real_days_played',v_real_days,
    'game_days_played',v_game_days,
    'unlock_real_days_required',v_real_required,
    'unlock_game_days_required',v_game_required,
    'time_requirement_met',v_time_met,
    'can_activate',false,
    'academy',jsonb_build_object(
      'id',v_academy.id,'capacity',16,
      'active_riders',jsonb_array_length(v_riders),
      'reputation',v_academy.reputation,
      'activated_season',v_academy.activated_season
    ),
    'budget',coalesce(v_budget,'{}'::jsonb),
    'settings',coalesce(v_settings,'{}'::jsonb),
    'effective_settings',(select to_jsonb(es) from private.youth_effective_settings_v1 es where es.academy_id=v_academy.id),
    'staff_decisions',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from (select * from public.youth_staff_decisions
            where academy_id=v_academy.id
            order by created_at desc limit 20) d),'[]'::jsonb),
    'training_camps',coalesce((select jsonb_agg(to_jsonb(tc) order by tc.starts_on desc)
      from public.youth_training_camps tc
      where tc.academy_id=v_academy.id),'[]'::jsonb),
    'riders',v_riders,
    'staff',v_staff,
    'scouting_programs',(
      select coalesce(jsonb_agg(to_jsonb(p) order by p.sort_order),'[]'::jsonb)
      from public.youth_academy_scouting_programs p where p.is_active=true
    )
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_youth_academy_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_payload jsonb;
  v_academy_id uuid;
  v_current_season integer := coalesce(public.get_current_season_number(), 1);
  v_renewed_through integer;
  v_renewal_cost integer := public.youth_academy_renewal_coin_cost_v1();
  v_balance integer := 0;
  v_premium boolean := false;
  v_season_access_active boolean := false;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  v_payload := public.get_my_youth_academy_base_v23();
  v_premium := coalesce((v_payload ->> 'premium')::boolean, false);
  v_balance := coalesce((v_payload ->> 'coin_balance')::integer, 0);

  if coalesce((v_payload ->> 'activated')::boolean, false) then
    v_academy_id := nullif(v_payload #>> '{academy,id}', '')::uuid;

    if v_academy_id is not null then
      select a.renewed_through_season
      into v_renewed_through
      from public.youth_academies a
      where a.id = v_academy_id;
    end if;

    v_renewed_through := coalesce(
      v_renewed_through,
      nullif(v_payload #>> '{academy,activated_season}', '')::integer,
      0
    );
    v_season_access_active := v_renewed_through >= v_current_season;

    return v_payload || jsonb_build_object(
      'renewal_coin_cost', v_renewal_cost,
      'current_season', v_current_season,
      'renewed_through_season', v_renewed_through,
      'season_access_active', v_season_access_active,
      'renewal_required', not v_season_access_active,
      'can_renew',
        v_premium
        and not v_season_access_active
        and v_balance >= v_renewal_cost,
      'read_only', (not v_premium) or (not v_season_access_active) or coalesce((v_payload->>'academy_closed')::boolean,false)
    );
  end if;

  return v_payload || jsonb_build_object(
    'renewal_coin_cost', v_renewal_cost,
    'current_season', v_current_season,
    'renewed_through_season', null,
    'season_access_active', false,
    'renewal_required', false,
    'can_renew', false
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.activate_my_youth_academy_v1(p_season_budget bigint DEFAULT 100000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_club public.clubs%rowtype;
  v_academy_id uuid;
  v_season integer:=coalesce(public.get_current_season_number(),1);
  v_i integer;
  v_created boolean:=false;
  v_allocation bigint:=greatest(coalesce(p_season_budget,100000),5000);
  v_game_date date:=public.get_current_game_date_date();
  v_real_days integer:=0;
  v_game_days integer:=0;
  v_real_required integer:=30;
  v_game_required integer:=60;
  v_activation_cost integer:=50;
  v_coin_balance integer:=0;
  v_coin_debited boolean:=false;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not public.user_has_paid_premium_access_v1(v_user) then
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

  -- Reactivate an archived Academy without erasing its history or riders.
  if v_academy_id is not null then
    if exists(select 1 from public.youth_academies where id=v_academy_id and is_active) then
      return public.get_my_youth_academy_v1();
    end if;
    select coalesce(w.balance,0) into v_coin_balance
      from public.user_wallets w where w.user_id=v_user for update;
    if coalesce(v_coin_balance,0)<public.youth_academy_renewal_coin_cost_v1() then
      raise exception 'Not enough coins to reactivate Youth Academy (50 required)';
    end if;
    perform public.debit_user_coins_idempotent_v1(v_user,public.youth_academy_renewal_coin_cost_v1(),
      'youth_academy_season_reactivation',
      'youth_academy_reactivation:'||v_academy_id||':season:'||v_season,
      jsonb_build_object('academy_id',v_academy_id,'season',v_season));
    update public.youth_academies set is_active=true,renewed_through_season=v_season,
      updated_at=now() where id=v_academy_id;
    if not exists(select 1 from public.youth_riders
      where academy_id=v_academy_id and status in('academy','graduating')) then
      for v_i in 1..6 loop
        perform private.create_youth_rider_v1(v_academy_id,v_club.country_code,true,false);
      end loop;
    end if;
    if not exists(select 1 from public.club_staff where club_id=v_club.id and is_active
      and role_type='youth_academy_director') then
      perform private.create_youth_academy_staff_v1(v_club.id,v_club.country_code,'youth_academy_director');
    end if;
    if not exists(select 1 from public.club_staff where club_id=v_club.id and is_active
      and role_type='u16_head_coach') then
      perform private.create_youth_academy_staff_v1(v_club.id,v_club.country_code,'u16_head_coach');
    end if;
    return public.get_my_youth_academy_v1();
  end if;

  select
    coalesce(cfg.activation_coin_cost,50),
    coalesce(cfg.real_days_required,30),
    coalesce(cfg.game_days_required,60)
  into v_activation_cost,v_real_required,v_game_required
  from public.youth_academy_service_config cfg
  where cfg.config_key='default';

  v_activation_cost:=coalesce(v_activation_cost,50);
  v_real_required:=0;
  v_game_required:=90;

  v_real_days:=greatest(0,current_date-v_club.created_at::date);
  if v_game_date is not null and v_club.created_game_date is not null then
    v_game_days:=greatest(0,v_game_date-v_club.created_game_date);
  end if;

  if v_game_days < 90 then
    raise exception
      'Youth Academy requires 90 game days from main club creation.';
  end if;

  select coalesce(w.balance,0)::integer into v_coin_balance
  from public.user_wallets w
  where w.user_id=v_user;
  v_coin_balance:=coalesce(v_coin_balance,0);

  if v_coin_balance < v_activation_cost then
    raise exception
      'Not enough coins. % coins are required; current balance is %.',
      v_activation_cost,
      v_coin_balance;
  end if;

  v_coin_debited:=public.debit_user_coins_idempotent_v1(
    v_user,
    v_activation_cost,
    'youth_academy_activation',
    'youth_academy_activation:'||v_club.id::text,
    jsonb_build_object(
      'category','youth_academy',
      'club_id',v_club.id,
      'coin_cost',v_activation_cost,
      'season_number',v_season,
      'one_time_activation',true
    )
  );

  if not v_coin_debited then
    raise exception 'Youth Academy activation has already been processed.';
  end if;

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
        'season_number',v_season,
        'activation_coin_cost',v_activation_cost
      ),
      'youth-academy-started:'||v_academy_id::text,
      null
    );
  end if;

  return public.get_my_youth_academy_v1();
end;
$function$;

CREATE OR REPLACE FUNCTION public.decide_my_youth_graduation_v1(p_youth_rider_id uuid, p_decision text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth', 'pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_record public.youth_graduation_records%rowtype;
  v_game_date date:=public.get_current_game_date_date();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if not (public.user_has_youth_academy_access_v1(v_user)
    or (extract(month from v_game_date) in(1,4,7,10)
        and extract(day from v_game_date) between 1 and 14
        and exists(select 1 from public.youth_academies a
          join public.clubs c on c.id=a.club_id
          where c.owner_user_id=v_user and a.is_active
          and coalesce(a.renewed_through_season,a.activated_season,0)>=public.get_current_season_number())))
  then
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
