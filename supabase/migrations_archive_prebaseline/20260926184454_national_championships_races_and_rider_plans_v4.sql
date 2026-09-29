
alter table public.national_championship_config
  add column if not exists organizer_supplies jsonb not null
  default jsonb_build_object(
    'bidons_water_bottles', 8,
    'energy_gels', 6,
    'nutrition_packs', 2,
    'race_jersey_complete', 1,
    'rain_jacket', 'provided_if_needed'
  );

create table if not exists public.national_championship_rider_plans (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  event_type text not null check (event_type in ('qualification','final')),
  heat_id uuid references public.national_championship_heats(id) on delete cascade,
  equipment_setup_id uuid references public.club_equipment_setup_presets(id) on delete set null,
  phase_1_command text not null default 'follow_team_plan',
  phase_2_command text not null default 'follow_team_plan',
  phase_3_command text not null default 'follow_team_plan',
  phase_4_command text not null default 'follow_team_plan',
  updated_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, rider_id, event_type)
);

create index if not exists national_championship_rider_plans_rider_idx
  on public.national_championship_rider_plans(rider_id, edition_id);
create index if not exists national_championship_rider_plans_heat_idx
  on public.national_championship_rider_plans(heat_id)
  where heat_id is not null;
create index if not exists national_championship_rider_plans_equipment_idx
  on public.national_championship_rider_plans(equipment_setup_id)
  where equipment_setup_id is not null;

alter table public.national_championship_rider_plans enable row level security;
revoke all on public.national_championship_rider_plans from anon, authenticated;
grant select on public.national_championship_rider_plans to authenticated;

drop policy if exists national_championship_rider_plans_owner_read
  on public.national_championship_rider_plans;

create policy national_championship_rider_plans_owner_read
  on public.national_championship_rider_plans
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.national_championship_entries entry
      join public.clubs rider_club
        on rider_club.id = entry.club_id_snapshot
      join public.clubs owner_club
        on owner_club.id = case
          when rider_club.club_type = 'developing'
               and rider_club.parent_club_id is not null
            then rider_club.parent_club_id
          else rider_club.id
        end
      where entry.edition_id = national_championship_rider_plans.edition_id
        and entry.rider_id = national_championship_rider_plans.rider_id
        and owner_club.owner_user_id = (select auth.uid())
    )
  );

create table if not exists public.national_championship_ranking_bonus_awards (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.national_championship_editions(id) on delete cascade,
  rider_id uuid not null references public.riders(id) on delete cascade,
  rank integer not null check (rank >= 1),
  points integer not null check (points >= 0),
  award_date date not null,
  created_at timestamptz not null default now(),
  unique (edition_id, rider_id)
);

create index if not exists national_championship_bonus_rider_date_idx
  on public.national_championship_ranking_bonus_awards(rider_id, award_date desc);

alter table public.national_championship_ranking_bonus_awards enable row level security;
revoke all on public.national_championship_ranking_bonus_awards from anon, authenticated;
grant select on public.national_championship_ranking_bonus_awards to authenticated;

drop policy if exists national_championship_bonus_read
  on public.national_championship_ranking_bonus_awards;
create policy national_championship_bonus_read
  on public.national_championship_ranking_bonus_awards
  for select to authenticated using (true);

create unique index if not exists national_championship_result_history_unique_result_idx
  on public.national_championship_result_history(
    edition_id,
    event_type,
    coalesce(heat_id, '00000000-0000-0000-0000-000000000000'::uuid),
    rider_id
  )
  where rider_id is not null;

create or replace function public.national_championship_profile_kind_v1(
  p_country_code text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when ((pg_catalog.hashtextextended(upper(trim(coalesce(p_country_code,''))), 17) % 3) + 3) % 3 = 0
      then 'flat'
    when ((pg_catalog.hashtextextended(upper(trim(coalesce(p_country_code,''))), 17) % 3) + 3) % 3 = 1
      then 'hilly'
    else 'mountain'
  end;
$$;

create or replace function public.national_championship_profile_points_v1(
  p_distance_km numeric,
  p_profile_kind text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_profile_kind,'hilly'))
    when 'flat' then jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',90),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',115),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',85),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',150),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',105),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',165),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',100),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',175),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',105),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',135),
      jsonb_build_object('km',p_distance_km,'elevation_m',100)
    )
    when 'mountain' then jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',240),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',420),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',980),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',510),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',1380),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',620),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',1720),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',850),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',1940),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',1180),
      jsonb_build_object('km',p_distance_km,'elevation_m',720)
    )
    else jsonb_build_array(
      jsonb_build_object('km',0,'elevation_m',120),
      jsonb_build_object('km',round(p_distance_km*0.10,1),'elevation_m',280),
      jsonb_build_object('km',round(p_distance_km*0.20,1),'elevation_m',155),
      jsonb_build_object('km',round(p_distance_km*0.30,1),'elevation_m',470),
      jsonb_build_object('km',round(p_distance_km*0.40,1),'elevation_m',210),
      jsonb_build_object('km',round(p_distance_km*0.50,1),'elevation_m',610),
      jsonb_build_object('km',round(p_distance_km*0.60,1),'elevation_m',260),
      jsonb_build_object('km',round(p_distance_km*0.70,1),'elevation_m',720),
      jsonb_build_object('km',round(p_distance_km*0.80,1),'elevation_m',320),
      jsonb_build_object('km',round(p_distance_km*0.90,1),'elevation_m',560),
      jsonb_build_object('km',p_distance_km,'elevation_m',190)
    )
  end;
$$;

create or replace function public.preview_national_ranking_v1(
  p_country_code text,
  p_snapshot_date date
)
returns table (
  national_rank integer,
  rider_id uuid,
  club_id uuid,
  rider_name text,
  country_code text,
  raw_points integer,
  weighted_points numeric,
  best_weighted_result numeric,
  latest_result_date date,
  overall integer
)
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select *
    from public.national_championship_config
    where id = true
  ),
  award_events as (
    select
      a.rider_id,
      a.rider_points::integer as rider_points,
      coalesce(rs.stage_date, rr.end_date) as performance_date
    from public.race_ranking_point_awards a
    join public.races rr on rr.id = a.race_id
    left join public.race_stages rs on rs.id = a.stage_id
    where a.rider_id is not null
      and a.rider_points > 0

    union all

    select
      b.rider_id,
      b.points::integer,
      b.award_date
    from public.national_championship_ranking_bonus_awards b
    where b.points > 0
  ),
  perf as (
    select
      ae.rider_id,
      coalesce(sum(ae.rider_points),0)::int as raw_points,
      coalesce(sum(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as weighted_points,
      coalesce(max(
        ae.rider_points::numeric *
        case
          when (p_snapshot_date - ae.performance_date) between 0 and 30 then cfg.recency_weight_days_0_30
          when (p_snapshot_date - ae.performance_date) between 31 and 60 then cfg.recency_weight_days_31_60
          when (p_snapshot_date - ae.performance_date) between 61 and 90 then cfg.recency_weight_days_61_90
          when (p_snapshot_date - ae.performance_date) between 91 and 120 then cfg.recency_weight_days_91_120
          when (p_snapshot_date - ae.performance_date) between 121 and 180 then cfg.recency_weight_days_121_180
          else 0
        end
      ),0)::numeric(14,3) as best_weighted_result,
      max(ae.performance_date) as latest_result_date
    from award_events ae
    cross join cfg
    where ae.performance_date <= p_snapshot_date
      and ae.performance_date > p_snapshot_date - cfg.ranking_window_days
    group by ae.rider_id
  ),
  base as (
    select
      r.id as rider_id,
      club.club_id,
      coalesce(nullif(trim(r.first_name || ' ' || r.last_name),''), r.display_name, r.id::text) as rider_name,
      upper(r.country_code) as country_code,
      coalesce(perf.raw_points,0)::int as raw_points,
      coalesce(perf.weighted_points,0)::numeric(14,3) as weighted_points,
      coalesce(perf.best_weighted_result,0)::numeric(14,3) as best_weighted_result,
      perf.latest_result_date,
      coalesce(r.overall,0)::int as overall
    from public.riders r
    left join perf on perf.rider_id = r.id
    left join lateral (
      select cr.club_id
      from public.club_riders cr
      where cr.rider_id = r.id
      order by cr.created_at desc, cr.id desc
      limit 1
    ) club on true
    where upper(r.country_code) = upper(trim(p_country_code))
  )
  select
    row_number() over (
      order by
        weighted_points desc,
        best_weighted_result desc,
        latest_result_date desc nulls last,
        overall desc,
        rider_id
    )::int as national_rank,
    rider_id,
    club_id,
    rider_name,
    country_code,
    raw_points,
    weighted_points,
    best_weighted_result,
    latest_result_date,
    overall
  from base
  order by national_rank;
$$;

revoke execute on function public.preview_national_ranking_v1(text,date)
  from public, anon, authenticated;
grant execute on function public.preview_national_ranking_v1(text,date)
  to service_role;

create or replace function public.race_team_stage_jersey_shortage_penalty_v1(
  p_stage_id uuid,
  p_team_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with stage_context as (
    select coalesce(r.metadata,'{}'::jsonb) as race_metadata
    from public.race_stages s
    join public.races r on r.id = s.race_id
    where s.id = p_stage_id
  )
  select case
    when coalesce((select (race_metadata->>'national_championship')::boolean from stage_context),false)
      then jsonb_build_object(
        'applies',false,
        'required_jersey_units',0,
        'available_jersey_units',0,
        'missing_jersey_units',0,
        'shortage_ratio',0,
        'preparation_bonus_reduction_pct',0,
        'energy_cost_penalty_pct',0,
        'post_stage_fatigue_penalty_pct',0,
        'rule','national_championship_organizer_kit_v1'
      )
    else (
      select jsonb_build_object(
        'applies',coalesce((e->>'missing_jersey_units')::integer,0)>0,
        'required_jersey_units',coalesce((e->>'required_jersey_units')::integer,0),
        'available_jersey_units',coalesce((e->>'effective_available_jersey_units')::integer,0),
        'missing_jersey_units',coalesce((e->>'missing_jersey_units')::integer,0),
        'shortage_ratio',coalesce((e->>'jersey_shortage_ratio')::numeric,0),
        'preparation_bonus_reduction_pct',coalesce((e->>'preparation_bonus_reduction_pct')::numeric,0),
        'energy_cost_penalty_pct',coalesce((e->>'energy_cost_penalty_pct')::numeric,0),
        'post_stage_fatigue_penalty_pct',coalesce((e->>'post_stage_fatigue_penalty_pct')::numeric,0),
        'rule','optional_race_jersey_performance_penalty_v1'
      )
      from (select public.race_team_stage_eligibility_v1(p_stage_id,p_team_id) e) x
    )
  end;
$$;

create or replace function public.national_championship_sync_race_participants_v1(
  p_edition_id uuid,
  p_event_type text,
  p_heat_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    case
      when r.role::text ilike '%sprinter%' then 'sprinter'
      when r.role::text ilike '%climb%' then 'climber'
      when r.role::text ilike '%break%' then 'breakaway'
      else 'free_role'
    end,
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
    set equipment_setup_id=excluded.equipment_setup_id,
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
            'phase_1',jsonb_build_object('command',coalesce(plan.phase_1_command,'follow_team_plan')),
            'phase_2',jsonb_build_object('command',coalesce(plan.phase_2_command,'follow_team_plan')),
            'phase_3',jsonb_build_object('command',coalesce(plan.phase_3_command,'follow_team_plan')),
            'phase_4',jsonb_build_object('command',coalesce(plan.phase_4_command,'follow_team_plan'))
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
      rider_equipment_json = coalesce((
        select jsonb_object_agg(
          en.rider_id::text,
          plan.equipment_setup_id::text
        ) filter (where plan.equipment_setup_id is not null)
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
      team_tactic_json=jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
      rider_supplies_json='{}'::jsonb,
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
  select distinct on (team_key)
    v_race_id,
    team_key,
    'accepted',
    team_name,
    logo_url,
    team_country_code,
    national_rank,
    now(),
    now()
  from (
    select
      coalesce(en.club_id_snapshot,en.rider_id) as team_key,
      coalesce(c.name,'Independent — '||en.rider_name_snapshot) as team_name,
      c.logo_path as logo_url,
      coalesce(c.country_code,en.country_code_snapshot) as team_country_code,
      en.national_rank
    from public.national_championship_entries en
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
    order by coalesce(en.club_id_snapshot,en.rider_id),en.national_rank
  ) participant_teams
  order by team_key,national_rank;

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
    coalesce(en.club_id_snapshot,en.rider_id),
    en.rider_id,
    en.rider_name_snapshot,
    coalesce(c.name,'Independent'),
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
$$;

create or replace function public.national_championship_ensure_event_race_v1(
  p_edition_id uuid,
  p_event_type text,
  p_heat_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  h public.national_championship_heats%rowtype;
  v_race_id uuid;
  v_stage_id uuid;
  v_date date;
  v_country_name text;
  v_profile_kind text;
  v_distance numeric;
  v_elevation integer;
  v_hour integer;
  v_minute integer := 0;
  v_name text;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id
  for update;

  if e.id is null then
    raise exception 'National championship edition not found: %', p_edition_id;
  end if;

  select coalesce(c.name,e.country_code)
  into v_country_name
  from public.countries c
  where c.code=e.country_code;

  v_country_name := coalesce(v_country_name,e.country_code);
  v_profile_kind := public.national_championship_profile_kind_v1(e.country_code);

  if p_event_type='qualification' then
    select * into h
    from public.national_championship_heats
    where id=p_heat_id and edition_id=e.id
    for update;

    if h.id is null then
      raise exception 'Qualification heat not found: %',p_heat_id;
    end if;

    if h.race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'qualification',h.id);
      return h.race_id;
    end if;

    v_date := e.qualification_date;
    v_distance := case v_profile_kind
      when 'flat' then 125
      when 'mountain' then 135
      else 130
    end;
    v_elevation := case v_profile_kind
      when 'flat' then 650
      when 'mountain' then 2800
      else 1600
    end;
    v_hour := 8
      + ((((pg_catalog.hashtextextended(e.country_code,29) % 4)+4)%4)::int)
      + ((h.heat_number-1)/2);
    v_minute := case when mod(h.heat_number-1,2)=0 then 0 else 30 end;
    v_name := v_country_name||' National Championship Qualification — Heat '||h.heat_number;
  elsif p_event_type='final' then
    if e.final_race_id is not null then
      perform public.national_championship_sync_race_participants_v1(e.id,'final',null);
      return e.final_race_id;
    end if;

    v_date := e.final_date;
    v_distance := case v_profile_kind
      when 'flat' then 190
      when 'mountain' then 200
      else 195
    end;
    v_elevation := case v_profile_kind
      when 'flat' then 900
      when 'mountain' then 3900
      else 2400
    end;
    v_hour := 11
      + ((((pg_catalog.hashtextextended(e.country_code,31) % 4)+4)%4)::int);
    v_minute := 0;
    v_name := v_country_name||' National Road Championship';
  else
    raise exception 'Invalid national championship event type: %',p_event_type;
  end if;

  insert into public.races (
    name,
    short_name,
    start_date,
    end_date,
    country_code,
    host_city,
    category,
    race_type,
    is_stage_race,
    stage_count,
    status,
    description,
    metadata,
    planned_start_hour_number,
    planned_start_minute,
    planned_start_time_label,
    planned_start_assigned_at
  )
  values (
    v_name,
    case when p_event_type='final'
      then e.country_code||' NC'
      else e.country_code||' NCQ H'||h.heat_number
    end,
    v_date,
    v_date,
    e.country_code,
    v_country_name,
    case when p_event_type='final' then 'NC' else 'NCQ' end,
    'one_day',
    false,
    1,
    'scheduled',
    case when p_event_type='final'
      then 'National road championship. Entry is earned through the National Ranking and qualification system.'
      else 'National championship qualification heat. Top finishers advance to the national final.'
    end,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'heat_id',case when p_event_type='qualification' then h.id else null end,
      'country_code',e.country_code,
      'profile_kind',v_profile_kind,
      'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
      'preparation_mode','rider_equipment_and_individual_tactics_only',
      'team_strategy_locked','balanced',
      'staff_assets_supplies_locked',true
    ),
    v_hour,
    v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now()
  )
  returning id into v_race_id;

  insert into public.race_stages (
    race_id,
    stage_number,
    stage_date,
    name,
    start_city,
    finish_city,
    host_city,
    host_country_code,
    distance_km,
    terrain_type,
    finish_type,
    is_summit_finish,
    flat_pct,
    hilly_pct,
    mountain_pct,
    cobbled_pct,
    elevation_gain_m,
    metadata,
    start_city_name,
    finish_city_name,
    profile_type,
    notes,
    planned_start_hour_number,
    planned_start_minute,
    planned_start_time_label,
    planned_start_assigned_at,
    stage_format
  )
  values (
    v_race_id,
    1,
    v_date,
    case when p_event_type='final' then 'National Championship' else 'Qualification Heat '||h.heat_number end,
    v_country_name||' Championship Circuit',
    v_country_name||' Championship Circuit',
    v_country_name,
    case when exists(select 1 from public.countries c where c.code=e.country_code) then e.country_code else null end,
    v_distance,
    v_profile_kind,
    'flat_finish',
    false,
    case v_profile_kind when 'flat' then 75 when 'mountain' then 15 else 30 end,
    case v_profile_kind when 'flat' then 25 when 'mountain' then 35 else 60 end,
    case v_profile_kind when 'flat' then 0 when 'mountain' then 50 else 10 end,
    0,
    v_elevation,
    jsonb_build_object(
      'national_championship',true,
      'edition_id',e.id,
      'event_type',p_event_type,
      'profile_kind',v_profile_kind
    ),
    v_country_name||' Championship Circuit',
    v_country_name||' Championship Circuit',
    case v_profile_kind when 'flat' then 'sprinter' when 'mountain' then 'mountain' else 'hilly' end,
    'Deterministic national championship course generated for this country and season.',
    v_hour,
    v_minute,
    lpad(v_hour::text,2,'0')||':'||lpad(v_minute::text,2,'0'),
    now(),
    'road_race'
  )
  returning id into v_stage_id;

  insert into public.race_stage_profile_details (
    stage_id,
    race_id,
    stage_title,
    route_label,
    stage_summary,
    distance_km,
    elevation_gain_m,
    terrain_type,
    profile_type,
    terrain_split,
    profile_points,
    route_markers,
    intermediate_sprints,
    mountain_climbs,
    metadata
  )
  values (
    v_stage_id,
    v_race_id,
    v_name,
    v_country_name||' Championship Circuit',
    case v_profile_kind
      when 'flat' then 'Fast national championship circuit with repeated rolling rises.'
      when 'mountain' then 'Demanding national championship route with several major climbing sectors.'
      else 'Selective national championship course with repeated hills and technical transitions.'
    end,
    v_distance,
    v_elevation,
    v_profile_kind,
    case v_profile_kind when 'flat' then 'sprinter' when 'mountain' then 'mountain' else 'hilly' end,
    jsonb_build_object(
      'flat',case v_profile_kind when 'flat' then 75 when 'mountain' then 15 else 30 end,
      'hilly',case v_profile_kind when 'flat' then 25 when 'mountain' then 35 else 60 end,
      'mountain',case v_profile_kind when 'flat' then 0 when 'mountain' then 50 else 10 end,
      'cobbled',0
    ),
    public.national_championship_profile_points_v1(v_distance,v_profile_kind),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    jsonb_build_object(
      'national_championship',true,
      'generated_profile_version','national_championship_profile_v1'
    )
  )
  on conflict (stage_id) do update
    set distance_km=excluded.distance_km,
        elevation_gain_m=excluded.elevation_gain_m,
        terrain_type=excluded.terrain_type,
        profile_type=excluded.profile_type,
        terrain_split=excluded.terrain_split,
        profile_points=excluded.profile_points,
        metadata=public.race_stage_profile_details.metadata||excluded.metadata,
        updated_at=now();

  insert into public.race_entry_rules (
    race_id,
    race_class_code,
    target_teams,
    min_teams,
    max_teams,
    min_riders_per_team,
    max_riders_per_team,
    applications_open_game_date,
    applications_close_game_date,
    applications_status,
    auto_close_when_full,
    allow_waitlist,
    prize_fund_cash,
    prize_fund_source,
    metadata,
    race_season_number,
    race_start_month_number,
    race_start_day_number,
    application_window_policy,
    rider_submission_deadline
  )
  values (
    v_race_id,
    '1.1',
    20,
    2,
    200,
    1,
    120,
    v_date-1,
    v_date-1,
    'closed',
    true,
    false,
    0,
    'manual_override',
    jsonb_build_object(
      'national_championship',true,
      'applications_disabled',true,
      'automatic_entry',true
    ),
    e.season_number,
    extract(month from v_date)::int,
    extract(day from v_date)::int,
    'standard_90_3',
    v_date
  );

  if p_event_type='qualification' then
    update public.national_championship_heats
    set race_id=v_race_id,status='ready',updated_at=now()
    where id=h.id;
  else
    update public.national_championship_editions
    set final_race_id=v_race_id,updated_at=now()
    where id=e.id;
  end if;

  perform public.national_championship_sync_race_participants_v1(
    e.id,
    p_event_type,
    case when p_event_type='qualification' then h.id else null end
  );

  return v_race_id;
end;
$$;

create or replace function public.national_championship_ensure_races_v1(
  p_edition_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  e public.national_championship_editions%rowtype;
  h record;
  v_final uuid;
  v_heat_count integer := 0;
begin
  select * into e
  from public.national_championship_editions
  where id=p_edition_id;

  if e.id is null then
    raise exception 'National championship edition not found: %',p_edition_id;
  end if;

  if e.status='planned' then
    return jsonb_build_object('status','waiting_for_ranking_freeze','edition_id',e.id);
  end if;

  for h in
    select id from public.national_championship_heats
    where edition_id=e.id
    order by heat_number
  loop
    perform public.national_championship_ensure_event_race_v1(e.id,'qualification',h.id);
    v_heat_count := v_heat_count+1;
  end loop;

  v_final := public.national_championship_ensure_event_race_v1(e.id,'final',null);

  update public.national_championship_editions
  set status=case
        when qualification_heat_count>0 then 'qualification_pending'
        else 'final_ready'
      end,
      updated_at=now()
  where id=e.id
    and status='ranking_frozen';

  return jsonb_build_object(
    'status','races_ready',
    'edition_id',e.id,
    'qualification_races',v_heat_count,
    'final_race_id',v_final
  );
end;
$$;

create or replace function public.save_my_national_championship_rider_plan_v1(
  p_edition_id uuid,
  p_event_type text,
  p_rider_id uuid,
  p_equipment_setup_id uuid default null,
  p_phase_1_command text default 'follow_team_plan',
  p_phase_2_command text default 'follow_team_plan',
  p_phase_3_command text default 'follow_team_plan',
  p_phase_4_command text default 'follow_team_plan'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
    'follow_team_plan',
    'conserve_energy',
    'stay_near_front',
    'control_tempo',
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
    set equipment_setup_id=excluded.equipment_setup_id,
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
      team_tactic_json=jsonb_build_object('plan','balanced','notes','National Championship: individual tactics only'),
      rider_supplies_json='{}'::jsonb,
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
    'team_strategy','balanced',
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true)
  );
end;
$$;

revoke execute on function public.save_my_national_championship_rider_plan_v1(
  uuid,text,uuid,uuid,text,text,text,text
) from public,anon;
grant execute on function public.save_my_national_championship_rider_plan_v1(
  uuid,text,uuid,uuid,text,text,text,text
) to authenticated;

create or replace function public.get_national_ranking_page_v1(
  p_country_code text default null,
  p_season_number integer default null,
  p_limit integer default 200
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_season integer;
  v_game_date date;
  v_country text;
  e public.national_championship_editions%rowtype;
  v_has_snapshot boolean := false;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select
    gs.season_number,
    public.game_date_from_parts(gs.season_number,gs.month_number,gs.day_number)
  into v_season,v_game_date
  from public.game_state gs
  where gs.id=true;

  v_season:=coalesce(p_season_number,v_season);

  v_country:=upper(nullif(trim(p_country_code),''));

  if v_country is null then
    select upper(c.country_code)
    into v_country
    from public.clubs c
    where c.owner_user_id=v_user_id
      and c.parent_club_id is null
    order by c.created_at
    limit 1;
  end if;

  if v_country is null then
    select country_code into v_country
    from public.national_championship_editions
    where season_number=v_season
    order by country_code
    limit 1;
  end if;

  select * into e
  from public.national_championship_editions
  where season_number=v_season
    and country_code=v_country
    and discipline='road'
  limit 1;

  if e.id is not null then
    select exists(
      select 1
      from public.national_championship_ranking_snapshots s
      where s.edition_id=e.id
    ) into v_has_snapshot;
  end if;

  return jsonb_build_object(
    'season_number',v_season,
    'current_game_date',v_game_date,
    'country_code',v_country,
    'countries',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code',x.country_code,
          'name',coalesce(c.name,x.country_code),
          'status',x.status,
          'final_date',x.final_date
        )
        order by coalesce(c.name,x.country_code)
      )
      from public.national_championship_editions x
      left join public.countries c on c.code=x.country_code
      where x.season_number=v_season
        and x.discipline='road'
    ),'[]'::jsonb),
    'edition',case when e.id is null then null else to_jsonb(e) end,
    'organizer_supplies',(select c.organizer_supplies from public.national_championship_config c where c.id=true),
    'preparation_mode',jsonb_build_object(
      'automatic_entry',true,
      'staff_locked',true,
      'assets_locked',true,
      'club_supplies_locked',true,
      'team_strategy_locked','balanced',
      'rider_equipment_editable',true,
      'individual_tactics_editable',true
    ),
    'ranking_is_frozen',v_has_snapshot,
    'ranking',coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select
          s.national_rank,
          s.rider_id,
          s.club_id,
          s.rider_name_snapshot as rider_name,
          s.country_code_snapshot as country_code,
          s.raw_points,
          s.weighted_points,
          s.best_weighted_result,
          s.latest_result_date,
          s.overall_snapshot as overall
        from public.national_championship_ranking_snapshots s
        where v_has_snapshot
          and s.edition_id=e.id
        order by s.national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(to_jsonb(r) order by r.national_rank)
      from (
        select *
        from public.preview_national_ranking_v1(
          v_country,
          least(v_game_date,e.ranking_snapshot_date)
        )
        order by national_rank
        limit greatest(1,least(coalesce(p_limit,200),500))
      ) r
    ),'[]'::jsonb) end),
    'heats',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',h.id,
          'heat_number',h.heat_number,
          'qualification_date',h.qualification_date,
          'qualifying_places',h.qualifying_places,
          'assigned_count',h.assigned_count,
          'race_id',h.race_id,
          'status',h.status
        )
        order by h.heat_number
      )
      from public.national_championship_heats h
      where h.edition_id=e.id
    ),'[]'::jsonb) end,
    'my_entries',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'entry_id',en.id,
          'rider_id',en.rider_id,
          'rider_name',en.rider_name_snapshot,
          'national_rank',en.national_rank,
          'entry_path',en.entry_path,
          'entry_status',en.entry_status,
          'heat_id',en.heat_id,
          'heat_number',en.heat_number,
          'qualification_race_id',h.race_id,
          'final_race_id',e.final_race_id,
          'qualification_plan',to_jsonb(qp),
          'final_plan',to_jsonb(fp),
          'club_id',en.club_id_snapshot,
          'club_name',rider_club.name
        )
        order by en.national_rank
      )
      from public.national_championship_entries en
      join public.clubs rider_club on rider_club.id=en.club_id_snapshot
      join public.clubs owner_club
        on owner_club.id=case
          when rider_club.club_type='developing'
               and rider_club.parent_club_id is not null
            then rider_club.parent_club_id
          else rider_club.id
        end
      left join public.national_championship_heats h on h.id=en.heat_id
      left join public.national_championship_rider_plans qp
        on qp.edition_id=en.edition_id
       and qp.rider_id=en.rider_id
       and qp.event_type='qualification'
      left join public.national_championship_rider_plans fp
        on fp.edition_id=en.edition_id
       and fp.rider_id=en.rider_id
       and fp.event_type='final'
      where en.edition_id=e.id
        and owner_club.owner_user_id=v_user_id
    ),'[]'::jsonb) end,
    'equipment_presets',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',p.id,
          'club_id',p.club_id,
          'setup_name',p.setup_name,
          'setup_slot',p.setup_slot
        )
        order by p.club_id,p.setup_slot
      )
      from public.club_equipment_setup_presets p
      join public.clubs c on c.id=p.club_id
      left join public.clubs parent on parent.id=c.parent_club_id
      where c.owner_user_id=v_user_id
         or parent.owner_user_id=v_user_id
    ),'[]'::jsonb),
    'results',case when e.id is null then '[]'::jsonb else coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'event_type',rh.event_type,
          'heat_id',rh.heat_id,
          'rider_id',rh.rider_id,
          'rider_name',rh.rider_name_snapshot,
          'club_id',rh.club_id_snapshot,
          'club_name',rh.club_name_snapshot,
          'rank',rh.rank,
          'status',rh.status,
          'race_id',rh.race_id
        )
        order by
          case when rh.event_type='final' then 0 else 1 end,
          coalesce(h.heat_number,0),
          rh.rank
      )
      from public.national_championship_result_history rh
      left join public.national_championship_heats h on h.id=rh.heat_id
      where rh.edition_id=e.id
    ),'[]'::jsonb) end,
    'past_champions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.season_number desc)
      from (
        select
          pe.season_number,
          pe.country_code,
          pe.champion_rider_id,
          pe.champion_name_snapshot,
          pe.champion_club_id,
          pe.champion_club_name_snapshot,
          pe.final_race_id
        from public.national_championship_editions pe
        where pe.country_code=v_country
          and pe.discipline='road'
          and pe.status='completed'
          and pe.champion_rider_id is not null
        order by pe.season_number desc
        limit 10
      ) x
    ),'[]'::jsonb)
  );
end;
$$;

revoke execute on function public.get_national_ranking_page_v1(text,integer,integer)
  from public,anon;
grant execute on function public.get_national_ranking_page_v1(text,integer,integer)
  to authenticated;

create or replace view public.rider_current_national_champion_v1
with (security_invoker=true)
as
select
  e.champion_rider_id as rider_id,
  e.country_code,
  e.season_number,
  e.final_race_id,
  e.champion_name_snapshot,
  e.completed_at
from public.national_championship_editions e
where e.status='completed'
  and e.champion_rider_id is not null;

grant select on public.rider_current_national_champion_v1 to authenticated;

create or replace function public.get_rider_national_championship_titles_v1(
  p_rider_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id:=auth.uid();
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'season_number',e.season_number,
        'country_code',e.country_code,
        'final_race_id',e.final_race_id,
        'completed_at',e.completed_at
      )
      order by e.season_number desc
    )
    from public.national_championship_editions e
    where e.champion_rider_id=p_rider_id
      and e.status='completed'
  ),'[]'::jsonb);
end;
$$;

revoke execute on function public.get_rider_national_championship_titles_v1(uuid)
  from public,anon;
grant execute on function public.get_rider_national_championship_titles_v1(uuid)
  to authenticated;

create or replace function public.get_race_preparation_blocked_resources_v1(
  p_club_id uuid,
  p_race_id uuid,
  p_exclude_race_preparation_id uuid default null::uuid
)
returns table(
  resource_type text,
  resource_id uuid,
  asset_key text,
  asset_slot_key text,
  blocking_race_preparation_id uuid,
  blocking_race_id uuid,
  blocking_race_name text,
  blocking_start_date date,
  blocking_end_date date
)
language sql
stable
security definer
set search_path to 'public'
as $$
with target_race as (
  select
    r.id,
    r.start_date::date as start_date,
    coalesce(r.end_date::date, r.start_date::date) as end_date
  from public.races r
  where r.id = p_race_id
),
overlapping_preps as (
  select
    rp.id as race_preparation_id,
    rp.race_id,
    r.name as race_name,
    r.start_date::date as start_date,
    coalesce(r.end_date::date, r.start_date::date) as end_date
  from public.race_preparations rp
  join public.races r on r.id = rp.race_id
  cross join target_race tr
  where rp.club_id = p_club_id
    and rp.id is distinct from p_exclude_race_preparation_id
    and rp.race_id <> p_race_id
    and (
      coalesce(rp.status, '') in ('submitted', 'locked', 'sent_to_engine')
      or coalesce(rp.startlist_status, '') in ('submitted', 'locked', 'sent_to_engine')
    )
    and r.start_date::date <= tr.end_date
    and coalesce(r.end_date::date, r.start_date::date) >= tr.start_date
)
select
  'rider'::text,
  rpr.rider_id,
  null::text,
  null::text,
  op.race_preparation_id,
  op.race_id,
  op.race_name,
  op.start_date,
  op.end_date
from overlapping_preps op
join public.race_preparation_riders rpr
  on rpr.race_preparation_id = op.race_preparation_id

union all

select
  'staff'::text,
  rps.staff_id,
  null::text,
  null::text,
  op.race_preparation_id,
  op.race_id,
  op.race_name,
  op.start_date,
  op.end_date
from overlapping_preps op
join public.race_preparation_staff rps
  on rps.race_preparation_id = op.race_preparation_id

union all

select
  'asset'::text,
  rpa.asset_id,
  rpa.asset_key,
  rpa.asset_slot_key,
  op.race_preparation_id,
  op.race_id,
  op.race_name,
  op.start_date,
  op.end_date
from overlapping_preps op
join public.race_preparation_assets rpa
  on rpa.race_preparation_id = op.race_preparation_id

union all

select
  'rider'::text,
  nd.rider_id,
  null::text,
  null::text,
  null::uuid,
  case
    when nd.duty_type='qualification' then h.race_id
    when nd.duty_type='final' then e.final_race_id
    else null::uuid
  end,
  nd.label,
  nd.duty_date,
  nd.duty_date
from public.national_championship_duties nd
join public.national_championship_editions e on e.id=nd.edition_id
left join public.national_championship_heats h on h.id=nd.heat_id
cross join target_race tr
where nd.status='confirmed'
  and nd.duty_date between tr.start_date and tr.end_date
  and coalesce(
        case
          when nd.duty_type='qualification' then h.race_id
          when nd.duty_type='final' then e.final_race_id
        end,
        '00000000-0000-0000-0000-000000000000'::uuid
      ) is distinct from p_race_id;
$$;

revoke execute on function public.national_championship_sync_race_participants_v1(uuid,text,uuid)
  from public,anon,authenticated;
revoke execute on function public.national_championship_ensure_event_race_v1(uuid,text,uuid)
  from public,anon,authenticated;
revoke execute on function public.national_championship_ensure_races_v1(uuid)
  from public,anon,authenticated;

grant execute on function public.national_championship_sync_race_participants_v1(uuid,text,uuid)
  to service_role;
grant execute on function public.national_championship_ensure_event_race_v1(uuid,text,uuid)
  to service_role;
grant execute on function public.national_championship_ensure_races_v1(uuid)
  to service_role;
