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
      and en.club_id_snapshot is not null
      and (
        (p_event_type='qualification'
          and en.heat_id = p_heat_id
          and en.entry_status='qualification_assigned')
        or
        (p_event_type='final'
          and en.entry_status in ('direct_qualified','qualified','finalist'))
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
        and en.rider_id=selected.rider_id
        and en.club_id_snapshot=rp.club_id
        and (
          (p_event_type='qualification'
            and en.heat_id=p_heat_id
            and en.entry_status='qualification_assigned')
          or
          (p_event_type='final'
            and en.entry_status in ('direct_qualified','qualified','finalist'))
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
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
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
    and en.club_id_snapshot is not null
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
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
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
          )
      ),'{}'::jsonb),
      rider_roles_json = coalesce((
        select jsonb_object_agg(en.rider_id::text,to_jsonb('free_role'::text))
        from public.national_championship_entries en
        where en.edition_id=e.id
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
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
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
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
          and en.club_id_snapshot=rp.club_id
          and (
            (p_event_type='qualification'
              and en.heat_id=p_heat_id
              and en.entry_status='qualification_assigned')
            or
            (p_event_type='final'
              and en.entry_status in ('direct_qualified','qualified','finalist'))
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
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
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
    and (
      (p_event_type='qualification'
        and en.heat_id=p_heat_id
        and en.entry_status='qualification_assigned')
      or
      (p_event_type='final'
        and en.entry_status in ('direct_qualified','qualified','finalist'))
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
$function$;

CREATE OR REPLACE FUNCTION public.save_my_national_championship_rider_plan_v1(p_edition_id uuid, p_event_type text, p_rider_id uuid, p_equipment_setup_id uuid DEFAULT NULL::uuid, p_phase_1_command text DEFAULT 'ride_naturally'::text, p_phase_2_command text DEFAULT 'ride_naturally'::text, p_phase_3_command text DEFAULT 'ride_naturally'::text, p_phase_4_command text DEFAULT 'ride_naturally'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid;
  e public.national_championship_editions%rowtype;
  en public.national_championship_entries%rowtype;
  v_owner_club_id uuid;
  v_race_id uuid;
  v_stage_id uuid;
  v_stage_plan_id uuid;
  v_stage_plan_rider_id uuid;
  v_start_game_ts timestamp without time zone;
  v_bonus jsonb := '{}'::jsonb;
  v_plan_id uuid;
  v_allowed text[] := array[
    'ride_naturally',
    'conserve_energy',
    'stay_near_front',
    'join_breakaway',
    'attack',
    'chase_breakaway',
    'climb_hard',
    'sprint',
    'avoid_risks'
  ];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_event_type not in ('qualification','final') then
    raise exception 'Invalid event type';
  end if;

  if not (
    p_phase_1_command=any(v_allowed)
    and p_phase_2_command=any(v_allowed)
    and p_phase_3_command=any(v_allowed)
    and p_phase_4_command=any(v_allowed)
  ) then
    raise exception 'One or more tactic commands are not supported';
  end if;

  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  select * into en
  from public.national_championship_entries
  where edition_id=p_edition_id
    and rider_id=p_rider_id;

  if e.id is null or en.id is null then
    raise exception 'National championship rider entry not found';
  end if;

  if en.club_id_snapshot is null then
    raise exception 'This rider is not managed by a club';
  end if;

  v_owner_club_id := public.universal_race_resource_owner_club_v1(en.club_id_snapshot);

  if not exists (
    select 1
    from public.clubs c
    where c.id=v_owner_club_id
      and c.owner_user_id=v_user_id
  ) then
    raise exception 'You do not manage this rider';
  end if;

  if p_event_type='qualification' then
    if en.entry_path<>'qualification'
       or en.heat_id is null
       or en.entry_status not in ('qualification_assigned','qualified','finalist') then
      raise exception 'Rider is not assigned to national qualification';
    end if;

    select h.race_id into v_race_id
    from public.national_championship_heats h
    where h.id=en.heat_id;
  else
    if en.entry_status not in ('direct_qualified','qualified','finalist') then
      raise exception 'Rider is not qualified for the national final';
    end if;
    v_race_id := e.final_race_id;
  end if;

  if v_race_id is null then
    raise exception 'National championship race is not ready yet';
  end if;

  select
    s.id,
    s.stage_date::timestamp
      + make_interval(
          hours=>coalesce(s.planned_start_hour_number,12),
          mins=>coalesce(s.planned_start_minute,0)
        )
  into v_stage_id,v_start_game_ts
  from public.race_stages s
  where s.race_id=v_race_id
  order by s.stage_number
  limit 1;

  if v_stage_id is null then
    raise exception 'National championship stage not found';
  end if;

  if public.get_current_game_ts_local() >= v_start_game_ts then
    raise exception 'National Championship preparation is locked because the race has started';
  end if;

  if p_equipment_setup_id is not null then
    if not exists (
      select 1
      from public.club_equipment_setup_presets preset
      where preset.id=p_equipment_setup_id
        and preset.club_id in (en.club_id_snapshot,v_owner_club_id)
    ) then
      raise exception 'Equipment preset does not belong to this rider''s club';
    end if;

    select public.equipment_calculate_catalog_setup_bonus_preview(
      preset.frame_catalog_item_id,
      preset.wheelset_catalog_item_id,
      preset.tires_catalog_item_id,
      preset.groupset_catalog_item_id,
      preset.helmet_catalog_item_id,
      preset.shoes_catalog_item_id
    )
    into v_bonus
    from public.club_equipment_setup_presets preset
    where preset.id=p_equipment_setup_id;
  end if;

  insert into public.national_championship_rider_plans (
    edition_id,
    rider_id,
    event_type,
    heat_id,
    equipment_setup_id,
    phase_1_command,
    phase_2_command,
    phase_3_command,
    phase_4_command,
    updated_by_user_id
  )
  values (
    e.id,
    en.rider_id,
    p_event_type,
    case when p_event_type='qualification' then en.heat_id else null end,
    p_equipment_setup_id,
    p_phase_1_command,
    p_phase_2_command,
    p_phase_3_command,
    p_phase_4_command,
    v_user_id
  )
  on conflict (edition_id,rider_id,event_type) do update
    set heat_id=excluded.heat_id,
        equipment_setup_id=excluded.equipment_setup_id,
        phase_1_command=excluded.phase_1_command,
        phase_2_command=excluded.phase_2_command,
        phase_3_command=excluded.phase_3_command,
        phase_4_command=excluded.phase_4_command,
        updated_by_user_id=excluded.updated_by_user_id,
        updated_at=now()
  returning id into v_plan_id;

  select sp.id into v_stage_plan_id
  from public.race_preparations rp
  join public.race_stage_plans sp
    on sp.race_preparation_id=rp.id
   and sp.stage_id=v_stage_id
  where rp.race_id=v_race_id
    and rp.club_id=en.club_id_snapshot
  limit 1;

  if v_stage_plan_id is null then
    perform public.national_championship_sync_race_participants_v1(
      e.id,
      p_event_type,
      case when p_event_type='qualification' then en.heat_id else null end
    );

    select sp.id into v_stage_plan_id
    from public.race_preparations rp
    join public.race_stage_plans sp
      on sp.race_preparation_id=rp.id
     and sp.stage_id=v_stage_id
    where rp.race_id=v_race_id
      and rp.club_id=en.club_id_snapshot
    limit 1;
  end if;

  if v_stage_plan_id is null then
    raise exception 'National Championship rider plan shell is unavailable';
  end if;

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
  values (
    v_stage_plan_id,
    en.rider_id,
    'free_role',
    'balanced',
    'normal',
    'normal',
    p_equipment_setup_id,
    jsonb_build_object(
      'national_championship',true,
      'event_type',p_event_type,
      'national_rank',en.national_rank
    ),
    coalesce(v_bonus,'{}'::jsonb),
    coalesce(v_bonus,'{}'::jsonb),
    jsonb_build_object(
      'national_championship',true,
      'saved_by_user',true
    )
  )
  on conflict (race_stage_plan_id,rider_id) do update
    set stage_role='free_role',
        tactic='balanced',
        equipment_setup_id=excluded.equipment_setup_id,
        equipment_bonus_snapshot_json=excluded.equipment_bonus_snapshot_json,
        final_bonus_snapshot_json=excluded.final_bonus_snapshot_json,
        metadata=public.race_stage_plan_riders.metadata||excluded.metadata,
        updated_at=now()
  returning id into v_stage_plan_rider_id;

  update public.race_stage_plans
  set rider_individual_tactics_json =
        jsonb_set(
          coalesce(rider_individual_tactics_json,'{}'::jsonb),
          array[en.rider_id::text],
          jsonb_build_object(
            'phase_1',jsonb_build_object('command',p_phase_1_command),
            'phase_2',jsonb_build_object('command',p_phase_2_command),
            'phase_3',jsonb_build_object('command',p_phase_3_command),
            'phase_4',jsonb_build_object('command',p_phase_4_command)
          ),
          true
        ),
      rider_equipment_json =
        case
          when p_equipment_setup_id is null then
            coalesce(rider_equipment_json,'{}'::jsonb) - en.rider_id::text
          else
            jsonb_set(
              coalesce(rider_equipment_json,'{}'::jsonb),
              array[en.rider_id::text],
              to_jsonb(p_equipment_setup_id::text),
              true
            )
        end,
      team_strategy='balanced',
      team_tactic_json=jsonb_build_object(
        'plan','balanced',
        'internal_neutral_placeholder',true,
        'team_commands_enabled',false,
        'notes','National Championship: every rider competes independently'
      ),
      rider_supplies_json=coalesce(rider_supplies_json,'{}'::jsonb),
      last_saved_at=now(),
      last_saved_game_ts=public.get_current_game_ts_local(),
      updated_at=now()
  where id=v_stage_plan_id;

  return jsonb_build_object(
    'success',true,
    'plan_id',v_plan_id,
    'edition_id',e.id,
    'event_type',p_event_type,
    'rider_id',en.rider_id,
    'race_id',v_race_id,
    'stage_id',v_stage_id,
    'equipment_setup_id',p_equipment_setup_id,
    'phase_1_command',p_phase_1_command,
    'phase_2_command',p_phase_2_command,
    'phase_3_command',p_phase_3_command,
    'phase_4_command',p_phase_4_command,
    'team_strategy','individual_only',
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
  );
end;
$function$;
