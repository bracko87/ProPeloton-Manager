-- World Road Championship: team acceptance is unconditional on current fitness.
-- An AI rider is confirmed upon winning a national title, even if temporarily injured.
-- The only medical exclusion is a real, selection-blocking illness/injury when the
-- game reaches the Championship race date. Reduced fitness never excludes a rider.
-- For medically unavailable riders before race day, defer PHYSICAL roster rows until
-- recovery so the existing generic race-health triggers remain intact.
-- No changes to generic race engine, other races, rider health, game time or payouts.
CREATE OR REPLACE FUNCTION public.world_road_championship_refresh_availability_v1()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_game_date date:=public.get_current_game_date_date();
  r record;
  v_count integer:=0;
begin
  for r in
    select en.id,en.edition_id,en.rider_id,en.participation_decision,en.entry_status,
           e.race_date,
           coalesce(rd.availability_status,'fit') availability_status,
           rd.unavailable_until
    from public.world_road_championship_entries en
    join public.world_road_championship_editions e on e.id=en.edition_id
    join public.riders rd on rd.id=en.rider_id
    where e.status in ('planned','ready')
      and en.participation_decision<>'rejected'
  loop
    -- 'not_fully_fit' means fatigued / reduced readiness, not medically unavailable.
    -- Hard medical states and explicitly selection-blocking health cases remain excluded.
    -- Confirmation remains independent of today’s fatigue and temporary injury.
    -- Decide race-day medical eligibility when the Championship date arrives.
    if v_game_date>=r.race_date
       and (
         lower(r.availability_status) in ('injured','sick','retired')
         or exists (
           select 1 from public.rider_health_cases hc
            where hc.rider_id=r.rider_id
              and hc.status in ('active','recovering')
              and hc.selection_blocked is true
         )
       )
    then
      if r.entry_status<>'unavailable' then
        update public.world_road_championship_entries
           set entry_status='unavailable',updated_at=now()
         where id=r.id;

        update public.world_road_championship_duties
           set status='cancelled',updated_at=now()
         where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    else
      if r.entry_status='unavailable' then
        update public.world_road_championship_entries
           set entry_status=case
             when r.participation_decision in ('approved','auto_approved')
               then 'confirmed'
             else 'invited'
           end,
           updated_at=now()
         where id=r.id;

        update public.world_road_championship_duties
           set status='confirmed',updated_at=now()
         where edition_id=r.edition_id and rider_id=r.rider_id;

        v_count:=v_count+1;
      end if;
    end if;
  end loop;

  for r in
    select id
    from public.world_road_championship_editions
    where status in ('planned','ready') and race_id is not null
  loop
    perform public.world_road_championship_sync_participants_v1(r.id);
  end loop;
  return v_count;
end;
$function$

CREATE OR REPLACE FUNCTION public.world_road_championship_sync_participants_v1(p_edition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.world_road_championship_editions%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer:=0;
  v_team_count integer:=0;
begin
  select * into e
  from public.world_road_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'World Road Championship edition not found';
  end if;

  v_race_id:=e.race_id;
  if v_race_id is null then
    return jsonb_build_object('status','race_not_ready','edition_id',e.id);
  end if;

  select id into v_stage_id
  from public.race_stages
  where race_id=v_race_id
  order by stage_number
  limit 1;

  if v_stage_id is null then
    return jsonb_build_object('status','stage_not_ready','race_id',v_race_id);
  end if;

  if exists(
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id=v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  insert into public.race_preparations(
    race_id,club_id,status,startlist_status,
    setup_window_opens_on,rider_submission_deadline_on,submitted_at,
    rider_count,staff_count,
    participation_cost_cash,travel_cost_cash,staff_travel_cost_cash,
    asset_transport_cost_cash,supplies_cost_cash,operations_cost_cash,total_cost_cash,
    cost_breakdown_json,team_policies_snapshot_json,validation_snapshot_json,
    engine_payload_json,metadata,participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted','submitted',
    e.race_date-14,e.race_date,now(),
    x.rider_count,0,
    0,0,0,0,0,0,0,
    jsonb_build_object(
      'world_road_championship',true,
      'organizer_paid',true,
      'all_team_costs_covered',true
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'preparation_mode','individual_riders_only',
      'organizer_paid',true,
      'team_commands_enabled',false
    ),
    x.club_id
  from (
    select en.club_id_snapshot as club_id,count(*)::int rider_count
    from public.world_road_championship_entries en
    where en.edition_id=e.id
      and en.club_id_snapshot is not null
      and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata||excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json||excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        participation_cost_cash=0,
        travel_cost_cash=0,
        staff_travel_cost_cash=0,
        asset_transport_cost_cash=0,
        supplies_cost_cash=0,
        operations_cost_cash=0,
        total_cost_cash=0,
        updated_at=now();

  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and coalesce((rp.metadata->>'world_road_championship')::boolean,false)
    and not exists(
      select 1
      from public.world_road_championship_entries en
      where en.edition_id=e.id
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
    );

  insert into public.race_preparation_riders(
    race_preparation_id,rider_id,start_number,race_role,
    default_equipment_setup_id,availability_snapshot_json,rider_snapshot_json,
    bonus_snapshot_json,metadata
  )
  select
    rp.id,en.rider_id,
    row_number() over(order by en.country_code,en.rider_name_snapshot)::int,
    'free_role',null,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'world_road_championship',true,
      'country_code',en.country_code,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'world_road_championship',true,
      'individual_only',true
    )
  from public.world_road_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        metadata=public.race_preparation_riders.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans(
    race_preparation_id,race_id,stage_id,stage_number,stage_date,status,
    opens_on_game_date,locks_on_game_date,submitted_at,
    stage_objective,team_strategy,risk_level,
    stage_profile_snapshot_json,bonus_snapshot_json,engine_stage_payload_json,
    metadata,rider_equipment_json,rider_roles_json,team_tactic_json,
    rider_supplies_json,rider_individual_tactics_json,last_saved_at,last_saved_game_ts
  )
  select
    rp.id,v_race_id,v_stage_id,1,s.stage_date,'submitted',
    e.race_date-14,e.race_date,now(),
    'balanced','balanced','normal',
    to_jsonb(s),'{}'::jsonb,
    jsonb_build_object('world_road_championship',true),
    jsonb_build_object(
      'world_road_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true,
      'team_commands_enabled',false
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'plan','balanced',
      'internal_neutral_placeholder',true,
      'team_commands_enabled',false,
      'notes','World Road Championship: riders compete independently'
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'world_road_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders(
    race_stage_plan_id,rider_id,stage_role,tactic,risk_level,effort_level,
    equipment_setup_id,rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,final_bonus_snapshot_json,metadata
  )
  select
    sp.id,en.rider_id,'free_role','balanced','normal','normal',null,
    jsonb_build_object(
      'world_road_championship',true,
      'country_code',en.country_code
    ),
    '{}'::jsonb,'{}'::jsonb,
    jsonb_build_object('world_road_championship',true,'individual_only',true)
  from public.world_road_championship_entries en
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  where en.edition_id=e.id
    and en.club_id_snapshot is not null
    and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json||excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata||excluded.metadata,
        updated_at=now();

  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams(
    race_id,team_id,status,team_name_snapshot,logo_url_snapshot,
    country_code_snapshot,ranking_snapshot,submitted_at,accepted_at
  )
  select
    v_race_id,
    x.team_id,
    'accepted',
    x.team_name,
    null,
    x.country_code,
    null,
    now(),now()
  from (
    select distinct on (coalesce(en.club_id_snapshot,en.rider_id))
      coalesce(en.club_id_snapshot,en.rider_id) as team_id,
      case
        when en.club_id_snapshot is null then 'Free Agent'
        else coalesce(c.name,en.club_name_snapshot,'Team')
      end as team_name,
      en.country_code
    from public.world_road_championship_entries en
    left join public.clubs c on c.id=en.club_id_snapshot
    where en.edition_id=e.id
      and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
    order by coalesce(en.club_id_snapshot,en.rider_id),en.country_code
  ) x;

  insert into public.race_participant_riders(
    race_id,team_id,rider_id,rider_name_snapshot,team_name_snapshot,
    country_code_snapshot,age_snapshot,is_young_rider,start_number,
    role_snapshot,overall_snapshot,can_view_exact_overall,overall_range_label
  )
  select
    v_race_id,
    coalesce(en.club_id_snapshot,en.rider_id),
    en.rider_id,
    en.rider_name_snapshot,
    case
      when en.club_id_snapshot is null then 'Free Agent'
      else coalesce(c.name,en.club_name_snapshot,'Team')
    end,
    en.country_code,
    greatest(0,extract(year from age(e.race_date,r.birth_date))::int),
    extract(year from age(e.race_date,r.birth_date))::int<=21,
    row_number() over(order by en.country_code,en.rider_name_snapshot)::int,
    r.role::text,
    r.overall,
    true,
    null
  from public.world_road_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
    and en.entry_status='confirmed'
      -- Physical start list may only contain riders currently eligible for selection.
      -- Injured riders still retain their FUTURE Championship confirmation until race day.
      and not exists (
        select 1 from public.riders health_r
        where health_r.id=en.rider_id
          and lower(coalesce(health_r.availability_status,'fit')) in ('injured','sick','retired')
      )
      and not exists (
        select 1 from public.rider_health_cases health_case
        where health_case.rider_id=en.rider_id
          and health_case.status in ('active','recovering')
          and health_case.selection_blocked is true
      )
      and en.participation_decision in ('approved','auto_approved')
  order by en.country_code,en.rider_name_snapshot;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  update public.world_road_championship_editions
  set participant_count=v_rider_count,
      confirmed_count=(
        select count(*)::int
        from public.world_road_championship_entries en
        where en.edition_id=e.id
          and en.entry_status='confirmed'
          and en.participation_decision in ('approved','auto_approved')
      ),
      updated_at=now()
  where id=e.id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$
