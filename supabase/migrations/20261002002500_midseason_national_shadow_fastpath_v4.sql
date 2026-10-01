-- Transaction-local fast path for the mid-season National migration rehearsal.
-- Live production calls remain on the exact existing Race Preparation path.
-- Only the rollback harness sets app.national_migration_shadow=on.
create or replace function private.national_championship_sync_race_participants_shadow_v1(
  p_edition_id uuid,
  p_event_type text,
  p_heat_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer:=0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id;
    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %',p_edition_id;
    end if;
    v_race_id:=h.race_id;
  elsif p_event_type='final' then
    v_race_id:=e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %',p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id=v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage',v_race_id;
  end if;

  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams(
    race_id,team_id,status,team_name_snapshot,logo_url_snapshot,
    country_code_snapshot,ranking_snapshot,submitted_at,accepted_at
  )
  select
    v_race_id,en.rider_id,'accepted',en.rider_name_snapshot,null,
    en.country_code_snapshot,en.national_rank,now(),now()
  from public.national_championship_entries en
  where en.edition_id=e.id
    and public.national_championship_entry_confirmed_for_event_v1(
      en.id,p_event_type,p_heat_id
    )
    and (
      (p_event_type='qualification'
       and en.heat_id=p_heat_id
       and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
       and en.entry_status in ('direct_qualified','qualified','finalist')
       and public.national_championship_rider_available_for_event_v1(
         en.rider_id,e.final_date
       ))
    )
  order by en.national_rank;

  insert into public.race_participant_riders(
    race_id,team_id,rider_id,rider_name_snapshot,team_name_snapshot,
    country_code_snapshot,age_snapshot,is_young_rider,start_number,
    role_snapshot,overall_snapshot,can_view_exact_overall,overall_range_label
  )
  select
    v_race_id,en.rider_id,en.rider_id,en.rider_name_snapshot,en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then h.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then h.qualification_date else e.final_date end,
      r.birth_date
    ))::int<=21,
    en.national_rank,r.role::text,r.overall,true,null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  where en.edition_id=e.id
    and public.national_championship_entry_confirmed_for_event_v1(
      en.id,p_event_type,p_heat_id
    )
    and (
      (p_event_type='qualification'
       and en.heat_id=p_heat_id
       and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
       and en.entry_status in ('direct_qualified','qualified','finalist')
       and public.national_championship_rider_available_for_event_v1(
         en.rider_id,e.final_date
       ))
    )
  order by en.national_rank;

  get diagnostics v_rider_count=row_count;

  return jsonb_build_object(
    'status','shadow_participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count
  );
end;
$function$;

revoke all on function private.national_championship_sync_race_participants_shadow_v1(uuid,text,uuid) from public;


CREATE OR REPLACE FUNCTION public.national_championship_sync_race_participants_v1(p_edition_id uuid, p_event_type text, p_heat_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_rider_count integer := 0;
  v_team_count integer := 0;
begin
  if current_setting('app.national_migration_shadow',true)='on' then
    return private.national_championship_sync_race_participants_shadow_v1(
      p_edition_id,p_event_type,p_heat_id
    );
  end if;
  select * into e
  from public.national_championship_editions
  where id = p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  if p_event_type = 'qualification' then
    select * into h
    from public.national_championship_heats
    where id = p_heat_id and edition_id = e.id;

    if h.id is null or h.race_id is null then
      raise exception 'Qualification heat/race not found for edition %', p_edition_id;
    end if;

    v_race_id := h.race_id;
  elsif p_event_type = 'final' then
    v_race_id := e.final_race_id;
    if v_race_id is null then
      raise exception 'Final race is not created for edition %', p_edition_id;
    end if;
  else
    raise exception 'Invalid national championship event type: %', p_event_type;
  end if;

  select s.id into v_stage_id
  from public.race_stages s
  where s.race_id = v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship race % has no stage', v_race_id;
  end if;

  if exists (
    select 1
    from public.race_stage_simulation_runs sr
    where sr.stage_id = v_stage_id
      and sr.status in ('running','completed')
  ) then
    return jsonb_build_object(
      'status','participants_locked',
      'race_id',v_race_id,
      'stage_id',v_stage_id
    );
  end if;

  /*
   * Create a zero-cost, organizer-managed preparation shell for each real club
   * represented in the event. No staff, assets or club supplies are attached.
   * The shell exists only so the universal race engine can read rider equipment
   * and rider-specific tactics through its normal stage-plan adapters.
   */
  insert into public.race_preparations (
    race_id,
    club_id,
    status,
    startlist_status,
    setup_window_opens_on,
    rider_submission_deadline_on,
    submitted_at,
    rider_count,
    staff_count,
    participation_cost_cash,
    travel_cost_cash,
    staff_travel_cost_cash,
    asset_transport_cost_cash,
    supplies_cost_cash,
    operations_cost_cash,
    total_cost_cash,
    cost_breakdown_json,
    team_policies_snapshot_json,
    validation_snapshot_json,
    engine_payload_json,
    metadata,
    participating_club_id
  )
  select
    v_race_id,
    x.club_id,
    'submitted',
    'submitted',
    e.ranking_snapshot_date,
    case when p_event_type='qualification' then e.qualification_date else e.final_date end,
    now(),
    x.rider_count,
    0,
    0,0,0,0,0,0,0,
    jsonb_build_object('national_championship',true,'organizer_paid',true),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'standardized_bonus_totals',jsonb_build_object(
        'race_support',0,
        'fatigue_control',0,
        'recovery_support',0,
        'health_protection',0,
        'mechanical_reliability',0
      )
    ),
    jsonb_build_object(
      'national_championship',true,
      'participating_club_id',x.club_id
    ),
    jsonb_build_object(
      'national_championship',true,
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
    ),
    x.club_id
  from (
    select
      en.club_id_snapshot as club_id,
      count(*)::int as rider_count
    from public.national_championship_entries en
    where en.edition_id = e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
      )
    group by en.club_id_snapshot
  ) x
  on conflict (race_id,club_id) do update
    set rider_count=excluded.rider_count,
        participating_club_id=excluded.participating_club_id,
        metadata=public.race_preparations.metadata || excluded.metadata,
        engine_payload_json=public.race_preparations.engine_payload_json || excluded.engine_payload_json,
        validation_snapshot_json=excluded.validation_snapshot_json,
        updated_at=now();

  /*
   * The universal race engine expects canonical selected riders on each
   * preparation. National Championships use the club only as a technical
   * preparation owner; sporting identity stays rider-only.
   */
  delete from public.race_preparation_riders selected
  using public.race_preparations rp
  where selected.race_preparation_id = rp.id
    and rp.race_id = v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
    and not exists (
      select 1
      from public.national_championship_entries en
      where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
        )
    );

  insert into public.race_preparation_riders (
    race_preparation_id,
    rider_id,
    start_number,
    race_role,
    default_equipment_setup_id,
    availability_snapshot_json,
    rider_snapshot_json,
    bonus_snapshot_json,
    metadata
  )
  select
    rp.id,
    en.rider_id,
    en.national_rank,
    'free_role',
    plan.equipment_setup_id,
    jsonb_build_object(
      'availability_status',r.availability_status,
      'unavailable_until',r.unavailable_until,
      'unavailable_reason',r.unavailable_reason
    ),
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'national_rank',en.national_rank,
      'overall',r.overall,
      'role',r.role
    ),
    '{}'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'individual_only',true,
      'event_type',p_event_type
    )
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_preparation_id,rider_id) do update
    set start_number=excluded.start_number,
        race_role='free_role',
        default_equipment_setup_id=excluded.default_equipment_setup_id,
        availability_snapshot_json=excluded.availability_snapshot_json,
        rider_snapshot_json=excluded.rider_snapshot_json,
        bonus_snapshot_json=excluded.bonus_snapshot_json,
        metadata=public.race_preparation_riders.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plans (
    race_preparation_id,
    race_id,
    stage_id,
    stage_number,
    stage_date,
    status,
    opens_on_game_date,
    locks_on_game_date,
    submitted_at,
    stage_objective,
    team_strategy,
    risk_level,
    stage_profile_snapshot_json,
    bonus_snapshot_json,
    engine_stage_payload_json,
    metadata,
    rider_equipment_json,
    rider_roles_json,
    team_tactic_json,
    rider_supplies_json,
    rider_individual_tactics_json,
    last_saved_at,
    last_saved_game_ts
  )
  select
    rp.id,
    v_race_id,
    v_stage_id,
    1,
    s.stage_date,
    'submitted',
    e.ranking_snapshot_date,
    s.stage_date,
    now(),
    'balanced',
    'balanced',
    'normal',
    to_jsonb(s),
    '{}'::jsonb,
    jsonb_build_object('national_championship',true),
    jsonb_build_object(
      'national_championship',true,
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    public.get_current_game_ts_local()
  from public.race_preparations rp
  join public.race_stages s on s.id=v_stage_id
  where rp.race_id=v_race_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false)
  on conflict (race_preparation_id,stage_number) do update
    set stage_id=excluded.stage_id,
        stage_date=excluded.stage_date,
        status='submitted',
        team_strategy='balanced',
        team_tactic_json=excluded.team_tactic_json,
        metadata=public.race_stage_plans.metadata || excluded.metadata,
        updated_at=now();

  insert into public.race_stage_plan_riders (
    race_stage_plan_id,
    rider_id,
    stage_role,
    tactic,
    risk_level,
    effort_level,
    equipment_setup_id,
    rider_stage_snapshot_json,
    equipment_bonus_snapshot_json,
    final_bonus_snapshot_json,
    metadata
  )
  select
    sp.id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    plan.equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'national_rank',en.national_rank,
      'event_type',p_event_type
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object('national_championship',true)
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  join public.race_preparations rp
    on rp.race_id=v_race_id
   and rp.club_id=en.club_id_snapshot
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  left join public.national_championship_rider_plans plan
    on plan.edition_id=e.id
   and plan.rider_id=en.rider_id
   and plan.event_type=p_event_type
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        rider_stage_snapshot_json=public.race_stage_plan_riders.rider_stage_snapshot_json || excluded.rider_stage_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata || excluded.metadata,
        updated_at=now();

  /*
   * Apply saved per-rider commands to the universal stage-plan JSON.
   */
  update public.race_stage_plans sp
  set rider_individual_tactics_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'ride_naturally')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'ride_naturally')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'ride_naturally')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'ride_naturally'))
          )
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          case when plan.equipment_setup_id is null then 'null'::jsonb
               else to_jsonb(plan.equipment_setup_id::text) end
        )
        from public.national_championship_entries en
        left join public.national_championship_rider_plans plan
          on plan.edition_id=e.id
         and plan.rider_id=en.rider_id
         and plan.event_type=p_event_type
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          jsonb_build_object('source','organizer','standardized',true)
        )
        from public.national_championship_entries en
        where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
          )
      ),'{}'::jsonb),
      metadata=coalesce(sp.metadata,'{}'::jsonb) || jsonb_build_object(
        'national_championship',true,
        'individual_only',true,
        'team_commands_enabled',false
      ),
      updated_at=now()
  from public.race_preparations rp
  where sp.race_preparation_id=rp.id
    and rp.race_id=v_race_id
    and sp.stage_id=v_stage_id
    and coalesce((rp.metadata->>'national_championship')::boolean,false);

  /*
   * Rebuild the canonical participant snapshot after preparation triggers.
   */
  delete from public.race_participant_riders where race_id=v_race_id;
  delete from public.race_participant_teams where race_id=v_race_id;

  insert into public.race_participant_teams (
    race_id,
    team_id,
    status,
    team_name_snapshot,
    logo_url_snapshot,
    country_code_snapshot,
    ranking_snapshot,
    submitted_at,
    accepted_at
  )
  select
    v_race_id,
    en.rider_id,
    'accepted',
    en.rider_name_snapshot,
    null,
    en.country_code_snapshot,
    en.national_rank,
    now(),
    now()
  from public.national_championship_entries en
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  insert into public.race_participant_riders (
    race_id,
    team_id,
    rider_id,
    rider_name_snapshot,
    team_name_snapshot,
    country_code_snapshot,
    age_snapshot,
    is_young_rider,
    start_number,
    role_snapshot,
    overall_snapshot,
    can_view_exact_overall,
    overall_range_label
  )
  select
    v_race_id,
    en.rider_id,
    en.rider_id,
    en.rider_name_snapshot,
    en.rider_name_snapshot,
    en.country_code_snapshot,
    greatest(
      0,
      extract(year from age(
        case when p_event_type='qualification' then e.qualification_date else e.final_date end,
        r.birth_date
      ))::int
    ),
    extract(year from age(
      case when p_event_type='qualification' then e.qualification_date else e.final_date end,
      r.birth_date
    ))::int <= 21,
    en.national_rank,
    r.role::text,
    r.overall,
    true,
    null
  from public.national_championship_entries en
  join public.riders r on r.id=en.rider_id
  left join public.clubs c on c.id=en.club_id_snapshot
  where en.edition_id=e.id
      and public.national_championship_entry_confirmed_for_event_v1(en.id,p_event_type,p_heat_id)
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist') and public.national_championship_rider_available_for_event_v1(en.rider_id,e.final_date))
    )
  order by en.national_rank;

  select count(*)::int,count(distinct team_id)::int
  into v_rider_count,v_team_count
  from public.race_participant_riders
  where race_id=v_race_id;

  return jsonb_build_object(
    'status','participants_synced',
    'edition_id',e.id,
    'event_type',p_event_type,
    'heat_id',p_heat_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'rider_count',v_rider_count,
    'team_count',v_team_count
  );
end;
$function$


create or replace function private.shadow_complete_national_championship_stage_v1(
  p_edition_id uuid,
  p_race_id uuid,
  p_stage_id uuid,
  p_event_type text,
  p_heat_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path='public','pg_temp'
as $function$
declare
  v_run_id uuid;
  v_rows integer:=0;
begin
  if p_event_type not in ('qualification','final') then
    raise exception 'Unsupported shadow National Championship event type %',p_event_type;
  end if;

  select sr.id into v_run_id
  from public.race_stage_simulation_runs sr
  where sr.stage_id=p_stage_id and sr.status='completed'
  order by sr.completed_at desc nulls last,sr.started_at desc
  limit 1;

  if v_run_id is null then
    perform set_config('app.race_engine_writer_family','typescript',true);
    insert into public.race_stage_simulation_runs(
      race_id,stage_id,status,engine_version,simulation_mode,
      started_at,completed_at,input_snapshot_json,result_summary_json
    )
    values(
      p_race_id,p_stage_id,'completed','race_engine_ts_v1','deterministic_road_race_v1',
      now(),now(),
      jsonb_build_object('fixture','midseason_national_migration_shadow_v4','event_type',p_event_type),
      jsonb_build_object('fixture','midseason_national_migration_shadow_v4','event_type',p_event_type)
    )
    returning id into v_run_id;
  end if;

  perform set_config('app.race_engine_writer_family','typescript',true);

  insert into public.race_stage_results(
    race_id,stage_id,rider_id,team_id,rank,status,elapsed_seconds,gap_seconds,
    rider_name_snapshot,team_name_snapshot,simulation_run_id,output_contract
  )
  select
    p_race_id,p_stage_id,en.rider_id,en.rider_id,
    row_number() over(order by en.national_rank,en.rider_id)::integer,
    'finished',
    case when p_event_type='qualification' then 12000 else 13000 end
      +row_number() over(order by en.national_rank,en.rider_id)::integer,
    row_number() over(order by en.national_rank,en.rider_id)::integer-1,
    en.rider_name_snapshot,en.rider_name_snapshot,v_run_id,'run_scoped_v1'
  from public.national_championship_entries en
  where en.edition_id=p_edition_id
    and (
      (p_event_type='qualification'
       and en.heat_id=p_heat_id
       and public.national_championship_entry_confirmed_for_event_v1(en.id,'qualification',p_heat_id))
      or
      (p_event_type='final'
       and public.national_championship_entry_confirmed_for_event_v1(en.id,'final',null))
    )
  on conflict do nothing;

  get diagnostics v_rows=row_count;

  return jsonb_build_object(
    'status','completed',
    'simulation_run_id',v_run_id,
    'result_rows_inserted',v_rows
  );
end;
$function$;

revoke all on function private.shadow_complete_national_championship_stage_v1(uuid,uuid,uuid,text,uuid) from public;


CREATE OR REPLACE FUNCTION private.run_midseason_national_migration_shadow_v4(p_end_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_original_state jsonb;
  v_original_season integer;
  v_start_date date;
  v_end_date date;
  v_day date;
  v_next_day date;
  v_next_event date;
  v_processing_steps integer:=0;

  v_report jsonb:='{}'::jsonb;
  v_checkpoints jsonb:='[]'::jsonb;
  v_last_snapshot jsonb:='{}'::jsonb;
  v_nc_runtime jsonb;
  v_na_runtime jsonb;
  v_q_result jsonb;
  v_f_result jsonb;
  v_nc_overview jsonb;
  v_nations_health jsonb;
  v_assoc_integrity jsonb;

  v_baseline_notifications bigint;
  v_baseline_associations integer;
  v_baseline_editions integer;
  v_baseline_nc_editions integer;
  v_baseline_elections integer;
  v_baseline_coach_terms integer;
  v_baseline_nc_entries integer;
  v_baseline_nc_duties integer;
  v_baseline_invalid_memberships integer;

  v_active_associations integer;
  v_active_coaches integer;
  v_open_elections integer;
  v_completed_elections integer;
  v_max_election_round integer;
  v_human_capable_without_coach integer;

  v_nc_planned integer;
  v_nc_qualification_pending integer;
  v_nc_final_ready integer;
  v_nc_completed integer;
  v_pending_initial integer;
  v_pending_final integer;
  v_confirmed_nc_duties integer;
  v_overdue_ready_planned integer;
  v_nonready_due integer;
  v_commitment_conflicts integer;
  v_ready_lifecycle_issue_count integer:=0;
  v_ready_lifecycle_issues jsonb:='[]'::jsonb;

  v_notifications_delta bigint;
  v_invalid_memberships integer;
  v_new_invalid_memberships integer;

  v_qualification_heats_completed_total integer:=0;
  v_finals_completed_total integer:=0;
  v_champions integer:=0;
  v_world_entries integer:=0;
  v_stage_id uuid;
  v_stage_result jsonb;

  v_world_groups integer:=0;
  v_world_groups_with_host integer:=0;
  v_world_groups_without_host integer:=0;

  v_prev_active_coaches integer:=-1;
  v_prev_open_elections integer:=-1;
  v_prev_max_election_round integer:=-1;
  v_prev_nc_completed integer:=-1;

  h record;
  e record;

  v_error text;
  v_error_detail text;
  v_error_hint text;
  v_error_context text;

  v_live_state_after jsonb;
  v_live_preserved boolean;
begin
  select to_jsonb(gs),gs.season_number,public.get_current_game_date_date()
  into v_original_state,v_original_season,v_start_date
  from public.game_state gs
  where gs.id=true;

  if v_original_season<>1 then
    return jsonb_build_object(
      'status','skipped',
      'reason','season_1_only',
      'current_season',v_original_season,
      'current_game_date',v_start_date
    );
  end if;

  v_end_date:=coalesce(p_end_date,public.game_date_from_parts(1,9,1));

  if v_end_date<v_start_date then
    return jsonb_build_object(
      'status','skipped',
      'reason','end_before_current_game_date',
      'current_game_date',v_start_date,
      'requested_end_date',v_end_date
    );
  end if;

  if v_end_date>public.game_date_from_parts(1,9,1) then
    return jsonb_build_object(
      'status','skipped',
      'reason','harness_capped_at_september_1',
      'maximum_end_date',public.game_date_from_parts(1,9,1)
    );
  end if;

  select count(*) into v_baseline_notifications from public.user_notifications;
  select count(*) into v_baseline_associations from public.national_associations;
  select count(*) into v_baseline_editions
  from public.nations_competition_editions where season_number=1;
  select count(*) into v_baseline_nc_editions
  from public.national_championship_editions where season_number=1;
  select count(*) into v_baseline_elections
  from public.national_coach_elections where season_number=1;
  select count(*) into v_baseline_coach_terms
  from public.national_coach_terms where season_number=1;
  select count(*) into v_baseline_nc_entries
  from public.national_championship_entries en
  join public.national_championship_editions ed on ed.id=en.edition_id
  where ed.season_number=1;
  select count(*) into v_baseline_nc_duties
  from public.national_championship_duties d
  join public.national_championship_editions ed on ed.id=d.edition_id
  where ed.season_number=1;

  select count(*)::integer into v_baseline_invalid_memberships
  from public.national_association_memberships m
  join public.clubs c on c.id=m.club_id
  join public.national_associations a on a.id=m.association_id
  where m.status='active'
    and (
      c.deleted_at is not null
      or coalesce(c.is_ai,false)=true
      or c.club_type<>'main'
      or c.owner_user_id<>m.user_id
      or upper(c.country_code)<>upper(a.country_code)
    );

  begin
    perform set_config('app.national_migration_shadow','on',true);
    v_day:=v_start_date;

    while v_day<=v_end_date loop
      v_processing_steps:=v_processing_steps+1;

      -- The existing game-state trigger exits immediately while paused, so this
      -- clock move cannot invoke unrelated hourly processors. Rollback restores
      -- the original live pause/date/time values.
      update public.game_state
      set season_number=1,
          month_number=extract(month from v_day)::integer,
          day_number=extract(day from v_day)::integer,
          hour_number=12,
          minute_number=0,
          is_paused=true
      where id=true;

      -- Same entry points as production National jobs.
      v_nc_runtime:=public.process_national_championship_runtime_v2();
      v_na_runtime:=public.process_national_association_nations_runtime_v1();

      -- Complete every qualification heat due today with deterministic,
      -- run-scoped TypeScript-compatible fixture results.
      for h in
        select heat.*,ed.country_code
        from public.national_championship_heats heat
        join public.national_championship_editions ed on ed.id=heat.edition_id
        where ed.season_number=1
          and ed.route_status='ready'
          and heat.qualification_date=v_day
          and heat.race_id is not null
          and heat.status<>'completed'
        order by ed.country_code,heat.heat_number
      loop
        perform public.national_championship_sync_race_participants_v1(
          h.edition_id,'qualification',h.id
        );

        select id into v_stage_id
        from public.race_stages
        where race_id=h.race_id
        order by stage_number
        limit 1;

        if v_stage_id is null then
          raise exception 'Qualification stage missing for % / heat %',
            h.country_code,h.id;
        end if;

        v_stage_result:=private.shadow_complete_national_championship_stage_v1(
          h.edition_id,h.race_id,v_stage_id,'qualification',h.id
        );

        update public.national_championship_heats
        set status='ready',updated_at=now()
        where id=h.id and status<>'completed';

        v_qualification_heats_completed_total:=
          v_qualification_heats_completed_total+1;
      end loop;

      v_q_result:=public.national_championship_process_qualification_results_v1();

      perform public.national_championship_open_final_confirmations_v1();
      perform public.national_championship_auto_approve_final_pending_v1();
      perform public.national_championship_refresh_final_participants_v1();

      -- Complete every route-ready National Final due today.
      for e in
        select ed.*
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.route_status='ready'
          and ed.final_date=v_day
          and ed.final_race_id is not null
          and ed.status<>'completed'
        order by ed.country_code
      loop
        perform public.national_championship_sync_race_participants_v1(
          e.id,'final',null
        );

        select id into v_stage_id
        from public.race_stages
        where race_id=e.final_race_id
        order by stage_number
        limit 1;

        if v_stage_id is null then
          raise exception 'Final stage missing for %',e.country_code;
        end if;

        v_stage_result:=private.shadow_complete_national_championship_stage_v1(
          e.id,e.final_race_id,v_stage_id,'final',null
        );

        update public.national_championship_editions
        set status='final_ready',updated_at=now()
        where id=e.id and status<>'completed';

        v_finals_completed_total:=v_finals_completed_total+1;
      end loop;

      v_f_result:=public.national_championship_process_final_results_v1();

      -- One more runtime pass handles any same-day handoff produced by results.
      v_nc_runtime:=public.process_national_championship_runtime_v2();

      select count(*)::integer into v_active_associations
      from public.national_associations where status='active';

      select count(*)::integer into v_active_coaches
      from public.national_coach_terms
      where season_number=1 and status='active';

      select count(*)::integer into v_open_elections
      from public.national_coach_elections
      where season_number=1
        and status in ('candidate_registration','voting','runoff');

      select count(*)::integer into v_completed_elections
      from public.national_coach_elections
      where season_number=1 and status='completed';

      select coalesce(max(current_round),0)::integer into v_max_election_round
      from public.national_coach_elections
      where season_number=1
        and status in ('candidate_registration','voting','runoff');

      -- Associations with enough genuine human memberships should not be left
      -- without both a coach and an open election.
      select count(*)::integer into v_human_capable_without_coach
      from public.national_associations a
      where a.status='active'
        and (
          select count(*)
          from public.national_association_memberships m
          join public.clubs c on c.id=m.club_id
          where m.association_id=a.id
            and m.status='active'
            and coalesce(c.is_ai,false)=false
            and c.deleted_at is null
            and c.club_type='main'
            and c.owner_user_id=m.user_id
            and upper(c.country_code)=upper(a.country_code)
        ) >= (
          select minimum_active_members
          from public.national_association_config
          where id=true
        )
        and not exists(
          select 1 from public.national_coach_terms t
          where t.association_id=a.id
            and t.season_number=1
            and t.status='active'
        )
        and not exists(
          select 1 from public.national_coach_elections ce
          where ce.association_id=a.id
            and ce.season_number=1
            and ce.status in ('candidate_registration','voting','runoff')
        );

      select
        count(*) filter(where status='planned')::integer,
        count(*) filter(where status='qualification_pending')::integer,
        count(*) filter(where status='final_ready')::integer,
        count(*) filter(where status='completed')::integer
      into
        v_nc_planned,
        v_nc_qualification_pending,
        v_nc_final_ready,
        v_nc_completed
      from public.national_championship_editions
      where season_number=1 and discipline='road';

      select count(*)::integer into v_pending_initial
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
        and en.participation_decision='pending';

      select count(*)::integer into v_pending_final
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
        and en.final_participation_decision='pending';

      select count(*)::integer into v_confirmed_nc_duties
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      where ed.season_number=1 and d.status='confirmed';

      select count(*)::integer into v_overdue_ready_planned
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and ed.schedule_draw_status='locked'
        and ed.climate_status='ready'
        and ed.route_status='ready'
        and ed.ranking_snapshot_date<=v_day;

      select count(*)::integer into v_nonready_due
      from public.national_championship_editions ed
      where ed.season_number=1
        and ed.discipline='road'
        and ed.status='planned'
        and coalesce(ed.route_status,'pending')<>'ready'
        and ed.ranking_snapshot_date<=v_day;

      select count(*)::integer into v_commitment_conflicts
      from (
        select distinct cd.rider_id,cd.id championship_duty_id,td.id team_duty_id
        from public.national_championship_duties cd
        join public.national_championship_editions ce
          on ce.id=cd.edition_id and ce.season_number=1
        join public.national_team_duties td
          on td.season_number=1
         and td.status in ('confirmed','on_duty')
         and td.start_date<=coalesce(cd.duty_end_date,cd.duty_date)
         and td.end_date>=coalesce(cd.duty_start_date,cd.duty_date)
        join public.national_team_squad_members sm
          on sm.squad_id=td.squad_id
         and sm.rider_id=cd.rider_id
        where cd.status='confirmed'
      ) conflicts;

      select count(*)::integer into v_invalid_memberships
      from public.national_association_memberships m
      join public.clubs c on c.id=m.club_id
      join public.national_associations a on a.id=m.association_id
      where m.status='active'
        and (
          c.deleted_at is not null
          or coalesce(c.is_ai,false)=true
          or c.club_type<>'main'
          or c.owner_user_id<>m.user_id
          or upper(c.country_code)<>upper(a.country_code)
        );

      v_new_invalid_memberships:=
        greatest(0,v_invalid_memberships-v_baseline_invalid_memberships);

      select count(*)-v_baseline_notifications
      into v_notifications_delta
      from public.user_notifications;

      select count(*)::integer,
             count(*) filter(where g.host_country_code is not null)::integer,
             count(*) filter(where g.host_country_code is null)::integer
      into v_world_groups,v_world_groups_with_host,v_world_groups_without_host
      from public.nations_competition_groups g
      join public.nations_competition_rounds r on r.id=g.round_id
      join public.nations_competition_editions ed on ed.id=r.edition_id
      where ed.season_number=1;

      select count(*)::integer into v_champions
      from public.national_championship_editions
      where season_number=1
        and status='completed'
        and champion_rider_id is not null;

      select count(*)::integer into v_world_entries
      from public.world_road_championship_entries w
      join public.national_championship_editions ed
        on ed.id=w.source_national_edition_id
      where ed.season_number=1;

      v_last_snapshot:=jsonb_build_object(
        'game_date',v_day,
        'national_association',jsonb_build_object(
          'active_associations',v_active_associations,
          'active_coaches',v_active_coaches,
          'open_elections',v_open_elections,
          'completed_elections',v_completed_elections,
          'highest_open_election_round',v_max_election_round,
          'human_capable_without_coach_or_election',v_human_capable_without_coach,
          'invalid_active_memberships',v_invalid_memberships,
          'new_invalid_memberships',v_new_invalid_memberships
        ),
        'national_championships',jsonb_build_object(
          'planned',v_nc_planned,
          'qualification_pending',v_nc_qualification_pending,
          'final_ready',v_nc_final_ready,
          'completed',v_nc_completed,
          'champions',v_champions,
          'world_entries_from_champions',v_world_entries,
          'pending_initial_decisions',v_pending_initial,
          'pending_final_decisions',v_pending_final,
          'confirmed_duties',v_confirmed_nc_duties,
          'overdue_route_ready_planned',v_overdue_ready_planned,
          'nonready_editions_past_freeze',v_nonready_due
        ),
        'world_nations',jsonb_build_object(
          'groups',v_world_groups,
          'groups_with_host',v_world_groups_with_host,
          'groups_without_host',v_world_groups_without_host
        ),
        'overlapping_national_commitments',v_commitment_conflicts,
        'notifications_generated',v_notifications_delta,
        'fixture_results',jsonb_build_object(
          'qualification_heats_completed',v_qualification_heats_completed_total,
          'national_finals_completed',v_finals_completed_total
        )
      );

      -- First/last day, month starts, election-round changes, championship
      -- completions and actual result dates become audit checkpoints.
      if v_day=v_start_date
         or v_day=v_end_date
         or extract(day from v_day)=1
         or v_active_coaches<>v_prev_active_coaches
         or v_open_elections<>v_prev_open_elections
         or v_max_election_round<>v_prev_max_election_round
         or v_nc_completed<>v_prev_nc_completed
         or coalesce((v_nc_runtime->>'rankings_frozen')::integer,0)>0
         or coalesce((v_q_result->>'qualification_heats_processed')::integer,0)>0
         or coalesce((v_f_result->>'national_finals_processed')::integer,0)>0
         or v_overdue_ready_planned>0
         or v_commitment_conflicts>0
      then
        v_checkpoints:=v_checkpoints||jsonb_build_array(v_last_snapshot);
      end if;

      v_prev_active_coaches:=v_active_coaches;
      v_prev_open_elections:=v_open_elections;
      v_prev_max_election_round:=v_max_election_round;
      v_prev_nc_completed:=v_nc_completed;

      if v_day>=v_end_date then
        exit;
      end if;

      -- Never skip more than one week, and always stop on known lifecycle
      -- deadlines/events generated by the current shadow state.
      v_next_day:=least(
        v_end_date,
        v_day+7,
        (date_trunc('month',v_day)+interval '1 month')::date
      );

      select min(d) into v_next_event
      from (
        select ed.ranking_snapshot_date d
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.ranking_snapshot_date>v_day
          and ed.ranking_snapshot_date<=v_end_date

        union all
        select ed.participation_decision_deadline
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.participation_decision_deadline>v_day
          and ed.participation_decision_deadline<=v_end_date

        union all
        select ed.final_participation_decision_deadline
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.final_participation_decision_deadline>v_day
          and ed.final_participation_decision_deadline<=v_end_date

        union all
        select ed.final_date
        from public.national_championship_editions ed
        where ed.season_number=1
          and ed.final_date>v_day
          and ed.final_date<=v_end_date

        union all
        select h2.qualification_date
        from public.national_championship_heats h2
        join public.national_championship_editions ed2 on ed2.id=h2.edition_id
        where ed2.season_number=1
          and h2.qualification_date>v_day
          and h2.qualification_date<=v_end_date

        union all
        select case
          when ce.status='candidate_registration' then ce.registration_close_date
          else ce.current_round_close_date
        end
        from public.national_coach_elections ce
        where ce.season_number=1
          and ce.status in ('candidate_registration','voting','runoff')
          and case
            when ce.status='candidate_registration' then ce.registration_close_date
            else ce.current_round_close_date
          end > v_day
          and case
            when ce.status='candidate_registration' then ce.registration_close_date
            else ce.current_round_close_date
          end <= v_end_date

        union all
        select public.nations_field_lock_gate_v1(1)
      ) q
      where d>v_day and d<=v_end_date;

      if v_next_event is not null then
        v_next_day:=least(v_next_day,v_next_event);
      end if;

      if v_next_day<=v_day then
        v_next_day:=least(v_end_date,v_day+1);
      end if;

      v_day:=v_next_day;
    end loop;

    v_nc_overview:=public.national_championship_lifecycle_overview_v1();
    v_nations_health:=public.check_nations_operations_health_v1();
    v_assoc_integrity:=public.check_national_association_integrity_v1();

    select
      count(*)::integer,
      coalesce(jsonb_agg(
        jsonb_build_object(
          'country_code',ed.country_code,
          'route_status',ed.route_status,
          'lifecycle_issue_count',(x.item->>'issue_count')::integer,
          'current_step',x.item->>'current_step',
          'ranking_freeze',x.item->>'ranking_freeze',
          'invitations',x.item->>'invitations',
          'rider_locks',x.item->>'rider_locks',
          'qualification',x.item->>'qualification',
          'final_confirmation',x.item->>'final_confirmation',
          'final_startlist',x.item->>'final_startlist',
          'results',x.item->>'results'
        )
        order by ed.country_code
      ),'[]'::jsonb)
    into v_ready_lifecycle_issue_count,v_ready_lifecycle_issues
    from jsonb_array_elements(v_nc_overview->'editions') as x(item)
    join public.national_championship_editions ed
      on ed.season_number=1
     and ed.country_code=x.item->>'country_code'
     and ed.discipline='road'
    where ed.route_status='ready'
      and (x.item->>'issue_count')::integer>0;

    v_report:=jsonb_build_object(
      'status',
        case
          when v_overdue_ready_planned=0
           and v_commitment_conflicts=0
           and v_new_invalid_memberships=0
           and v_human_capable_without_coach=0
           and v_ready_lifecycle_issue_count=0
           and coalesce((v_nations_health->>'issues')::integer,0)=0
          then 'pass'
          else 'fail'
        end,
      'mode','rollback_midseason_migration_rehearsal_event_driven_fast_v4',
      'result_feed','deterministic run-scoped TypeScript-compatible fixture results',
      'typescript_race_engine_executed_here',false,
      'source_season',1,
      'start_game_date',v_start_date,
      'end_game_date',v_end_date,
      'calendar_days_covered',(v_end_date-v_start_date)+1,
      'processing_steps',v_processing_steps,
      'baseline_preexisting_issues',jsonb_build_object(
        'invalid_active_memberships',v_baseline_invalid_memberships
      ),
      'final_shadow_state',v_last_snapshot,
      'ready_route_lifecycle_issue_count',v_ready_lifecycle_issue_count,
      'ready_route_lifecycle_issues',v_ready_lifecycle_issues,
      'national_championship_lifecycle_summary',v_nc_overview->'summary',
      'nations_operations_health',v_nations_health,
      'national_association_integrity',v_assoc_integrity,
      'checkpoints',v_checkpoints
    );

    raise exception using
      errcode='ZMS04',
      message='MIDSEASON_NATIONAL_MIGRATION_SHADOW_V4_ROLLBACK';

  exception
    when sqlstate 'ZMS04' then
      null;
    when others then
      v_error:=sqlerrm;
      get stacked diagnostics
        v_error_detail=PG_EXCEPTION_DETAIL,
        v_error_hint=PG_EXCEPTION_HINT,
        v_error_context=PG_EXCEPTION_CONTEXT;

      v_report:=jsonb_build_object(
        'status','fail',
        'mode','rollback_midseason_migration_rehearsal_event_driven_fast_v4',
        'source_season',1,
        'start_game_date',v_start_date,
        'end_game_date',v_end_date,
        'phase','daily_runtime_or_fixture_result_handoff',
        'failed_on_or_before_game_date',v_day,
        'error',v_error,
        'error_detail',v_error_detail,
        'error_hint',v_error_hint,
        'error_context',v_error_context,
        'checkpoints',v_checkpoints
      );
  end;

  select to_jsonb(gs) into v_live_state_after
  from public.game_state gs
  where gs.id=true;

  v_live_preserved:=
    v_live_state_after=v_original_state
    and (select count(*) from public.national_associations)=v_baseline_associations
    and (select count(*) from public.nations_competition_editions where season_number=1)=v_baseline_editions
    and (select count(*) from public.national_championship_editions where season_number=1)=v_baseline_nc_editions
    and (select count(*) from public.national_coach_elections where season_number=1)=v_baseline_elections
    and (select count(*) from public.national_coach_terms where season_number=1)=v_baseline_coach_terms
    and (
      select count(*)
      from public.national_championship_entries en
      join public.national_championship_editions ed on ed.id=en.edition_id
      where ed.season_number=1
    )=v_baseline_nc_entries
    and (
      select count(*)
      from public.national_championship_duties d
      join public.national_championship_editions ed on ed.id=d.edition_id
      where ed.season_number=1
    )=v_baseline_nc_duties
    and (select count(*) from public.user_notifications)=v_baseline_notifications;

  return v_report||jsonb_build_object(
    'live_state_preserved',v_live_preserved,
    'live_game_state_before',v_original_state,
    'live_game_state_after',v_live_state_after
  );
end;
$function$


revoke all on function private.run_midseason_national_migration_shadow_v4(date) from public;
